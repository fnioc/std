package schema

// Pure, checker-free helper tests (isUnderNodeModules, jsIdentifier, propertyKey).
// The checker-backed walk (LiteralForType / schemaForType / objectLiteralForType /
// isAcceptableRecord / isLibraryOrExternal) is exercised end-to-end through the
// config stage's parity suite (internal/configtransform) and the schemaof
// primitive's parity suite (internal/nameoftransform), both of which drive this
// same code.

import (
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
)

func newFactory() *shimast.NodeFactory {
	return shimprinter.NewEmitContext().Factory.AsNodeFactory()
}

func TestIsUnderNodeModules(t *testing.T) {
	cases := []struct {
		fileName string
		want     bool
	}{
		{"/proj/node_modules/pkg/index.d.ts", true},
		{"/home/x/node_modules/@scope/p/lib.d.ts", true},
		{"/proj/src/main.ts", false},
		{"/proj/node_modulesish/x.ts", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := isUnderNodeModules(tc.fileName); got != tc.want {
			t.Errorf("isUnderNodeModules(%q) = %v, want %v", tc.fileName, got, tc.want)
		}
	}
}

func TestJsIdentifierRegex(t *testing.T) {
	cases := []struct {
		name string
		want bool
	}{
		{"Host", true},
		{"_x", true},
		{"$a", true},
		{"a1", true},
		{"1a", false},
		{"a-b", false},
		{"", false},
		{"a.b", false},
	}
	for _, tc := range cases {
		if got := jsIdentifier.MatchString(tc.name); got != tc.want {
			t.Errorf("jsIdentifier.MatchString(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

// TestPropertyKey: a valid JS identifier becomes an Identifier (casing preserved),
// an invalid one a StringLiteral.
func TestPropertyKey(t *testing.T) {
	f := newFactory()

	host := propertyKey(f, "Host")
	if host.Kind != shimast.KindIdentifier {
		t.Errorf("propertyKey(Host).Kind = %v, want Identifier", host.Kind)
	}
	if host.Text() != "Host" {
		t.Errorf("propertyKey casing not preserved: %q, want Host", host.Text())
	}

	for _, name := range []string{"kebab-case", "123"} {
		key := propertyKey(f, name)
		if key.Kind != shimast.KindStringLiteral {
			t.Errorf("propertyKey(%q).Kind = %v, want StringLiteral", name, key.Kind)
		}
	}
}
