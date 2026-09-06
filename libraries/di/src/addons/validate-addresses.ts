import { type Addon, type AddonInstallation, addressRules, ControlRequest, type ControlService, type IAddressDiagnostics, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type, type TypeDiagnostic, type TypeRule, TypeValidationError } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { Registry } from '../internal/Registry.js';

/** The resolvable report the addon appends to: every diagnostic it saw, in the order it saw them. */
class AddressDiagnostics implements IAddressDiagnostics {
  readonly #diagnostics: TypeDiagnostic[] = [];

  get diagnostics(): readonly TypeDiagnostic[] {
    return this.#diagnostics;
  }

  /**
   * Reads `address` by `rules`, records every objection, and returns the leaves that stop — an
   * error always, a warning when `warningsAsErrors`.
   */
  read(address: Type, rules: Iterable<TypeRule>, warningsAsErrors: boolean): TypeValidationError[] {
    const diagnostics = Type.getDiagnostics(address, rules);
    this.#diagnostics.push(...diagnostics);
    return diagnostics.filter(diagnostic => Type.stopsValidation(diagnostic, warningsAsErrors)).map(diagnostic => new TypeValidationError(diagnostic));
  }
}

/** The rules `suppress` leaves standing. */
function selectRules(rules: Iterable<TypeRule>, suppressed: ReadonlySet<string>): TypeRule[] {
  return Iterator.from(rules).filter(rule => !suppressed.has(rule.id)).toArray();
}

/**
 * Installs a middleware reading every registration address at build and every ask's address at the
 * door, reporting each one spelled in a way that is legal but more likely a slip than an intention.
 * Every objection it saw, stopping or not, is filed into a {@link IAddressDiagnostics} the built
 * provider resolves.
 *
 * @remarks
 * The two sides read different rules — a shape that only a registration can be wrong about, like
 * an address that is a bare literal, is not something an ask can be wrong about — so
 * {@link addressRules} carries one list per side and this addon takes either as an override.
 * Every rule reports a warning, so nothing is refused until `warningsAsErrors` says warnings stop.
 *
 * @throws AggregateError - at build, carrying one {@link TypeValidationError} per stopping
 * objection across every registration; at an ask, per stopping objection to that ask's address.
 *
 * @example
 * ```ts
 * const provider = Builder
 *   .useAddon(standardLifetime())
 *   .useAddon(validateAddresses({ warningsAsErrors: true, suppress: ['DI1013'] }))
 *   .withServices(manifest => manifest.add(typefor<IRepo>(), SqlRepo, 'singleton'))
 *   .build();
 *
 * const seen = provider.resolve(typefor<IAddressDiagnostics>()).diagnostics;
 * ```
 */
export function validateAddresses<Lifetime>(options: {
  /** What every registration address is read by, in place of `addressRules.registration`. */
  readonly registration?: Iterable<TypeRule>;
  /** What every ask's address is read by, in place of `addressRules.ask`. */
  readonly ask?: Iterable<TypeRule>;
  /** Whether a warning stops the build or the ask, as an error would. */
  readonly warningsAsErrors?: boolean;
  /** Rule ids to drop from both lists. */
  readonly suppress?: Iterable<string>;
} = {}): Addon<Lifetime> {
  const suppressed = new Set(options.suppress);
  const registrationRules = selectRules(options.registration ?? addressRules.registration, suppressed);
  const askRules = selectRules(options.ask ?? addressRules.ask, suppressed);
  const warningsAsErrors = !!options.warningsAsErrors;

  return {
    create(): AddonInstallation<Lifetime> {
      const report = new AddressDiagnostics();
      return {
        registrations: [Registration.value(typefor<IAddressDiagnostics>(), report)],
        middleware: next => {
          const address = typefor<ControlService>();
          const control = next(new ControlRequest(address)) as ControlService;
          if (typeof control?.stageHooks !== 'function') {
            throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
          }
          const errors = Iterator.from(new Registry(control.registry).registrations)
            .flatMap(registration => report.read(registration.address, registrationRules, warningsAsErrors))
            .toArray();
          if (errors.length) {
            throw new AggregateError(errors, `the manifest is addressed by types that fail validation (${errors.length})`);
          }
          return request => {
            const stopping = report.read(request.address, askRules, warningsAsErrors);
            if (stopping.length) {
              throw new AggregateError(stopping, `${Type.stringify(request.address)} fails validation (${stopping.length})`);
            }
            return next(request);
          };
        },
      };
    },
  };
}
