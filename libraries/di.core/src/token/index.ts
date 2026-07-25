// The unified token/slot expression-tree module: one `TokenNode` tree, a set of
// visitors over it, and a parse-at-edges boundary to the wire `DepSlot`.

// The tree: the plain-data node kinds + the `TokenNode.*` static op companion
// (parse / tryParse / toString / canonicalise / baseKey / isOpen).
export type { ConcreteNode, FactoryNode, HoleNode, LiteralNode, ProviderNode, UnionNode } from './node.js';
export { RESOLVER_TOKEN_STRING, TokenNode } from './node.js';

// The visitor bases + the ops: `Substituter`, `Matcher` (dual-tree unify),
// `Specificity` (most-specific-wins metric), and `Validator` — a kind guard for
// a caller holding a HAND-BUILT tree; trees reached through `DepSlot` cannot
// spell a malformed one.
export { Matcher } from './match.js';
export { Specificity } from './specificity.js';
export { Substituter } from './substitute.js';
export { Validator } from './validate.js';
export { TokenRewriter, TokenWalker } from './visitor.js';

// The parse-at-edges boundary (`parseSlot` / `serialiseSlot`) + the one
// DepSlot-level signature transform: closing an open template's signatures
// against a binding.
export { closeSignatures, parseSlot, serialiseSlot } from './slot.js';

// The classification/compose edge: `isOpenToken` (read off the typed tree, so it
// does not depend on spelling), the shallow `parseToken` / `closeToken` string
// pair, and the key strip every classification runs first.
export { closeToken, isOpenToken, parseToken, unkeyedToken } from './edges.js';
