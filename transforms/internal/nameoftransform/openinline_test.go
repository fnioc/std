package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
)

// buildInlinePresetWorkspace lays out the di.core inline PRESET workspace: a core
// package literally named `@rhombus-std/di.core` carrying the `rhombus-std` inline
// `addClass` entry and the real ServiceManifestInline body
// (`addClass<T>(ctor) => this.addClass(tokenfor<T>(), ctor, signatureof(ctor))`), so the SAME
// open-template registration can be lowered two ways — through the INLINE pipeline
// (inline -> tokenfor -> signatureof) and through the di DIRECT stage. It is the
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
  "rhombus-std": { "inline": { "entries": [ { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "@rhombus-std/di.core:ManifestInline", "member": "addClass" } ] } }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): unknown;
}
export declare const services: IServiceManifestBase;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const ARG: unique symbol;
export type Typeof<T> = { readonly [ARG]?: T };
`)
	// The real add-sugar body, authored over the two compile-time primitives, each
	// imported from its home module (tokenfor from primitives, signatureof from
	// di.extras).
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives.extras';
import { signatureof } from '@rhombus-std/di.extras';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  addClass<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor));
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
	// augmentation, so `services.addClass<I<$<1>>>(C<$<1>>)` anchors on the di.core member.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass<T>(ctor: unknown): unknown;
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
// substitution, then tokenfor token lowering, then signatureof dependency-array
// lowering, sharing one artifacts bag exactly as the owner host composes them —
// and returns the reprinted output.
func lowerInlinePipeline(t *testing.T, prog *driver.Program, app string) string {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	artifacts := inlinetransform.NewArtifacts()
	inlineBodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	inlineT := inlinetransform.Build(prog, inlineBodies, artifacts, func(plugin.Diagnostic) {})
	nameofT := New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	sigT := signaturetransform.New(prog, ctx, artifacts, func(signatures.Diagnostic) {})
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the add preset entry did not resolve")
	}
	ec := shimprinter.NewEmitContext()
	sf := mainSF(t, prog)
	return reprint(ec, sigT(ec, nameofT(ec, inlineT(ec, sf))))
}

// typeNodeArgFrom returns the `Type.ctor(...)` / `Type.func(...)` node text of
// the sole lowered `services.<verb>(...)` call — the balanced substring
// starting at the first `Type.ctor(` or `Type.func(`.
func typeNodeArgFrom(t *testing.T, out string) string {
	t.Helper()
	start := strings.Index(out, "Type.ctor(")
	if start < 0 {
		start = strings.Index(out, "Type.func(")
	}
	if start < 0 {
		t.Fatalf("no Type.ctor(...)/Type.func(...) node in:\n%s", out)
	}
	open := strings.Index(out[start:], "(") + start
	depth := 0
	for i := open; i < len(out); i++ {
		switch out[i] {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return out[start : i+1]
			}
		}
	}
	t.Fatalf("unterminated Type node at %d in:\n%s", start, out)
	return ""
}

// TestOpenTemplateInlinePipelineMatchesDiDirect is the open-template inline-vs-direct
// fixture #241 deferred: an open-generic template registration
// `addClass<IRepo<$<1>>>(SqlRepo<$<1>>)` lowered through the INLINE pipeline
// (inline -> tokenfor -> signatureof) must carry the same service token AND the same
// dependency-signature array as the di DIRECT stage's lowering of the identical
// registration. The tokenfor hole fix is what unblocks it (a non-hole-aware tokenfor
// derived `IRepo<@rhombus-std/di.core:$<1>>` for the service token and diverged).
//
// The value-EXPRESSION arg (arg1) is also compared: the di stage strips the
// instantiation type arguments (`SqlRepo<$<1>>` -> `SqlRepo`) via
// `arg.AsExpressionWithTypeArguments().Expression`, and the inline path's
// `normalizeInstantiationArgs` (W6p2 item 2) now strips them the SAME way at the
// TS level — a substituted `ThingRepo<$<1>>` value arg lowers to the bare
// `ThingRepo` before the downstream TS->JS type-strip, not after — so the inline
// and di value args agree byte-for-byte with no un-stripped instantiation
// surviving. TestOpenTemplateInstantiationValueStripped below isolates that.
func TestOpenTemplateInlinePipelineMatchesDiDirect(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
import type { $ } from '@rhombus-std/di.core';
type _keepHole = $<1>;
interface IRepo<T> {}
interface IStore<T> {}
class SqlRepo<T> implements IRepo<$<1>> {
  constructor(store: IStore<T>) { void store; }
}
services.addClass<IRepo<$<1>>>(SqlRepo<$<1>>);
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

	// The dependency node derives Type.ctor(instanceType, paramType) — the hole
	// closing into the instance type's own generic argument, and again into the
	// dependency's, matching §157's bare-hole-slot reading.
	wantDeps := `Type.ctor(Type.imported("SqlRepo", "@scope/app/main", [Type.generic("1")]), ` +
		`Type.imported("IStore", "@scope/app/main", [Type.generic("1")]))`
	if inlineDeps := typeNodeArgFrom(t, inlineOut); inlineDeps != wantDeps {
		t.Fatalf("dependency node mismatch:\n got  = %s\n want = %s", inlineDeps, wantDeps)
	}

	// Value-arg (arg1) parity: the token and the stripped value argument still
	// match di-direct byte-for-byte, since normalizeInstantiationArgs strips the
	// substituted `SqlRepo<$<1>>` to the bare `SqlRepo` like di-direct (isolated
	// in TestOpenTemplateInstantiationValueStripped) — only the third argument's
	// FORMAT diverges by design (a Type.ctor(...) node, not a `[[...]]` array).
	wantPrefix := `addClass("@scope/app/main:IRepo<$1>", SqlRepo, `
	if inlineCall := addClassCallText(t, inlineOut); !strings.HasPrefix(inlineCall, wantPrefix) {
		t.Fatalf("addClass call's token/value-arg prefix mismatch:\n got  = %s\n want prefix = %s", inlineCall, wantPrefix)
	}
	if diCall := addClassCallText(t, diOut); !strings.HasPrefix(diCall, wantPrefix) {
		t.Fatalf("di-direct addClass call's token/value-arg prefix mismatch:\n got  = %s\n want prefix = %s", diCall, wantPrefix)
	}
}

// TestOpenTemplateInstantiationValueStripped isolates W6p2 item 2: the inline
// registration body splices a user-authored open-template instantiation expression
// (`SqlRepo<$<1>>`) verbatim into the value slot, and normalizeInstantiationArgs
// strips its type arguments to the bare constructor `SqlRepo` — an instantiation
// expression carries no runtime value in its type arguments, so di-direct registers
// the bare `arg.AsExpressionWithTypeArguments().Expression` and the inline path must
// match at the TS level, not only after a downstream TS->JS type-strip. The token and
// the stripped value argument are compared BEFORE type-stripping; the third
// (dependency) argument is excluded — its FORMAT diverges by design between the two
// stages, covered instead by TestOpenTemplateInlinePipelineMatchesDiDirect.
func TestOpenTemplateInstantiationValueStripped(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
import type { $ } from '@rhombus-std/di.core';
type _keepHole = $<1>;
interface IRepo<T> {}
interface IStore<T> {}
class SqlRepo<T> implements IRepo<$<1>> {
  constructor(store: IStore<T>) { void store; }
}
services.addClass<IRepo<$<1>>>(SqlRepo<$<1>>);
`
	prog, app := buildInlinePresetWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineCall := addClassCallText(t, lowerInlinePipeline(t, prog, app))
	diCall := addClassCallText(t, lowerDi(t, prog, app))

	if strings.Contains(inlineCall, "SqlRepo<") {
		t.Fatalf("inline value arg kept its instantiation type args (not stripped):\n%s", inlineCall)
	}
	if !strings.Contains(inlineCall, "SqlRepo") {
		t.Fatalf("inline value arg lost the bare ctor:\n%s", inlineCall)
	}
	wantPrefix := `addClass("@scope/app/main:IRepo<$1>", SqlRepo, `
	if !strings.HasPrefix(inlineCall, wantPrefix) {
		t.Fatalf("inline addClass call's token/value-arg prefix mismatch:\n got  = %s\n want prefix = %s", inlineCall, wantPrefix)
	}
	if !strings.HasPrefix(diCall, wantPrefix) {
		t.Fatalf("di-direct addClass call's token/value-arg prefix mismatch:\n got  = %s\n want prefix = %s", diCall, wantPrefix)
	}
}

// addClassCallText returns the whole `addClass(...)` call substring — the balanced
// span from `addClass(` to its matching `)` — so the value arg can be compared
// alongside the token and dependency array.
func addClassCallText(t *testing.T, out string) string {
	t.Helper()
	marker := "addClass("
	start := strings.Index(out, marker)
	if start < 0 {
		t.Fatalf("no `addClass(` call in:\n%s", out)
	}
	open := start + len(marker) - 1
	depth := 0
	for i := open; i < len(out); i++ {
		switch out[i] {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return out[start : i+1]
			}
		}
	}
	t.Fatalf("unterminated addClass call at %d in:\n%s", start, out)
	return ""
}
