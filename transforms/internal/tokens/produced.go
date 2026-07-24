package tokens

import (
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// ProducedTypeOf returns the type a VALUE produces for service-token derivation:
// the construct-signature return type of a constructable value, the
// call-signature return type of a callable value, else the value's own type. It
// is the semantics of the value-argument `tokenfor(value)` primitive — the
// self-registration token derivation lifted out of the di stage's inferredRegType
// (ditransform/lower.go) so a no-type-arg `addClass(Ctor)` derives the same
// service token a direct `addClass<Instance>(Ctor)` would: a constructable value
// tokenizes as the instance it builds, a callable value as what it returns, and
// any other value as itself.
//
// It is deliberately method-agnostic: the primitive sees only a value, never the
// registration verb, so a value that is ITSELF constructable/callable (a class or
// factory registered through `addValue`) unwraps here, where the di stage's
// addValue path keeps the raw type. That case is degenerate — registering a
// constructor as an already-built value — and every ordinary value has neither
// signature and returns unchanged, so the derivation matches the di stage for
// every non-degenerate input.
func ProducedTypeOf(checker *shimchecker.Checker, t *shimchecker.Type) *shimchecker.Type {
	if t == nil {
		return nil
	}
	if ctorSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindConstruct); len(ctorSigs) != 0 {
		return checker.GetReturnTypeOfSignature(ctorSigs[0])
	}
	if callSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindCall); len(callSigs) != 0 {
		return checker.GetReturnTypeOfSignature(callSigs[0])
	}
	return t
}
