package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
)

// buildInlinePresetWorkspace lays out the di.core inline PRESET workspace: a core
// package literally named `@rhombus-std/di.core` carrying the `rhombus.inline`
// `add` entry and the real ServiceManifestInline body
// (`add<T>(ctor) => this.add(nameof<T>(), ctor, signatureof(ctor))`), so the SAME
// open-template registration can be lowered two ways — through the INLINE pipeline
// (inline -> nameof -> signatureof) and through the di DIRECT stage. It is the
// fixture the open-template inline-vs-direct parity test drives.
func buildInlinePresetWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "di.core")
	writeFile(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [ { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestInline", "member": "add" } ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  add(token: string, ctor: unknown, sig?: unknown): unknown;
}
export declare const services: IServiceManifestBase;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const ARG: unique symbol;
export type Typeof<T> = { readonly [ARG]?: T };
`)
	// The real add-sugar body, authored over the two compile-time primitives, each
	// imported from its home module (nameof from primitives, signatureof from
	// di.transformer).
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import { signatureof } from '@rhombus-std/di.transformer';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  add<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.add(nameof<T>(), ctor, signatureof(ctor));
  },
};
`)

	app := filepath.Join(root, "packages", "app")
	writeFile(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@rhombus-std/di.core": "workspace:*" }
}`)
	linkPkg(t, app, "@rhombus-std/di.core", core)

	// The sugar overload arrives through the standard consumer declare-module
	// augmentation, so `services.add<I<$1>>(C<$1>)` anchors on the di.core member.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    add<T>(ctor: unknown): unknown;
  }
}
export {};
`)
	writeFile(t, filepath.Join(app, "main.ts"), mainSrc)
	writeFile(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "sugar.d.ts", "node_modules/@rhombus-std/di.core/src/index.ts"]
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

// lowerInlinePipeline runs the full inline PRESET pipeline over main.ts — inline
// substitution, then nameof token lowering, then signatureof dependency-array
// lowering, sharing one artifacts bag exactly as the owner host composes them —
// and returns the reprinted output.
func lowerInlinePipeline(t *testing.T, prog *driver.Program, app string) string {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	artifacts := inlinetransform.NewArtifacts()
	inlineT := inlinetransform.Build(prog, app, artifacts, func(plugin.Diagnostic) {})
	nameofT := New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	sigT := signaturetransform.New(prog, ctx, artifacts, func(ditransform.Diagnostic) {})
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the add preset entry did not resolve")
	}
	ec := shimprinter.NewEmitContext()
	sf := mainSF(t, prog)
	return reprint(ec, sigT(ec, nameofT(ec, inlineT(ec, sf))))
}

// depArrayFrom returns the `[[...]]` dependency-signature array literal of the sole
// lowered `services.add(...)` call — the balanced substring from the first `[[`.
func depArrayFrom(t *testing.T, out string) string {
	t.Helper()
	start := strings.Index(out, "[[")
	if start < 0 {
		t.Fatalf("no `[[...]]` dependency array in:\n%s", out)
	}
	depth := 0
	for i := start; i < len(out); i++ {
		switch out[i] {
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				return out[start : i+1]
			}
		}
	}
	t.Fatalf("unterminated dependency array at %d in:\n%s", start, out)
	return ""
}

// TestOpenTemplateInlinePipelineMatchesDiDirect is the open-template inline-vs-direct
// fixture #241 deferred: an open-generic template registration
// `add<IRepo<$<1>>>(SqlRepo<$<1>>)` lowered through the INLINE pipeline
// (inline -> nameof -> signatureof) must carry the same service token AND the same
// dependency-signature array as the di DIRECT stage's lowering of the identical
// registration. The nameof hole fix is what unblocks it (a non-hole-aware nameof
// derived `IRepo<@rhombus-std/di.core:$<1>>` for the service token and diverged).
//
// The value-EXPRESSION arg (arg1) is intentionally excluded from the compare: the
// di stage strips the instantiation type arguments (`SqlRepo<$<1>>` -> `SqlRepo`)
// while the inline path leaves them for the downstream TS->JS type-strip, so the
// two agree only after type-stripping. The load-bearing bytes are the service
// token (arg0) and the dependency array (arg2), which must match verbatim BEFORE
// stripping.
func TestOpenTemplateInlinePipelineMatchesDiDirect(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
import type { $ } from '@rhombus-std/di.core';
type _keepHole = $<1>;
interface IRepo<T> {}
interface IStore<T> {}
class SqlRepo<T> implements IRepo<$<1>> {
  constructor(store: IStore<T>) { void store; }
}
services.add<IRepo<$<1>>>(SqlRepo<$<1>>);
`
	prog, app := buildInlinePresetWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineTok := diServiceToken(t, inlineOut)
	diTok := diServiceToken(t, diOut)
	if inlineTok != diTok {
		t.Fatalf("service-token divergence:\n inline pipeline = %q\n di direct       = %q", inlineTok, diTok)
	}
	if !strings.Contains(inlineTok, "IRepo<$1>") {
		t.Fatalf("expected an open-generic service token, got %q", inlineTok)
	}

	inlineDeps := depArrayFrom(t, inlineOut)
	diDeps := depArrayFrom(t, diOut)
	if inlineDeps != diDeps {
		t.Fatalf("dependency-array divergence:\n inline pipeline = %s\n di direct       = %s", inlineDeps, diDeps)
	}
	if !strings.Contains(inlineDeps, "IStore<$1>") {
		t.Fatalf("expected the hole-carrying dependency IStore<$1>, got %s", inlineDeps)
	}
}
