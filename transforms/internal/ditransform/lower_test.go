package ditransform

import (
	"reflect"
	"testing"

	"github.com/fnioc/std/transforms/internal/tokens"
)

func TestHoleNodeNumber(t *testing.T) {
	cases := []struct {
		token string
		want  int
		ok    bool
	}{
		{"$1", 1, true},
		{"$2", 2, true},
		{"$10", 10, true},
		{"$0", 0, false},       // no leading zero
		{"$", 0, false},        // no digit
		{"$1a", 0, false},      // trailing non-digit
		{"IFoo<$1>", 0, false}, // not a bare hole node
		{"pkg:IFoo", 0, false}, // plain token
		{"", 0, false},         // empty
		{"$01", 0, false},      // leading zero
		{"$123456", 123456, true},
	}
	for _, tc := range cases {
		got, ok := holeNodeNumber(tc.token)
		if ok != tc.ok || got != tc.want {
			t.Errorf("holeNodeNumber(%q) = (%d, %t), want (%d, %t)", tc.token, got, ok, tc.want, tc.ok)
		}
	}
}

func TestTokenHoles(t *testing.T) {
	cases := []struct {
		token string
		want  []int
	}{
		{"$1", []int{1}},
		{"pkg:IFoo<$1,$2>", []int{1, 2}},
		{"pkg:IFoo<$1,$1>", []int{1}},
		{"pkg:IFoo<pkg:IBar<$3>>", []int{3}},
		{"pkg:IFoo", nil},
		{`pkg:IFoo<"$1">`, nil}, // quoted literal arg, not a hole
	}
	for _, tc := range cases {
		got := map[int]bool{}
		tokenHoles(tc.token, got)
		want := map[int]bool{}
		for _, n := range tc.want {
			want[n] = true
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("tokenHoles(%q) = %v, want %v", tc.token, got, want)
		}
	}
}

func TestClassifyServiceToken(t *testing.T) {
	cases := []struct {
		name      string
		token     string
		hasToken  bool
		wantHoles []int
		wantMixed bool
	}{
		{"closed", "pkg:IFoo<pkg:User>", true, nil, false},
		{"all-holes", "pkg:IFoo<$1,$2>", true, []int{1, 2}, false},
		{"repeat-holes", "pkg:IFoo<$1,$1>", true, []int{1}, false},
		{"mixed-concrete-hole", "pkg:IFoo<$1,pkg:User>", true, []int{1}, true},
		{"nested-hole-is-mixed", "pkg:IFoo<pkg:IBar<$1>>", true, nil, true},
		{"no-token", "", false, nil, false},
		{"non-generic", "pkg:IFoo", true, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			shape := classifyServiceToken(tc.token, tc.hasToken)
			want := map[int]bool{}
			for _, n := range tc.wantHoles {
				want[n] = true
			}
			if len(shape.holes) == 0 {
				shape.holes = map[int]bool{}
			}
			if !reflect.DeepEqual(shape.holes, want) {
				t.Errorf("holes = %v, want %v", shape.holes, want)
			}
			if shape.mixed != tc.wantMixed {
				t.Errorf("mixed = %t, want %t", shape.mixed, tc.wantMixed)
			}
		})
	}
}

func TestSlotHoles(t *testing.T) {
	cases := []struct {
		name string
		slot Slot
		want []int
	}{
		{"token", tokenSlot("pkg:IFoo<$1>"), []int{1}},
		{"typeArg", typeArgSlot{typeArg: 2}, []int{2}},
		{"factory", factorySlot{typ: "pkg:IFoo<$1>", params: []string{"$2"}}, []int{1, 2}},
		{"union", unionSlot{members: []Slot{tokenSlot("$1"), typeArgSlot{typeArg: 3}}}, []int{1, 3}},
		{"literal-no-holes", literalSlot{value: tokens.LiteralValue{Kind: tokens.LiteralString, Str: "x"}}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := map[int]bool{}
			slotHoles(tc.slot, got)
			want := map[int]bool{}
			for _, n := range tc.want {
				want[n] = true
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("slotHoles = %v, want %v", got, want)
			}
		})
	}
}

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
