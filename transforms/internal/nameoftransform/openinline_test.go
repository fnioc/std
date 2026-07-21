package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
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
  add(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): unknown;
}
export declare const services: IServiceManifestBase;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const ARG: unique symbol;
export type Typeof<T> = { readonly [ARG]?: T };
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
export declare function keyof<T>(): string | undefined;
`)
	// The real add-sugar body, authored over the three compile-time primitives, each
	// imported from its home module (nameof from primitives, signatureof + keyof from
	// di.transformer). keyof<T>() is the §98 keyed-registration key half, in the KEY
	// slot (argument 5) behind the `void 0` filling the scope slot; an UNKEYED
	// registration elides both in the inline stage (byte-parity with the plain form).
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import { signatureof, keyof } from '@rhombus-std/di.transformer';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  add<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.add(nameof<T>(), ctor, signatureof(ctor), void 0, keyof<T>());
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
	inlineBodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	inlineT := inlinetransform.Build(prog, inlineBodies, artifacts, func(plugin.Diagnostic) {})
	nameofT := New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	sigT := signaturetransform.New(prog, ctx, artifacts, func(ditransform.Diagnostic) {})
	keyofT := keyoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the add preset entry did not resolve")
	}
	ec := shimprinter.NewEmitContext()
	sf := mainSF(t, prog)
	return reprint(ec, keyofT(ec, sigT(ec, nameofT(ec, inlineT(ec, sf)))))
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

// TestKeyedInlinePipelineComposesBaseKey is the §98 keyed inline lowering
// end-to-end: `add<Keyed<ICache, "redis">>(RedisCache)` lowered through the full
// inline pipeline (inline -> nameof -> signatureof -> keyof) splits the keyed token
// across two arguments — nameof gives the BASE (arg0), keyof gives the KEY (arg5,
// behind the `void 0` scope slot) — which the runtime composes as `base#key`. The
// di DIRECT stage composes the whole `base#key` into arg0. This pins that the two
// halves reunite exactly: the inline base + `#` + the keyof key == the di token,
// and that the key lands in the KEY slot rather than the scope slot ahead of it.
func TestKeyedInlinePipelineComposesBaseKey(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
import type { Keyed } from '@rhombus-std/di.core';
interface ICache {}
class RedisCache implements ICache {}
services.add<Keyed<ICache, "redis">>(RedisCache);
`
	prog, app := buildInlinePresetWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineBase := diServiceToken(t, inlineOut) // arg0 of the inline call = the base
	diTok := diServiceToken(t, diOut)          // arg0 of the di call = the composed base#key

	if strings.Contains(inlineBase, "#") {
		t.Fatalf("inline nameof arg0 must be the bare base (no key): %q", inlineBase)
	}
	if !strings.HasSuffix(diTok, "#redis") {
		t.Fatalf("di direct token must carry the composed key: %q", diTok)
	}
	// The keyof half lowered to the "redis" key literal in the KEY slot — argument
	// 5, behind the scope placeholder. Asserting the placeholder too is what pins
	// the SLOT rather than merely "somewhere at the end": a key that regressed into
	// the scope slot would still end the call with `"redis")`.
	if !strings.Contains(inlineOut, `, void 0, "redis")`) {
		t.Fatalf("expected the keyof key %q in the add() KEY slot (behind the scope placeholder):\n%s", "redis", inlineOut)
	}
	// The two halves reunite onto the di direct token.
	if inlineBase+"#redis" != diTok {
		t.Fatalf("base + key must compose onto the di token: inline base %q + #redis != di %q", inlineBase, diTok)
	}
}

// TestKeyofLowersSourceWritten pins the keyof stage's standalone lowering — a
// source-written `keyof<T>()` (not routed through the inline sugar): a keyed T
// lowers to its key STRING LITERAL, an unkeyed T to `void 0` (undefined). This is
// the resolve-side / manual path, disjoint from the inline registration flow.
func TestKeyofLowersSourceWritten(t *testing.T) {
	src := `import { keyof } from '@rhombus-std/di.core';
import type { Keyed } from '@rhombus-std/di.core';
interface ICache {}
interface IPlain {}
export const k1 = keyof<Keyed<ICache, "redis">>();
export const k2 = keyof<IPlain>();
`
	prog, app := buildInlinePresetWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	ctx := plugin.NewContext(prog, app)
	keyofT := keyoftransform.New(prog, ctx, nil, func(plugin.Diagnostic) {})
	ec := shimprinter.NewEmitContext()
	out := reprint(ec, keyofT(ec, mainSF(t, prog)))

	if !strings.Contains(out, `const k1 = "redis"`) {
		t.Errorf("keyed keyof should lower to its key literal:\n%s", out)
	}
	if !strings.Contains(out, "const k2 = void 0") {
		t.Errorf("unkeyed keyof should lower to void 0:\n%s", out)
	}
	if strings.Contains(out, "keyof<") {
		t.Errorf("no keyof call should survive lowering:\n%s", out)
	}
}
