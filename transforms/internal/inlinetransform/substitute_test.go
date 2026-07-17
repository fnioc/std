package inlinetransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
)

// parse builds a source file AST from text via SideParse — the same side-parse
// the inliner runs against a declaring package. It routes through an ABSOLUTE
// filename: shim's parser derives a canonical Path from the filename, and a
// non-absolute name yields an empty Path that panics NewSourceFile.
func parse(t *testing.T, name, text string) *shimast.SourceFile {
	t.Helper()
	if !filepath.IsAbs(name) {
		name = "/" + name
	}
	sf := SideParse(name, text)
	if sf == nil {
		t.Fatalf("parse %s returned nil", name)
	}
	return sf
}

// reprint runs the exact emit pipeline plugin/host.go's transformFileToTypeScript
// uses: fix up parent pointers on the mixed original/synthetic tree, then print
// through a fresh TextWriter + Printer bound to the same EmitContext. This is the
// assertion surface — if substitution corrupted positions or produced an
// unprintable node shape, this panics or garbles.
func reprint(ec *shimprinter.EmitContext, sf *shimast.SourceFile) string {
	shimast.SetParentInChildrenUnset(sf.AsNode())
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(sf.AsNode(), sf, writer, nil)
	return writer.String()
}

// findCall returns the first call expression whose callee is a property access
// naming member, along with its receiver and argument expressions.
func findCall(t *testing.T, sf *shimast.SourceFile, member string) (call, receiver *shimast.Node, args []*shimast.Node) {
	t.Helper()
	var walk func(n *shimast.Node)
	walk = func(n *shimast.Node) {
		if n == nil || call != nil {
			return
		}
		if n.Kind == shimast.KindCallExpression {
			callee := n.AsCallExpression().Expression
			if callee.Kind == shimast.KindPropertyAccessExpression && callee.Name().Text() == member {
				call = n
				receiver = callee.AsPropertyAccessExpression().Expression
				if list := n.AsCallExpression().Arguments; list != nil {
					args = list.Nodes
				}
				return
			}
		}
		n.ForEachChild(func(child *shimast.Node) bool {
			walk(child)
			return call != nil
		})
	}
	walk(sf.AsNode())
	if call == nil {
		t.Fatalf("no call to .%s() found", member)
	}
	return call, receiver, args
}

// returnExpr returns the first return statement's expression in sf.
func returnExpr(t *testing.T, sf *shimast.SourceFile) *shimast.Node {
	t.Helper()
	var found *shimast.Node
	var walk func(n *shimast.Node)
	walk = func(n *shimast.Node) {
		if n == nil || found != nil {
			return
		}
		if n.Kind == shimast.KindReturnStatement {
			found = n.AsReturnStatement().Expression
			return
		}
		n.ForEachChild(func(child *shimast.Node) bool {
			walk(child)
			return found != nil
		})
	}
	walk(sf.AsNode())
	if found == nil {
		t.Fatal("no return statement found")
	}
	return found
}

// splice replaces target (matched by identity) with replacement across sf,
// returning the rewritten source file.
func splice(ec *shimprinter.EmitContext, sf *shimast.SourceFile, target, replacement *shimast.Node) *shimast.SourceFile {
	var visitor *shimast.NodeVisitor
	visit := func(node *shimast.Node) *shimast.Node {
		if node == target {
			return replacement
		}
		return visitor.VisitEachChild(node)
	}
	visitor = ec.NewNodeVisitor(visit)
	return visitor.VisitNode(sf.AsNode()).AsSourceFile()
}

// TestSubstituteInterfaceMember inlines an interface-member sugar body over a
// simple receiver with one `this` and one value parameter — the pilot shape
// (`return this.<primitive>(param)`). It asserts the reprint pipeline emits the
// substituted primitive call, drops the sugar call, leaves surrounding code
// intact, and produces output that re-parses cleanly.
func TestSubstituteInterfaceMember(t *testing.T) {
	ec := shimprinter.NewEmitContext()

	decl := parse(t, "declaring.ts", `
export function query(key: string) {
	return this.isService(key);
}
`)
	body := returnExpr(t, decl)

	consumer := parse(t, "consumer.ts", `
const before = 1;
const answer = reg.query(k);
const after = 2;
`)
	call, receiver, args := findCall(t, consumer, "query")

	res := Substitute(ec, Inlining{
		Body:     body,
		Receiver: receiver,
		Params:   []string{"key"},
		Args:     args,
	})
	if res.NeedsTempHoist {
		t.Fatalf("simple receiver, single `this`: expected no temp hoist")
	}

	out := reprint(ec, splice(ec, consumer, call, res.Expr))

	if !strings.Contains(out, "reg.isService(k)") {
		t.Errorf("expected inlined primitive call `reg.isService(k)`, got:\n%s", out)
	}
	if strings.Contains(out, "query") {
		t.Errorf("sugar call `.query` should be gone, got:\n%s", out)
	}
	for _, marker := range []string{"before", "after"} {
		if !strings.Contains(out, marker) {
			t.Errorf("surrounding statement %q was corrupted, got:\n%s", marker, out)
		}
	}
	// The output must be valid syntax again.
	reparsed := parse(t, "out.ts", out)
	if len(reparsed.Statements.Nodes) != 3 {
		t.Errorf("expected 3 top-level statements after reprint, got %d:\n%s", len(reparsed.Statements.Nodes), out)
	}
}

// TestSubstituteFreeFunction inlines a free-function body (no receiver): only the
// value parameter is substituted.
func TestSubstituteFreeFunction(t *testing.T) {
	ec := shimprinter.NewEmitContext()

	decl := parse(t, "declaring.ts", `
export function twice(n: number) {
	return n + n;
}
`)
	body := returnExpr(t, decl)

	consumer := parse(t, "consumer.ts", `
const answer = wrap.twice(value);
`)
	call, _, args := findCall(t, consumer, "twice")

	res := Substitute(ec, Inlining{
		Body:   body,
		Params: []string{"n"},
		Args:   args,
	})
	out := reprint(ec, splice(ec, consumer, call, res.Expr))

	if !strings.Contains(out, "value + value") {
		t.Errorf("expected free-function body `value + value`, got:\n%s", out)
	}
	parse(t, "out.ts", out) // must re-parse without panic
}

// TestSubstituteEffectfulReceiverSingleEval drives the single-evaluation temp
// mechanism: an effectful receiver (`makeReg()`) whose body reads `this` twice.
// The receiver must run exactly once, so the mechanism binds it to a temp in
// expression position (a parenthesized comma sequence) and references the temp
// at both `this` sites. It then drives the accompanying variable-environment
// hoist so the emitted output is valid TypeScript, and asserts the reprint
// declares the temp and references it.
func TestSubstituteEffectfulReceiverSingleEval(t *testing.T) {
	ec := shimprinter.NewEmitContext()

	decl := parse(t, "declaring.ts", `
export function combined(k: string) {
	return this.first(k) + this.second(k);
}
`)
	body := returnExpr(t, decl)

	consumer := parse(t, "consumer.ts", `
const before = 1;
const answer = makeReg().combined(k);
const after = 2;
`)
	call, receiver, args := findCall(t, consumer, "combined")
	if isSimpleReceiver(receiver) {
		t.Fatalf("makeReg() should be classified effectful (non-simple)")
	}

	res := Substitute(ec, Inlining{
		Body:     body,
		Receiver: receiver,
		Params:   []string{"k"},
		Args:     args,
	})
	if !res.NeedsTempHoist || res.Temp == nil {
		t.Fatalf("effectful receiver with two `this` uses must request a temp hoist; got NeedsTempHoist=%v temp=%v", res.NeedsTempHoist, res.Temp)
	}

	// The receiver expression must appear exactly once in the substituted output
	// (single evaluation), inside the assignment to the temp.
	rewritten := splice(ec, consumer, call, res.Expr)

	// Drive the hoist: register the temp with the enclosing variable environment
	// and prepend the resulting `var` declaration(s) so the emit is well-formed.
	ec.StartVariableEnvironment()
	ec.AddVariableDeclaration(res.Temp)
	decls := ec.EndVariableEnvironment()
	if len(decls) == 0 {
		t.Fatalf("AddVariableDeclaration produced no hoisted statements")
	}
	factory := ec.Factory.AsNodeFactory()
	merged := append(append([]*shimast.Node{}, decls...), rewritten.Statements.Nodes...)
	withHoist := factory.UpdateSourceFile(rewritten, factory.NewNodeList(merged), rewritten.EndOfFileToken).AsSourceFile()

	out := reprint(ec, withHoist)

	if strings.Count(out, "makeReg()") != 1 {
		t.Errorf("receiver `makeReg()` must be evaluated exactly once, found %d occurrences:\n%s", strings.Count(out, "makeReg()"), out)
	}
	if !strings.Contains(out, "var ") {
		t.Errorf("expected a hoisted `var` temp declaration, got:\n%s", out)
	}
	if !strings.Contains(out, ".first(k)") || !strings.Contains(out, ".second(k)") {
		t.Errorf("expected both primitive calls inlined, got:\n%s", out)
	}
	for _, marker := range []string{"before", "after"} {
		if !strings.Contains(out, marker) {
			t.Errorf("surrounding statement %q was corrupted, got:\n%s", marker, out)
		}
	}
	// Valid syntax again: before + var-hoist + two consts + after.
	reparsed := parse(t, "out.ts", out)
	if len(reparsed.Statements.Nodes) == 0 {
		t.Errorf("reprint produced no statements:\n%s", out)
	}
}
