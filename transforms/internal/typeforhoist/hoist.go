// Package typeforhoist is the project-wide const table behind typefor's HOISTED
// emission mode: instead of spelling a whole `Type.*` factory tree at every call
// site, each site emits a reference to a named const, and the consts live
// together in one generated module a build materializes beside the emitted
// files.
//
// The table is a DAG. A node is interned under a canonical key (see Node), so
// two call sites that derive the same type share one const, and a composite
// const references its member consts by name instead of re-spelling the subtree.
// Registry.Len therefore equals the number of `const` lines Module renders — the
// zero-redundancy guarantee, checkable by counting.
//
// The canonical key mirrors the runtime intern table's structural identity, so
// one const per key means one runtime `Type` object per const.
package typeforhoist

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// ModuleBase is the generated module's basename, placed at the emit root so a
// call site reaches it by the same relative specifier in source space and in
// emit space. Everything about WHERE the module lands follows from this one
// name plus the emit root the host computes.
const ModuleBase = "__typefor__"

// ModuleFile is the generated module's filename on disk. It is plain JS: the
// module is build output that no program typechecks, and a JS specifier
// resolves identically for a bundler and for plain Node.
const ModuleFile = ModuleBase + ".js"

// nameHashLen is how many hex characters of a key's SHA-256 disambiguate a name
// whose readable part cannot be unique on its own. Forty bits is far past the
// point where a collision is credible for a project's node count, and the
// registry asserts uniqueness anyway rather than trusting the odds.
const nameHashLen = 10

// maxReadableLen bounds the readable part of a name, so a deeply-generic type
// does not produce a hundred-character identifier. A longer spelling keeps its
// TAIL, which is the type's own name.
const maxReadableLen = 40

// GlobalFrom is the FROM a name carries when the ambient scope declares it —
// the token grammar's own sentinel, which is why the flat spelling of such a
// type is the bare name with no qualifier. A node carrying it spells as
// `Type.global`, everything else as `Type.imported`.
const GlobalFrom = "global"

// Kind discriminates a Node's populated fields — one case per `Type` factory a
// derived typefor tree can spell.
type Kind int

const (
	// KindNamed is `Type.imported(name, from[, args])`, or `Type.global(name[,
	// args])` when the ambient scope declares it.
	KindNamed Kind = iota
	// KindLiteral is `Type.typeLiteral(value)`.
	KindLiteral
	// KindUnion is `Type.union(...members)`.
	KindUnion
	// KindGeneric is `Type.generic(label)` — an open-generic hole.
	KindGeneric
	// KindFunc is `Type.func(returns, rows)`, rows the return type's parameter
	// rows as an array of arrays.
	KindFunc
	// KindCtor is `Type.ctor(instance, rows)`, rows the instance type's
	// parameter rows as an array of arrays.
	KindCtor
	// KindTag is `Type.tag(inner, key)`.
	KindTag
	// KindUndefined and KindNull are the two nullish singletons, each its own
	// `Type.typeLiteral` call. They are kinds rather than literals because the
	// token grammar's literal values exclude them.
	KindUndefined
	KindNull
)

// Node is one derived type in the table: a small, printer-agnostic mirror of the
// tree the typefor stage derives, carrying the canonical key that IS its
// identity. Build one through the constructors below — each computes the key
// from its children's keys, so identity never depends on a node being walked
// twice the same way.
type Node struct {
	kind Kind
	key  string

	// name/from spell a KindNamed node; args are its closed generic arguments.
	name string
	from string
	args []*Node

	// rows are a KindFunc / KindCtor signature's parameter rows — one row per
	// call it answers to, each holding that call's parameter types in order.
	rows [][]*Node

	// literal is a KindLiteral node's value as its TypeScript expression text.
	literal string

	// members are a KindUnion's member nodes, in the order they are emitted.
	members []*Node

	// label is a KindGeneric's hole number as decimal text.
	label string

	// ret is a KindFunc's return type or a KindCtor's instance type.
	ret *Node

	// abstract marks a KindCtor node built from an abstract class — always false
	// for KindFunc, which carries no such flag.
	abstract bool

	// inner and tag spell a KindTag: the branded base and the key branded onto it.
	inner *Node
	tag   string
}

// Key is the node's canonical identity — the string the registry interns on and
// derives its const name from.
func (n *Node) Key() string {
	return n.key
}

// Named builds a named-type node. from is the qualifying source, "global" for an
// unqualified name; args are the closed generic arguments in order.
func Named(name, from string, args []*Node) *Node {
	key := name
	if from != "global" {
		key = from + ":" + name
	}
	if len(args) != 0 {
		key += "<" + joinKeys(args, ",") + ">"
	}
	return &Node{kind: KindNamed, key: key, name: name, from: from, args: args}
}

// Literal builds a literal-type node from the value's TypeScript expression
// text — a quoted string, a numeric or bigint literal, or a boolean keyword.
func Literal(text string) *Node {
	return &Node{kind: KindLiteral, key: text, literal: text}
}

// Union builds a literal-union node. The key sorts the members, matching how the
// runtime intern table identifies a union, so member order never fragments one
// type into two consts.
func Union(members []*Node) *Node {
	keys := make([]string, len(members))
	for i, m := range members {
		keys[i] = m.key
	}
	sort.Strings(keys)
	return &Node{kind: KindUnion, key: strings.Join(keys, " | "), members: members}
}

// Generic builds an open-generic hole node. label is the hole number's decimal
// text ("1" for $1).
func Generic(label string) *Node {
	return &Node{kind: KindGeneric, key: "$" + label, label: label}
}

// Func builds a call-signature node from its return type and parameter rows.
func Func(ret *Node, rows [][]*Node) *Node {
	return &Node{kind: KindFunc, key: signatureKey("func", ret, rows, false), ret: ret, rows: rows}
}

// Ctor builds a construct-signature node from its instance type, parameter
// rows, and whether it comes from an abstract class. abstract folds into the
// key, so a concrete and an abstract constructor sharing every other field
// still intern to two distinct consts.
func Ctor(instance *Node, rows [][]*Node, abstract bool) *Node {
	return &Node{
		kind: KindCtor, key: signatureKey("ctor", instance, rows, abstract),
		ret: instance, rows: rows, abstract: abstract,
	}
}

// Tag builds a keyed node — the branded base with the key composed into it.
func Tag(inner *Node, key string) *Node {
	return &Node{kind: KindTag, key: `#tag(` + inner.key + `,"` + key + `")`, inner: inner, tag: key}
}

// Undefined builds the `undefined` literal-type node.
func Undefined() *Node {
	return &Node{kind: KindUndefined, key: "#undefined"}
}

// Null builds the `null` literal-type node.
func Null() *Node {
	return &Node{kind: KindNull, key: "#null"}
}

// signatureKey spells a Func / Ctor key. Each parameter row is delimited by its
// own parentheses, so a callable answering to one empty call and one answering
// to no call at all key differently — the same identity the runtime intern
// table gives them. The leading `#` can only ever start a composite: a leaf's
// key starts with a quote (a string literal), a digit or sign (a number), or an
// identifier character. abstract appends a marker no ordinary row can spell, so
// an abstract constructor never shares a concrete one's key.
func signatureKey(method string, ret *Node, rows [][]*Node, abstract bool) string {
	spelled := "#" + method + "(" + ret.key
	for _, row := range rows {
		spelled += "(" + joinKeys(row, ",") + ")"
	}
	if abstract {
		spelled += "!abstract"
	}
	return spelled + ")"
}

// flatRows is every parameter of every row, in order — the walk order a node's
// children are interned and rendered in.
func flatRows(rows [][]*Node) []*Node {
	out := make([]*Node, 0, len(rows))
	for _, row := range rows {
		out = append(out, row...)
	}
	return out
}

func joinKeys(nodes []*Node, sep string) string {
	keys := make([]string, len(nodes))
	for i, n := range nodes {
		keys[i] = n.key
	}
	return strings.Join(keys, sep)
}

// TypeRef identifies the value every generated const is built through: the
// module the factories are exported from and the name they hang off. It is DATA
// the caller supplies — this package names no module of its own, so the const
// table and the call-site emission can never disagree about where `Type` comes
// from.
type TypeRef struct {
	Module string
	Export string
}

// Registry is one project's const table. It is not safe for concurrent use; the
// host runs its file loop on one goroutine.
type Registry struct {
	// typeRef is the factory namespace the rendered module imports and builds
	// every const through.
	typeRef TypeRef
	// byKey maps a canonical key to the interned node, so a second Ref of the
	// same type reuses the first node rather than adding a const.
	byKey map[string]*Node
	// names maps a canonical key to its const name, and keyOfName inverts it so a
	// collision is caught at the moment it would be introduced.
	names     map[string]string
	keyOfName map[string]string
	// order is the emission order: a node is appended only after its children,
	// so the rendered module reads top to bottom with no forward reference.
	order []*Node
}

// NewRegistry builds an empty table whose consts are spelled through typeRef.
func NewRegistry(typeRef TypeRef) *Registry {
	return &Registry{
		typeRef:   typeRef,
		byKey:     map[string]*Node{},
		names:     map[string]string{},
		keyOfName: map[string]string{},
	}
}

// Ref interns n and its children and returns the const name a call site
// references it by. The error is a name collision — two distinct types that
// would share one identifier — which is an engine failure, never a user error.
func (r *Registry) Ref(n *Node) (string, error) {
	if name, ok := r.names[n.key]; ok {
		return name, nil
	}
	for _, child := range n.children() {
		if _, err := r.Ref(child); err != nil {
			return "", err
		}
	}
	// The children may have interned this node's key along the way only if the
	// tree were cyclic, which it cannot be; re-check anyway so the invariant
	// "one append per key" holds unconditionally.
	if name, ok := r.names[n.key]; ok {
		return name, nil
	}
	name := nameFor(n.key)
	if owner, taken := r.keyOfName[name]; taken {
		return "", fmt.Errorf("TYPEFOR_HOIST_NAME_COLLISION: %q and %q both name the const %s", owner, n.key, name)
	}
	r.byKey[n.key] = n
	r.names[n.key] = name
	r.keyOfName[name] = n.key
	r.order = append(r.order, n)
	return name, nil
}

// Len is the number of distinct interned nodes — and so the number of consts
// Module renders.
func (r *Registry) Len() int {
	return len(r.order)
}

// children are the nodes a node's factory call takes as arguments, in emission
// order.
func (n *Node) children() []*Node {
	switch n.kind {
	case KindNamed:
		return n.args
	case KindUnion:
		return n.members
	case KindFunc, KindCtor:
		out := make([]*Node, 0, len(n.rows)+1)
		out = append(out, n.ret)
		return append(out, flatRows(n.rows)...)
	case KindTag:
		return []*Node{n.inner}
	default:
		return nil
	}
}

// Module renders the generated module's source: the `Type` import, a header
// naming the scheme, then one const per interned node in dependency order.
// Returns "" when nothing was interned.
func (r *Registry) Module() string {
	if len(r.order) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(header)
	b.WriteString("import { " + r.typeRef.Export + " } from \"" + r.typeRef.Module + "\";\n\n")
	for _, n := range r.order {
		b.WriteString("export const " + r.names[n.key] + " = " + r.expr(n) + ";\n")
	}
	return b.String()
}

const header = `// Generated. Every derived type this project names, once each.
//
// A call site that derives a type references one of these consts instead of
// spelling the factory call inline, and a composite const references its member
// consts, so no subtree is written twice. The runtime interns structurally
// identical types to one object, so a const here and a hand-written
// Type.from("…") of the same spelling are the same object.
//
// A name is "$" plus the type's canonical spelling with every non-alphanumeric
// character replaced by "_", trimmed to its last 40 characters — the type's own
// name, since a spelling reads qualifier-first. A spelling that was entirely
// alphanumeric is unique on its own; anything else carries a short hash of the
// full spelling, so the name stays readable and still cannot collide.

`

// expr renders one node's `Type.*` factory call, referencing children by their
// const names.
func (r *Registry) expr(n *Node) string {
	switch n.kind {
	case KindLiteral:
		return r.typeRef.Export + ".typeLiteral(" + n.literal + ")"
	case KindUnion:
		return r.typeRef.Export + ".union(" + r.joinNames(n.members) + ")"
	case KindGeneric:
		return r.typeRef.Export + ".generic(\"" + n.label + "\")"
	case KindFunc:
		return r.signature(n, "func")
	case KindCtor:
		return r.signature(n, "ctor")
	case KindTag:
		return r.typeRef.Export + ".tag(" + r.names[n.inner.key] + ", \"" + n.tag + "\")"
	case KindUndefined:
		return r.typeRef.Export + ".typeLiteral(undefined)"
	case KindNull:
		return r.typeRef.Export + ".typeLiteral(null)"
	default: // KindNamed
		// A name is addressed by where it is reached from: the ambient scope
		// declares a global, and there is no specifier for it to carry.
		call := r.typeRef.Export + ".global(\"" + n.name + "\""
		if n.from != GlobalFrom {
			call = r.typeRef.Export + ".imported(\"" + n.name + "\", \"" + n.from + "\""
		}
		if len(n.args) != 0 {
			call += ", [" + r.joinNames(n.args) + "]"
		}
		return call + ")"
	}
}

// signature renders a KindFunc / KindCtor const — the return / instance type
// followed by its parameter rows as one array of arrays, whether the callable
// answers to one row or several, with a trailing `true` only when the node
// marks an abstract constructor.
func (r *Registry) signature(n *Node, method string) string {
	rows := make([]string, len(n.rows))
	for i, row := range n.rows {
		rows[i] = "[" + r.joinNames(row) + "]"
	}
	call := r.typeRef.Export + "." + method + "(" + r.names[n.ret.key] + ", [" + strings.Join(rows, ", ") + "]"
	if n.abstract {
		call += ", true"
	}
	return call + ")"
}

func (r *Registry) joinNames(nodes []*Node) string {
	parts := make([]string, len(nodes))
	for i, n := range nodes {
		parts[i] = r.names[n.key]
	}
	return strings.Join(parts, ", ")
}

// nameFor derives a const name from a canonical key. A key made only of
// alphanumeric characters survives sanitization unchanged, so it names itself
// and no other key can reach the same name; every other key gets a hash of its
// full spelling appended, since sanitization alone would merge, say, `a:b` and
// `a.b`.
func nameFor(key string) string {
	readable := sanitize(key)
	if readable == key && readable != "" {
		return "$" + readable
	}
	if len(readable) > maxReadableLen {
		// Keep the TAIL: a spelling reads qualifier-first, so its last characters
		// are the type's own name — the part someone scanning the module is
		// looking for.
		readable = strings.TrimLeft(readable[len(readable)-maxReadableLen:], "_")
	}
	sum := sha256.Sum256([]byte(key))
	suffix := hex.EncodeToString(sum[:])[:nameHashLen]
	if readable == "" {
		return "$" + suffix
	}
	return "$" + readable + "_" + suffix
}

// sanitize replaces every non-alphanumeric rune with "_", collapsing runs and
// trimming the ends, so the readable part of a name is a legal identifier body.
func sanitize(key string) string {
	var b strings.Builder
	underscore := false
	for _, r := range key {
		alnum := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
		if alnum {
			b.WriteRune(r)
			underscore = false
			continue
		}
		if !underscore {
			b.WriteByte('_')
			underscore = true
		}
	}
	return strings.Trim(b.String(), "_")
}
