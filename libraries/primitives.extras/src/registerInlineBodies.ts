// `registerInlineBodies(set)` -- the inline-body sister of the augmentation
// registry's `registerAugmentations` (`@rhombus-std/primitives`, §38/§79).
//
// An inline sugar body set (`ServiceQueryInline`, `ManifestChainInline`,
// `ConfigBuilderInline`, ...) has a registered role that lives ENTIRELY outside
// TypeScript: the declaring package's `package.json` "rhombus.inline" publish list
// names it, and the Go inline stage side-parses it straight out of `src/inline.ts`
// without ever compiling the file. Nothing in TS imports it, so the code alone
// gives a reader no hint the object is anything but an unused literal -- the
// relationship is discoverable only by opening the manifest.
//
// This call closes that gap exactly as `registerAugmentations` does for an
// augmentation set: a statement beside the declaration that STATES the role in the
// code. What it names is the manifest's publish list, not a runtime bag, so it is a
// deliberate NO-OP -- and it can never run regardless, since `src/inline.ts` is
// kept out of every barrel and never bundled.
//
// TWO reasons, both real, and the SHAPE follows from having both. The first is the
// gap above: a reader of the body learns it has a role without opening the
// manifest. The second is what occasioned the marker -- the repo's mechanical
// dead-code scan counts real references only, and these sets have none, so without
// this call every one of them is a permanent known-false "unused export". That
// matters because the scan is REPORT-ONLY: its whole value is that a finding means
// something.
//
// Either reason ALONE would have produced something cheaper and worse -- a comment
// for the first, a per-file exemption in the scan's config for the second. A marker
// in the source is the one form that pays both at once: it states the role where
// the body is read, AND it is a real reference, so the scan stays honest here with
// no exemption to keep in step.
//
// NOTHING ENFORCES IT. The authoring lint walks only the bodies the manifest lists,
// and the Go extractor deliberately ignores the call (see `knownAuthoringMarkers`),
// so a set added without a marker is not an error -- it simply goes back to being
// invisible and gets reported. Add the marker with the set.
//
// HOMED HERE, not in the runtime `@rhombus-std/primitives` leaf beside
// `registerAugmentations`, for two reasons: it is authoring-time-only, like
// everything else in this package; and this is the one package all three
// body-carrying packages (`di.extras`, `di.extras.options`, `config.extras`)
// already depend on -- `config.extras` publishes no runtime code at all, so a
// dependency edge onto the runtime leaf would be paid for nothing.
//
// MODULE LEVEL ONLY -- beside the set, never wrapping it. The Go side-parser finds
// a set by its top-level `const` declaration and its members by walking that
// declaration (`bodyextract.go`), so a wrapping call would put the members behind a
// call expression; and the body validator (`checkFreeIdentifiers`) rejects any
// identifier inside a body that is not a parameter, type parameter, or known
// primitive -- this name included.

/**
 * One inline sugar body: a single-return-expression function the inline stage
 * substitutes at a matching consumer call site.
 *
 * A call signature rather than a `Func<...>` alias because a body's shape is
 * receiver-first through a `this` PARAMETER (`addClass<T>(this:
 * IInlineRegistrationTarget, ctor: Ctor)`), which `Func` has no slot for. The
 * receiver is deliberately left unconstrained here -- each package's bodies carry
 * their own transformer-side receiver view, and this set says nothing about which.
 */
export interface InlineBody {
  (...args: never[]): unknown;
}

/**
 * An object literal of {@link InlineBody} members, named by an entry's `impl` in
 * the declaring package's `package.json` "rhombus.inline" publish list. The
 * constraint is the same one the side-parser assumes: every member is
 * function-like, since a member with no body has nothing to substitute.
 */
export interface InlineBodySet {
  readonly [member: string]: InlineBody;
}

/**
 * Declares, in code, that `bodies` is an inline sugar body set published in the
 * declaring package's `package.json` "rhombus.inline" list. Call it at module level
 * beside the declaration:
 *
 * @example
 * ```ts
 * export const ManifestChainInline = {
 *   as<Scope extends string>(this: IInlineChainTarget): IServiceManifest {
 *     return this.as(valueof<Scope>());
 *   },
 * };
 * registerInlineBodies(ManifestChainInline);
 * ```
 *
 * A runtime no-op: the registration it names is the manifest entry, and the file
 * these sets live in is never bundled or executed. It does two things and only
 * these two -- it states the registered role where the body is read, and it makes
 * the set a real reference so a mechanical dead-code scan needs no exemption to
 * leave it alone.
 */
export function registerInlineBodies(_bodies: InlineBodySet): void {
  // Intentionally empty -- see the file header.
}
