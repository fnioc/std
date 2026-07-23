package signaturetransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

// buildDiParityWorkspace lays out a workspace whose core package is literally
// named `@rhombus-std/di.core` — the module the di registration stage anchors its
// `addClass` verb on (ditransform's memberAnchoredOnDiCore hardcodes that specifier). It
// declares the `addClass<T>(ctor)` sugar overload inside a `declare module
// '@rhombus-std/di.core'` block so a `services.addClass<I<$1>>(C<$1>)` call anchors,
// plus the `signatureof` primitive and the `$<N>` hole / `Typeof<T>` brands.
// main.ts is caller-supplied.
func buildDiParityWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "di.core")
	write(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	write(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): unknown;
}
export declare const services: IServiceManifestBase;
export declare function signatureof(value: unknown): unknown;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const ARG: unique symbol;
export type Typeof<T> = { readonly [ARG]?: T };
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass<T>(ctor: unknown): unknown;
  }
}
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@rhombus-std/di.core": "workspace:*" }
}`)
	linkPackage(t, app, "@rhombus-std/di.core", core)
	write(t, filepath.Join(app, "main.ts"), mainSrc)
	write(t, filepath.Join(app, "tsconfig.json"), `{
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

// lowerDiMain runs the di registration stage over main.ts and returns the
// reprinted output plus diagnostics — the direct `addClass<I<$1>>(C<$1>)` lowering the
// signatureof path must byte-match.
func lowerDiMain(t *testing.T, prog *driver.Program, app string) (string, []ditransform.Diagnostic) {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	var diags []ditransform.Diagnostic
	transform := ditransform.New(prog, ctx, func(d ditransform.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	sf := mainSourceFile(t, prog)
	out := transform(ec, sf)
	return reprintSF(ec, out), diags
}

// TestSignatureofHoleParityWithDiDirect is the load-bearing proof of the
// hole-aware signatureof contract: the `[[...]]` dependency-signature array the
// signatureof stage emits for an open-template value `C<$<N>>` is BYTE-IDENTICAL to
// the third argument the di registration stage synthesizes for the direct
// `addClass<I<$<N>>>(C<$<N>>)` lowering of the SAME value. Both stages share ditransform's
// extractInstantiatedSignature + signaturesLiteral path, so a hole renders the same
// way in both — as the literal `$N` inside a dependency token string, or as the
// `{ typeArg: N }` slot for a bare `Typeof<$<N>>` positional-token param. Driving
// the two stages over identical type declarations (same program, so token bases
// match) and diffing the arrays pins that parity across the adversarial forms.
func TestSignatureofHoleParityWithDiDirect(t *testing.T) {
	cases := []struct {
		name string
		// decl declares the interfaces + class the registration targets.
		decl string
		// reg is the direct `services.addClass<I<$1>>(C<$1>)` registration statement.
		reg string
		// val is the value expression `signatureof(...)` extracts — the same
		// class/instantiation expression the reg registers.
		val string
	}{
		{
			// A bare `Typeof<$<1>>` positional-token constructor param renders as the
			// `{ typeArg: 1 }` slot on both paths — the hole is the whole dependency.
			name: "bare-typeof-hole",
			decl: `interface IFoo<T> {}
class TokenDep { constructor(tok: Typeof<$<1>>) { void tok; } }`,
			reg: `services.addClass<IFoo<$<1>>>(TokenDep);`,
			val: `TokenDep`,
		},
		{
			// A hole nested inside a generic dependency (`IStore<T>`, T bound to $<1>)
			// renders textually as `$1` inside the dep token string on both paths.
			name: "nested-hole-in-generic-dep",
			decl: `interface IRepo<T> {}
interface IStore<T> {}
class Repo<T> implements IRepo<$<1>> { constructor(store: IStore<T>) { void store; } }`,
			reg: `services.addClass<IRepo<$<1>>>(Repo<$<1>>);`,
			val: `Repo<$<1>>`,
		},
		{
			// A multi-arg constructor mixing a holed dependency with a concrete one:
			// the holed slot renders `IStore<$1>`, the concrete slot its plain token —
			// both paths agree position-for-position.
			name: "multi-arg-holed-plus-concrete",
			decl: `interface ISvc<T> {}
interface IStore<T> {}
interface ILogger {}
class Svc<T> implements ISvc<$<1>> { constructor(store: IStore<T>, logger: ILogger) { void store; void logger; } }`,
			reg: `services.addClass<ISvc<$<1>>>(Svc<$<1>>);`,
			val: `Svc<$<1>>`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// One shared type-declaration prelude keeps the token bases identical
			// between the two stages: the di statement and the standalone signatureof
			// call resolve the SAME interfaces/class, so any divergence is the hole
			// rendering, not a token-base artifact.
			diSrc := "import { services } from '@rhombus-std/di.core';\n" +
				diBrandRefs + tc.decl + "\n" + tc.reg + "\n"
			sigSrc := "import { signatureof } from '@rhombus-std/di.core';\n" +
				diBrandRefs + tc.decl + "\nexport const s = signatureof(" + tc.val + ");\n"

			diProg, diApp := buildDiParityWorkspace(t, diSrc)
			defer func() { _ = diProg.Close() }()
			diOut, diDiags := lowerDiMain(t, diProg, diApp)
			if len(diDiags) != 0 {
				t.Fatalf("di direct lowering raised diagnostics: %+v", diDiags)
			}

			sigProg, sigApp := buildDiParityWorkspace(t, sigSrc)
			defer func() { _ = sigProg.Close() }()
			sigOut, sigDiags := lowerMain(t, sigProg, sigApp)
			if len(sigDiags) != 0 {
				t.Fatalf("signatureof lowering raised diagnostics: %+v", sigDiags)
			}

			diArr := depArray(t, diOut)
			sigArr := depArray(t, sigOut)
			if diArr != sigArr {
				t.Fatalf("hole-rendering diverged:\n di direct  = %s\n signatureof = %s", diArr, sigArr)
			}
			// The array must actually carry a rendered hole — guard against a silently
			// empty/hole-less array passing the equality check.
			if !strings.Contains(diArr, "$1") && !strings.Contains(diArr, "typeArg") {
				t.Fatalf("expected a rendered hole ($1 or typeArg) in %s", diArr)
			}
		})
	}
}

// diBrandRefs imports the hole/Typeof brands so a `$<N>` / `Typeof<T>` reference in
// the caller's declaration resolves. `void`-ing them keeps the imports live under
// strict mode without contributing a registration.
const diBrandRefs = "import type { Typeof, $ } from '@rhombus-std/di.core';\n" +
	"type _keepTypeof<T> = Typeof<T>;\ntype _keepHole = $<1>;\n"

// TestSignatureofRendersFactoryParamHole covers the factory-value adversarial form:
// a factory whose parameter type references a hole (`(store: IStore<$<1>>) => …`)
// lowers to a dependency token carrying the textual `$1`, exactly as a constructor
// dependency does. A factory under an OPEN service token is a class-only-registration
// error on the di direct path (990009), so the hole only ever surfaces here via a
// standalone / inline signatureof — this pins that its rendering matches the
// constructor path's `DeriveTokenF` recursion.
func TestSignatureofRendersFactoryParamHole(t *testing.T) {
	sigSrc := "import { signatureof } from '@rhombus-std/di.core';\n" +
		diBrandRefs +
		`interface IStore<T> {}
interface ILogger {}
const factory = (store: IStore<$<1>>, logger: ILogger) => { void store; void logger; };
export const s = signatureof(factory);
`
	prog, app := buildDiParityWorkspace(t, sigSrc)
	defer func() { _ = prog.Close() }()
	out, diags := lowerMain(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("factory signatureof raised diagnostics: %+v", diags)
	}
	arr := depArray(t, out)
	if !strings.Contains(arr, "IStore<$1>") {
		t.Fatalf("factory param hole not rendered as $1 in %s", arr)
	}
	if !strings.Contains(arr, "ILogger") {
		t.Fatalf("concrete factory param dropped from %s", arr)
	}
}
