package inlinetransform

import "testing"

func disc(typeParams int, params ...string) Discriminator {
	return Discriminator{TypeParamCount: typeParams, Params: params}
}

// A body serves a declaration when it names the same value parameters, or when a
// trailing rest absorbs whatever the declaration carries beyond the ones it does
// name. Type-parameter count is never negotiable.
func TestDiscriminatorMatches(t *testing.T) {
	cases := []struct {
		name string
		body Discriminator
		decl Discriminator
		want bool
	}{
		{"exact", disc(1, "ctor", "signatures"), disc(1, "ctor", "signatures"), true},
		{"bare rest absorbs every parameter", disc(1, "...rest"), disc(1, "ctor", "signatures", "scope", "key"), true},
		{"bare rest absorbs none", disc(1, "...rest"), disc(1), true},
		{"rest absorbs the tail after a named lead", disc(1, "ctor", "...rest"), disc(1, "ctor", "signatures"), true},
		{"lead must still agree by name", disc(1, "factory", "...rest"), disc(1, "ctor", "signatures"), false},
		{"declaration shorter than the named lead", disc(1, "ctor", "sig", "...rest"), disc(1, "ctor"), false},
		{"type-parameter count is never absorbed", disc(1, "...rest"), disc(0, "ctor"), false},
		{"a non-rest body does not stretch", disc(1, "ctor"), disc(1, "ctor", "signatures"), false},
	}
	for _, c := range cases {
		if got := c.body.Matches(c.decl); got != c.want {
			t.Errorf("%s: Matches = %v, want %v", c.name, got, c.want)
		}
	}
}

// Where two bodies both serve one declaration, the one that names its parameters
// wins; the rest body is the fallback. At equal specificity the incumbent stays,
// so the owned-entry order decides rather than map iteration.
func TestSupersedesPrefersTheExactBody(t *testing.T) {
	decl := disc(1, "ctor", "signatures")
	exact := disc(1, "ctor", "signatures")
	rest := disc(1, "...rest")

	if !supersedes(decl, rest, exact) {
		t.Error("an exact body must displace a rest body already chosen")
	}
	if supersedes(decl, exact, rest) {
		t.Error("a rest body must never displace an exact one")
	}
	if supersedes(decl, exact, exact) {
		t.Error("equal specificity must keep the incumbent")
	}
	if supersedes(decl, rest, rest) {
		t.Error("equal specificity must keep the incumbent, rest included")
	}
}
