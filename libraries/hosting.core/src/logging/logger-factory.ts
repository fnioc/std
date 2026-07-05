import type { ILogger } from "./logger";

/** See the note in `logger.ts` -- stubbed locally pending `@rhombus-std/logging`. */
export interface ILoggerFactory extends Disposable {
  createLogger(categoryName: string): ILogger;
}
