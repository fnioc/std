package signatures

import (
	"sort"
	"strconv"

	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokentext"
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

// serviceTokenShape classifies a service token against the open-generics grammar.
type serviceTokenShape struct {
	holes map[int]bool
	mixed bool
}

// classifyServiceToken classifies a derived service token against the open-
// template grammar.
func classifyServiceToken(token string, hasToken bool) serviceTokenShape {
	holes := map[int]bool{}
	if !hasToken {
		return serviceTokenShape{holes: holes}
	}
	parsed, ok := tokentext.ParseToken(token)
	if !ok {
		return serviceTokenShape{holes: holes}
	}
	sawConcrete := false
	sawHole := false
	for _, arg := range parsed.Args {
		if n, isHole := holeNodeNumber(arg); isHole {
			holes[n] = true
			sawHole = true
		} else {
			sawConcrete = true
			if tokentext.IsOpenToken(arg) {
				sawHole = true
			}
		}
	}
	return serviceTokenShape{holes: holes, mixed: sawHole && sawConcrete}
}

// holeNodeNumber parses a bare hole node `$N` (decimal N >= 1), or ok=false.
func holeNodeNumber(token string) (int, bool) {
	if len(token) < 2 || token[0] != '$' || token[1] < '1' || token[1] > '9' {
		return 0, false
	}
	n := 0
	for i := 1; i < len(token); i++ {
		if token[i] < '0' || token[i] > '9' {
			return 0, false
		}
		n = n*10 + int(token[i]-'0')
	}
	return n, true
}

// tokenHoles yields every hole number at any depth of a token.
func tokenHoles(token string, out map[int]bool) {
	if n, ok := holeNodeNumber(token); ok {
		out[n] = true
		return
	}
	parsed, ok := tokentext.ParseToken(token)
	if !ok {
		return
	}
	for _, arg := range parsed.Args {
		tokenHoles(arg, out)
	}
}

// slotHoles yields every hole a dep slot references (recursive over unions).
func slotHoles(slot Slot, out map[int]bool) {
	switch s := slot.(type) {
	case tokenSlot:
		tokenHoles(string(s), out)
	case typeArgSlot:
		out[s.typeArg] = true
	case factorySlot:
		tokenHoles(s.typ, out)
		for _, p := range s.params {
			tokenHoles(p, out)
		}
	case unionSlot:
		for _, m := range s.members {
			slotHoles(m, out)
		}
	}
}

// checkDepHoles verifies every hole a dep signature references is bound by the
// service template (990010).
func (c *context) checkDepHoles(signatures []signature, token string, hasToken bool, shape serviceTokenShape, anchor *shimast.Node) {
	if shape.mixed {
		return
	}
	orphans := map[int]bool{}
	for _, sig := range signatures {
		for _, slot := range sig {
			holes := map[int]bool{}
			slotHoles(slot, holes)
			for n := range holes {
				if !shape.holes[n] {
					orphans[n] = true
				}
			}
		}
	}
	if len(orphans) == 0 {
		return
	}
	list := sortedHoleList(orphans)
	c.emitError(anchor, codeDepHoleNotInServiceTemplate,
		"dependency hole(s) "+list+" are not bound by the service token \""+token+
			"\" — every hole a dependency references must appear in the service token's type arguments")
}

func sortedHoleList(holes map[int]bool) string {
	nums := make([]int, 0, len(holes))
	for n := range holes {
		nums = append(nums, n)
	}
	sort.Ints(nums)
	out := ""
	for i, n := range nums {
		if i != 0 {
			out += ", "
		}
		out += "$" + itoa(n)
	}
	return out
}
