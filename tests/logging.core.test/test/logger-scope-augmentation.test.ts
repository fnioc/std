// beginScope — the `LoggerExtensions.BeginScope(messageFormat, …args)` wrapper.
// Its name IS `ILogger`'s own `beginScope` primitive, so — like `log` and
// `LoggerFactoryExtensions.createLogger` — it is standalone-only: a member of
// the `LoggerExtensions` set but never prototype-installed and absent from
// `LoggerExtensionMethods`. Black-box via the public logging.core surface.

import { NullLogger } from "@rhombus-std/logging";
import { FormattedLogValues, type ILogger, LoggerExtensions } from "@rhombus-std/logging.core";
import { describe, expect, test } from "bun:test";

/** A logger that records the state handed to `beginScope` and returns a token. */
function recordingLogger(): { logger: ILogger; scopes: unknown[] } {
  const scopes: unknown[] = [];
  const logger: ILogger = {
    log(): void {},
    isEnabled(): boolean {
      return true;
    },
    beginScope<TState>(state: TState): Disposable {
      scopes.push(state);
      return { [Symbol.dispose]() {} };
    },
  };
  return { logger, scopes };
}

describe("LoggerExtensions.beginScope", () => {
  test("formats the template into a FormattedLogValues state and opens the scope", () => {
    const { logger, scopes } = recordingLogger();

    const scope = LoggerExtensions.beginScope(logger, "Processing request {Id} from {Address}", 42, "10.0.0.1");

    expect(scope).toBeDefined();
    expect(scopes).toHaveLength(1);
    const state = scopes[0];
    expect(state).toBeInstanceOf(FormattedLogValues);
    expect(String(state)).toBe("Processing request 42 from 10.0.0.1");
    expect([...(state as FormattedLogValues)]).toEqual([
      ["Id", 42],
      ["Address", "10.0.0.1"],
      ["{OriginalFormat}", "Processing request {Id} from {Address}"],
    ]);
  });

  test("is standalone-only: a concrete logger's own beginScope survives un-clobbered", () => {
    // Had the wrapper been prototype-installed it would have overwritten
    // NullLogger's own `beginScope`, and this plain call would recurse into the
    // installed thunk (each hop re-wrapping the state) until the stack blew.
    const scope = NullLogger.instance.beginScope({ some: "state" });
    expect(scope).toBeDefined();
    expect(typeof scope[Symbol.dispose]).toBe("function");
  });
});
