package tokens

import (
	"unsafe"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// The checker's Type struct records the type ALIAS a reference was spelled
// through (`type Foo<...> = ...`) in an unexported `alias` field. The ttsc shim
// surfaces that field only as audit metadata (its extra-shim.json ExtraFields),
// never as an accessor, and the field's element type is itself unexported — so
// the sole route to the alias symbol and its type arguments is a field-offset
// read of the pinned struct.
//
// typeHeader mirrors the leading fields of checker.Type for the typescript-go
// revision pinned in go.mod; the mirror stops at `alias` and omits every trailing
// field. aliasData mirrors checker.TypeAlias — a symbol pointer and a []*Type
// slice, layout-identical to the shim-aliased element types below, so the values
// read straight out with no conversion.
type typeHeader struct {
	flags       shimchecker.TypeFlags
	objectFlags shimchecker.ObjectFlags
	id          uint32
	symbol      *shimast.Symbol
	alias       *aliasData
}

type aliasData struct {
	symbol        *shimast.Symbol
	typeArguments []*shimchecker.Type
}

// aliasOf returns the type's alias record, or nil when the type is not an alias
// instantiation. A layout checksum guards the offset read: the mirror's `symbol`
// field sits one pointer-slot ahead of `alias` and must equal the sanctioned
// Type.Symbol() accessor. If the pinned struct ever drifts the two disagree, and
// we fail safe to "no alias" rather than dereferencing a bogus pointer.
func aliasOf(t *shimchecker.Type) *aliasData {
	if t == nil {
		return nil
	}
	header := (*typeHeader)(unsafe.Pointer(t))
	if header.symbol != t.Symbol() {
		return nil
	}
	return header.alias
}
