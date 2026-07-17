package inlinetransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// PrimitiveUse records a primitive call the inline stage minted by substitution:
// a side-parsed callee (e.g. `nameof<T>()`) whose type arguments were bound to
// checker-valid types captured at the ORIGINAL call site. The nameof stage reads
// these to lower a synthetic call it could never anchor on its own (the callee
// clone has no symbol).
type PrimitiveUse struct {
	Name     string
	TypeArgs []*shimchecker.Type
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
