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
// The guards are typia `createIs<T>()` validators, generated IN-PROCESS by
// typia's native Go programmers (an embed, not a second compiler pass): this
// stage mints a transient `createIs` call around each parameter's ORIGINAL
// type node and hands it straight to typia's CreateIsTransformer over the same
// loaded program, checker, and EmitContext. Driving typia per-call is the only
// workable composition — typia's own per-file walk anchors on
// GetResolvedSignature of the callee, which a synthesized call (in a program
// that never imports typia) can never satisfy. The producer→consumer ordering
// problem dissolves for the same reason: synthesis and lowering happen in one
// function call, so nothing typia-shaped ever survives into the emitted tree.
//
// §87 containment: the emitted guards are self-contained plain JS. A guard
// that would need one of typia's runtime helper imports is DROPPED (that
// parameter simply goes unguarded) with a warning diagnostic — the published
// artifacts must never grow a typia runtime import. typia stays a build-time
// dependency of the in-repo-only ttsc-std-full host; the published ttsc-std
// never links this package.
//
// Degradation contract (per the issue, owner-acked): a parameter whose type is
// un-derivable — no annotation, `any`/`unknown`, or a reference to the
// member's own type parameters — contributes no guard. A member with NO
// derivable parameter gets the bare always-pass strategy: that extension wins
// and chain order breaks ties, mirroring the reference's ambiguous-overload
// resolution. A member whose name the call's own hand-authored merge object
// already covers is left entirely alone (hand-authored WINS — enforced twice:
// covered names are skipped here, and the original merge expression is spread
// LAST over the synthesized map).
package mergesynthtransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimcore "github.com/microsoft/typescript-go/shim/core"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"
	nativecontext "github.com/samchon/typia/packages/typia/native/core/context"
	nativeprogrammers "github.com/samchon/typia/packages/typia/native/core/programmers"
	nativetransform "github.com/samchon/typia/packages/typia/native/transform"
	nativefeatures "github.com/samchon/typia/packages/typia/native/transform/features"

	"github.com/fnioc/std/transforms/internal/plugin"
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
			continue
		}
		guards = append(guards, guardedParam{index: i, kind: kind, guard: guard})
	}

	// The issue's degradation contract: no derivable parameter type at all ->
	// bare always-pass. Arity bounds alone would be derivable here, but the
	// owner-acked semantics for the un-derivable member are "that extension
	// silently wins", so the bounds ride along only when a real type guard
	// exists to give them meaning.
	if len(guards) == 0 {
		return s.alwaysPassStrategy()
	}
	return s.guardedStrategy(guards, minArity, maxArity, hasRest)
}

// synthesizeGuard runs typia's createIs programmer over one parameter's
// ORIGINAL type node and returns the guard function expression. A typia
// TransformerError (unsupported type, unresolved shape) surfaces as a panic;
// it is recovered here and the parameter degrades to unguarded — under this
// stage nothing ever fails the build over a merge guard. A guard that
// requested a typia runtime helper import is likewise dropped (§87: the
// emitted JS must stay typia-free), with a warning naming the member.
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

	f := s.factory()
	// A transient createIs call: never inserted into the tree, only the vehicle
	// typia's GenericTransformer expects. Its single type argument is the
	// parameter's original (checker-resolvable) type node.
	minted := f.NewCallExpression(
		f.NewIdentifier("createIs"),
		nil,
		f.NewNodeList([]*shimast.Node{typeNode}),
		f.NewNodeList(nil),
		shimast.NodeFlagsNone,
	)
	task := nativefeatures.CreateIsTransformer.Transform(nativeprogrammers.IsProgrammer_IConfig{})
	out := task(nativetransform.ITransformProps{
		Context:    context,
		Expression: minted.AsCallExpression(),
	})
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

	dispatch := f.NewConditionalExpression(
		condition,
		f.NewToken(shimast.KindQuestionToken),
		callReceiverFirst(f, "extension"),
		f.NewToken(shimast.KindColonToken),
		callOriginal(f),
	)
	inner := s.dispatcherFunction(dispatch)

	statements := []*shimast.Node{
		f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList(declarations), shimast.NodeFlagsConst)),
		f.NewReturnStatement(inner),
	}
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
