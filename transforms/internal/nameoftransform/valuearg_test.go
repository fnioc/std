package nameoftransform

import (
	"strings"
	"testing"
)

// TestTokenforTypeQueryPinsClassToken pins the by-construction identity the brief
// calls out (holes.go: a class's STATIC type carries the CLASS symbol): a
// type-argument `tokenfor<typeof Foo>()` derives the SAME token as the instance
// form `tokenfor<Foo>()` — the class token `…:Foo` — because `typeof Foo` (the
// constructor/static type) and `Foo` (the instance type) share the class symbol.
// This form works today through the existing type-arg path; the test is the
// missing coverage.
func TestTokenforTypeQueryPinsClassToken(t *testing.T) {
	src := `import { tokenfor } from '@rhombus-std/di.core';
class Foo {}
export const viaTypeof = tokenfor<typeof Foo>();
export const viaInstance = tokenfor<Foo>();
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerNameof(t, prog, app)
	typeofTok := nameofToken(t, out, "viaTypeof")
	instanceTok := nameofToken(t, out, "viaInstance")

	if !strings.HasSuffix(typeofTok, ":Foo") {
		t.Fatalf("tokenfor<typeof Foo>() should derive the class token …:Foo, got %q", typeofTok)
	}
	if typeofTok != instanceTok {
		t.Fatalf("typeof and instance forms must derive the identical token: %q vs %q", typeofTok, instanceTok)
	}
}

// TestTokenforValueArgSourceWritten covers the no-inline manual path: a
// source-written VALUE-argument `tokenfor(Foo)` lowers to the token of the value's
// PRODUCED type — for a class constructor, the instance it builds — so
// `tokenfor(Foo)` and `tokenfor<typeof Foo>()` land on the same class token `…:Foo`.
// This is the checker-anchored value-arg branch (valueArgNameofCall), the twin of
// the synthetic self-registration path.
func TestTokenforValueArgSourceWritten(t *testing.T) {
	src := `import { tokenfor } from '@rhombus-std/di.core';
class Foo {}
export const viaValue = tokenfor(Foo);
export const viaTypeof = tokenfor<typeof Foo>();
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerNameof(t, prog, app)
	valueTok := nameofToken(t, out, "viaValue")
	typeofTok := nameofToken(t, out, "viaTypeof")

	if !strings.HasSuffix(valueTok, ":Foo") {
		t.Fatalf("tokenfor(Foo) should derive the produced-instance token …:Foo, got %q", valueTok)
	}
	if valueTok != typeofTok {
		t.Fatalf("value-arg tokenfor(Foo) must equal type-arg tokenfor<typeof Foo>(): %q vs %q", valueTok, typeofTok)
	}
	// The import binding is elided once every reference is lowered.
	if strings.Contains(out, "import { tokenfor }") {
		t.Fatalf("the now-unreferenced tokenfor import should be elided:\n%s", out)
	}
}

// TestTokenforValueArgPlainValue pins the else-branch of ProducedTypeOf: a value
// whose type has neither a construct nor a call signature tokenizes as its OWN
// type — `tokenfor(cfg)` where `cfg: AppConfig` derives `…:AppConfig`, matching
// the type-arg `tokenfor<AppConfig>()`.
func TestTokenforValueArgPlainValue(t *testing.T) {
	src := `import { tokenfor } from '@rhombus-std/di.core';
interface AppConfig { host: string }
declare const cfg: AppConfig;
export const viaValue = tokenfor(cfg);
export const viaType = tokenfor<AppConfig>();
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerNameof(t, prog, app)
	valueTok := nameofToken(t, out, "viaValue")
	typeTok := nameofToken(t, out, "viaType")

	if !strings.HasSuffix(valueTok, ":AppConfig") {
		t.Fatalf("tokenfor(cfg) should derive the value's own type token …:AppConfig, got %q", valueTok)
	}
	if valueTok != typeTok {
		t.Fatalf("value-arg tokenfor(cfg) must equal type-arg tokenfor<AppConfig>(): %q vs %q", valueTok, typeTok)
	}
}
