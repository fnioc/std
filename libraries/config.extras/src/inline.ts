// Sugar body for `withType<T>()`; substituted at call sites during the
// build, not executed at runtime. Not re-exported by ./index.ts — kept out
// of the bundle deliberately.

import { registerInlineBodies } from '@rhombus-std/primitives.extras';
import { schemaof } from './schemaof.js';

/** Receiver shape the sugar body is compiled against. */
interface IWithSchemaTarget {
  withSchema(schema: unknown): unknown;
}

/** `withType<T>()` sugar: `this.withSchema(schemaof<T>())`. */
export const ConfigBuilderInline = { withType<T>(this: IWithSchemaTarget): unknown {
  return this.withSchema(schemaof<T>());
} };
registerInlineBodies(ConfigBuilderInline);
