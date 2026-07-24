package signatures

import (
	"strconv"

	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// A Slot is one positional dependency in an extracted signature: a token string,
// a factory ref, a union of alternatives, a literal value, or an open type-arg
// ref. There is no null/hole sentinel — an unresolvable type is a hard error.
type Slot interface{ isSlot() }

// tokenSlot is a plain token string.
type tokenSlot string

// factorySlot mirrors the runtime FactoryRef: `{ type }` (or `{ type, params }`).
type factorySlot struct {
	typ    string
	params []string
}

// unionSlot mirrors the runtime Union: `{ union: [...] }`.
type unionSlot struct {
	members []Slot
}

// literalSlot mirrors the runtime LiteralRef: `{ value: ... }`. Identified by
// presence, so a `value: undefined` slot is distinguishable from absence.
type literalSlot struct {
	value tokens.LiteralValue
}

// typeArgSlot mirrors the runtime TypeArgRef: `{ typeArg: N }` — an open
// `Typeof<Hole<N>>` parameter, substituted to a value slot per closing.
type typeArgSlot struct {
	typeArg int
}

func (tokenSlot) isSlot()   {}
func (factorySlot) isSlot() {}
func (unionSlot) isSlot()   {}
func (literalSlot) isSlot() {}
func (typeArgSlot) isSlot() {}

// signature is one emitted dependency signature: positional slots.
type signature = []Slot

// slotsEqual is structural slot equality (recursive over unions).
func slotsEqual(a, b Slot) bool {
	switch av := a.(type) {
	case tokenSlot:
		bv, ok := b.(tokenSlot)
		return ok && av == bv
	case typeArgSlot:
		bv, ok := b.(typeArgSlot)
		return ok && av.typeArg == bv.typeArg
	case factorySlot:
		bv, ok := b.(factorySlot)
		if !ok || av.typ != bv.typ || len(av.params) != len(bv.params) {
			return false
		}
		for i := range av.params {
			if av.params[i] != bv.params[i] {
				return false
			}
		}
		return true
	case unionSlot:
		bv, ok := b.(unionSlot)
		if !ok || len(av.members) != len(bv.members) {
			return false
		}
		for i := range av.members {
			if !slotsEqual(av.members[i], bv.members[i]) {
				return false
			}
		}
		return true
	case literalSlot:
		bv, ok := b.(literalSlot)
		return ok && av.value == bv.value
	}
	return false
}

// ── emission (slot -> AST literal) ───────────────────────────────────────────

func (c *context) stringLit(s string) *shimast.Node {
	return c.factory.NewStringLiteral(s, shimast.TokenFlagsNone)
}

func (c *context) numericLit(n int) *shimast.Node {
	return c.factory.NewNumericLiteral(strconv.Itoa(n), shimast.TokenFlagsNone)
}

func (c *context) objectLit(props []*shimast.Node) *shimast.Node {
	return c.factory.NewObjectLiteralExpression(c.factory.NewNodeList(props), false)
}

func (c *context) arrayLit(elems []*shimast.Node) *shimast.Node {
	return c.factory.NewArrayLiteralExpression(c.factory.NewNodeList(elems), false)
}

func (c *context) propAssign(name string, init *shimast.Node) *shimast.Node {
	return c.factory.NewPropertyAssignment(nil, c.factory.NewIdentifier(name), nil, nil, init)
}

// undefinedLit renders `void 0` — the package's spelling of undefined, shared
// with literalExpression's LiteralUndefined branch. It fills a positional slot
// the transformer must emit but has no value for.
func (c *context) undefinedLit() *shimast.Node {
	return c.factory.NewVoidExpression(c.factory.NewNumericLiteral("0", shimast.TokenFlagsNone))
}

// literalExpression renders a Rule-2 value as its TS literal expression:
// `void 0` for undefined, `null`, string / boolean keyword, or a numeric /
// bigint literal (negative rendered as a unary minus over the magnitude).
func (c *context) literalExpression(v tokens.LiteralValue) *shimast.Node {
	switch v.Kind {
	case tokens.LiteralNull:
		return c.factory.NewKeywordExpression(shimast.KindNullKeyword)
	case tokens.LiteralString:
		return c.stringLit(v.Str)
	case tokens.LiteralBoolean:
		if v.Bool {
			return c.factory.NewKeywordExpression(shimast.KindTrueKeyword)
		}
		return c.factory.NewKeywordExpression(shimast.KindFalseKeyword)
	case tokens.LiteralNumber:
		lit := c.factory.NewNumericLiteral(v.Text, shimast.TokenFlagsNone)
		if v.Negated {
			return c.factory.NewPrefixUnaryExpression(shimast.KindMinusToken, lit)
		}
		return lit
	case tokens.LiteralBigInt:
		lit := c.factory.NewBigIntLiteral(v.Text+"n", shimast.TokenFlagsNone)
		if v.Negated {
			return c.factory.NewPrefixUnaryExpression(shimast.KindMinusToken, lit)
		}
		return lit
	default: // LiteralUndefined
		return c.factory.NewVoidExpression(c.factory.NewNumericLiteral("0", shimast.TokenFlagsNone))
	}
}

// slotLiteral renders one slot: a string literal for a token, or an object
// literal for a factory / union / literal / type-arg slot.
func (c *context) slotLiteral(slot Slot) *shimast.Node {
	switch s := slot.(type) {
	case typeArgSlot:
		return c.objectLit([]*shimast.Node{c.propAssign("typeArg", c.numericLit(s.typeArg))})
	case unionSlot:
		members := make([]*shimast.Node, 0, len(s.members))
		for _, m := range s.members {
			members = append(members, c.slotLiteral(m))
		}
		return c.objectLit([]*shimast.Node{c.propAssign("union", c.arrayLit(members))})
	case literalSlot:
		return c.objectLit([]*shimast.Node{c.propAssign("value", c.literalExpression(s.value))})
	case factorySlot:
		props := []*shimast.Node{c.propAssign("type", c.stringLit(s.typ))}
		if len(s.params) != 0 {
			paramLits := make([]*shimast.Node, 0, len(s.params))
			for _, p := range s.params {
				paramLits = append(paramLits, c.stringLit(p))
			}
			props = append(props, c.propAssign("params", c.arrayLit(paramLits)))
		}
		return c.objectLit(props)
	case tokenSlot:
		return c.stringLit(string(s))
	}
	return c.stringLit("")
}

// slotArrayLiteral renders a SINGLE-level `[...slots]` — one overload's slot
// array (a `withSignature` append / a `signaturefor<T>()` result), as opposed to
// the two-level signatures array signaturesLiteral renders.
func (c *context) slotArrayLiteral(slots []Slot) *shimast.Node {
	elems := make([]*shimast.Node, 0, len(slots))
	for _, slot := range slots {
		elems = append(elems, c.slotLiteral(slot))
	}
	return c.arrayLit(elems)
}

// signaturesLiteral renders `[[...slots], ...]` — the inline signatures array
// (an `addClass` / `addFactory` third argument).
func (c *context) signaturesLiteral(signatures []signature) *shimast.Node {
	arrays := make([]*shimast.Node, 0, len(signatures))
	for _, sig := range signatures {
		slots := make([]*shimast.Node, 0, len(sig))
		for _, slot := range sig {
			slots = append(slots, c.slotLiteral(slot))
		}
		arrays = append(arrays, c.arrayLit(slots))
	}
	return c.arrayLit(arrays)
}
