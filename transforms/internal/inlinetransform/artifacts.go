package inlinetransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// PrimitiveUse records a primitive call the inline stage minted by substitution:
// a side-parsed callee (e.g. `nameof<T>()`) whose type arguments were bound to
// checker-valid types captured at the ORIGINAL call site. A downstream primitive
// stage reads these to lower a synthetic call it could never anchor on its own
// (the callee clone has no symbol).
//
// TypeArgs carries a TYPE-argument primitive's bound arguments (nameof<T>()).
// ValueArg carries a VALUE-argument primitive's spliced argument node
// (signatureof(ctor)) — the ORIGINAL, program-bound call-site argument, so the
// signatureof stage can checker-query it even though the primitive's own callee
// is synthetic. It is captured at registration time, so it survives any later
// tree reconstruction between the inline stage and the consuming stage.
//
// Composed carries a COMPOSED-GENERIC type argument (`tokenfor<IOptions<T>>()`)
// whose base names a body-external imported type and whose leaves bind from the
// call-site env — the shape the addOptions sugar body mints. It is disjoint from
// TypeArgs: a plain `tokenfor<T>()` records the bound type in TypeArgs and leaves
// Composed nil; a composed generic records Composed and leaves TypeArgs empty.
type PrimitiveUse struct {
	Name     string
	TypeArgs []*shimchecker.Type
	ValueArg *shimast.Node
	Composed *ComposedTypeArg
}

// ComposedTypeArg describes a spelled generic type argument a sugar body wrote
// over a body-EXTERNAL imported base (`IOptions<T>`), captured by the inline stage
// for a downstream primitive stage to lower. The base symbol is resolved late (in
// the lowering stage, which owns the token Context) from Module + Export against
// the consumer program; Args are the env-bound argument types, in order. ArgNode
// is the spelled type node, kept for diagnostic anchoring.
type ComposedTypeArg struct {
	// Module is the bare package specifier the base type is imported from
	// (`@rhombus-std/options`), read off the body's import map — DATA, never a
	// Go-source constant.
	Module string
	// Export is the imported base type's exported name (`IOptions`).
	Export string
	// Args are the composed generic's argument types, bound from the inline env;
	// a nil entry marks an argument that did not bind (the lowering reports an
	// underivable-token diagnostic for it).
	Args []*shimchecker.Type
	// ArgNode is the spelled composed type node, for diagnostic anchoring.
	ArgNode *shimast.Node
}

// MemberShape is a certified member-sugar call shape (type-arg count, value-arg
// count) — the sweep flags a surviving call of exactly this shape.
type MemberShape struct {
	TypeArgCount  int
	ValueArgCount int
}

// Artifacts is the per-run state the inline stage hands to downstream stages and
// the emit sweep. One instance lives per build (the sidecar is one-shot).
type Artifacts struct {
	// PrimitiveCalls maps a substituted primitive call node to its resolved use.
	PrimitiveCalls map[*shimast.Node]PrimitiveUse
	// SugarMembers maps a certified member name to its sugar call shape, for the
	// emit sweep's member-sugar residue check.
	SugarMembers map[string]MemberShape
	// SugarFunctions maps a certified free-function name to its declaring package,
	// for the emit sweep's free-function residue check.
	SugarFunctions map[string]string
	// Active is set once the inline stage is selected AND at least one entry
	// resolved non-inert; the sweep and the nameof handoff key off it.
	Active bool
}

// NewArtifacts builds an empty, inactive Artifacts.
func NewArtifacts() *Artifacts {
	return &Artifacts{
		PrimitiveCalls: map[*shimast.Node]PrimitiveUse{},
		SugarMembers:   map[string]MemberShape{},
		SugarFunctions: map[string]string{},
	}
}
