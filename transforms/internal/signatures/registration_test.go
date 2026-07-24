package signatures

import (
	"testing"

	"github.com/fnioc/std/transforms/internal/tokens"
)

func TestSlotsEqual(t *testing.T) {
	str := tokens.LiteralValue{Kind: tokens.LiteralString, Str: "x"}
	cases := []struct {
		name string
		a, b Slot
		want bool
	}{
		{"same-token", tokenSlot("a"), tokenSlot("a"), true},
		{"diff-token", tokenSlot("a"), tokenSlot("b"), false},
		{"token-vs-factory", tokenSlot("a"), factorySlot{typ: "a"}, false},
		{"factory-eq", factorySlot{typ: "a", params: []string{"p"}}, factorySlot{typ: "a", params: []string{"p"}}, true},
		{"factory-param-diff", factorySlot{typ: "a", params: []string{"p"}}, factorySlot{typ: "a", params: []string{"q"}}, false},
		{"typearg-eq", typeArgSlot{typeArg: 1}, typeArgSlot{typeArg: 1}, true},
		{"typearg-diff", typeArgSlot{typeArg: 1}, typeArgSlot{typeArg: 2}, false},
		{"union-eq", unionSlot{members: []Slot{tokenSlot("a"), literalSlot{value: str}}}, unionSlot{members: []Slot{tokenSlot("a"), literalSlot{value: str}}}, true},
		{"union-len-diff", unionSlot{members: []Slot{tokenSlot("a")}}, unionSlot{members: []Slot{tokenSlot("a"), tokenSlot("b")}}, false},
		{"literal-eq", literalSlot{value: str}, literalSlot{value: str}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := slotsEqual(tc.a, tc.b); got != tc.want {
				t.Errorf("slotsEqual = %t, want %t", got, tc.want)
			}
		})
	}
}
