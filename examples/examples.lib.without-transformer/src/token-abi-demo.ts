// THE TOKEN/SLOT ABI — the layer under the container, and the surface a TOOL
// works against rather than an application.
//
// The scenario is a small container-diagnostics library: something a platform
// team ships so that `myapp --explain-wiring` prints what a service is actually
// composed of, and `myapp --migrate-package old new` rewrites a manifest's
// tokens after a package rename. Both are jobs an application never does and a
// tool always does, and both are impossible with string matching alone — which
// is exactly why `@rhombus-std/di.core` publishes the token grammar as a real
// data structure rather than leaving everyone to regex it.
//
// THE ONE MODEL WORTH INTERNALISING. A token is a STRING on the wire — that is
// its identity, what gets stored, compared and printed. `TokenNode` is a
// transient PARSED VIEW of that string: parse at the edge, run the operation on
// the tree, serialise back. Nothing keeps a tree; a manifest holds strings.
//
//   "pkg:IRepo<pkg:User>"   ── TokenNode.parse ──▶   { kind: 'concrete',
//                                                      base: 'pkg:IRepo',
//                                                      args: [ …User… ] }
//                           ◀── TokenNode.toString ──
//
// The tree has six node kinds, and they are the SAME vocabulary as a dependency
// slot: `concrete` (a real token, possibly generic, possibly keyed), `hole` (a
// `$N` position in an open template), `provider` (the intrinsic resolver slot),
// plus the three that only ever appear as slots — `union`, `literal`, `factory`.
// One tree, one traversal, whether you are looking at a service token or at one
// of its dependency slots.
//
// Dialect-independent, and deliberately so: this is string-and-tree work with no
// types in sight, so there is nothing for a transformer to derive and no
// tokenless twin to write. Both example apps run THIS chapter. Every import
// comes from `@rhombus-std/di.core` — a tool that reads registrations has no
// reason to pull in the resolution engine, and the abstractions package is
// exactly the dependency a library author wants.
//
// Note how the chapter is SHAPED by that, and is better for it. The fixture
// container is an `add*` function like any other library contribution
// (`addReportingFixture`), and the inspector takes the registrations it is handed
// (`demonstrateTokenAbi(services)`) rather than composing its own. Which is what
// a real diagnostics tool does anyway: it reports on a container somebody else
// built.

import type { IServiceManifest } from '@rhombus-std/di.core';
import { closeSignatures, closeToken, isFactoryRef, isLiteralRef, isOpenToken, isTypeArgRef, isUnionSlot, Matcher,
  parseSlot, parseToken, RESOLVER_TOKEN, serialiseSlot, Specificity, Substituter, TokenNode, TokenRewriter, TokenWalker,
  typeArg, union, Validator } from '@rhombus-std/di.core';
import type { ConcreteNode, DepSignatures, DepSlot, FactoryNode, FactoryRef, HoleNode, LiteralNode, LiteralRef,
  ManifestEntry, OpenRegistration, ParsedToken, ProviderNode, Registration, Token, TypeArgRef, Union,
  UnionNode } from '@rhombus-std/di.core';

// ── the container being inspected ────────────────────────────────────────────

/** Loads entities of one type. Registered as an open template. */
class SqlRepository<T> {
  public constructor(
    public readonly entityToken: Token,
    public readonly connection: unknown,
  ) {}

  public describe(): string {
    return `repository of ${this.entityToken}`;
  }

  public load(): readonly T[] {
    return [];
  }
}

/** The one thing every repository bottoms out at. */
class Connection {
  public readonly dsn = 'memory://reports';
}

/** Reads reports. Its slots deliberately cover the whole slot vocabulary. */
class ReportService {
  public constructor(
    public readonly connection: Connection,
    public readonly region: string,
    public readonly mintRepository: () => unknown,
    public readonly cache: unknown,
  ) {}
}

const CONNECTION_TOKEN = 'reports:IConnection';
const REPORT_TOKEN = 'reports:IReportService';
const CACHE_TOKEN = 'reports:ICache';
const MEMORY_CACHE_TOKEN = 'reports:IMemoryCache';
const USER_TOKEN = 'reports:User';
const AUDIT_TOKEN = 'reports:AuditEvent';

/**
 * `closeToken(base, ...args)` renders the canonical `base<arg,…>` form, and it
 * is the only sane way to write one: string concatenation drifts from the
 * grammar the parser expects the moment an argument is itself generic.
 *
 * A hole is the literal text `$N` in an argument position — ONE of them
 * anywhere, at any depth, is what makes a token an open TEMPLATE; the other
 * arguments are free to be concrete.
 *
 * `N` is a 1-based label with no leading zero. `$0`, `$01` and `$007` are
 * therefore not holes at all, and a token carrying one is not a template — it
 * files as an ordinary exact registration under its literal spelling, which
 * nothing will ever ask for. `classify` below prints that outcome rather than
 * describing it.
 */
const REPOSITORY_TEMPLATE = closeToken('reports:IRepository', '$1');
const USER_REPOSITORY_TOKEN = closeToken('reports:IRepository', USER_TOKEN);

/**
 * A CLOSED closing of the same base, registered exactly. It gives the inspector
 * below both an `open` and an `exact` entry over one base to tell apart — which
 * is the pair a wiring report has to get right, since the exact one wins for its
 * single closing and the template still serves every other.
 */
const AUDIT_REPOSITORY_TOKEN = closeToken('reports:IRepository', AUDIT_TOKEN);

/**
 * The registrations the inspector reads. Nothing is ever resolved from them; the
 * whole point of the chapter is that a manifest can be examined without being
 * built.
 *
 * Shaped as an ordinary `add*` entry — it REGISTERS INTO a manifest the caller
 * supplies rather than constructing one — because that is what this library is
 * allowed to do, and the split costs the demonstration nothing. Constructing the
 * collection is composition-root work; filling it is the library's.
 *
 * @param services The registration builder to add the fixture to.
 */
export function addReportingFixture(services: IServiceManifest<'singleton'>): IServiceManifest<'singleton'> {
  services = services.addClass(CONNECTION_TOKEN, Connection, [[]], 'singleton');
  services = services.addClass(MEMORY_CACHE_TOKEN, Connection, [[]], 'singleton');
  // The open template. `typeArg(1)` is the slot that asks for the TOKEN STRING
  // of the closing's first type argument — a `TypeArgRef`, one of the three
  // object-shaped slot kinds.
  services = services.addClass(
    REPOSITORY_TEMPLATE,
    SqlRepository,
    [[typeArg(1), CONNECTION_TOKEN]],
    'singleton',
  );
  // One exact closing, registered on its own so the inspector has both an
  // `exact` and an `open` entry to classify.
  services = services.addClass(AUDIT_REPOSITORY_TOKEN, SqlRepository, [[{ value: AUDIT_TOKEN }, CONNECTION_TOKEN]]);
  // Every remaining slot kind in one signature: a plain token, a LITERAL (its
  // value injected verbatim, no lookup), a FACTORY (a callable producing the
  // named token), and a UNION (alternatives tried in order).
  services = services.addClass(
    REPORT_TOKEN,
    ReportService,
    [[
      CONNECTION_TOKEN,
      { value: 'eu-west' },
      { type: USER_REPOSITORY_TOKEN },
      union(CACHE_TOKEN, MEMORY_CACHE_TOKEN),
    ]],
    'singleton',
  );
  return services;
}

// ── 1. classifying a token, without parsing it ───────────────────────────────

/**
 * The SHALLOW string edge: `parseToken` splits `base<a,b>` into its base and
 * top-level arguments, and `isOpenToken` answers "does this contain a hole
 * anywhere". Neither builds a tree, and both are grammar-aware where a regex is
 * not — a `<` inside a quoted literal argument does not open a nesting level.
 *
 * Reach for these when the question is about the token's SHAPE. Reach for
 * `TokenNode` (below) when you need to look inside it.
 *
 * @param token Any token string.
 * @returns A human-readable classification.
 */
export function classify(token: Token): string {
  const parsed: ParsedToken | undefined = parseToken(token);
  if (parsed === undefined) {
    return `${token} — not generic (no top-level arguments)`;
  }
  const openness = isOpenToken(token) ? 'OPEN template' : 'closed generic';
  return `${token} — ${openness}, base ${parsed.base}, ${parsed.args.length} argument(s)`;
}

// ── 2. the parsed tree ───────────────────────────────────────────────────────

/**
 * Renders the parsed shape of a token — the `TokenNode.*` companion in one
 * place.
 *
 * `parse` throws on a malformed token; `tryParse` returns `undefined` instead,
 * which is what you want when the input came from somewhere you do not control.
 * `canonicalise` is `toString(parse(raw))`, so it is the cheap way to compare
 * two spellings of the same token for equality. `baseKey` strips the generic
 * arguments back to `base(#key)?` — the key an open-template index is bucketed
 * on. `isOpen` asks the tree the question `isOpenToken` asks the string.
 *
 * @param raw A token string, trusted or not.
 */
export function describeTree(raw: string): string {
  const node = TokenNode.tryParse(raw);
  if (node === undefined) {
    return `${raw} — unparseable; tryParse said so instead of throwing`;
  }
  const parts = [
    `kind=${node.kind}`,
    `base=${TokenNode.baseKey(node)}`,
    `open=${TokenNode.isOpen(node)}`,
    `roundTrip=${TokenNode.toString(node) === TokenNode.canonicalise(raw)}`,
  ];
  return `${raw} — ${parts.join(' ')}`;
}

// ── 3. walking a tree: a custom TokenWalker ──────────────────────────────────

/**
 * Collects every PACKAGE a token's tree mentions — "what does this one
 * registration couple us to?", the question that makes a dependency report
 * worth printing.
 *
 * `TokenWalker<T>` is the read-only visitor: one `switch(kind)` routed for you,
 * a `__fold` that combines a node's own contribution with its children's, and an
 * override for whichever node kinds are interesting. Overriding `__visitConcrete`
 * alone is enough here, because only a concrete node carries a base string.
 *
 * The point of subclassing rather than hand-rolling a recursion: the walker
 * already knows every node kind, so a future kind cannot be silently skipped.
 */
export class PackageCollector extends TokenWalker<readonly string[]> {
  /** The distinct package specifiers `node` refers to, in first-seen order. */
  public collect(node: TokenNode): readonly string[] {
    return [...new Set(this.walk(node))];
  }

  protected __fold(_node: TokenNode, children: ReadonlyArray<readonly string[]>): readonly string[] {
    return children.flat();
  }

  protected override __visitConcrete(node: ConcreteNode): readonly string[] {
    // `pkg:Name` — everything before the last colon is the import specifier.
    const colon = node.base.lastIndexOf(':');
    const own = colon === -1 ? [] : [node.base.slice(0, colon)];
    return [...own, ...this.__fold(node, node.args.map((arg) => this.walk(arg)))];
  }
}

// ── 4. rewriting a tree: a custom TokenRewriter ──────────────────────────────

/**
 * Rewrites every occurrence of one package specifier to another, at any depth —
 * the migration a package rename forces on a manifest that was authored with
 * explicit tokens.
 *
 * `TokenRewriter` is the tree→tree visitor: its default walk rebuilds each
 * branch node by spread with its children rewritten, so an override only has to
 * describe the nodes it actually changes. Doing this as a string replace would
 * be wrong for the usual reason — `reports:User` is a prefix of
 * `reports:UserGroup`.
 */
export class PackageRenamer extends TokenRewriter {
  public constructor(
    private readonly from: string,
    private readonly to: string,
  ) {
    super();
  }

  /** Rewrites `token`, returning the canonical string of the result. */
  public rename(token: Token): Token {
    return TokenNode.toString(this.rewrite(TokenNode.parse(token)));
  }

  protected override __visitConcrete(node: ConcreteNode): TokenNode {
    const renamed = node.base.startsWith(`${this.from}:`)
      ? `${this.to}${node.base.slice(this.from.length)}`
      : node.base;
    // Spread-rebuild, never mutate: nodes are plain data and the manifest
    // updates them the same way.
    return { ...node, base: renamed, args: node.args.map((arg) => this.rewrite(arg)) };
  }
}

// ── 5. matching a template against a closing ─────────────────────────────────

/**
 * Answers "would this template serve that token, and with what bindings?" — the
 * question the engine asks itself every time a closing misses the exact map, and
 * the one a diagnostic has to answer to explain WHY a registration was chosen.
 *
 * `Matcher` unifies directionally: template on the left, closed ground token on
 * the right. It returns a label→node binding on success and `undefined` on a
 * miss, and a repeated hole label must bind to the same argument twice — which
 * is what makes `IPair<$1,$1>` mean something different from `IPair<$1,$2>`.
 *
 * @param template An open template token.
 * @param ground A fully closed token.
 * @returns One line describing the match or the miss.
 */
export function explainMatch(template: Token, ground: Token): string {
  const bind = new Matcher().match(TokenNode.parse(template), TokenNode.parse(ground));
  if (bind === undefined) {
    return `${template} does NOT serve ${ground}`;
  }
  const bindings = [...bind.entries()]
    .map(([label, node]) => `$${label}=${TokenNode.toString(node)}`)
    .join(', ');
  return `${template} serves ${ground} with ${bindings}`;
}

// ── 6. ranking overlapping templates ─────────────────────────────────────────

/**
 * Orders templates most-specific-first, which is what a container has to do when
 * two of them could both serve the same closing.
 *
 * `Specificity.measure` counts the CONCRETE nodes in a tree and adds one per
 * repeated hole label. Both terms matter: more concrete nodes means a narrower
 * match set, and a repeated label constrains the arguments to be equal, so
 * `IPair<$1,$1>` is strictly narrower than `IPair<$1,$2>` and outranks it.
 *
 * This is the SAME metric the container ranks by. A closing that misses the
 * exact map tries the templates bucketed under its base most-specific-FIRST, and
 * only a tie sends it back to registration order — latest wins there, matching
 * the last-wins rule everywhere else. The sort below breaks its ties by name
 * instead, so the report stays byte-stable whatever order the candidates arrive
 * in.
 *
 * It is a metric over TREES and nothing else: it never asks whether a shape
 * would be ACCEPTED at registration, so a diagnostic can rank whatever set of
 * candidates it is handed.
 *
 * @param templates The candidate templates, in any order.
 * @returns The same templates, most specific first, each with its score.
 */
export function rankBySpecificity(templates: readonly Token[]): readonly string[] {
  const specificity = new Specificity();
  return templates
    .map((template) => ({ template, score: specificity.measure(TokenNode.parse(template)) }))
    .sort((left, right) => right.score - left.score || left.template.localeCompare(right.template))
    .map(({ template, score }) => `${template} (specificity ${score})`);
}

// ── 7. slots: the wire form, the tree form, and closing a template ───────────

/**
 * Names a dependency slot's kind using the published guards.
 *
 * A slot is either a plain token string or one of four object shapes, and the
 * guards are how a tool tells them apart without duck-typing on property names.
 * The distinction is not cosmetic — each kind reaches a different resolution
 * path, and only the plain-token kind is a lookup at all.
 */
export function describeSlot(slot: DepSlot): string {
  if (typeof slot === 'string') {
    return `token ${slot}`;
  }
  if (isTypeArgRef(slot)) {
    const ref: TypeArgRef = slot;
    return `typeArg $${ref.typeArg} — the closing's argument token, as a value`;
  }
  if (isFactoryRef(slot)) {
    const ref: FactoryRef = slot;
    const params = ref.params === undefined ? 'shape follows the registration' : `caller supplies ${ref.params.length}`;
    return `factory of ${ref.type} — ${params}`;
  }
  if (isUnionSlot(slot)) {
    const ref: Union = slot;
    return `union of ${ref.union.length} — tried in order, first resolvable wins`;
  }
  const ref: LiteralRef = slot;
  return `literal ${JSON.stringify(ref.value)} — injected verbatim, never looked up`;
}

/**
 * Names a NODE's kind — the tree-side counterpart of `describeSlot`, and the
 * whole six-kind vocabulary in one switch.
 *
 * Worth doing as a `switch (node.kind)` rather than a chain of guards: the union
 * is discriminated, so each arm narrows to exactly one node interface and TypeScript
 * will reject the function outright if a seventh kind is ever added. That is the
 * property a tool wants from a published AST — a new node kind should break the
 * build, not get silently skipped.
 *
 * The split that matters: `concrete`, `hole` and `provider` are TOKEN-shaped and
 * serialise back to a token string; `union`, `literal` and `factory` are
 * slot-only, have no token-string form at all, and are exactly what `Validator`
 * rejects when they turn up where a resolvable token was expected.
 */
export function describeNode(node: TokenNode): string {
  switch (node.kind) {
    case 'concrete': {
      const concrete: ConcreteNode = node;
      const key = concrete.key === undefined ? '' : `, key ${concrete.key}`;
      return `concrete ${concrete.base} (${concrete.args.length} argument(s)${key})`;
    }
    case 'hole': {
      const hole: HoleNode = node;
      // `index` is a LABEL, not an ordinal: holes are reorderable, and a repeated
      // label is what constrains two arguments to be equal.
      const flavour = hole.typeArg === true ? 'typeArg — reifies to the bound token STRING' : 'plain';
      return `hole $${hole.index} (${flavour})`;
    }
    case 'provider': {
      const provider: ProviderNode = node;
      return `${provider.kind} — the intrinsic resolver slot, no registration behind it`;
    }
    case 'union': {
      const alternatives: UnionNode = node;
      return `union of ${alternatives.members.length} (slot-only, no token form)`;
    }
    case 'literal': {
      const literal: LiteralNode = node;
      return `literal ${JSON.stringify(literal.value)} (slot-only, supplies its own value)`;
    }
    case 'factory': {
      const factory: FactoryNode = node;
      return `factory of ${TokenNode.toString(factory.type)} (slot-only, injects a callable)`;
    }
  }
}

/**
 * Round-trips a slot through the tree and reports whether it survived.
 *
 * `parseSlot` is the wire→tree edge and `serialiseSlot` is tree→wire. That they
 * compose to the identity is the invariant the whole design rests on: the tree
 * is a VIEW, and no operation that goes through it can change a slot it did not
 * mean to touch.
 */
export function slotRoundTrips(slot: DepSlot): boolean {
  return JSON.stringify(serialiseSlot(parseSlot(slot))) === JSON.stringify(slot);
}

/**
 * Shows what an open registration's signatures become once a closing is chosen —
 * the substitution step that turns a template into an ordinary registration.
 *
 * `Substituter` replaces holes by LABEL inside one tree; `closeSignatures` is the
 * signature-level edge that maps it across every slot of every overload. The
 * `typeArg` hole is the interesting one: it does not substitute to the bound
 * NODE, it reifies to a LITERAL carrying that node's token string — which is how
 * a generic implementation learns which closing it was minted for, given that a
 * type parameter leaves nothing behind at runtime.
 *
 * @param signatures The template's own (still open) signatures.
 * @param template The open template token.
 * @param ground The closing to substitute in.
 */
export function closeAgainst(signatures: DepSignatures, template: Token, ground: Token): readonly string[] {
  const bind = new Matcher().match(TokenNode.parse(template), TokenNode.parse(ground));
  if (bind === undefined) {
    return [`${template} does not serve ${ground}`];
  }
  // The tree-level op, shown alongside the signature-level one so the
  // relationship is visible: `closeSignatures` IS `Substituter` mapped over
  // every slot.
  const substituter = new Substituter(bind);
  const closedToken = TokenNode.toString(substituter.rewrite(TokenNode.parse(template)));
  const closed = closeSignatures(signatures, bind);
  return [
    `  template ${template} closes to ${closedToken}`,
    ...closed[0]!.map((slot) => `    slot: ${describeSlot(slot)}`),
  ];
}

/**
 * The resolve-side guard: a slot that will be RESOLVED as a dependency has to be
 * a pure token node (`concrete | hole | provider`). The three slot-only kinds are
 * handled by their own paths before resolution ever sees them, so meeting one
 * here means the tree is malformed.
 *
 * A tool wants this because it is the difference between "this slot names
 * something the container will look up" and "this slot supplies its own value".
 *
 * @returns `true` when every node in the slot is resolvable as a token.
 */
export function isResolvableSlot(slot: DepSlot): boolean {
  try {
    new Validator().validate(parseSlot(slot));
    return true;
  } catch {
    return false;
  }
}

// ── 8. the report ────────────────────────────────────────────────────────────

/**
 * Walks a manifest and reports what each registration is bound to.
 *
 * A manifest is an `Iterable<ManifestEntry>` in AUTHORING order, and an entry is
 * either `exact` (a closed token bound to a `Registration`) or `open` (a
 * template bound to an `OpenRegistration`). Nothing is built and nothing is
 * resolved — this is the manifest read as data, which is the only way a tool can
 * report on a container it did not compose.
 */
export function describeRegistrations(services: Iterable<ManifestEntry>): readonly string[] {
  const lines: string[] = [];
  for (const entry of services) {
    if (entry.kind === 'exact') {
      const registration: Registration = entry.registration;
      const lifetime = registration.scope ?? 'transient';
      lines.push(`  exact ${entry.token} -> ${registration.name || '(value)'} [${lifetime}]`);
      continue;
    }
    const open: OpenRegistration = entry.open;
    // The template's ARITY, read off the parsed tree the registration carries.
    // `node` is the very tree the engine unifies a closing against; it is
    // optional on the ABI only so a hand-built `OpenRegistration` literal stays
    // valid, which is why a tool reparses when it is absent. Narrowing to
    // `concrete` is not defensive bookkeeping — `args` lives on that one node
    // kind, and a template that parsed to anything else would not have
    // registered in the first place.
    const template = open.node ?? TokenNode.parse(open.template);
    const arity = template.kind === 'concrete' ? template.args.length : 0;
    lines.push(`  open  ${open.template} (base ${open.base}, arity ${arity}) -> ${open.ctor.name}`);
  }
  return lines;
}

/**
 * Runs the whole token-ABI tour and returns the report lines.
 *
 * Takes the registrations rather than composing them: `Iterable<ManifestEntry>`
 * is the narrowest thing this tour actually needs, and asking for it says out
 * loud that the tour cannot register, cannot build and cannot resolve — it only
 * READS. Hand it `addReportingFixture(<a fresh manifest>)`, or any other
 * manifest whose wiring you want explained.
 *
 * @param services The registrations to report on, in authoring order.
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateTokenAbi(services: Iterable<ManifestEntry>): readonly string[] {
  const lines: string[] = ['=== di token ABI (dialect-independent) ==='];

  // What is in the container, read as data.
  lines.push('a manifest is data — every registration, in authoring order:');
  lines.push(...describeRegistrations(services));

  // Shape questions, answered at the string edge. The last two are the pair
  // worth staring at: ONE hole is enough to make a token a template even with a
  // concrete argument beside it, and `$01` is not a hole at all, so a token
  // spelled that way is a closed generic that no closing will ever match.
  const shapes: readonly Token[] = [
    CONNECTION_TOKEN,
    USER_REPOSITORY_TOKEN,
    REPOSITORY_TEMPLATE,
    closeToken('reports:IPair', USER_TOKEN, '$2'),
    closeToken('reports:IRepository', '$01'),
  ];
  lines.push('classifying a token without parsing it:');
  for (const token of shapes) {
    lines.push(`  ${classify(token)}`);
  }

  // The parsed view.
  lines.push('the parsed view — TokenNode is transient, the string is the identity:');
  for (const token of [USER_REPOSITORY_TOKEN, REPOSITORY_TEMPLATE, 'reports:IReportService#eu', 'not<a token']) {
    lines.push(`  ${describeTree(token)}`);
  }

  // Walking.
  const coupling = new PackageCollector().collect(TokenNode.parse(USER_REPOSITORY_TOKEN));
  lines.push(`what one token couples us to (a TokenWalker): ${coupling.join(', ')}`);

  // Rewriting.
  const renamer = new PackageRenamer('reports', 'analytics');
  lines.push('renaming a package across a whole token (a TokenRewriter):');
  lines.push(`  ${USER_REPOSITORY_TOKEN} -> ${renamer.rename(USER_REPOSITORY_TOKEN)}`);
  lines.push(`  a prefix that must NOT match: reports:UserGroup -> ${renamer.rename('reports:UserGroup')}`);

  // Matching and ranking.
  lines.push('which template serves which closing (a Matcher):');
  lines.push(`  ${explainMatch(REPOSITORY_TEMPLATE, USER_REPOSITORY_TOKEN)}`);
  lines.push(
    `  ${explainMatch(closeToken('reports:IPair', '$1', '$1'), closeToken('reports:IPair', USER_TOKEN, AUDIT_TOKEN))}`,
  );
  // Three templates that share ONE base, so a container holding all three has to
  // choose between them per closing. Two score 2 for different reasons — one
  // pins an argument concretely, the other pins two arguments to each other —
  // and the fully-open one scores 1 and is tried last.
  lines.push('ranking overlapping templates most-specific-first (a Specificity):');
  for (const ranked of rankBySpecificity([
    closeToken('reports:IPair', '$1', '$2'),
    closeToken('reports:IPair', '$1', '$1'),
    closeToken('reports:IPair', USER_TOKEN, '$2'),
  ])) {
    lines.push(`  ${ranked}`);
  }

  // Slots.
  const reportSlots: readonly DepSlot[] = [
    CONNECTION_TOKEN,
    { value: 'eu-west' },
    { type: USER_REPOSITORY_TOKEN },
    union(CACHE_TOKEN, MEMORY_CACHE_TOKEN),
    typeArg(1),
  ];
  lines.push('the five slot kinds, told apart by the published guards:');
  for (const slot of reportSlots) {
    lines.push(`  ${describeSlot(slot)}`);
  }
  lines.push(`every slot survives parseSlot -> serialiseSlot: ${reportSlots.every(slotRoundTrips)}`);
  // The same five slots as TREE nodes, plus the intrinsic provider — the six node
  // kinds the whole module is written against.
  lines.push('the six node kinds a tree can hold:');
  for (const slot of [...reportSlots, RESOLVER_TOKEN]) {
    lines.push(`  ${describeNode(parseSlot(slot))}`);
  }
  const resolvable = reportSlots.filter(isResolvableSlot).length;
  lines.push(`${resolvable} of ${reportSlots.length} are RESOLVED as tokens; the rest supply their own value`);

  // Closing a template.
  lines.push('and what the engine does with all of it — closing a template:');
  lines.push(...closeAgainst([[typeArg(1), CONNECTION_TOKEN]], REPOSITORY_TEMPLATE, USER_REPOSITORY_TOKEN));

  return lines;
}
