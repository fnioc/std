// Package typesurface enumerates a type's PUBLIC, STRING-KEYED INSTANCE SURFACE
// — the members a caller can name on a value of that type.
//
// Three member shapes are outside that surface and are never enumerated:
//
//   - a `#`-named field, which is not a string-keyed property at all
//     (`Reflect.ownKeys(new C())` does not list it, `obj["#x"]` is `undefined`),
//     so any emitted key for one is unmatchable at runtime;
//   - a `private` / `protected` member, which a caller cannot supply;
//   - a computed (symbol-keyed) member such as `[Symbol.iterator]`, which has no
//     string key to emit either.
//
// Each is COUNTED as it is skipped, so a caller can tell "this type has no
// members" from "this type's members are all outside the surface" and refuse
// loudly rather than emit something that silently cannot match. The checker
// names all three internally with a mangled, unmatchable property name; the
// tests here are on the DECLARATION's shape, never on that name.
//
// A get/set accessor IS part of the surface, enumerated as an ordinary member;
// read its type through Member.Decl, which yields the accessor's declared type.
// Static members never appear — an instance type's properties do not include
// them.
//
// An accessor is DIRECTIONAL, and the two directions are reported separately
// (Member.Readable / Member.Writable) because the consumers face opposite ways: a
// runtime type guard READS a member, so a set-only accessor gives it nothing to
// check; a schema WRITES one, so a get-only accessor gives it nowhere to put a
// value. Filtering by the wrong direction yields a member operation that can
// never succeed, so neither consumer may assume both.
package typesurface

import (
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// Member is one public member: its symbol, its property name, the declaration
// node its type is read at, whether it is `?`-optional, and which directions it
// supports. A plain property is both Readable and Writable; an accessor is
// whichever halves it declares.
type Member struct {
	Symbol   *shimast.Symbol
	Name     string
	Decl     *shimast.Node
	Optional bool
	Readable bool
	Writable bool
}

// Surface is a type's enumerated public surface plus what was skipped to reach
// it.
type Surface struct {
	// Members are the public members, in declaration order.
	Members []Member
	// PrivateNamed counts skipped `#`-named fields.
	PrivateNamed int
	// ModifierHidden counts skipped `private` / `protected` members.
	ModifierHidden int
	// SymbolKeyed counts skipped computed (symbol-keyed) members.
	SymbolKeyed int
	// HasAccessor reports whether any surviving member is a get/set accessor.
	HasAccessor bool
}

// Hidden is the number of members skipped for any reason. A type with no
// Members and a non-zero Hidden has a surface, just not one anything can be
// emitted for.
func (s Surface) Hidden() int {
	return s.PrivateNamed + s.ModifierHidden + s.SymbolKeyed
}

// HiddenOnly reports the shape every consumer must refuse: a type that HAS
// members, none of which can be named from outside it. Whatever such a consumer
// would emit — a guard, a schema — covers nothing while looking like it covers
// the type.
func (s Surface) HiddenOnly() bool {
	return len(s.Members) == 0 && s.Hidden() > 0
}

// Readable returns the members a value can be read FROM, in declaration order —
// the surface a type guard can check.
func (s Surface) Readable() []Member {
	return s.filter(func(m Member) bool { return m.Readable })
}

// Writable returns the members a value can be written TO, in declaration order —
// the surface a coercion can populate.
func (s Surface) Writable() []Member {
	return s.filter(func(m Member) bool { return m.Writable })
}

func (s Surface) filter(keep func(Member) bool) []Member {
	kept := make([]Member, 0, len(s.Members))
	for _, m := range s.Members {
		if keep(m) {
			kept = append(kept, m)
		}
	}
	return kept
}

// For enumerates t's public surface. anchor is the fallback node a member's type
// is read at when the symbol carries no declaration of its own.
func For(checker *shimchecker.Checker, t *shimchecker.Type, anchor *shimast.Node) Surface {
	surface := Surface{}
	if checker == nil || t == nil {
		return surface
	}
	for _, sym := range shimchecker.Checker_getPropertiesOfType(checker, t) {
		decl := declarationOf(sym)
		switch {
		case isPrivateNamed(decl):
			surface.PrivateNamed++
			continue
		case isModifierHidden(decl):
			surface.ModifierHidden++
			continue
		case isSymbolKeyed(decl):
			surface.SymbolKeyed++
			continue
		}
		if decl == nil {
			decl = anchor
		}
		accessor := sym.Flags&shimast.SymbolFlagsAccessor != 0
		if accessor {
			surface.HasAccessor = true
		}
		surface.Members = append(surface.Members, Member{
			Symbol:   sym,
			Name:     sym.Name,
			Decl:     decl,
			Optional: sym.Flags&shimast.SymbolFlagsOptional != 0,
			Readable: !accessor || sym.Flags&shimast.SymbolFlagsGetAccessor != 0,
			Writable: !accessor || sym.Flags&shimast.SymbolFlagsSetAccessor != 0,
		})
	}
	return surface
}

// declarationOf picks the node a member's accessibility and type are read at: its
// value declaration, else its first declaration.
func declarationOf(sym *shimast.Symbol) *shimast.Node {
	if sym.ValueDeclaration != nil {
		return sym.ValueDeclaration
	}
	if len(sym.Declarations) > 0 {
		return sym.Declarations[0]
	}
	return nil
}

// isPrivateNamed reports whether a declaration's name is a `#`-identifier.
func isPrivateNamed(decl *shimast.Node) bool {
	if decl == nil {
		return false
	}
	name := decl.Name()
	return name != nil && name.Kind == shimast.KindPrivateIdentifier
}

// isModifierHidden reports whether a declaration carries `private` or
// `protected`.
func isModifierHidden(decl *shimast.Node) bool {
	if decl == nil {
		return false
	}
	flags := shimast.GetCombinedModifierFlags(decl)
	return flags&(shimast.ModifierFlagsPrivate|shimast.ModifierFlagsProtected) != 0
}

// underNodeModules reports whether a file path has a node_modules segment.
func underNodeModules(fileName string) bool {
	return strings.Contains(fileName, "/node_modules/")
}

// isSymbolKeyed reports whether a declaration's name is computed — `[Symbol.x]`
// and friends, which carry no string key.
func isSymbolKeyed(decl *shimast.Node) bool {
	if decl == nil {
		return false
	}
	name := decl.Name()
	return name != nil && name.Kind == shimast.KindComputedPropertyName
}

// FromLibrary reports whether every declaration of t's symbol lives in a default
// library file or under `node_modules` — a built-in or third-party type (Date,
// Map, Promise, ...) rather than one declared in this project. Such a type is
// nominal in practice: enumerating its members says nothing useful about whether
// a value really is one.
func FromLibrary(prog *driver.Program, t *shimchecker.Type) bool {
	if prog == nil || t == nil {
		return false
	}
	symbol := t.Symbol()
	if symbol == nil {
		symbol = tokens.AliasSymbol(t)
	}
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	for _, decl := range symbol.Declarations {
		file := shimast.GetSourceFileOfNode(decl)
		if file == nil {
			return false
		}
		if !prog.TSProgram.IsSourceFileDefaultLibrary(file.Path()) && !underNodeModules(file.FileName()) {
			return false
		}
	}
	return true
}
