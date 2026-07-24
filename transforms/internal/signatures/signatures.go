// Package signatures is the shared constructor/factory dependency-signature
// extraction engine. It derives the `[[...]]` dependency-signature array a class
// or factory VALUE lowers to — the value-inspection half of a registration —
// over the ttsc-shipped typescript-go checker, and the type-argument minting
// twins (`signaturefor<T>()` / `signaturesfor<T>()`) that observe an explicit
// dependency tuple. The signatureof primitive stage drives it; the emitted
// literal is byte-identical to the third argument a hand-written
// `addClass("token", ctor, [[...]])` registration carries.
//
// It carries no service-token / registration-verb knowledge (token derivation,
// override merging, open-template classification) — those belonged to the deleted
// registration stage. Only the value-signature extraction, the §4.5 factory-param
// check, and the dependency-hole check a fully-lowered registration's sibling
// token enables live here.
package signatures

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// Stable diagnostic codes — part of the observable surface, asserted on by name
// rather than message text. Kept byte-identical to the reference transformer.
const (
	// codeFactorySignatureMismatch: a factory param's call signature does not
	// cover the produced constructor's caller-supplied holes (§4.5).
	codeFactorySignatureMismatch = "990003"
	// codeUnderivableToken: a parameter type has no derivable token and no
	// `Inject<T,"tok">` brand.
	codeUnderivableToken = "990006"
	// codeUnboundTypeParameter: a type reaches derivation still referencing an
	// unbound type parameter (a bare generic class registered without an
	// instantiation expression).
	codeUnboundTypeParameter = "990007"
)

// Category distinguishes a hard error (fails emit) from an advisory warning.
type Category int

const (
	// Error is a hard diagnostic that fails the build.
	Error Category = iota
	// Warning is advisory and does not fail the build.
	Warning
)

// Diagnostic is one extractor-raised diagnostic destined for the sidecar
// envelope. File is the absolute declaring path; Start is the anchor node's
// position (informational — the envelope carries code + message, not position).
type Diagnostic struct {
	File     string
	Start    int
	Code     string
	Category Category
	Message  string
}

// context is the per-file lowering context: the program-wide token derivation
// context plus the per-file checker, node factory, source file, and diagnostic
// sink.
type context struct {
	tokens  *tokens.Context
	checker *shimchecker.Checker
	factory *shimast.NodeFactory
	sf      *shimast.SourceFile
	addDiag func(Diagnostic)
	ec      *shimprinter.EmitContext
}

// emitError raises a hard diagnostic anchored at node.
func (c *context) emitError(node *shimast.Node, code, message string) {
	c.emit(Error, node, code, message)
}

// emitWarning raises an advisory diagnostic anchored at node.
func (c *context) emitWarning(node *shimast.Node, code, message string) {
	c.emit(Warning, node, code, message)
}

func (c *context) emit(category Category, node *shimast.Node, code, message string) {
	start := 0
	file := ""
	if c.sf != nil {
		file = c.sf.FileName()
	}
	if node != nil {
		start = node.Pos()
	}
	c.addDiag(Diagnostic{
		File:     file,
		Start:    start,
		Code:     code,
		Category: category,
		Message:  message,
	})
}
