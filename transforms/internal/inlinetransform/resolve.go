package inlinetransform

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// Resolved is a resolved inline entry: the declaration set the MARKER names, the
// subset of it mapped to the inline body (the sugar overload declarations), and
// the side-parsed body itself.
type Resolved struct {
	Owned    OwnedEntry
	Kind     EntryKind
	Module   string // the declaring package a surviving call must import Member from
	TypeName string
	Member   string // member name (member kind) or floater's export name (floater kind)
	// TypeSymbol is the merged symbol of the type the marker named, against which
	// a call's RECEIVER is tested. Nil for a floater, which has no receiver.
	TypeSymbol *shimast.Symbol
	Body       *ResolvedBody
	DeclMap    map[*shimast.Node]*ResolvedBody // sugar declarations → body
	MemberSet  map[*shimast.Node]bool          // every declaration of the member on the marker's surface
}

// Shape is the call shape this entry's sugar accepts. The matcher and the emit
// sweep test a call against this one predicate, so a call the matcher would claim
// is exactly the call the sweep reports when nothing claimed it.
func (r *Resolved) Shape() MemberShape {
	return MemberShape{
		TypeArgCount:     r.Body.Discriminator.TypeParamCount,
		MinValueArgCount: r.Body.RequiredParams,
		MaxValueArgCount: len(r.Body.Params),
	}
}

// ResolveOutcome classifies what resolving one entry against a program found.
type ResolveOutcome int

const (
	// OutcomeAbsent: the entry's package has no witness anywhere in the program —
	// a dependency this file set never imports. Nothing on that surface can be
	// called here, so the entry contributes nothing at all, not even to the sweep.
	OutcomeAbsent ResolveOutcome = iota
	// OutcomeActive: the marker's declaration set carries a declaration the body
	// serves. Calls to it inline.
	OutcomeActive
	// OutcomeUnmatched: the marker's surface is in the program and declares the
	// named member, but no declaration of it matches the body's shape — the
	// package publishing the sugar overload is on the dependency graph while its
	// declarations are not loaded. Nothing can inline, and a call written in the
	// sugar's shape anyway is emit residue, so the entry still contributes its
	// shape to the sweep.
	OutcomeUnmatched
)

// Resolve resolves one owned entry against the consumer program, reporting which
// of the three outcomes it reached — or a hard error, when the marker and the
// program disagree in a way no configuration explains.
func Resolve(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, ResolveOutcome, error) {
	e := owned.Entry
	kind, status := e.Kind()
	switch status {
	case StatusMalformed:
		return nil, OutcomeAbsent, fmt.Errorf("INLINE_ENTRY_SHAPE: entry matches no grammar row (type=%q impl=%q member=%q)", e.Type, e.Impl, e.Member)
	case StatusUncertified:
		return nil, OutcomeAbsent, fmt.Errorf("INLINE_KIND_UNCERTIFIED: entry is a specced-but-not-yet-certified shape (own-body instance members and static members are not certified) (type=%q impl=%q member=%q)", e.Type, e.Impl, e.Member)
	}

	if kind == KindFloater {
		return resolveFloater(prog, checker, ex, owned)
	}
	return resolveMember(prog, checker, ex, owned)
}

// resolveMember resolves an ambient instance-member entry: type reference →
// module symbol → type symbol → the marker's declaration set → the sugar-overload
// declarations discriminated to the inline body.
func resolveMember(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, ResolveOutcome, error) {
	e := owned.Entry
	typeRef, err := ParseTypeRef(e.Type)
	if err != nil {
		return nil, OutcomeAbsent, fmt.Errorf("INLINE_ENTRY_SHAPE: %w", err)
	}
	pkg, typeName := typeRef.From, typeRef.Name

	moduleSym := resolveModuleSymbol(prog, checker, pkg)
	if moduleSym == nil {
		return nil, OutcomeAbsent, nil // no witness — module not touched by this program
	}

	body, err := ex.Extract(owned.PackageDir, e)
	if err != nil {
		return nil, OutcomeAbsent, err
	}

	typeSym := exportedMember(checker, moduleSym, typeName)
	if typeSym == nil {
		return nil, OutcomeAbsent, fmt.Errorf("INLINE_UNRESOLVED_TYPE: module %q exports no type %q", pkg, typeName)
	}
	declarations := markerMemberDeclarations(checker, typeSym, e.Member)
	if len(declarations) == 0 {
		return nil, OutcomeAbsent, fmt.Errorf(
			"INLINE_UNRESOLVED_MEMBER: %s:%s declares no member %q, on itself or on anything it extends — "+
				"the marker names a declaration this program does not have",
			pkg, typeName, e.Member)
	}

	memberSet := map[*shimast.Node]bool{}
	declMap := map[*shimast.Node]*ResolvedBody{}
	for _, d := range declarations {
		memberSet[d] = true
		if body.Discriminator.Matches(declarationDiscriminator(d)) {
			declMap[d] = body
		}
	}
	resolved := &Resolved{
		Owned:      owned,
		Kind:       KindMember,
		Module:     pkg,
		TypeName:   typeName,
		Member:     e.Member,
		TypeSymbol: checker.GetMergedSymbol(typeSym),
		Body:       body,
		DeclMap:    declMap,
		MemberSet:  memberSet,
	}
	if len(declMap) == 0 {
		// Two very different situations reach here. If no declaration even carries
		// the body's type-parameter count AND value-parameter count, the sugar
		// overload is not loaded in this program — a consumer that never pulls in
		// the augmentation, or a receiver carrying an unrelated overload that
		// happens to share the body's type-parameter count but not its arity — and
		// there is nothing to inline; the entry still registers its shape so a call
		// written in it cannot pass the sweep unnoticed. If one does, the sugar
		// overload IS present and only its value parameter NAMES disagree with the
		// body's: an authoring fault, never a configuration. Arity is what tells
		// these apart — an unrelated overload's own value-parameter count is
		// essentially never the sugar body's by coincidence, where its
		// type-parameter count alone often is (both commonly single-type-parameter
		// generics, for instance).
		if !anyDeclarationTakes(declarations, body.Discriminator) {
			return resolved, OutcomeUnmatched, nil
		}
		return nil, OutcomeAbsent, fmt.Errorf(
			"INLINE_DISCRIMINATOR_MISMATCH: %s:%s member %q — impl %q body takes value parameters %v, "+
				"but no declaration of that member takes the same ones; a receiver belongs in `this`, "+
				"and every parameter must match the declaration's by name",
			pkg, typeName, e.Member, e.Impl, body.Discriminator.Params)
	}
	return resolved, OutcomeActive, nil
}

// anyDeclarationTakes reports whether any declaration carries the same
// type-parameter count AND value-parameter count as want — the signal that the
// sugar overload is loaded, whatever its value parameter NAMES turn out to be.
// Value-parameter count is load-bearing here, not just type-parameter count: two
// otherwise-unrelated overloads of one member commonly share a type-parameter
// count (a single generic parameter is the ordinary shape for both a sugar
// overload and a runtime one taking an explicit node), so type-parameter count
// alone cannot tell "the sugar's own declaration, renamed" apart from "a
// different overload entirely".
func anyDeclarationTakes(decls []*shimast.Node, want Discriminator) bool {
	for _, d := range decls {
		disc := declarationDiscriminator(d)
		if disc.TypeParamCount == want.TypeParamCount && len(disc.Params) == len(want.Params) {
			return true
		}
	}
	return false
}

// resolveFloater resolves a floater entry (impl only, no type, no member): the
// impl reference names both the module and the export directly. The witness rule
// applies as for members: no module symbol in the program → absent. The export
// symbol's single function-like declaration is mapped to the body; an overloaded
// floater (more than one function-like declaration) is specced-not-certified.
func resolveFloater(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, ResolveOutcome, error) {
	e := owned.Entry
	implRef, err := ParseTypeRef(e.Impl)
	if err != nil {
		return nil, OutcomeAbsent, fmt.Errorf("INLINE_ENTRY_SHAPE: %w", err)
	}
	pkg, name := implRef.From, implRef.Name

	moduleSym := resolveModuleSymbol(prog, checker, pkg)
	if moduleSym == nil {
		return nil, OutcomeAbsent, nil // no witness — owning package not touched by this program
	}

	body, err := ex.Extract(owned.PackageDir, e)
	if err != nil {
		return nil, OutcomeAbsent, err
	}

	fnSym := exportedMember(checker, moduleSym, name)
	if fnSym == nil {
		return nil, OutcomeAbsent, fmt.Errorf("INLINE_UNRESOLVED_TYPE: module %q exports no function %q", pkg, name)
	}
	memberSet := map[*shimast.Node]bool{}
	declMap := map[*shimast.Node]*ResolvedBody{}
	fnDecls := []*shimast.Node{}
	for _, d := range fnSym.Declarations {
		memberSet[d] = true
		if isFunctionLikeDeclaration(d) {
			fnDecls = append(fnDecls, d)
		}
	}
	if len(fnDecls) != 1 {
		return nil, OutcomeAbsent, fmt.Errorf("INLINE_ENTRY_SHAPE: floater impl %q has %d function-like declarations (overloaded floaters are not certified)", e.Impl, len(fnDecls))
	}
	declMap[fnDecls[0]] = body

	return &Resolved{
		Owned:  owned,
		Kind:   KindFloater,
		Module: pkg,
		// No type-side anchor. Keep the export name here so the rogue-duplicate
		// tripwire (which compares against an enclosing interface name) stays
		// inert for a floater — a function declaration has no enclosing
		// interface, so this never matches.
		TypeName:  name,
		Member:    name,
		Body:      body,
		DeclMap:   declMap,
		MemberSet: memberSet,
	}, OutcomeActive, nil
}

// isFunctionLikeDeclaration reports whether d is a function/method-shaped
// declaration node (the shapes a floater symbol's declarations take).
func isFunctionLikeDeclaration(d *shimast.Node) bool {
	switch d.Kind {
	case shimast.KindFunctionDeclaration, shimast.KindMethodDeclaration,
		shimast.KindMethodSignature, shimast.KindFunctionExpression, shimast.KindArrowFunction:
		return true
	}
	return false
}
