// The rule-agnostic half of validation: every rule read once over the type it is handed, and the
// raise that turns what stopped into errors.

import { Type, type TypeRule, TypeValidationError } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const STRING = Type.global('string');

/** Objects to whatever it is handed, and counts how many times it was asked. */
function ruleReportingWhateverItReads(id: string, level: 'warning' | 'error' = 'warning'): TypeRule & { reads: number; } {
  return {
    id,
    level,
    reads: 0,
    check(this: { reads: number; }): string {
      this.reads += 1;
      return 'reported';
    },
  };
}

/** Objects to the one node it is given. */
function ruleReportingOneNode(id: string, node: Type, level: 'warning' | 'error' = 'warning'): TypeRule {
  return { id, level, check: candidate => candidate === node ? 'reported' : undefined };
}

describe('Type.getDiagnostics', () => {
  test('asks each rule once, about the type it was handed', () => {
    const rule = ruleReportingWhateverItReads('R1');
    const address = Type.array(Type.optional(STRING));

    const reported = Type.getDiagnostics(address, [rule]);

    expect(rule.reads).toBe(1);
    expect(reported.map(diagnostic => diagnostic.type)).toEqual([address]);
  });

  test('leaves a node nested inside the type for the rule to find, rather than offering it', () => {
    const rule = ruleReportingOneNode('R1', STRING);

    expect(Type.getDiagnostics(Type.array(STRING), [rule])).toEqual([]);
  });

  test('runs the rules in the order given', () => {
    const address = Type.optional(STRING);

    const reported = Type.getDiagnostics(address, [ruleReportingWhateverItReads('R1'), ruleReportingWhateverItReads('R2')]).map(diagnostic => diagnostic.id);

    expect(reported).toEqual(['R1', 'R2']);
  });

  test('reports nothing for a rule that answers undefined', () => {
    const address = Type.array(STRING);

    expect(Type.getDiagnostics(address, [{ id: 'R1', level: 'error', check: () => undefined }])).toEqual([]);
  });

  test('carries the rule id, its level, the type read and the message', () => {
    const address = Type.array(STRING);

    expect(Type.getDiagnostics(address, [ruleReportingOneNode('R1', address, 'error')])).toEqual([
      { id: 'R1', level: 'error', type: address, message: 'reported' },
    ]);
  });
});

describe('Type.validate', () => {
  test('raises an aggregate of one error per stopping diagnostic', () => {
    const address = Type.array(STRING);

    try {
      Type.validate(address, [ruleReportingWhateverItReads('R1', 'error'), ruleReportingWhateverItReads('R2', 'error')]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).message).toBe('Array<string> fails validation (2)');
      expect((error as AggregateError).errors).toHaveLength(2);
      expect((error as AggregateError).errors.every(leaf => leaf instanceof TypeValidationError)).toBeTrue();
    }
  });

  test('passes a warning by, so nothing is raised for it', () => {
    expect(() => Type.validate(Type.array(STRING), [ruleReportingWhateverItReads('R1')])).not.toThrow();
  });

  test('stops on a warning when warnings are read as errors', () => {
    expect(() => Type.validate(Type.array(STRING), [ruleReportingWhateverItReads('R1')], true)).toThrow(AggregateError);
  });

  test('raises only what stopped, leaving a warning out of the aggregate', () => {
    const address = Type.array(STRING);

    try {
      Type.validate(address, [ruleReportingWhateverItReads('R1', 'error'), ruleReportingWhateverItReads('R2')]);
      expect.unreachable();
    } catch (error) {
      expect((error as AggregateError).errors.map(leaf => (leaf as TypeValidationError).id)).toEqual(['R1']);
    }
  });

  test('spells each leaf id first, then why, then the type', () => {
    const address = Type.array(STRING);

    try {
      Type.validate(address, [ruleReportingOneNode('R1', address, 'error')]);
      expect.unreachable();
    } catch (error) {
      const [leaf] = (error as AggregateError).errors as TypeValidationError[];

      expect(leaf?.message).toBe('R1: reported — Array<string>');
      expect(leaf?.id).toBe('R1');
      expect(leaf?.level).toBe('error');
      expect(leaf?.type).toBe(address);
      expect(leaf?.name).toBe('TypeValidationError');
    }
  });
});
