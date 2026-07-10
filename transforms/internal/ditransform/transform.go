package ditransform

import (
	"strconv"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// FileTransform rewrites one source file inside a shared EmitContext.
type FileTransform func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile

// New builds the per-file registration transform from a loaded program, the
// program-wide token derivation context, and a diagnostic sink.
func New(prog *driver.Program, ctx *tokens.Context, addDiagnostic func(Diagnostic)) FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		c := &context{
			tokens:  ctx,
			checker: checker,
			factory: ec.Factory.AsNodeFactory(),
			sf:      sf,
			addDiag: addDiagnostic,
			ec:      ec,
		}
		return c.transformFile(sf)
	}
}

// transformFile lowers each top-level statement's registration chain, then runs
// the nameof and tokenless-resolve rewrites over every statement (deep).
func (c *context) transformFile(sf *shimast.SourceFile) *shimast.SourceFile {
	var out []*shimast.Node
	for _, statement := range sf.Statements.Nodes {
		batch := c.lowerStatement(statement)
		if batch == nil {
			batch = []*shimast.Node{statement}
		}
		for _, s := range batch {
			out = append(out, c.rewriteResolve(c.rewriteNameof(s)))
		}
	}
	return c.factory.UpdateSourceFile(sf, c.factory.NewNodeList(out), sf.EndOfFileToken).AsSourceFile()
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
