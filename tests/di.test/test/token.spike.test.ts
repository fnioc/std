// SPIKE unit battery for the typed-token redesign (additive; exercises the new
// `libraries/di.core/src/token.ts` + `token-manifest.ts`, touches nothing in the
// live engine). A hand-written REFERENCE ORACLE — an independent, split-based
// canonicaliser + unifier — cross-checks the module's parse/canon/match against
// ground truth, so the tests aren't self-confirming.

import { describe, expect, test } from 'bun:test';
import { type Descriptor, TokenManifest, TokenProvider } from '../../../libraries/di.core/src/token-manifest.ts';
import { baseKey, canonicalise, isOpen, match, parse, RESOLVER_TOKEN_STRING, specificity, stringify, substitute,
  substituteSignature, type Token } from '../../../libraries/di.core/src/token.ts';

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
          content += part[i + 1] ?? '';
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
    .join('|');
}

function canonBase(b: string): string {
  if (/^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(b)) {
    return String(Number(b));
  }
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
function bindingOf(m: Map<number, Token> | null): Map<string, string> | null {
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

  test('single quotes canonicalise to double quotes', () => {
    expect(canonicalise("IFoo<'a'>")).toBe('IFoo<"a">');
  });

  test('significant interior whitespace inside a literal is preserved', () => {
    expect(canonicalise('IFoo<"a b">')).toBe('IFoo<"a b">');
    expect(canonicalise('IPair<A,"x,y">')).toBe('IPair<A,"x,y">');
  });

  test('numeric literal 72 and 72.00 are the same canonical token', () => {
    expect(canonicalise('IFoo<72>')).toBe('IFoo<72>');
    expect(canonicalise('IFoo<72.00>')).toBe('IFoo<72>');
    expect(canonicalise('IFoo<72>')).toBe(canonicalise('IFoo<72.00>'));
    expect(canonicalise('IFoo<.5>')).toBe('IFoo<0.5>');
  });

  test('a quoted literal keeps its interior commas / angle brackets inert', () => {
    const canon = canonicalise('IFoo<"a < b , c >">');
    expect(canon).toBe('IFoo<"a < b , c >">');
    const tree = parse(canon);
    expect(tree.kind).toBe('concrete');
    expect((tree as { args: Token[]; }).args).toHaveLength(1);
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
});

// ── Specificity + substitute ──────────────────────────────────────────────────

describe('specificity + substitute', () => {
  test('specificity counts concrete nodes; holes contribute nothing', () => {
    expect(specificity(parse('pkg:IFoo<$1,$2>'))).toBe(1);
    expect(specificity(parse('pkg:IFoo<$1,pkg:IST>'))).toBe(2);
    expect(specificity(parse('pkg:IOuter<pkg:IMid<pkg:IA>>'))).toBe(3);
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
  });
});

// ── Manifest + lookup ─────────────────────────────────────────────────────────

describe('TokenManifest — decorator, toArray-at-seal, split indexes', () => {
  test('add canonicalises the token; toArray preserves registration order', () => {
    const manifest = new TokenManifest<string>();
    manifest.add('pkg:IFoo< pkg:IA >', 'a');
    manifest.add('pkg:IFoo<pkg:IB>', 'b');
    const descriptors = manifest.toArray();
    expect(descriptors).toHaveLength(2);
    expect(descriptors[0]!.token).toBe('pkg:IFoo<pkg:IA>');
    expect(descriptors.map((d) => d.producer)).toEqual(['a', 'b']);
  });

  test('seal splits exact registrations from open templates', () => {
    const manifest = new TokenManifest<string>();
    manifest.add('pkg:IService', 'svc');
    manifest.add('pkg:IRepo<$1>', 'repo-open');
    const sealed = manifest.seal();
    expect([...sealed.exact.keys()]).toEqual(['pkg:IService']);
    expect([...sealed.templates.keys()]).toEqual(['pkg:IRepo']);
    expect(Object.isFrozen(sealed.exact)).toBe(true);
    expect(Object.isFrozen(sealed.templates)).toBe(true);
    expect(Object.isFrozen(sealed.exact.get('pkg:IService'))).toBe(true);
  });
});

describe('TokenProvider.lookup', () => {
  function provider(build: (m: TokenManifest<string>) => void): TokenProvider<string> {
    const manifest = new TokenManifest<string>();
    build(manifest);
    return new TokenProvider(manifest.seal());
  }

  test('exact raw hit — no parse, last-wins over the retained list', () => {
    const p = provider((m) => {
      m.add('pkg:IService', 'first');
      m.add('pkg:IService', 'second');
    });
    expect(p.lookup('pkg:IService')!.producer).toBe('second');
  });

  test('canon-on-miss recovers whitespace / quote / number variance', () => {
    const p = provider((m) => {
      m.add('pkg:IRepo<pkg:IA>', 'closed');
    });
    // Registered canonical, looked up with whitespace + variance — no exact-raw hit.
    const hit = p.lookup('pkg:IRepo<  pkg:IA  >');
    expect(hit!.producer).toBe('closed');
    // Memoised under the raw key: same descriptor object on the second call.
    expect(p.lookup('pkg:IRepo<  pkg:IA  >')).toBe(hit);
  });

  test('open-template synthesis substitutes the impl signatures on close', () => {
    const p = provider((m) => {
      m.add('pkg:IRepo<$1>', 'repo', [[parse('$1'), parse('pkg:IDb')]]);
    });
    const hit = p.lookup('pkg:IRepo<pkg:IA>')!;
    expect(hit.token).toBe('pkg:IRepo<pkg:IA>');
    expect(hit.producer).toBe('repo');
    expect(hit.signatures!.map((s) => s.map(stringify))).toEqual([['pkg:IA', 'pkg:IDb']]);
    // Memoised under the closed canonical string.
    expect(p.lookup('pkg:IRepo<pkg:IA>')).toBe(hit);
  });

  test('reordered / subset holes synthesise correctly', () => {
    const p = provider((m) => {
      m.add('pkg:IFoo<$7,pkg:IB,$3>', 'foo', [[parse('$3')], [parse('$7')]]);
    });
    const hit = p.lookup('pkg:IFoo<pkg:IX,pkg:IB,pkg:IY>')!;
    expect(hit.signatures!.map((s) => s.map(stringify))).toEqual([['pkg:IY'], ['pkg:IX']]);
  });

  test('partial closing — a concrete template arg gates the match', () => {
    const p = provider((m) => {
      m.add('pkg:IFoo<$7,pkg:IB,$3>', 'foo');
    });
    expect(p.lookup('pkg:IFoo<pkg:IX,pkg:IB,pkg:IY>')).toBeDefined();
    expect(p.lookup('pkg:IFoo<pkg:IX,pkg:IC,pkg:IY>')).toBeUndefined();
  });

  test('most-specific template wins among overlapping templates', () => {
    const p = provider((m) => {
      m.add('pkg:IFoo<$1,$2>', 'general');
      m.add('pkg:IFoo<$1,pkg:IST>', 'specific');
    });
    expect(p.lookup('pkg:IFoo<pkg:IX,pkg:IST>')!.producer).toBe('specific');
    expect(p.lookup('pkg:IFoo<pkg:IX,pkg:IY>')!.producer).toBe('general');
  });

  test('keyed open template gates by base-plus-key', () => {
    const p = provider((m) => {
      m.add('pkg:IRepo<$1>#primary', 'keyed', [[parse('$1')]]);
    });
    const hit = p.lookup('pkg:IRepo<pkg:IA>#primary')!;
    expect(hit.token).toBe('pkg:IRepo<pkg:IA>#primary');
    expect(hit.signatures!.map((s) => s.map(stringify))).toEqual([['pkg:IA']]);
    // A differently-keyed close does not match the primary template.
    expect(p.lookup('pkg:IRepo<pkg:IA>#secondary')).toBeUndefined();
  });

  test('a non-generic miss short-circuits before template synthesis', () => {
    const p = provider((m) => {
      m.add('pkg:IRepo<$1>', 'repo');
    });
    expect(p.lookup('pkg:IUnknown')).toBeUndefined();
  });

  test('a descriptor carries its scope through synthesis', () => {
    const p = provider((m) => {
      m.add('pkg:IRepo<$1>', 'repo', undefined, 'scoped');
    });
    const hit: Descriptor<string> = p.lookup('pkg:IRepo<pkg:IA>')!;
    expect(hit.scope).toBe('scoped');
  });
});
