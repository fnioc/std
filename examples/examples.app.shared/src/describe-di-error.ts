// The one-line classifier both infrastructure chapters end on.
//
// It lives here rather than in either example library for a boring reason and a
// good one. The boring reason: both apps print it, and twinning a seven-line
// helper into two files whose selling point is that they diff line for line is
// exactly the kind of drift this package exists to prevent. The good one: the
// two failures it classifies are provoked by the APP — one needs a manifest, the
// other a built provider — so this is the arm of the taxonomy a composition root
// meets, and it belongs beside the code that provokes it.

import { DiError } from '@rhombus-std/di';

/**
 * Reports whether a caught value belongs to the di taxonomy.
 *
 * `DiError` is shared by di.core (registration time) and the resolution engine,
 * so ONE `instanceof DiError` covers a consumer's whole container lifecycle: a
 * rejected registration and an unresolvable token are the same family. The root
 * lives in di.core precisely so a library that never touches the engine can
 * still catch what the engine throws.
 *
 * Deliberately does NOT print the message. Messages name tokens, and the two
 * example dialects spell those differently (hand-written against
 * transformer-derived), while the shapes are identical in both — so the two apps
 * can print this and still byte-diff against each other.
 *
 * @param error The caught value.
 */
export function describeDiError(error: unknown): string {
  if (error instanceof DiError) {
    return `caught a DiError (${error.name})`;
  }
  return 'not a DiError — this root would rethrow';
}
