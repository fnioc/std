package configtransform

// OPTIONAL binding resolution, reference construction, and import injection. All
// pure AST — SideParse + a factory, no checker.

import (
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
)

// TestResolveOptionalBinding covers each binding shape the resolver honors: a
// named import (alias honored), a namespace import, and the two "no binding here"
// cases (absent, and imported from a SUBPATH rather than the exact barrel).
func TestResolveOptionalBinding(t *testing.T) {
	cases := []struct {
		name          string
		src           string
		wantLocalName string
		wantNamespace string
		wantInject    bool
	}{
		{
			name:          "named-import",
			src:           `import { OPTIONAL } from '@rhombus-std/config';`,
			wantLocalName: "OPTIONAL",
			wantInject:    false,
		},
		{
			name:          "aliased-named-import",
			src:           `import { OPTIONAL as Opt } from '@rhombus-std/config';`,
			wantLocalName: "Opt",
			wantInject:    false,
		},
		{
			name:          "namespace-import",
			src:           `import * as cfg from '@rhombus-std/config';`,
			wantNamespace: "cfg",
			wantInject:    false,
		},
		{
			name:          "no-barrel-import",
			src:           `export const x = 1;`,
			wantLocalName: "OPTIONAL",
			wantInject:    true,
		},
		{
			name:          "subpath-not-barrel",
			src:           `import { OPTIONAL } from '@rhombus-std/config/sub';`,
			wantLocalName: "OPTIONAL",
			wantInject:    true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newConfigFactory()
			sf := sideParseConfig(t, tc.src)
			ref := resolveOptionalBinding(f, sf)
			if ref.localName != tc.wantLocalName {
				t.Errorf("localName = %q, want %q", ref.localName, tc.wantLocalName)
			}
			if ref.namespace != tc.wantNamespace {
				t.Errorf("namespace = %q, want %q", ref.namespace, tc.wantNamespace)
			}
			if ref.injectNamed != tc.wantInject {
				t.Errorf("injectNamed = %v, want %v", ref.injectNamed, tc.wantInject)
			}
		})
	}
}

// TestOptionalRefExprNamespace: a namespace binding yields `<ns>.OPTIONAL`, a
// fresh PropertyAccessExpression per call.
func TestOptionalRefExprNamespace(t *testing.T) {
	f := newConfigFactory()
	ref := &optionalRef{namespace: "cfg"}

	e1 := ref.expr(f)
	if e1.Kind != shimast.KindPropertyAccessExpression {
		t.Fatalf("expr.Kind = %v, want PropertyAccessExpression", e1.Kind)
	}
	access := e1.AsPropertyAccessExpression()
	if access.Expression.Text() != "cfg" {
		t.Errorf("namespace identifier = %q, want cfg", access.Expression.Text())
	}
	if access.Name().Text() != optionalName {
		t.Errorf("member = %q, want OPTIONAL", access.Name().Text())
	}

	e2 := ref.expr(f)
	if e1 == e2 {
		t.Error("expr must return a FRESH node per call (no aliasing)")
	}
}

// TestOptionalRefExprBare: a non-namespace binding yields a bare Identifier with
// the local name, a fresh node per call.
func TestOptionalRefExprBare(t *testing.T) {
	f := newConfigFactory()
	ref := &optionalRef{localName: "Opt"}

	e1 := ref.expr(f)
	if e1.Kind != shimast.KindIdentifier {
		t.Fatalf("expr.Kind = %v, want Identifier", e1.Kind)
	}
	if e1.Text() != "Opt" {
		t.Errorf("identifier = %q, want Opt", e1.Text())
	}

	e2 := ref.expr(f)
	if e1 == e2 {
		t.Error("expr must return a FRESH node per call (no aliasing)")
	}
}

// reprintInjectSF prints a source file back to text, fixing parent pointers first.
func reprintInjectSF(ec *shimprinter.EmitContext, sf *shimast.SourceFile) string {
	shimast.SetParentInChildrenUnset(sf.AsNode())
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(sf.AsNode(), sf, writer, nil)
	return writer.String()
}

// TestEnsureOptionalImportInjects: used && injectNamed prepends exactly one named
// OPTIONAL import as statement[0].
func TestEnsureOptionalImportInjects(t *testing.T) {
	ec := shimprinter.NewEmitContext()
	f := ec.Factory.AsNodeFactory()
	sf := sideParseConfig(t, `export const x = 1;`)
	ref := &optionalRef{used: true, injectNamed: true, localName: optionalName}

	out := ensureOptionalImport(f, sf, ref)
	if out.Statements.Nodes[0].Kind != shimast.KindImportDeclaration {
		t.Fatalf("statement[0].Kind = %v, want ImportDeclaration", out.Statements.Nodes[0].Kind)
	}
	text := reprintInjectSF(ec, out)
	if !strings.Contains(text, `import { OPTIONAL } from "@rhombus-std/config"`) {
		t.Errorf("injected import missing:\n%s", text)
	}
	if got := strings.Count(text, "import {"); got != 1 {
		t.Errorf("expected exactly one injected import, got %d:\n%s", got, text)
	}
}

// TestEnsureOptionalImportNotUsed: !used returns the file unchanged (same pointer).
func TestEnsureOptionalImportNotUsed(t *testing.T) {
	f := newConfigFactory()
	sf := sideParseConfig(t, `export const x = 1;`)
	ref := &optionalRef{used: false, injectNamed: true, localName: optionalName}

	if out := ensureOptionalImport(f, sf, ref); out != sf {
		t.Error("unused OPTIONAL must leave the file unchanged (same pointer)")
	}
}

// TestEnsureOptionalImportExistingBinding: used && !injectNamed (an existing
// binding was found) returns the file unchanged.
func TestEnsureOptionalImportExistingBinding(t *testing.T) {
	f := newConfigFactory()
	sf := sideParseConfig(t, `import { OPTIONAL } from '@rhombus-std/config';`)
	ref := &optionalRef{used: true, injectNamed: false, localName: optionalName}

	if out := ensureOptionalImport(f, sf, ref); out != sf {
		t.Error("an existing binding must not trigger injection (same pointer)")
	}
}
