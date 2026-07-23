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

// transformFile lowers every registration chain in the file — wherever it
// appears in expression context, not only in a top-level expression statement —
// then runs the nameof and tokenless-resolve rewrites over the whole file (deep).
//
// Registration lowering is a single file-wide pass: buildRegistrationPlans scans
// the entire tree for registration calls, and lowerRegistrationExpression walks
// that same tree once, swapping each planned call and every `.as<"x">()` in
// place. This is what carries the immutable manifest's assignment-threaded shape
// (`services = services.addClass<I>(C).as<"scope">()`), a `const`-initializer, or
// a `return` inside a factory — none of which is a bare top-level expression
// statement.
func (c *context) transformFile(sf *shimast.SourceFile) *shimast.SourceFile {
	root := sf.AsNode()
	plans := c.buildRegistrationPlans(root)
	lowered := c.lowerRegistrationExpression(root, plans)
	lowered = c.rewriteResolve(c.rewriteNameof(lowered))
	return lowered.AsSourceFile()
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
