// Type-level checks for the value-driven `resolve` overloads: `R` flows from the constructor
// or function value's own return type, with no type argument written at the call site. Never
// executed -- `testit` is ambient, so calling it at runtime would throw. The file earns its keep
// through `lint` (`tsc --noEmit`), which is why the name keeps it out of bun's test glob.
//
// The `@ts-expect-error` lines are the load-bearing half. A broken inference tends to collapse
// to `any`, and `any` satisfies every constraint -- so the positive cases keep passing and only
// an expected-error that stops erroring reveals it.

import { type IServiceProvider } from '@rhombus-std/di.core';
import type { ServiceProvider } from '@rhombus-std/di/private/ServiceProvider';
import { Type } from '@rhombus-std/primitives';

declare const provider: ServiceProvider;
// The overloads are declared directly on IServiceProvider (libraries/di.core), so an
// interface-typed caller sees them too — unlike a member reached only through `extends`.
declare const providerInterface: IServiceProvider;

/** Asserts `U` is assignable to `T` — as a value beside a real one. */
declare function testit<T, U extends T>(expected: T, actual: U): void;

class Widget {
  constructor(readonly bar: unknown) {}
}
function makeGadget(bar: unknown): { readonly bar: unknown; } {
  return { bar };
}

const widgetNode = Type.ctor(Type.imported('Widget', 'app'), [[Type.imported('Bar', 'app')]]);
const gadgetNode = Type.func(Type.imported('Gadget', 'app'), [[Type.imported('Bar', 'app')]]);

declare const widget: Widget;
declare const gadget: { readonly bar: unknown; };
declare const wrongShape: { readonly nope: true; };

// A ConstructorType node paired with a constructor infers `R` as the instance type.
testit(widget, provider.instantiate(widgetNode, Widget));
// @ts-expect-error
testit(wrongShape, provider.instantiate(widgetNode, Widget));

// A FunctionType node paired with a function infers `R` as its return type.
testit(gadget, provider.invoke(gadgetNode, makeGadget));
// @ts-expect-error
testit(wrongShape, provider.invoke(gadgetNode, makeGadget));

// Both overloads reach an IServiceProvider-typed caller, not only the concrete ServiceProvider.
testit(widget, providerInterface.instantiate(widgetNode, Widget));
testit(gadget, providerInterface.invoke(gadgetNode, makeGadget));

// A string is not an address: the boundary converter is the only string door.
declare const spelled: string;
// @ts-expect-error
provider.resolve(spelled);

// A bare constructor with no node still fails: nothing derives its signature without one.
// @ts-expect-error
provider.resolve(Widget);
// A ConstructorType node paired with an incompatible value fails too.
// @ts-expect-error
provider.instantiate(widgetNode, makeGadget);
