// Package ditransform is the Go port of the registration transformer: it lowers
// the type-driven authoring forms (`addClass<I>(C)`, `.as<"x">()`, tokenless
// `resolve<I>()` / `isService<I>()`, and `nameof<T>()`) to their string-token
// runtime forms over the ttsc-shipped typescript-go checker, carrying the
// derived dependency signature inline on each registration. It is the emit-path
// twin of the hand-written TypeScript transformer; both derive identical tokens
// from the shared token core.
package ditransform

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
	// cover the produced constructor's caller-supplied holes.
	codeFactorySignatureMismatch = "990003"
	// codeUnderivableToken: a parameter type has no derivable token and no
	// `Inject<T,"tok">` brand.
	codeUnderivableToken = "990006"
	// codeUnboundTypeParameter: a type reaches derivation still referencing an
	// unbound type parameter (a bare generic class registered without an
	// instantiation expression).
	codeUnboundTypeParameter = "990007"
	// codeMixedServiceTokenArgs: an open service token mixes concrete args and
	// holes.
	codeMixedServiceTokenArgs = "990008"
	// codeOpenTokenOnValueOrFactory: an open template token on an addValue /
	// factory registration.
	codeOpenTokenOnValueOrFactory = "990009"
	// codeDepHoleNotInServiceTemplate: a dependency slot references a hole the
	// service template does not bind.
	codeDepHoleNotInServiceTemplate = "990010"
	// codeUnresolvableOverrideElement: a registration-time override element is
	// neither a string-literal token nor an undefined/elision gap.
	codeUnresolvableOverrideElement = "990011"
)

// Category distinguishes a hard error (fails emit) from an advisory warning.
type Category int

const (
	// Error is a hard diagnostic that fails the build.
	Error Category = iota
	// Warning is advisory and does not fail the build.
	Warning
)

// Diagnostic is one transformer-raised diagnostic destined for the sidecar
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
// sink. It is the Go analog of the reference LowerContext.
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
