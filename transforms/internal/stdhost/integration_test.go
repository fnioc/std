package stdhost

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// This file is the in-process integration tier for the ttsc transform host — the
// missing rung between the per-stage Go unit tests (which drive one transform
// over a hand-built program) and the external tests/*.ttsc.e2e suites (which
// shell out to a real ttsc + node and pay a multi-minute cold sidecar compile).
// Here Run drives the WHOLE host pipeline in one process against a real fixture:
// manifest parse -> CollectProject dependency scan -> stage selection ->
// driver.LoadProgram -> the per-file transform loop -> the JSON envelope. No ttsc,
// no node, no network.
//
// The fixtures compile only LOCAL source — a tokenfor<T>() over a local interface,
// imported from a local ./tokenfor stub — so driver.LoadProgram resolves nothing
// off disk and the tier needs no built dist. That is the deliberate scope line:
// the semantic di/isService lowerings require di.core to actually RESOLVE (their
// e2e symlinks and builds it), which couples a lowering to a JS build a Go test
// should not carry; those stay covered by tests/inline.ttsc.e2e. What this tier
// pins is the host wiring the unit tests cannot reach on their own — real program
// loading and the envelope — across BOTH selection channels: the --plugins-json
// manifest (what ttsc fills from a tsconfig `plugins` list) and the transitive
// dependency scan (§100 declare-by-depending, an empty manifest).

// decodedEnvelope mirrors host.go's projectEnvelope for reading back the JSON the
// host encodes to stdout.
type decodedEnvelope struct {
	Diagnostics []struct {
		File        *string `json:"file"`
		Category    string  `json:"category"`
		Code        string  `json:"code"`
		MessageText string  `json:"messageText"`
	} `json:"diagnostics"`
	TypeScript map[string]string `json:"typescript"`
}

// fixtureTsconfig is a minimal Bundler-resolution project config. noEmitOnError
// is off and skipLibCheck on so a self-contained fixture loads cleanly; the host
// runs source-to-source (ForceEmit) and returns the envelope on stdout rather
// than writing an outDir, so none is set.
const fixtureTsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "rootDir": "src",
    "skipLibCheck": true,
    "noEmitOnError": false
  },
  "include": ["src/**/*"]
}
`

// nameofAppSrc is the shared fixture source: a lone tokenfor<T>() over a local
// interface, imported from a local ./tokenfor stub. isNameofCall matches any call
// whose callee symbol is named `tokenfor`, so the local stub is enough; when the
// tokenfor stage is active the call lowers to the package-qualified token and the
// now-dead import elides.
var nameofAppSrc = map[string]string{
	"src/tokenfor.ts": "export declare function tokenfor<T>(): string;\n",
	"src/app.ts": `import { tokenfor } from "./tokenfor";

export interface IWidget {}

export const widgetToken = tokenfor<IWidget>();
`,
}

// writeFixtureFile writes body to dir/rel (rel is forward-slashed), creating any
// parent directories.
func writeFixtureFile(t *testing.T, dir, rel, body string) {
	t.Helper()
	full := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(full), err)
	}
	if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
		t.Fatalf("write %s: %v", full, err)
	}
}

// writeFixture materializes a fixture in dir: package.json (so CollectProject
// finds a root), the Bundler tsconfig, and the given src files.
func writeFixture(t *testing.T, dir, pkgJSON string, srcFiles map[string]string) {
	t.Helper()
	writeFixtureFile(t, dir, "package.json", pkgJSON)
	writeFixtureFile(t, dir, "tsconfig.json", fixtureTsconfig)
	for rel, body := range srcFiles {
		writeFixtureFile(t, dir, rel, body)
	}
}

// driveHost runs stdhost.Run over an already-materialized fixture dir with the
// given plugin manifest and returns the decoded envelope, captured stderr, and
// the exit code. The linked-plugins env is forced empty so the run does not
// inherit an ambient TTSC_LINKED_PLUGINS_JSON from the host machine.
func driveHost(t *testing.T, dir, manifest string) (decodedEnvelope, string, int) {
	t.Helper()
	t.Setenv(driver.LinkedPluginsEnv, "")

	var outBuf, errBuf bytes.Buffer
	restore := swapStreams(&outBuf, &errBuf)
	defer restore()

	code := Run(testHost(), []string{
		"--cwd=" + dir,
		"--tsconfig=" + filepath.Join(dir, "tsconfig.json"),
		"--plugins-json", manifest,
	})

	var env decodedEnvelope
	if outBuf.Len() > 0 {
		if err := json.Unmarshal(outBuf.Bytes(), &env); err != nil {
			t.Fatalf("decode envelope: %v\nstdout: %q\nstderr: %s", err, outBuf.String(), errBuf.String())
		}
	}
	return env, errBuf.String(), code
}

// selfFixturePkg is a dependency-free consumer manifest. CollectProject finds it
// as the root, resolves no dependencies, and returns an empty scan — so stage
// selection comes entirely from the --plugins-json manifest, exactly as when
// ttsc spawns the host with the stages a tsconfig `plugins` list named.
const selfFixturePkg = `{"name":"@rhombus-std/a2-fixture","version":"0.0.0","private":true}`

// loweredApp pulls the emitted src/app.ts out of the envelope, failing loudly
// (with the available keys) when it is absent.
func loweredApp(t *testing.T, env decodedEnvelope) string {
	t.Helper()
	lowered, ok := env.TypeScript["src/app.ts"]
	if !ok {
		keys := make([]string, 0, len(env.TypeScript))
		for k := range env.TypeScript {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		t.Fatalf("envelope has no src/app.ts entry; keys=%v", keys)
	}
	return lowered
}

// assertNameofLowered checks the emitted app carries a derived IWidget token and
// no surviving `tokenfor` (neither the call nor its now-dead import). The token
// tail is asserted rather than the whole string so the check does not pin the
// package name or path derivation, only that a token for IWidget was minted.
func assertNameofLowered(t *testing.T, lowered string) {
	t.Helper()
	if !strings.Contains(lowered, `:IWidget"`) {
		t.Fatalf("expected a derived token ending in :IWidget\", got:\n%s", lowered)
	}
	if strings.Contains(lowered, "tokenfor") {
		t.Fatalf("tokenfor survived lowering (call or import not elided):\n%s", lowered)
	}
}

// TestRunLowersSourceNameofFromManifestInProcess drives the full host over a
// self-contained fixture, selecting the tokenfor stage through the --plugins-json
// manifest. It proves the load-bearing path end-to-end in one process: a real
// driver.LoadProgram over a real (if tiny) project, the manifest-named stage run
// over every source file, and the lowered result read back off the envelope.
func TestRunLowersSourceNameofFromManifestInProcess(t *testing.T) {
	dir := t.TempDir()
	writeFixture(t, dir, selfFixturePkg, nameofAppSrc)

	env, stderr, code := driveHost(t, dir, `[{"name":"rhombusstd_nameof"}]`)
	if code != 0 {
		t.Fatalf("host exit = %d, want 0\nstderr: %s", code, stderr)
	}
	assertNameofLowered(t, loweredApp(t, env))
}

// TestRunSelectsNameofStageFromDependencyScanInProcess pins the OTHER selection
// channel: with an EMPTY manifest, the tokenfor stage must be activated purely by
// the host's transitive dependency scan (§100 declare-by-depending). The consumer
// devDeps di.transformer (whose ttsc.stages names `valueof`, and whose own
// primitives.transformer dependency carries the tokenfor/nameof stage);
// CollectProject walks those real @rhombus-std packages — read as package.json
// only, no build — unions their stages, and the host lowers tokenfor<IWidget>()
// with no plugin manifest at all. The @rhombus-std packages are symlinked into the fixture's
// node_modules (mirroring the declare-by-depending e2e) purely so the scan's walk
// resolves them; the compiled program still imports only the local ./tokenfor.
func TestRunSelectsNameofStageFromDependencyScanInProcess(t *testing.T) {
	dir := t.TempDir()
	scoped := filepath.Join(dir, "node_modules", "@rhombus-std")
	if err := os.MkdirAll(scoped, 0o755); err != nil {
		t.Fatalf("mkdir node_modules: %v", err)
	}
	// di.transformer carries `di`; its primitives.transformer dep carries the
	// tokenfor stage; di.core + primitives complete the transitive walk's edges.
	for _, name := range []string{"di.transformer", "di.core", "primitives", "primitives.transformer"} {
		target := repoLibDir(t, name)
		if err := os.Symlink(target, filepath.Join(scoped, name)); err != nil {
			t.Fatalf("symlink %s: %v", name, err)
		}
	}

	pkgJSON := `{"name":"@rhombus-std/a2-fixture","version":"0.0.0","private":true,` +
		`"devDependencies":{"@rhombus-std/di.transformer":"*"}}`
	writeFixture(t, dir, pkgJSON, nameofAppSrc)

	env, stderr, code := driveHost(t, dir, `[]`)
	if code != 0 {
		t.Fatalf("host exit = %d, want 0 (scan should have selected the tokenfor stage)\nstderr: %s", code, stderr)
	}
	assertNameofLowered(t, loweredApp(t, env))
}

// repoLibDir resolves libraries/<name> from this test's own source location, so
// the fixture symlinks point at the real packages regardless of the process cwd.
func repoLibDir(t *testing.T, name string) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// thisFile = <repo>/transforms/internal/stdhost/integration_test.go
	repo := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(thisFile))))
	dir := filepath.Join(repo, "libraries", name)
	if _, err := os.Stat(filepath.Join(dir, "package.json")); err != nil {
		t.Fatalf("expected library %s at %s: %v", name, dir, err)
	}
	return dir
}
