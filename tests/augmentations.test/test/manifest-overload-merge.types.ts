// Compile-only proof that the cross-package overload merge on `Manifest` and
// `IServiceProvider` resolves every colliding member: an interface-typed
// receiver sees both the token-taking base form (di.core) and the tokenless
// sugar form (di.extras), never just one shadowing the other. Never executed
// -- `lint` (`tsc --noEmit`) is what catches a regression here, as a compile
// error naming the missing overload.
//
// `@rhombus-std/di.extras.options` is deliberately NOT exercised here: its
// rolled `dist/bundle/index.d.ts` carries no top-level import/export
// statement (the `declare module` block is its only content), which makes
// TypeScript treat the block as a fresh global module declaration rather
// than an augmentation once this file's program also needs di.core's real
// exports -- a separate, pre-existing packaging defect, not an overload-merge
// one. `addOptions`'s base-form overloads are still proven below.

import '@rhombus-std/di.extras';
import '@rhombus-std/options.augmentations';

import { type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { type IServiceProvider, Type } from '@rhombus-std/primitives';

interface IWidget {}
class Widget implements IWidget {}

const WIDGET = Type.imported('Widget', 'test');

declare const manifest: Manifest<'singleton'>;
declare const provider: IServiceProvider;

// add / add<T>
manifest.add(ServiceDescriptor.value(WIDGET, new Widget()));
manifest.add<IWidget>(Widget, Type.ctor(WIDGET), 'singleton');

// addClass / addClass<T>
manifest.addClass(WIDGET, Widget, Type.ctor(WIDGET), 'singleton');
manifest.addClass<IWidget>(Widget, [[]], 'singleton');

// addFactory / addFactory<T>
manifest.addFactory(WIDGET, () => new Widget(), Type.func(WIDGET), 'singleton');
manifest.addFactory<IWidget>(() => new Widget(), [[]], 'singleton');

// addValue / addValue<T>
manifest.addValue(WIDGET, new Widget());
manifest.addValue<IWidget>(new Widget());

// tryAdd / tryAdd<T>
manifest.tryAdd(ServiceDescriptor.value(WIDGET, new Widget()));
manifest.tryAdd<IWidget>(Widget, Type.ctor(WIDGET), 'singleton');

// tryAddClass / tryAddClass<T>
manifest.tryAddClass(WIDGET, Widget, Type.ctor(WIDGET), 'singleton');
manifest.tryAddClass<IWidget>(Widget, [[]], 'singleton');

// tryAddFactory / tryAddFactory<T>
manifest.tryAddFactory(WIDGET, () => new Widget(), Type.func(WIDGET), 'singleton');
manifest.tryAddFactory<IWidget>(() => new Widget(), [[]], 'singleton');

// tryAddValue / tryAddValue<T>
manifest.tryAddValue(WIDGET, new Widget());
manifest.tryAddValue<IWidget>(new Widget());

// replaceClass / replaceClass<T>
manifest.replaceClass(WIDGET, Widget, Type.ctor(WIDGET), 'singleton');
manifest.replaceClass<IWidget>(Widget, [[]], 'singleton');

// replaceFactory / replaceFactory<T>
manifest.replaceFactory(WIDGET, () => new Widget(), Type.func(WIDGET), 'singleton');
manifest.replaceFactory<IWidget>(() => new Widget(), [[]], 'singleton');

// replaceValue / replaceValue<T>
manifest.replaceValue(WIDGET, new Widget());
manifest.replaceValue<IWidget>(new Widget());

// removeAll / removeAll<T>
manifest.removeAll(WIDGET);
manifest.removeAll<IWidget>();

// addOptions, both base-form overloads (the tokenless addOptions<T>() sugar
// lives in di.extras.options -- excluded above, see the file header)
manifest.addOptions(WIDGET);
manifest.addOptions(WIDGET, () => new Widget());

// getRequiredService / getRequiredService<T>
provider.getRequiredService(WIDGET);
provider.getRequiredService<IWidget>();

// getServices / getServices<T>
provider.getServices(WIDGET);
provider.getServices<IWidget>();

// getService (base, primitives) / getService<T> (sugar, di.extras)
provider.getService(WIDGET);
provider.getService<IWidget>();
