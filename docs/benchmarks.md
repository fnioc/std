# DI benchmarks

Two engines, same service graph. "classic" is the string-keyed, tag-scoped engine; "current" is
the `Type`-addressed engine. This document holds two runs that measure different things and are
not comparable with each other in absolute terms: the paired dist run (everything up to
"Scope parity"), and the source-first run of the current tip against classic (the last section).

The paired dist run compares classic against the current engine with a tag-scoped lifetime model
installed — the older engine's scopes are tag-based (its singleton scenario opens a scope named
`'singleton'`), making a tag-scoped model the like-for-like counterpart. Both engines run only
through their built `dist/bundle/index.js` public entry — no source imports, no transformer sugar
(`typefor`, `add<T>()`) anywhere in a timed path. Every scope-bearing scenario opens an equivalent
scope on both sides — same tag, same nesting, same setup-vs-timed-closure placement — so every
ratio in that run compares the same operation on both engines.

## Method

One process loads both engines at once, each via an absolute-path import of its own built dist
bundle, so a paired measurement's two halves run under identical ambient conditions a moment
apart. Per scenario: 1000 pair attempts, each pair timing one short batch on each engine
back-to-back in a randomised order (which engine goes first is a coin flip per pair, so a periodic
interferer cannot bias one side systematically). A pair is rejected if either half's time exceeds
roughly 2x that engine's own running minimum for the scenario — a burst hitting one half of a pair
skews the two halves unequally, and such a pair is unusable rather than merely noisy. The reported
figure is the **median of the ratio (current ÷ classic) over the accepted pairs**, with the
interquartile range; rejected-pair counts are reported alongside, never absorbed silently. Every
batch also respects a 128-iteration floor (so per-operation noise cancels within a sample) capped
at a 1-second maximum batch duration. The run took place on a physical core reserved exclusively
for it, with the desktop environment shut down for the duration.

Best-observed absolute times are reported separately and are explicitly **not** the basis for any
ratio — dividing two absolutes taken under possibly different conditions would throw away the
pairing that makes the ratio trustworthy.

## Why paired measurement, not a timed suite

A suite-grain method runs each engine's full scenario suite as one uninterrupted block per round,
alternating which engine's suite runs first, and takes the minimum across rounds. The comparison
below is itself a finding: it shows how much a suite-length block of contention can distort a
result.

| scenario                     | suite-grain ratio | paired median ratio |                                             suite ÷ paired |
| ---------------------------- | ----------------: | ------------------: | ---------------------------------------------------------: |
| build/manifest-200           |            2.484x |              1.984x |                                                 1.25x over |
| resolve/transient-leaf       |           21.132x |              9.236x |                                                 2.29x over |
| resolve/transient-depth8     |            4.690x |              2.188x |                                                 2.14x over |
| resolve/transient-width10    |            3.566x |              2.396x |                                                 1.49x over |
| resolve/singleton-cached     |            1.788x |              2.143x |                                              0.83x (under) |
| resolve/factory-1dep         |            4.901x |              4.355x |                                                 1.13x over |
| resolve/scoped-cached        |            3.495x |              2.551x |                                                 1.37x over |
| scope/create-resolve-dispose |           45.976x |             18.155x |                                                 2.53x over |
| resolve/enumerable-5         |            0.867x |              0.743x | 1.17x (both agree current is faster; suite understated it) |

The suite-grain method overstates the current engine's slowdown on 7 of 9 scenarios, by 1.1x to
2.5x, worst on `resolve/transient-leaf` and `scope/create-resolve-dispose`. It understates the gap
on `resolve/singleton-cached`. A contamination burst long enough to swallow one engine's whole
suite-run, while missing the other engine's run entirely, produces exactly this pattern — which is
the reason the paired design exists.

## Baseline matrix

ns/op ratios, median of 1000 paired attempts per scenario; IQR and rejected-pair counts alongside.

| scenario                  | median ratio |            IQR | accepted | rejected |
| ------------------------- | -----------: | -------------: | -------: | -------: |
| build/manifest-200        |       1.984x | [1.507, 2.112] |      905 |       95 |
| resolve/transient-leaf    |       9.236x | [8.805, 9.757] |      337 |      663 |
| resolve/transient-depth8  |       2.188x | [1.999, 2.412] |      449 |      551 |
| resolve/transient-width10 |       2.396x | [2.114, 2.702] |      365 |      635 |
| resolve/singleton-cached  |       2.143x | [2.017, 2.296] |      547 |      453 |
| resolve/factory-1dep      |       4.355x | [3.843, 4.536] |      827 |      173 |
| resolve/scoped-cached     |       2.551x | [2.450, 2.656] |      882 |      118 |
| resolve/enumerable-5      |       0.743x | [0.701, 0.793] |      521 |      479 |

`scope/create-resolve-dispose` is deliberately absent from this table — see below.

### Best-observed absolutes (ns/op, minimum accepted batch — not the ratio basis)

| scenario                     |  classic |   current |
| ---------------------------- | -------: | --------: |
| build/manifest-200           |  685,608 | 1,127,643 |
| resolve/transient-leaf       |    363.3 |   3,245.0 |
| resolve/transient-depth8     |  5,184.0 |  12,651.1 |
| resolve/transient-width10    |  7,851.6 |  16,722.5 |
| resolve/singleton-cached     |     79.3 |     161.3 |
| resolve/factory-1dep         |    988.7 |   4,370.4 |
| resolve/scoped-cached        |     62.4 |     149.9 |
| scope/create-resolve-dispose |    517.1 |  10,548.2 |
| resolve/enumerable-5         | 11,735.8 |   8,582.3 |

### `scope/create-resolve-dispose`: side by side, not a ratio

The two scopes measured here have different disposal contracts. The lifetime model installed on
the current engine for this run disposes a scope by cascading: tearing down a scope also tears
down every child scope it opened and everything those children own. The older engine's scope
disposal releases only the instances that scope itself claimed, leaving any child scopes for the
caller to dispose. This scenario's single scope carries
no children on either side, so the contract difference costs nothing extra here, but the two
numbers still describe operations with different guarantees and are reported as absolutes only:
classic 517.1 ns, current 10,548.2 ns.

## Fixed cost vs per-node cost

The absolute gap between the two engines' transient-resolve times decomposes into a fixed
per-ask cost plus a per-constructed-node cost:

```
leaf     (1 node):   3,245.0 -   363.3 =  2,881.7 ns extra
factory  (2 nodes):  4,370.4 -   988.7 =  3,381.7 ns extra
depth8   (8 nodes): 12,651.1 - 5,184.0 =  7,467.1 ns extra
width10 (11 nodes): 16,722.5 - 7,851.6 =  8,870.9 ns extra
```

Fitting a line through the 1-node and 11-node points gives roughly 600 ns per constructed node and
about 2.3 μs fixed per ask, regardless of graph shape. The middle two points (2 and 8 nodes) land
within a few hundred nanoseconds of that line. This is why a one-node resolve shows the largest
ratio (9.2x) and an eight-deep chain shows one of the smallest (2.2x): the fixed cost dominates a
shallow graph and amortises across a deep one. The per-ask fixed cost, not per-node construction
cost, is where most of the gap on shallow graphs sits.

## Wide-IQR scenarios

Two scenarios keep a noticeably wider IQR than the rest even after pairing on an isolated core:
`build/manifest-200` (IQR spans 30.5% of its median) and `scope/create-resolve-dispose` (28.4%),
against 8-25% everywhere else. Both are the two scenarios that perform real allocation and
disposal work on every operation — fresh manifest construction, and scope-open-resolve-dispose —
rather than pure resolution. Allocator or collector variance across runs is a plausible
explanation; it is not a proven one, and no other cause has been ruled out.

## Registry size

No paired registry-size measurement exists yet. Collecting one under a clean, isolated core is
needed before this section can state a finding.

## Scope parity

Every scope-bearing scenario opens an equivalent scope on both engines — same tag, same nesting,
same point relative to the timed operation — confirmed for every scenario in the baseline matrix
before it was run.

## Source-first run: current tip vs classic

The current engine at the tip of its branch, against the same classic engine, both loaded from
source rather than from a built bundle. The current engine's front door here is
`Builder.withServices(...).build()` with no lifetime model installed, so every resolve constructs
fresh; the classic suite is the one from the paired run, resolving its package to the source entry.
Every registration on both sides uses the explicit authoring forms — no transformer sugar in any
timed path. Neither side runs any build-time validation: the current engine's validation addons
are not installed, and the older engine has no counterpart.

### Scenarios

- `build/manifest-200` — compose 200 zero-dependency class registrations into a manifest and build
  a provider from it.
- `resolve/transient-leaf` — resolve one zero-dependency class; a fresh instance each time (1 node).
- `resolve/transient-depth8` — resolve the head of a chain of eight classes, each depending on the
  next (8 nodes).
- `resolve/transient-width10` — resolve a class whose constructor takes ten zero-dependency classes
  (11 nodes).
- `resolve/factory-1dep` — resolve a factory-registered service taking one class dependency
  (2 nodes).
- `resolve/enumerable-5` — resolve every registration under one address, five on both sides.
  **Not like-for-like**: the older engine answers a regex key pattern over five keyed registrations
  sharing one string token and returns an array; the current engine walks five registrations at one
  address and the scenario spreads the resulting iterable into an array.
- `resolve/singleton-cached`, `resolve/scoped-cached`, `scope/create-resolve-dispose` — classic
  only. Each depends on a construction being kept and handed back, or on a scope; how long a
  construction is kept is the lifetime model's own concern, installed as an addon, and none is
  installed here, so the current engine cannot express these three.

### Protocol

The same timing harness, copied verbatim into both trees, measures every scenario: iterations are
calibrated until one batch takes about 50 ms (capped at one million), three warm-up batches run,
then nine trials each preceded by a forced full collection; a round's figure for a scenario is the
per-operation median of its nine trials. Seven rounds alternate classic then current, each round a
fresh bun 1.3.14 process pinned to one core with the runtime transpiler cache disabled and a
three-second pause before each process. The reported figure per scenario is the **minimum across
the seven rounds' medians**; the per-round range is reported alongside so a reader can see how far
the rounds disagree.

The desktop stayed up throughout: the one-minute load average sat between 0.5 and 1.3 before each
process. Within-round trial spread was wide on the allocation-heavy scenarios (the nine trials of
`build/manifest-200` on the current engine spread across a range about as wide as their median), which is why the figure
is a minimum of medians rather than a single round.

### Results (ns/op, minimum of per-round medians)

| scenario                     |   classic |     current | current ÷ classic | classic rounds (min–max) |  current rounds (min–max) |
| ---------------------------- | --------: | ----------: | ----------------: | -----------------------: | ------------------------: |
| build/manifest-200           | 666,283.6 | 2,568,022.1 |            3.854x |    666,283.6 – 720,600.6 | 2,568,022.1 – 3,651,626.4 |
| resolve/transient-leaf       |     250.3 |       216.2 |            0.864x |            250.3 – 256.7 |             216.2 – 239.9 |
| resolve/transient-depth8     |   3,039.2 |     1,019.5 |            0.335x |        3,039.2 – 3,655.2 |         1,019.5 – 1,081.5 |
| resolve/transient-width10    |   3,754.9 |     1,353.6 |            0.360x |        3,754.9 – 4,494.5 |         1,353.6 – 1,480.3 |
| resolve/factory-1dep         |     611.6 |       323.8 |            0.529x |            611.6 – 658.7 |             323.8 – 399.9 |
| resolve/enumerable-5         |  10,714.4 |     1,195.4 | 0.112x (see note) |      10,714.4 – 11,554.0 |         1,195.4 – 1,468.5 |
| resolve/singleton-cached     |      53.1 |         n/a |                 — |              53.1 – 61.5 |                         — |
| resolve/scoped-cached        |      52.0 |         n/a |                 — |              52.0 – 56.3 |                         — |
| scope/create-resolve-dispose |     462.3 |         n/a |                 — |            462.3 – 580.0 |                         — |

The current engine is faster on every resolution it can express. The `resolve/enumerable-5` ratio
is recorded but is not a comparison of the same operation (see the scenario note above).

### The one loss: `build/manifest-200`

Building a provider from 200 registrations costs the current engine 2.57 ms against classic's
0.67 ms. The cost sits in the build step itself: the current engine materialises its registry at
build, freezing every registration as it is filed, on top of composing the manifest's
registrations.

### Fixed cost vs per-node cost

The current engine's transient-resolve times decompose into a fixed per-ask cost plus a
per-constructed-node cost:

```
leaf     (1 node):    216.2 ns
factory  (2 nodes):   323.8 ns
depth8   (8 nodes): 1,019.5 ns
width10 (11 nodes): 1,353.6 ns
```

A line through the 1-node and 11-node points gives about 114 ns per constructed node and about
102 ns fixed per ask. The middle two points land on it: the line predicts 330 ns for 2 nodes
(measured 323.8) and 1,012 ns for 8 nodes (measured 1,019.5). The older engine's one-node ask
costs 250 ns and each further node about 350 ns between its 1-node and 11-node points, so the gap
widens with graph size: near parity on a leaf, roughly 3x on the deep and wide graphs.

### Caveats

- **Not comparable with the paired dist run above.** Both engines here load from source, and the
  earlier run loads both from built bundles; absolute times differ across the two sections for that
  reason alone, and no ratio should be formed across sections.
- **`resolve/enumerable-5` is not like-for-like** — see the scenario note.
- **Neither side paid validation.** The current engine's validation addons are not installed; the
  older engine has none to install.
- **Live machine.** The desktop stayed up and the core was pinned but not reserved, so rounds carry
  interference the minimum-of-medians only partly removes; the per-round ranges show how much.
