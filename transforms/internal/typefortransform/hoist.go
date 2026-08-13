package typefortransform

import (
	"path/filepath"
	"sort"

	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/typeforhoist"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// Hoist is the project state HOISTED emission needs: the shared const table
// every file contributes to, and the source root the generated module sits at,
// so each file can spell its own relative specifier. A nil *Hoist selects INLINE
// emission — the `Type.*` tree written out at the call site.
type Hoist struct {
	// Registry is the one table for the whole project. Its entries outlive any
	// single file, which is what lets two files share a const.
	Registry *typeforhoist.Registry
	// SourceRoot is the absolute directory the emitted tree is rooted at. The
	// generated module is its direct child, so the specifier a file spells is the
	// same in source space and in emit space.
	SourceRoot string
}

// hoistCollisionCode is the diagnostic raised when two distinct types would name
// the same const. It is an engine bug — the naming scheme is meant to make it
// unreachable — and it fails the build rather than merging the two.
const hoistCollisionCode = "TYPEFOR_HOIST_NAME_COLLISION"

// hoistEmitter replaces each derived tree with a reference to one const, interns
// the tree in the project table, and remembers which consts this file reached so
// the import can be materialized once at the end of the file.
type hoistEmitter struct {
	factory  *shimast.NodeFactory
	registry *typeforhoist.Registry
	// specifier is the module specifier THIS file reaches the generated module by.
	specifier string
	// bindings is one binding per const name referenced in this file, keyed by
	// name so a repeated reference reuses it.
	bindings map[string]*valueimport.Binding
	// sourceFile is what a binding resolves against, honoring an import a previous
	// pass of the fixed-point loop already injected.
	sourceFile *shimast.SourceFile
	emit       func(plugin.Diagnostic)
}

func newHoistEmitter(
	factory *shimast.NodeFactory,
	hoist *Hoist,
	sourceFile *shimast.SourceFile,
	emit func(plugin.Diagnostic),
) *hoistEmitter {
	return &hoistEmitter{
		factory:    factory,
		registry:   hoist.Registry,
		specifier:  moduleSpecifier(hoist.SourceRoot, sourceFile.FileName()),
		bindings:   map[string]*valueimport.Binding{},
		sourceFile: sourceFile,
		emit:       emit,
	}
}

// hoistNode mirrors a derived tree onto the const table's own node form, whose
// canonical key is the identity two call sites share a const by. It is the
// structural twin of typeemit.EmitDerived over the same tree, so a const holds
// exactly what an inline emission would have spelled.
func hoistNode(d *tokens.Derived) *typeforhoist.Node {
	switch d.Kind {
	case tokens.DerivedFunc:
		return typeforhoist.Func(hoistNode(d.Ret), hoistNodes(d.Args))
	case tokens.DerivedCtor:
		return typeforhoist.Ctor(hoistNode(d.Ret), hoistNodes(d.Args))
	case tokens.DerivedTag:
		return typeforhoist.Tag(hoistNode(d.Inner), d.Tag)
	case tokens.DerivedUnion:
		return typeforhoist.Union(hoistNodes(d.Members))
	case tokens.DerivedUndefined:
		return typeforhoist.Undefined()
	case tokens.DerivedNull:
		return typeforhoist.Null()
	default: // tokens.DerivedLeaf
		return hoistLeaf(d.Leaf)
	}
}

func hoistNodes(ds []*tokens.Derived) []*typeforhoist.Node {
	out := make([]*typeforhoist.Node, 0, len(ds))
	for _, d := range ds {
		out = append(out, hoistNode(d))
	}
	return out
}

// hoistLeaf mirrors the unclassified named / literal / union / placeholder tree.
// A named type's generic arguments become CHILD nodes rather than part of the
// parent's spelling, so each closed argument earns its own const and is
// referenced by name.
func hoistLeaf(n *tokens.TypeNode) *typeforhoist.Node {
	switch n.Kind {
	case tokens.TypeNodeLiteral:
		return typeforhoist.Literal(tokens.RenderTypeNode(n))
	case tokens.TypeNodeUnion:
		members := make([]*typeforhoist.Node, 0, len(n.Members))
		for _, m := range n.Members {
			members = append(members, hoistLeaf(m))
		}
		return typeforhoist.Union(members)
	case tokens.TypeNodePlaceholder:
		return typeforhoist.Generic(n.Label)
	default: // tokens.TypeNodeNamed
		args := make([]*typeforhoist.Node, 0, len(n.Args))
		for _, a := range n.Args {
			args = append(args, hoistLeaf(a))
		}
		return typeforhoist.Named(n.Name, n.From, args)
	}
}

// node interns the derived tree and returns the identifier the const is
// referenced by, or nil when naming failed (reported as a hard diagnostic).
func (e *hoistEmitter) node(d *tokens.Derived) *shimast.Node {
	name, err := e.registry.Ref(hoistNode(d))
	if err != nil {
		e.emit(plugin.Diagnostic{
			Code:    hoistCollisionCode,
			File:    filepath.ToSlash(e.sourceFile.FileName()),
			Message: err.Error(),
		})
		return nil
	}
	binding, ok := e.bindings[name]
	if !ok {
		binding = valueimport.Resolve(e.sourceFile, valueimport.Ref{Module: e.specifier, Export: name})
		e.bindings[name] = binding
	}
	binding.Used = true
	return binding.Expr(e.factory)
}

// imports are the file's bindings in a stable order — sorted by const name, so
// the injected import reads the same however the file happened to be visited.
func (e *hoistEmitter) imports() []*valueimport.Binding {
	names := make([]string, 0, len(e.bindings))
	for name := range e.bindings {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]*valueimport.Binding, 0, len(names))
	for _, name := range names {
		out = append(out, e.bindings[name])
	}
	return out
}

// moduleSpecifier is the relative specifier a file in sourceRoot's tree reaches
// the generated module by. A file directly in the root spells `./`; a nested one
// climbs back out.
func moduleSpecifier(sourceRoot, file string) string {
	rel, err := filepath.Rel(filepath.Dir(file), sourceRoot)
	if err != nil {
		return "./" + typeforhoist.ModuleFile
	}
	rel = filepath.ToSlash(rel)
	if rel == "." {
		return "./" + typeforhoist.ModuleFile
	}
	return rel + "/" + typeforhoist.ModuleFile
}
