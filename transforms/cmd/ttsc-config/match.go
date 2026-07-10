package main

// Recognizing `.withType<T>()` on a ConfigurationBuilder.
//
// `.withType` is the config family's opt-in authoring surface. It is matched
// structurally: a property-access call named `withType`, exactly one type
// argument, zero value arguments, whose receiver's type is symbol-named
// `ConfigurationBuilder`. The name-based receiver check mirrors the hand-written
// transformer — a user-defined method of the same name on a
// ConfigurationBuilder-symboled type is expected to be the config `withType`.

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

const (
	withTypeName = "withType"
	builderName  = "ConfigurationBuilder"
)

// isWithTypeCall reports whether call is a `<receiver>.withType<T>()` call whose
// receiver's type is (or resolves through) a `ConfigurationBuilder`. It requires
// a property-access callee named `withType`, exactly ONE type argument, ZERO
// value arguments, and a ConfigurationBuilder-symboled receiver.
func isWithTypeCall(checker *shimchecker.Checker, call *shimast.CallExpression) bool {
	callee := call.Expression
	if callee == nil || callee.Kind != shimast.KindPropertyAccessExpression {
		return false
	}
	access := callee.AsPropertyAccessExpression()
	if access.Name() == nil || access.Name().Text() != withTypeName {
		return false
	}
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return false
	}
	if call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		return false
	}
	return receiverIsBuilder(checker, access.Expression)
}

// receiverIsBuilder reports whether expr's type is (or resolves to) a
// ConfigurationBuilder. The generic instance `ConfigurationBuilder<Infer<S>>`
// presents its symbol through the apparent type, so that is checked too.
func receiverIsBuilder(checker *shimchecker.Checker, expr *shimast.Node) bool {
	if expr == nil {
		return false
	}
	t := checker.GetTypeAtLocation(expr)
	if t == nil {
		return false
	}
	if typeNamedBuilder(t) {
		return true
	}
	return typeNamedBuilder(checker.GetApparentType(t))
}

// typeNamedBuilder reports whether the type's symbol is named
// `ConfigurationBuilder`.
func typeNamedBuilder(t *shimchecker.Type) bool {
	if t == nil {
		return false
	}
	symbol := t.Symbol()
	if symbol == nil {
		return false
	}
	return symbol.Name == builderName
}
