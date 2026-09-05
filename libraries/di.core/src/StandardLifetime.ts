/**
 * The standard lifetime model's vocabulary — a clone of Microsoft.Extensions.DependencyInjection's
 * service lifetimes.
 *
 * @remarks
 * Every constructed registration names one; a value registration carries none and is handed
 * back as it stands, exactly as a pre-built instance is under
 * Microsoft.Extensions.DependencyInjection.
 *
 * - `'singleton'` — one instance per container, shared by every scope, disposed with the container.
 * - `'scoped'` — one instance per opened scope, disposed with that scope.
 * - `'transient'` — a fresh instance per ask and per injection site, disposed with whichever scope
 *   the ask ran under.
 */
export type StandardLifetime = 'singleton' | 'scoped' | 'transient';
