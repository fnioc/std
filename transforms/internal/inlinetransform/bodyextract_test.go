package inlinetransform

import (
	"path/filepath"
	"strings"
	"testing"
)

// oneImplPackage writes a minimal declaring package: a package.json (no exports,
// so resolveEntryFile defaults to src/index.ts), the given src/index.ts, and —
// when non-empty — a src/inline.ts holding the impl (the conventional fallback
// locateImpl searches after the entry file).
func oneImplPackage(t *testing.T, indexSrc, inlineSrc string) string {
	t.Helper()
	dir := t.TempDir()
	write(t, filepath.Join(dir, "package.json"), `{ "name": "@scope/pkg", "version": "1.0.0" }`)
	write(t, filepath.Join(dir, "src", "index.ts"), indexSrc)
	if inlineSrc != "" {
		write(t, filepath.Join(dir, "src", "inline.ts"), inlineSrc)
	}
	return dir
}

const indexStub = `export {};
`

// TestExtractRejects is the Go body-hygiene defense-in-depth: the enforced twin
// of the authoring lint that stops a drifted or never-linted published body.
// Each case is a one-package fixture whose impl violates one rule; Extract must
// reject it with the matching INLINE_* code.
func TestExtractRejects(t *testing.T) {
	member := Entry{Type: "p:Foo", Impl: "QueryInline", Member: "bar"}

	cases := []struct {
		name    string
		inline  string
		entry   Entry
		wantErr string
	}{
		{
			name: "free identifier in the body",
			inline: `export const QueryInline = {
  bar<T>(this: any): boolean { return helper(); },
};
`,
			entry:   member,
			wantErr: "INLINE_BODY_FREE_IDENTIFIER",
		},
		{
			name: "two-statement body is not a single return",
			inline: `export const QueryInline = {
  bar<T>(this: any): boolean { const x = 1; return x > 0; },
};
`,
			entry:   member,
			wantErr: "INLINE_BODY_SHAPE",
		},
		{
			name: "arrow with an expression body (no block)",
			inline: `export const QueryInline = {
  bar: <T>(): boolean => this.isService(),
};
`,
			entry:   member,
			wantErr: "INLINE_BODY_SHAPE",
		},
		{
			name: "member absent from the impl",
			inline: `export const QueryInline = {
  bar<T>(this: any): boolean { return this.isService(); },
};
`,
			entry:   Entry{Type: "p:Foo", Impl: "QueryInline", Member: "nonexistent"},
			wantErr: "INLINE_IMPL_NOT_FOUND",
		},
		{
			// An aliased primitive is NOT recorded as a primitive import
			// (primitiveImports keeps only unaliased bindings), so referencing the
			// alias in the body is a free identifier. The alias is the outer callee
			// here so the free-identifier walk reaches it directly.
			name: "aliased primitive reference fails the free-identifier walk",
			inline: `import { tokenfor as n } from '@rhombus-std/primitives.extras';
export const QueryInline = {
  bar<T>(this: any): string { return n<T>(); },
};
`,
			entry:   member,
			wantErr: "INLINE_BODY_FREE_IDENTIFIER",
		},
		{
			// The same aliased free identifier, but now as a call ARGUMENT after a
			// property-access callee (`this.isService(n<T>())`). This is the shape
			// the property-access short-circuit used to skip: aborting at the
			// callee halted the sibling walk before the argument was ever checked.
			// The skip-set fix keeps siblings walking, so `n` is caught here too.
			name: "free identifier as an argument after a property-access callee",
			inline: `import { tokenfor as n } from '@rhombus-std/primitives.extras';
export const QueryInline = {
  bar<T>(this: any): boolean { return this.isService(n<T>()); },
};
`,
			entry:   member,
			wantErr: "INLINE_BODY_FREE_IDENTIFIER",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := oneImplPackage(t, indexStub, c.inline)
			_, err := newBodyExtractor().Extract(dir, c.entry)
			if err == nil {
				t.Fatalf("expected %s, got no error", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Fatalf("want %s, got %v", c.wantErr, err)
			}
		})
	}
}

// TestLocateImplFollowsReExports: the impl lives in src/impls.ts and the entry
// file only re-exports it via `export * from './impls.js'`. Extract must follow
// the intra-package re-export (stripping the .js the source-lib convention
// writes) to find the body.
func TestLocateImplFollowsReExports(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "package.json"), `{ "name": "@scope/pkg", "version": "1.0.0" }`)
	write(t, filepath.Join(dir, "src", "index.ts"), `export * from './impls.js';
`)
	write(t, filepath.Join(dir, "src", "impls.ts"), `export const QueryInline = {
  bar<T>(this: any): boolean { return this.isService(); },
};
`)

	rb, err := newBodyExtractor().Extract(dir, Entry{Type: "p:Foo", Impl: "QueryInline", Member: "bar"})
	if err != nil {
		t.Fatalf("Extract should follow the re-export hop: %v", err)
	}
	if rb == nil || rb.Body == nil {
		t.Fatalf("expected a resolved body, got %+v", rb)
	}
	if !strings.HasSuffix(rb.File, filepath.Join("src", "impls.ts")) {
		t.Fatalf("body resolved from %q, want src/impls.ts", rb.File)
	}
}

// TestExtractPropertyAssignmentAndArrowForms: the impl-member shapes beyond a
// plain method. A property-assignment function expression and an arrow with a
// BLOCK body both extract; an arrow with an EXPRESSION body is rejected
// INLINE_BODY_SHAPE — pinning the current rejection as intended.
func TestExtractPropertyAssignmentAndArrowForms(t *testing.T) {
	inline := `import { tokenfor } from '@rhombus-std/primitives.extras';
export const QueryInline = {
  bar: function<T>(this: any): boolean { return this.isService(tokenfor<T>()); },
  baz: <T>(): boolean => { return this.isService(tokenfor<T>()); },
  qux: <T>(): boolean => this.isService(tokenfor<T>()),
};
`
	dir := oneImplPackage(t, indexStub, inline)

	for _, member := range []string{"bar", "baz"} {
		t.Run(member+" extracts", func(t *testing.T) {
			rb, err := newBodyExtractor().Extract(dir, Entry{Type: "p:Foo", Impl: "QueryInline", Member: member})
			if err != nil {
				t.Fatalf("Extract(%s): %v", member, err)
			}
			if rb == nil || rb.Body == nil {
				t.Fatalf("Extract(%s) returned no body", member)
			}
		})
	}

	t.Run("qux arrow-expression-body is rejected", func(t *testing.T) {
		_, err := newBodyExtractor().Extract(dir, Entry{Type: "p:Foo", Impl: "QueryInline", Member: "qux"})
		if err == nil || !strings.Contains(err.Error(), "INLINE_BODY_SHAPE") {
			t.Fatalf("want INLINE_BODY_SHAPE for an arrow with an expression body, got %v", err)
		}
	})
}
