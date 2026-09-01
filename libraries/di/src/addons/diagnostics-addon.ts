import { type Addon, type AddonInstallation, type Behavior, Control, type DiagnosticEdge, type DiagnosticPhase, type DiagnosticReading, Diagnostics, type DiagnosticsSegment, type IEngineHooks,
  Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { askForControl } from '../internal/control-recognition.js';

export type { DiagnosticEdge, DiagnosticPhase, DiagnosticReading };

/** A probe records this many readings before it starts dropping them. */
const DEFAULT_CAPACITY = 1024;

const PHASES: readonly DiagnosticPhase[] = ['resolve', 'beginResolve', 'beforeConstruct', 'canonicalize', 'afterConstruct'];
const P_RESOLVE = 0;
const P_BEGIN_RESOLVE = 1;
const P_BEFORE_CONSTRUCT = 2;
const P_CANONICALIZE = 3;
const P_AFTER_CONSTRUCT = 4;

const EDGES: readonly DiagnosticEdge[] = ['pre', 'post'];
const E_PRE = 0;
const E_POST = 1;

/** One probe's preallocated columns: a fixed slot per reading, indexed by `count`. */
interface Columns {
  readonly clock: Float64Array;
  readonly phase: Uint8Array;
  readonly edge: Uint8Array;
  readonly address: Type[];
  readonly node: Array<object | undefined>;
  count: number;
  dropped: number;
}

function columnsOf(capacity: number): Columns {
  return {
    clock: new Float64Array(capacity),
    phase: new Uint8Array(capacity),
    edge: new Uint8Array(capacity),
    address: new Array(capacity),
    node: new Array(capacity),
    count: 0,
    dropped: 0,
  };
}

/** Builds `DiagnosticReading` objects from `columns` on demand — nothing is allocated until this runs. */
function materialize(columns: Columns): DiagnosticReading[] {
  const readings: DiagnosticReading[] = [];
  for (let i = 0; i < columns.count; i++) {
    readings.push({ phase: PHASES[columns.phase[i]!]!, edge: EDGES[columns.edge[i]!]!, address: columns.address[i]!, node: columns.node[i], at: columns.clock[i]! });
  }
  return readings;
}

/** One probe's segment, read lazily from its own columns. */
class SegmentView implements DiagnosticsSegment {
  readonly name: string;
  readonly #columns: Columns;

  constructor(name: string, columns: Columns) {
    this.name = name;
    this.#columns = columns;
  }

  get readings(): readonly DiagnosticReading[] {
    return materialize(this.#columns);
  }
}

/** What a resolve of `Diagnostics` answers: every probe's segment, gathered as the ask passes through each one's hooks. */
class DiagnosticsView implements Diagnostics {
  readonly #segments: readonly DiagnosticsSegment[];

  constructor(segments: readonly DiagnosticsSegment[]) {
    this.#segments = segments;
  }

  get segments(): readonly DiagnosticsSegment[] {
    return this.#segments;
  }
}

/** The addon a probe composes into a container, plus direct access to what it recorded. */
export interface DiagnosticsProbe extends Addon {
  /** The name this probe was configured with. */
  readonly name: string;
  /** Every reading this probe has taken so far, oldest first. */
  get readings(): readonly DiagnosticReading[];
  /** How many readings this probe has discarded after filling its capacity. */
  get dropped(): number;
}

/** Configures one probe. */
export interface DiagnosticsAddonOptions {
  /** Labels this probe's segment, so a caller reading several apart can tell which is which. */
  readonly name: string;
  /**
   * The clock to read. Supplied rather than reached for, since no one clock is spelled the same
   * on every runtime this container runs on.
   */
  readonly now: Func<[], number>;
  /** How many readings this probe holds before it starts dropping them. */
  readonly capacity?: number;
  /**
   * What the composed lifetime model calls its own transient tier — e.g. `standardLifetimeAddon.transient`
   * — since the `Diagnostics` this probe answers is itself a fresh, per-ask scratch object.
   */
  readonly transientLifetime?: unknown;
}

/**
 * A probe reading the clock either side of everything it stands around, named for whoever reads
 * its results back.
 *
 * @remarks
 * Compose as many as the question needs and hold onto each one apart — one outside the lifetime
 * model, one against the engine — and the differences between their readings attribute the cost to
 * each segment. The builder cannot place anything outside the lifetime model, since
 * `usingLifetimeModel` installs it ahead of every addon a caller can name; folding the chain by hand
 * can, an addon being only its registrations and its middleware.
 *
 * ```ts
 * di.usingLifetimeModel(standardLifetimeAddon())
 *   .useAddon(diagnosticsAddon({ name: 'against-engine', now, transientLifetime: standardLifetimeAddon.transient }))
 *   .build();
 * ```
 *
 * Resolving `Diagnostics` from a container carrying one or more of these gathers a segment from
 * every probe installed on it, named for the probe that recorded it.
 *
 * Every stamp writes straight into this probe's own preallocated columns: two indexed writes and a
 * count, nothing else. A probe holds a fixed number of readings; once full it stops recording and
 * counts what it dropped instead of growing or throwing, so a long run never reallocates
 * mid-measurement. `readings`, and a segment's own `readings`, build `DiagnosticReading` objects
 * from those columns only when read.
 *
 * A construction the chain answers outright never reaches the engine, so its `beforeConstruct` pair
 * closes with no `afterConstruct` pair beside it.
 */
export function diagnosticsAddon(options: DiagnosticsAddonOptions): DiagnosticsProbe {
  const { name, now, capacity = DEFAULT_CAPACITY, transientLifetime } = options;
  const columns = columnsOf(capacity);

  const hooks: Behavior<unknown> = {
    beginResolve(request, injected, next) {
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_BEGIN_RESOLVE;
        columns.edge[columns.count] = E_PRE;
        columns.address[columns.count] = request;
        columns.node[columns.count] = undefined;
        columns.count++;
      } else {
        columns.dropped++;
      }
      const state = next(request, injected);
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_BEGIN_RESOLVE;
        columns.edge[columns.count] = E_POST;
        columns.address[columns.count] = request;
        columns.node[columns.count] = undefined;
        columns.count++;
      } else {
        columns.dropped++;
      }
      return state;
    },

    /** Answers `Diagnostics` for whoever names it, gathering every probe's segment as the answer passes through each one's hooks. */
    beforeConstruct(construction, next) {
      if (construction.populatedAddress === Diagnostics.address) {
        const answer = next(construction);
        const before = 'result' in answer ? (answer.result as Diagnostics).segments : [];
        return { result: new DiagnosticsView([...before, new SegmentView(name, columns)]) };
      }
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_BEFORE_CONSTRUCT;
        columns.edge[columns.count] = E_PRE;
        columns.address[columns.count] = construction.populatedAddress;
        columns.node[columns.count] = construction.node;
        columns.count++;
      } else {
        columns.dropped++;
      }
      const answer = next(construction);
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_BEFORE_CONSTRUCT;
        columns.edge[columns.count] = E_POST;
        columns.address[columns.count] = construction.populatedAddress;
        columns.node[columns.count] = construction.node;
        columns.count++;
      } else {
        columns.dropped++;
      }
      return answer;
    },

    canonicalize(construction, instance, next) {
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_CANONICALIZE;
        columns.edge[columns.count] = E_PRE;
        columns.address[columns.count] = construction.populatedAddress;
        columns.node[columns.count] = construction.node;
        columns.count++;
      } else {
        columns.dropped++;
      }
      const settled = next(construction, instance);
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_CANONICALIZE;
        columns.edge[columns.count] = E_POST;
        columns.address[columns.count] = construction.populatedAddress;
        columns.node[columns.count] = construction.node;
        columns.count++;
      } else {
        columns.dropped++;
      }
      return settled;
    },

    afterConstruct(construction, instance, next) {
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_AFTER_CONSTRUCT;
        columns.edge[columns.count] = E_PRE;
        columns.address[columns.count] = construction.populatedAddress;
        columns.node[columns.count] = construction.node;
        columns.count++;
      } else {
        columns.dropped++;
      }
      next(construction, instance);
      if (columns.count < capacity) {
        columns.clock[columns.count] = now();
        columns.phase[columns.count] = P_AFTER_CONSTRUCT;
        columns.edge[columns.count] = E_POST;
        columns.address[columns.count] = construction.populatedAddress;
        columns.node[columns.count] = construction.node;
        columns.count++;
      } else {
        columns.dropped++;
      }
    },
  };

  return {
    name,

    get readings(): readonly DiagnosticReading[] {
      return materialize(columns);
    },

    get dropped(): number {
      return columns.dropped;
    },

    create(): AddonInstallation {
      return {
        registrations: [
          Registration.factory(
            Diagnostics.address,
            () => {
              throw new Error(
                `${
                  Type.stringify(Diagnostics.address)
                } is answered by the diagnostics addon's own hooks, and this container never installed them — resolve it from a container built with useAddon(diagnosticsAddon({ name, now }))`,
              );
            },
            Type.func(Diagnostics.address, [[]]),
            transientLifetime,
          ),
        ],
        // Plants the hooks as the chain folds, then stands in the request chain at its own position.
        middleware: next => {
          askForControl<IEngineHooks>({ getService: next }, typefor<Control<IEngineHooks>>()).useHooks(hooks);
          return request => {
            if (columns.count < capacity) {
              columns.clock[columns.count] = now();
              columns.phase[columns.count] = P_RESOLVE;
              columns.edge[columns.count] = E_PRE;
              columns.address[columns.count] = request;
              columns.node[columns.count] = undefined;
              columns.count++;
            } else {
              columns.dropped++;
            }
            const answer = next(request);
            if (columns.count < capacity) {
              columns.clock[columns.count] = now();
              columns.phase[columns.count] = P_RESOLVE;
              columns.edge[columns.count] = E_POST;
              columns.address[columns.count] = request;
              columns.node[columns.count] = undefined;
              columns.count++;
            } else {
              columns.dropped++;
            }
            return answer;
          };
        },
      };
    },
  };
}
