// DistributedCacheEntryOptions: setter validation and the
// DistributedCacheEntryExtensions dual export (standalone member and
// prototype-installed method form, docs §28/§38). The freeze guard (the
// reference's internal `Freeze()`) is covered black-box in
// distributed-cache-augmentations.test.ts through the frozen default-options
// singleton -- these tests exercise the public barrel, not the `private/*`
// white-box seam.

import { DistributedCacheEntryExtensions, DistributedCacheEntryOptions } from '@rhombus-std/caching.core';
import { describe, expect, test } from 'bun:test';

describe('DistributedCacheEntryOptions', () => {
  test('defaults to everything unset', () => {
    const options = new DistributedCacheEntryOptions();
    expect(options.absoluteExpiration).toBeUndefined();
    expect(options.absoluteExpirationRelativeToNow).toBeUndefined();
    expect(options.slidingExpiration).toBeUndefined();
  });

  test('stores and clears each expiration knob', () => {
    const options = new DistributedCacheEntryOptions();
    const absolute = new Date('2030-01-01T00:00:00Z');

    options.absoluteExpiration = absolute;
    options.absoluteExpirationRelativeToNow = 5_000;
    options.slidingExpiration = 1_000;
    expect(options.absoluteExpiration).toBe(absolute);
    expect(options.absoluteExpirationRelativeToNow).toBe(5_000);
    expect(options.slidingExpiration).toBe(1_000);

    options.absoluteExpiration = undefined;
    options.absoluteExpirationRelativeToNow = undefined;
    options.slidingExpiration = undefined;
    expect(options.absoluteExpiration).toBeUndefined();
    expect(options.absoluteExpirationRelativeToNow).toBeUndefined();
    expect(options.slidingExpiration).toBeUndefined();
  });

  test('rejects non-positive relative and sliding expirations', () => {
    const options = new DistributedCacheEntryOptions();
    expect(() => {
      options.absoluteExpirationRelativeToNow = 0;
    }).toThrow(RangeError);
    expect(() => {
      options.absoluteExpirationRelativeToNow = -1;
    }).toThrow(RangeError);
    expect(() => {
      options.slidingExpiration = 0;
    }).toThrow(RangeError);
    expect(() => {
      options.slidingExpiration = -1;
    }).toThrow(RangeError);
  });
});

describe('DistributedCacheEntryExtensions — both forms', () => {
  test('method form chains and discriminates relative vs absolute', () => {
    const absolute = new Date('2030-01-01T00:00:00Z');
    const options = new DistributedCacheEntryOptions()
      .setAbsoluteExpiration(absolute)
      .setSlidingExpiration(2_000);
    expect(options.absoluteExpiration).toBe(absolute);
    expect(options.slidingExpiration).toBe(2_000);

    const relative = new DistributedCacheEntryOptions().setAbsoluteExpiration(3_000);
    expect(relative.absoluteExpirationRelativeToNow).toBe(3_000);
    expect(relative.absoluteExpiration).toBeUndefined();
  });

  test('standalone member form matches the method form', () => {
    const viaMember = DistributedCacheEntryExtensions.setSlidingExpiration(
      DistributedCacheEntryExtensions.setAbsoluteExpiration(new DistributedCacheEntryOptions(), 3_000),
      2_000,
    );
    expect(viaMember.absoluteExpirationRelativeToNow).toBe(3_000);
    expect(viaMember.slidingExpiration).toBe(2_000);
  });
});
