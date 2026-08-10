import { IServiceProvider, Type } from '@rhombus-std/di2.core';
import { augment, Token } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

@augment(tokenfor<IServiceProvider>())
class ServiceProvider implements IServiceProvider {
  async provideAsync(token: Token) {
    const type = Type.parse(token);

    const result = this.#realize(type);
    const promisedEntryPromises = result.promises.entries().map(async ([name, promise]) =>
      [name, await promise] as const
    );
    const promised = new Map(await Promise.all(promisedEntryPromises));

    if (type.kind !== 'latebound') {
      return result.resolve({ promised, serviceProvider: this });
    }
    return (...args: any[]) => {
      const adhocEntries = type.args.map((t, i) => [Type.toString(t), args[i]] as const);
      const adhoc = new Map(adhocEntries);
      return result.resolve({ promised, adhoc, serviceProvider: this });
    };
  }

  provide(token: Token) {
    const type = Type.parse(token);
    const result = this.#realize(type);
    if (result.promises?.size) {
      throw 'must use async for promises';
    }
    if (type.kind !== 'latebound') {
      return result.resolve({ serviceProvider: this });
    }
    return (...args: any[]) => {
      const adhocEntries = type.args.map((t, i) => [Type.toString(t), args[i]] as const);
      const adhoc = new Map(adhocEntries);
      return result.resolve({ adhoc, serviceProvider: this });
    };
  }
  #realize(type: Type): RealizeResult {
    /**
     * 1. find the matching entry
     * 1. swap generic args for adhocs
     * 2. walk the type, replacing NamedTypes with actual ctor/factory etc by looking up in the Manifest
     * 3. extract promises and swap from promised (reuse adhoc?)
     */
    const sd: ServiceDescriptor<string> = engine.locate(type);
    type = engine.resolveAll(type);
    const promises: Map<string, Promise<any>> = undefined as any;

    throw 'not implemented';
  }
}

interface RealizeContext {
  adhoc?: Map<string, any>;
  promised?: Map<string, any>;
  serviceProvider: ServiceProvider;
}
interface RealizeResult {
  promises: Map<string, Promise<any>>;
  resolve: (context: RealizeContext) => any;
}
