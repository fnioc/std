package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// buildSelfInlineWorkspace lays out the W3 self-registration workspace: a core
// package literally named `@rhombus-std/di.core` carrying BOTH the generic
// (`addClass<T>(ctor)`) and the no-type-arg self (`addClass(ctor)`) sugar entries
// with their real bodies, so the SAME no-type-arg registration
// `services.addClass(SqlUserRepo)` can be lowered two ways — through the INLINE
// pipeline (inline -> tokenfor value-arg -> signatureof) and through the di DIRECT
// stage's inferred lowering. It is the fixture the self-registration parity tests
// drive.
//
// The self sugar overloads are declared BEFORE the generic ones in the consumer
// declare-module block: a no-type-arg call is applicable to BOTH (the generic
// infers its type param from the value), and TypeScript binds the first applicable
// overload in declaration order — so self-first is what makes a no-type-arg call
// resolve to the non-generic self overload (whose value-arg body binds the token
// from the VALUE, per constraint 3) rather than the generic one (whose type
// parameter sits in a nested `Ctor<any[], I>` position RecoverTypeArguments cannot
// recover). An explicit `addClass<I>(C)` skips the non-generic self overload (type
// args are not applicable to it) and binds the generic one as before.
func buildSelfInlineWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "di.core")
	writeFile(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestSelfInline", "member": "addClass" },
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestSelfInline", "member": "addFactory" },
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestSelfInline", "member": "addValue" },
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestInline", "member": "addClass" }
    ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): unknown;
  addFactory(token: string, factory: unknown, sig: unknown, scope?: string, key?: string): unknown;
  addValue(token: string, value: unknown, key?: string): unknown;
}
export declare const services: IServiceManifestBase;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
export declare function keyof<T>(): string | undefined;
`)
	// The real sugar bodies, authored over the compile-time primitives (tokenfor /
	// tokenof from primitives, signatureof from di.transformer). The self bodies omit
	// the scope/key slots entirely and derive the token from the VALUE — addClass /
	// addFactory via the produced-type `tokenfor(value)`, addValue via the raw-type
	// `tokenof(value)` (an already-built value registers under its own type, matching
	// the di engine's raw-type addValue path); the generic body is present only so a
	// no-type-arg call has an alternative overload to (correctly) NOT bind to.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor, tokenof } from '@rhombus-std/primitives.extras';
import { signatureof, keyof } from '@rhombus-std/di.transformer';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  addClass<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>());
  },
};
export const ManifestSelfInline = {
  addClass(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.addClass(tokenfor(ctor), ctor, signatureof(ctor));
  },
  addFactory(this: IServiceManifestBase, factory: unknown): unknown {
    return this.addFactory(tokenfor(factory), factory, signatureof(factory));
  },
  addValue(this: IServiceManifestBase, value: unknown): unknown {
    return this.addValue(tokenof(value), value);
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

	// Self overloads FIRST, then the generic ones — the declaration order that
	// makes a no-type-arg call bind to the self (non-generic) overload.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass(ctor: unknown): unknown;
    addFactory(factory: unknown): unknown;
    addValue(value: unknown): unknown;
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

// diCallToken returns the (unescaped) arg[0] of the lowered `services.<verb>("…", …)`
// call for a given verb — the service token the di stage derived directly.
func diCallToken(t *testing.T, out, verb string) string {
	t.Helper()
	marker := "." + verb + "("
	i := strings.Index(out, marker)
	if i < 0 || i+len(marker) >= len(out) || out[i+len(marker)] != '"' {
		t.Fatalf("no lowered `.%s(\"…\")` call in:\n%s", verb, out)
	}
	return stringLiteralAt(t, out, i+len(marker))
}

// TestSelfInlineAddClassMatchesDiDirect is the load-bearing W3 parity proof for
// addClass: the no-type-arg self-registration `services.addClass(SqlUserRepo)`
// lowered through the INLINE pipeline (inline self body -> value-arg tokenfor ->
// signatureof) carries the SAME service token AND the same dependency-signature
// array as the di DIRECT stage's inferred lowering of the identical call. The token
// derives from the ctor's construct-signature return type (the instance it builds),
// the deps from its constructor parameters — both shared through
// tokens.ProducedTypeOf / the signatureof extractor, so parity holds by
// construction.
func TestSelfInlineAddClassMatchesDiDirect(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IDb {}
class SqlUserRepo {
  constructor(db: IDb) { void db; }
}
services.addClass(SqlUserRepo);
`
	prog, app := buildSelfInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineTok := diCallToken(t, inlineOut, "addClass")
	diTok := diCallToken(t, diOut, "addClass")
	if inlineTok != diTok {
		t.Fatalf("addClass service-token divergence:\n inline = %q\n di     = %q", inlineTok, diTok)
	}
	if !strings.HasSuffix(inlineTok, ":SqlUserRepo") {
		t.Fatalf("expected the ctor's instance token (…:SqlUserRepo), got %q", inlineTok)
	}
	inlineDeps := depArrayFrom(t, inlineOut)
	diDeps := depArrayFrom(t, diOut)
	if inlineDeps != diDeps {
		t.Fatalf("addClass dependency-array divergence:\n inline = %s\n di     = %s", inlineDeps, diDeps)
	}
	if !strings.Contains(inlineDeps, "IDb") {
		t.Fatalf("expected the ctor dependency IDb in the array, got %s", inlineDeps)
	}
}

// TestSelfInlineAddFactoryMatchesDiDirect is the W3 parity proof for addFactory:
// `services.addFactory(makeThing)` lowered through the inline self body's
// value-arg tokenfor + signatureof matches the di direct stage's inferred lowering.
// The token derives from the factory's CALL-signature return type; the deps from
// its call parameters.
func TestSelfInlineAddFactoryMatchesDiDirect(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IDb {}
interface Thing {}
declare function makeThing(db: IDb): Thing;
services.addFactory(makeThing);
`
	prog, app := buildSelfInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineTok := diCallToken(t, inlineOut, "addFactory")
	diTok := diCallToken(t, diOut, "addFactory")
	if inlineTok != diTok {
		t.Fatalf("addFactory service-token divergence:\n inline = %q\n di     = %q", inlineTok, diTok)
	}
	if !strings.HasSuffix(inlineTok, ":Thing") {
		t.Fatalf("expected the factory's return-type token (…:Thing), got %q", inlineTok)
	}
	inlineDeps := depArrayFrom(t, inlineOut)
	diDeps := depArrayFrom(t, diOut)
	if inlineDeps != diDeps {
		t.Fatalf("addFactory dependency-array divergence:\n inline = %s\n di     = %s", inlineDeps, diDeps)
	}
}

// TestSelfInlineAddValueMatchesDiDirect is the W3 parity proof for addValue:
// `services.addValue(cfg)` lowered through the inline self body's value-arg
// tokenof matches the di direct stage's inferred lowering. A value carries no
// deps, so the lowered call is the bare `addValue("token", value)`; the token
// derives from the value's OWN type (tokenof never unwraps), matching the di
// stage's addValue raw-type path. For a plain (non-callable) value this is
// indistinguishable from tokenfor, but see TestSelfInlineAddValueFn /
// TestSelfInlineAddValueClassRef for the callable/constructable cases where the
// two diverge and only tokenof holds parity.
func TestSelfInlineAddValueMatchesDiDirect(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface AppConfig { host: string }
declare const cfg: AppConfig;
services.addValue(cfg);
`
	prog, app := buildSelfInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineTok := diCallToken(t, inlineOut, "addValue")
	diTok := diCallToken(t, diOut, "addValue")
	if inlineTok != diTok {
		t.Fatalf("addValue service-token divergence:\n inline = %q\n di     = %q", inlineTok, diTok)
	}
	if !strings.HasSuffix(inlineTok, ":AppConfig") {
		t.Fatalf("expected the value's own type token (…:AppConfig), got %q", inlineTok)
	}
	// No deps: the inline pipeline must not synthesize a `[[...]]` array for addValue.
	if strings.Contains(inlineOut, "[[") {
		t.Fatalf("addValue must carry no dependency array, got:\n%s", inlineOut)
	}
}

// TestSelfInlineAddValueFn is the FINDING-1 divergence proof: a CALLABLE value
// registered via `services.addValue(makeThing)` must tokenize as the function's
// OWN type (`…:makeThing`), NOT its call-signature return type (`…:Thing`). This is
// the case where the produced-type `tokenfor` and the raw-type `tokenof` diverge —
// di.core's inferred `addValue` lowering keeps the raw type, so the inline self
// body MUST use `tokenof` to stay byte-identical. Were the body still on
// `tokenfor`, inline would derive `…:Thing` and di-direct `…:makeThing`, breaking
// parity; this test fails on that regression and passes only with tokenof.
func TestSelfInlineAddValueFn(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IDb {}
interface Thing {}
declare function makeThing(db: IDb): Thing;
services.addValue(makeThing);
`
	prog, app := buildSelfInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineTok := diCallToken(t, inlineOut, "addValue")
	diTok := diCallToken(t, diOut, "addValue")
	if inlineTok != diTok {
		t.Fatalf("addValue(fn) service-token divergence:\n inline = %q\n di     = %q", inlineTok, diTok)
	}
	if !strings.HasSuffix(inlineTok, ":makeThing") {
		t.Fatalf("addValue(fn) must tokenize as the function's OWN type (…:makeThing), not its return type; got %q", inlineTok)
	}
	if strings.HasSuffix(inlineTok, ":Thing") {
		t.Fatalf("addValue(fn) unwrapped to the call-signature return type (…:Thing) — the raw-type tokenof was not used: %q", inlineTok)
	}
	if strings.Contains(inlineOut, "[[") {
		t.Fatalf("addValue must carry no dependency array, got:\n%s", inlineOut)
	}
}

// TestSelfInlineAddValueClassRef is the FINDING-1 companion for a CONSTRUCTABLE
// value registered via `services.addValue(SqlUserRepo)`. Here tokenfor (produced —
// construct-sig return, the instance) and tokenof (raw — the constructor's static
// type) happen to derive the IDENTICAL token, because a class's static type
// carries the class symbol, so `typeof C` and `C` tokenize the same (`…:SqlUserRepo`).
// The case is pinned so a future change to either derivation cannot silently break
// the class-reference addValue path, and to prove tokenof matches di-direct here too.
func TestSelfInlineAddValueClassRef(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
class SqlUserRepo {}
services.addValue(SqlUserRepo);
`
	prog, app := buildSelfInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineTok := diCallToken(t, inlineOut, "addValue")
	diTok := diCallToken(t, diOut, "addValue")
	if inlineTok != diTok {
		t.Fatalf("addValue(classRef) service-token divergence:\n inline = %q\n di     = %q", inlineTok, diTok)
	}
	if !strings.HasSuffix(inlineTok, ":SqlUserRepo") {
		t.Fatalf("addValue(classRef) must tokenize as the class token (…:SqlUserRepo), got %q", inlineTok)
	}
	if strings.Contains(inlineOut, "[[") {
		t.Fatalf("addValue must carry no dependency array, got:\n%s", inlineOut)
	}
}

// TestSelfInlineNoTypeArgBindsSelfOverload is the discrimination proof: with BOTH
// the self (`addClass(ctor)`) and the generic (`addClass<T>(ctor)`) overloads in
// the program, a no-type-arg `services.addClass(SqlUserRepo)` binds to the self
// overload — its value-arg body lowers cleanly. Were it to bind the generic
// overload instead, RecoverTypeArguments could not recover the nested `I` in
// `Ctor<any[], I>` and the build would fail with INLINE_INFERRED_TYPE_ARGUMENT; a
// clean lowering that byte-matches the di-direct oracle is the positive proof that
// self-first ordering routes the call to the self overload.
func TestSelfInlineNoTypeArgBindsSelfOverload(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IDb {}
class SqlUserRepo {
  constructor(db: IDb) { void db; }
}
services.addClass(SqlUserRepo);
`
	prog, app := buildSelfInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerInlinePipeline(t, prog, app)
	// A clean self binding fully lowers the call to a token'd form. Had the call
	// bound the generic overload, RecoverTypeArguments would have failed on the
	// nested `I`, the inline stage would have refused the substitution, and the
	// raw `addClass(SqlUserRepo)` would survive un-lowered here.
	if !strings.Contains(inlineOut, `.addClass("`) {
		t.Fatalf("self overload did not lower to a token'd addClass call:\n%s", inlineOut)
	}
	if strings.Contains(inlineOut, "addClass(SqlUserRepo)") {
		t.Fatalf("a raw un-lowered addClass(SqlUserRepo) survived — the no-type-arg call did not bind the self overload:\n%s", inlineOut)
	}
}
