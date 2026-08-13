package inlinetransform

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// Resolved is a fully-resolved, ACTIVE inline entry: the member (or floater)
// symbol's merged declaration set, the subset of that set mapped to the inline
// body (the sugar overload declarations), and the side-parsed body itself.
type Resolved struct {
	Owned     OwnedEntry
	Kind      EntryKind
	Module    string // the declaring package a surviving call must import Member from
	TypeName  string
	Member    string // member name (member kind) or floater's export name (floater kind)
	Body      *ResolvedBody
	DeclMap   map[*shimast.Node]*ResolvedBody // sugar declarations → body
	MemberSet map[*shimast.Node]bool          // full merged declaration set
}

// Resolve resolves one owned entry against the consumer program. The outcome is
// three-way: an active *Resolved (inline it), inert (the sugar surface is not in
// this program — skip silently), or a hard error (manifest vs src disagree).
//
// inert covers two designed cases (build spec §4a): the entry's module has no
// witness anywhere in the program (a dep the file set never imports), and the
// member symbol resolves but no declaration matches the impl discriminator (the
// augmentation package's sugar declaration is simply not loaded). Neither can
// produce a typechecking sugar call, so acting on nothing is correct; the sweep
// backstops any call that somehow survives.
func Resolve(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, bool, error) {
	e := owned.Entry
	kind, status := e.Kind()
	switch status {
	case StatusMalformed:
		return nil, false, fmt.Errorf("INLINE_ENTRY_SHAPE: entry matches no grammar row (type=%q impl=%q member=%q)", e.Type, e.Impl, e.Member)
	case StatusUncertified:
		return nil, false, fmt.Errorf("INLINE_KIND_UNCERTIFIED: entry is a specced-but-not-yet-certified shape (own-body instance members and static members are not certified) (type=%q impl=%q member=%q)", e.Type, e.Impl, e.Member)
	}

	if kind == KindFloater {
		return resolveFloater(prog, checker, ex, owned)
	}
	return resolveMember(prog, checker, ex, owned)
}

// resolveMember resolves an ambient instance-member entry: type reference →
// module symbol → interface symbol → merged member symbol → the sugar-overload
// declarations discriminated to the inline body.
func resolveMember(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, bool, error) {
	e := owned.Entry
	typeRef, err := ParseTypeRef(e.Type)
	if err != nil {
		return nil, false, fmt.Errorf("INLINE_ENTRY_SHAPE: %w", err)
	}
	pkg, typeName := typeRef.From, typeRef.Name

	moduleSym := resolveModuleSymbol(prog, checker, pkg)
	if moduleSym == nil {
		return nil, true, nil // inert: no witness — module not touched by this program
	}

	body, err := ex.Extract(owned.PackageDir, e)
	if err != nil {
		return nil, false, err
	}

	ifaceSym := exportedMember(checker, moduleSym, typeName)
	if ifaceSym == nil {
		return nil, false, fmt.Errorf("INLINE_UNRESOLVED_TYPE: module %q exports no type %q", pkg, typeName)
	}
	declared := checker.GetDeclaredTypeOfSymbol(ifaceSym)
	if declared == nil {
		return nil, false, fmt.Errorf("INLINE_UNRESOLVED_TYPE: %s:%s has no declared type", pkg, typeName)
	}
	memberSym := checker.GetPropertyOfType(declared, e.Member)
	if memberSym == nil {
		return nil, false, fmt.Errorf("INLINE_UNRESOLVED_MEMBER: %s:%s has no member %q", pkg, typeName, e.Member)
	}

	memberSet := map[*shimast.Node]bool{}
	declMap := map[*shimast.Node]*ResolvedBody{}
	for _, d := range memberSym.Declarations {
		memberSet[d] = true
		if body.Discriminator.Matches(declarationDiscriminator(d)) {
			declMap[d] = body
		}
	}
	if len(declMap) == 0 {
		// Two very different situations reach here. If no declaration even carries
		// the body's type-parameter count, the sugar overload is simply not loaded
		// in this program — a consumer that never pulls in the augmentation — and
		// skipping is correct. If one does, the sugar overload IS present and only
		// its value parameters disagree with the body's: an authoring fault, never
		// a configuration, and staying silent about it is how a whole authoring
		// surface can do nothing without anyone noticing.
		if !anyDeclarationTakes(memberSym.Declarations, body.Discriminator.TypeParamCount) {
			return nil, true, nil
		}
		return nil, false, fmt.Errorf(
			"INLINE_DISCRIMINATOR_MISMATCH: %s:%s member %q — impl %q body takes value parameters %v, "+
				"but no declaration of that member takes the same ones; a receiver belongs in `this`, "+
				"and every parameter must match the declaration's by name",
			pkg, typeName, e.Member, e.Impl, body.Discriminator.Params)
	}

	return &Resolved{
		Owned:     owned,
		Kind:      KindMember,
		Module:    pkg,
		TypeName:  typeName,
		Member:    e.Member,
		Body:      body,
		DeclMap:   declMap,
		MemberSet: memberSet,
	}, false, nil
}

// anyDeclarationTakes reports whether any declaration carries exactly count type
// parameters — the signal that the sugar overload is loaded, whatever its value
// parameters turn out to be.
func anyDeclarationTakes(decls []*shimast.Node, count int) bool {
	for _, d := range decls {
		if len(typeParamNames(d)) == count {
			return true
		}
	}
	return false
}

// resolveFloater resolves a floater entry (impl only, no type, no member): the
// impl reference names both the module and the export directly. The witness
// rule applies as for members: no module symbol in the program → inert. The
// export symbol's single function-like declaration is mapped to the body; an
// overloaded floater (more than one function-like declaration) is
// specced-not-certified.
func resolveFloater(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, bool, error) {
	e := owned.Entry
	implRef, err := ParseTypeRef(e.Impl)
	if err != nil {
		return nil, false, fmt.Errorf("INLINE_ENTRY_SHAPE: %w", err)
	}
	pkg, name := implRef.From, implRef.Name

	moduleSym := resolveModuleSymbol(prog, checker, pkg)
	if moduleSym == nil {
		return nil, true, nil // inert: no witness — owning package not touched by this program
	}

	body, err := ex.Extract(owned.PackageDir, e)
	if err != nil {
		return nil, false, err
	}

	fnSym := exportedMember(checker, moduleSym, name)
	if fnSym == nil {
		return nil, false, fmt.Errorf("INLINE_UNRESOLVED_TYPE: module %q exports no function %q", pkg, name)
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
		return nil, false, fmt.Errorf("INLINE_ENTRY_SHAPE: floater impl %q has %d function-like declarations (overloaded floaters are not certified)", e.Impl, len(fnDecls))
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
	}, false, nil
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
