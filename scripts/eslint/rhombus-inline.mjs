// @ts-check
// The inline-authoring ESLint rule (owner task #1). It enforces the hygiene an
// inlineable sugar body must satisfy so the generic inline stage can substitute
// it safely: a single return expression written over compile-time primitives,
// each value parameter used at most once in a runtime position, type parameters
// only inside primitive type-argument positions, and no free identifiers beyond
// params / `this` / type params / a primitive import / a value the authoring
// file imports. The receiver's single-evaluation is the inliner's mechanism,
// not a lint — bodies may use `this` freely.
//
// Every check is syntactic + scope-based (no type services), so the rule runs on
// the default typescript-eslint parser output.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { entryKind, loadInlineEntries, parseTypeRef } from './inline-entries.mjs';

// Each compile-time primitive maps to its HOME module — the module an inline body
// may import it from. Both are pure transformables that home in the authoring
// package @rhombus-std/primitives.extras — every call is substituted, so the
// runtime @rhombus-std/primitives leaf carries neither. Mirrors the Go scanner's
// knownPrimitives map.
const PRIMITIVE_HOMES = { typefor: '@rhombus-std/primitives.extras', schemaof: '@rhombus-std/primitives.extras' };

/** Walks up from a file to the nearest directory containing a package.json. */
function findPackageDir(/** @type {string} */ file) {
  let dir = dirname(file);
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/** Reads the "name" field of packageDir/package.json, or null. */
function readPackageName(/** @type {string} */ packageDir) {
  try {
    return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).name ?? null;
  } catch {
    return null;
  }
}

// The `registerInlineBodies` authoring marker's home module. A body set is
// marker-published when a top-level call to a local bound to this marker names
// it — the same recognition the Go collector applies.
const MARKER_NAME = 'registerInlineBodies';
const MARKER_HOME = '@rhombus-std/primitives.extras';

/**
 * Returns the local names the file binds to the `registerInlineBodies` marker:
 * a named import from its home module, or — when the home IS the declaring
 * package — from a package-relative specifier.
 */
function markerLocalNames(/** @type {any} */ ast, /** @type {string | null} */ pkgName) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const stmt of ast.body) {
    if (stmt.type !== 'ImportDeclaration') {
      continue;
    }
    const module = stmt.source.value;
    const relative = typeof module === 'string' && module.startsWith('.');
    if (module !== MARKER_HOME && !(relative && pkgName === MARKER_HOME)) {
      continue;
    }
    for (const spec of stmt.specifiers) {
      if (spec.type !== 'ImportSpecifier') {
        continue;
      }
      const imported = spec.imported.type === 'Identifier' ? spec.imported.name : String(spec.imported.value);
      if (imported === MARKER_NAME) {
        out.add(spec.local.name);
      }
    }
  }
  return out;
}

/**
 * Returns the set identifiers published by the file's top-level
 * `registerInlineBodies(SetName)` calls.
 */
function markerSetNames(/** @type {any} */ ast, /** @type {string | null} */ pkgName) {
  const locals = markerLocalNames(ast, pkgName);
  /** @type {Set<string>} */
  const out = new Set();
  if (locals.size === 0) {
    return out;
  }
  for (const stmt of ast.body) {
    if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'CallExpression') {
      continue;
    }
    const call = stmt.expression;
    if (call.callee.type !== 'Identifier' || !locals.has(call.callee.name)) {
      continue;
    }
    if (call.arguments.length === 1 && call.arguments[0].type === 'Identifier') {
      out.add(call.arguments[0].name);
    }
  }
  return out;
}

/**
 * Returns the member names of the body set named setName in the file: each
 * property of an object-literal `const`, or each exported function of an
 * `export namespace`.
 */
function setMemberNames(/** @type {any} */ ast, /** @type {string} */ setName) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const stmt of ast.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' && stmt.declaration ? stmt.declaration : stmt;
    if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        if (d.id.type !== 'Identifier' || d.id.name !== setName) {
          continue;
        }
        const init = unwrapTsExpression(d.init);
        if (!init || init.type !== 'ObjectExpression') {
          continue;
        }
        for (const prop of init.properties) {
          if (prop.type === 'Property' && prop.key?.type === 'Identifier') {
            out.add(prop.key.name);
          }
        }
      }
    } else if (decl.type === 'TSModuleDeclaration' && decl.id?.type === 'Identifier' && decl.id.name === setName) {
      const body = decl.body;
      if (!body || body.type !== 'TSModuleBlock') {
        continue;
      }
      for (const s of body.body) {
        if (s.type === 'ExportNamedDeclaration' && s.declaration?.type === 'FunctionDeclaration' && s.declaration.id) {
          out.add(s.declaration.id.name);
        }
      }
    }
  }
  return out;
}

/** Strips `as`/`satisfies` and parentheses off an expression node. */
function unwrapTsExpression(/** @type {any} */ node) {
  while (node && (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' || node.type === 'ParenthesizedExpression')) {
    node = node.expression;
  }
  return node;
}

/**
 * The name of the namespace a function is declared in (unwrapping the export
 * wrapper), or null for a module-level function.
 */
function enclosingNamespaceName(/** @type {any} */ node) {
  let parent = node.parent;
  if (parent?.type === 'ExportNamedDeclaration') {
    parent = parent.parent;
  }
  if (parent?.type === 'TSModuleBlock' && parent.parent?.type === 'TSModuleDeclaration'
    && parent.parent.id?.type === 'Identifier') {
    return parent.parent.id.name;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: { type: 'problem', docs: { description: 'Enforce inlineable sugar-body hygiene for the rhombus-std inline stage.' }, schema: [],
    messages: { entryShape: 'rhombus-std inline publish list is malformed: {{detail}}', singleReturn: 'An inlineable sugar body must be exactly one `return <expr>;`.',
      bannedSyntax: "A sugar body's returned expression may not use {{syntax}} (single compile-time expression only).",
      paramReuse: 'Value parameter {{name}} appears in more than one runtime position; each may appear at most once outside a primitive call.',
      typeParamPosition: 'Type parameter {{name}} may appear only as the whole type argument of a primitive call.',
      freeIdentifier: 'Identifier {{name}} is not a parameter, `this`, a type parameter, a known primitive import, or a value the file imports.',
      noAlias: 'Primitive import {{name}} must be a direct unaliased named import.',
      noNesting: 'A sugar body may not reference another inlineable declaration ({{name}}); nesting is not yet supported.' } },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const pkgDir = findPackageDir(filename);
    if (!pkgDir) {
      return {};
    }
    const pkgName = readPackageName(pkgDir);

    /** @type {import('./inline-entries.mjs').InlineEntry[]} */
    let entries;
    try {
      entries = loadInlineEntries(pkgDir);
    } catch (err) {
      return { Program(node) {
        context.report({ node, messageId: 'entryShape', data: { detail: String(err instanceof Error ? err.message : err) } });
      } };
    }

    // Impl's bare NAME (the local declaration a body's export binds to, never
    // the fully-qualified marker string) → set of member names to check (member
    // kind); floaters map their own bare name to a sentinel.
    /** @type {Map<string, Set<string>>} */
    const implMembers = new Map();
    /** @type {Set<string>} */
    const freeFns = new Set();
    for (const e of entries) {
      const { kind } = entryKind(e);
      const implName = parseTypeRef(e.impl).name;
      if (kind === 'member') {
        if (!implMembers.has(implName)) {
          implMembers.set(implName, new Set());
        }
        implMembers.get(implName).add(e.member);
      } else if (kind === 'floater') {
        freeFns.add(implName);
      }
    }

    // The second publish channel: a top-level `registerInlineBodies(SetName)`
    // call publishes every member of the body set declared beside it in this
    // same file. Discovered up front from the file's own AST (the call sits
    // BELOW its set, so lazy per-node discovery would run too late) and merged
    // into implMembers, so marker-published bodies get exactly the checks a
    // JSON-listed body gets. Mirrors the Go collector's marker discovery.
    const ast = (context.sourceCode ?? context.getSourceCode()).ast;
    for (const setName of markerSetNames(ast, pkgName)) {
      const members = setMemberNames(ast, setName);
      if (members.size === 0) {
        continue;
      }
      if (!implMembers.has(setName)) {
        implMembers.set(setName, new Set());
      }
      for (const m of members) {
        implMembers.get(setName).add(m);
      }
    }
    // The set of all listed names (for the nesting check).
    const listedNames = new Set([...implMembers.keys(), ...freeFns]);
    /** @type {Set<string>} */
    const listedMembers = new Set();
    for (const members of implMembers.values()) {
      for (const m of members) {
        listedMembers.add(m);
      }
    }

    // Local names bound to a known primitive, and whether each is aliased.
    /** @type {Set<string>} */
    const primitiveLocals = new Set();
    // Local names bound to a value the authoring file imports (see
    // ImportDeclaration below for which imports qualify) — legal as a bare
    // identifier reference in a body's expression, never as the base of a
    // property chain.
    /** @type {Set<string>} */
    const valueImportLocals = new Set();

    return {
      ImportDeclaration(node) {
        const module = node.source.value;
        const relative = typeof module === 'string' && module.startsWith('.');
        for (const spec of node.specifiers) {
          if (spec.type !== 'ImportSpecifier') {
            continue;
          }
          const imported = spec.imported.type === 'Identifier' ? spec.imported.name : String(spec.imported.value);
          const home = PRIMITIVE_HOMES[imported];
          // Accept a primitive only from its home module directly, or — when its
          // home IS the declaring package — via a package-relative specifier. Any
          // other source is not a recognized primitive import (a reference then
          // falls through to the freeIdentifier check).
          const fromHome = module === home;
          const fromOwnPackage = relative && home !== undefined && home === pkgName;
          if (fromHome || fromOwnPackage) {
            if (spec.local.name !== imported) {
              context.report({ node: spec, messageId: 'noAlias', data: { name: imported } });
              continue;
            }
            primitiveLocals.add(spec.local.name);
            continue;
          }
          // A body's imports are its runtime declarations: a named value import
          // from a bare package specifier binds its local name for a bare
          // reference in the body, aliased or not. A primitive name (handled
          // above) and the module-level `registerInlineBodies` authoring marker
          // never qualify.
          const typeOnly = node.importKind === 'type' || spec.importKind === 'type';
          if (relative || typeOnly || home !== undefined || imported === 'registerInlineBodies') {
            continue;
          }
          valueImportLocals.add(spec.local.name);
        }
      },

      // Object-literal impls: const Foo = { member() {...} }.
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !implMembers.has(node.id.name)) {
          return;
        }
        const members = implMembers.get(node.id.name);
        if (!node.init || node.init.type !== 'ObjectExpression') {
          return;
        }
        for (const prop of node.init.properties) {
          if (prop.type !== 'Property' && prop.type !== 'MethodDefinition') {
            continue;
          }
          const key = prop.key;
          if (!key || key.type !== 'Identifier' || !members.has(key.name)) {
            continue;
          }
          const fn = prop.value;
          if (fn && (fn.type === 'FunctionExpression' || fn.type === 'ArrowFunctionExpression')) {
            checkBody(context, fn, primitiveLocals, valueImportLocals, listedNames, listedMembers);
          }
        }
      },

      // Free-function impls (export function foo<T>() { return ...; }) and the
      // exported functions of a marker-published `export namespace` body set.
      FunctionDeclaration(node) {
        if (!node.id) {
          return;
        }
        if (freeFns.has(node.id.name)) {
          checkBody(context, node, primitiveLocals, valueImportLocals, listedNames, listedMembers);
          return;
        }
        const ns = enclosingNamespaceName(node);
        if (ns !== null && implMembers.get(ns)?.has(node.id.name)) {
          checkBody(context, node, primitiveLocals, valueImportLocals, listedNames, listedMembers);
        }
      },
    };
  },
};

const BANNED = {
  // A conditional (?:) is PERMITTED — still one side-effect-free expression. The
  // control forms below are banned because each breaks that shape.
  LogicalExpression: 'a logical operator (&&/||/??)',
  AssignmentExpression: 'assignment',
  SequenceExpression: 'a comma sequence',
  AwaitExpression: 'await',
  YieldExpression: 'yield',
  NewExpression: 'new',
  ArrowFunctionExpression: 'a nested function',
  FunctionExpression: 'a nested function',
  SpreadElement: 'spread',
};

/**
 * Enforces the single-return-expression hygiene on one function-like body.
 */
function checkBody(context, fn, primitiveLocals, valueImportLocals, listedNames, listedMembers) {
  const body = fn.body;
  if (!body || body.type !== 'BlockStatement' || body.body.length !== 1 || body.body[0].type !== 'ReturnStatement'
    || !body.body[0].argument) {
    context.report({ node: fn, messageId: 'singleReturn' });
    return;
  }
  const expr = body.body[0].argument;

  const typeParams = new Set((fn.typeParameters?.params ?? []).map((p) => p.name?.name).filter(Boolean));
  const valueParams = new Set();
  // A trailing rest parameter's name, if the body has one — the generic inline
  // stage binds it to the argument LIST tail and splices that list wherever the
  // body spreads it (substitute.go's `rest.expand`), so `...rest` is that
  // mechanism's splice point, not a runtime spread.
  let restParamName = null;
  for (const p of fn.params) {
    if (p.type === 'Identifier' && p.name !== 'this') {
      valueParams.add(p.name);
    } else if (p.type === 'RestElement' && p.argument.type === 'Identifier') {
      valueParams.add(p.argument.name);
      restParamName = p.argument.name;
    }
  }

  /** @type {Map<string, number>} runtime-position occurrences per value param */
  const paramRuntimeUses = new Map();

  // A stack marking whether the current position is inside a primitive call's
  // arguments (where a param may repeat and a type param is allowed).
  walkExpression(expr, { restParamName, onBanned(node, syntax) {
    context.report({ node, messageId: 'bannedSyntax', data: { syntax } });
  }, onIdentifier(node, insidePrimitiveArgs, isMemberBase) {
    const name = node.name;
    if (valueParams.has(name)) {
      if (!insidePrimitiveArgs) {
        paramRuntimeUses.set(name, (paramRuntimeUses.get(name) ?? 0) + 1);
      }
      return;
    }
    if (name === 'this' || typeParams.has(name) || primitiveLocals.has(name)) {
      return;
    }
    // An imported value satisfies a bare identifier reference, never the base of
    // a property chain — `Type.stringify(...)` still reports on `Type`.
    if (!isMemberBase && valueImportLocals.has(name)) {
      return;
    }
    // A member of another listed impl referenced by identifier → nesting.
    if (listedNames.has(name)) {
      context.report({ node, messageId: 'noNesting', data: { name } });
      return;
    }
    context.report({ node, messageId: 'freeIdentifier', data: { name } });
  }, onTypeArg(node, insidePrimitiveCall) {
    // A type parameter used anywhere but a primitive call's type-arg position.
    const names = collectTypeRefs(node);
    for (const { name, node: ref } of names) {
      if (typeParams.has(name) && !insidePrimitiveCall) {
        context.report({ node: ref, messageId: 'typeParamPosition', data: { name } });
      }
    }
  }, onNestedMember(node, name) {
    context.report({ node, messageId: 'noNesting', data: { name } });
  }, primitiveLocals, listedMembers });

  for (const [name, count] of paramRuntimeUses) {
    if (count > 1) {
      context.report({ node: fn, messageId: 'paramReuse', data: { name } });
    }
  }
}

/** Collects TSTypeReference identifier names in a type node. */
function collectTypeRefs(node) {
  const out = [];
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') {
      return;
    }
    if (n.type === 'TSTypeReference' && n.typeName?.type === 'Identifier') {
      out.push({ name: n.typeName.name, node: n });
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent') {
        continue;
      }
      const child = n[key];
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else if (child && typeof child.type === 'string') {
        visit(child);
      }
    }
  };
  visit(node);
  return out;
}

/**
 * Walks an expression tree, invoking callbacks. It threads a flag for "inside a
 * primitive call's argument/type-arg positions" so param-reuse and type-param
 * checks can distinguish runtime positions from primitive positions.
 */
function walkExpression(root, cb) {
  const visit = (node, insidePrimitiveArgs, isMemberBase = false) => {
    if (!node || typeof node.type !== 'string') {
      return;
    }
    if (BANNED[node.type]) {
      // A spread is permitted in exactly two shapes, both splice points the
      // generic inline stage substitutes wholesale rather than runtime spreads:
      //   - its argument is a primitive call — the stage inlines the
      //     primitive's minted members into the surrounding call's argument list;
      //   - its argument is the body's own trailing rest parameter (`...rest`)
      //     — the stage binds a rest parameter to the call's remaining
      //     arguments as a list and splices that list at this exact spread
      //     (substitute.go's `rest.expand`), so the emitted form is the
      //     byte-clean, spread-free call a hand author writes either way.
      // Any other spread (e.g. `[...this.items]`, spreading a non-rest param)
      // stays banned.
      const primitiveSpread = node.type === 'SpreadElement'
        && node.argument?.type === 'CallExpression'
        && node.argument.callee.type === 'Identifier'
        && cb.primitiveLocals.has(node.argument.callee.name);
      const restForwardSpread = node.type === 'SpreadElement'
        && node.argument?.type === 'Identifier'
        && cb.restParamName !== null
        && node.argument.name === cb.restParamName;
      if (!primitiveSpread && !restForwardSpread) {
        cb.onBanned(node, BANNED[node.type]);
        // Keep walking to surface nested issues too.
      }
    }

    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const isPrimitive = callee.type === 'Identifier' && cb.primitiveLocals.has(callee.name);
      // A this.<member> call to another listed member is nesting (unless it is
      // the primitive-form call, which the stage handles).
      if (callee.type === 'MemberExpression' && callee.object.type === 'ThisExpression'
        && callee.property.type === 'Identifier' && cb.listedMembers.has(callee.property.name)) {
        const typeArgCount = node.typeArguments?.params?.length ?? 0;
        if (typeArgCount > 0) {
          cb.onNestedMember(node, callee.property.name);
        }
      }
      // Type arguments.
      const typeArgs = node.typeArguments?.params ?? [];
      for (const ta of typeArgs) {
        cb.onTypeArg(ta, isPrimitive);
      }
      // Callee: skip a primitive callee identifier (a recognized call target,
      // not a free identifier); otherwise walk it — a bare imported-value callee
      // resolves through the ordinary identifier check below, while a
      // property-access callee's base still requires the stricter member-base set.
      if (!(callee.type === 'Identifier' && isPrimitive)) {
        visit(callee, insidePrimitiveArgs);
      }
      for (const arg of node.arguments) {
        visit(arg, insidePrimitiveArgs || isPrimitive);
      }
      return;
    }

    if (node.type === 'MemberExpression') {
      // The object is the base of a property chain — an imported value never
      // satisfies this position, only a bare identifier reference.
      visit(node.object, insidePrimitiveArgs, true);
      if (node.computed) {
        visit(node.property, insidePrimitiveArgs);
      }
      return;
    }

    if (node.type === 'Identifier') {
      cb.onIdentifier(node, insidePrimitiveArgs, isMemberBase);
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'typeAnnotation' || key === 'returnType') {
        continue;
      }
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((c) => visit(c, insidePrimitiveArgs));
      } else if (child && typeof child.type === 'string') {
        visit(child, insidePrimitiveArgs);
      }
    }
  };
  visit(root, false);
}

export default { rules: { 'inline-authoring': rule } };
