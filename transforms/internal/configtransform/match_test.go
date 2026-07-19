package configtransform

// Recognizing `.withType<T>()` on a ConfigBuilder. The declaration-site walks
// (declaredOnBuilderInterface / interfaceIsInDeclaringModule) and isWithTypeCall's
// structural early returns are pure AST — SideParse, no checker. The two branches
// that resolve the `withType` symbol (isWithTypeCall's positive path,
// memberDeclaredOnBuilder) need a checked LoadProgram fixture.

import (
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// findWithTypeMethodSig returns the first `withType` MethodSignature in sf.
func findWithTypeMethodSig(t *testing.T, sf *shimast.SourceFile) *shimast.Node {
	t.Helper()
	node := findConfigNode(sf, func(n *shimast.Node) bool {
		if n.Kind != shimast.KindMethodSignature {
			return false
		}
		name := n.Name()
		return name != nil && name.Text() == withTypeName
	})
	if node == nil {
		t.Fatal("no withType MethodSignature found")
	}
	return node
}

// findInterfaceDecl returns the first interface declaration in sf.
func findInterfaceDecl(t *testing.T, sf *shimast.SourceFile) *shimast.Node {
	t.Helper()
	node := findConfigNode(sf, func(n *shimast.Node) bool {
		return n.Kind == shimast.KindInterfaceDeclaration
	})
	if node == nil {
		t.Fatal("no interface declaration found")
	}
	return node
}

// TestDeclaredOnBuilderInterface: a withType member declared on `ConfigBuilder`
// inside `declare module '@rhombus-std/config'` is accepted; every structural
// deviation is rejected. Pure Node-parent walks — no checker.
func TestDeclaredOnBuilderInterface(t *testing.T) {
	cases := []struct {
		name string
		src  string
		want bool
	}{
		{
			name: "canonical",
			src:  `declare module '@rhombus-std/config' { interface ConfigBuilder { withType<T>(): unknown } }`,
			want: true,
		},
		{
			name: "wrong-interface-name",
			src:  `declare module '@rhombus-std/config' { interface Other { withType<T>(): unknown } }`,
			want: false,
		},
		{
			name: "wrong-module-specifier",
			src:  `declare module '@rhombus-std/other' { interface ConfigBuilder { withType<T>(): unknown } }`,
			want: false,
		},
		{
			name: "top-level-interface-no-module",
			src:  `interface ConfigBuilder { withType<T>(): unknown }`,
			want: false,
		},
		{
			name: "non-string-module-name",
			src:  `namespace Nested { interface ConfigBuilder { withType<T>(): unknown } }`,
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sf := sideParseConfig(t, tc.src)
			decl := findWithTypeMethodSig(t, sf)
			if got := declaredOnBuilderInterface(decl); got != tc.want {
				t.Errorf("declaredOnBuilderInterface = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestDeclaredOnBuilderInterfaceNil: a nil declaration is rejected.
func TestDeclaredOnBuilderInterfaceNil(t *testing.T) {
	if declaredOnBuilderInterface(nil) {
		t.Error("declaredOnBuilderInterface(nil) = true, want false")
	}
}

// TestInterfaceIsInDeclaringModule exercises the enclosing-module walk directly,
// including the KindStringLiteral guard on a non-string (identifier) module name.
func TestInterfaceIsInDeclaringModule(t *testing.T) {
	cases := []struct {
		name string
		src  string
		want bool
	}{
		{
			name: "in-declaring-module",
			src:  `declare module '@rhombus-std/config' { interface ConfigBuilder { withType<T>(): unknown } }`,
			want: true,
		},
		{
			name: "other-module",
			src:  `declare module '@rhombus-std/other' { interface ConfigBuilder { withType<T>(): unknown } }`,
			want: false,
		},
		{
			name: "not-in-any-module",
			src:  `interface ConfigBuilder { withType<T>(): unknown }`,
			want: false,
		},
		{
			name: "identifier-named-module",
			src:  `namespace Nested { interface ConfigBuilder { withType<T>(): unknown } }`,
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sf := sideParseConfig(t, tc.src)
			iface := findInterfaceDecl(t, sf)
			if got := interfaceIsInDeclaringModule(iface); got != tc.want {
				t.Errorf("interfaceIsInDeclaringModule = %v, want %v", got, tc.want)
			}
		})
	}
}

// findCallExpr returns the first CallExpression in sf.
func findCallExpr(t *testing.T, sf *shimast.SourceFile) *shimast.CallExpression {
	t.Helper()
	node := findConfigNode(sf, func(n *shimast.Node) bool {
		return n.Kind == shimast.KindCallExpression
	})
	if node == nil {
		t.Fatal("no call expression found")
	}
	return node.AsCallExpression()
}

// TestIsWithTypeCallStructuralRejections: the early returns fire before the
// checker is consulted, so a nil checker suffices — a non-property-access callee,
// a wrong member name, the wrong type-argument count, and any value argument are
// all rejected structurally.
func TestIsWithTypeCallStructuralRejections(t *testing.T) {
	cases := []struct {
		name string
		src  string
	}{
		{"callee-not-property-access", `plainCall<T>();`},
		{"wrong-member-name", `x.other<T>();`},
		{"zero-type-args", `x.withType();`},
		{"two-type-args", `x.withType<A, B>();`},
		{"one-value-arg", `x.withType<T>(1);`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sf := sideParseConfig(t, tc.src)
			call := findCallExpr(t, sf)
			if isWithTypeCall(nil, call) {
				t.Errorf("isWithTypeCall = true, want false for %s", tc.name)
			}
		})
	}
}

// TestIsWithTypeCallOnBuilder: a genuine `<builder>.withType<T>()` whose member
// resolves to the ConfigBuilder augmentation is accepted (needs the checker).
func TestIsWithTypeCallOnBuilder(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
interface T { host: string }
export const r = new ConfigBuilder().withType<T>();
`)
	defer func() { _ = prog.Close() }()

	call := withTypeCallExpr(t, sf)
	if !isWithTypeCall(prog.Checker, call) {
		t.Error("isWithTypeCall = false, want true for a ConfigBuilder.withType<T>()")
	}
}

// TestIsWithTypeCallUnrelated: a same-named `withType` on an UNRELATED local
// interface/class resolves to its own declaration and is rejected.
func TestIsWithTypeCallUnrelated(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
void ConfigBuilder;
interface T { host: string }
class Other { withType<U>(): Other { return this; } }
export const r = new Other().withType<T>();
`)
	defer func() { _ = prog.Close() }()

	call := withTypeCallExpr(t, sf)
	if isWithTypeCall(prog.Checker, call) {
		t.Error("isWithTypeCall = true, want false for an unrelated withType")
	}
}

// withTypeCallExpr returns the first CallExpression whose callee is a
// property-access named `withType`.
func withTypeCallExpr(t *testing.T, sf *shimast.SourceFile) *shimast.CallExpression {
	t.Helper()
	node := findConfigNode(sf, func(n *shimast.Node) bool {
		if n.Kind != shimast.KindCallExpression {
			return false
		}
		callee := n.AsCallExpression().Expression
		if callee == nil || callee.Kind != shimast.KindPropertyAccessExpression {
			return false
		}
		name := callee.Name()
		return name != nil && name.Text() == withTypeName
	})
	if node == nil {
		t.Fatal("no .withType() call found")
	}
	return node.AsCallExpression()
}
