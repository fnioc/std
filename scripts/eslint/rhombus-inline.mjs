// @ts-check
// The inline-authoring ESLint rule (owner task #1). It enforces the hygiene an
// inlineable sugar body must satisfy so the generic inline stage can substitute
// it safely: a single return expression written over compile-time primitives,
// each value parameter used at most once in a runtime position, type parameters
// only inside primitive type-argument positions, and no free identifiers beyond
// params / `this` / type params / unaliased primitive imports. The receiver's
// single-evaluation is the inliner's mechanism, not a lint — bodies may use
// `this` freely.
//
// Every check is syntactic + scope-based (no type services), so the rule runs on
// the default typescript-eslint parser output.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { entryKind, loadInlineEntries } from './inline-entries.mjs';

const PRIMITIVES_MODULE = '@rhombus-std/primitives';
const KNOWN_PRIMITIVES = new Set(['nameof']);

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

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce inlineable sugar-body hygiene for the rhombus.inline stage.' },
    schema: [],
    messages: {
      entryShape: 'rhombus.inline publish list is malformed: {{detail}}',
      singleReturn: 'An inlineable sugar body must be exactly one `return <expr>;`.',
      bannedSyntax: "A sugar body's returned expression may not use {{syntax}} (single compile-time expression only).",
      paramReuse:
        'Value parameter {{name}} appears in more than one runtime position; each may appear at most once outside a primitive call.',
      typeParamPosition: 'Type parameter {{name}} may appear only as the whole type argument of a primitive call.',
      freeIdentifier: 'Identifier {{name}} is not a parameter, `this`, a type parameter, or a known primitive import.',
      noAlias: 'Primitive import {{name}} must be a direct unaliased named import.',
      noNesting:
        'A sugar body may not reference another inlineable declaration ({{name}}); nesting is not yet supported.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const pkgDir = findPackageDir(filename);
    if (!pkgDir) {
      return {};
    }

    /** @type {import('./inline-entries.mjs').InlineEntry[]} */
    let entries;
    try {
      entries = loadInlineEntries(pkgDir);
    } catch (err) {
      return {
        Program(node) {
          context.report({ node, messageId: 'entryShape',
            data: { detail: String(err instanceof Error ? err.message : err) } });
        },
      };
    }

    // Impl → set of member names to check (member kind); free functions map their
    // own name to a sentinel.
    /** @type {Map<string, Set<string>>} */
    const implMembers = new Map();
    /** @type {Set<string>} */
    const freeFns = new Set();
    for (const e of entries) {
      const { kind } = entryKind(e);
      if (kind === 'member') {
        if (!implMembers.has(e.impl)) {
          implMembers.set(e.impl, new Set());
        }
        implMembers.get(e.impl).add(e.member);
      } else if (kind === 'function') {
        freeFns.add(e.impl);
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

    return {
      ImportDeclaration(node) {
        if (node.source.value !== PRIMITIVES_MODULE) {
          return;
        }
        for (const spec of node.specifiers) {
          if (spec.type !== 'ImportSpecifier') {
            continue;
          }
          const imported = spec.imported.type === 'Identifier' ? spec.imported.name : String(spec.imported.value);
          if (!KNOWN_PRIMITIVES.has(imported)) {
            continue;
          }
          if (spec.local.name !== imported) {
            context.report({ node: spec, messageId: 'noAlias', data: { name: imported } });
            continue;
          }
          primitiveLocals.add(spec.local.name);
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
            checkBody(context, fn, primitiveLocals, listedNames, listedMembers);
          }
        }
      },

      // Free-function impls: export function foo<T>() { return ...; }.
      FunctionDeclaration(node) {
        if (!node.id || !freeFns.has(node.id.name)) {
          return;
        }
        checkBody(context, node, primitiveLocals, listedNames, listedMembers);
      },
    };
  },
};

const BANNED = {
  ConditionalExpression: 'a conditional (?:)',
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
function checkBody(context, fn, primitiveLocals, listedNames, listedMembers) {
  const body = fn.body;
  if (!body || body.type !== 'BlockStatement' || body.body.length !== 1 || body.body[0].type !== 'ReturnStatement'
    || !body.body[0].argument)
  {
    context.report({ node: fn, messageId: 'singleReturn' });
    return;
  }
  const expr = body.body[0].argument;

  const typeParams = new Set((fn.typeParameters?.params ?? []).map((p) => p.name?.name).filter(Boolean));
  const valueParams = new Set();
  for (const p of fn.params) {
    if (p.type === 'Identifier' && p.name !== 'this') {
      valueParams.add(p.name);
    } else if (p.type === 'RestElement' && p.argument.type === 'Identifier') {
      valueParams.add(p.argument.name);
    }
  }

  /** @type {Map<string, number>} runtime-position occurrences per value param */
  const paramRuntimeUses = new Map();

  // A stack marking whether the current position is inside a primitive call's
  // arguments (where a param may repeat and a type param is allowed).
  walkExpression(expr, {
    onBanned(node, syntax) {
      context.report({ node, messageId: 'bannedSyntax', data: { syntax } });
    },
    onIdentifier(node, insidePrimitiveArgs) {
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
      // A member of another listed impl referenced by identifier → nesting.
      if (listedNames.has(name)) {
        context.report({ node, messageId: 'noNesting', data: { name } });
        return;
      }
      context.report({ node, messageId: 'freeIdentifier', data: { name } });
    },
    onTypeArg(node, insidePrimitiveCall) {
      // A type parameter used anywhere but a primitive call's type-arg position.
      const names = collectTypeRefs(node);
      for (const { name, node: ref } of names) {
        if (typeParams.has(name) && !insidePrimitiveCall) {
          context.report({ node: ref, messageId: 'typeParamPosition', data: { name } });
        }
      }
    },
    onNestedMember(node, name) {
      context.report({ node, messageId: 'noNesting', data: { name } });
    },
    primitiveLocals,
    listedMembers,
  });

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
  const visit = (node, insidePrimitiveArgs) => {
    if (!node || typeof node.type !== 'string') {
      return;
    }
    if (BANNED[node.type]) {
      cb.onBanned(node, BANNED[node.type]);
      // Keep walking to surface nested issues too.
    }

    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const isPrimitive = callee.type === 'Identifier' && cb.primitiveLocals.has(callee.name);
      // A this.<member> call to another listed member is nesting (unless it is
      // the primitive-form call, which the stage handles).
      if (callee.type === 'MemberExpression' && callee.object.type === 'ThisExpression'
        && callee.property.type === 'Identifier' && cb.listedMembers.has(callee.property.name))
      {
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
      // Callee: skip a primitive callee identifier (it is a primitive ref, fine);
      // otherwise walk it.
      if (!(callee.type === 'Identifier' && isPrimitive)) {
        visit(callee, insidePrimitiveArgs);
      }
      for (const arg of node.arguments) {
        visit(arg, insidePrimitiveArgs || isPrimitive);
      }
      return;
    }

    if (node.type === 'MemberExpression') {
      visit(node.object, insidePrimitiveArgs);
      if (node.computed) {
        visit(node.property, insidePrimitiveArgs);
      }
      return;
    }

    if (node.type === 'Identifier') {
      cb.onIdentifier(node, insidePrimitiveArgs);
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
