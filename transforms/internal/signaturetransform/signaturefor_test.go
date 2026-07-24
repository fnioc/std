package signaturetransform

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// buildSignatureForWorkspace stands up a workspace exporting the type-argument
// minting primitives `signaturefor<T>()` / `signaturesfor<T>()` plus a manifest
// receiver whose `withSignature(...slots)` / `withSignatures(...signatures)` verbs
// take the spread-in slots — the exact shape the `.withSignature<T>()` /
// `.withSignatures<T>()` sugar bodies lower to. main.ts spreads a minted call into
// each verb so the stage's spread-flatten path is exercised source-written.
func buildSignatureForWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	prims := filepath.Join(root, "packages", "prims")
	write(t, filepath.Join(prims, "package.json"), `{
  "name": "@scope/prims",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	write(t, filepath.Join(prims, "src", "index.ts"), `export declare function signaturefor<T extends readonly any[]>(): readonly unknown[];
export declare function signaturesfor<T extends ReadonlyArray<readonly any[]>>(): unknown[];
export interface IManifest {
  withSignature(...slots: readonly unknown[]): IManifest;
  withSignatures(...signatures: ReadonlyArray<readonly unknown[]>): IManifest;
}
export declare const manifest: IManifest;
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/prims": "workspace:*" }
}`)
	linkPackage(t, app, "@scope/prims", prims)
	write(t, filepath.Join(app, "main.ts"), mainSrc)
	write(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "node_modules/@scope/prims/src/index.ts"]
}`)

	prog, diags, err := driver.LoadProgram(app, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatalf("LoadProgram: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("config diagnostics: %v", diags)
	}
	return prog, app
}

// TestSignatureForLowersAndFlattens is the source-written parity for the
// type-argument minting siblings: a `signaturefor<[IA, IB]>()` spread into
// `withSignature(...)` mints ONE overload's slots and flattens to
// `withSignature("<A>", "<B>")` — byte-identical to the hand-written append — and a
// `signaturesfor<[[IA], [IA, IB]]>()` spread into `withSignatures(...)` mints the
// whole set and flattens to `withSignatures(["<A>"], ["<A>", "<B>"])`. No primitive
// call, spread, or wrapping single-level array survives.
func TestSignatureForLowersAndFlattens(t *testing.T) {
	mainSrc := `import { manifest, signaturefor, signaturesfor } from '@scope/prims';
interface IA {}
interface IB {}
manifest.withSignature(...signaturefor<[IA, IB]>());
manifest.withSignatures(...signaturesfor<[[IA], [IA, IB]]>());
`
	prog, app := buildSignatureForWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerMain(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}

	// No authoring surface survives: no primitive call, no spread, and the import
	// is elided.
	for _, banned := range []string{"signaturefor", "signaturesfor", "..."} {
		if strings.Contains(out, banned) {
			t.Fatalf("authoring surface %q survived lowering:\n%s", banned, out)
		}
	}

	// signaturefor: the two element tokens flattened directly into withSignature —
	// each a bare string arg, NOT wrapped in a single-level array.
	if !strings.Contains(out, `.withSignature("`) {
		t.Fatalf("signaturefor did not flatten its slots into withSignature:\n%s", out)
	}
	if strings.Contains(out, `.withSignature([`) {
		t.Fatalf("signaturefor left its slots wrapped in an array (should flatten):\n%s", out)
	}
	// signaturesfor: each overload is its own inner array spread into withSignatures.
	if !strings.Contains(out, `.withSignatures([`) {
		t.Fatalf("signaturesfor did not flatten its per-overload arrays into withSignatures:\n%s", out)
	}
	if !strings.Contains(out, "IA") || !strings.Contains(out, "IB") {
		t.Fatalf("expected the IA / IB dependency tokens in the output:\n%s", out)
	}
}

// TestSignatureForNonTupleLeftInPlace covers the misuse guard: a non-tuple type
// argument yields no slots, so the call is left in place (the emit sweep flags it).
func TestSignatureForNonTupleLeftInPlace(t *testing.T) {
	mainSrc := `import { manifest, signaturefor } from '@scope/prims';
interface IA {}
manifest.withSignature(...signaturefor<IA>());
`
	prog, app := buildSignatureForWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, _ := lowerMain(t, prog, app)
	if !strings.Contains(out, "signaturefor") {
		t.Fatalf("a non-tuple signaturefor should be left in place for the sweep, got:\n%s", out)
	}
}
