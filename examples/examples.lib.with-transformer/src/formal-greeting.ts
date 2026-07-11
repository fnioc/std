import type { IGreeting } from '@rhombus-std/examples.contracts';

/** The formal greeting this library contributes to the shared IGreeting collection. */
export class FormalGreeting implements IGreeting {
  public readonly source = 'lib.with-transformer';

  public greet(name: string): string {
    return `Good day, ${name}.`;
  }
}
