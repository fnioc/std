package nameoftransform

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
)

// buildInlinePresetWorkspace lays out the di.core inline PRESET workspace: a core
// package literally named `@rhombus-std/di.core` carrying the `rhombus.inline`
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
  "rhombus.inline": {
    "entries": [ { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestInline", "member": "addClass" } ]
  }
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
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
export declare function keyof<T>(): string | undefined;
`)
	// The real add-sugar body, authored over the three compile-time primitives, each
	// imported from its home module (tokenfor from primitives, signatureof + keyof from
	// di.transformer). keyof<T>() is the §98 keyed-registration key half, in the KEY
	// slot (argument 5) behind the `void 0` filling the scope slot; an UNKEYED
	// registration elides both in the inline stage (byte-parity with the plain form).
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives.extras';
import { signatureof, keyof } from '@rhombus-std/di.transformer';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  addClass<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>());
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
	// augmentation, so `services.addClass<I<$1>>(C<$1>)` anchors on the di.core member.
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
	keyofT := keyoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the add preset entry did not resolve")
	}
	ec := shimprinter.NewEmitContext()
	sf := mainSF(t, prog)
	return reprint(ec, keyofT(ec, sigT(ec, nameofT(ec, inlineT(ec, sf)))))
}

// depArrayFrom returns the `[[...]]` dependency-signature array literal of the sole
// lowered `services.addClass(...)` call — the balanced substring from the first `[[`.
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

	inlineDeps := depArrayFrom(t, inlineOut)
	diDeps := depArrayFrom(t, diOut)
	if inlineDeps != diDeps {
		t.Fatalf("dependency-array divergence:\n inline pipeline = %s\n di direct       = %s", inlineDeps, diDeps)
	}
	if !strings.Contains(inlineDeps, "IStore<$1>") {
		t.Fatalf("expected the hole-carrying dependency IStore<$1>, got %s", inlineDeps)
	}

	// Value-arg (arg1) parity: the whole addClass call now matches, since
	// normalizeInstantiationArgs strips the substituted `SqlRepo<$<1>>` to the bare
	// `SqlRepo` like di-direct (isolated in TestOpenTemplateInstantiationValueStripped).
	if inlineCall, diCall := addClassCallText(t, inlineOut), addClassCallText(t, diOut); inlineCall != diCall {
		t.Fatalf("addClass call divergence:\n inline = %s\n di     = %s", inlineCall, diCall)
	}
}

// TestOpenTemplateInstantiationValueStripped isolates W6p2 item 2: the inline
// registration body splices a user-authored open-template instantiation expression
// (`SqlRepo<$<1>>`) verbatim into the value slot, and normalizeInstantiationArgs
// strips its type arguments to the bare constructor `SqlRepo` — an instantiation
// expression carries no runtime value in its type arguments, so di-direct registers
// the bare `arg.AsExpressionWithTypeArguments().Expression` and the inline path must
// match at the TS level, not only after a downstream TS->JS type-strip. The whole
// `addClass(...)` call is compared BEFORE type-stripping.
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
	if inlineCall != diCall {
		t.Fatalf("addClass call divergence (value arg not stripped byte-identically):\n inline = %s\n di     = %s", inlineCall, diCall)
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

// TestKeyedInlinePipelineComposesBaseKey is the §98 keyed inline lowering
// end-to-end: `addClass<Keyed<ICache, "redis">>(RedisCache)` lowered through the full
// inline pipeline (inline -> tokenfor -> signatureof -> keyof) splits the keyed token
// across two arguments — tokenfor gives the BASE (arg0), keyof gives the KEY (arg5,
// behind the `void 0` scope slot) — which the runtime composes as `base#key`. The
// di DIRECT stage composes the whole `base#key` into arg0. This pins that the two
// halves reunite exactly: the inline base + `#` + the keyof key == the di token,
// and that the key lands in the KEY slot rather than the scope slot ahead of it.
func TestKeyedInlinePipelineComposesBaseKey(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
import type { Keyed } from '@rhombus-std/di.core';
interface ICache {}
class RedisCache implements ICache {}
services.addClass<Keyed<ICache, "redis">>(RedisCache);
`
	prog, app := buildInlinePresetWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineBase := diServiceToken(t, inlineOut) // arg0 of the inline call = the base
	diTok := diServiceToken(t, diOut)          // arg0 of the di call = the composed base#key

	if strings.Contains(inlineBase, "#") {
		t.Fatalf("inline tokenfor arg0 must be the bare base (no key): %q", inlineBase)
	}
	if !strings.HasSuffix(diTok, "#redis") {
		t.Fatalf("di direct token must carry the composed key: %q", diTok)
	}
	// The keyof half lowered to the "redis" key literal in the KEY slot — argument
	// 5, behind the scope placeholder. Asserting the placeholder too is what pins
	// the SLOT rather than merely "somewhere at the end": a key that regressed into
	// the scope slot would still end the call with `"redis")`.
	if !strings.Contains(inlineOut, `, void 0, "redis")`) {
		t.Fatalf("expected the keyof key %q in the addClass() KEY slot (behind the scope placeholder):\n%s", "redis", inlineOut)
	}
	// The two halves reunite onto the di direct token.
	if inlineBase+"#redis" != diTok {
		t.Fatalf("base + key must compose onto the di token: inline base %q + #redis != di %q", inlineBase, diTok)
	}
}

// TestKeyedTokenforComposesSingleToken pins the keyedtokenfor primitive's
// standalone lowering (§98, W6p2 item 4) — the COMPOSED keyed-lookup token the
// key-less query/async verbs (`isService`, `resolveAsync`) need. A keyed T lowers
// to the SINGLE `base#key` string di.core registers a keyed service under, and an
// unkeyed T lowers to the plain base token — byte-identical to `tokenfor<T>()`,
// which is what keeps unkeyed lowering unchanged. Unlike the split base + `keyof`
// pair the registration/resolve verbs pass, this composes the whole token up front.
func TestKeyedTokenforComposesSingleToken(t *testing.T) {
	src := `import type { Keyed } from '@rhombus-std/di.core';
declare function keyedtokenfor<T>(): string;
declare function tokenfor<T>(): string;
interface ICache {}
export const keyed = keyedtokenfor<Keyed<ICache, "redis">>();
export const plain = keyedtokenfor<ICache>();
export const base = tokenfor<ICache>();
`
	prog, app := buildInlinePresetWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	ctx := plugin.NewContext(prog, app)
	nameofT := New(prog, ctx, nil, func(plugin.Diagnostic) {})
	ec := shimprinter.NewEmitContext()
	out := reprint(ec, nameofT(ec, mainSF(t, prog)))

	if strings.Contains(out, "= keyedtokenfor") {
		t.Fatalf("no keyedtokenfor call should survive lowering:\n%s", out)
	}
	litFor := func(name string) string {
		re := regexp.MustCompile(name + ` = "([^"]*)"`)
		m := re.FindStringSubmatch(out)
		if m == nil {
			t.Fatalf("no string-literal token for %q in:\n%s", name, out)
		}
		return m[1]
	}
	keyed, plain, base := litFor("keyed"), litFor("plain"), litFor("base")
	if !strings.HasSuffix(keyed, "#redis") {
		t.Fatalf("keyed keyedtokenfor must compose the single base#key token, got %q", keyed)
	}
	if strings.Contains(plain, "#") {
		t.Fatalf("unkeyed keyedtokenfor must be the bare base (no key), got %q", plain)
	}
	// The composed token is exactly the base with `#redis` appended…
	if keyed != plain+"#redis" {
		t.Fatalf("keyed token %q is not base %q + #redis", keyed, plain)
	}
	// …and the unkeyed base is byte-identical to tokenfor<ICache>() — so unkeyed
	// isService/resolveAsync output is unchanged from the pre-key form.
	if plain != base {
		t.Fatalf("unkeyed keyedtokenfor %q must equal tokenfor %q", plain, base)
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
