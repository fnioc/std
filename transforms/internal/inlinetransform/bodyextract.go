package inlinetransform

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// knownPrimitives maps each compile-time primitive an inlineable body may call to
// its HOME module — the module an inline body is allowed to import it from.
// `nameof<T>()` binds a TYPE argument and lives in the universal
// `@rhombus-std/primitives` leaf (runtime source imports it directly, so it must
// stay universally importable). Its value-argument twins live there too:
// `tokenfor(value)` derives from the value's PRODUCED type (construct/call-sig
// return; the `addClass` / `addFactory` self forms), and `tokenof(value)` from
// the value's OWN type with no unwrap (the `addValue` self form, which registers
// an already-built value under its own type — matching the di engine's raw-type
// `addValue` derivation). `signatureof(ctor)` binds a VALUE argument (a
// class / factory) whose dependency signature the signatureof stage extracts, and
// `keyof<T>()` binds a TYPE argument and lowers to a keyed service's registration
// KEY; both are authoring-time-only constructs, so they live in
// `@rhombus-std/di.transformer` and a body imports them via a package-relative
// specifier from within that package (see primitiveImports).
//
// `signaturefor<T>()` / `signaturesfor<T>()` bind a TYPE argument (a dependency
// tuple / tuple-of-tuples) and MINT one overload's / the whole set's `DepSlot`s
// from it — the type-argument siblings of the value-argument `signatureof`. They
// produce di.core's `DepSlot` shape and are called from runtime source too, so
// they home in `@rhombus-std/di.core` and a body imports them by that package name
// (the peered core). `valueof<T>()` binds a literal TYPE argument and lowers to its
// VALUE (`valueof<"scoped">()` → `"scoped"`) — the authoring-only half of the
// `.as<Scope>()` sugar, homed in `@rhombus-std/di.transformer` beside signatureof /
// keyof and imported via a package-relative specifier. A hardcoded map suffices —
// the declare-by-marker generalization is a future enhancement.
// `isSingular<T>()` / `singularValue<T>()` bind a TYPE argument and are the
// resolve-family sugar's compile-time SINGULAR-type predicate / value (§94):
// `isSingular<T>()` lowers to a boolean literal and `singularValue<T>()` to the
// singular type's value literal, so a resolve body can branch
// `isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>())` and the
// engine constant-folds the dead branch away. Both are authoring-time-only
// (never in runtime source), so they home in the token-grammar transformer
// `@rhombus-std/primitives.transformer` — the §92 homing rule, distinct from
// `tokenfor`/`tokenof` (which stay in the runtime leaf because runtime source
// imports them).
// `schemaof<T>()` binds a TYPE argument and lowers to the config family's runtime
// schema object literal — the engine half of the `.withType<T>()` sugar body
// `this.withSchema(schemaof<T>())`. It is authoring-time-only, so it homes in the
// family's `@rhombus-std/config.transformer` (a body imports it via a
// package-relative specifier from within that package).
var knownPrimitives = map[string]string{
	"tokenfor":      "@rhombus-std/primitives",
	"tokenof":       "@rhombus-std/primitives",
	"keyedtokenfor": "@rhombus-std/di.transformer",
	"signatureof":   "@rhombus-std/di.transformer",
	"keyof":         "@rhombus-std/di.transformer",
	"signaturefor":  "@rhombus-std/di.core",
	"signaturesfor": "@rhombus-std/di.core",
	"valueof":       "@rhombus-std/di.transformer",
	"isSingular":    "@rhombus-std/primitives.transformer",
	"singularValue": "@rhombus-std/primitives.transformer",
	"schemaof":      "@rhombus-std/config.transformer",
}

// Discriminator is the structural overload key: (type-parameter count, value
// parameter count + encodings). A `this` parameter is excluded from both count
// and list; a binding-pattern parameter encodes as "<pattern>"; a rest
// parameter is prefixed "...". No type text is ever read — the encoding is a
// pure structural fingerprint used to separate a member's sugar overload from
// its runtime overloads.
type Discriminator struct {
	TypeParamCount int
	Params         []string
}

// Equal reports structural equality of two discriminators.
func (d Discriminator) Equal(o Discriminator) bool {
	if d.TypeParamCount != o.TypeParamCount || len(d.Params) != len(o.Params) {
		return false
	}
	for i := range d.Params {
		if d.Params[i] != o.Params[i] {
			return false
		}
	}
	return true
}

// ResolvedBody is the side-parsed impl body plus the metadata substitution and
// classification need: the single return expression, the impl's type-parameter
// and value-parameter names in order, its structural discriminator, the impl
// file's primitive-import map (local name -> canonical primitive name), and its
// body-external TYPE-import map (local name -> imported reference) for
// composed-generic derivation.
type ResolvedBody struct {
	Body             *shimast.Node
	TypeParams       []string
	Params           []string
	Discriminator    Discriminator
	PrimitiveImports map[string]string
	TypeImports      map[string]TypeImportRef
	File             string
}

// TypeImportRef is a body-external TYPE import a sugar body references in a
// type-argument position (`import type { IOptions } from '@rhombus-std/options'`,
// used as the base of `tokenfor<IOptions<T>>()`). The inline stage records it on
// the composed-generic use so the lowering stage can resolve the base symbol
// against the consumer program (side-parsed bodies carry no checker).
type TypeImportRef struct {
	// Module is the bare package specifier the type is imported from.
	Module string
	// Export is the imported type's exported name (its property name when the
	// specifier is aliased).
	Export string
}

// bodyExtractor side-parses declaring packages, caching each parsed file by its
// absolute path for the life of one build.
type bodyExtractor struct {
	cache map[string]*shimast.SourceFile
}

func newBodyExtractor() *bodyExtractor {
	return &bodyExtractor{cache: map[string]*shimast.SourceFile{}}
}

// parseFile side-parses path once, caching the result.
func (b *bodyExtractor) parseFile(path string) (*shimast.SourceFile, error) {
	if sf, ok := b.cache[path]; ok {
		return sf, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	sf := SideParse(path, string(data))
	b.cache[path] = sf
	return sf, nil
}

// Extract locates the impl body for entry e in packageDir and returns the
// resolved body. It follows the impl-file search order (entry file → intra-
// package re-exports → the conventional src/inline.ts fallback), then reads the
// member (or free-function) signature and the impl file's primitive imports.
func (b *bodyExtractor) Extract(packageDir string, e Entry) (*ResolvedBody, error) {
	kind, _ := e.Kind()

	implFile, implNode, err := b.locateImpl(packageDir, e.Impl)
	if err != nil {
		return nil, err
	}
	implSF := b.cache[implFile]

	var memberNode *shimast.Node
	switch kind {
	case KindFunction:
		memberNode = implNode // the function declaration itself
	default:
		memberNode = findMemberDeclaration(implNode, e.Member)
		if memberNode == nil {
			return nil, fmt.Errorf("INLINE_IMPL_NOT_FOUND: package %s impl %q has no member %q", packageDir, e.Impl, e.Member)
		}
	}

	body := functionLikeBody(memberNode)
	if body == nil {
		return nil, fmt.Errorf("INLINE_BODY_SHAPE: %s impl %q member %q has no block body", implFile, e.Impl, e.Member)
	}
	expr := SingleReturnExpression(body)
	if expr == nil {
		return nil, fmt.Errorf("INLINE_BODY_SHAPE: %s impl %q member %q is not a single return expression", implFile, e.Impl, e.Member)
	}

	typeParams := typeParamNames(memberNode)
	params, disc := valueParamsAndDiscriminator(memberNode, typeParams)
	primImports := primitiveImports(implSF, packageName(packageDir))
	typeImports := bodyTypeImports(implSF)

	rb := &ResolvedBody{
		Body:             expr,
		TypeParams:       typeParams,
		Params:           params,
		Discriminator:    disc,
		PrimitiveImports: primImports,
		TypeImports:      typeImports,
		File:             implFile,
	}
	if err := b.checkFreeIdentifiers(rb, e); err != nil {
		return nil, err
	}
	return rb, nil
}

// locateImpl finds the file and top-level declaration node introducing implName,
// following the search order in the build spec.
func (b *bodyExtractor) locateImpl(packageDir, implName string) (string, *shimast.Node, error) {
	entryFile, err := resolveEntryFile(packageDir)
	if err != nil {
		return "", nil, err
	}

	searched := []string{}
	seen := map[string]bool{}
	queue := []string{entryFile}
	for len(queue) > 0 {
		file := queue[0]
		queue = queue[1:]
		if seen[file] {
			continue
		}
		seen[file] = true
		sf, perr := b.parseFile(file)
		if perr != nil {
			continue
		}
		searched = append(searched, file)
		if node := findTopLevelDeclaration(sf, implName); node != nil {
			return file, node, nil
		}
		for _, target := range reExportTargets(sf) {
			resolved := resolveRelativeModule(filepath.Dir(file), target)
			if resolved != "" && !seen[resolved] {
				queue = append(queue, resolved)
			}
		}
	}

	// Fallback: the conventional src/inline.ts, kept out of the barrel so its
	// unbound nameof<T>() is never lowered inside the declaring package's own dist.
	fallback := filepath.Join(packageDir, "src", "inline.ts")
	if fileExists(fallback) {
		sf, perr := b.parseFile(fallback)
		if perr == nil {
			searched = append(searched, fallback)
			if node := findTopLevelDeclaration(sf, implName); node != nil {
				return fallback, node, nil
			}
		}
	}

	return "", nil, fmt.Errorf("INLINE_IMPL_NOT_FOUND: package %s export %q not found; searched %v", packageDir, implName, searched)
}

// checkFreeIdentifiers rejects a body whose returned expression references any
// identifier that is not a value param, `this`, an impl type param (in a
// primitive-call type-argument position), or a recorded primitive import. This
// is the defense-in-depth twin of the authoring lint's freeIdentifier rule.
func (b *bodyExtractor) checkFreeIdentifiers(rb *ResolvedBody, e Entry) error {
	allowed := map[string]bool{}
	for _, p := range rb.Params {
		allowed[strings.TrimPrefix(p, "...")] = true
	}
	for _, tp := range rb.TypeParams {
		allowed[tp] = true
	}
	for local := range rb.PrimitiveImports {
		allowed[local] = true
	}
	// A dedicated value-position walk. It flags any identifier that is not an
	// allowed value reference, descending into every VALUE child so a free
	// identifier ANYWHERE is reached — including a call argument that follows a
	// property-access callee (`this.isService(n<T>())`), the position a prior
	// short-circuit skipped. Two identifier positions are deliberately NOT value
	// references and are never checked:
	//   - a property access's member NAME (`a.b`: the `b`); and
	//   - a TYPE ARGUMENT (`nameof<Marker>()`: `Marker` — a type the consumer's
	//     checker resolves, not a value). Skipping the whole TypeArguments list of
	//     a call/new covers any type shape inside it (unions, nested refs, …).
	var bad string
	var check func(n *shimast.Node)
	check = func(n *shimast.Node) {
		if n == nil || bad != "" {
			return
		}
		switch n.Kind {
		case shimast.KindIdentifier:
			if !allowed[n.Text()] {
				bad = n.Text()
			}
			return
		case shimast.KindPropertyAccessExpression:
			check(n.AsPropertyAccessExpression().Expression)
			return
		case shimast.KindCallExpression:
			call := n.AsCallExpression()
			check(call.Expression)
			if call.Arguments != nil {
				for _, arg := range call.Arguments.Nodes {
					check(arg)
				}
			}
			return
		case shimast.KindNewExpression:
			nw := n.AsNewExpression()
			check(nw.Expression)
			if nw.Arguments != nil {
				for _, arg := range nw.Arguments.Nodes {
					check(arg)
				}
			}
			return
		}
		n.ForEachChild(func(child *shimast.Node) bool {
			check(child)
			return bad != ""
		})
	}
	check(rb.Body)

	if bad != "" {
		return fmt.Errorf("INLINE_BODY_FREE_IDENTIFIER: %s impl %q member %q references %q, which is neither a parameter, type parameter, nor a known primitive import", rb.File, e.Impl, e.Member, bad)
	}
	return nil
}

// findMemberDeclaration returns the member declaration node named memberName on
// the impl (object-literal method / property assignment / class method), or nil.
func findMemberDeclaration(impl *shimast.Node, memberName string) *shimast.Node {
	var found *shimast.Node
	walk(impl, func(node *shimast.Node) bool {
		switch node.Kind {
		case shimast.KindMethodDeclaration, shimast.KindPropertyAssignment:
			if name := node.Name(); name != nil && name.Text() == memberName {
				found = node
				return true
			}
		}
		return false
	})
	return found
}

// functionLikeNode normalizes a member/function declaration to the node whose
// FunctionLikeData carries type params, parameters, and (where present) a body:
// a property assignment unwraps to its function/arrow initializer; everything
// else (method signature, method declaration, function declaration) is already
// function-like.
func functionLikeNode(node *shimast.Node) *shimast.Node {
	if node.Kind == shimast.KindPropertyAssignment {
		init := node.AsPropertyAssignment().Initializer
		if init != nil && (init.Kind == shimast.KindFunctionExpression || init.Kind == shimast.KindArrowFunction) {
			return init
		}
		return nil
	}
	return node
}

// typeParamNames returns the type-parameter names declared on a member or
// function-like node, in order.
func typeParamNames(node *shimast.Node) []string {
	fn := functionLikeNode(node)
	if fn == nil {
		return nil
	}
	tps := fn.TypeParameters()
	out := make([]string, 0, len(tps))
	for _, tp := range tps {
		if name := tp.Name(); name != nil {
			out = append(out, name.Text())
		}
	}
	return out
}

// valueParamsAndDiscriminator returns the value-parameter names (this excluded)
// and the structural discriminator for a member/function node.
func valueParamsAndDiscriminator(node *shimast.Node, typeParams []string) ([]string, Discriminator) {
	params := functionLikeParams(node)
	names := []string{}
	encoded := []string{}
	for _, p := range params {
		decl := p.AsParameterDeclaration()
		name := decl.Name()
		// Exclude a `this` parameter entirely.
		if name != nil && name.Kind == shimast.KindIdentifier && name.Text() == "this" {
			continue
		}
		var enc string
		switch {
		case name != nil && name.Kind == shimast.KindIdentifier:
			enc = name.Text()
			names = append(names, name.Text())
		default:
			enc = "<pattern>"
			names = append(names, "<pattern>")
		}
		if decl.DotDotDotToken != nil {
			enc = "..." + enc
			names[len(names)-1] = "..." + names[len(names)-1]
		}
		encoded = append(encoded, enc)
	}
	return names, Discriminator{TypeParamCount: len(typeParams), Params: encoded}
}

// declarationDiscriminator computes the structural discriminator of a merged
// declaration node (a method signature, method, or function declaration).
func declarationDiscriminator(node *shimast.Node) Discriminator {
	tps := typeParamNames(node)
	_, disc := valueParamsAndDiscriminator(node, tps)
	return disc
}

// functionLikeParams returns the parameter list of a method-signature / method /
// function / arrow node (unwrapping a property assignment).
func functionLikeParams(node *shimast.Node) []*shimast.Node {
	fn := functionLikeNode(node)
	if fn == nil {
		return nil
	}
	list := fn.ParameterList()
	if list == nil {
		return nil
	}
	return list.Nodes
}

// primitiveImports reads sf's top-level named imports and returns a local-name ->
// primitive-name map, keeping only known primitives imported from their HOME
// module and only unaliased bindings (the authoring lint forbids aliasing).
//
// A primitive is accepted from its home module directly (`nameof` from
// `@rhombus-std/primitives`), OR — when the primitive's home IS the declaring
// package — via a package-relative specifier (`signatureof` from `./signatureof`,
// authored inside `@rhombus-std/di.transformer`), so a same-package authoring
// primitive need not be self-imported by package name. A primitive imported from
// any OTHER module (e.g. a stale `signatureof` from primitives) is rejected.
func primitiveImports(sf *shimast.SourceFile, declaringPkg string) map[string]string {
	out := map[string]string{}
	if sf == nil {
		return out
	}
	for _, stmt := range sf.Statements.Nodes {
		if stmt.Kind != shimast.KindImportDeclaration {
			continue
		}
		decl := stmt.AsImportDeclaration()
		spec := decl.ModuleSpecifier
		if spec == nil || spec.Kind != shimast.KindStringLiteral {
			continue
		}
		module := spec.Text()
		clause := decl.ImportClause
		if clause == nil {
			continue
		}
		bindings := clause.AsImportClause().NamedBindings
		if bindings == nil || bindings.Kind != shimast.KindNamedImports {
			continue
		}
		for _, el := range bindings.AsNamedImports().Elements.Nodes {
			exported := importSpecifierExportedName(el)
			local := el.Name().Text()
			home, known := knownPrimitives[exported]
			if !known || exported != local {
				continue
			}
			fromHome := module == home
			fromOwnPackage := isRelativeSpecifier(module) && home == declaringPkg
			if fromHome || fromOwnPackage {
				out[local] = exported
			}
		}
	}
	return out
}

// bodyTypeImports reads sf's top-level named imports from BARE package specifiers
// and returns a local-name -> imported-reference map for every binding that is NOT
// a known primitive — the body-external TYPE imports a sugar body may reference in
// a type-argument position (`import type { IOptions } from '@rhombus-std/options'`,
// used as `tokenfor<IOptions<T>>()`). Primitives are excluded (they are recorded
// separately by primitiveImports as CALLEES, never composed-generic bases), and
// relative specifiers are excluded (a body-external base is always a package the
// consumer program can resolve by name). Aliasing is honored: the recorded Export
// is the specifier's property name.
func bodyTypeImports(sf *shimast.SourceFile) map[string]TypeImportRef {
	out := map[string]TypeImportRef{}
	if sf == nil {
		return out
	}
	for _, stmt := range sf.Statements.Nodes {
		if stmt.Kind != shimast.KindImportDeclaration {
			continue
		}
		decl := stmt.AsImportDeclaration()
		spec := decl.ModuleSpecifier
		if spec == nil || spec.Kind != shimast.KindStringLiteral {
			continue
		}
		module := spec.Text()
		if isRelativeSpecifier(module) {
			continue
		}
		clause := decl.ImportClause
		if clause == nil {
			continue
		}
		bindings := clause.AsImportClause().NamedBindings
		if bindings == nil || bindings.Kind != shimast.KindNamedImports {
			continue
		}
		for _, el := range bindings.AsNamedImports().Elements.Nodes {
			exported := importSpecifierExportedName(el)
			if _, isPrimitive := knownPrimitives[exported]; isPrimitive {
				continue
			}
			out[el.Name().Text()] = TypeImportRef{Module: module, Export: exported}
		}
	}
	return out
}

// isRelativeSpecifier reports whether an import specifier is package-relative
// (`./x` / `../x`) rather than a bare package name.
func isRelativeSpecifier(module string) bool {
	return strings.HasPrefix(module, ".")
}

// importSpecifierExportedName returns a named import specifier's exported name —
// its property name when aliased (`nameof as k`), else its local name.
func importSpecifierExportedName(element *shimast.Node) string {
	spec := element.AsImportSpecifier()
	if spec.PropertyName != nil {
		return spec.PropertyName.Text()
	}
	return element.Name().Text()
}

// reExportTargets returns the module specifiers of a file's intra-package
// re-exports: `export { X } from './y'` and `export * from './y'`. Only
// relative specifiers matter for the intra-package walk.
func reExportTargets(sf *shimast.SourceFile) []string {
	var out []string
	for _, stmt := range sf.Statements.Nodes {
		if stmt.Kind != shimast.KindExportDeclaration {
			continue
		}
		spec := stmt.AsExportDeclaration().ModuleSpecifier
		if spec != nil && spec.Kind == shimast.KindStringLiteral {
			text := spec.Text()
			if strings.HasPrefix(text, ".") {
				out = append(out, text)
			}
		}
	}
	return out
}

// resolveRelativeModule resolves a relative module specifier against baseDir to
// an on-disk .ts file (./x -> ./x.ts | ./x/index.ts), stripping a .js extension
// the source-lib convention writes.
func resolveRelativeModule(baseDir, specifier string) string {
	stripped := specifier
	for _, ext := range []string{".js", ".mjs", ".cjs"} {
		if strings.HasSuffix(stripped, ext) {
			stripped = strings.TrimSuffix(stripped, ext)
			break
		}
	}
	base := filepath.Clean(filepath.Join(baseDir, filepath.FromSlash(stripped)))
	for _, candidate := range []string{base + ".ts", filepath.Join(base, "index.ts")} {
		if fileExists(candidate) {
			return candidate
		}
	}
	return ""
}

// resolveEntryFile returns the declaring package's src entry file: the "." export
// condition preferring a "*-source" condition, else "source", else ./src/index.ts.
func resolveEntryFile(packageDir string) (string, error) {
	data, err := os.ReadFile(filepath.Join(packageDir, "package.json"))
	if err != nil {
		return "", fmt.Errorf("INLINE_NO_SRC_ENTRY: cannot read package.json in %s: %w", packageDir, err)
	}
	var pkg struct {
		Exports json.RawMessage `json:"exports"`
	}
	_ = json.Unmarshal(data, &pkg)

	if rel := dotExportSource(pkg.Exports); rel != "" {
		abs := filepath.Join(packageDir, filepath.FromSlash(rel))
		if fileExists(abs) {
			return abs, nil
		}
	}
	def := filepath.Join(packageDir, "src", "index.ts")
	if fileExists(def) {
		return def, nil
	}
	return "", fmt.Errorf("INLINE_NO_SRC_ENTRY: package %s has no resolvable src entry file", packageDir)
}

// dotExportSource extracts the src-facing target of the "." export, preferring a
// "<pkg>-source" condition, then "source", then "types"/"bun" pointing at src.
func dotExportSource(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var exports map[string]json.RawMessage
	if err := json.Unmarshal(raw, &exports); err != nil {
		return ""
	}
	dot, ok := exports["."]
	if !ok {
		return ""
	}
	var conds map[string]string
	if err := json.Unmarshal(dot, &conds); err != nil {
		var lit string
		if json.Unmarshal(dot, &lit) == nil {
			return lit
		}
		return ""
	}
	// Prefer any "*-source" condition (the self-typecheck src pointer).
	for key, val := range conds {
		if strings.HasSuffix(key, "-source") {
			return val
		}
	}
	for _, key := range []string{"source"} {
		if val, ok := conds[key]; ok {
			return val
		}
	}
	// Fall back to a condition already pointing into src/.
	for _, key := range []string{"bun", "types", "import", "default"} {
		if val, ok := conds[key]; ok && strings.Contains(val, "/src/") {
			return val
		}
	}
	return ""
}
