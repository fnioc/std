// Compile-only proof that the cross-package overload merge on `Manifest` and
// `IServiceProvider` resolves every colliding member: an interface-typed
// receiver sees both the token-taking base form (di.core) and the tokenless
// sugar form (di.extras), never just one shadowing the other. Never executed
// -- `lint` (`tsc --noEmit`) is what catches a regression here, as a compile
// error naming the missing overload.

import '@rhombus-std/di.extras';
import '@rhombus-std/options.augmentations';

import { type IServiceProvider, type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

interface IWidget {}
class Widget implements IWidget {}

const WIDGET = Type.imported('Widget', 'test');

declare const manifest: Manifest<'singleton'>;
declare const provider: IServiceProvider;

// add: descriptor / token constructor / token factory / token value / sugar
manifest.add(ServiceDescriptor.value(WIDGET, new Widget()));
manifest.add(WIDGET, Widget, Type.ctor(WIDGET, [[]]), 'singleton');
manifest.add(WIDGET, () => new Widget(), Type.func(WIDGET, [[]]), 'singleton');
manifest.addValue(WIDGET, new Widget());
manifest.add<IWidget>(Widget, 'singleton');
manifest.add<IWidget>(() => new Widget(), 'singleton');

// addValue / addValue<T>
manifest.addValue<IWidget>(new Widget());

// tryAdd: descriptor / token forms / sugar
manifest.tryAdd(ServiceDescriptor.value(WIDGET, new Widget()));
manifest.tryAdd(WIDGET, Widget, Type.ctor(WIDGET, [[]]), 'singleton');
manifest.tryAdd(WIDGET, () => new Widget(), Type.func(WIDGET, [[]]), 'singleton');
manifest.tryAddValue(WIDGET, new Widget());
manifest.tryAdd<IWidget>(Widget, 'singleton');
manifest.tryAddValue<IWidget>(new Widget());

// replace: descriptor / token forms / sugar
manifest.replace(ServiceDescriptor.value(WIDGET, new Widget()));
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

// resolveMany (base, di.core) / resolveMany<T> (sugar, di.extras)
provider.resolveMany(WIDGET);
provider.resolveMany<IWidget>();

// resolve (base, di.core) / resolve<T> (sugar, di.extras)
provider.resolve(WIDGET);
provider.resolve<IWidget>();
