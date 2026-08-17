import type { IServiceProvider } from '@rhombus-std/primitives';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';

declare module '@rhombus-std/primitives' {
  interface IServiceProvider {
    getService<T>(): T | undefined;
    getRequiredService<T>(): T;
    getServices<T>(): Iterable<T>;
    getService<T extends Ctor>(value: T): InstanceType<T>;
    getService<T extends Func>(value: T): ReturnType<T>;
  }
}

registerInlineBodies<IServiceProvider>({
  getService<T>(this: IServiceProvider) {
    return this.getService.apply(this, [typefor<T>(), ...arguments] as any);
  },
  getServices<T>(this: IServiceProvider) {
    return this.getService.apply(this, [typefor<T>(), ...arguments] as any);
  },
  getRequiredService<T>(this: IServiceProvider) {
    return this.getService.apply(this, [typefor<T>(), ...arguments] as any);
  },
});
