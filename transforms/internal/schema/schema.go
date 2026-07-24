// Package schema is the engine's checker-type -> runtime `Schema` object-literal
// walk — the one config-schema algorithm, extracted so BOTH the config `.withType`
// stage (the parity oracle, until its phase-3 deletion) AND the generic
// `schemaof<T>()` primitive lower against the SAME code, byte-identical by
// construction.
//
// Given a resolved record type, it synthesizes the `{...}` literal the runtime
// coerces against. Leaves map to kind-name strings ("string" / "number" /
// "boolean"); nesting recurses into a nested object literal; an optional field
// wraps as `{ [OPTIONAL]: innerSchema }`.
//
// The walk is domain-free in MECHANISM (a generic type->schema traversal). Its one
// piece of config-schema vocabulary is the optional-wrapper marker, whose runtime
// identity (`@rhombus-std/config:OPTIONAL`) travels as DATA — the OptionalMarker
// Ref threaded through a valueimport.Binding — never branched on in control flow.
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
//   - Unsupported anything aborts the WHOLE literal (a failed flag) — never a
//     silent partial.
package schema

import (
	"regexp"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// Diagnostic codes for the schema walk. The high offset keeps them clear of
// TypeScript's own code space; they are part of the transformer's observable
// surface. Both are errors — the walk never emits a warning and never a silent
// partial: an unsupported type aborts the whole literal and reports a hard error.
// The codes and message text are shared by the config `.withType` stage and the
// `schemaof<T>()` primitive so the two paths are interchangeable.
const (
	// CodeUnsupportedType marks a field whose type has no runtime schema
	// representation — a union (other than the intrinsic boolean), an
	// array/tuple, a function/callable, a library global, or an index-signature
	// record.
	CodeUnsupportedType = "992001"
	// CodeNonObjectRoot marks a schema root type that is not an object type — a
	// bare leaf or other non-record.
	CodeNonObjectRoot = "992002"
)

// MessageNonObjectRoot / MessageUnsupportedType are the exact diagnostic texts,
// shared by both lowering paths.
const MessageNonObjectRoot = "withType<T>() requires T to be an object type. A bare leaf or non-record " +
	"type has no top-level schema; wrap your fields in an interface or " +
	"object type."

const MessageUnsupportedType = "unsupported type for a configuration field. The runtime schema supports " +
	"string, number, boolean, and nested object types only -- name the field " +
	"with one of those (unions, arrays, functions, and library types like Date " +
	"have no schema representation)."

// OptionalMarker is the runtime identity of the optional-field wrapper key — the
// `OPTIONAL` unique symbol re-exported from the config barrel. It is the single
// place this identity is named, threaded to valueimport as DATA so the injection
// mechanism stays generic and both lowering paths inject the SAME import.
var OptionalMarker = valueimport.Ref{Module: "@rhombus-std/config", Export: "OPTIONAL"}

// Context threads everything the schema walk needs. Optional is the resolved
// value-import binding for the OPTIONAL wrapper symbol; the walk sets its Used
// flag when it emits at least one wrapper, and the caller materializes the import
// via valueimport.Ensure afterward.
type Context struct {
	Checker       *shimchecker.Checker
	Program       *driver.Program
	Factory       *shimast.NodeFactory
	Optional      *valueimport.Binding
	AddDiagnostic func(code, message string, anchor *shimast.Node)
}

// walkState carries the abort flag across the recursive schema walk.
type walkState struct {
	failed bool
}

// LiteralForType synthesizes the runtime `withSchema` object literal for a schema
// root type t (anchor is the node diagnostics point at). It returns (literal,
// true) on success, or (nil, false) — pushing a diagnostic — if the root is not an
// object type or any field is unsupported.
func LiteralForType(ctx *Context, t *shimchecker.Type, anchor *shimast.Node) (*shimast.Node, bool) {
	if !isAcceptableRecord(ctx, t) {
		ctx.AddDiagnostic(CodeNonObjectRoot, MessageNonObjectRoot, anchor)
		return nil, false
	}
	state := &walkState{}
	literal := objectLiteralForType(ctx, t, anchor, state)
	if state.failed {
		return nil, false
	}
	return literal, true
}

// objectLiteralForType builds the `{ key: schema, ... }` literal for an accepted
// record type.
func objectLiteralForType(ctx *Context, t *shimchecker.Type, anchor *shimast.Node, state *walkState) *shimast.Node {
	f := ctx.Factory
	properties := []*shimast.Node{}
	for _, sym := range shimchecker.Checker_getPropertiesOfType(ctx.Checker, t) {
		decl := propertyDeclaration(sym, anchor)
		propType := ctx.Checker.GetTypeOfSymbolAtLocation(sym, decl)
		key := propertyKey(f, sym.Name)
		optional := sym.Flags&shimast.SymbolFlagsOptional != 0

		if optional {
			// Strip null/undefined, then wrap: `{ [OPTIONAL]: innerSchema }`.
			inner := ctx.Checker.GetNonNullableType(propType)
			innerExpr := schemaForType(ctx, inner, decl, state)
			ctx.Optional.Used = true
			wrapper := f.NewObjectLiteralExpression(
				f.NewNodeList([]*shimast.Node{
					f.NewPropertyAssignment(
						nil,
						f.NewComputedPropertyName(ctx.Optional.Expr(f)),
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
func schemaForType(ctx *Context, t *shimchecker.Type, anchor *shimast.Node, state *walkState) *shimast.Node {
	f := ctx.Factory
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
	ctx.AddDiagnostic(CodeUnsupportedType, MessageUnsupportedType, anchor)
	// Emit a harmless placeholder; the failed flag aborts the whole literal.
	return f.NewStringLiteral("string", shimast.TokenFlagsNone)
}

// isAcceptableRecord reports whether t is a plain user record the walk can recurse
// into: an object type with no call/construct signatures, not an array/tuple, no
// index signature, and not a library / third-party global. Pure predicate — pushes
// no diagnostics.
func isAcceptableRecord(ctx *Context, t *shimchecker.Type) bool {
	if t == nil {
		return false
	}
	if t.Flags()&shimchecker.TypeFlagsObject == 0 {
		return false
	}
	if len(shimchecker.Checker_getSignaturesOfType(ctx.Checker, t, shimchecker.SignatureKindCall)) > 0 {
		return false
	}
	if len(shimchecker.Checker_getSignaturesOfType(ctx.Checker, t, shimchecker.SignatureKindConstruct)) > 0 {
		return false
	}
	if shimchecker.Checker_isArrayType(ctx.Checker, t) || shimchecker.IsTupleType(t) {
		return false
	}
	// Any index signature (string / number / symbol) disqualifies a record — a
	// coerced schema has no index-signature representation.
	if len(shimchecker.Checker_getIndexInfosOfType(ctx.Checker, t)) > 0 {
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
func isLibraryOrExternal(ctx *Context, t *shimchecker.Type) bool {
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
		if !ctx.Program.TSProgram.IsSourceFileDefaultLibrary(file.Path()) && !isUnderNodeModules(file.FileName()) {
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
