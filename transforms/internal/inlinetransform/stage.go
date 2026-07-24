// Package inlinetransform's stage.go wires the resolved entries into a per-file
// FileTransform: it collects the workspace's publish-list entries, resolves each
// against the consumer program, and at every matching call site substitutes the
// sugar body, registering the synthetic primitive calls the downstream nameof
// stage lowers. It runs FIRST in ttsc-std's canonical order.
package inlinetransform

import (
	"fmt"
	"sort"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// matchTarget is a declaration node's inline plan: the sugar body plus the
// resolved entry it came from.
type matchTarget struct {
	resolved *Resolved
	body     *ResolvedBody
}

// Build constructs the inline FileTransform from the project scan's pre-collected
// body entries. The host runs ONE dependency scan for stages AND bodies (§100)
// and threads `owned` here, so the walk never runs twice. It resolves every entry,
// populates artifacts, and returns a transform that inlines matched calls. A
// zero-entry / all-inert program yields a no-op transform and leaves artifacts
// inactive. Any resolution error is reported through emit and aborts (returns a
// no-op transform) — the host treats an error-category diagnostic as a hard
// failure.
func Build(prog *driver.Program, owned []OwnedEntry, artifacts *Artifacts, emit func(plugin.Diagnostic)) plugin.FileTransform {
	noop := func(_ *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile { return sf }

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
	// runtimeCallees collects the (module, export) of every RUNTIME callee a
	// substituted body referenced in this file (§99 `overrideSignatures`), so their
	// imports are materialized once after the pass.
	runtimeCallees map[valueimport.Ref]bool
}

func (st *fileState) run(sf *shimast.SourceFile) *shimast.SourceFile {
	st.elideFns = map[string]bool{}
	st.runtimeCallees = map[valueimport.Ref]bool{}
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
	result = st.materializeRuntimeCallees(result)
	return result
}

// materializeRuntimeCallees injects an import for every RUNTIME callee a
// substituted body referenced in this file (§99 `overrideSignatures`), reusing an
// existing binding when present. It returns sf unchanged when nothing was recorded
// (or every callee was already imported), preserving the loop's pointer identity.
// Refs are ordered deterministically so the injected import order is stable.
func (st *fileState) materializeRuntimeCallees(sf *shimast.SourceFile) *shimast.SourceFile {
	if len(st.runtimeCallees) == 0 {
		return sf
	}
	refs := make([]valueimport.Ref, 0, len(st.runtimeCallees))
	for ref := range st.runtimeCallees {
		refs = append(refs, ref)
	}
	sort.Slice(refs, func(i, j int) bool {
		if refs[i].Module != refs[j].Module {
			return refs[i].Module < refs[j].Module
		}
		return refs[i].Export < refs[j].Export
	})
	factory := st.ec.Factory.AsNodeFactory()
	bindings := make([]*valueimport.Binding, 0, len(refs))
	for _, ref := range refs {
		binding := valueimport.Resolve(sf, ref)
		binding.Used = true
		bindings = append(bindings, binding)
	}
	return valueimport.Ensure(factory, sf, bindings...)
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

	// Synthetic-node clean-skip guard. A call a PRIOR pass produced by lowering a
	// sugar chain is never itself a source-written inline candidate — its sugar was
	// already substituted — so it must not be re-matched. The concrete defect (W2
	// repro): `.withSignature<[]>()` lowers to the zero-argument `.withSignature()`
	// (the empty tuple makes `...signaturefor<[]>()` spread nothing); a later pass
	// then re-visits that call, binds it to the zero-value-arg sugar overload, and
	// RecoverTypeArguments fails with no type argument to recover — a spurious
	// INLINE_INFERRED_TYPE_ARGUMENT that fails the build despite a byte-correct emit.
	//
	// The synthetic marker is on the CALL EXPRESSION, not its callee. Substitute
	// DeepCloneNodes the sugar body, which PRESERVES the cloned nodes' original
	// positions, so the substituted `this.withSignature` property-access callee
	// keeps a (foreign, body-file) Pos >= 0 — a callee-only Pos guard never fires
	// (empirically observed: calleePos=463, callPos=-1). It is the CALL node that a
	// downstream stage rebuilds fresh when it elides the spread, giving it Pos < 0.
	// resolvedDeclaration feeds THIS node to checker.GetResolvedSignature, so guard
	// it here, BEFORE that query, exactly as nameof/resolve guard the node they hand
	// the checker. (Parent is re-linked every pass by RunToFixedPoint's
	// SetParentInChildrenUnset, so the Pos check is the load-bearing half; the nil
	// check stays as a defensive backstop for an unlinked node.)
	if node.Pos() < 0 || node.Parent == nil {
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
	// A matched body always references its runtime callees (single-expression form),
	// so record them for import materialization once the pass completes.
	for _, ref := range target.body.RuntimeCallees {
		st.runtimeCallees[ref] = true
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
		// A keyed sugar (`addClass<Keyed<T, K>>(Impl)`) now inlines like any other (§98):
		// the body's `nameof<T>()` derives the BASE token (ServiceBaseTokenFor strips
		// the brand) and its trailing `keyof<T>()` derives the KEY, composed at
		// runtime as `base#key` — the same token the di direct stage derives via
		// KeyedTokenFor. The #244 fence that left keyed calls for the direct path is
		// retired; an UNKEYED call instead elides its trailing keyof argument below,
		// keeping the lowered output byte-identical to the pre-keyof form.
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

	// Instantiation-expression VALUE parity: an open-template impl argument
	// (`addClass<IRepo<$<1>>>(ThingRepo<$<1>>)`) is an ExpressionWithTypeArguments the
	// body splices into the value slot verbatim. The di direct stage registers the
	// BARE constructor expression (`ThingRepo`) — an instantiation expression's type
	// arguments are type-level and carry no runtime value — so strip them here too,
	// keeping the lowered call byte-identical to the oracle at the TS level (not only
	// after a downstream TS->JS type-strip).
	res.Expr = st.normalizeInstantiationArgs(res.Expr)

	// Byte-parity elision: an UNKEYED registration drops the `keyof<T>()` argument
	// (and the placeholder slots it leaves trailing) so the lowered call is
	// identical to the plain 3-argument registration form. Done BEFORE
	// registerPrimitives so a dropped keyof is never registered for the keyof
	// stage; a KEYED call keeps it, and the stage lowers it to the key string.
	res.Expr = st.elideUnkeyedKeyArg(res.Expr, body, env)

	st.registerPrimitives(res.Expr, body, env)
	return wrapForPrecedence(st.ec, res.Expr), true
}

// normalizeInstantiationArgs strips the type arguments from an
// ExpressionWithTypeArguments argument of a substituted registration call
// (`ThingRepo<$<1>>` → `ThingRepo`), matching the di direct stage which registers
// the BARE constructor expression via `arg.AsExpressionWithTypeArguments().Expression`.
// An instantiation expression used as a value carries no runtime type arguments, so
// this is a domain-free TS→value normalization, applied only to the OUTER call's
// arguments — the value slot is the only place a registration body splices a
// user-authored expression; the derived token / signature arguments are literals a
// body never spells as an instantiation expression. A substituted resolve body is a
// conditional (not a call) and is left untouched.
func (st *fileState) normalizeInstantiationArgs(expr *shimast.Node) *shimast.Node {
	if expr.Kind != shimast.KindCallExpression {
		return expr
	}
	call := expr.AsCallExpression()
	if call.Arguments == nil {
		return expr
	}
	args := call.Arguments.Nodes
	changed := false
	kept := make([]*shimast.Node, len(args))
	for i, arg := range args {
		if arg.Kind == shimast.KindExpressionWithTypeArguments {
			kept[i] = arg.AsExpressionWithTypeArguments().Expression
			changed = true
			continue
		}
		kept[i] = arg
	}
	if !changed {
		return expr
	}
	factory := st.ec.Factory.AsNodeFactory()
	return factory.NewCallExpression(call.Expression, nil, nil, factory.NewNodeList(kept), 0)
}

// keyofPrimitiveName is the canonical primitive name a `keyof<T>()` import maps to
// (knownPrimitives), matched on a registration argument for elision.
const keyofPrimitiveName = "keyof"

// elideUnkeyedKeyArg drops the `keyof<T>()` argument from a substituted
// registration call when T carries no `Keyed<T, K>` brand, so an UNKEYED lowering
// is byte-identical to the plain form a hand-writer would author
// (`this.addClass(nameof<T>(), ctor, signatureof(ctor))` — no scope, no key). A KEYED
// call keeps the argument exactly where the body placed it; the keyof stage
// lowers it to the key string, which di.core composes at runtime as `base#key`.
//
// THE KEY IS FOUND BY POSITION, NOT BY BEING LAST. di.core's registration verbs
// order their optional slots `(token, value, signatures, scope, key)`, so the key
// sits at argument 5 with the scope slot ahead of it — a type-driven sugar body,
// which has no scope to pass, writes an explicit `void 0` placeholder there. So
// this scans the argument list for the keyof call instead of indexing the tail,
// and after removing it trims the placeholder arguments the removal strands (see
// trimTrailingUndefined). Indexing the tail happens to still find the key in
// TODAY's body shape, but only because the key is the last slot; the moment a
// body passes anything after it, or the elision has to reach past a placeholder,
// the tail assumption breaks.
//
// THE AUTHORED BODY OWNS THE ARGUMENT LAYOUT. This stage never repositions or
// synthesizes an argument: whatever slot the sugar body wrote the `keyof<T>()`
// into is the slot a KEYED registration emits, which is what keeps the lowered
// call equal to the hand-written form. The only edit made here is the unkeyed
// DELETION.
//
// Detection is structural: the substituted outer call carrying an argument that
// is a call to a `keyof` primitive (per the body's import map). The certified
// registration sugars use `this` exactly once with a simple/property receiver, so
// Substitute returns the bare outer call; a non-call root (defensive) is left
// untouched, keeping the keyof arg for the stage to lower to `void 0`.
func (st *fileState) elideUnkeyedKeyArg(expr *shimast.Node, body *ResolvedBody, env map[string]*shimchecker.Type) *shimast.Node {
	// The resolve-family bodies (§94) are a CONDITIONAL, not a bare call:
	// `isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>(), keyof<T>())`.
	// The keyof argument lives in the whenFalse branch (the token-resolve arm the
	// fold keeps for a non-singular T), so descend there and elide from it. The
	// singular whenTrue arm never carries a keyof, and the fold prunes it anyway.
	if expr.Kind == shimast.KindConditionalExpression {
		cond := expr.AsConditionalExpression()
		newWhenFalse := st.elideUnkeyedKeyArg(cond.WhenFalse, body, env)
		if newWhenFalse == cond.WhenFalse {
			return expr
		}
		factory := st.ec.Factory.AsNodeFactory()
		return factory.UpdateConditionalExpression(cond, cond.Condition, cond.QuestionToken, cond.WhenTrue, cond.ColonToken, newWhenFalse)
	}
	if expr.Kind != shimast.KindCallExpression {
		return expr
	}
	call := expr.AsCallExpression()
	if call.Arguments == nil {
		return expr
	}
	args := call.Arguments.Nodes
	index, found := keyArgIndex(args, body)
	if !found {
		return expr
	}
	if st.keyofArgIsKeyed(args[index], env) {
		return expr
	}
	kept := make([]*shimast.Node, 0, len(args))
	kept = append(kept, args[:index]...)
	kept = append(kept, args[index+1:]...)
	kept = trimTrailingUndefined(kept)
	factory := st.ec.Factory.AsNodeFactory()
	return factory.NewCallExpression(call.Expression, nil, nil, factory.NewNodeList(kept), 0)
}

// keyArgIndex returns the position of the `keyof<T>()` argument in a substituted
// registration call's argument list. A registration body writes at most one, so
// the first match wins.
func keyArgIndex(args []*shimast.Node, body *ResolvedBody) (int, bool) {
	for i, arg := range args {
		if arg.Kind != shimast.KindCallExpression {
			continue
		}
		callee := arg.AsCallExpression().Expression
		if callee.Kind != shimast.KindIdentifier {
			continue
		}
		if body.PrimitiveImports[callee.Text()] == keyofPrimitiveName {
			return i, true
		}
	}
	return 0, false
}

// trimTrailingUndefined drops trailing explicit undefined arguments. Removing an
// unkeyed key argument strands the placeholders that were only there to push the
// key into its slot — a body with no scope to pass writes
// `addClass(nameof<T>(), ctor, signatureof(ctor), void 0, keyof<T>())`, and dropping
// only the keyof would leave `addClass(..., void 0)`, which is not the plain
// 3-argument form a hand-writer authors. Trimming is TRAILING-ONLY, so a
// placeholder a body passes deliberately with a real argument after it survives.
func trimTrailingUndefined(args []*shimast.Node) []*shimast.Node {
	for len(args) != 0 && isUndefinedLiteral(args[len(args)-1]) {
		args = args[:len(args)-1]
	}
	return args
}

// isUndefinedLiteral reports whether node is an explicit undefined placeholder.
// `void 0` is the form a sugar body must use: the body validator
// (INLINE_BODY_FREE_IDENTIFIER) rejects any identifier that is not a parameter,
// type parameter, or primitive import, and a bare `undefined` is exactly such a
// free identifier. It is also the shadow-proof spelling, and the one ditransform
// emits for the same value. The `undefined` identifier is still recognized here
// so a hand-lowered call reaching this path is trimmed identically.
func isUndefinedLiteral(node *shimast.Node) bool {
	if node.Kind == shimast.KindVoidExpression {
		return true
	}
	return node.Kind == shimast.KindIdentifier && node.Text() == "undefined"
}

// keyofArgIsKeyed reports whether a `keyof<T>()` call's bound type argument carries
// the `Keyed<T, K>` brand, read off the inline env captured at the call site.
func (st *fileState) keyofArgIsKeyed(keyofCall *shimast.Node, env map[string]*shimchecker.Type) bool {
	typeArgs := keyofCall.AsCallExpression().TypeArguments
	if typeArgs == nil {
		return false
	}
	for _, ta := range typeArgs.Nodes {
		if ta.Kind != shimast.KindTypeReference {
			continue
		}
		name := ta.AsTypeReferenceNode().TypeName
		if name == nil || name.Kind != shimast.KindIdentifier {
			continue
		}
		if t, ok := env[name.Text()]; ok {
			if _, keyed := tokens.KeyLiteralFor(t, st.checker); keyed {
				return true
			}
		}
	}
	return false
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
		var composed *ComposedTypeArg
		if typeArgs != nil {
			for _, ta := range typeArgs.Nodes {
				if ta.Kind != shimast.KindTypeReference {
					continue
				}
				name := ta.AsTypeReferenceNode().TypeName
				if name == nil || name.Kind != shimast.KindIdentifier {
					continue
				}
				if t, has := env[name.Text()]; has {
					// A bare type-parameter reference (`tokenfor<T>()`): the env
					// binding IS the token source.
					bound = append(bound, t)
					continue
				}
				if ref, ok := body.TypeImports[name.Text()]; ok {
					// A body-external composed generic (`tokenfor<IOptions<T>>()`):
					// the base names an imported type, and its leaves bind from env.
					composed = composedTypeArg(ta, ref, env)
				}
			}
		}
		use := PrimitiveUse{Name: prim, TypeArgs: bound, Composed: composed}
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

// composedTypeArg builds a composed-generic descriptor for a spelled type node
// (`IOptions<T>`) whose base is a body-external import: it carries the import's
// module + export (resolved late, in the lowering stage) and its argument types
// bound from the inline env. An argument that is not a bare env-bound type
// parameter records nil, so the lowering reports an underivable-token diagnostic
// for it — the composed generic is only as derivable as its leaves.
func composedTypeArg(node *shimast.Node, ref TypeImportRef, env map[string]*shimchecker.Type) *ComposedTypeArg {
	c := &ComposedTypeArg{Module: ref.Module, Export: ref.Export, ArgNode: node}
	if argList := node.AsTypeReferenceNode().TypeArguments; argList != nil {
		for _, arg := range argList.Nodes {
			c.Args = append(c.Args, composedLeafType(arg, env))
		}
	}
	return c
}

// composedLeafType resolves one composed-generic argument node to its bound
// checker type, or nil when it is not a bare env-bound type-parameter reference
// (the only leaf shape the addOptions family spells; a richer nesting would need
// recursion, deliberately out of scope until a body requires it).
func composedLeafType(node *shimast.Node, env map[string]*shimchecker.Type) *shimchecker.Type {
	if node.Kind != shimast.KindTypeReference {
		return nil
	}
	name := node.AsTypeReferenceNode().TypeName
	if name == nil || name.Kind != shimast.KindIdentifier {
		return nil
	}
	return env[name.Text()]
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
