import { Type } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';

export * from './expressions';

export namespace ServiceDescriptor {
  export * from './factories';
  export * from './op';
}
