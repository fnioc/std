// Type-level checks for the value-driven `getService` overloads: `T` flows from the constructor
// or function's own return type, with no type argument written at the call site. Never executed
// -- `testit` is ambient, so calling it at runtime would throw. The file earns its keep through
// `lint` (`tsc --noEmit`), which is why the name keeps it out of bun's test glob.
//
// The `@ts-expect-error` lines are the load-bearing half. A broken inference tends to collapse
// to `any`, and `any` satisfies every constraint -- so the positive cases keep passing and only
// an expected-error that stops erroring reveals it.

import type { ServiceProvider } from '@rhombus-std/di';
import type { IServiceProvider } from '@rhombus-std/primitives';

declare const provider: ServiceProvider;

/** Asserts `U` is assignable to `T` — as a value beside a real one. */
declare function testit<T, U extends T>(expected: T, actual: U): void;

class Widget {
  constructor(public readonly sp: IServiceProvider) {}
}
function makeGadget(sp: IServiceProvider): { readonly sp: IServiceProvider; } {
  return { sp };
}

declare const widget: Widget;
declare const gadget: { readonly sp: IServiceProvider; };
declare const wrongShape: { readonly nope: true; };

// A class constructor infers `T` as the instance type.
testit(widget, provider.getService(Widget));
// @ts-expect-error
testit(wrongShape, provider.getService(Widget));

// A function infers `T` as its return type.
testit(gadget, provider.getService(makeGadget));
// @ts-expect-error
testit(wrongShape, provider.getService(makeGadget));

// The original `Type`/token overload is untouched by the new ones.
declare const token: string;
provider.getService(token);

// Neither overload accepts a value that is not a constructor, function, `Type`, or token string.
// @ts-expect-error
provider.getService(42);
// @ts-expect-error
provider.getService(null);
