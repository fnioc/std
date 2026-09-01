# DI benchmarks

Two engines, same service graph. "classic" is the string-keyed, tag-scoped engine; "current" is
the `Type`-addressed engine. The headline comparison runs classic against current's `tagged()`
lifetime model — the older engine's scopes are tag-based (its singleton scenario opens a scope
named `'singleton'`), making `tagged()` the like-for-like counterpart, not `standard()`. Both
engines run only through their built `dist/bundle/index.js` public entry — no source imports, no
transformer sugar (`typefor`, `add<T>()`) anywhere in a timed path. Every scope-bearing scenario
opens an equivalent scope on both sides — same tag, same nesting, same setup-vs-timed-closure
placement — so every ratio below compares the same operation on both engines.

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

The two engines' scopes have different disposal contracts. The current engine's scope disposal
cascades: tearing down a scope also tears down every child scope it opened and everything those
children own. The older engine's scope disposal releases only the instances that scope itself
claimed, leaving any child scopes for the caller to dispose. This scenario's single scope carries
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
