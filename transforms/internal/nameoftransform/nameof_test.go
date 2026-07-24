package nameoftransform

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

// buildNameofWorkspace lays out a workspace whose core package is literally named
// `@rhombus-std/di.core` — the module ditransform anchors its `addClass` verb on — so
// the SAME program can be lowered two ways: the tokenfor stage over an explicit
// `tokenfor<T>()`, and the di stage over a direct `addClass<T>(ctor)` registration. It
// exports `tokenfor` / `tokenof` / `signatureof` / `services` and the `$<N>` hole, `Typeof<T>`,
// `Keyed<T,K>`, and `Inject<T,K>` brands so the registration grammar resolves.
func buildNameofWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "di.core")
	writeFile(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): unknown;
}
export declare const services: IServiceManifestBase;
export declare function tokenfor<T>(): string;
export declare function tokenfor(value: unknown): string;
export declare function tokenof<T>(): string;
export declare function tokenof(value: unknown): string;
export declare function signatureof(value: unknown): unknown;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const ARG: unique symbol;
export type Typeof<T> = { readonly [ARG]?: T };
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
declare const TOK: unique symbol;
export type Inject<T, K extends string> = T & { readonly [TOK]?: K };
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass<T>(ctor: unknown): unknown;
  }
}
`)

	app := filepath.Join(root, "packages", "app")
	writeFile(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@rhombus-std/di.core": "workspace:*" }
}`)
	linkPkg(t, app, "@rhombus-std/di.core", core)
	writeFile(t, filepath.Join(app, "main.ts"), mainSrc)
	writeFile(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "node_modules/@rhombus-std/di.core/src/index.ts"]
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

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func linkPkg(t *testing.T, appDir, name, target string) {
	t.Helper()
	link := filepath.Join(appDir, "node_modules", name)
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}

func mainSF(t *testing.T, prog *driver.Program) *shimast.SourceFile {
	t.Helper()
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), "main.ts") {
			return sf
		}
	}
	t.Fatal("main.ts not found")
	return nil
}

func reprint(ec *shimprinter.EmitContext, sf *shimast.SourceFile) string {
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(sf.AsNode(), sf, writer, nil)
	return writer.String()
}

// lowerNameof runs the tokenfor stage over main.ts and returns the reprinted output.
func lowerNameof(t *testing.T, prog *driver.Program, app string) string {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	transform := New(prog, ctx, nil, func(plugin.Diagnostic) {})
	ec := shimprinter.NewEmitContext()
	out := transform(ec, mainSF(t, prog))
	return reprint(ec, out)
}

// lowerDi runs the di registration stage over main.ts and returns its output.
func lowerDi(t *testing.T, prog *driver.Program, app string) string {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	transform := ditransform.New(prog, ctx, func(ditransform.Diagnostic) {})
	ec := shimprinter.NewEmitContext()
	out := transform(ec, mainSF(t, prog))
	return reprint(ec, out)
}

// stringLiteralAt reads the double-quoted string literal that begins at out[open]
// (out[open] must be the opening quote) and returns its UNESCAPED value, so a token
// carrying embedded quotes (a literal type like `"lit"` → `\"lit\"`) round-trips.
func stringLiteralAt(t *testing.T, out string, open int) string {
	t.Helper()
	for i := open + 1; i < len(out); i++ {
		switch out[i] {
		case '\\':
			i++
		case '"':
			unquoted, err := strconv.Unquote(out[open : i+1])
			if err != nil {
				t.Fatalf("unquote token literal %q: %v", out[open:i+1], err)
			}
			return unquoted
		}
	}
	t.Fatalf("unterminated string literal at %d in:\n%s", open, out)
	return ""
}

// nameofToken returns the (unescaped) token a lowered `export const X = "…";`
// carries — the token the tokenfor stage produced.
func nameofToken(t *testing.T, out, constName string) string {
	t.Helper()
	marker := "const " + constName + " = "
	i := strings.Index(out, marker)
	if i < 0 || i+len(marker) >= len(out) || out[i+len(marker)] != '"' {
		t.Fatalf("no lowered `%s` token literal in:\n%s", constName, out)
	}
	return stringLiteralAt(t, out, i+len(marker))
}

// diServiceToken returns the (unescaped) arg[0] of the lowered `services.addClass("…", …)`
// call — the service token the di stage derived directly.
func diServiceToken(t *testing.T, out string) string {
	t.Helper()
	marker := ".addClass("
	i := strings.Index(out, marker)
	if i < 0 || i+len(marker) >= len(out) || out[i+len(marker)] != '"' {
		t.Fatalf("no lowered `.addClass(\"…\")` call in:\n%s", out)
	}
	return stringLiteralAt(t, out, i+len(marker))
}

// TestNameofRendersOpenGenericHole is the core of the hole-aware tokenfor change: an
// explicit `tokenfor<IFoo<$<1>>>()` lowers to a token that renders the hole textually
// as `$1` — `…:IFoo<$1>` — not the pre-change `IFoo<@rhombus-std/di.core:$<1>>` the
// non-hole-aware DeriveToken produced by tokenizing the `$` brand alias itself.
func TestNameofRendersOpenGenericHole(t *testing.T) {
	src := `import { tokenfor, Typeof, $ } from '@rhombus-std/di.core';
interface IFoo<T> {}
export const tok = tokenfor<IFoo<$<1>>>();
void (0 as unknown as Typeof<$<1>>);
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()
	token := nameofToken(t, lowerNameof(t, prog, app), "tok")
	if !strings.HasSuffix(token, ":IFoo<$1>") {
		t.Fatalf("open-generic hole not rendered as $1: got %q, want suffix :IFoo<$1>", token)
	}
	if strings.Contains(token, "$<1>") {
		t.Fatalf("token still carries the un-rendered `$<1>` brand: %q", token)
	}
}

// TestNameofOpenGenericTokenMatchesDiDirect proves the load-bearing parity: the
// token the tokenfor stage derives for `tokenfor<IFoo<$<1>>>()` is byte-identical to
// the service token the di registration stage derives for the direct
// `addClass<IFoo<$<1>>>(Foo<$<1>>)` — the two halves of the inline registration path
// (tokenfor produces the token, the di stage the direct one) must never diverge.
func TestNameofOpenGenericTokenMatchesDiDirect(t *testing.T) {
	src := `import { tokenfor, services, Typeof, $ } from '@rhombus-std/di.core';
interface IFoo<T> {}
interface IStore<T> {}
class Foo<T> implements IFoo<$<1>> { constructor(store: IStore<T>) { void store; } }
export const tok = tokenfor<IFoo<$<1>>>();
services.addClass<IFoo<$<1>>>(Foo<$<1>>);
void (0 as unknown as Typeof<$<1>>);
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	nameofTok := nameofToken(t, lowerNameof(t, prog, app), "tok")
	diTok := diServiceToken(t, lowerDi(t, prog, app))
	if nameofTok != diTok {
		t.Fatalf("service-token divergence:\n tokenfor = %q\n di     = %q", nameofTok, diTok)
	}
	if !strings.Contains(nameofTok, "IFoo<$1>") {
		t.Fatalf("expected an open-generic token, got %q", nameofTok)
	}
}

// TestNameofClosedTokensUnchanged pins that the DeriveToken → DeriveTokenF switch
// is a pure extension for every non-hole type: DeriveTokenF adds only the hole
// branch and the (byte-correct) internal-symbol rejection, so a named / generic /
// literal / intrinsic / collection target derives the identical token it did
// before. Guards the common case against a regression.
func TestNameofClosedTokensUnchanged(t *testing.T) {
	src := `import { tokenfor } from '@rhombus-std/di.core';
interface IBar {}
interface IFoo<T> {}
export const a = tokenfor<IBar>();
export const b = tokenfor<IFoo<IBar>>();
export const c = tokenfor<"lit">();
export const d = tokenfor<string>();
export const e = tokenfor<IBar[]>();
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()
	out := lowerNameof(t, prog, app)

	cases := []struct {
		name string
		want string
	}{
		{"a", "@scope/app/main:IBar"},
		{"b", "@scope/app/main:IFoo<@scope/app/main:IBar>"},
		{"c", `"lit"`},
		{"d", "string"},
		{"e", "Array<@scope/app/main:IBar>"},
	}
	for _, tc := range cases {
		got := nameofToken(t, out, tc.name)
		if got != tc.want {
			t.Errorf("tokenfor<%s>: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

// TestNameofAnonymousTypeDerivesEmpty covers the one intentional behavior change of
// the switch: DeriveToken rejected only the literal name "__type", but typescript-go
// stores an anonymous object type behind the 0xFE internal-symbol prefix, so the old
// tokenfor would derive a bogus token for `tokenfor<{…}>()`. DeriveTokenF rejects the
// whole internal-symbol family, yielding the empty token — matching how the di stage
// already treats an anonymous type. Anonymous types are not legitimate tokenfor
// targets, so no real call site regresses.
// TestNameofAnonymousTypeReportsUnderivable pins the failure-semantics unification
// (§94/Open issue 4): a SOURCE-WRITTEN `tokenfor<{anonymous}>()` whose type derives
// no token is no longer silently lowered to the empty token `""` (which a downstream
// reader could mistake for a real token) — it emits a targeted
// TYPE_ARG_TOKEN_UNDERIVABLE diagnostic and is left UN-LOWERED, so the build fails
// loud.
func TestNameofAnonymousTypeReportsUnderivable(t *testing.T) {
	src := `import { tokenfor } from '@rhombus-std/di.core';
export const anon = tokenfor<{ readonly a: number }>();
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	ctx := plugin.NewContext(prog, app)
	var diags []plugin.Diagnostic
	transform := New(prog, ctx, nil, func(d plugin.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	out := reprint(ec, transform(ec, mainSF(t, prog)))

	if strings.Contains(out, `const anon = ""`) {
		t.Fatalf("anonymous tokenfor must NOT lower to the silent empty token:\n%s", out)
	}
	if !strings.Contains(out, "tokenfor<") {
		t.Fatalf("anonymous tokenfor must be left un-lowered:\n%s", out)
	}
	if len(diags) != 1 || diags[0].Code != "TYPE_ARG_TOKEN_UNDERIVABLE" {
		t.Fatalf("expected one TYPE_ARG_TOKEN_UNDERIVABLE diagnostic, got %+v", diags)
	}
}

// TestNameofDerivesKeyedBase is the keyed base-derivation invariant (§98): tokenfor
// lowers a `Keyed<T, K>` service type to just the BASE token — the brand stripped,
// with NO `#key` suffix and NOT the aliased `Keyed<...>` reference. The di direct
// path composes the full `base#key`; the inline registration path splits that in
// two — tokenfor gives the base, keyof<T>() gives the key — so the runtime `#`
// composition of the two halves lands byte-for-byte on the di direct token. This
// test pins that split: the tokenfor base is exactly the di token minus its `#key`
// tail, so the halves compose rather than diverge (the old fence is gone).
func TestNameofDerivesKeyedBase(t *testing.T) {
	src := `import { tokenfor, services, Keyed } from '@rhombus-std/di.core';
interface ICache {}
class RedisCache implements ICache {}
export const tok = tokenfor<Keyed<ICache, "redis">>();
services.addClass<Keyed<ICache, "redis">>(RedisCache);
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	nameofTok := nameofToken(t, lowerNameof(t, prog, app), "tok")
	diTok := diServiceToken(t, lowerDi(t, prog, app))
	if !strings.HasSuffix(diTok, "#redis") {
		t.Fatalf("di direct path should compose the keyed suffix, got %q", diTok)
	}
	// tokenfor gives the BASE only — no key suffix, and not the aliased Keyed<...>.
	if strings.Contains(nameofTok, "#") {
		t.Fatalf("tokenfor must derive the base (no key suffix); got %q", nameofTok)
	}
	if strings.Contains(nameofTok, "Keyed<") {
		t.Fatalf("tokenfor must strip the Keyed brand, not tokenize the alias; got %q", nameofTok)
	}
	// The two halves compose exactly onto the di direct token.
	if nameofTok+"#redis" != diTok {
		t.Fatalf("base + key must compose onto the di token: tokenfor=%q + #redis != di=%q", nameofTok, diTok)
	}
}

// TestTokenofTypeArgDerivesRawType pins the RAW type-argument derivation
// `tokenof<T>()` — the source-written twin of the synthetic addOptions element —
// against its `tokenfor<T>()` sibling. For a `Keyed<T, K>` type, `tokenof<T>()`
// keeps the WHOLE aliased `Keyed<...>` reference (DeriveTokenF, no brand strip),
// whereas `tokenfor<T>()` strips to the bare service base. This is the distinction
// the addOptions element depends on to stay locked to the composed wrapper's inner
// leaf (which also derives raw); a plain (unbranded) type derives identically
// through both, so only the brand case discriminates them.
func TestTokenofTypeArgDerivesRawType(t *testing.T) {
	src := `import { tokenfor, tokenof, Keyed } from '@rhombus-std/di.core';
interface ICache {}
export const raw = tokenof<Keyed<ICache, "redis">>();
export const base = tokenfor<Keyed<ICache, "redis">>();
export const plainRaw = tokenof<ICache>();
export const plainBase = tokenfor<ICache>();
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerNameof(t, prog, app)
	rawTok := nameofToken(t, out, "raw")
	baseTok := nameofToken(t, out, "base")

	// tokenof keeps the raw aliased Keyed<...> reference — no brand strip, no key.
	if !strings.Contains(rawTok, "Keyed<") {
		t.Fatalf("tokenof<Keyed<...>>() should keep the raw Keyed<...> reference, got %q", rawTok)
	}
	if strings.Contains(rawTok, "#") {
		t.Fatalf("tokenof derives the raw type, never a keyed base#key suffix; got %q", rawTok)
	}
	// tokenfor strips the brand; the two must therefore DIVERGE on a keyed type.
	if strings.Contains(baseTok, "Keyed<") {
		t.Fatalf("tokenfor<Keyed<...>>() strips the brand; got %q", baseTok)
	}
	if rawTok == baseTok {
		t.Fatalf("tokenof (raw) and tokenfor (stripped base) must diverge on a keyed type: both %q", rawTok)
	}
	// A plain unbranded type derives identically through both primitives.
	if plainRaw, plainBase := nameofToken(t, out, "plainRaw"), nameofToken(t, out, "plainBase"); plainRaw != plainBase {
		t.Fatalf("tokenof and tokenfor must agree on a plain type: %q vs %q", plainRaw, plainBase)
	}
}
