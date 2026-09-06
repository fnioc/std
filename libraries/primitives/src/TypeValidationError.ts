import { Type, type TypeDiagnostic } from './Type/index.js';

/** One node a rule objected to — the leaf the aggregate {@link Type.validate} throws carries. */
export class TypeValidationError extends Error {
  /** The rule that objected. */
  public readonly id: string;
  /** How hard that rule pushes back. */
  public readonly level: 'warning' | 'error';
  /** The node it objected to. */
  public readonly type: Type;

  constructor(diagnostic: TypeDiagnostic) {
    super(`${diagnostic.id}: ${diagnostic.message} — ${Type.stringify(diagnostic.type)}`);
    this.name = 'TypeValidationError';
    this.id = diagnostic.id;
    this.level = diagnostic.level;
    this.type = diagnostic.type;
  }
}
