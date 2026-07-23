package nameoftransform

import (
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/plugin"
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

// TestTokenofValueArgRawType pins the RAW-type semantics of tokenof (the addValue
// self primitive): a source-written `tokenof(makeThing)` where
// `makeThing: () => Thing` tokenizes as the function's OWN type (`…:makeThing`),
// NOT its call-signature return type (`…:Thing`). This is the discriminating
// difference from tokenfor, whose produced-type derivation WOULD unwrap the same
// value to `…:Thing`; the two must diverge here for addValue parity to hold.
func TestTokenofValueArgRawType(t *testing.T) {
	src := `import { tokenof, tokenfor } from '@rhombus-std/di.core';
interface Thing {}
declare function makeThing(): Thing;
export const viaTokenof = tokenof(makeThing);
export const viaTokenfor = tokenfor(makeThing);
`
	prog, app := buildNameofWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerNameof(t, prog, app)
	rawTok := nameofToken(t, out, "viaTokenof")
	producedTok := nameofToken(t, out, "viaTokenfor")

	if !strings.HasSuffix(rawTok, ":makeThing") {
		t.Fatalf("tokenof(makeThing) should derive the function's OWN type token …:makeThing, got %q", rawTok)
	}
	if !strings.HasSuffix(producedTok, ":Thing") {
		t.Fatalf("tokenfor(makeThing) should unwrap to the return-type token …:Thing, got %q", producedTok)
	}
	if rawTok == producedTok {
		t.Fatalf("tokenof (raw) and tokenfor (produced) must diverge for a callable value: both %q", rawTok)
	}
	// The now-unreferenced tokenof/tokenfor imports are both elided.
	if strings.Contains(out, "import {") {
		t.Fatalf("the now-unreferenced value-token imports should be elided:\n%s", out)
	}
}

// TestValueArgUnderivableReportsDiagnostic is the FINDING-2 failure-path proof
// (constraint 9): a value-argument token call whose argument has an ANONYMOUS
// (unnameable) type cannot derive a token, so the stage reports a targeted
// diagnostic naming the problem and leaves the call UN-lowered — never silently
// emits the empty token "". It runs for BOTH value primitives (tokenof's raw path
// and tokenfor's produced path), which share the lowerValueArg failure handling.
func TestValueArgUnderivableReportsDiagnostic(t *testing.T) {
	for _, prim := range []string{"tokenof", "tokenfor"} {
		t.Run(prim, func(t *testing.T) {
			src := "import { " + prim + " } from '@rhombus-std/di.core';\n" +
				"export const bad = " + prim + "({ a: 1 });\n"
			prog, app := buildNameofWorkspace(t, src)
			defer func() { _ = prog.Close() }()

			ctx := plugin.NewContext(prog, app)
			var diags []plugin.Diagnostic
			transform := New(prog, ctx, nil, func(d plugin.Diagnostic) { diags = append(diags, d) })
			ec := shimprinter.NewEmitContext()
			out := reprint(ec, transform(ec, mainSF(t, prog)))

			if len(diags) != 1 {
				t.Fatalf("%s: expected exactly one underivable-value diagnostic, got %d: %+v", prim, len(diags), diags)
			}
			if diags[0].Code != valueArgUnderivableCode {
				t.Fatalf("%s: diagnostic code: got %q want %q", prim, diags[0].Code, valueArgUnderivableCode)
			}
			if diags[0].File == "" {
				t.Fatalf("%s: diagnostic should name the source file, got empty File", prim)
			}
			if strings.Contains(out, `const bad = ""`) {
				t.Fatalf("%s: underivable value must NOT lower to the empty token:\n%s", prim, out)
			}
			if !strings.Contains(out, prim+"(") {
				t.Fatalf("%s: the underivable value call should survive un-lowered:\n%s", prim, out)
			}
		})
	}
}
