// Package inlinetransform's stage.go wires the resolved entries into a per-file
// FileTransform: it collects the workspace's publish-list entries, resolves each
// against the consumer program, and at every matching call site substitutes the
// sugar body, registering the synthetic primitive calls the downstream nameof
// stage lowers. It runs FIRST in ttsc-std's canonical order.
package inlinetransform

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// matchTarget is a declaration node's inline plan: the sugar body plus the
// resolved entry it came from.
type matchTarget struct {
	resolved *Resolved
	body     *ResolvedBody
}

// Build constructs the inline FileTransform. It runs the collector against cwd,
// resolves every entry, populates artifacts, and returns a transform that
// inlines matched calls. A zero-entry / all-inert program yields a no-op
// transform and leaves artifacts inactive. Any resolution error is reported
// through emit and aborts (returns a no-op transform) — the host treats an
// error-category diagnostic as a hard failure.
func Build(prog *driver.Program, cwd string, artifacts *Artifacts, emit func(plugin.Diagnostic)) plugin.FileTransform {
	noop := func(_ *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile { return sf }

	owned, err := Collect(cwd)
	if err != nil {
		emit(plugin.Diagnostic{Code: "INLINE_COLLECT", Message: err.Error()})
		return noop
	}

	checker := prog.Checker
	ex := newBodyExtractor()

	inlineByDecl := map[*shimast.Node]*matchTarget{}
	var resolvedList []*Resolved
	for _, oe := range owned {
		resolved, inert, rerr := Resolve(prog, checker, ex, oe)
		if rerr != nil {
			emit(plugin.Diagnostic{Code: "INLINE_RESOLVE", Message: rerr.Error()})
			return noop
		}
		if inert {
			continue
		}
		resolvedList = append(resolvedList, resolved)
		for decl, body := range resolved.DeclMap {
			inlineByDecl[decl] = &matchTarget{resolved: resolved, body: body}
		}
		if resolved.Kind == KindFunction {
			artifacts.SugarFunctions[resolved.Member] = resolved.Module
		} else {
			artifacts.SugarMembers[resolved.Member] = MemberShape{
				TypeArgCount:  resolved.Body.Discriminator.TypeParamCount,
				ValueArgCount: len(resolved.Body.Params),
			}
		}
	}

	if len(inlineByDecl) == 0 {
		return noop
	}
	artifacts.Active = true

	memberNames := map[string]bool{}
	functionNames := map[string]bool{}
	for _, r := range resolvedList {
		if r.Kind == KindFunction {
			functionNames[r.Member] = true
		} else {
			memberNames[r.Member] = true
		}
	}

	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		st := &fileState{
			ec:            ec,
			checker:       checker,
			artifacts:     artifacts,
			inlineByDecl:  inlineByDecl,
			resolvedList:  resolvedList,
			memberNames:   memberNames,
			functionNames: functionNames,
			emit:          emit,
		}
		return st.run(sf)
	}
}

// fileState carries the per-file inline pass state.
type fileState struct {
	ec            *shimprinter.EmitContext
	checker       *shimchecker.Checker
	artifacts     *Artifacts
	inlineByDecl  map[*shimast.Node]*matchTarget
	resolvedList  []*Resolved
	memberNames   map[string]bool
	functionNames map[string]bool
	emit          func(plugin.Diagnostic)
	temps         []*shimast.Node // temps needing a hoisted `var` declaration
	elideFns      map[string]bool // free-function local names now unreferenced
}

func (st *fileState) run(sf *shimast.SourceFile) *shimast.SourceFile {
	st.elideFns = map[string]bool{}
	var visitor *shimast.NodeVisitor
	visit := func(node *shimast.Node) *shimast.Node {
		if node == nil {
			return nil
		}
		if node.Kind == shimast.KindCallExpression {
			if replaced, ok := st.tryInline(node); ok {
				return replaced
			}
		}
		return visitor.VisitEachChild(node)
	}
	visitor = st.ec.NewNodeVisitor(visit)
	out := visitor.VisitNode(sf.AsNode())
	if out == nil {
		return sf
	}
	result := out.AsSourceFile()
	result = st.hoistTemps(result)
	result = st.elideFunctionImports(result)
	return result
}

// tryInline attempts to inline one call. It returns (replacement, true) when the
// call matched a sugar declaration; (nil, false) otherwise (a passthrough or
// stranger — the caller keeps visiting children).
func (st *fileState) tryInline(node *shimast.Node) (*shimast.Node, bool) {
	call := node.AsCallExpression()
	callee := call.Expression

	// Name pre-filter: a property-access callee whose name is a member-sugar name,
	// or an identifier callee whose text is a free-function name.
	memberCandidate := false
	var calleeName string
	switch callee.Kind {
	case shimast.KindPropertyAccessExpression:
		calleeName = callee.AsPropertyAccessExpression().Name().Text()
		memberCandidate = st.memberNames[calleeName]
	case shimast.KindIdentifier:
		calleeName = callee.Text()
		memberCandidate = st.functionNames[calleeName]
	}
	if !memberCandidate {
		return nil, false
	}

	decl := resolvedDeclaration(st.checker, node)
	if decl == nil {
		return nil, false
	}
	target := st.inlineByDecl[decl]
	if target == nil {
		// The call bound to a declaration outside every entry's mapped set. If it
		// is provably the same logical member on a duplicate copy, that is the
		// rogue-duplicate tripwire; otherwise a stranger — skip silently.
		if st.isRogueDuplicate(decl, calleeName) {
			st.emit(plugin.Diagnostic{
				Code:    "INLINE_ROGUE_DUPLICATE",
				File:    nodeFile(node),
				Start:   node.Pos(),
				Message: fmt.Sprintf("call to %q resolved to a declaration outside the merged symbol for the inline entry — the program contains a duplicate copy of this interface (dist skew / two physical package copies)", calleeName),
			})
		}
		return nil, false
	}

	replacement, ok := st.inlineCall(node, target)
	if !ok {
		return nil, false
	}
	return replacement, true
}

// inlineCall performs the substitution for a matched call.
func (st *fileState) inlineCall(node *shimast.Node, target *matchTarget) (*shimast.Node, bool) {
	call := node.AsCallExpression()
	body := target.body

	// Bind impl type params to the checker types at THIS call site (explicit or
	// inferred), for the primitive-call registration.
	var env map[string]*shimchecker.Type
	if len(body.TypeParams) > 0 {
		types, ok := RecoverTypeArguments(st.checker, node)
		if !ok || len(types) < len(body.TypeParams) {
			st.emit(plugin.Diagnostic{
				Code:    "INLINE_INFERRED_TYPE_ARGUMENT",
				File:    nodeFile(node),
				Start:   node.Pos(),
				Message: "cannot bind the sugar's type argument — write the type argument explicitly",
			})
			return nil, false
		}
		env = map[string]*shimchecker.Type{}
		for i, tp := range body.TypeParams {
			env[tp] = types[i]
		}
	}

	in := Inlining{
		Body:   body.Body,
		Params: strippedParamNames(body.Params),
		Args:   callArguments(call),
	}
	if target.resolved.Kind != KindFunction {
		in.Receiver = call.Expression.AsPropertyAccessExpression().Expression
	} else {
		st.elideFns[target.resolved.Member] = true
	}

	res := Substitute(st.ec, in)
	if res.NeedsTempHoist && res.Temp != nil {
		st.temps = append(st.temps, res.Temp)
	}

	st.registerPrimitives(res.Expr, body, env)
	return wrapForPrecedence(st.ec, res.Expr), true
}

// registerPrimitives walks a substituted expression and records every primitive
// call (a call whose identifier callee is one of the body's primitive imports)
// in artifacts, binding its type arguments to the checker types captured at the
// original call. The nameof stage reads these to lower a call it cannot anchor.
func (st *fileState) registerPrimitives(expr *shimast.Node, body *ResolvedBody, env map[string]*shimchecker.Type) {
	walk(expr, func(n *shimast.Node) bool {
		if n.Kind != shimast.KindCallExpression {
			return false
		}
		callee := n.AsCallExpression().Expression
		if callee.Kind != shimast.KindIdentifier {
			return false
		}
		prim, ok := body.PrimitiveImports[callee.Text()]
		if !ok {
			return false
		}
		typeArgs := n.AsCallExpression().TypeArguments
		bound := []*shimchecker.Type{}
		if typeArgs != nil {
			for _, ta := range typeArgs.Nodes {
				if ta.Kind == shimast.KindTypeReference {
					if name := ta.AsTypeReferenceNode().TypeName; name != nil && name.Kind == shimast.KindIdentifier {
						if t, has := env[name.Text()]; has {
							bound = append(bound, t)
						}
					}
				}
			}
		}
		use := PrimitiveUse{Name: prim, TypeArgs: bound}
		// A VALUE-argument primitive (signatureof(ctor)) records its spliced
		// argument node — the ORIGINAL call-site expression, still program-bound,
		// so the signatureof stage can checker-query it. A TYPE-argument primitive
		// (nameof<T>()) has no value argument and leaves this nil.
		if args := n.AsCallExpression().Arguments; args != nil && len(args.Nodes) == 1 {
			use.ValueArg = args.Nodes[0]
		}
		st.artifacts.PrimitiveCalls[n] = use
		return false
	})
}

// isRogueDuplicate reports whether decl is provably the same logical member as an
// entry (same TypeName inside a declare-module block for the entry's package, or
// in a file under a package of that name) but outside the merged symbol — the
// dist-skew tripwire. Reading names here is diagnostic-only; matching never
// depends on it.
func (st *fileState) isRogueDuplicate(decl *shimast.Node, calleeName string) bool {
	// A declaration that belongs to a resolved entry's merged member symbol is a
	// legitimate sibling, never a duplicate copy: this repo's standard
	// OPEN-receiver pattern declares a member's non-sugar overload in a
	// `declare module` augmentation, which TS merges into the same member symbol.
	// Such an overload lives in a declare-module block for the entry's package and
	// shares its TypeName, so it would otherwise trip the provenance heuristic
	// below. Only a declaration OUTSIDE every merged set can be a dist-skew rogue,
	// so clear the merged declarations first.
	for _, r := range st.resolvedList {
		if r.MemberSet[decl] {
			return false
		}
	}
	for _, r := range st.resolvedList {
		if r.Member != calleeName {
			continue
		}
		if enclosingInterfaceName(decl) != r.TypeName {
			continue
		}
		if inDeclareModuleFor(decl, r.Module) {
			return true
		}
	}
	return false
}

// hoistTemps prepends a `var <temp>;` declaration for every single-eval temp the
// pass minted. Spec §6d wants enclosing-function scope; this pass hoists to file
// scope (a module-level `var` — correct for the non-reentrant expression-temp
// case), a documented simplification flagged for follow-up.
func (st *fileState) hoistTemps(sf *shimast.SourceFile) *shimast.SourceFile {
	if len(st.temps) == 0 {
		return sf
	}
	factory := st.ec.Factory.AsNodeFactory()
	decls := make([]*shimast.Node, 0, len(st.temps))
	for _, temp := range st.temps {
		vd := factory.NewVariableDeclaration(temp, nil, nil, nil)
		list := factory.NewVariableDeclarationList(factory.NewNodeList([]*shimast.Node{vd}), shimast.NodeFlagsNone)
		decls = append(decls, factory.NewVariableStatement(nil, list))
	}
	merged := append(decls, sf.Statements.Nodes...)
	return factory.UpdateSourceFile(sf, factory.NewNodeList(merged), sf.EndOfFileToken).AsSourceFile()
}

// elideFunctionImports drops now-unreferenced imports of inlined free functions.
func (st *fileState) elideFunctionImports(sf *shimast.SourceFile) *shimast.SourceFile {
	if len(st.elideFns) == 0 {
		return sf
	}
	factory := st.ec.Factory.AsNodeFactory()
	kept := make([]*shimast.Node, 0, len(sf.Statements.Nodes))
	changed := false
	for _, stmt := range sf.Statements.Nodes {
		next := elideNamedImport(factory, stmt, st.elideFns)
		if next == nil {
			changed = true
			continue
		}
		if next != stmt {
			changed = true
		}
		kept = append(kept, next)
	}
	if !changed {
		return sf
	}
	return factory.UpdateSourceFile(sf, factory.NewNodeList(kept), sf.EndOfFileToken).AsSourceFile()
}

// strippedParamNames removes the rest-parameter "..." encoding prefix so the
// substitution matches identifiers by their bare name.
func strippedParamNames(params []string) []string {
	out := make([]string, len(params))
	for i, p := range params {
		if len(p) > 3 && p[:3] == "..." {
			out[i] = p[3:]
		} else {
			out[i] = p
		}
	}
	return out
}

// callArguments returns a call's argument expression nodes.
func callArguments(call *shimast.CallExpression) []*shimast.Node {
	if call.Arguments == nil {
		return nil
	}
	return call.Arguments.Nodes
}

// wrapForPrecedence parenthesizes a substituted root when it is not already a
// self-delimiting expression form, so it splices safely into any context.
func wrapForPrecedence(ec *shimprinter.EmitContext, expr *shimast.Node) *shimast.Node {
	switch expr.Kind {
	case shimast.KindCallExpression, shimast.KindPropertyAccessExpression,
		shimast.KindElementAccessExpression, shimast.KindIdentifier,
		shimast.KindParenthesizedExpression, shimast.KindStringLiteral,
		shimast.KindNumericLiteral, shimast.KindTrueKeyword, shimast.KindFalseKeyword,
		shimast.KindNullKeyword, shimast.KindThisKeyword:
		return expr
	}
	return ec.Factory.AsNodeFactory().NewParenthesizedExpression(expr)
}
