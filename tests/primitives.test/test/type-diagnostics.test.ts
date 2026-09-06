// The rule-agnostic half of validation: one walk offering every node to every rule, and the
// raise that turns what stopped into errors.

import { Type, type TypeRule, TypeValidationError } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const STRING = Type.global('string');
const NUMBER = Type.global('number');

/** Objects to every node, so the diagnostics trace the walk itself. */
function ruleReportingEveryNode(id: string, level: 'warning' | 'error' = 'warning'): TypeRule {
  return { id, level, check: () => 'reported' };
}

/** Objects to the one node it is given. */
function ruleReportingOneNode(id: string, node: Type, level: 'warning' | 'error' = 'warning'): TypeRule {
  return { id, level, check: candidate => candidate === node ? 'reported' : undefined };
}

describe('Type.getDiagnostics', () => {
  test('offers every node of the tree, in pre-order', () => {
    const address = Type.array(Type.optional(STRING));

    const walked = Type.getDiagnostics(address, [ruleReportingEveryNode('R1')]).map(diagnostic => Type.stringify(diagnostic.type));

    expect(walked).toEqual(['Array<string | undefined>', 'string | undefined', 'string', 'undefined']);
  });

  test('offers a node standing in several positions exactly once', () => {
    const address = Type.func(STRING, [[STRING, NUMBER]]);

    const walked = Type.getDiagnostics(address, [ruleReportingEveryNode('R1')]).map(diagnostic => Type.stringify(diagnostic.type));

    expect(walked.filter(spelling => spelling === 'string')).toHaveLength(1);
  });

  test('runs the rules in the order given, at each node', () => {
    const address = Type.optional(STRING);

    const reported = Type.getDiagnostics(address, [ruleReportingEveryNode('R1'), ruleReportingEveryNode('R2')]).map(diagnostic => diagnostic.id);

    expect(reported).toEqual(['R1', 'R2', 'R1', 'R2', 'R1', 'R2']);
  });

  test('reports nothing for a rule that answers undefined everywhere', () => {
    const address = Type.array(STRING);

    expect(Type.getDiagnostics(address, [{ id: 'R1', level: 'error', check: () => undefined }])).toEqual([]);
  });

  test('carries the rule id, its level, the offending node and the message', () => {
    const address = Type.array(STRING);

    expect(Type.getDiagnostics(address, [ruleReportingOneNode('R1', STRING, 'error')])).toEqual([
      { id: 'R1', level: 'error', type: STRING, message: 'reported' },
    ]);
  });
});

describe('Type.validate', () => {
  test('raises an aggregate of one error per stopping diagnostic', () => {
    const address = Type.array(STRING);

    try {
      Type.validate(address, [ruleReportingEveryNode('R1', 'error')]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).message).toBe('Array<string> fails validation (2)');
      expect((error as AggregateError).errors).toHaveLength(2);
      expect((error as AggregateError).errors.every(leaf => leaf instanceof TypeValidationError)).toBeTrue();
    }
  });

  test('passes a warning by, so nothing is raised for it', () => {
    expect(() => Type.validate(Type.array(STRING), [ruleReportingEveryNode('R1')])).not.toThrow();
  });

  test('stops on a warning when warnings are read as errors', () => {
    expect(() => Type.validate(Type.array(STRING), [ruleReportingEveryNode('R1')], true)).toThrow(AggregateError);
  });

  test('raises only what stopped, leaving a warning out of the aggregate', () => {
    const address = Type.array(STRING);

    try {
      Type.validate(address, [ruleReportingOneNode('R1', STRING, 'error'), ruleReportingOneNode('R2', address)]);
      expect.unreachable();
    } catch (error) {
      expect((error as AggregateError).errors.map(leaf => (leaf as TypeValidationError).id)).toEqual(['R1']);
    }
  });

  test('spells each leaf id first, then why, then the node', () => {
    try {
      Type.validate(Type.array(STRING), [ruleReportingOneNode('R1', STRING, 'error')]);
      expect.unreachable();
    } catch (error) {
      const [leaf] = (error as AggregateError).errors as TypeValidationError[];

      expect(leaf?.message).toBe('R1: reported — string');
      expect(leaf?.id).toBe('R1');
      expect(leaf?.level).toBe('error');
      expect(leaf?.type).toBe(STRING);
      expect(leaf?.name).toBe('TypeValidationError');
    }
  });
});
