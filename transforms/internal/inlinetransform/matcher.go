// Package inlinetransform holds the matching and side-parse foundations for the
// generic single-expression function-inlining transform stage. It carries no
// per-library semantic knowledge: a hand-authored `rhombus.inline` publish-list
// entry names an interface member (or free function), and this package resolves
// that entry ONCE per program to a member symbol and its full declaration set,
// then decides — per call site, by symbol/declaration IDENTITY, never by string
// key — whether a call is an inlineable one.
//
// The two load-bearing checker compositions live here:
//
//   - Entry resolution (ResolveEntry): the entry's `type` token names an
//     interface; that resolves to a module symbol, then the interface's member
//     symbol, then the member's declaration set. TypeScript declaration merging
//     has already unified every duplicate declaration (base + each
//     `declare module` augmentation) into that one symbol, so the set is
//     authoritative and complete.
//
//   - Call-site matching (ResolvedEntry.Match): a call resolves through the
//     checker to a signature, the signature to its declaration node, and the
//     match is set membership of that node in the resolved declaration set.
//     Whichever overload the call bound to, its declaration is one of the merged
//     declarations iff the call targets the entry's member.
//
// Because matching is by identity, a same-named member on an UNRELATED symbol
// (an accidental or dist-skewed duplicate) resolves to a declaration that is NOT
// in the set — the rogue-duplicate tripwire the design calls for.
package inlinetransform

import (
	"fmt"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// Entry is one hand-authored `rhombus.inline` publish-list entry. Field presence
// distinguishes the kinds: an interface-member entry carries Type + Member (Impl
// names the declaring export); a free-function entry omits Member. Only the
// interface-member shape is exercised by the pilot.
type Entry struct {
	// Type is a nameof token, "<package>:<TypeName>", identifying the interface
	// whose member is inlineable. It is the match anchor.
	Type string
	// Impl is the export name (within the declaring package) that holds the
	// inlineable body. Self-relative, resolved through the workspace.
	Impl string
	// Member is the member name, shared by the interface side and the impl side
	// (structurally identical by the registry-install mechanism).
	Member string
}

// ResolvedEntry is an Entry resolved once per program to a concrete member symbol
// and the set of declaration nodes that symbol carries. Match tests call sites
// against this set.
type ResolvedEntry struct {
	Entry           Entry
	InterfaceSymbol *shimast.Symbol
	MemberSymbol    *shimast.Symbol
	// Declarations is the member symbol's full merged declaration set, used as
	// the identity set for call-site matching. Keyed by declaration node.
	Declarations map[*shimast.Node]bool
}

// ResolveEntry resolves an interface-member entry against a loaded program:
// type ref -> module symbol -> interface symbol -> member symbol -> declarations
// set. It returns an error (never a silent miss) when any leg fails to resolve,
// so a malformed or dist-skewed publish list is a loud build failure.
func ResolveEntry(prog *driver.Program, checker *shimchecker.Checker, e Entry) (*ResolvedEntry, error) {
	pkg, typeName, ok := splitTypeToken(e.Type)
	if !ok {
		return nil, fmt.Errorf("inline: malformed type token %q (want \"<package>:<TypeName>\")", e.Type)
	}

	moduleSym := resolveModuleSymbol(prog, checker, pkg)
	if moduleSym == nil {
		return nil, fmt.Errorf("inline: cannot resolve module %q for entry %q", pkg, e.Type)
	}

	ifaceSym := exportedMember(checker, moduleSym, typeName)
	if ifaceSym == nil {
		return nil, fmt.Errorf("inline: module %q does not export type %q", pkg, typeName)
	}

	declared := checker.GetDeclaredTypeOfSymbol(ifaceSym)
	if declared == nil {
		return nil, fmt.Errorf("inline: %s:%s has no declared type", pkg, typeName)
	}

	// GetPropertyOfType over the interface's declared type returns the MERGED
	// member symbol: TS folds the base declaration and every `declare module`
	// augmentation of the interface into one symbol whose Declarations span all
	// contributing files.
	memberSym := checker.GetPropertyOfType(declared, e.Member)
	if memberSym == nil {
		return nil, fmt.Errorf("inline: %s:%s has no member %q", pkg, typeName, e.Member)
	}

	decls := map[*shimast.Node]bool{}
	for _, d := range memberSym.Declarations {
		decls[d] = true
	}
	if len(decls) == 0 {
		return nil, fmt.Errorf("inline: member %q on %s:%s carries no declarations", e.Member, pkg, typeName)
	}

	return &ResolvedEntry{
		Entry:           e,
		InterfaceSymbol: ifaceSym,
		MemberSymbol:    memberSym,
		Declarations:    decls,
	}, nil
}

// Match reports whether call is an invocation of this entry's member. It resolves
// the call to its signature, the signature to a declaration node, and tests that
// node for membership in the entry's merged declaration set. A call to a
// same-named member on a different symbol resolves to a declaration outside the
// set and is rejected.
func (r *ResolvedEntry) Match(checker *shimchecker.Checker, call *shimast.Node) bool {
	decl := resolvedDeclaration(checker, call)
	if decl == nil {
		return false
	}
	return r.Declarations[decl]
}

// resolvedDeclaration returns the declaration node the call binds to. For an
// instantiated (generic) signature the declaration is carried on the target
// signature, so an explicit `isService<T>()` and an inferred call both resolve
// back to the same authored MethodSignature node.
func resolvedDeclaration(checker *shimchecker.Checker, call *shimast.Node) *shimast.Node {
	sig := checker.GetResolvedSignature(call)
	if sig == nil {
		return nil
	}
	if d := sig.Declaration(); d != nil {
		return d
	}
	if target := sig.Target(); target != nil {
		return target.Declaration()
	}
	return nil
}

// RecoverTypeArguments returns the type arguments a call was invoked with,
// covering both explicit `f<T>()` and INFERRED `f(arg)` forms.
//
//   - Explicit: the syntactic type-argument nodes are resolved through the
//     checker (`GetTypeFromTypeNode`), so the binding is the checked type, not
//     just the written text.
//   - Inferred: the resolved signature is an instantiation; its target holds the
//     declared type parameters. Where a target parameter's declared type is a
//     bare reference to a type parameter, the corresponding INSTANTIATED
//     parameter type is that parameter's binding — inference can only fix a type
//     parameter that appears in a parameter position, so this recovers every
//     inferred argument the checker bound.
//
// ok is false when the call binds no type arguments (non-generic) or an inferred
// binding cannot be recovered for every parameter.
func RecoverTypeArguments(checker *shimchecker.Checker, call *shimast.Node) ([]*shimchecker.Type, bool) {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return nil, false
	}

	if callExpr.TypeArguments != nil && len(callExpr.TypeArguments.Nodes) > 0 {
		out := make([]*shimchecker.Type, 0, len(callExpr.TypeArguments.Nodes))
		for _, node := range callExpr.TypeArguments.Nodes {
			out = append(out, checker.GetTypeFromTypeNode(node))
		}
		return out, true
	}

	sig := checker.GetResolvedSignature(call)
	if sig == nil {
		return nil, false
	}
	target := sig.Target()
	if target == nil {
		return nil, false
	}
	typeParams := target.TypeParameters()
	if len(typeParams) == 0 {
		return nil, false
	}

	indexOf := map[*shimchecker.Type]int{}
	for i, tp := range typeParams {
		indexOf[tp] = i
	}

	bindings := make([]*shimchecker.Type, len(typeParams))
	targetParams := target.Parameters()
	instParams := sig.Parameters()
	for i, sym := range targetParams {
		if i >= len(instParams) {
			break
		}
		decl := sym.ValueDeclaration
		if decl == nil || decl.Kind != shimast.KindParameter {
			continue
		}
		typeNode := decl.AsParameterDeclaration().Type
		if typeNode == nil {
			continue
		}
		declaredType := checker.GetTypeFromTypeNode(typeNode)
		if declaredType == nil || declaredType.Flags()&shimchecker.TypeFlagsTypeParameter == 0 {
			continue
		}
		idx, ok := indexOf[declaredType]
		if !ok || bindings[idx] != nil {
			continue
		}
		bindings[idx] = checker.GetTypeOfSymbol(instParams[i])
	}

	for _, b := range bindings {
		if b == nil {
			return nil, false
		}
	}
	return bindings, true
}

// splitTypeToken splits a "<package>:<TypeName>" token at its FIRST colon. A
// package specifier ("@rhombus-std/di.core", "pkg/path") never contains a colon;
// a nested type name ("A.Foo") never does either — so the first colon is the
// unambiguous boundary.
func splitTypeToken(token string) (pkg, typeName string, ok bool) {
	i := strings.Index(token, ":")
	if i <= 0 || i == len(token)-1 {
		return "", "", false
	}
	return token[:i], token[i+1:], true
}

// resolveModuleSymbol resolves a bare module specifier to its (merged) module
// symbol by finding any module-specifier node in the program that names it —
// an import, an export, or a `declare module` block — and resolving through the
// checker. Scanning for the specifier keeps this decoupled from whether the
// consumer imports the package: an augmentation's `declare module` block anchors
// it just as well as a value import.
func resolveModuleSymbol(prog *driver.Program, checker *shimchecker.Checker, specifier string) *shimast.Symbol {
	for _, sf := range prog.SourceFiles() {
		node := findModuleSpecifierNode(sf, specifier)
		if node == nil {
			continue
		}
		sym := checker.ResolveExternalModuleName(node)
		if sym == nil {
			continue
		}
		if resolved := checker.ResolveExternalModuleSymbol(sym); resolved != nil {
			sym = resolved
		}
		return checker.GetMergedSymbol(sym)
	}
	return nil
}

// findModuleSpecifierNode returns the string-literal specifier node of the first
// import / export / `declare module` in sf whose specifier text equals
// specifier, or nil.
func findModuleSpecifierNode(sf *shimast.SourceFile, specifier string) *shimast.Node {
	var found *shimast.Node
	walk(sf.AsNode(), func(node *shimast.Node) bool {
		switch node.Kind {
		case shimast.KindImportDeclaration, shimast.KindExportDeclaration:
			spec := node.ModuleSpecifier()
			if spec != nil && spec.Kind == shimast.KindStringLiteral && spec.Text() == specifier {
				found = spec
				return true
			}
		case shimast.KindModuleDeclaration:
			name := node.Name()
			if name != nil && name.Kind == shimast.KindStringLiteral && name.Text() == specifier {
				found = name
				return true
			}
		}
		return false
	})
	return found
}

// exportedMember returns the export named name from a resolved module symbol,
// unwrapping a re-export alias (`export { X } from …`) to its target so the
// returned symbol is the real interface declaration symbol.
func exportedMember(checker *shimchecker.Checker, moduleSym *shimast.Symbol, name string) *shimast.Symbol {
	for _, exp := range checker.GetExportsOfModule(moduleSym) {
		if exp.Name != name {
			continue
		}
		if exp.Flags&shimast.SymbolFlagsAlias != 0 {
			if aliased := checker.GetAliasedSymbol(exp); aliased != nil {
				return aliased
			}
		}
		return exp
	}
	return nil
}

// walk performs a pre-order traversal of node's subtree, calling visit on each
// node and stopping the whole walk as soon as visit returns true.
func walk(node *shimast.Node, visit func(*shimast.Node) bool) {
	if node == nil {
		return
	}
	var recur func(n *shimast.Node) bool
	recur = func(n *shimast.Node) bool {
		if n == nil {
			return false
		}
		if visit(n) {
			return true
		}
		return n.ForEachChild(func(child *shimast.Node) bool {
			return recur(child)
		})
	}
	recur(node)
}
