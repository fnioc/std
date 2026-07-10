package main

// Stable diagnostic codes for the config transformer. The high offset keeps them
// clear of TypeScript's own code space; they are part of the transformer's
// observable surface. Both are errors — the transformer never emits a warning and
// never a silent partial: an unsupported type aborts the whole call rewrite and
// reports a hard error. The codes and message text are byte-identical to the
// hand-written TypeScript transformer so the two paths are interchangeable.
const (
	// codeUnsupportedType marks a field whose type has no runtime schema
	// representation — a union (other than the intrinsic boolean), an
	// array/tuple, a function/callable, a library global, or an index-signature
	// record. The whole `.withType` call is left un-rewritten.
	codeUnsupportedType = "992001"
	// codeNonObjectRoot marks a `.withType<T>()` whose type argument is not an
	// object type — a bare leaf or other non-record.
	codeNonObjectRoot = "992002"
)

const messageNonObjectRoot = "withType<T>() requires T to be an object type. A bare leaf or non-record " +
	"type has no top-level schema; wrap your fields in an interface or " +
	"object type."

const messageUnsupportedType = "unsupported type for a configuration field. The runtime schema supports " +
	"string, number, boolean, and nested object types only -- name the field " +
	"with one of those (unions, arrays, functions, and library types like Date " +
	"have no schema representation)."
