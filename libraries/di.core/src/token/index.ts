// The unified token/slot expression-tree module — one `TokenNode` tree consumed
// by visitors, collapsing the package's former five-way-parallel substitution.
// See `node.ts` for the tree, the visitor files for the ops, and `slot.ts` for
// the parse-at-edges boundary to the wire `DepSlot`.

// The tree: the plain-data node kinds + the `TokenNode.*` static op companion
// (parse / tryParse / toString / canonicalise / baseKey / isOpen).
export type { ConcreteNode, FactoryNode, HoleNode, LiteralNode, ProviderNode, UnionNode } from './node.js';
export { RESOLVER_TOKEN_STRING, TokenNode } from './node.js';

// The visitor bases + the ops. `Substituter` (the collapse of the five
// substitution routines), `Validator` (resolve-side kind guard), `Matcher`
// (dual-tree unify), `Specificity` (most-specific-wins metric).
export { Matcher } from './match.js';
export { Specificity } from './specificity.js';
export { Substituter } from './substitute.js';
export { Validator } from './validate.js';
export { TokenRewriter, TokenWalker } from './visitor.js';

// The parse-at-edges boundary + the two DepSlot-level signature transforms
// (closing against a binding; union blow-up to concrete overloads at reg time).
export { blowUpSignatures, closeSignatures, parseSlot, serialiseSlot } from './slot.js';

// The shallow string-grammar classification/compose edge.
export { closeToken, HOLE_PATTERN, isOpenToken, parseToken } from './edges.js';

// The gated reference manifest/provider (not on the live resolution path).
export type { Descriptor, SealedTokenManifest } from './manifest.js';
export { TokenManifest, TokenProvider } from './manifest.js';
