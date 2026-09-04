// Compile-only proof that the cross-package overload merge on `Manifest` and
// `IServiceProvider` resolves every colliding member: an interface-typed
// receiver sees both the token-taking base form (di.core) and the tokenless
// sugar form (di.extras), never just one shadowing the other. Never executed
// -- `lint` (`tsc --noEmit`) is what catches a regression here, as a compile
// error naming the missing overload.

import '@rhombus-std/di.extras';
import '@rhombus-std/options.augmentations';

import { type IServiceProvider, type Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

interface IWidget {}
class Widget implements IWidget {}

const WIDGET = Type.imported('Widget', 'test');

declare const manifest: Manifest<'singleton'>;
declare const provider: IServiceProvider;

// add: registration / token constructor / token factory / token value / sugar
manifest.add(Registration.value(WIDGET, new Widget()));
manifest.add(WIDGET, Widget, Type.ctor(WIDGET, [[]]), 'singleton');
manifest.add(WIDGET, () => new Widget(), Type.func(WIDGET, [[]]), 'singleton');
manifest.addValue(WIDGET, new Widget());
manifest.add<IWidget>(Widget, 'singleton');
manifest.add<IWidget>(() => new Widget(), 'singleton');

// addValue / addValue<T>
manifest.addValue<IWidget>(new Widget());

// tryAdd: registration / token forms / sugar
manifest.tryAdd(Registration.value(WIDGET, new Widget()));
manifest.tryAdd(WIDGET, Widget, Type.ctor(WIDGET, [[]]), 'singleton');
manifest.tryAdd(WIDGET, () => new Widget(), Type.func(WIDGET, [[]]), 'singleton');
manifest.tryAddValue(WIDGET, new Widget());
manifest.tryAdd<IWidget>(Widget, 'singleton');
manifest.tryAddValue<IWidget>(new Widget());

// replace: registration / token forms / sugar
manifest.replace(Registration.value(WIDGET, new Widget()));
manifest.replace(WIDGET, Widget, Type.ctor(WIDGET, [[]]), 'singleton');
manifest.replace(WIDGET, () => new Widget(), Type.func(WIDGET, [[]]), 'singleton');
manifest.replaceValue(WIDGET, new Widget());
manifest.replace<IWidget>(Widget, 'singleton');
manifest.replaceValue<IWidget>(new Widget());

// describe / describe<T>
manifest.add(manifest.describe(WIDGET).asClass(Widget, Type.ctor(WIDGET, [[]])));
manifest.add(manifest.describe<IWidget>().asValue(new Widget()));

// removeAll / removeAll<T>
manifest.removeAll(WIDGET);
manifest.removeAll<IWidget>();

// addOptions, both base-form overloads (the tokenless addOptions<T>() sugar
// lives in di.extras.options; its face rides that package's program)
manifest.addOptions(WIDGET);
manifest.addOptions(WIDGET, () => new Widget());

// resolve (base, primitives) / resolve<T> (sugar, di.extras)
provider.resolve(WIDGET);
provider.resolve<IWidget>();

// resolveIterable (base, di.core) / resolveIterable<T> (sugar, di.extras)
provider.resolveIterable(WIDGET);
provider.resolveIterable<IWidget>();

// resolve (base, di.core) / resolve<T> (sugar, di.extras)
provider.resolve(WIDGET);
provider.resolve<IWidget>();

// every remaining ask row, the address-taking base form (di.core) beside the
// tokenless sugar form (di.extras), and the `try` twin of each
provider.tryResolve(WIDGET);
provider.tryResolve<IWidget>();
provider.resolveArray(WIDGET);
provider.resolveArray<IWidget>();
provider.tryResolveArray(WIDGET);
provider.tryResolveArray<IWidget>();
provider.tryResolveIterable(WIDGET);
provider.tryResolveIterable<IWidget>();
provider.resolveAsync(WIDGET);
provider.resolveAsync<IWidget>();
provider.tryResolveAsync(WIDGET);
provider.tryResolveAsync<IWidget>();
provider.resolveArrayAsync(WIDGET);
provider.resolveArrayAsync<IWidget>();
provider.tryResolveArrayAsync(WIDGET);
provider.tryResolveArrayAsync<IWidget>();
provider.resolveIterableAsync(WIDGET);
provider.resolveIterableAsync<IWidget>();
provider.tryResolveIterableAsync(WIDGET);
provider.tryResolveIterableAsync<IWidget>();
provider.resolveAsyncIterable(WIDGET);
provider.resolveAsyncIterable<IWidget>();
provider.tryResolveAsyncIterable(WIDGET);
provider.tryResolveAsyncIterable<IWidget>();

// resolveWith / resolveWithAsync: the address-taking form names the callable's
// own type in front, the sugar derives it from the type arguments
provider.resolveWith(Type.func(WIDGET, [[]]));
provider.resolveWith<IWidget, []>();
provider.tryResolveWith(Type.func(WIDGET, [[]]));
provider.tryResolveWith<IWidget, []>();
provider.resolveWithAsync(Type.func(WIDGET, [[]]));
provider.resolveWithAsync<IWidget, []>();
provider.tryResolveWithAsync(Type.func(WIDGET, [[]]));
provider.tryResolveWithAsync<IWidget, []>();

// instantiate / invoke: the type-taking form beside the observed form
provider.instantiate(Type.ctor(WIDGET, [[]]), Widget);
provider.instantiate(Widget);
provider.tryInstantiate(Type.ctor(WIDGET, [[]]), Widget);
provider.tryInstantiate(Widget);
provider.invoke(Type.func(WIDGET, [[]]), () => new Widget());
provider.invoke(() => new Widget());
provider.tryInvoke(Type.func(WIDGET, [[]]), () => new Widget());
provider.tryInvoke(() => new Widget());
