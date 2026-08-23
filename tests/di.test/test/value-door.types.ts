import { DefaultManifest, LifetimeModel } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

const T = Type.from('probe:T');

function blank() {
  return DefaultManifest.empty<unknown>(LifetimeModel.noop);
}

blank().add(T, { a: 1 });
blank().add(T, 'text');
blank().add(T, [1, 2]);
blank().add(T, new Map());
blank().addValue(T, () => 1);
blank().tryAdd(T, { a: 1 });
blank().tryAddValue(T, () => 1);
blank().replace(T, 'text');
blank().replaceValue(T, () => 1);
// @ts-expect-error a callable cannot come in the value door
blank().add(T, () => 1);
// @ts-expect-error a class cannot come in the value door
blank().add(T, class {});
// @ts-expect-error a callable cannot come in the value door
blank().tryAdd(T, () => 1);
// @ts-expect-error a callable cannot come in the value door
blank().replace(T, class {});

class Impl {}

blank().add({ serviceType: T, ctor: Impl, ctorType: Type.ctor(T, [[]]) });
// @ts-expect-error an abstract constructor node cannot sit in a descriptor at all
blank().add({ serviceType: T, ctor: Impl, ctorType: Type.abstractCtor(T, [[]]) });
// @ts-expect-error the spec door mints the same abstract kind
blank().add({ serviceType: T, ctor: Impl, ctorType: Type.abstractCtor({ instance: T, signatures: [[]] }) });
