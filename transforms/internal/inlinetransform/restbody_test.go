package inlinetransform

import (
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// substituteBody runs Substitute over a parsed body and call fixture, returning
// the reprinted output. bodySrc must contain a function whose single return is
// the body; callSrc must contain the call to member.
func substituteBody(t *testing.T, bodySrc, callSrc, member string, params []string, groupsFor func(args []*shimast.Node) (named []*shimast.Node, groups map[string][]*shimast.Node)) string {
	t.Helper()
	bodySF := parse(t, "body.ts", bodySrc)
	callSF := parse(t, "call.ts", callSrc)
	body := returnExpr(t, bodySF)
	call, receiver, args := findCall(t, callSF, member)

	named, groups := groupsFor(args)
	ec := shimprinter.NewEmitContext()
	res := Substitute(ec, Inlining{
		Body:     body,
		Receiver: receiver,
		Params:   params,
		Args:     named,
		Groups:   groups,
	})
	return reprint(ec, splice(ec, callSF, call, res.Expr))
}

// TestSubstituteSplicesRestGroupSpreadCall: the spread call form —
// `(this.add as any)(typefor<T>(), ...args)` — collapses the assertion and
// splices the group, emitting the direct call a hand author writes.
func TestSubstituteSplicesRestGroupSpreadCall(t *testing.T) {
	out := substituteBody(t,
		`function add(this: any, ...args: any[]) { return (this.add as any)(token(), ...args); }`,
		`manifest.add(Greeter, ctorType, 'scoped');`,
		"add", nil,
		func(args []*shimast.Node) ([]*shimast.Node, map[string][]*shimast.Node) {
			return nil, map[string][]*shimast.Node{"args": args, "arguments": args}
		})
	if !strings.Contains(out, "manifest.add(token(), Greeter, ctorType, 'scoped')") {
		t.Errorf("spread-call splice: got\n%s", out)
	}
}

// TestSubstituteSplicesArgumentsApplyForm: the `.apply` form —
// `this.add.apply(this, [token(), ...arguments])` — collapses the array,
// splices the whole argument set, and writes the receiver exactly once.
func TestSubstituteSplicesArgumentsApplyForm(t *testing.T) {
	out := substituteBody(t,
		`function tryAdd(this: any) { return this.tryAdd.apply(this, [token(), ...arguments] as any); }`,
		`make().tryAdd(Greeter, ctorType);`,
		"tryAdd", nil,
		func(args []*shimast.Node) ([]*shimast.Node, map[string][]*shimast.Node) {
			return nil, map[string][]*shimast.Node{"arguments": args}
		})
	if !strings.Contains(out, "make().tryAdd(token(), Greeter, ctorType)") {
		t.Errorf(".apply splice: got\n%s", out)
	}
	if strings.Contains(out, "apply") {
		t.Errorf("the .apply call form must normalize away:\n%s", out)
	}
	if strings.Count(out, "make()") != 1 {
		t.Errorf("the receiver must be written exactly once:\n%s", out)
	}
}

// TestSubstituteSplicesEmptyGroup: a zero-argument call splices an empty group
// and needs no special case.
func TestSubstituteSplicesEmptyGroup(t *testing.T) {
	out := substituteBody(t,
		`function removeAll(this: any) { return this.removeAll.apply(this, [token(), ...arguments] as any); }`,
		`manifest.removeAll();`,
		"removeAll", nil,
		func(args []*shimast.Node) ([]*shimast.Node, map[string][]*shimast.Node) {
			return nil, map[string][]*shimast.Node{"arguments": args}
		})
	if !strings.Contains(out, "manifest.removeAll(token())") {
		t.Errorf("empty-group splice: got\n%s", out)
	}
}

// TestSubstituteReordersNamedLeadAndGroup: leading named parameters keep
// binding positionally, so a body may reorder and interleave them around the
// group — `asdf(a, b, ...c)` forwarding `this.qwer(b, ...c, a)`.
func TestSubstituteReordersNamedLeadAndGroup(t *testing.T) {
	out := substituteBody(t,
		`function asdf(this: any, a: any, b: any, ...c: any[]) { return this.qwer(b, ...c, a); }`,
		`x.asdf(q, w, e, d, f);`,
		"asdf", []string{"a", "b"},
		func(args []*shimast.Node) ([]*shimast.Node, map[string][]*shimast.Node) {
			return args[:2], map[string][]*shimast.Node{"c": args[2:], "arguments": args}
		})
	if !strings.Contains(out, "x.qwer(w, e, d, f, q)") {
		t.Errorf("reorder splice: got\n%s", out)
	}
}

// TestRestShapeUnboundedInSweep: a trailing rest makes the accepted argument
// count unbounded while the leading named parameters stay required.
func TestRestShapeUnboundedInSweep(t *testing.T) {
	shape := MemberShape{TypeArgCount: 1, MinValueArgCount: 2, MaxValueArgCount: 3, Unbounded: true}
	if sugarShapeMatches(shape, 1, 1) {
		t.Error("an argument count below the required lead must not match")
	}
	for _, n := range []int{2, 3, 7} {
		if !sugarShapeMatches(shape, 1, n) {
			t.Errorf("%d arguments must match an unbounded shape", n)
		}
	}
	if sugarShapeMatches(MemberShape{TypeArgCount: 1, MinValueArgCount: 2, MaxValueArgCount: 3}, 1, 7) {
		t.Error("a bounded shape must keep its upper bound")
	}
}

// TestAssignBodiesFaceWithoutBodyDiagnosed: a publisher-owned face whose
// signature no body spells — and no rest body blankets — is a hard error at
// resolution, never a silent runtime death.
func TestAssignBodiesFaceWithoutBodyDiagnosed(t *testing.T) {
	inlineBody := `import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IQuery } from '@scope/core';
export namespace QueryInline {
  export function isService<T>(this: IQuery, other: string): boolean {
    return this.isService(tokenfor<T>(), other);
  }
}
`
	mainSrc := `import { provider } from '@scope/core';
export const x = provider;
`
	prog, app := buildWorkspace(t, declaredFaceCoreIndex, inlineBody, declaredFaceSugarDTS, mainSrc)
	defer func() { _ = prog.Close() }()

	var diags []plugin.Diagnostic
	Build(prog, bodiesFor(t, app), NewArtifacts(), func(d plugin.Diagnostic) { diags = append(diags, d) })

	foundFace, foundBody := false, false
	for _, d := range diags {
		if d.Code == "INLINE_FACE_WITHOUT_BODY" {
			foundFace = true
		}
		if d.Code == "INLINE_BODY_WITHOUT_FACE" {
			foundBody = true
		}
	}
	if !foundFace {
		t.Errorf("want INLINE_FACE_WITHOUT_BODY for the publisher face the body does not spell, got %+v", diags)
	}
	if !foundBody {
		t.Errorf("want INLINE_BODY_WITHOUT_FACE for the body no face declares, got %+v", diags)
	}
}
