// getChildrenImplementation -- the INTERNAL child-enumeration helper, reached
// white-box through the private/* subpath. It is intra-package surface,
// deliberately NOT re-exported from the barrel.

import * as configBarrel from '@rhombus-std/config';
import { getChildrenImplementation } from '@rhombus-std/config/private/internal-children';
import { describe, expect, test } from 'bun:test';
import { rootOf } from './support';

describe('getChildrenImplementation', () => {
  test("undefined path enumerates the root's immediate children", () => {
    const root = rootOf({ 'Server:Host': 'localhost', 'Server:Port': '8080', Mode: 'dev' });

    const keys = getChildrenImplementation(root, undefined).map((section) => section.key)
      .sort();

    expect(keys).toEqual(['Mode', 'Server']);
  });

  test("a path enumerates that section's children with full combined paths", () => {
    const root = rootOf({ 'Server:Host': 'localhost', 'Server:Port': '8080' });

    const children = getChildrenImplementation(root, 'Server');

    expect(children.map((section) => section.path).sort()).toEqual(['Server:Host', 'Server:Port']);
    expect(children.map((section) => section.key).sort()).toEqual(['Host', 'Port']);
  });

  test('dedups keys ordinal-ignore-case across providers -- one section per case-folded key', () => {
    const root = new configBarrel.ConfigBuilder().addInMemoryCollection({ 'Server:Host': 'a' }).addInMemoryCollection({
      'SERVER:Port': '1',
    }).build() as unknown as configBarrel.IConfigRoot;

    const keys = getChildrenImplementation(root, undefined).map((section) => section.key);

    // Exactly one section survives for the two case-variant spellings; which
    // spelling wins is the fold order after the last provider's sort, not part
    // of the contract.
    expect(keys.map((key) => key.toLowerCase())).toEqual(['server']);
  });

  test('is not re-exported from the package barrel', () => {
    expect('getChildrenImplementation' in configBarrel).toBe(false);
  });
});
