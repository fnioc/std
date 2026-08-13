// The Types the manual dialect hand-writes, spelled EXACTLY as
// `@rhombus-std/di.extras` derives them for the package-public
// `@rhombus-std/examples.contracts` types (`Type.imported(exportedName, // importSpecifier)`). Writing the derived form by hand is what lets this
// library's registrations land under the same Types the with-transformer
// library and apps resolve — the interop matrix's agreement, kept local so the
// type-only contracts package stays runtime-free.
//
// `Type` nodes are INTERNED: this file's `Type.imported('IGreeting', // '@rhombus-std/examples.contracts')` and the with-transformer library's
// `typefor<IGreeting>()` return the identical object, so the two dialects meet
// on ONE `Type` rather than on a string the reader has to trust matches.

import { Type } from '@rhombus-std/di.core';

/** The shared collection element both libraries register at. */
export const GREETING_TYPE: Type = Type.imported('IGreeting', '@rhombus-std/examples.contracts');

/** The optional service this library alone registers. */
export const HEALTH_CHECK_TYPE: Type = Type.imported('IHealthCheck', '@rhombus-std/examples.contracts');
