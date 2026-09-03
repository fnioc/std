// Type-level check for the tagged lifetime model: `openScope` takes every member of the
// vocabulary but `undefined`, since no scope holds transients, and the addon locks the chain onto
// the vocabulary it was spelled with. Never executed: the file earns its keep through `lint`
// (`tsc --noEmit`), which is why the name keeps it out of bun's test glob, mirroring
// `disposal.types.ts`.

import { Builder, taggedLifetime } from '@rhombus-std/di';
import { type ITaggedServiceScopeFactory, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

type Lifetime = 'session' | 'request' | undefined;

declare const factory: ITaggedServiceScopeFactory<Lifetime>;

factory.openScope('session');
factory.openScope('request');
// @ts-expect-error
factory.openScope(undefined);
// @ts-expect-error
factory.openScope();
// @ts-expect-error
factory.openScope('tenant');

const SERVICE = Type.imported('Service', 'app');
class Service {}

Builder.useAddon(taggedLifetime<Lifetime>()).withServices(m => m.add(Registration.ctor<Lifetime>(SERVICE, Service, Type.ctor(SERVICE, [[]]), 'session')));
Builder.useAddon(taggedLifetime<Lifetime>()).withServices(m => m.add(Registration.ctor(SERVICE, Service, Type.ctor(SERVICE, [[]]))));
// @ts-expect-error
Builder.useAddon(taggedLifetime<Lifetime>()).withServices(m => m.add(Registration.ctor(SERVICE, Service, Type.ctor(SERVICE, [[]]), 'tenant')));
