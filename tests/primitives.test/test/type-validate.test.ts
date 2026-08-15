// Behaviour tests for Type.validate -- everything malformed about a type, one message per
// finding. The only finding the visitor currently raises is an unqualified `default` global,
// since that name reaches nothing on its own; the tests below confirm it surfaces from any
// nested position and that every other kind is always well-formed.

import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const bad = Type.global('default');

describe('Type.validate', () => {
  test('a well-formed type has nothing to report', () => {
    expect(Type.validate(A)).toEqual([]);
    expect(Type.validate(Type.tuple(A, A))).toEqual([]);
  });

  test('a global named default is flagged, since default names nothing on its own', () => {
    const messages = Type.validate(bad);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('default');
  });

  test('an imported type named default is not flagged -- it is reached through its package', () => {
    expect(Type.validate(Type.imported('default', 'app'))).toEqual([]);
  });

  test('generics and literals are always well-formed', () => {
    expect(Type.validate(Type.generic('T'))).toEqual([]);
    expect(Type.validate(Type.typeLiteral('anything'))).toEqual([]);
  });

  test('the finding surfaces from any nested position', () => {
    const expected = Type.validate(bad);
    expect(Type.validate(Type.array(bad))).toEqual(expected);
    expect(Type.validate(Type.iterable(bad))).toEqual(expected);
    expect(Type.validate(Type.tuple(A, bad))).toEqual(expected);
    expect(Type.validate(Type.union(A, bad))).toEqual(expected);
    expect(Type.validate(Type.intersection(Type.object({ a: A }), Type.object({ b: bad })))).toEqual(expected);
    expect(Type.validate(Type.object({ x: bad }))).toEqual(expected);
    expect(Type.validate(Type.tag(bad, 'primary'))).toEqual(expected);
    expect(Type.validate(Type.func(bad, [[A]]))).toEqual(expected);
    expect(Type.validate(Type.func(A, [[bad]]))).toEqual(expected);
    expect(Type.validate(Type.ctor(bad, [[A]]))).toEqual(expected);
    expect(Type.validate(Type.ctor(A, [[bad]]))).toEqual(expected);
    expect(Type.validate(Type.global('Box', [bad]))).toEqual(expected);
    expect(Type.validate(Type.imported('Box', 'app', [bad]))).toEqual(expected);
  });

  test('multiple occurrences accumulate one finding each', () => {
    expect(Type.validate(Type.tuple(bad, bad))).toHaveLength(2);
  });
});
