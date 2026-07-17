package configtransform

// The one new algorithm: a checker type -> runtime `Schema` object literal.
//
// Given the `.withType<T>()` type argument, synthesize the `withSchema({...})`
// literal the runtime coerces against. Leaves map to kind-name strings
// ("string" / "number" / "boolean"); nesting recurses into a nested object
// literal; an optional field wraps as `{ [OPTIONAL]: innerSchema }`.
//
// Correctness invariants:
//   - WIDE BOOLEAN before UNION. Intrinsic `boolean` is modeled as `false | true`
//     and carries BOTH the Union AND Boolean flags; it must be classified as
//     "boolean" before any union reaches the unsupported branch.
//   - No explicit union branch. The runtime Schema has no union kind, so any
//     non-boolean union is unsupported by construction.
//   - Optionality is decided SOLELY by the `?` modifier (SymbolFlagsOptional).
//     The inner type is stripped of null/undefined via GetNonNullableType before
//     recursing.
//   - Unsupported anything aborts the WHOLE call rewrite (a failed flag) — never a
//     silent partial.

import (
	"regexp"

	"github.com/fnioc/std/transforms/internal/tokens"
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// codegenContext threads everything the schema walk needs.
type codegenContext struct {
	checker       *shimchecker.Checker
	program       *driver.Program
	factory       *shimast.NodeFactory
	sourceFile    *shimast.SourceFile
	optionalRef   *optionalRef
	addDiagnostic func(code, message string, anchor *shimast.Node)
}

// walkState carries the abort flag across the recursive schema walk.
type walkState struct {
	failed bool
}

// schemaLiteralForTypeNode synthesizes the `withSchema` object literal for the
// `.withType<T>()` type argument. It returns (literal, true) on success, or
// (nil, false) — pushing a diagnostic — if the root is not an object type or any
// field is unsupported.
func schemaLiteralForTypeNode(ctx *codegenContext, typeNode *shimast.Node) (*shimast.Node, bool) {
	t := ctx.checker.GetTypeFromTypeNode(typeNode)
	if !isAcceptableRecord(ctx, t) {
		ctx.addDiagnostic(codeNonObjectRoot, messageNonObjectRoot, typeNode)
		return nil, false
	}
	state := &walkState{}
	literal := objectLiteralForType(ctx, t, typeNode, state)
	if state.failed {
		return nil, false
	}
	return literal, true
}

// objectLiteralForType builds the `{ key: schema, ... }` literal for an accepted
// record type.
func objectLiteralForType(ctx *codegenContext, t *shimchecker.Type, anchor *shimast.Node, state *walkState) *shimast.Node {
	f := ctx.factory
	properties := []*shimast.Node{}
	for _, sym := range shimchecker.Checker_getPropertiesOfType(ctx.checker, t) {
		decl := propertyDeclaration(sym, anchor)
		propType := ctx.checker.GetTypeOfSymbolAtLocation(sym, decl)
		key := propertyKey(f, sym.Name)
		optional := sym.Flags&shimast.SymbolFlagsOptional != 0

		if optional {
			// Strip null/undefined, then wrap: `{ [OPTIONAL]: innerSchema }`.
			inner := ctx.checker.GetNonNullableType(propType)
			innerExpr := schemaForType(ctx, inner, decl, state)
			ctx.optionalRef.used = true
			wrapper := f.NewObjectLiteralExpression(
				f.NewNodeList([]*shimast.Node{
					f.NewPropertyAssignment(
						nil,
						f.NewComputedPropertyName(ctx.optionalRef.expr(f)),
						nil,
						nil,
						innerExpr,
					),
				}),
				false,
			)
			properties = append(properties, f.NewPropertyAssignment(nil, key, nil, nil, wrapper))
			continue
		}
		properties = append(properties, f.NewPropertyAssignment(nil, key, nil, nil, schemaForType(ctx, propType, decl, state)))
	}
	return f.NewObjectLiteralExpression(f.NewNodeList(properties), true)
}

// propertyDeclaration picks the AST node a property's type is read at: its value
// declaration, else its first declaration, else the enclosing anchor.
func propertyDeclaration(sym *shimast.Symbol, anchor *shimast.Node) *shimast.Node {
	if sym.ValueDeclaration != nil {
		return sym.ValueDeclaration
	}
	if len(sym.Declarations) > 0 {
		return sym.Declarations[0]
	}
	return anchor
}

// schemaForType classifies a leaf/nested type into its schema expression. ORDER
// IS LOAD-BEARING: wide boolean is checked before any union handling.
func schemaForType(ctx *codegenContext, t *shimchecker.Type, anchor *shimast.Node, state *walkState) *shimast.Node {
	f := ctx.factory
	flags := t.Flags()
	// 1. Wide boolean (`false | true`) FIRST — it carries both Union and Boolean
	//    flags; must not fall through to the union/unsupported branch.
	if flags&shimchecker.TypeFlagsBoolean != 0 {
		return f.NewStringLiteral("boolean", shimast.TokenFlagsNone)
	}
	// 2/3. String / number.
	if flags&shimchecker.TypeFlagsString != 0 {
		return f.NewStringLiteral("string", shimast.TokenFlagsNone)
	}
	if flags&shimchecker.TypeFlagsNumber != 0 {
		return f.NewStringLiteral("number", shimast.TokenFlagsNone)
	}
	// 4. Nested record -> recurse.
	if isAcceptableRecord(ctx, t) {
		return objectLiteralForType(ctx, t, anchor, state)
	}
	// 5. Anything else (non-boolean union, array/tuple, function, library global,
	//    index-signature record, literal, ...) is unsupported.
	state.failed = true
	ctx.addDiagnostic(codeUnsupportedType, messageUnsupportedType, anchor)
	// Emit a harmless placeholder; the failed flag aborts the whole rewrite.
	return f.NewStringLiteral("string", shimast.TokenFlagsNone)
}

// isAcceptableRecord reports whether t is a plain user record the walk can recurse
// into: an object type with no call/construct signatures, not an array/tuple, no
// index signature, and not a library / third-party global. Pure predicate — pushes
// no diagnostics.
func isAcceptableRecord(ctx *codegenContext, t *shimchecker.Type) bool {
	if t == nil {
		return false
	}
	if t.Flags()&shimchecker.TypeFlagsObject == 0 {
		return false
	}
	if len(shimchecker.Checker_getSignaturesOfType(ctx.checker, t, shimchecker.SignatureKindCall)) > 0 {
		return false
	}
	if len(shimchecker.Checker_getSignaturesOfType(ctx.checker, t, shimchecker.SignatureKindConstruct)) > 0 {
		return false
	}
	if shimchecker.Checker_isArrayType(ctx.checker, t) || shimchecker.IsTupleType(t) {
		return false
	}
	// Any index signature (string / number / symbol) disqualifies a record — a
	// coerced schema has no index-signature representation.
	if len(shimchecker.Checker_getIndexInfosOfType(ctx.checker, t)) > 0 {
		return false
	}
	if isLibraryOrExternal(ctx, t) {
		return false
	}
	return true
}

// isLibraryOrExternal reports whether the type's symbol is declared entirely in a
// default library file or under `node_modules` — i.e. a built-in / third-party
// global (Date, Map, RegExp, Promise, ...) rather than a user interface / type
// literal.
func isLibraryOrExternal(ctx *codegenContext, t *shimchecker.Type) bool {
	symbol := t.Symbol()
	if symbol == nil {
		symbol = tokens.AliasSymbol(t)
	}
	if symbol == nil {
		return false
	}
	declarations := symbol.Declarations
	if len(declarations) == 0 {
		return false
	}
	for _, decl := range declarations {
		file := shimast.GetSourceFileOfNode(decl)
		if file == nil {
			return false
		}
		if !ctx.program.TSProgram.IsSourceFileDefaultLibrary(file.Path()) && !isUnderNodeModules(file.FileName()) {
			return false
		}
	}
	return true
}

var nodeModulesSegment = regexp.MustCompile(`/node_modules/`)

func isUnderNodeModules(fileName string) bool {
	return nodeModulesSegment.MatchString(fileName)
}

var jsIdentifier = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)

// propertyKey builds a property-name node preserving the interface's exact
// casing: a bare identifier when the name is a valid JS identifier, else a string
// literal. `Host` stays `Host`.
func propertyKey(f *shimast.NodeFactory, name string) *shimast.Node {
	if jsIdentifier.MatchString(name) {
		return f.NewIdentifier(name)
	}
	return f.NewStringLiteral(name, shimast.TokenFlagsNone)
}
