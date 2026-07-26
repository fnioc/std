// Package mergesynthtransform is the #213 default-merge-strategy synthesizer:
// for every augmentation member reaching `registerAugmentations(token, set)` or
// `applyAugmentations(Class, set)` without a hand-authored strategy for its
// name, it derives a runtime argument-shape guard from the member's own
// parameter types and threads a per-member `MergeStrategies` map as the call's
// third argument. Under this stage a member-name collision NEVER throws at
// install time: a guarded dispatcher routes a call to whichever extension's
// signature the arguments actually match, falling through to whatever held the
// name before.
//
// The guards are typia is-validators, generated IN-PROCESS by typia's native Go
// programmers (an embed, not a second compiler pass): this stage resolves each
// parameter's ORIGINAL type node and hands the resulting type straight to
// typia's is-programmer over the same loaded program, checker, and EmitContext.
// Driving typia per-parameter is the only workable composition — typia's own
// per-file walk anchors on GetResolvedSignature of the callee, which a
// synthesized call (in a program that never imports typia) can never satisfy.
// The producer→consumer ordering problem dissolves for the same reason:
// synthesis and lowering happen in one function call, so nothing typia-shaped
// ever survives into the emitted tree.
//
// typia's fast path is taken only for a type it renders FAITHFULLY, decided by a
// whitelist (typiaFaithful): every reachable position must be one this stage
// positively recognizes typia's output for. Anything else is composed here
// instead (guardForType), over the public surface internal/typesurface
// enumerates, or — where composition cannot reach — DROPPED with a warning
// rather than approximated.
//
// The whitelist direction is the point. A guard is only worth emitting if its
// clauses can decide something, and the ways typia's enumeration silently stops
// deciding (a `#`-named field keyed on a name no object carries, a symbol-keyed
// member keyed on the checker's internal name, an accessor skipped outright, a
// wholly hidden surface collapsing to a constant `true`) all look like ordinary
// output. Recognizing them one at a time leaves every unexamined position
// defaulting to "emit anyway"; recognizing what typia gets RIGHT leaves every
// unexamined position defaulting to a composed guard or a refusal, both of which
// are honest.
//
// §87 containment: the emitted guards are self-contained plain JS. A guard
// that would need one of typia's runtime helper imports is DROPPED (that
// parameter simply goes unguarded) with a warning diagnostic — the published
// artifacts must never grow a typia runtime import. typia is a build-time-only
// dependency of the single ttsc-std host; the emitted JS carries no typia
// runtime.
//
// Degradation contract: a parameter whose type is un-derivable — no annotation,
// `any`/`unknown`, or a reference to the member's own type parameters —
// contributes no guard. A member whose EVERY parameter is un-derivable that way
// gets the bare always-pass strategy: that extension wins and chain order breaks
// ties. A REFUSAL is not that case — the type was known and simply could not be
// guarded faithfully — so it keeps the arity bounds, which are derivable from the
// signature alone. A refusal must never widen dispatch past what it replaced.
//
// A member whose name the call's own hand-authored merge object already covers is
// left entirely alone (hand-authored WINS — enforced twice: covered names are
// skipped here, and the original merge expression is spread LAST over the
// synthesized map).
package mergesynthtransform

import (
	"errors"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimcore "github.com/microsoft/typescript-go/shim/core"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	shimscanner "github.com/microsoft/typescript-go/shim/scanner"
	"github.com/samchon/ttsc/packages/ttsc/driver"
	nativecontext "github.com/samchon/typia/packages/typia/native/core/context"
	nativeprogrammers "github.com/samchon/typia/packages/typia/native/core/programmers"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/typesurface"
)

// Category mirrors ditransform's advisory-vs-hard split: a Warning is reported
// without failing the emit.
type Category int

const (
	Error Category = iota
	Warning
)

// Diagnostic is one merge-synthesis diagnostic.
type Diagnostic struct {
	File     string
	Category Category
	Code     string
	Message  string
}

// The install functions this stage rewrites, matched on the callee's resolved
// symbol name (following import aliases) — the same looseness as the nameof
// stage's matcher, and unambiguous for these two first-party names.
const (
	registerName = "registerAugmentations"
	applyName    = "applyAugmentations"
)

// New builds the per-file transform: every 2-argument (or gap-carrying
// 3-argument) `registerAugmentations` / `applyAugmentations` call whose set
// argument resolves to a statically-known object literal gains a synthesized
// per-member merge-strategy map as its third argument.
func New(prog *driver.Program, addDiagnostic func(Diagnostic)) plugin.FileTransform {
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		s := &synthesizer{
			prog:          prog,
			checker:       prog.Checker,
			ec:            ec,
			file:          sf,
			addDiagnostic: addDiagnostic,
		}
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				if next := s.maybeRewrite(node.AsCallExpression()); next != nil {
					// No recursion into the rewritten call: its original
					// argument nodes (the nameof token derivation among them)
					// are preserved as-is for the later primitive stages'
					// own full-file visits.
					return next
				}
			}
			return visitor.VisitEachChild(node)
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return output.AsSourceFile()
	}
}

type synthesizer struct {
	prog          *driver.Program
	checker       *shimchecker.Checker
	ec            *shimprinter.EmitContext
	file          *shimast.SourceFile
	addDiagnostic func(Diagnostic)
}

func (s *synthesizer) factory() *shimast.NodeFactory {
	return s.ec.Factory.AsNodeFactory()
}

// member is one augmentation-set entry: its statically-known name and the
// function-like declaration carrying its parameters and type parameters.
type member struct {
	name string
	fn   *shimast.Node
}

// maybeRewrite returns the rewritten call, or nil when this call is not an
// install call / needs no synthesis.
func (s *synthesizer) maybeRewrite(call *shimast.CallExpression) *shimast.Node {
	if !s.isInstallCall(call) {
		return nil
	}
	args := call.Arguments.Nodes
	if len(args) < 2 || len(args) > 3 {
		return nil
	}
	members := s.setMembers(args[1])
	if len(members) == 0 {
		return nil
	}

	// Hand-authored strategies WIN: a name the existing merge object covers is
	// not synthesized at all. When the merge expression's shape cannot be
	// statically enumerated the skip-set stays empty — the runtime spread below
	// still guarantees the hand-authored entry overrides the synthesized one.
	var handMerge *shimast.Node
	handNames := map[string]bool{}
	if len(args) == 3 {
		handMerge = args[2]
		handNames = s.strategyNames(handMerge)
	}

	f := s.factory()
	props := make([]*shimast.Node, 0, len(members)+1)
	for _, m := range members {
		if handNames[m.name] {
			continue
		}
		props = append(props, f.NewPropertyAssignment(nil, propertyName(f, m.name), nil, nil, s.strategyFor(m)))
	}
	if len(props) == 0 {
		return nil
	}
	if handMerge != nil {
		props = append(props, f.NewSpreadAssignment(handMerge))
	}
	merged := f.NewObjectLiteralExpression(f.NewNodeList(props), true)
	newArgs := []*shimast.Node{args[0], args[1], merged}
	return f.UpdateCallExpression(
		call,
		call.Expression,
		call.QuestionDotToken,
		call.TypeArguments,
		f.NewNodeList(newArgs),
		shimast.NodeFlagsNone,
	)
}

// isInstallCall reports whether call's callee resolves (through import
// aliases) to `registerAugmentations` or `applyAugmentations`. The checker
// panics on a synthetic callee, so a position-less node is a clean skip.
//
// THIS STAGE NEEDS NO PARSE ANCHOR, because of WHERE it runs, not what it does.
// It is a one-shot PRE-PASS (stdhost.partitionStages) executed before the
// fixed-point loop mutates anything, so every node it queries is still the node
// the binder saw — there is no rewritten tree to be walked into, which is the
// hazard plugin.CheckerAnchor exists for. If mergesynth ever REJOINS the loop
// (the documented rejoin condition: a sugar body starts emitting install calls),
// it must take the anchor at the same time, or it inherits the crash: this
// predicate and resolveObjectLiteral below are exactly the syntax-driven
// GetSymbolAtLocation queries the anchor governs everywhere else.
func (s *synthesizer) isInstallCall(call *shimast.CallExpression) bool {
	if call.Expression.Pos() < 0 {
		return false
	}
	symbol := s.checker.GetSymbolAtLocation(call.Expression)
	if symbol == nil {
		return false
	}
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := s.checker.GetAliasedSymbol(symbol); aliased != nil {
			symbol = aliased
		}
	}
	return symbol.Name == registerName || symbol.Name == applyName
}

// setMembers enumerates the augmentation set's members in declaration order:
// the set expression (or the const initializer its identifier resolves to,
// through `satisfies`/`as`/parens) must be an object literal, and each entry a
// method or a function-valued property with a static name. Anything else —
// spreads, shorthands, computed names — is skipped: those members simply get
// no synthesized strategy, preserving the no-transformer semantics.
func (s *synthesizer) setMembers(setArg *shimast.Node) []member {
	literal := s.resolveObjectLiteral(setArg)
	if literal == nil {
		return nil
	}
	members := make([]member, 0, len(literal.Properties.Nodes))
	for _, prop := range literal.Properties.Nodes {
		switch prop.Kind {
		case shimast.KindMethodDeclaration:
			if name := staticName(prop.Name()); name != "" {
				members = append(members, member{name: name, fn: prop})
			}
		case shimast.KindPropertyAssignment:
			assignment := prop.AsPropertyAssignment()
			name := staticName(assignment.Name())
			if name == "" {
				continue
			}
			init := skipWrappers(assignment.Initializer)
			if init != nil && (init.Kind == shimast.KindFunctionExpression || init.Kind == shimast.KindArrowFunction) {
				members = append(members, member{name: name, fn: init})
			}
		}
	}
	return members
}

// strategyNames enumerates the statically-known member names of a hand-authored
// merge expression. Unresolvable shapes yield an empty set — synthesis then
// covers every member and the runtime spread keeps the hand-authored entries
// winning.
func (s *synthesizer) strategyNames(mergeArg *shimast.Node) map[string]bool {
	names := map[string]bool{}
	literal := s.resolveObjectLiteral(mergeArg)
	if literal == nil {
		return names
	}
	for _, prop := range literal.Properties.Nodes {
		switch prop.Kind {
		case shimast.KindMethodDeclaration:
			if name := staticName(prop.Name()); name != "" {
				names[name] = true
			}
		case shimast.KindPropertyAssignment:
			if name := staticName(prop.AsPropertyAssignment().Name()); name != "" {
				names[name] = true
			}
		case shimast.KindShorthandPropertyAssignment:
			if name := staticName(prop.Name()); name != "" {
				names[name] = true
			}
		}
	}
	return names
}

// resolveObjectLiteral resolves an expression to the object literal it
// statically denotes: the expression itself, or the initializer of the const
// variable its identifier resolves to, in both cases unwrapping
// `satisfies`/`as`/parenthesized wrappers.
func (s *synthesizer) resolveObjectLiteral(expr *shimast.Node) *shimast.ObjectLiteralExpression {
	unwrapped := skipWrappers(expr)
	if unwrapped == nil {
		return nil
	}
	if unwrapped.Kind == shimast.KindObjectLiteralExpression {
		return unwrapped.AsObjectLiteralExpression()
	}
	if unwrapped.Kind != shimast.KindIdentifier || unwrapped.Pos() < 0 {
		return nil
	}
	symbol := s.checker.GetSymbolAtLocation(unwrapped)
	if symbol == nil {
		return nil
	}
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := s.checker.GetAliasedSymbol(symbol); aliased != nil {
			symbol = aliased
		}
	}
	decl := symbol.ValueDeclaration
	if decl == nil || decl.Kind != shimast.KindVariableDeclaration {
		return nil
	}
	init := skipWrappers(decl.AsVariableDeclaration().Initializer)
	if init != nil && init.Kind == shimast.KindObjectLiteralExpression {
		return init.AsObjectLiteralExpression()
	}
	return nil
}

// paramKind is a guarded parameter's dispatch arity class.
type paramKind int

const (
	paramRequired paramKind = iota
	paramOptional
	paramRest
)

// guardedParam is one synthesized conjunct: the args index it checks, its
// arity class, and the typia guard function expression.
type guardedParam struct {
	index int
	kind  paramKind
	guard *shimast.Node
}

// strategyFor synthesizes one member's merge strategy. The result is always a
// valid strategy expression; the fallback for a fully un-derivable member is
// the bare always-pass form (extension wins, chain order breaks ties).
func (s *synthesizer) strategyFor(m member) *shimast.Node {
	params := functionParameters(m.fn)
	if len(params) < 1 {
		return s.alwaysPassStrategy()
	}
	typeParams := typeParameterNames(m.fn)

	// Non-receiver parameters, positionally: params[i+1] guards args[i].
	guardable := params[1:]
	guards := make([]guardedParam, 0, len(guardable))
	minArity := 0
	maxArity := 0
	hasRest := false
	refused := false
	for i, paramNode := range guardable {
		param := paramNode.AsParameterDeclaration()
		kind := paramRequired
		switch {
		case param.DotDotDotToken != nil:
			kind = paramRest
			hasRest = true
		case param.QuestionToken != nil || param.Initializer != nil:
			kind = paramOptional
		default:
			minArity = i + 1
		}
		if !hasRest {
			maxArity = i + 1
		}

		typeNode := param.Type
		if typeNode == nil {
			continue
		}
		if typeNode.Kind == shimast.KindAnyKeyword || typeNode.Kind == shimast.KindUnknownKeyword {
			continue
		}
		if referencesTypeParameter(typeNode, typeParams) {
			continue
		}
		guard, ok := s.synthesizeGuard(typeNode, m.name)
		if !ok {
			// The type was known; no faithful guard could be built from it. That
			// is a refusal, not an un-derivable parameter.
			refused = true
			continue
		}
		guards = append(guards, guardedParam{index: i, kind: kind, guard: guard})
	}

	// No parameter type could be derived AND none was refused: nothing at all is
	// known about the call, so the extension silently wins.
	if len(guards) == 0 && !refused {
		return s.alwaysPassStrategy()
	}
	return s.guardedStrategy(guards, minArity, maxArity, hasRest)
}

// synthesizeGuard derives one parameter's guard function expression from its
// ORIGINAL type node. A typia TransformerError (unsupported type, unresolved
// shape) surfaces as a panic; it is recovered here and the parameter degrades to
// unguarded — under this stage nothing ever fails the build over a merge guard.
// A guard that requested a typia runtime helper import is likewise dropped (§87:
// the emitted JS must stay typia-free), with a warning naming the member.
func (s *synthesizer) synthesizeGuard(typeNode *shimast.Node, memberName string) (guard *shimast.Node, ok bool) {
	importer := nativecontext.NewImportProgrammer(nativecontext.ImportProgrammer_IOptions{
		InternalPrefix: "typia_transform_",
	})
	importer.SetEmitContext(s.ec)
	diagnosed := false
	context := nativecontext.ITypiaContext{
		Program:         s.prog,
		CompilerOptions: compilerOptions(s.prog),
		Checker:         s.checker,
		Options:         nativecontext.ITransformOptions{},
		Emit:            s.ec,
		Importer:        importer,
		Extras: nativecontext.ITypiaContext_Extras{
			AddDiagnostic: func(*nativecontext.ITypiaDiagnostic) int {
				diagnosed = true
				return 0
			},
		},
	}

	defer func() {
		if recovered := recover(); recovered != nil {
			guard, ok = nil, false
		}
	}()

	if typeNode.Pos() < 0 {
		return nil, false
	}
	t := s.checker.GetTypeFromTypeNode(typeNode)
	if t == nil {
		return nil, false
	}

	out, err := s.guardForType(context, t, typeNameOf(typeNode), map[*shimchecker.Type]bool{})
	if err != nil {
		s.addDiagnostic(Diagnostic{
			File:     s.file.FileName(),
			Category: Warning,
			Code:     "MERGESYNTH_PRIVATE_SURFACE",
			Message: "merge guard for \"" + memberName + "\" would have to validate " + err.Error() +
				"; dropped (that parameter is unguarded)",
		})
		return nil, false
	}
	if out == nil || diagnosed {
		return nil, false
	}
	if len(importer.ToStatements()) != 0 {
		s.addDiagnostic(Diagnostic{
			File:     s.file.FileName(),
			Category: Warning,
			Code:     "MERGESYNTH_RUNTIME_IMPORT",
			Message:  "merge guard for \"" + memberName + "\" needs a typia runtime helper import; dropped (the emitted JS must stay typia-free, §87)",
		})
		return nil, false
	}
	return out, true
}

// guardForType returns the guard function expression validating a value against
// t.
//
// A type typia renders faithfully is handed straight to its is-programmer.
// Anything else is composed here, position by position, over the PUBLIC surface
// internal/typesurface enumerates. Composition covers unions, intersections,
// arrays, tuples, index-signature records, callables, symbols, and plain
// object/class types; a shape it does not decompose — a diverging type inside a
// Map or Set, a self-referencing diverging type, a member whose own guard cannot
// be built — is refused with an error rather than approximated, since a partial
// object guard reads as a whole one.
func (s *synthesizer) guardForType(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	name string,
	seen map[*shimchecker.Type]bool,
) (*shimast.Node, error) {
	if s.typiaFaithful(t, map[*shimchecker.Type]bool{}) {
		return nativeprogrammers.IsProgrammer.Write(nativeprogrammers.IsProgrammer_IProps{
			Context: context,
			Type:    t,
			Name:    &name,
			Config:  nativeprogrammers.IsProgrammer_IConfig{},
		}), nil
	}
	if seen[t] {
		return nil, errors.New("a type that contains itself (" + s.checker.TypeToString(t) + ")")
	}
	seen[t] = true
	defer delete(seen, t)

	switch {
	case t.Flags()&shimchecker.TypeFlagsESSymbolLike != 0:
		return typeofGuard(s.factory(), "symbol"), nil
	case t.Flags()&shimchecker.TypeFlagsUnion != 0:
		return s.unionGuard(context, t, seen)
	case t.Flags()&shimchecker.TypeFlagsIntersection != 0:
		return s.intersectionGuard(context, t, seen)
	case shimchecker.IsTupleType(t):
		return s.tupleGuard(context, t, seen)
	case s.arrayElementType(t) != nil:
		return s.arrayGuard(context, t, seen)
	case s.isCallable(t):
		return typeofGuard(s.factory(), "function"), nil
	case s.stringIndexValueType(t) != nil:
		return s.recordGuard(context, t, seen)
	case s.isComposableObject(t):
		return s.objectGuard(context, t, seen)
	}
	return nil, errors.New(s.checker.TypeToString(t) + ", whose shape has no faithful runtime check")
}

// typeofGuard emits `(input) => typeof input === "<kind>"` — the whole of what a
// value of a callable or symbol type can be checked for.
func typeofGuard(f *shimast.NodeFactory, kind string) *shimast.Node {
	condition := f.NewBinaryExpression(
		nil,
		f.NewTypeOfExpression(f.NewIdentifier("input")),
		nil,
		f.NewToken(shimast.KindEqualsEqualsEqualsToken),
		f.NewStringLiteral(kind, shimast.TokenFlagsNone),
	)
	return guardClosure(f, nil, condition)
}

// intersectionGuard emits `(input) => i0(input) && i1(input)` over the
// constituents — a value is of the intersection exactly when it is of each.
func (s *synthesizer) intersectionGuard(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	seen map[*shimchecker.Type]bool,
) (*shimast.Node, error) {
	f := s.factory()
	declarations := make([]*shimast.Node, 0, len(t.Types()))
	var condition *shimast.Node
	for i, constituent := range t.Types() {
		guard, err := s.guardForType(context, constituent, s.checker.TypeToString(constituent), seen)
		if err != nil {
			return nil, err
		}
		local := "i" + itoa(i)
		declarations = append(declarations, f.NewVariableDeclaration(f.NewIdentifier(local), nil, nil, guard))
		call := f.NewCallExpression(
			f.NewIdentifier(local),
			nil,
			nil,
			f.NewNodeList([]*shimast.Node{f.NewIdentifier("input")}),
			shimast.NodeFlagsNone,
		)
		if condition == nil {
			condition = call
			continue
		}
		condition = f.NewBinaryExpression(nil, condition, nil, f.NewToken(shimast.KindAmpersandAmpersandToken), call)
	}
	if condition == nil {
		return nil, errors.New("an empty intersection")
	}
	return guardClosure(f, declarations, condition), nil
}

// tupleGuard emits, over a tuple of required-then-optional elements:
//
//	(input) => Array.isArray(input) && input.length >= REQUIRED
//	    && input.length <= TOTAL && t0(input[0])
//	    && (input[1] === undefined || t1(input[1]))
//
// A rest or variadic element leaves the positions themselves unfixed, so no
// per-index clause is meaningful and such a tuple is refused.
func (s *synthesizer) tupleGuard(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	seen map[*shimchecker.Type]bool,
) (*shimast.Node, error) {
	elementFlags := t.TargetTupleType().ElementFlags()
	required := 0
	for _, flags := range elementFlags {
		switch flags {
		case shimchecker.ElementFlagsRequired:
			required++
		case shimchecker.ElementFlagsOptional:
		default:
			return nil, errors.New(s.checker.TypeToString(t) + ", a tuple with a rest or variadic element")
		}
	}
	elements := s.checker.GetTypeArguments(t)
	f := s.factory()
	length := func() *shimast.Node {
		return f.NewPropertyAccessExpression(f.NewIdentifier("input"), nil, f.NewIdentifier("length"), shimast.NodeFlagsNone)
	}
	condition := f.NewBinaryExpression(
		nil,
		isArrayCall(f, f.NewIdentifier("input")),
		nil,
		f.NewToken(shimast.KindAmpersandAmpersandToken),
		f.NewBinaryExpression(nil, length(), nil, f.NewToken(shimast.KindGreaterThanEqualsToken), numericLiteral(f, required)),
	)
	condition = f.NewBinaryExpression(
		nil,
		condition,
		nil,
		f.NewToken(shimast.KindAmpersandAmpersandToken),
		f.NewBinaryExpression(nil, length(), nil, f.NewToken(shimast.KindLessThanEqualsToken), numericLiteral(f, len(elements))),
	)
	declarations := make([]*shimast.Node, 0, len(elements))
	for i, element := range elements {
		guard, err := s.guardForType(context, element, s.checker.TypeToString(element), seen)
		if err != nil {
			return nil, err
		}
		local := "t" + itoa(i)
		declarations = append(declarations, f.NewVariableDeclaration(f.NewIdentifier(local), nil, nil, guard))
		at := func() *shimast.Node {
			return f.NewElementAccessExpression(f.NewIdentifier("input"), nil, numericLiteral(f, i), shimast.NodeFlagsNone)
		}
		checked := f.NewCallExpression(f.NewIdentifier(local), nil, nil, f.NewNodeList([]*shimast.Node{at()}), shimast.NodeFlagsNone)
		if i < len(elementFlags) && elementFlags[i] == shimchecker.ElementFlagsOptional {
			absent := f.NewBinaryExpression(
				nil,
				at(),
				nil,
				f.NewToken(shimast.KindEqualsEqualsEqualsToken),
				f.NewIdentifier("undefined"),
			)
			checked = f.NewParenthesizedExpression(
				f.NewBinaryExpression(nil, absent, nil, f.NewToken(shimast.KindBarBarToken), checked),
			)
		}
		condition = f.NewBinaryExpression(nil, condition, nil, f.NewToken(shimast.KindAmpersandAmpersandToken), checked)
	}
	return guardClosure(f, declarations, condition), nil
}

// recordGuard emits, for a string-index-signature type:
//
//	(() => {
//	    const v0 = <value guard>;
//	    return (input) => typeof input === "object" && input !== null
//	        && !Array.isArray(input) && Object.values(input).every((v) => v0(v));
//	})()
//
// Named members declared alongside the index signature contribute their own
// clauses on top.
func (s *synthesizer) recordGuard(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	seen map[*shimchecker.Type]bool,
) (*shimast.Node, error) {
	valueType := s.stringIndexValueType(t)
	guard, err := s.guardForType(context, valueType, s.checker.TypeToString(valueType), seen)
	if err != nil {
		return nil, err
	}
	f := s.factory()
	declarations := []*shimast.Node{f.NewVariableDeclaration(f.NewIdentifier("v0"), nil, nil, guard)}
	condition := plainObjectCondition(f)

	valueParam := f.NewParameterDeclaration(nil, nil, f.NewIdentifier("v"), nil, nil, nil)
	predicate := f.NewArrowFunction(
		nil, nil,
		f.NewNodeList([]*shimast.Node{valueParam}),
		nil, nil,
		f.NewToken(shimast.KindEqualsGreaterThanToken),
		f.NewCallExpression(f.NewIdentifier("v0"), nil, nil, f.NewNodeList([]*shimast.Node{f.NewIdentifier("v")}), shimast.NodeFlagsNone),
	)
	values := f.NewCallExpression(
		f.NewPropertyAccessExpression(f.NewIdentifier("Object"), nil, f.NewIdentifier("values"), shimast.NodeFlagsNone),
		nil, nil,
		f.NewNodeList([]*shimast.Node{f.NewIdentifier("input")}),
		shimast.NodeFlagsNone,
	)
	every := f.NewCallExpression(
		f.NewPropertyAccessExpression(values, nil, f.NewIdentifier("every"), shimast.NodeFlagsNone),
		nil, nil,
		f.NewNodeList([]*shimast.Node{predicate}),
		shimast.NodeFlagsNone,
	)
	condition = f.NewBinaryExpression(nil, condition, nil, f.NewToken(shimast.KindAmpersandAmpersandToken), every)

	memberDeclarations, memberCondition, err := s.memberClauses(context, t, condition, seen)
	if err != nil {
		return nil, err
	}
	return guardClosure(f, append(declarations, memberDeclarations...), memberCondition), nil
}

// unionGuard emits `(input) => u0(input) || u1(input)` over the constituents.
func (s *synthesizer) unionGuard(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	seen map[*shimchecker.Type]bool,
) (*shimast.Node, error) {
	f := s.factory()
	declarations := make([]*shimast.Node, 0, len(t.Types()))
	var condition *shimast.Node
	for i, constituent := range t.Types() {
		guard, err := s.guardForType(context, constituent, s.checker.TypeToString(constituent), seen)
		if err != nil {
			return nil, err
		}
		local := "u" + itoa(i)
		declarations = append(declarations, f.NewVariableDeclaration(f.NewIdentifier(local), nil, nil, guard))
		call := f.NewCallExpression(
			f.NewIdentifier(local),
			nil,
			nil,
			f.NewNodeList([]*shimast.Node{f.NewIdentifier("input")}),
			shimast.NodeFlagsNone,
		)
		if condition == nil {
			condition = call
			continue
		}
		condition = f.NewBinaryExpression(nil, condition, nil, f.NewToken(shimast.KindBarBarToken), call)
	}
	if condition == nil {
		return nil, errors.New("an empty union")
	}
	return guardClosure(f, declarations, condition), nil
}

// arrayGuard emits `(input) => Array.isArray(input) && input.every((e) => g(e))`.
func (s *synthesizer) arrayGuard(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	seen map[*shimchecker.Type]bool,
) (*shimast.Node, error) {
	element := s.arrayElementType(t)
	guard, err := s.guardForType(context, element, s.checker.TypeToString(element), seen)
	if err != nil {
		return nil, err
	}
	f := s.factory()
	declarations := []*shimast.Node{f.NewVariableDeclaration(f.NewIdentifier("e0"), nil, nil, guard)}

	elementParam := f.NewParameterDeclaration(nil, nil, f.NewIdentifier("e"), nil, nil, nil)
	predicate := f.NewArrowFunction(
		nil, nil,
		f.NewNodeList([]*shimast.Node{elementParam}),
		nil, nil,
		f.NewToken(shimast.KindEqualsGreaterThanToken),
		f.NewCallExpression(f.NewIdentifier("e0"), nil, nil, f.NewNodeList([]*shimast.Node{f.NewIdentifier("e")}), shimast.NodeFlagsNone),
	)
	every := f.NewCallExpression(
		f.NewPropertyAccessExpression(f.NewIdentifier("input"), nil, f.NewIdentifier("every"), shimast.NodeFlagsNone),
		nil, nil,
		f.NewNodeList([]*shimast.Node{predicate}),
		shimast.NodeFlagsNone,
	)
	condition := f.NewBinaryExpression(nil, isArrayCall(f, f.NewIdentifier("input")), nil, f.NewToken(shimast.KindAmpersandAmpersandToken), every)
	return guardClosure(f, declarations, condition), nil
}

// objectGuard emits one clause per PUBLIC, READABLE member over an object/class
// type:
//
//	(() => {
//	    const m0 = <member guard>;
//	    return (input) => typeof input === "object" && input !== null
//	        && !Array.isArray(input) && m0(input.name);
//	})()
//
// An `?`-optional member's clause admits an absent value directly. A type with
// nothing readable is refused: its guard would be a bare `typeof input ===
// "object"`, which decides nothing about the type it claims to check. So is one
// carrying a symbol-keyed member — a caller CAN supply that member, so leaving it
// unchecked (there being no string key to read it by) would quietly widen the
// guard, unlike a `#`-named or `private` member, which no caller can supply and
// whose omission is the point.
func (s *synthesizer) objectGuard(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	seen map[*shimchecker.Type]bool,
) (*shimast.Node, error) {
	f := s.factory()
	surface := typesurface.For(s.checker, t, nil)
	if surface.SymbolKeyed > 0 {
		return nil, errors.New(s.checker.TypeToString(t) + ", which has a member no string key can name")
	}
	if len(surface.Readable()) == 0 {
		return nil, errors.New(s.checker.TypeToString(t) + ", none of whose members can be read from outside it")
	}
	declarations, condition, err := s.memberClauses(context, t, plainObjectCondition(f), seen)
	if err != nil {
		return nil, err
	}
	return guardClosure(f, declarations, condition), nil
}

// plainObjectCondition is the shared prefix of every composed object guard:
// `typeof input === "object" && input !== null && !Array.isArray(input)`.
func plainObjectCondition(f *shimast.NodeFactory) *shimast.Node {
	condition := f.NewBinaryExpression(
		nil,
		f.NewBinaryExpression(
			nil,
			f.NewTypeOfExpression(f.NewIdentifier("input")),
			nil,
			f.NewToken(shimast.KindEqualsEqualsEqualsToken),
			f.NewStringLiteral("object", shimast.TokenFlagsNone),
		),
		nil,
		f.NewToken(shimast.KindAmpersandAmpersandToken),
		f.NewBinaryExpression(
			nil,
			f.NewIdentifier("input"),
			nil,
			f.NewToken(shimast.KindExclamationEqualsEqualsToken),
			f.NewKeywordExpression(shimast.KindNullKeyword),
		),
	)
	return f.NewBinaryExpression(
		nil,
		condition,
		nil,
		f.NewToken(shimast.KindAmpersandAmpersandToken),
		f.NewPrefixUnaryExpression(shimast.KindExclamationToken, isArrayCall(f, f.NewIdentifier("input"))),
	)
}

func isArrayCall(f *shimast.NodeFactory, subject *shimast.Node) *shimast.Node {
	return f.NewCallExpression(
		f.NewPropertyAccessExpression(f.NewIdentifier("Array"), nil, f.NewIdentifier("isArray"), shimast.NodeFlagsNone),
		nil, nil,
		f.NewNodeList([]*shimast.Node{subject}),
		shimast.NodeFlagsNone,
	)
}

// memberClauses conjoins one `mN(input.name)` clause onto condition per public,
// readable member of t, returning the sub-guard declarations alongside it. A
// set-only accessor is skipped: it cannot be read, so a clause on it could never
// pass on a genuine value.
func (s *synthesizer) memberClauses(
	context nativecontext.ITypiaContext,
	t *shimchecker.Type,
	condition *shimast.Node,
	seen map[*shimchecker.Type]bool,
) ([]*shimast.Node, *shimast.Node, error) {
	f := s.factory()
	members := typesurface.For(s.checker, t, nil).Readable()
	declarations := make([]*shimast.Node, 0, len(members))
	for i, m := range members {
		memberType := s.checker.GetTypeOfSymbolAtLocation(m.Symbol, m.Decl)
		if memberType == nil {
			return nil, nil, errors.New("member \"" + m.Name + "\" of " + s.checker.TypeToString(t) + ", whose type does not resolve")
		}
		guard, err := s.guardForType(context, memberType, s.checker.TypeToString(memberType), seen)
		if err != nil {
			return nil, nil, err
		}
		local := "m" + itoa(i)
		declarations = append(declarations, f.NewVariableDeclaration(f.NewIdentifier(local), nil, nil, guard))

		read := func() *shimast.Node {
			if isIdentifierName(m.Name) {
				return f.NewPropertyAccessExpression(f.NewIdentifier("input"), nil, f.NewIdentifier(m.Name), shimast.NodeFlagsNone)
			}
			return f.NewElementAccessExpression(f.NewIdentifier("input"), nil, f.NewStringLiteral(m.Name, shimast.TokenFlagsNone), shimast.NodeFlagsNone)
		}
		checked := f.NewCallExpression(f.NewIdentifier(local), nil, nil, f.NewNodeList([]*shimast.Node{read()}), shimast.NodeFlagsNone)
		if m.Optional {
			absent := f.NewBinaryExpression(
				nil,
				read(),
				nil,
				f.NewToken(shimast.KindEqualsEqualsEqualsToken),
				f.NewIdentifier("undefined"),
			)
			checked = f.NewParenthesizedExpression(
				f.NewBinaryExpression(nil, absent, nil, f.NewToken(shimast.KindBarBarToken), checked),
			)
		}
		condition = f.NewBinaryExpression(nil, condition, nil, f.NewToken(shimast.KindAmpersandAmpersandToken), checked)
	}
	return declarations, condition, nil
}

// guardClosure wraps a condition over `input` as a self-invoking closure binding
// its sub-guards, so their names stay local:
//
//	(() => { const g = …; return (input) => <condition>; })()
func guardClosure(f *shimast.NodeFactory, declarations []*shimast.Node, condition *shimast.Node) *shimast.Node {
	predicate := f.NewArrowFunction(
		nil, nil,
		f.NewNodeList([]*shimast.Node{f.NewParameterDeclaration(nil, nil, f.NewIdentifier("input"), nil, nil, nil)}),
		nil, nil,
		f.NewToken(shimast.KindEqualsGreaterThanToken),
		condition,
	)
	if len(declarations) == 0 {
		return predicate
	}
	body := f.NewBlock(f.NewNodeList([]*shimast.Node{
		f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList(declarations), shimast.NodeFlagsConst)),
		f.NewReturnStatement(predicate),
	}), true)
	closure := f.NewArrowFunction(nil, nil, f.NewNodeList(nil), nil, nil, f.NewToken(shimast.KindEqualsGreaterThanToken), body)
	return f.NewCallExpression(
		f.NewParenthesizedExpression(closure),
		nil, nil,
		f.NewNodeList(nil),
		shimast.NodeFlagsNone,
	)
}

// typiaNativeClasses are the classes typia's is-programmer recognizes BY NAME and
// checks with a plain `instanceof`, never by enumerating members. Membership in
// one of these is nominal, which is exactly what a hand-written check would test.
// The list is a whitelist: a class typia later learns about but this table does
// not merely gets composed or refused here, which is safe either way.
var typiaNativeClasses = map[string]bool{
	"ArrayBuffer": true, "SharedArrayBuffer": true, "DataView": true,
	"Blob": true, "File": true, "Date": true, "RegExp": true,
	"Boolean": true, "Number": true, "String": true, "BigInt": true,
	"WeakMap": true, "WeakSet": true,
	"Int8Array": true, "Int16Array": true, "Int32Array": true, "BigInt64Array": true,
	"Uint8Array": true, "Uint8ClampedArray": true, "Uint16Array": true, "Uint32Array": true,
	"BigUint64Array": true, "Float32Array": true, "Float64Array": true,
}

// typiaFaithful reports whether typia's is-programmer renders t — and every type
// reachable from it — the way a hand-written check would.
//
// This is a WHITELIST, and deliberately total: the final `return false` catches
// every construct not positively recognized above it. A position typia gets wrong
// yields a clause that cannot decide anything (a key no object carries, a bare
// `true`) and reads exactly like a correct one, so the cost of forgetting a case
// has to fall on the composer, not on the emitted guard.
func (s *synthesizer) typiaFaithful(t *shimchecker.Type, seen map[*shimchecker.Type]bool) bool {
	if t == nil {
		return false
	}
	if seen[t] {
		// Reached through itself. typia emits a self-referencing helper with its
		// own cycle detection, so the cycle costs nothing; whether the type is
		// faithful is settled by its finite positions, which this same walk
		// reaches on the way here.
		return true
	}
	seen[t] = true
	defer delete(seen, t)

	flags := t.Flags()
	switch {
	// `boolean` is modeled as `false | true` and carries the Union flag as well,
	// so it has to be classified ahead of any union handling.
	case flags&shimchecker.TypeFlagsBoolean != 0:
		return true
	// A leaf typia checks with a single `typeof`, walking no members.
	case flags&(shimchecker.TypeFlagsString|shimchecker.TypeFlagsNumber|shimchecker.TypeFlagsBigInt|
		shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsNull|shimchecker.TypeFlagsVoid) != 0:
		return true
	// A literal or enum member is compared against its own value.
	case flags&(shimchecker.TypeFlagsLiteral|shimchecker.TypeFlagsEnumLike) != 0:
		return true
	// A template-literal (or Uppercase/Lowercase) type becomes a `typeof` plus
	// the pattern typia compiles from it.
	case flags&(shimchecker.TypeFlagsTemplateLiteral|shimchecker.TypeFlagsStringMapping) != 0:
		return true
	// Every value inhabits `any` and `unknown`, and none inhabits `never`, so
	// typia's constant is the whole of what any check could say.
	case flags&(shimchecker.TypeFlagsAny|shimchecker.TypeFlagsUnknown|shimchecker.TypeFlagsNever) != 0:
		return true
	// A symbol HAS a `typeof` check, but typia emits a constant `true` for it —
	// a clause that can never be false. Composed instead.
	case flags&shimchecker.TypeFlagsESSymbolLike != 0:
		return false
	// typia checks a union arm by arm and merges an intersection's constituents
	// into one member set; either way each constituent's own rendering decides.
	case flags&(shimchecker.TypeFlagsUnion|shimchecker.TypeFlagsIntersection) != 0:
		for _, constituent := range t.Types() {
			if !s.typiaFaithful(constituent, seen) {
				return false
			}
		}
		return true
	case flags&shimchecker.TypeFlagsObject != 0:
		return s.objectFaithful(t, seen)
	}
	// A type parameter, a conditional, an indexed access, bare `object`, an error
	// type: not recognized, so not assumed.
	return false
}

// objectFaithful is typiaFaithful's object-type arm.
func (s *synthesizer) objectFaithful(t *shimchecker.Type, seen map[*shimchecker.Type]bool) bool {
	// A tuple checks positionally and an array checks `Array.isArray` plus every
	// element; in both the element types ARE the type arguments.
	if shimchecker.IsTupleType(t) || shimchecker.Checker_isArrayType(s.checker, t) || isReadonlyArrayType(t) {
		return s.typeArgumentsFaithful(t, seen)
	}
	name := typeSymbolName(t)
	// A Map or Set is `instanceof` plus an entry-wise / element-wise check over
	// the type arguments.
	if name == "Map" || name == "Set" {
		return s.typeArgumentsFaithful(t, seen)
	}
	if typiaNativeClasses[name] {
		return true
	}
	// A callable becomes a constant `true` — never false, whatever is passed.
	if s.isCallable(t) {
		return false
	}
	indexInfos := shimchecker.Checker_getIndexInfosOfType(s.checker, t)
	// Anything else declared outside this project is nominal in practice: a
	// structural clause per member says nothing about whether a value really is
	// one, and the members typia reaches for are often symbol-keyed. An
	// index-signature bag is exempt — `Record<K, V>` is declared in the standard
	// library but denotes a structure, not an identity.
	if len(indexInfos) == 0 && typesurface.FromLibrary(s.prog, t) {
		return false
	}
	surface := typesurface.For(s.checker, t, nil)
	switch {
	// Keyed on the checker's internal mangled name, which no object carries.
	case surface.PrivateNamed > 0 || surface.SymbolKeyed > 0:
		return false
	// Skipped outright, so the member goes unchecked.
	case surface.HasAccessor:
		return false
	// Nothing left to check: the guard collapses to a constant `true`.
	case surface.HiddenOnly():
		return false
	}
	for _, m := range surface.Members {
		memberType := s.checker.GetTypeOfSymbolAtLocation(m.Symbol, m.Decl)
		if memberType == nil || !s.typiaFaithful(memberType, seen) {
			return false
		}
	}
	// A mapped type's value type is reachable ONLY here: it has neither
	// properties nor type arguments of its own.
	for _, info := range indexInfos {
		if !s.typiaFaithful(info.KeyType(), seen) || !s.typiaFaithful(info.ValueType(), seen) {
			return false
		}
	}
	return s.typeArgumentsFaithful(t, seen)
}

// typeArgumentsFaithful walks an instantiation's type arguments. ONLY a
// reference type has them — asking any other object type panics — and every other
// object shape reaches its inner types through its members or its index infos.
func (s *synthesizer) typeArgumentsFaithful(t *shimchecker.Type, seen map[*shimchecker.Type]bool) bool {
	if t.ObjectFlags()&shimchecker.ObjectFlagsReference == 0 {
		return true
	}
	for _, argument := range s.checker.GetTypeArguments(t) {
		if !s.typiaFaithful(argument, seen) {
			return false
		}
	}
	return true
}

// typeSymbolName is the declared name of t's own symbol, or its generic target's
// — `Map<string, number>` reads as "Map".
func typeSymbolName(t *shimchecker.Type) string {
	if symbol := t.Symbol(); symbol != nil {
		return symbol.Name
	}
	if target := t.Target(); target != nil && target.Symbol() != nil {
		return target.Symbol().Name
	}
	return ""
}

// isCallable reports whether values of t are functions — an object type with a
// call or construct signature.
func (s *synthesizer) isCallable(t *shimchecker.Type) bool {
	if t == nil || t.Flags()&shimchecker.TypeFlagsObject == 0 {
		return false
	}
	return len(shimchecker.Checker_getSignaturesOfType(s.checker, t, shimchecker.SignatureKindCall)) > 0 ||
		len(shimchecker.Checker_getSignaturesOfType(s.checker, t, shimchecker.SignatureKindConstruct)) > 0
}

// stringIndexValueType returns the value type of a composable record — an object
// declared in this project whose ONLY index signature is keyed by `string`, so
// every own value can be checked with one guard over `Object.values`. A number-
// or symbol-keyed index signature returns nil: its keys do not survive
// `Object.keys` as themselves, so no faithful key check exists here.
func (s *synthesizer) stringIndexValueType(t *shimchecker.Type) *shimchecker.Type {
	if t == nil || t.Flags()&shimchecker.TypeFlagsObject == 0 {
		return nil
	}
	if s.isCallable(t) || shimchecker.IsTupleType(t) || s.arrayElementType(t) != nil {
		return nil
	}
	infos := shimchecker.Checker_getIndexInfosOfType(s.checker, t)
	if len(infos) != 1 || infos[0].KeyType().Flags()&shimchecker.TypeFlagsString == 0 {
		return nil
	}
	return infos[0].ValueType()
}

// arrayElementType returns the element type of an array (mutable or readonly),
// or nil when t is not one. A tuple is NOT an array here — its elements are
// positional, which the composer does not decompose.
func (s *synthesizer) arrayElementType(t *shimchecker.Type) *shimchecker.Type {
	if t == nil || shimchecker.IsTupleType(t) {
		return nil
	}
	if !shimchecker.Checker_isArrayType(s.checker, t) && !isReadonlyArrayType(t) {
		return nil
	}
	arguments := s.checker.GetTypeArguments(t)
	if len(arguments) != 1 {
		return nil
	}
	return arguments[0]
}

// isReadonlyArrayType reports whether t is a `readonly T[]` — a reference whose
// target is the global ReadonlyArray, which Checker_isArrayType does not cover.
func isReadonlyArrayType(t *shimchecker.Type) bool {
	if t.ObjectFlags()&shimchecker.ObjectFlagsReference == 0 {
		return false
	}
	target := t.Target()
	if target == nil || target.Symbol() == nil {
		return false
	}
	return target.Symbol().Name == "ReadonlyArray"
}

// isComposableObject reports whether t is a plain user object or class instance
// the member walk can decompose: an object type with no call/construct
// signatures, no index signature, not an array/tuple, and declared in this
// project. A library global (Map, Set, Promise) is outside it — such a type is
// nominal in practice, so a structural clause per member would say nothing about
// whether a value really is one. A diverging type reached under one is refused,
// not approximated.
func (s *synthesizer) isComposableObject(t *shimchecker.Type) bool {
	if t == nil || t.Flags()&shimchecker.TypeFlagsObject == 0 {
		return false
	}
	if s.isCallable(t) {
		return false
	}
	if shimchecker.Checker_isArrayType(s.checker, t) || shimchecker.IsTupleType(t) || isReadonlyArrayType(t) {
		return false
	}
	if len(shimchecker.Checker_getIndexInfosOfType(s.checker, t)) > 0 {
		return false
	}
	return !typesurface.FromLibrary(s.prog, t)
}

// typeNameOf is the guard's display name for a parameter's type node — the
// source text typia itself names a generic argument by.
func typeNameOf(typeNode *shimast.Node) string {
	return strings.TrimSpace(shimscanner.GetTextOfNode(typeNode))
}

// alwaysPassStrategy emits the un-derivable-member fallback:
//
//	function (original, extension) {
//	    return function (...args) { return extension(this, ...args); };
//	}
func (s *synthesizer) alwaysPassStrategy() *shimast.Node {
	f := s.factory()
	inner := s.dispatcherFunction(callReceiverFirst(f, "extension"))
	return strategyFunction(f, f.NewBlock(f.NewNodeList([]*shimast.Node{f.NewReturnStatement(inner)}), true))
}

// guardedStrategy emits the guarded dispatcher:
//
//	function (original, extension) {
//	    const g0 = <guard>, g2 = <guard>;
//	    return function (...args) {
//	        return args.length >= MIN && args.length <= MAX
//	                && g0(args[0]) && (args[2] === undefined || g2(args[2]))
//	            ? extension(this, ...args)
//	            : original.call(this, ...args);
//	    };
//	}
//
// The guard consts live in the strategy's own scope, so their names can never
// collide with anything in the surrounding module.
func (s *synthesizer) guardedStrategy(guards []guardedParam, minArity, maxArity int, hasRest bool) *shimast.Node {
	f := s.factory()

	declarations := make([]*shimast.Node, 0, len(guards))
	var condition *shimast.Node
	and := func(next *shimast.Node) {
		if condition == nil {
			condition = next
			return
		}
		condition = f.NewBinaryExpression(nil, condition, nil, f.NewToken(shimast.KindAmpersandAmpersandToken), next)
	}

	argsLength := func() *shimast.Node {
		return f.NewPropertyAccessExpression(f.NewIdentifier("args"), nil, f.NewIdentifier("length"), shimast.NodeFlagsNone)
	}
	if minArity > 0 {
		and(f.NewBinaryExpression(nil, argsLength(), nil, f.NewToken(shimast.KindGreaterThanEqualsToken), numericLiteral(f, minArity)))
	}
	if !hasRest {
		and(f.NewBinaryExpression(nil, argsLength(), nil, f.NewToken(shimast.KindLessThanEqualsToken), numericLiteral(f, maxArity)))
	}

	for i, g := range guards {
		name := guardName(g.index)
		declarations = append(declarations, f.NewVariableDeclaration(f.NewIdentifier(name), nil, nil, g.guard))

		var checked *shimast.Node
		if g.kind == paramRest {
			// The rest slice is validated as a whole against the rest
			// parameter's (tuple/array) type: gN(args.slice(N)).
			slice := f.NewCallExpression(
				f.NewPropertyAccessExpression(f.NewIdentifier("args"), nil, f.NewIdentifier("slice"), shimast.NodeFlagsNone),
				nil,
				nil,
				f.NewNodeList([]*shimast.Node{numericLiteral(f, g.index)}),
				shimast.NodeFlagsNone,
			)
			checked = f.NewCallExpression(f.NewIdentifier(name), nil, nil, f.NewNodeList([]*shimast.Node{slice}), shimast.NodeFlagsNone)
		} else {
			element := f.NewElementAccessExpression(f.NewIdentifier("args"), nil, numericLiteral(f, g.index), shimast.NodeFlagsNone)
			checked = f.NewCallExpression(f.NewIdentifier(name), nil, nil, f.NewNodeList([]*shimast.Node{element}), shimast.NodeFlagsNone)
			if g.kind == paramOptional {
				// An absent optional argument matches without consulting the
				// guard (the declared type does not include undefined).
				absent := f.NewBinaryExpression(
					nil,
					f.NewElementAccessExpression(f.NewIdentifier("args"), nil, numericLiteral(f, g.index), shimast.NodeFlagsNone),
					nil,
					f.NewToken(shimast.KindEqualsEqualsEqualsToken),
					f.NewIdentifier("undefined"),
				)
				checked = f.NewParenthesizedExpression(
					f.NewBinaryExpression(nil, absent, nil, f.NewToken(shimast.KindBarBarToken), checked),
				)
			}
		}
		and(checked)
		_ = i
	}

	if condition == nil {
		// A refused rest parameter with no lower bound leaves nothing to test:
		// every call matches, which is the same dispatch the always-pass strategy
		// produces.
		return s.alwaysPassStrategy()
	}
	dispatch := f.NewConditionalExpression(
		condition,
		f.NewToken(shimast.KindQuestionToken),
		callReceiverFirst(f, "extension"),
		f.NewToken(shimast.KindColonToken),
		callOriginal(f),
	)
	inner := s.dispatcherFunction(dispatch)

	statements := []*shimast.Node{}
	if len(declarations) > 0 {
		statements = append(statements, f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList(declarations), shimast.NodeFlagsConst)))
	}
	statements = append(statements, f.NewReturnStatement(inner))
	return strategyFunction(f, f.NewBlock(f.NewNodeList(statements), true))
}

// dispatcherFunction wraps a result expression as the mounted dispatcher:
// `function (...args) { return <result>; }` — a `function` (not arrow) so
// `this` is the receiver instance, per the MergeStrategy contract.
func (s *synthesizer) dispatcherFunction(result *shimast.Node) *shimast.Node {
	f := s.factory()
	restArgs := f.NewParameterDeclaration(nil, f.NewToken(shimast.KindDotDotDotToken), f.NewIdentifier("args"), nil, nil, nil)
	body := f.NewBlock(f.NewNodeList([]*shimast.Node{f.NewReturnStatement(result)}), true)
	return f.NewFunctionExpression(nil, nil, nil, nil, f.NewNodeList([]*shimast.Node{restArgs}), nil, nil, body)
}

// strategyFunction wraps a body as the outer strategy:
// `function (original, extension) { <body> }`.
func strategyFunction(f *shimast.NodeFactory, body *shimast.Node) *shimast.Node {
	parameters := []*shimast.Node{
		f.NewParameterDeclaration(nil, nil, f.NewIdentifier("original"), nil, nil, nil),
		f.NewParameterDeclaration(nil, nil, f.NewIdentifier("extension"), nil, nil, nil),
	}
	return f.NewFunctionExpression(nil, nil, nil, nil, f.NewNodeList(parameters), nil, nil, body)
}

// callReceiverFirst emits `<name>(this, ...args)` — the receiver-first calling
// convention of an augmentation function.
func callReceiverFirst(f *shimast.NodeFactory, name string) *shimast.Node {
	return f.NewCallExpression(
		f.NewIdentifier(name),
		nil,
		nil,
		f.NewNodeList([]*shimast.Node{
			f.NewKeywordExpression(shimast.KindThisKeyword),
			f.NewSpreadElement(f.NewIdentifier("args")),
		}),
		shimast.NodeFlagsNone,
	)
}

// callOriginal emits `original.call(this, ...args)` — the this-bound fall
// through to whatever previously held the member slot.
func callOriginal(f *shimast.NodeFactory) *shimast.Node {
	return f.NewCallExpression(
		f.NewPropertyAccessExpression(f.NewIdentifier("original"), nil, f.NewIdentifier("call"), shimast.NodeFlagsNone),
		nil,
		nil,
		f.NewNodeList([]*shimast.Node{
			f.NewKeywordExpression(shimast.KindThisKeyword),
			f.NewSpreadElement(f.NewIdentifier("args")),
		}),
		shimast.NodeFlagsNone,
	)
}

// guardName is the strategy-scoped const holding parameter index's guard.
func guardName(index int) string {
	return "g" + itoa(index)
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}

func numericLiteral(f *shimast.NodeFactory, value int) *shimast.Node {
	return f.NewNumericLiteral(itoa(value), shimast.TokenFlagsNone)
}

// propertyName mints the synthesized strategy map's key: a plain identifier
// when the member name is one, else a string literal.
func propertyName(f *shimast.NodeFactory, name string) *shimast.Node {
	if isIdentifierName(name) {
		return f.NewIdentifier(name)
	}
	return f.NewStringLiteral(name, shimast.TokenFlagsNone)
}

func isIdentifierName(name string) bool {
	if name == "" {
		return false
	}
	for i, ch := range name {
		alpha := ('A' <= ch && ch <= 'Z') || ('a' <= ch && ch <= 'z') || ch == '_' || ch == '$'
		if i == 0 {
			if !alpha {
				return false
			}
			continue
		}
		if !alpha && !('0' <= ch && ch <= '9') {
			return false
		}
	}
	return true
}

// staticName reads a property name's static string form: identifier or string
// literal text; anything else (computed, numeric) yields "".
func staticName(name *shimast.Node) string {
	if name == nil {
		return ""
	}
	if name.Kind == shimast.KindIdentifier || shimast.IsStringLiteral(name) {
		return name.Text()
	}
	return ""
}

// skipWrappers unwraps `satisfies` / `as` / parenthesized wrappers down to the
// underlying expression.
func skipWrappers(expr *shimast.Node) *shimast.Node {
	for expr != nil {
		switch expr.Kind {
		case shimast.KindSatisfiesExpression:
			expr = expr.AsSatisfiesExpression().Expression
		case shimast.KindAsExpression:
			expr = expr.AsAsExpression().Expression
		case shimast.KindParenthesizedExpression:
			expr = expr.AsParenthesizedExpression().Expression
		default:
			return expr
		}
	}
	return nil
}

// functionParameters returns a function-like declaration's parameter nodes,
// or nil for anything else.
func functionParameters(fn *shimast.Node) []*shimast.Node {
	switch fn.Kind {
	case shimast.KindMethodDeclaration, shimast.KindFunctionExpression, shimast.KindArrowFunction, shimast.KindFunctionDeclaration:
		return fn.Parameters()
	}
	return nil
}

// typeParameterNames collects a member's own generic parameter names — any
// reference to one makes a parameter type un-derivable (no closed type exists
// to validate against at build time).
func typeParameterNames(fn *shimast.Node) map[string]bool {
	names := map[string]bool{}
	switch fn.Kind {
	case shimast.KindMethodDeclaration, shimast.KindFunctionExpression, shimast.KindArrowFunction, shimast.KindFunctionDeclaration:
		for _, parameter := range fn.TypeParameters() {
			if name := parameter.Name(); name != nil && name.Kind == shimast.KindIdentifier {
				names[name.Text()] = true
			}
		}
	}
	return names
}

// referencesTypeParameter reports whether a type node mentions any of the
// member's own type parameters (a syntactic walk; shadowing inside nested
// function types is not modeled — a false positive only widens the degrade).
func referencesTypeParameter(typeNode *shimast.Node, names map[string]bool) bool {
	if len(names) == 0 {
		return false
	}
	found := false
	var walk func(node *shimast.Node) bool
	walk = func(node *shimast.Node) bool {
		if node == nil || found {
			return true
		}
		if node.Kind == shimast.KindTypeReference {
			ref := node.AsTypeReferenceNode().TypeName
			if ref != nil && ref.Kind == shimast.KindIdentifier && names[ref.Text()] {
				found = true
				return true
			}
		}
		node.ForEachChild(walk)
		return false
	}
	walk(typeNode)
	return found
}

// compilerOptions mirrors typia's own nil-guarded read of the loaded
// program's compiler options.
func compilerOptions(prog *driver.Program) *shimcore.CompilerOptions {
	if prog == nil || prog.ParsedConfig == nil || prog.ParsedConfig.ParsedConfig == nil {
		return nil
	}
	return prog.ParsedConfig.ParsedConfig.CompilerOptions
}
