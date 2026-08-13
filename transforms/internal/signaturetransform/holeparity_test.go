package signaturetransform

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/signatures"
)

// buildDiParityWorkspace lays out a workspace whose core package is literally
// named `@rhombus-std/di.core` — the module a real registration anchors on —
// declaring the `signatureof` primitive plus the `$<N>` hole / `Typeof<T>`
// brands. main.ts is caller-supplied.
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

// TestSignatureofRendersHoleAsGeneric is the load-bearing proof of the
// hole-aware signatureof contract (§157): an open-template value `C<$<N>>`'s
// bare-hole slot spells as `Type.generic(label)`, and a hole standing INSIDE a
// larger slot closes into that slot's own type expression — the same
// derivation typefor(value) would produce for an identically-shaped value,
// since both reuse tokens.DeriveTyped.
func TestSignatureofRendersHoleAsGeneric(t *testing.T) {
	cases := []struct {
		name string
		// decl declares the interfaces + class/value the case derives from.
		decl string
		// val is the value expression `signatureof(...)` extracts.
		val string
		// want is the exact Type.ctor(...) / Type.func(...) node the value derives.
		want string
	}{
		{
			// A bare `Typeof<$<1>>` positional-token constructor param renders as
			// the bare Type.generic("1") node — the hole is the whole dependency.
			name: "bare-typeof-hole",
			decl: `interface IFoo<T> {}
class TokenDep { constructor(tok: Typeof<$<1>>) { void tok; } }`,
			val: `TokenDep`,
			want: `Type.ctor(Type.imported("TokenDep", "@scope/app/main"), ` +
				`Type.imported("Typeof", "@rhombus-std/di.core", [Type.generic("1")]))`,
		},
		{
			// A hole nested inside a generic dependency (`IStore<T>`, T bound to
			// $<1> via the instantiation `Repo<$<1>>`) closes into that slot's own
			// generic argument on both the instance type and the dependency.
			name: "nested-hole-in-generic-dep",
			decl: `interface IRepo<T> {}
interface IStore<T> {}
class Repo<T> implements IRepo<$<1>> { constructor(store: IStore<T>) { void store; } }`,
			val: `Repo<$<1>>`,
			want: `Type.ctor(Type.imported("Repo", "@scope/app/main", [Type.generic("1")]), ` +
				`Type.imported("IStore", "@scope/app/main", [Type.generic("1")]))`,
		},
		{
			// A multi-arg constructor mixing a holed dependency with a concrete
			// one: the holed slot carries the hole, the concrete slot its plain
			// address — both derive position-for-position.
			name: "multi-arg-holed-plus-concrete",
			decl: `interface ISvc<T> {}
interface IStore<T> {}
interface ILogger {}
class Svc<T> implements ISvc<$<1>> { constructor(store: IStore<T>, logger: ILogger) { void store; void logger; } }`,
			val: `Svc<$<1>>`,
			want: `Type.ctor(Type.imported("Svc", "@scope/app/main", [Type.generic("1")]), ` +
				`Type.imported("IStore", "@scope/app/main", [Type.generic("1")]), Type.imported("ILogger", "@scope/app/main"))`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sigSrc := "import { signatureof } from '@rhombus-std/di.core';\n" +
				diBrandRefs + tc.decl + "\nexport const s = signatureof(" + tc.val + ");\n"

			prog, app := buildDiParityWorkspace(t, sigSrc)
			defer func() { _ = prog.Close() }()
			out, diags := lowerMain(t, prog, app)
			if len(diags) != 0 {
				t.Fatalf("signatureof lowering raised diagnostics: %+v", diags)
			}
			if !strings.Contains(out, tc.want) {
				t.Fatalf("hole rendering mismatch:\n got  = %s\n want = %s", out, tc.want)
			}
		})
	}
}

// diBrandRefs imports the hole/Typeof brands so a `$<N>` / `Typeof<T>` reference in
// the caller's declaration resolves. `void`-ing them keeps the imports live under
// strict mode without contributing a registration.
const diBrandRefs = "import type { Typeof, $ } from '@rhombus-std/di.core';\n" +
	"type _keepTypeof<T> = Typeof<T>;\ntype _keepHole = $<1>;\n"

// TestSignatureofFactoryParamHoleIsAKnownGap pins a deliberate Phase 1 scope
// limitation adjacent to the ctor cases above: a FACTORY value whose OWN
// parameter directly names an open-template hole (`(store: IStore<$<1>>) =>
// ...`, not through a class's own generic instantiation) fails to derive —
// the checker resolves that parameter's type differently for an arrow
// function literal than for a constructor parameter of the identical
// syntactic shape, and tokens.DeriveTyped reports it underivable rather than
// guess at a node. A factory dependency's OWN parameters reaching a hole this
// way is the narrow case the deleted di registration stage documented as
// "the hole only ever surfaces here via a standalone / inline signatureof" —
// unreachable through an actual OPEN service-token registration, which is
// class-only. The call is left un-lowered, matching every other underivable
// shape's degradation.
func TestSignatureofFactoryParamHoleIsAKnownGap(t *testing.T) {
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
	if !strings.Contains(out, "signatureof(factory)") {
		t.Errorf("a factory with a directly-holed param must leave the call un-lowered:\n%s", out)
	}
	found := false
	for _, d := range diags {
		if d.Code == "990006" && d.Category == signatures.Error {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a 990006 underivable-token error, got %+v", diags)
	}
}
