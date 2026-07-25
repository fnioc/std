// The unified token/slot expression-tree module — one `TokenNode` tree consumed
// by visitors, collapsing the package's former five-way-parallel substitution.
// See `node.ts` for the tree, the visitor files for the ops, and `slot.ts` for
// the parse-at-edges boundary to the wire `DepSlot`.

// The tree: the plain-data node kinds + the `TokenNode.*` static op companion
// (parse / tryParse / toString / canonicalise / baseKey / isOpen).
export type { ConcreteNode, FactoryNode, HoleNode, LiteralNode, ProviderNode, UnionNode } from './node.js';
export { RESOLVER_TOKEN_STRING, TokenNode } from './node.js';

// The visitor bases + the ops. `Substituter` (the collapse of the five
// substitution routines), `Matcher` (dual-tree unify), `Specificity`
// (most-specific-wins metric), and `Validator` — the resolve-side kind guard,
// offered to a caller holding a hand-built tree; the engine's own paths reach
// resolution through `DepSlot`, which cannot spell a malformed one.
export { Matcher } from './match.js';
export { Specificity } from './specificity.js';
export { Substituter } from './substitute.js';
export { Validator } from './validate.js';
export { TokenRewriter, TokenWalker } from './visitor.js';

// The parse-at-edges boundary (`parseSlot` / `serialiseSlot`) + the one
// DepSlot-level signature transform: closing an open template's signatures
// against a binding. (The registration-time union blow-up to concrete overloads
// that used to sit alongside it was abandoned — §112.)
export { closeSignatures, parseSlot, serialiseSlot } from './slot.js';

// The classification/compose edge: `isOpenToken` (open template?, read off the
// typed tree so it does not depend on spelling), the shallow `parseToken` /
// `closeToken` string pair, and the key strip every classification runs first.
export { closeToken, isOpenToken, parseToken, unkeyedToken } from './edges.js';
