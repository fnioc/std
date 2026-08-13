// Package signatures is the shared constructor/factory dependency-type
// extraction engine. It derives the `Type.ctor(...)` / `Type.func(...)` node a
// class or factory VALUE lowers to — the value-inspection half of a
// registration — over the ttsc-shipped typescript-go checker, reusing
// typefor's own type-classification narrowing (tokens.DeriveTyped). The
// signatureof primitive stage drives it; the emitted node is exactly the third
// argument a hand-written `addClass("token", ctor, Type.ctor(...))`
// registration carries.
//
// It carries no service-token / registration-verb knowledge (token derivation,
// override merging, open-template classification) — those belong to the
// manifest verbs themselves. Only the value-type extraction lives here.
package signatures

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// Stable diagnostic codes — part of the observable surface, asserted on by
// name rather than message text.
const (
	// codeUnderivableToken: a dependency's type has no derivable shape (an
	// anonymous / structural type with no stable name).
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
// context plus the per-file checker, node factory, source file, `Type` import
// binding, parse anchor, and diagnostic sink.
type context struct {
	tokens  *tokens.Context
	checker *shimchecker.Checker
	factory *shimast.NodeFactory
	sf      *shimast.SourceFile
	binding *valueimport.Binding
	addDiag func(Diagnostic)
	// parseAnchor resolves a node to the pristine parse node before the checker is
	// asked about it — the engine-wide rule (plugin.CheckerAnchor).
	parseAnchor plugin.CheckerAnchor
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
