package typeforhoist

import (
	"strings"
	"testing"
)

func clockNode() *Node {
	return Named("IClock", "orders", nil)
}

func TestOneConstPerDistinctNode(t *testing.T) {
	registry := NewRegistry()
	clock := clockNode()
	promised := Named("Promise", "global", []*Node{clockNode()})
	iterable := Named("Iterable", "global", []*Node{clockNode()})

	for _, node := range []*Node{clock, promised, iterable, clockNode(), promised} {
		if _, err := registry.Ref(node); err != nil {
			t.Fatal(err)
		}
	}
	if registry.Len() != 3 {
		t.Fatalf("want 3 distinct nodes, got %d", registry.Len())
	}
	if got := strings.Count(registry.Module(), "\nexport const "); got != registry.Len() {
		t.Fatalf("want %d consts rendered, got %d:\n%s", registry.Len(), got, registry.Module())
	}
}

func TestChildrenAreDeclaredBeforeParents(t *testing.T) {
	registry := NewRegistry()
	inner := Named("IClock", "orders", nil)
	if _, err := registry.Ref(Named("Promise", "global", []*Node{inner})); err != nil {
		t.Fatal(err)
	}
	module := registry.Module()
	innerName, err := registry.Ref(inner)
	if err != nil {
		t.Fatal(err)
	}
	declaration := strings.Index(module, "export const "+innerName+" = ")
	reference := strings.Index(module, "["+innerName+"]")
	if declaration < 0 || reference < 0 || declaration > reference {
		t.Fatalf("a member const is declared before the composite referencing it:\n%s", module)
	}
}

func TestNamingIsIndependentOfEncounterOrder(t *testing.T) {
	forward := NewRegistry()
	backward := NewRegistry()
	nodes := []func() *Node{
		func() *Node { return Named("IClock", "orders", nil) },
		func() *Node { return Named("IMessageSink", "orders", nil) },
		func() *Node { return Tag(Named("IClock", "orders", nil), "vendor") },
	}
	for i := range nodes {
		if _, err := forward.Ref(nodes[i]()); err != nil {
			t.Fatal(err)
		}
		if _, err := backward.Ref(nodes[len(nodes)-1-i]()); err != nil {
			t.Fatal(err)
		}
	}
	for _, build := range nodes {
		node := build()
		left, err := forward.Ref(node)
		if err != nil {
			t.Fatal(err)
		}
		right, err := backward.Ref(node)
		if err != nil {
			t.Fatal(err)
		}
		if left != right {
			t.Fatalf("%s named %s one way and %s the other", node.Key(), left, right)
		}
	}
}

func TestUnionIdentityIgnoresMemberOrder(t *testing.T) {
	registry := NewRegistry()
	ascending := Union([]*Node{Literal(`"a"`), Literal(`"b"`)})
	descending := Union([]*Node{Literal(`"b"`), Literal(`"a"`)})
	if ascending.Key() != descending.Key() {
		t.Fatalf("member order fragments identity: %q vs %q", ascending.Key(), descending.Key())
	}
	if _, err := registry.Ref(ascending); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Ref(descending); err != nil {
		t.Fatal(err)
	}
	// The union plus its two literal members.
	if registry.Len() != 3 {
		t.Fatalf("want 3 distinct nodes, got %d:\n%s", registry.Len(), registry.Module())
	}
}

func TestKeyMirrorsTheFlatTokenSpelling(t *testing.T) {
	cases := map[string]*Node{
		"IClock":                       Named("IClock", "global", nil),
		"orders:IClock":                Named("IClock", "orders", nil),
		"Promise<orders:IClock>":       Named("Promise", "global", []*Node{Named("IClock", "orders", nil)}),
		"$1":                           Generic("1"),
		`"a" | "b"`:                    Union([]*Node{Literal(`"a"`), Literal(`"b"`)}),
		`#tag(orders:IClock,"vendor")`: Tag(Named("IClock", "orders", nil), "vendor"),
		"#func(IClock)":                Func(Named("IClock", "global", nil), nil),
		"#ctor(IClock,orders:IClock)":  Ctor(Named("IClock", "global", nil), []*Node{Named("IClock", "orders", nil)}),
	}
	for want, node := range cases {
		if node.Key() != want {
			t.Errorf("want key %q, got %q", want, node.Key())
		}
	}
}

func TestAnAlphanumericKeyNamesItself(t *testing.T) {
	if got := nameFor("string"); got != "$string" {
		t.Fatalf("want $string, got %s", got)
	}
	// Anything with punctuation carries the hash that keeps `a:b` and `a.b` apart.
	if nameFor("a:b") == nameFor("a.b") {
		t.Fatal("two keys with the same sanitized spelling must not share a name")
	}
	if !strings.HasPrefix(nameFor("orders:IClock"), "$orders_IClock_") {
		t.Fatalf("want a readable prefix, got %s", nameFor("orders:IClock"))
	}
}
