import type { IGreeting } from '@rhombus-std/examples.contracts';

/** The casual greeting this library contributes to the shared IGreeting collection. */
export class CasualGreeting implements IGreeting {
  public readonly source = 'lib.without-transformer';

  public greet(name: string): string {
    return `Hey ${name}`;
  }
}
