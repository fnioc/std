package signatures

import (
	"strconv"

	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// itoa renders an int as decimal — a local spelling so diagnostic messages read
// the same as the reference transformer's.
func itoa(n int) string {
	return strconv.Itoa(n)
}

// isFactoryArg reports whether a registration value argument is an inline
// factory (an arrow or function expression), as opposed to a class reference.
func isFactoryArg(arg *shimast.Node) bool {
	return arg.Kind == shimast.KindArrowFunction || arg.Kind == shimast.KindFunctionExpression
}

// classSignatureFromExtraction returns the class signatures and runs the §4.5
// factory-param check.
func (c *context) classSignatureFromExtraction(extraction *constructorExtraction) []signature {
	c.checkExtractedRegistration(extraction)
	return extraction.signatures
}
