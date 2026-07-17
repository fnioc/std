package inlinetransform

import (
	"fmt"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// Resolved is a fully-resolved, ACTIVE inline entry: the member (or function)
// symbol's merged declaration set, the subset of that set mapped to the inline
// body (the sugar overload declarations), and the side-parsed body itself.
type Resolved struct {
	Owned     OwnedEntry
	Kind      EntryKind
	Module    string
	TypeName  string
	Member    string // member name (member kind) or function name (function kind)
	Body      *ResolvedBody
	DeclMap   map[*shimast.Node]*ResolvedBody // sugar declarations → body
	MemberSet map[*shimast.Node]bool          // full merged declaration set
}

// nameForCall is the identifier a call site's callee carries when it targets
// this entry: the member name for member sugar, the function name for a free
// function.
func (r *Resolved) nameForCall() string { return r.Member }

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
		return nil, false, fmt.Errorf("INLINE_KIND_UNCERTIFIED: entry is a specced-but-not-yet-certified shape (class-member and object-literal-member are not certified) (type=%q impl=%q member=%q)", e.Type, e.Impl, e.Member)
	}

	if kind == KindFunction {
		return resolveFunction(prog, checker, ex, owned)
	}
	return resolveMember(prog, checker, ex, owned)
}

// resolveMember resolves an interface-member entry: type token → module symbol →
// interface symbol → merged member symbol → the sugar-overload declarations
// discriminated to the inline body.
func resolveMember(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, bool, error) {
	e := owned.Entry
	pkg, typeName, ok := splitTypeToken(e.Type)
	if !ok {
		return nil, false, fmt.Errorf("INLINE_ENTRY_SHAPE: malformed type token %q", e.Type)
	}

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
		if declarationDiscriminator(d).Equal(body.Discriminator) {
			declMap[d] = body
		}
	}
	if len(declMap) == 0 {
		return nil, true, nil // inert: sugar overload not present in this program
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

// resolveFunction resolves a free-function entry (impl only). There is no
// type-side anchor, so the module specifier is the OWNING package's own name
// (read from its package.json), and the export is impl. The witness rule applies
// as for members: no module symbol in the program → inert. The export symbol's
// single function-like declaration is mapped to the body; an overloaded free
// function (more than one function-like declaration) is specced-not-certified.
func resolveFunction(prog *driver.Program, checker *shimchecker.Checker, ex *bodyExtractor, owned OwnedEntry) (*Resolved, bool, error) {
	e := owned.Entry
	pkg := packageName(owned.PackageDir)
	if pkg == "" {
		return nil, false, fmt.Errorf("INLINE_ENTRY_SHAPE: free-function impl %q: owning package %s has no name", e.Impl, owned.PackageDir)
	}

	moduleSym := resolveModuleSymbol(prog, checker, pkg)
	if moduleSym == nil {
		return nil, true, nil // inert: no witness — owning package not touched by this program
	}

	body, err := ex.Extract(owned.PackageDir, e)
	if err != nil {
		return nil, false, err
	}

	fnSym := exportedMember(checker, moduleSym, e.Impl)
	if fnSym == nil {
		return nil, false, fmt.Errorf("INLINE_UNRESOLVED_TYPE: module %q exports no function %q", pkg, e.Impl)
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
		return nil, false, fmt.Errorf("INLINE_ENTRY_SHAPE: free-function impl %q has %d function-like declarations (overloaded free functions are not certified)", e.Impl, len(fnDecls))
	}
	declMap[fnDecls[0]] = body
	return &Resolved{
		Owned:  owned,
		Kind:   KindFunction,
		Module: pkg,
		// No type-side anchor. Keep the impl name here so the rogue-duplicate
		// tripwire (which compares against an enclosing interface name) stays
		// inert for a free function — a function declaration has no enclosing
		// interface, so this never matches.
		TypeName:  e.Impl,
		Member:    e.Impl,
		Body:      body,
		DeclMap:   declMap,
		MemberSet: memberSet,
	}, false, nil
}

// isFunctionLikeDeclaration reports whether d is a function/method-shaped
// declaration node (the shapes a free-function symbol's declarations take).
func isFunctionLikeDeclaration(d *shimast.Node) bool {
	switch d.Kind {
	case shimast.KindFunctionDeclaration, shimast.KindMethodDeclaration,
		shimast.KindMethodSignature, shimast.KindFunctionExpression, shimast.KindArrowFunction:
		return true
	}
	return false
}
