// One case per address rule: the shape it objects to, and the nearest shape it must let stand.

import { addressRules } from '@rhombus-std/di.core';
import { Type, type TypeRule } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const STRING = Type.global('string');

const asyncIterable = (of: Type) => Type.global('AsyncIterable', [of]);
const promise = (of: Type) => Type.global('Promise', [of]);

/** What the rule says about `node`, so a case reads as the objection itself. */
function objectionTo(rule: TypeRule, node: Type): string | undefined {
  return rule.check(node);
}

describe('the shapes each rule objects to', () => {
  test('DI1001 — a key over a keyed type', () => {
    expect(objectionTo(addressRules.byId.DI1001!, Type.tag(Type.tag(CONN, 'inner'), 'outer'))).toContain('keyed twice');
    expect(objectionTo(addressRules.byId.DI1001!, Type.tag(CONN, 'inner'))).toBeUndefined();
  });

  test('DI1002 — a key over an optional', () => {
    expect(objectionTo(addressRules.byId.DI1002!, Type.tag(Type.optional(CONN), 'primary'))).toContain('keyed over an optional');
    expect(objectionTo(addressRules.byId.DI1002!, Type.optional(Type.tag(CONN, 'primary')))).toBeUndefined();
  });

  test('DI1003 — a key over a literal value', () => {
    expect(objectionTo(addressRules.byId.DI1003!, Type.tag(Type.typeLiteral('on'), 'mode'))).toContain('keyed over a literal value');
    expect(objectionTo(addressRules.byId.DI1003!, Type.tag(STRING, 'mode'))).toBeUndefined();
  });

  test('DI1004 — a key that is the empty string', () => {
    expect(objectionTo(addressRules.byId.DI1004!, Type.tag(CONN, ''))).toContain('keyed with the empty string');
    expect(objectionTo(addressRules.byId.DI1004!, Type.tag(CONN, 'primary'))).toBeUndefined();
  });

  test('DI1005 — a promise of a promise', () => {
    expect(objectionTo(addressRules.byId.DI1005!, promise(promise(CONN)))).toContain('a promise of a promise');
    expect(objectionTo(addressRules.byId.DI1005!, promise(CONN))).toBeUndefined();
  });

  test('DI1006 — a promise of an asynchronous sequence', () => {
    expect(objectionTo(addressRules.byId.DI1006!, promise(asyncIterable(CONN)))).toContain('a promise of an asynchronous sequence');
    expect(objectionTo(addressRules.byId.DI1006!, asyncIterable(promise(CONN)))).toBeUndefined();
  });

  test('DI1007 — a promise of a literal value', () => {
    expect(objectionTo(addressRules.byId.DI1007!, promise(Type.typeLiteral(42)))).toContain('a promise of a literal value');
    expect(objectionTo(addressRules.byId.DI1007!, promise(STRING))).toBeUndefined();
  });

  test('DI1008 — an aggregate of an optional', () => {
    expect(objectionTo(addressRules.byId.DI1008!, Type.array(Type.optional(CONN)))).toContain('an aggregate of an optional');
    expect(objectionTo(addressRules.byId.DI1008!, Type.iterable(Type.optional(CONN)))).toContain('an aggregate of an optional');
    expect(objectionTo(addressRules.byId.DI1008!, asyncIterable(Type.optional(CONN)))).toContain('an aggregate of an optional');
    expect(objectionTo(addressRules.byId.DI1008!, Type.optional(Type.array(CONN)))).toBeUndefined();
  });

  test('DI1009 — a keyed member beside the same type unkeyed', () => {
    expect(objectionTo(addressRules.byId.DI1009!, Type.union(CONN, Type.tag(CONN, 'primary')))).toContain('a keyed member beside the same type unkeyed');
    expect(objectionTo(addressRules.byId.DI1009!, Type.union(WIDGET, Type.tag(CONN, 'primary')))).toBeUndefined();
  });

  test('DI1010 — two aggregates in one union', () => {
    expect(objectionTo(addressRules.byId.DI1010!, Type.union(Type.array(CONN), Type.iterable(CONN)))).toContain('two aggregates in one union');
    expect(objectionTo(addressRules.byId.DI1010!, Type.union(Type.array(CONN), WIDGET))).toBeUndefined();
  });

  test('DI1011 — a promise beside the value it settles to', () => {
    expect(objectionTo(addressRules.byId.DI1011!, Type.union(CONN, promise(CONN)))).toContain('a promise beside the value it settles to');
    expect(objectionTo(addressRules.byId.DI1011!, Type.union(WIDGET, promise(CONN)))).toBeUndefined();
  });

  test('DI1012 — an ask for undefined itself', () => {
    expect(objectionTo(addressRules.byId.DI1012!, Type.undefinedLiteral)).toContain('an ask for undefined itself');
    expect(objectionTo(addressRules.byId.DI1012!, Type.optional(CONN))).toBeUndefined();
  });

  test('DI1013 — a registration filed under a union', () => {
    expect(objectionTo(addressRules.byId.DI1013!, Type.union(CONN, WIDGET))).toContain('filed under a union');
    expect(objectionTo(addressRules.byId.DI1013!, CONN)).toBeUndefined();
  });

  test('DI1014 — a registration filed under a literal value', () => {
    expect(objectionTo(addressRules.byId.DI1014!, Type.typeLiteral('on'))).toContain('filed under a literal value');
    expect(objectionTo(addressRules.byId.DI1014!, STRING)).toBeUndefined();
  });
});

describe('addressRules', () => {
  test('reads a registration address by every shared rule plus the two only a registration can trip', () => {
    expect(addressRules.registration.map(rule => rule.id)).toEqual([
      'DI1001',
      'DI1002',
      'DI1003',
      'DI1004',
      'DI1005',
      'DI1006',
      'DI1007',
      'DI1008',
      'DI1009',
      'DI1010',
      'DI1011',
      'DI1013',
      'DI1014',
    ]);
  });

  test('reads an ask address by every shared rule plus the one only an ask can trip', () => {
    expect(addressRules.ask.map(rule => rule.id)).toEqual([
      'DI1001',
      'DI1002',
      'DI1003',
      'DI1004',
      'DI1005',
      'DI1006',
      'DI1007',
      'DI1008',
      'DI1009',
      'DI1010',
      'DI1011',
      'DI1012',
    ]);
  });

  test('answers every rule of both lists under its own id', () => {
    const listed = [...addressRules.registration, ...addressRules.ask];

    expect(Object.entries(addressRules.byId).every(([id, rule]) => rule.id === id)).toBeTrue();
    expect(listed.every(rule => addressRules.byId[rule.id] === rule)).toBeTrue();
    expect(Object.keys(addressRules.byId)).toHaveLength(new Set(listed).size);
  });

  test('reports every rule as a warning', () => {
    expect(Object.values(addressRules.byId).every(rule => rule.level === 'warning')).toBeTrue();
  });
});
