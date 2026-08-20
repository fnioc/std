package typefortransform

import (
	"strings"
	"testing"
)

// TestTypeforValueArgGenericRendering is the load-bearing proof of the value-argument
// hole contract: an open-template value `C<$<L>>`'s bare-hole slot spells as
// `Type.generic(label)`, and a hole standing INSIDE a larger slot closes into
// that slot's own type expression.
func TestTypeforValueArgGenericRendering(t *testing.T) {
	cases := []struct {
		name string
		// decl declares the interfaces + class/value the case derives from.
		decl string
		// val is the value expression `typefor(...)` extracts.
		val string
		// want is the exact Type.ctor(...) node the value derives.
		want string
	}{
		{
			// A bare generic-brand `Typeof<$<'1'>>` constructor param renders with the
			// hole as its own generic type argument — the hole is the whole dependency.
			name: "bare-typeof-hole",
			decl: `declare const ARG: unique symbol;
type Typeof<T> = { readonly [ARG]?: T };
class TokenDep { constructor(tok: Typeof<$<'1'>>) { void tok; } }`,
			val: `TokenDep`,
			want: `Type.ctor(Type.imported("TokenDep", "@scope/app/main"), ` +
				`[[Type.imported("Typeof", "@scope/app/main", [Type.generic("1")])]])`,
		},
		{
			// A hole nested inside a generic dependency (`IStore<T>`, T bound to $<'1'>
			// via the instantiation `Repo<$<'1'>>`) closes into that slot's own generic
			// argument on both the instance type and the dependency.
			name: "nested-hole-in-generic-dep",
			decl: `interface IRepo<T> {}
interface IStore<T> {}
class Repo<T> implements IRepo<$<'1'>> { constructor(store: IStore<T>) { void store; } }`,
			val: `Repo<$<'1'>>`,
			want: `Type.ctor(Type.imported("Repo", "@scope/app/main", [Type.generic("1")]), ` +
				`[[Type.imported("IStore", "@scope/app/main", [Type.generic("1")])]])`,
		},
		{
			// A multi-arg constructor mixing a holed dependency with a concrete one:
			// the holed slot carries the hole, the concrete slot its plain address —
			// both derive position-for-position.
			name: "multi-arg-holed-plus-concrete",
			decl: `interface ISvc<T> {}
interface IStore<T> {}
interface ILogger {}
class Svc<T> implements ISvc<$<'1'>> { constructor(store: IStore<T>, logger: ILogger) { void store; void logger; } }`,
			val: `Svc<$<'1'>>`,
			want: `Type.ctor(Type.imported("Svc", "@scope/app/main", [Type.generic("1")]), ` +
				`[[Type.imported("IStore", "@scope/app/main", [Type.generic("1")]), Type.imported("ILogger", "@scope/app/main")]])`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			src := "import { typefor, $ } from '@rhombus-std/primitives.extras';\n" +
				tc.decl + "\nexport const s = typefor(" + tc.val + ");\n"

			prog, app := buildTypeforWorkspace(t, src)
			defer func() { _ = prog.Close() }()
			out, diags := lowerTypeforDiags(t, prog, app)
			if len(diags) != 0 {
				t.Fatalf("typefor lowering raised diagnostics: %+v", diags)
			}
			if got := exprFor(t, out, "s"); got != tc.want {
				t.Fatalf("hole rendering mismatch:\n got  = %s\n want = %s", got, tc.want)
			}
		})
	}
}

// TestTypeforValueArgFactoryParamGenericIsAKnownGap pins a scope limitation
// adjacent to the ctor cases above: a FACTORY value whose OWN parameter
// directly names an open-template hole (`(store: IStore<$<'1'>>) => ...`, not
// through a class's own generic instantiation) fails to derive — the checker
// resolves that parameter's type differently for an arrow function literal
// than for a constructor parameter of the identical syntactic shape, and
// tokens.DeriveTyped reports it underivable rather than guess at a node. The
// call is left un-lowered, matching every other underivable shape's
// degradation.
func TestTypeforValueArgFactoryParamGenericIsAKnownGap(t *testing.T) {
	src := `import { typefor, $ } from '@rhombus-std/primitives.extras';
interface IStore<T> {}
interface ILogger {}
const factory = (store: IStore<$<'1'>>, logger: ILogger) => { void store; void logger; };
export const s = typefor(factory);
`
	prog, app := buildTypeforWorkspace(t, src)
	defer func() { _ = prog.Close() }()
	out, diags := lowerTypeforDiags(t, prog, app)
	if !strings.Contains(out, "typefor(factory)") {
		t.Errorf("a factory with a directly-holed param must leave the call un-lowered:\n%s", out)
	}
	if len(diags) != 1 || diags[0].Code != valueArgUnderivableCode {
		t.Fatalf("expected one %s diagnostic, got %+v", valueArgUnderivableCode, diags)
	}
}
