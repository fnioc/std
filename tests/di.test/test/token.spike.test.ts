// Unit battery for the unified token module (exercises `libraries/di.core/src/token/`,
// touches nothing in the live engine). A hand-written REFERENCE ORACLE — an
// independent, split-based canonicaliser + unifier — cross-checks the module's
// parse/canon/match against ground truth, so the tests aren't self-confirming.

import { describe, expect, test } from 'bun:test';
import { Matcher, RESOLVER_TOKEN_STRING, Specificity, Substituter,
  TokenNode } from '../../../libraries/di.core/src/token/index.ts';

// The module's former free-function surface was folded into the `TokenNode` static
// companion + the visitor ops. These thin adapters re-expose the old names so this
// oracle-checked battery keeps exercising the same behaviour through the new API.
// `match` coerces the `Matcher`'s `undefined` miss back to `null` — the value this
// suite's assertions were written against.
function parse(raw: string): TokenNode {
  return TokenNode.parse(raw);
}
function stringify(node: TokenNode): string {
  return TokenNode.toString(node);
}
function canonicalise(raw: string): string {
  return TokenNode.canonicalise(raw);
}
function baseKey(node: TokenNode): string {
  return TokenNode.baseKey(node);
}
function isOpen(node: TokenNode): boolean {
  return TokenNode.isOpen(node);
}
function specificity(node: TokenNode): number {
  return new Specificity().measure(node);
}
function match(template: TokenNode, ground: TokenNode): Map<number, TokenNode> | null {
  return new Matcher().match(template, ground) ?? null;
}
function substitute(node: TokenNode, bind: ReadonlyMap<number, TokenNode>): TokenNode {
  return new Substituter(bind).rewrite(node);
}
function substituteSignature(signature: TokenNode[], bind: ReadonlyMap<number, TokenNode>): TokenNode[] {
  const sub = new Substituter(bind);
  return signature.map((slot) => sub.rewrite(slot));
}

// ── Reference oracle (independent of the module under test) ───────────────────

function findTop(s: string, target: string): number {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) {
        quote = '';
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (depth === 0 && c === target) {
      return i;
    }
    if (c === '<') {
      depth++;
    } else if (c === '>') {
      depth--;
    }
  }
  return -1;
}

function matchClose(s: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) {
        quote = '';
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '<') {
      depth++;
    } else if (c === '>') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function topSplit(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (quote) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) {
        quote = '';
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '<') {
      depth++;
    } else if (c === '>') {
      depth--;
    } else if (c === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

function topSplitPipe(s: string): string[] {
  const parts: string[] = [];
  let quote = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) {
        quote = '';
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '|') {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim());
}

function oracleLiteral(s: string): string {
  return topSplitPipe(s)
    .map((part) => {
      const q = part[0]!;
      let content = '';
      for (let i = 1; i < part.length; i++) {
        const c = part[i]!;
        if (c === '\\') {
          const next = part[i + 1];
          // Only `\\` and `\<quote>` are escapes; any other `\c` keeps the
          // backslash verbatim (mirrors the module's `#parseLiteral`).
          if (next === '\\' || next === q) {
            content += next ?? '';
          } else {
            content += `\\${next ?? ''}`;
          }
          i++;
          continue;
        }
        if (c === q) {
          break;
        }
        content += c;
      }
      return `"${content.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    })
    .join(' | ');
}

// A bare number is not a grammar production of its own — it is an
// identifier-shaped `path`, byte-preserved and never numerically normalised.
function canonBase(b: string): string {
  return b;
}

function oracleCanon(raw: string): string {
  const s = raw.trim();
  if (/^\$[0-9]+$/.test(s)) {
    return `$${Number(s.slice(1))}`;
  }
  if (s[0] === '"' || s[0] === "'") {
    return oracleLiteral(s);
  }
  const open = findTop(s, '<');
  if (open === -1) {
    const hash = findTop(s, '#');
    if (hash === -1) {
      return canonBase(s);
    }
    return `${canonBase(s.slice(0, hash).trim())}#${s.slice(hash + 1).trim()}`;
  }
  const close = matchClose(s, open);
  const base = canonBase(s.slice(0, open).trim());
  const args = topSplit(s.slice(open + 1, close)).map(oracleCanon);
  const after = s.slice(close + 1).trim();
  const key = after ? `#${after.slice(1).trim()}` : '';
  return `${base}<${args.join(',')}>${key}`;
}

interface OracleParts {
  base: string;
  args: string[];
  key: string;
}

function decompose(s: string): OracleParts {
  const open = findTop(s, '<');
  if (open === -1) {
    const hash = findTop(s, '#');
    if (hash === -1) {
      return { base: s, args: [], key: '' };
    }
    return { base: s.slice(0, hash), args: [], key: s.slice(hash + 1) };
  }
  const close = matchClose(s, open);
  const after = s.slice(close + 1);
  return {
    base: s.slice(0, open),
    args: topSplit(s.slice(open + 1, close)),
    key: after ? after.slice(1) : '',
  };
}

function oracleMatch(rawTemplate: string, rawGround: string, bind: Map<string, string>): boolean {
  const t = oracleCanon(rawTemplate);
  const g = oracleCanon(rawGround);
  if (/^\$[0-9]+$/.test(t)) {
    const prior = bind.get(t);
    if (prior !== undefined) {
      return prior === g;
    }
    bind.set(t, g);
    return true;
  }
  if (/^\$[0-9]+$/.test(g)) {
    return false;
  }
  const td = decompose(t);
  const gd = decompose(g);
  if (td.base !== gd.base || td.key !== gd.key || td.args.length !== gd.args.length) {
    return false;
  }
  for (let i = 0; i < td.args.length; i++) {
    if (!oracleMatch(td.args[i]!, gd.args[i]!, bind)) {
      return false;
    }
  }
  return true;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

/** The module's match binding rendered as the oracle's `$n → canon` shape. */
function bindingOf(m: Map<number, TokenNode> | null): Map<string, string> | null {
  if (m === null) {
    return null;
  }
  const out = new Map<string, string>();
  for (const [n, token] of m) {
    out.set(`$${n}`, stringify(token));
  }
  return out;
}

function expectMatchesOracle(template: string, ground: string): void {
  const moduleBind = bindingOf(match(parse(template), parse(ground)));
  const oracleBind = new Map<string, string>();
  const oracleOk = oracleMatch(template, ground, oracleBind);
  if (!oracleOk) {
    expect(moduleBind).toBeNull();
    return;
  }
  expect(moduleBind).not.toBeNull();
  expect(Object.fromEntries(moduleBind!)).toEqual(Object.fromEntries(oracleBind));
}

// ── Canonicalisation ──────────────────────────────────────────────────────────

describe('canonicalisation — parse → stringify is canonical, idempotent, oracle-checked', () => {
  const battery: string[] = [
    'pkg:IService',
    'pkg:IRepo<pkg:IA>',
    'pkg:IOuter<pkg:IMid<pkg:IInner<pkg:IA>>>',
    'IPair< A , B >',
    'IPair<A,B>',
    'IFoo<"a b">',
    'IPair<A,"x,y">',
    "IFoo<'a'>",
    'IFoo<"a" | "b">',
    'IFoo<72>',
    'IFoo<72.00>',
    'IFoo<.5>',
    'IArr<Array<pkg:IA>>',
    'pkg:IFoo#primary',
    'pkg:IRepo<pkg:IA>#primary',
    '$7',
    'pkg:IFoo<$7,SomeType,$3>',
    RESOLVER_TOKEN_STRING,
    'pkg:IRepo<@rhombus-std/di.core:IResolver>',
    'IFoo<"a < b , c >">',
  ];

  for (const raw of battery) {
    test(`canon(${JSON.stringify(raw)}) matches the oracle and is idempotent`, () => {
      const canon = canonicalise(raw);
      expect(canon).toBe(oracleCanon(raw));
      // Idempotent: canonicalising the canonical form is a no-op.
      expect(canonicalise(canon)).toBe(canon);
      // Round-trips through the typed tree unchanged.
      expect(stringify(parse(canon))).toBe(canon);
    });
  }

  test('whitespace variance collapses to one canonical form', () => {
    expect(canonicalise('IPair< A , B >')).toBe('IPair<A,B>');
    expect(canonicalise('IPair<A,B>')).toBe('IPair<A,B>');
    expect(canonicalise('pkg:IFoo  #  primary')).toBe('pkg:IFoo#primary');
  });

  test('a literal union serialises with spaced pipes (transformer byte-parity)', () => {
    // The Go transformer emits `strings.Join(members, " | ")`; a re-derived union
    // must reproduce that spacing byte-for-byte or it misses a transformer-spelled
    // exact registration. Unspaced and over-spaced input both normalise to ` | `.
    expect(canonicalise('IFoo<"a"|"b">')).toBe('IFoo<"a" | "b">');
    expect(canonicalise('IFoo<"a"  |  "b">')).toBe('IFoo<"a" | "b">');
    expect(stringify(parse('IFoo<"a"|"b"|"c">'))).toBe('IFoo<"a" | "b" | "c">');
  });

  test('single quotes canonicalise to double quotes', () => {
    expect(canonicalise("IFoo<'a'>")).toBe('IFoo<"a">');
  });

  test('significant interior whitespace inside a literal is preserved', () => {
    expect(canonicalise('IFoo<"a b">')).toBe('IFoo<"a b">');
    expect(canonicalise('IPair<A,"x,y">')).toBe('IPair<A,"x,y">');
  });

  test('numeric args are byte-preserved identifier paths — NOT numerically normalised', () => {
    // The BNF has no numeric production, so `72` / `72.00` / `7.2e1` are just
    // distinct identifier-shaped paths. Numeric-equivalence is an owner policy
    // decision, deliberately not baked in via a lossy Number() round-trip.
    expect(canonicalise('IFoo<72>')).toBe('IFoo<72>');
    expect(canonicalise('IFoo<72.00>')).toBe('IFoo<72.00>');
    expect(canonicalise('IFoo<72>')).not.toBe(canonicalise('IFoo<72.00>'));
    expect(canonicalise('IFoo<7.2e1>')).toBe('IFoo<7.2e1>');
    expect(canonicalise('IFoo<.5>')).toBe('IFoo<.5>');
  });

  test('large integer literals above 2^53 stay distinct (no Number() precision collapse)', () => {
    const lo = 'IFoo<9007199254740992>';
    const hi = 'IFoo<9007199254740993>';
    expect(canonicalise(lo)).toBe(lo);
    expect(canonicalise(hi)).toBe(hi);
    expect(canonicalise(lo)).not.toBe(canonicalise(hi));
    // A huge integer never cross-collapses onto an identifier via e-notation.
    expect(canonicalise('IFoo<100000000000000000000000>')).toBe('IFoo<100000000000000000000000>');
    expect(canonicalise('IFoo<100000000000000000000000>')).not.toBe(canonicalise('IFoo<1e+23>'));
  });

  test('number-format variance is preserved even with an attached key', () => {
    // The old normalisation gate skipped keyed/generic nodes; there is no gate
    // now — the path is preserved verbatim in every position.
    expect(canonicalise('IFoo<72.00#k>')).toBe('IFoo<72.00#k>');
    expect(canonicalise('IFoo<72#k>')).toBe('IFoo<72#k>');
  });

  test('hole labels canonicalise (leading zeros) but reject out-of-range', () => {
    expect(canonicalise('$01')).toBe('$1');
    expect(canonicalise('IFoo<$007>')).toBe('IFoo<$7>');
    // Beyond the safe-integer range a label would lose precision / emit
    // e-notation the grammar can't re-parse — reject at parse instead.
    expect(() => parse('$9007199254740993')).toThrow();
    expect(() => parse('$999999999999999999999999')).toThrow();
  });

  test('escapes: only \\\\ and \\<quote> decode; other \\c keeps the backslash', () => {
    // `"a\nb"` is backslash-n (two chars), distinct from the bare `"anb"`.
    expect(canonicalise('IFoo<"a\\nb">')).toBe('IFoo<"a\\\\nb">');
    expect(canonicalise('IFoo<"a\\nb">')).not.toBe(canonicalise('IFoo<"anb">'));
    // `\\` and `\"` are the recognised escapes and round-trip.
    expect(canonicalise('IFoo<"a\\\\b">')).toBe('IFoo<"a\\\\b">');
    expect(canonicalise('IFoo<"a\\"b">')).toBe('IFoo<"a\\"b">');
    // Canonicalisation is idempotent through the escape encoder.
    const once = canonicalise('IFoo<"a\\nb">');
    expect(canonicalise(once)).toBe(once);
  });

  test('exotic whitespace outside literals is stripped (form feed, vertical tab, NBSP)', () => {
    expect(canonicalise('IPair<A,\fB>')).toBe('IPair<A,B>');
    expect(canonicalise('IPair<A,\vB>')).toBe('IPair<A,B>');
    expect(canonicalise('IPair<A, B>')).toBe('IPair<A,B>');
    expect(canonicalise('IPair<A,\fB>')).toBe(canonicalise('IPair<A,B>'));
  });

  test('a quoted literal keeps its interior commas / angle brackets inert', () => {
    const canon = canonicalise('IFoo<"a < b , c >">');
    expect(canon).toBe('IFoo<"a < b , c >">');
    const tree = parse(canon);
    expect(tree.kind).toBe('concrete');
    expect((tree as { args: TokenNode[]; }).args).toHaveLength(1);
  });

  test('malformed input is rejected', () => {
    const bad = ['', '<Foo>', 'Foo<', 'Foo<>', 'Foo<A,>', 'Foo<A>bar', 'Foo<"unterminated', 'Foo#'];
    for (const raw of bad) {
      expect(() => parse(raw)).toThrow();
    }
  });
});

// ── Unification (match) ───────────────────────────────────────────────────────

describe('match — directional unification, oracle-checked', () => {
  test('exact concrete match with no holes', () => {
    expectMatchesOracle('pkg:IRepo<pkg:IA>', 'pkg:IRepo<pkg:IA>');
    expectMatchesOracle('pkg:IRepo<pkg:IA>', 'pkg:IRepo<pkg:IB>');
  });

  test('a single gappy hole binds its label', () => {
    expectMatchesOracle('pkg:IFoo<$7>', 'pkg:IFoo<pkg:IA>');
    const bind = match(parse('pkg:IFoo<$7>'), parse('pkg:IFoo<pkg:IA>'))!;
    expect(stringify(bind.get(7)!)).toBe('pkg:IA');
  });

  test('reordered / subset holes bind by label, not position', () => {
    expectMatchesOracle('pkg:IFoo<$7,pkg:IB,$3>', 'pkg:IFoo<pkg:IX,pkg:IB,pkg:IY>');
    const bind = match(parse('pkg:IFoo<$7,pkg:IB,$3>'), parse('pkg:IFoo<pkg:IX,pkg:IB,pkg:IY>'))!;
    expect(stringify(bind.get(7)!)).toBe('pkg:IX');
    expect(stringify(bind.get(3)!)).toBe('pkg:IY');
  });

  test('a repeated hole must bind consistently', () => {
    expectMatchesOracle('pkg:IPair<$1,$1>', 'pkg:IPair<pkg:IA,pkg:IA>');
    expectMatchesOracle('pkg:IPair<$1,$1>', 'pkg:IPair<pkg:IA,pkg:IB>');
  });

  test('partial closing — a concrete template arg must match exactly', () => {
    expectMatchesOracle('pkg:IFoo<$7,pkg:IB,$3>', 'pkg:IFoo<pkg:IX,pkg:IC,pkg:IY>');
  });

  test('positional arity mismatch fails', () => {
    expect(match(parse('pkg:IFoo<$1>'), parse('pkg:IFoo<pkg:IA,pkg:IB>'))).toBeNull();
  });

  test('keyed tokens require key equality', () => {
    expectMatchesOracle('pkg:IFoo#primary', 'pkg:IFoo#primary');
    expectMatchesOracle('pkg:IFoo#primary', 'pkg:IFoo#secondary');
    expect(match(parse('pkg:IFoo#primary'), parse('pkg:IFoo'))).toBeNull();
  });

  test('the provider intrinsic unifies only with itself', () => {
    expect(match(parse(RESOLVER_TOKEN_STRING), parse(RESOLVER_TOKEN_STRING))).not.toBeNull();
    expect(match(parse(RESOLVER_TOKEN_STRING), parse('pkg:IA'))).toBeNull();
    expect(parse(RESOLVER_TOKEN_STRING).kind).toBe('provider');
  });

  test('nested internal package-qualified token as an arg', () => {
    expectMatchesOracle('pkg:IRepo<$1>', `pkg:IRepo<${RESOLVER_TOKEN_STRING}>`);
  });

  test('a hole never binds to an open ground node (ground must be closed)', () => {
    // Directional: template holes only; an open ground would leak an unbound
    // label into the binding. A bare-hole ground and a hole-bearing arg both fail.
    expect(match(parse('$1'), parse('$5'))).toBeNull();
    expect(match(parse('pkg:IPair<pkg:IA,$2>'), parse('pkg:IPair<pkg:IA,$5>'))).toBeNull();
    expect(match(parse('pkg:IRepo<$1>'), parse('pkg:IRepo<$99>'))).toBeNull();
  });
});

// ── Specificity + substitute ──────────────────────────────────────────────────

describe('specificity + substitute', () => {
  test('specificity counts concrete nodes; holes contribute nothing', () => {
    expect(specificity(parse('pkg:IFoo<$1,$2>'))).toBe(1);
    expect(specificity(parse('pkg:IFoo<$1,pkg:IST>'))).toBe(2);
    expect(specificity(parse('pkg:IOuter<pkg:IMid<pkg:IA>>'))).toBe(3);
  });

  test('a repeated-hole (equality) template outranks its distinct-hole peer', () => {
    // IPair<$1,$1> matches only the diagonal — a strict subset of IPair<$1,$2>,
    // so it must score strictly higher for most-specific-wins to prefer it.
    expect(specificity(parse('pkg:IPair<$1,$1>'))).toBe(2);
    expect(specificity(parse('pkg:IPair<$1,$2>'))).toBe(1);
    expect(specificity(parse('pkg:IPair<$1,$1>'))).toBeGreaterThan(
      specificity(parse('pkg:IPair<$1,$2>')),
    );
    // Three-way repeat adds two constraints on top of the concrete root.
    expect(specificity(parse('pkg:ITriple<$1,$1,$1>'))).toBe(3);
  });

  test('substitute replaces holes by label and recurses', () => {
    const bind = match(parse('pkg:IFoo<$7,pkg:IB,$3>'), parse('pkg:IFoo<pkg:IX,pkg:IB,pkg:IY>'))!;
    const closed = substitute(parse('pkg:IRepo<$3,$7>'), bind);
    expect(stringify(closed)).toBe('pkg:IRepo<pkg:IY,pkg:IX>');
  });

  test('substituteSignature closes a positional dependency list', () => {
    const bind = match(parse('pkg:IFoo<$7,$3>'), parse('pkg:IFoo<pkg:IX,pkg:IY>'))!;
    const signature = [parse('$3'), parse('pkg:IDb'), parse('$7')];
    const closed = substituteSignature(signature, bind).map(stringify);
    expect(closed).toEqual(['pkg:IY', 'pkg:IDb', 'pkg:IX']);
  });

  test('isOpen / baseKey', () => {
    expect(isOpen(parse('pkg:IFoo<$1>'))).toBe(true);
    expect(isOpen(parse('pkg:IFoo<pkg:IA>'))).toBe(false);
    expect(baseKey(parse('pkg:IRepo<$1>'))).toBe('pkg:IRepo');
    expect(baseKey(parse('pkg:IRepo<$1>#primary'))).toBe('pkg:IRepo#primary');
    // A non-canonical base spelling strips to the same canonical key, so an open
    // registration and its closing agree on one open-table key.
    expect(baseKey(parse('pkg:IRepo <$1>'))).toBe('pkg:IRepo');
  });
});
