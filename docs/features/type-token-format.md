# Type tokens

A **type token** is the string spelling of a `Type` node — `Type.stringify` writes one, `Type.from`
reads one back. The two are exact inverses: stringifying a node and reading the result always
yields the identical node back, however deeply nested, and whatever characters its names or
literal values happen to contain. This doc is the grammar both sides agree on.

A token names exactly one type. Whitespace between tokens (around punctuation, inside generic
argument lists) is insignificant and never appears in a written token; `Type.from` accepts it
anywhere a reader would expect a boundary.

## Names

A name is written as one **segment** — the building block behind a global name, an import
qualifier, a tag, a generic hole's label, and an object member key alike.

A segment that opens with a letter, `_`, `$` or `@` and contains only letters, digits, `_`, `$`,
`@`, `/`, `.` and `-` needs no special handling — it is written exactly as it reads:

```
Foo
@rhombus-std/di.core
has-a-dash
```

Anything else — a name starting with a digit, containing a space, or spelled like one of the
reserved words below — opens with a `\` marker. The marker itself stands for nothing; it only says
"read this as a name, not as whatever it would otherwise mean." Individual characters outside the
safe set above are then each escaped with their own `\`:

```
\1st                        -- "1st": safe once marked, no per-character escapes needed
\has\ space\<and\>\:colon   -- "has space<and>:colon": each unsafe character escaped
\                           -- "": the empty name, spelled as the marker alone
```

## Naming a type

A type is named either through the ambient scope or through a package:

```
string                          -- a global type
app:Foo                         -- imported, name "Foo" from "app"
@rhombus-std/di.core:Manifest   -- imported, from a scoped package name
```

An unqualified name is always global. `pkg:Name` is always imported, `pkg` and `Name` each a
segment. Writing the qualifier out as the literal word `global` also names a global type — the same
node as its bare, unqualified spelling — but `global` itself can never be a package: `imported`
throws if asked to spell one.

Generic arguments follow the name in a comma-separated `<...>` list, on either a global or an
imported name:

```
app:Box<app:A, app:B>
Promise<string>
```

## Reserved names

An unqualified, unescaped name spelled exactly like one of the words below does not name an
ordinary type — it carries the reading in this table instead:

| spelling                        | reading                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| `Func<Return, ...Signatures>`   | a function type — see [Callable types](#callable-types-func-and-ctor)    |
| `Ctor<Instance, ...Signatures>` | a constructor type — see [Callable types](#callable-types-func-and-ctor) |
| `ServiceProvider`               | the provider type itself (no generic arguments)                          |
| `Array<E>`                      | an array of `E` (exactly one argument)                                   |
| `Iterable<E>`                   | an iterable of `E` (exactly one argument)                                |
| `true`, `false`                 | the boolean literal                                                      |
| `null`, `undefined`             | the nullish literal                                                      |
| `NaN`, `Infinity`               | the numeric literal (no generic arguments on any of these)               |
| `new`                           | reserved so it can mark a constructor type — see below                   |

Two doors reopen the ordinary-name reading. **Qualifying** a reserved word disambiguates it — it
can only be an import or an explicit `global:` — so `app:Func`, `app:ServiceProvider` and
`global:Func` all name ordinary types, no escaping needed. **Escaping** does the same for an
unqualified spelling: `\Func`, `\true`, `\new` name the global types `Func`, `true` and `new`.

`Array` and `Iterable` are reserved regardless of how many generic arguments follow — writing a
plain global type literally called `Array` or `Iterable` always escapes, whether it carries zero
arguments, two, or any count other than the one that makes it the aggregate kind:

```
Array<app:A>            -- the aggregate: an ArrayType of app:A
\Array                  -- the global type named "Array", no arguments
\Array<app:A, app:A>    -- the global type named "Array", two arguments
```

`new` only actually triggers a constructor reading directly in front of `(` — see
[Callable types](#callable-types-func-and-ctor) — so a bare `new` with nothing after it, or
followed by anything other than `(`, reads as the escaped-free global type `new` would otherwise
need escaping for; it is reserved because _some_ position needs the escape, not because every
occurrence does. The same is true of the `abstract` marker that can precede a constructor's `new`:
it is not itself a reserved word, and only acts as that marker directly in front of `new (`.

## Generic holes

A **generic hole** — an unbound type variable — is written `%` followed by a segment:

```
%T
%odd\|label
```

## Literals

A literal value is written in the form its own type would use:

```
"a string, JSON-quoted"
42
1.5
1e21
-0
42n
true
false
null
undefined
NaN
Infinity
-Infinity
```

Strings use exactly JSON string syntax, decoded with `JSON.parse` and written with
`JSON.stringify` — any character JSON can escape survives. A bigint is a run of digits (optionally
signed) followed by `n`. `-0` is spelled distinctly from `0`, so the two round-trip as the distinct
values they are. A keyword literal name never carries generic arguments — `true<app:A>` is
malformed.

## Union and intersection

`|` spells a union, `&` an intersection, with intersection binding tighter:

```
app:A | app:B & app:C          -- app:A | (app:B & app:C)
(app:A | app:B) & app:C        -- parentheses needed to intersect the union itself
```

Both are canonicalized at the point a node is built, not merely at the point it is written: nested
members of the same composite splice into one flat list, duplicates collapse, and a union additionally
drops a literal member whenever its own primitive base (`string`, `number`, `bigint` or `boolean`) is
also a member — `null` and `undefined` have no base and are never dropped this way. A composite left
with one surviving member is that member itself, not a one-member union or intersection.

The surviving members are then sorted into one canonical order: first by kind (generic holes first,
composites next, literals last), then by the kind's own scalar fields (a name, a tag, an `abstract`
flag), then by comparing children pairwise. The practical effect: two spellings that name the same
members in different orders read back as the identical node, and `Type.stringify` always re-emits
that node in its one canonical order —

```
Type.stringify(Type.union(Type.global('string'), Type.typeLiteral('x'), A))
  === 'string | app:A'   -- the "x" literal is dropped: string is also a member
```

A member spelled at a looser precedence than its position needs is wrapped in parentheses so the
nesting survives the round trip. From loosest to tightest: an arrow (`=>`) binds loosest, then
union, then intersection, then a tag, with names/tuples/objects/literals/holes self-delimiting at
the tightest level:

```
app:C & (app:A | app:B)     -- a union nested inside an intersection member
(app:A & app:B)#primary     -- an intersection nested under a tag
app:B | app:A#x             -- a tag over one union member needs nothing beyond the tag itself
(app:A) => (app:B) => app:C -- an arrow chained through its own return position needs no extra parens
(() => app:A) | app:B       -- an arrow as a union member does need them
```

## Tags

`#` followed by a segment tags the type before it:

```
app:A#primary
```

A type wears at most one tag — a second `#` on an already-tagged type is malformed.

## Objects

A structural object type is a brace-delimited, semicolon-separated list of `key: Type` members:

```
{ a: string; b: app:B }
{}
```

Members are keyed in sorted order at construction — writing them in another order names the same
type, and `Type.stringify` always emits them sorted. A member's type is written at the loosest
precedence, so a nested arrow needs no extra parentheses:

```
{ f: (app:B) => app:A }
```

## Tuples

An ordered list of member types is comma-separated inside square brackets. At most one slot,
written last, may be a trailing rest: `...` followed by the list the open length draws from —
either list spelling reads, and the tuple stores the list's element, so `Type.stringify` always
re-emits an `Array` spelling. A slot that may be absent carries `undefined` in its own type, the
same as an optional object member.

```
[app:A, 5]
[]
[app:A, app:B | undefined]
[app:A, ...Array<app:B>]
```

Members are written at the loosest precedence, the same as an object member's type or a generic
argument — the surrounding brackets already delimit each one, so nothing there ever needs its own
parentheses.

## Callable types: Func and Ctor

A function type is `(Signatures) => Return`; a constructor type is `new (Signatures) => Instance`, or
`abstract new (Signatures) => Instance` for one that builds an abstract class:

```
(app:B) => app:A
new (app:B) => app:A
abstract new (app:A) => app:B
```

**Signatures** are a callable's parameter lists — one signature per overload, semicolon-separated,
each signature a comma-separated list of parameter types. A callable answers to at least one call,
so an empty signature list is never written; a callable taking no parameters at all is one
signature that is itself empty. The node behind the parentheses is the union of the per-overload
rows — each row a tuple, or a list for a signature that is entirely a rest — so overloads read
back in the union's one canonical order however they were written:

```
() => app:A                    -- one signature, taking nothing
(app:A) => app:B               -- one signature, one parameter
(app:A; app:B, app:A) => app:B -- two signatures: [app:A], then [app:B, app:A]
(; app:A) => app:B             -- two signatures: an empty signature, then [app:A]
```

A signature's last slot may be a trailing rest, `...` followed by the list its open length draws
from; a signature that is nothing but that slot IS the list itself:

```
(...Array<app:A>) => app:B           -- any number of app:A arguments
(app:A, ...Array<app:B>) => app:C    -- one app:A, then any number of app:B
```

An opening `(` only begins a function type when, once its matching `)` is found, the very next
token is `=>` — otherwise it is an ordinary grouping paren around a nested type. A constructor type
is recognized the same way, marked by `new (` (or `abstract new (`) immediately before the
parameter list.

`Func` and `Ctor` are reserved unqualified names carrying the same information in argument-list
form: the return type (for `Func`) or instance type (for `Ctor`) comes first, separated from the
first parameter signature by the same comma every other generic argument uses, with any further signatures
semicolon-delimited after it:

```
Func<app:B, app:A; >        -- (app:A; ) => app:B
Ctor<app:B; app:A>          -- new (; app:A) => app:B
```

A one-signature spelling reads as one flat comma list — `Func<app:B, app:A>` is `(app:A) => app:B` — since
the head and the signature's own members share the same separator when there is only one signature to
introduce.

## Grammar summary

```
type         := ctor | arrow | union
ctor         := "abstract"? "new" "(" signatures ")" "=>" type
arrow        := "(" signatures ")" "=>" type
union        := intersection ("|" intersection)*
intersection := tagged ("&" tagged)*
tagged       := primary ("#" segment)*
primary      := literal
              | "%" segment
              | name
              | "(" type ")"
              | "[" tuple "]"
              | "{" members "}"
signatures   := signature (";" signature)*
signature    := (slot ("," slot)*)?
members      := (segment ":" type (";" segment ":" type)*)? "}"
tuple        := (slot ("," slot)*)?
slot         := type | "..." type
list(type)   := (type ("," type)*)?
name         := segment (":" segment genericArgs?)?
genericArgs  := "<" list(type) ">"
literal      := string | number | bigint | "true" | "false" | "null" | "undefined" | "NaN" | "Infinity" | "-Infinity"
segment      := plain-identifier | "\" escaped-body
```

`name` covers both forms: a bare segment names a global type (or, unescaped and reserved, one of
the readings in [Reserved names](#reserved-names)); `segment ":" segment` names an import, or —
when the first segment is exactly `global` — the same global type its bare name would.
