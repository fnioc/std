import { Type } from '@rhombus-std/primitives';
import type { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { CtorDescriptor, FactoryDescriptor, ValueDescriptor } from './ServiceDescriptor';

/**
 * Each factory names how the container reaches the service, which its implementer's type cannot
 * say on its own: a function registered as a VALUE is handed back, never called.
 *
 * @throws TypeError - when `ctorType` is abstract — nothing can `new` it directly.
 */
export function ctor<Lifetime>(serviceType: Type, implementer: Ctor, ctorType: ConstructorType, lifetime?: Lifetime): CtorDescriptor<Lifetime> {
  if (ctorType.abstract) {
    throw new TypeError(`${Type.stringify(ctorType)} is abstract — nothing can \`new\` it directly`);
  }
  return { serviceType, ctor: implementer, ctorType, lifetime };
}

export function factory<Lifetime>(serviceType: Type, implementer: Func, factoryType: FunctionType, lifetime?: Lifetime): FactoryDescriptor<Lifetime> {
  return { serviceType, factory: implementer, factoryType, lifetime };
}

/**
 * @throws TypeError - when `serviceType` still holds a generic hole anywhere but under a callable
 * root: one erased callable honestly is every closing of its holes, while one instance cannot
 * stand for every closing of an open type.
 */
export function value(serviceType: Type, implementer: unknown): ValueDescriptor {
  if (Type.isOpen(serviceType) && !isCallable(serviceType)) {
    throw new TypeError(
      `${Type.stringify(serviceType)} still holds a generic hole — one value cannot stand for every closing; only a callable can`,
    );
  }
  return { serviceType, value: implementer };
}

/** Is the type a callable at its root, its tag stripped? */
function isCallable(serviceType: Type): boolean {
  const root = serviceType.kind === 'tag' ? serviceType.type : serviceType;
  return root.kind === 'ctor' || root.kind === 'func';
}
