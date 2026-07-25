import { FactoryTargetError, ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';

// What kinds of registration `resolveFactory` accepts as its TARGET.
//
// The examples used to teach that "the target must be a class registration,
// since the factory builds it with `new`", which is what `FactoryTargetError`'s
// `'not-a-class'` message still says. The engine has never done that: a factory
// invokes the registration's PRODUCER (`Registration.produce`), and all three
// authoring kinds normalise to one — a class to `(...a) => new Ctor(...a)`, a
// factory to itself, a value to `() => value`. Nothing inspects the kind, and
// neither of the two `FactoryTargetError` throw sites can raise anything but
// `'unregistered'`.
//
// So the only failure mode is an UNREGISTERED target, and these pin that: the
// three kinds all work as targets, in both the parameterized and the zero-arg
// form, and a miss throws when the CALLABLE is built rather than when it is
// first called.

const PUNCTUATION = 'kinds:Punctuation';
const GREETING = 'kinds:Greeting';
const RECIPIENT = 'kinds:Recipient';

class Punctuation {
  public readonly mark = '!';
}

class Greeting {
  public constructor(public readonly punctuation: Punctuation, public readonly recipient: string) {}
}

/** A container with `Punctuation` registered and `RECIPIENT` deliberately absent. */
function withPunctuation(): IServiceManifest<'singleton'> {
  return new ServiceManifest<'singleton'>().addValue(PUNCTUATION, new Punctuation());
}

describe('resolveFactory accepts any registration kind as its target', () => {
  test('a CLASS target builds a fresh instance per call, caller args filling the named params', () => {
    const services = withPunctuation().addClass(GREETING, Greeting, [[PUNCTUATION, RECIPIENT]], 'singleton');
    const provider = services.build().createScope('singleton');

    const mint = provider.resolveFactory<(recipient: string) => Greeting>(GREETING, [RECIPIENT]);

    expect(mint('Ada').recipient).toBe('Ada');
    expect(mint('Ada')).not.toBe(mint('Ada'));
  });

  test('a FACTORY target is equally valid — the callable runs the factory, not `new`', () => {
    const services = withPunctuation().addFactory(GREETING,
      (punctuation: Punctuation, recipient: string) => new Greeting(punctuation, recipient), [[PUNCTUATION, RECIPIENT]],
      'singleton');
    const provider = services.build().createScope('singleton');

    const mint = provider.resolveFactory<(recipient: string) => Greeting>(GREETING, [RECIPIENT]);
    const greeting = mint('Grace');

    expect(greeting).toBeInstanceOf(Greeting);
    expect(greeting.recipient).toBe('Grace');
    expect(greeting.punctuation.mark).toBe('!');
  });

  test('a VALUE target is valid too — the zero-arg form hands back the stored instance', () => {
    const provider = withPunctuation().build().createScope('singleton');

    const get = provider.resolveFactory<() => Punctuation>(PUNCTUATION);

    // A value IS its instance, so the thunk is identity-stable: this is the
    // "zero-arg factory honours the target's lifetime" rule, with the lifetime
    // being "there is exactly one of these".
    expect(get()).toBe(get());
  });

  test('the zero-arg form over a scoped CLASS target honours the registered lifetime', () => {
    const services = new ServiceManifest<'singleton'>().addClass(PUNCTUATION, Punctuation, [[]], 'singleton');
    const provider = services.build().createScope('singleton');

    const get = provider.resolveFactory<() => Punctuation>(PUNCTUATION);

    expect(get()).toBe(get());
  });

  test('an UNREGISTERED target is the one and only failure, and it throws at BUILD time', () => {
    const provider = withPunctuation().build().createScope('singleton');

    // Not on first call — on the `resolveFactory` call itself, so a mis-wired
    // factory slot surfaces while the graph is being constructed.
    expect(() => provider.resolveFactory<() => Greeting>(GREETING)).toThrow(FactoryTargetError);

    try {
      provider.resolveFactory<() => Greeting>(GREETING);
      expect.unreachable();
    } catch (error) {
      const failure = error as FactoryTargetError;
      expect(failure.factoryToken).toBe(GREETING);
      expect(failure.reason).toBe('unregistered');
    }
  });
});
