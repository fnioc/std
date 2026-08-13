// Throwaway smoke exercise for the v1 engine — run with `bun smoke.ts`; not part of any gate.
import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest, ServiceDescriptor, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

function check(label: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`ok — ${label}`);
}

const CONFIG = Type.named('Config', 'app');
const FOO = Type.named('Foo', 'app');
const BAR = Type.named('Bar', 'app');
const CONN = Type.named('Conn', 'app');
const WIDGET = Type.named('Widget', 'app');
const HOLDER = Type.named('Holder', 'app');
const SP_TYPE = Type.named('IServiceProvider', '@rhombus-std/primitives');

class Foo {}
class Bar {
  constructor(readonly foo: Foo, readonly mode: unknown) {}
}
class Conn {}
class Widget {
  constructor(readonly conn: Conn, readonly foo: Foo) {}
}
class Box {
  constructor(readonly inner: unknown) {}
}
class Holder {
  constructor(readonly sp: unknown) {}
}

const manifest = DefaultManifest.empty<string>()
  .addValue(CONFIG, { env: 'dev' })
  // .add(ServiceDescriptor.value(CONFIG, { env: 'dev' }))
  .addClass(Type.stringify(Type.named('Foo', 'app')), Foo, [[]])
  // .add(ServiceDescriptor.ctor(FOO, Foo, [[]]))
  .add(ServiceDescriptor.ctor(BAR, Bar, [[FOO, Type.typeLiteral('fast')]]))
  .add(ServiceDescriptor.ctor(WIDGET, Widget, [[CONN, FOO]]))
  .add(ServiceDescriptor.ctor(Type.named('Box', 'app', [Type.generic('T')]), Box, [[Type.generic('T')]]))
  .add(ServiceDescriptor.ctor(HOLDER, Holder, [[SP_TYPE]]));

const sp = new ServiceProvider(manifest);

const config = sp.resolve(CONFIG);
check('value registration', config.env === 'dev');

const foo = sp.resolve(FOO);
check('ctor with no deps', foo instanceof Foo);
check('transient by default', sp.resolve(FOO) !== foo);

const bar = sp.resolve(BAR) as Bar;
check('ctor deps + literal param', bar.foo instanceof Foo && bar.mode === 'fast');

const pair = sp.resolve(Type.tuple(FOO, Type.typeLiteral(5))) as [Foo, number];
check('tuple resolution', Array.isArray(pair) && pair[0] instanceof Foo && pair[1] === 5);

const viaUnion = sp.resolve(Type.union(Type.named('Missing', 'app'), FOO));
check('union falls to the first satisfiable member', viaUnion instanceof Foo);

const boxed = sp.resolve(Type.named('Box', 'app', [FOO])) as Box;
check('open generic closes against the request', boxed.inner instanceof Foo);

const holder = sp.resolve(HOLDER) as Holder;
check('IServiceProvider injection hands back the resolving provider', holder.sp === sp);

const makeWidget = sp.resolve(Type.func(WIDGET, CONN)) as (conn: Conn) => Widget;
const myConn = new Conn();
const widget = makeWidget(myConn);
check('latebound closure re-enters with call args as values',
  widget instanceof Widget && widget.conn === myConn && widget.foo instanceof Foo);
check('latebound calls are independent', makeWidget(new Conn()).conn !== myConn);

let threw = false;
try {
  sp.resolve(Type.named('Missing', 'app'));
} catch (error) {
  threw = error instanceof UnsatisfiableError;
}
check('unsatisfiable request throws UnsatisfiableError', threw);

const pairFactory = (foo: Foo, bar: Bar) => [foo, bar] as const;
const spF = new ServiceProvider(
  manifest.add(ServiceDescriptor.factory(Type.named('Pair', 'app'), pairFactory, [[FOO, BAR]])),
);
const made = spF.resolve(Type.named('Pair', 'app')) as readonly [Foo, Bar];
check('factory registration with deps', made[0] instanceof Foo && made[1] instanceof Bar);

const spLit = new ServiceProvider(
  DefaultManifest.empty<string>().add(ServiceDescriptor.value(Type.typeLiteral('dev'), 'dev-value')),
);
check('literal registration serves its base type', spLit.resolve(Type.named('string')) === 'dev-value');

const A = Type.named('A', 'app');
const B = Type.named('B', 'app');
const spUnion = new ServiceProvider(
  DefaultManifest.empty<string>().add(ServiceDescriptor.value(Type.union(A, B), 'either')),
);
let unionRejected = false;
try {
  spUnion.resolve(A);
} catch (error) {
  unionRejected = error instanceof UnsatisfiableError;
}
check('union registration cannot serve a lone member', unionRejected);
check('union registration serves the exact union request', spUnion.resolve(Type.union(A, B)) === 'either');

const echoType = Type.func(Type.generic('T'), Type.generic('T'));
const spEcho = new ServiceProvider(
  DefaultManifest.empty<string>().add(ServiceDescriptor.value(echoType, (x: unknown) => x)),
);
const echo = spEcho.resolve(Type.func(FOO, FOO)) as (x: number) => number;
check('open function registration captures through contravariant position', echo(42) === 42);

const spLitOverride = new ServiceProvider(
  DefaultManifest.empty<string>().add(ServiceDescriptor.value(Type.typeLiteral('dev'), 'override')),
);
check('whole-type match beats literal self-satisfaction',
  spLitOverride.resolve(Type.typeLiteral('dev')) === 'override');
check('unregistered literal still self-satisfies', spLitOverride.resolve(Type.typeLiteral('prod')) === 'prod');

const spTuple = new ServiceProvider(
  DefaultManifest.empty<string>().add(ServiceDescriptor.value(Type.tuple(A, B), 'pre-made')),
);
check('whole-type match beats tuple synthesis', spTuple.resolve(Type.tuple(A, B)) === 'pre-made');

const spIter = new ServiceProvider(
  DefaultManifest.empty<string>()
    .add(ServiceDescriptor.value(A, 'a-val'))
    .add(ServiceDescriptor.value(Type.union(A, B), 'either')),
);
const gathered = [...spIter.resolve(Type.iterable(Type.union(A, B)))];
check('iterable collects every matching registration, no union double-count',
  gathered.length === 2 && gathered.includes('a-val') && gathered.includes('either'));

const spIterTuple = new ServiceProvider(
  DefaultManifest.empty<string>()
    .add(ServiceDescriptor.value(A, 'a-val'))
    .add(ServiceDescriptor.value(B, 'b-val'))
    .add(ServiceDescriptor.value(Type.tuple(A, B), 'pre-made')),
);
const tuples = [...spIterTuple.resolve(Type.iterable(Type.tuple(A, B)))];
check('iterable adds the synthesis result alongside registrations', tuples.length === 2 && tuples.includes('pre-made')
  && tuples.some(t => Array.isArray(t) && t[0] === 'a-val' && t[1] === 'b-val'));

const spIterExact = new ServiceProvider(
  DefaultManifest.empty<string>()
    .add(ServiceDescriptor.value(A, 'a-val'))
    .add(ServiceDescriptor.value(Type.iterable(A), 'exact-iter')),
);
check('exact Iterable registration wins outright, never combined',
  spIterExact.resolve(Type.iterable(A)) === 'exact-iter');

const emptyGather = [...sp.resolve(Type.iterable(Type.named('Missing', 'app')))];
check('iterable of nothing is an empty sequence', emptyGather.length === 0);

const STR = Type.named('string');
const spBoth = new ServiceProvider(
  DefaultManifest.empty<string>().add(ServiceDescriptor.value(Type.object({ a: STR, b: STR }), 'both')),
);
check('intersection served by ONE registration satisfying every part',
  spBoth.resolve(Type.intersection(Type.object({ a: STR }), Type.object({ b: STR }))) === 'both');

let intersectionRejected = false;
try {
  spBoth.resolve(Type.intersection(Type.object({ a: STR }), Type.object({ c: STR })));
} catch (error) {
  intersectionRejected = error instanceof UnsatisfiableError;
}
check('intersection with an unsatisfied part is unsatisfiable', intersectionRejected);

console.log('SMOKE PASSED');
