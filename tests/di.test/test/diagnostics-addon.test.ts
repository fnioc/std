// Behaviour tests for the resolve-timing probe: it reads the clock either side of its own place in
// the request chain and either side of each hook, and reports nothing beyond those readings.
//
// Every container here is given a counting clock rather than a real one, so nesting is a fact about
// the counts rather than a race the assertions have to tolerate. Two probes are composed by hand in
// the placement test, since the builder cannot put anything outside the lifetime model.

import { di, type DiagnosticReading, diagnosticsAddon, noopLifetimeAddon, standardLifetimeAddon } from '@rhombus-std/di';
import { Diagnostics, type DiagnosticsSegment, Manifest, type Middleware, Registration } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { ServiceProvider } from '@rhombus-std/di/private/ServiceProvider';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const LEAF = Type.imported('Leaf', 'app');
const HOLDER = Type.imported('Holder', 'app');
const READER = Type.imported('Reader', 'app');

class Leaf {}

class Holder {
  constructor(readonly leaf: Leaf) {}
}

/** A clock that advances one tick per reading, so a bracket's width is how many readings it enclosed. */
function countingClock(): () => number {
  let tick = 0;
  return () => tick++;
}

function phasesOf(readings: readonly DiagnosticReading[], phase: DiagnosticReading['phase']): DiagnosticReading[] {
  return readings.filter(reading => reading.phase === phase);
}

function buildProvider(probe = diagnosticsAddon({ name: 'probe', now: countingClock() })) {
  const provider = di
    .usingLifetimeModel(standardLifetimeAddon())
    .useAddon(probe)
    .configureServices(manifest =>
      manifest
        .add(LEAF, Leaf, Type.ctor(LEAF, [[]]), 'transient')
        .add(HOLDER, Holder, Type.ctor(HOLDER, [[LEAF]]), 'transient')
    )
    .build();
  // Building resolves through the chain too, so only what a test's own asks produce beyond this
  // baseline belongs to it.
  return { probe, provider, baseline: probe.readings.length };
}

describe('diagnostics addon', () => {
  test('reads the clock either side of its own place in the request chain', () => {
    const { probe, provider, baseline } = buildProvider();

    provider.resolve(HOLDER);

    const own = phasesOf(probe.readings.slice(baseline), 'resolve');
    expect(own.map(reading => reading.edge)).toEqual(['pre', 'post']);
    expect(own[0]!.at).toBeLessThan(own[1]!.at);
  });

  test('reads the clock either side of each of the four hooks', () => {
    const { probe, provider } = buildProvider();

    provider.resolve(HOLDER);

    for (const phase of ['beginResolve', 'beforeConstruct', 'canonicalize', 'afterConstruct'] as const) {
      const edges = phasesOf(probe.readings, phase).map(reading => reading.edge);
      expect(edges.length).toBeGreaterThan(0);
      expect(edges.filter(edge => edge === 'pre').length).toBe(edges.filter(edge => edge === 'post').length);
    }
  });

  test('reports readings alone, drawing no conclusion about what they span', () => {
    const { probe, provider } = buildProvider();

    provider.resolve(HOLDER);

    for (const reading of probe.readings) {
      expect(Object.keys(reading).toSorted()).toEqual(['address', 'at', 'edge', 'node', 'phase']);
    }
  });

  test('carries the construction node, so a pre pairs with its own post', () => {
    const { probe, provider } = buildProvider();

    provider.resolve(HOLDER);

    const constructions = probe.readings.filter(reading => reading.phase === 'beforeConstruct');
    const nodes = new Set(constructions.map(reading => reading.node));
    expect(nodes.size).toBe(2);
    for (const node of nodes) {
      const pair = constructions.filter(reading => reading.node === node);
      expect(pair.map(reading => reading.edge)).toEqual(['pre', 'post']);
    }
  });

  test("a dependency's construction brackets inside the bracket of the node that needed it", () => {
    const { probe, provider } = buildProvider();

    provider.resolve(HOLDER);

    const before = phasesOf(probe.readings, 'beforeConstruct');
    const holderPre = before.find(r => r.address === HOLDER && r.edge === 'pre')!;
    const leafPre = before.find(r => r.address === LEAF && r.edge === 'pre')!;
    const leafPost = before.find(r => r.address === LEAF && r.edge === 'post')!;
    expect(holderPre.at).toBeLessThan(leafPre.at);
    expect(leafPre.at).toBeLessThan(leafPost.at);
  });

  test('accumulates across more than one ask, since a probe records for its own whole life', () => {
    const { probe, provider } = buildProvider();

    provider.resolve(LEAF);
    const afterFirst = probe.readings.length;
    provider.resolve(LEAF);

    expect(probe.readings.length).toBeGreaterThan(afterFirst);
  });

  test('several probes can be named apart and composed at different depths', () => {
    const clock = countingClock();
    const outside = diagnosticsAddon({ name: 'outside-model', now: clock });
    const againstEngine = diagnosticsAddon({ name: 'against-engine', now: clock });
    const model = standardLifetimeAddon().create();
    const registrations: Registration<unknown>[] = [
      ...(model.registrations ?? []) as Iterable<Registration<unknown>>,
      ...Manifest.empty<'transient'>().add(LEAF, Leaf, Type.ctor(LEAF, [[]]), 'transient') as Iterable<
        Registration<unknown>
      >,
    ];
    const engine = new Engine(registrations);

    // `outside-model` is the placement the builder cannot produce.
    const chain: Middleware[] = [
      outside.create().middleware!,
      model.middleware!,
      againstEngine.create().middleware!,
    ];
    const head = chain.reduceRight<(request: Type) => unknown>(
      (next, middleware) => middleware(next),
      address => engine.getService(address),
    );
    const provider = new ServiceProvider(head);
    // Composing the chain plants each probe's hooks, which itself asks a control address through
    // it — only what follows belongs to the ask under test.
    const outsideBaseline = outside.readings.length;
    const engineBaseline = againstEngine.readings.length;

    provider.resolve(LEAF);

    const outsideOwn = phasesOf(outside.readings.slice(outsideBaseline), 'resolve');
    const engineOwn = phasesOf(againstEngine.readings.slice(engineBaseline), 'resolve');

    // The outer probe brackets the inner one, and the lifetime model sits in the gap between them.
    expect(outsideOwn[0]!.at).toBeLessThan(engineOwn[0]!.at);
    expect(engineOwn[1]!.at).toBeLessThan(outsideOwn[1]!.at);
  });

  test('reports nothing of its own until something resolves', () => {
    const { probe, baseline } = buildProvider();

    expect(probe.readings.slice(baseline)).toHaveLength(0);
  });
});

describe('capacity', () => {
  test('stops recording once full and counts what it drops instead of growing', () => {
    const probe = diagnosticsAddon({ name: 'capped', now: countingClock(), capacity: 8 });
    const { provider } = buildProvider(probe);

    provider.resolve(HOLDER);

    expect(probe.readings).toHaveLength(8);
    expect(probe.dropped).toBeGreaterThan(0);
  });

  test('reports no dropped readings while under capacity', () => {
    const { probe, provider } = buildProvider();

    provider.resolve(HOLDER);

    expect(probe.dropped).toBe(0);
  });

  test('a fresh probe starts with nothing dropped', () => {
    const probe = diagnosticsAddon({ name: 'fresh', now: countingClock() });

    expect(probe.dropped).toBe(0);
  });
});

describe('the Diagnostics service', () => {
  class Reader {
    constructor(readonly diagnostics: Diagnostics) {}
  }

  test('answers one segment per installed probe, named for it', () => {
    const provider = di
      .usingLifetimeModel(noopLifetimeAddon())
      .useAddon(diagnosticsAddon({ name: 'alpha', now: countingClock() }))
      .useAddon(diagnosticsAddon({ name: 'beta', now: countingClock() }))
      .configureServices(manifest => manifest.add(READER, Reader, Type.ctor(READER, [[Diagnostics.address]])))
      .build();

    const reader = provider.resolve(READER);

    expect(reader.diagnostics.segments.map((segment: DiagnosticsSegment) => segment.name).toSorted()).toEqual(['alpha', 'beta']);
  });

  test('a single probe still answers as a one-segment collection', () => {
    const provider = di
      .usingLifetimeModel(noopLifetimeAddon())
      .useAddon(diagnosticsAddon({ name: 'solo', now: countingClock() }))
      .configureServices(manifest => manifest.add(READER, Reader, Type.ctor(READER, [[Diagnostics.address]])))
      .build();

    const reader = provider.resolve(READER);

    expect(reader.diagnostics.segments).toHaveLength(1);
    expect(reader.diagnostics.segments[0]!.name).toBe('solo');
  });

  test("a segment's readings match what its own probe answers directly", () => {
    const probe = diagnosticsAddon({ name: 'solo', now: countingClock() });
    const provider = di
      .usingLifetimeModel(noopLifetimeAddon())
      .useAddon(probe)
      .configureServices(manifest => manifest.add(READER, Reader, Type.ctor(READER, [[Diagnostics.address]])))
      .build();

    const reader = provider.resolve(READER);

    expect(reader.diagnostics.segments[0]!.readings.length).toBeGreaterThan(0);
    expect(reader.diagnostics.segments[0]!.readings).toEqual(probe.readings);
  });

  test('composes under a lifetime model whose vocabulary requires a lifetime, given one', () => {
    const provider = di
      .usingLifetimeModel(standardLifetimeAddon())
      .useAddon(diagnosticsAddon({ name: 'probe', now: countingClock(), transientLifetime: standardLifetimeAddon.transient }))
      .configureServices(manifest => manifest.add(READER, Reader, Type.ctor(READER, [[Diagnostics.address]]), 'transient'))
      .build();

    const reader = provider.resolve(READER);

    expect(reader.diagnostics.segments).toHaveLength(1);
  });

  test('resolving it through a manifest carrying only the placeholder registration, hooks never installed, fails loudly', () => {
    const addon = diagnosticsAddon({ name: 'probe', now: countingClock() });
    const registrations = (addon.create().registrations ?? []) as Iterable<Registration<unknown>>;
    const engine = new Engine(registrations);

    expect(() => engine.getService(Diagnostics.address)).toThrow(/diagnostics addon's own hooks/);
  });
});
