// Importing `@rhombus-std/di.extras` for its side effect (`./augment.ts`) brings
// the type-argument overloads -- `addClass<I>(C)`, `.as<"x">()`, `resolve<T>()`
// and the rest -- into scope on `@rhombus-std/di.core`'s public interfaces.
import './augment.js';

/** Re-exported so a consumer doesn't need a separate import from `@rhombus-std/di.core`. */
export type { $, Hole, Inject, Typeof } from './augment.js';
