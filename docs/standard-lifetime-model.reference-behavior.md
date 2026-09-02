# The standard lifetime model — reference behavior

This is the observable behavior of Microsoft.Extensions.DependencyInjection that the standard
lifetime model clones. Every claim below cites the source file (relative to `src/libraries/`),
the class and member responsible, and — where one exists — the specification test method that
asserts it. Where the code and a test disagree with common assumptions about
Microsoft.Extensions.DependencyInjection, the code and tests below are what was actually read.

## 1. The three lifetimes

### What gets cached, where, and keyed by what

Every registration compiles to a `ServiceCallSite` (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceCallSite.cs`).
A call site carries a `ResultCache` (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ResultCache.cs`)
built from the descriptor's `ServiceLifetime`:

| `ServiceLifetime` | `ResultCache.Location`                | instance cache                                                            |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `Singleton`       | `CallSiteResultCacheLocation.Root`    | on the call site itself (`ServiceCallSite.Value`)                         |
| `Scoped`          | `CallSiteResultCacheLocation.Scope`   | `ServiceProviderEngineScope.ResolvedServices`, keyed by `ServiceCacheKey` |
| `Transient`       | `CallSiteResultCacheLocation.Dispose` | not cached — only captured for disposal                                   |

(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ResultCache.cs`, the
three-argument constructor; `Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteResultCacheLocation.cs`.)

The call site _tree_ itself is a third, orthogonal cache: `CallSiteFactory` keeps a
`ConcurrentDictionary<ServiceCacheKey, ServiceCallSite>` (`_callSiteCache`) so a given
`(ServiceIdentifier, slot)` is compiled once and reused by every provider and every scope that
share the same `CallSiteFactory` — one call site tree serves the root and every scope opened
from it (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteFactory.cs`,
`CreateExact`/`CreateOpenGeneric`/`TryCreateEnumerable`). What differs per scope is only where
the _resolved instance_ is cached, per the table above.

`ServiceIdentifier` is `(ServiceKey, ServiceType)` (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceIdentifier.cs`);
`ServiceCacheKey` adds a `Slot` — a reverse index used when several descriptors share one
service type (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceCacheKey.cs`).
The provider's own dictionary of built accessors, `ServiceProvider._serviceAccessors`, is keyed
by plain `ServiceIdentifier` and always resolves to the call site with `Slot == 0` — the last
registration.

### Several registrations of one service type — the last-wins rule

`CallSiteFactory` keeps every descriptor for a `ServiceIdentifier` in a
`ServiceDescriptorCacheItem` (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteFactory.cs`,
nested `struct ServiceDescriptorCacheItem`). `.Last` returns the most recently added descriptor,
and `TryCreateExact(ServiceIdentifier, CallSiteChain)` resolves single-service requests
(`GetService<T>`, constructor parameters, `IServiceProvider.GetService`) against `descriptor.Last`
with `slot == DefaultSlot` (`0`). `GetSlot(descriptor)` numbers slots in _reverse_ registration
order, so the last-registered descriptor always gets slot `0`:

```csharp
public int GetSlot(ServiceDescriptor descriptor)
{
    if (descriptor == _item) { return Count - 1; }
    if (_items != null)
    {
        int index = _items.IndexOf(descriptor);
        if (index != -1) { return _items.Count - (index + 1); }
    }
    throw new InvalidOperationException(SR.ServiceDescriptorNotExist);
}
```

Asserted by `LastServiceReplacesPreviousServices`
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/DependencyInjectionSpecificationTests.cs`).
This applies per lifetime combination too: `GetService_DoesNotThrow_WhenGetServiceForServiceWithMultipleImplementationScopesWhereLastIsNotScoped`
and `GetService_Throws_WhenGetServiceForServiceWithMultipleImplementationScopesWhereLastIsScoped`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderValidationTests.cs`) show
single-service resolution only ever looks at the last registration's lifetime, regardless of the
lifetimes of earlier registrations for the same type.

### `IEnumerable<T>` resolution — each element honors its own lifetime

`IEnumerable<T>` is never registered; `CallSiteFactory.TryCreateEnumerable` synthesizes an
`IEnumerableCallSite` (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/IEnumerableCallSite.cs`)
whose `ServiceCallSites` array holds one call site per matching descriptor, in registration
order, each keeping its own `ResultCache` location from its own lifetime
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteFactory.cs`, `TryCreateEnumerable`
comment: _"Last service will get slot 0"_ — slots run in the same reverse order as above, so
`GetService<T>` (slot 0) and the last element of `GetServices<T>()` are the same call site and
therefore the same cached instance). The `IEnumerableCallSite`'s own cache location is the
_widest_ of its elements' locations (`GetCommonCacheLocation`, `Math.Max` over the
`CallSiteResultCacheLocation` enum, whose declaration order is `Root < Scope < Dispose < None`) —
so an enumerable that mixes a scoped and a singleton element is itself cached at `Scope`
(rebuilt once per scope, not once per resolution, but never promoted to the root cache).

Asserted by `MultipleServiceCanBeIEnumerableResolved`, `RegistrationOrderIsPreservedWhenServicesAreIEnumerableResolved`,
`ResolvesDifferentInstancesForServiceWhenResolvingEnumerable` (each element is a distinct
instance, and the last element equals the single-resolution instance)
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/DependencyInjectionSpecificationTests.cs`).
`GenericIEnumerableItemCachedInTheRightSlot`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`) covers
the slot assignment for mixed open/closed generic elements.

### Singleton and scoped creation under concurrency

Two independent locks are involved:

1. **Call-site–tree lock.** `CallSiteFactory.CreateCallSite` takes a per-`ServiceIdentifier` lock
   (`_callSiteLocks`, a `ConcurrentDictionary<ServiceIdentifier, object>`) before building and
   caching a call site tree, so two threads resolving the same type concurrently see the exact
   same call site instances for every shared dependency
   (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteFactory.cs`, comment:
   _"This is to make sure we can safely store singleton values on the callsites themselves"_).
2. **Instance-creation lock.** `CallSiteRuntimeResolver.VisitRootCache` locks the call site itself
   (`lock (callSite)`) before checking and setting `callSite.Value`; `VisitScopeCache` /
   `VisitCache` locks `serviceProviderEngineScope.Sync` (which is `ResolvedServices`, the same
   dictionary the cache lives in) before checking and inserting into
   `ResolvedServices`. Both locks double-check the cache after acquiring the lock, so exactly one
   thread runs the constructor/factory; every other thread blocks and then observes the cached
   result (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteRuntimeResolver.cs`,
   `VisitRootCache` and `VisitCache`). A `RuntimeResolverContext.AcquiredLocks` flags value is
   threaded through recursive visits so a thread already holding the scope or root lock does not
   try to re-acquire it resolving a nested dependency of the same kind — this is what lets a
   singleton that depends on another singleton avoid deadlocking itself.
3. **Circular-dependency guard.** Within `VisitRootCache`, a `[ThreadStatic] HashSet<ServiceCallSite> t_resolving`
   detects a call site being resolved again on the _same thread_ while its lock is held (which
   would otherwise deadlock against itself) and throws `InvalidOperationException` with the
   `CircularDependencyException` message instead.

Asserted by `GetRequiredService_ResolvingSameSingletonInTwoThreads_SameServiceReturned` (the
`InnerSingleton` fake's constructor asserts, via two `ManualResetEvent`s, that it is entered
exactly once even when two threads race to resolve it) and
`GetRequiredService_UsesSingletonAndLazyLocks_NoDeadlock`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`).

### Creation failure — never cached, always retried

Nothing in `VisitRootCache` or `VisitCache` writes to `callSite.Value` or `ResolvedServices`
until _after_ `VisitCallSiteMain` returns successfully. If the constructor, factory, or a nested
dependency throws, the `finally`-free `lock` block simply propagates the exception and the
lock is released with nothing cached — so the very next resolution attempt reruns construction
from scratch. `RethrowOriginalExceptionFromConstructor`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`)
confirms the original exception (not a wrapped one) surfaces from `GetService`; there is no
specification test that resolves a throwing singleton twice, so the retry-not-cache behavior
above is read directly from `CallSiteRuntimeResolver.VisitRootCache`/`VisitCache`, not asserted
by a test.

## 2. Scopes

### `IServiceScopeFactory.CreateScope()`

`ServiceProvider.CreateScope()` — reached whether the factory was resolved from the root
provider or from within a scope — always does the same thing:

```csharp
internal IServiceScope CreateScope()
{
    if (_disposed) { ThrowHelper.ThrowObjectDisposedException(); }
    return new ServiceProviderEngineScope(this, isRootScope: false);
}
```

(`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`.) The built-in
`IServiceScopeFactory` registration is a `ConstantCallSite` wrapping `Root`
(`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`, constructor:
`CallSiteFactory.Add(..., new ConstantCallSite(typeof(IServiceScopeFactory), Root))`), and
`ServiceProviderEngineScope` itself implements `IServiceScopeFactory` by delegating to
`RootProvider.CreateScope()` (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).
So every scope's `IServiceScopeFactory.CreateScope()` call — whatever scope it was resolved
through — always creates a scope as a direct child of the _same_ `ServiceProvider`, never nested
under the scope that made the call.

### Flatness and independence

Each `ServiceProviderEngineScope` owns its own `ResolvedServices` dictionary and its own
`_disposables` list, constructed fresh in the constructor
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).
Nothing links a scope to the scope that created it; the only shared state across every scope and
the root is the `CallSiteFactory` (the compiled call-site tree) and the root's own singleton
cache. Disposing one scope (root or not) never touches another scope's cache or disposables.

`IServiceScope` exposes exactly one member, `ServiceProvider`
(`Microsoft.Extensions.DependencyInjection.Abstractions/src/IServiceScope.cs`);
`ServiceProviderEngineScope.ServiceProvider => this` — the scope _is_ the `IServiceProvider` it
hands back (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).

Asserted by `ScopesAreFlatNotHierarchical` — disposing an outer scope does not prevent
resolving from an inner scope created from it, because the two share nothing but the
singleton cache — and `NestedScopedServiceCanBeResolved` / `NestedScopedServiceCanBeResolvedWithNoFallbackProvider`
/ `ScopedServices_FromCachedScopeFactory_CanBeResolvedAndDisposed` (nested scopes dispose
independently: the inner scope's disposable is disposed at the inner `using` boundary, the outer
scope's at the outer one)
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/DependencyInjectionSpecificationTests.cs`).

### What `IServiceProvider` resolves to inside a scope

The built-in `IServiceProvider` registration is a `ServiceProviderCallSite`
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderCallSite.cs`), cache
location `None`. `CallSiteRuntimeResolver.VisitServiceProvider` returns `context.Scope` — the
scope that is actually resolving, not a fixed instance — so `GetService<IServiceProvider>()`
called on a scope's provider returns that scope itself, and called on the root returns `Root`.
Asserted by `SelfResolveThenDispose` (root) and, transitively, by every test that stashes
`scope.ServiceProvider` and compares it against what a resolved dependency's injected
`IServiceProvider` turns out to be — e.g. `SingletonServiceCanBeResolvedFromScope`, which shows
a singleton's captured `IServiceProvider` is the _root's_, not any scope's, because the
singleton's call site is only ever built once against `Root`
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/DependencyInjectionSpecificationTests.cs`).

### `IServiceScopeFactory` — identity and lifetime

There is exactly one `IServiceScopeFactory` instance per `ServiceProvider` — `Root` itself,
registered as a constant, so it is singleton-lifetime by construction (a `ConstantCallSite` has
cache location `None`, but there is only ever one `Root` per provider, so `Value` is stable).
Asserted by `ServiceScopeFactoryIsSingleton` — the same instance comes back whether resolved from
the root or from a scope
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/DependencyInjectionSpecificationTests.cs`).

### The root as a scope

`ServiceProvider`'s constructor builds `Root = new ServiceProviderEngineScope(this, isRootScope: true)`
before anything else, specifically so the engine can depend on `Root` while it is still being
constructed (`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`, comment: _"note
that Root needs to be set before calling GetEngine()"_). `IsRootScope` is a plain `bool` recorded
at construction (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).
Root's `ResolvedServices` dictionary is never used for singletons — those live on the call site's
own `Value` — but _is_ used if a scoped service is resolved from the root while `ValidateScopes`
is off: `CallSiteRuntimeResolver.VisitScopeCache` checks `context.Scope.IsRootScope` and, if true,
runs the scoped call site through `VisitRootCache` instead — i.e. **an unvalidated scoped
resolution from the root is silently promoted to the singleton cache**, shared by the whole
provider forever after. This is exactly the hole `ValidateScopes` closes (§4).

### Disposal of the root vs. open scopes

`ServiceProvider.Dispose()` / `DisposeAsync()` call `DisposeCore()` (sets `_disposed = true`) and
then dispose `Root` (`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`).
Conversely, `ServiceProviderEngineScope.BeginDispose()` — reached from either `Dispose()` or
`DisposeAsync()` — checks `IsRootScope && !RootProvider.IsDisposed()` and, if true, calls
`RootProvider.Dispose()` **before** disposing its own tracked instances
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`,
comment: _"if this ServiceProviderEngineScope instance is a root scope, disposing this instance
will need to dispose the RootProvider too... if the RootProvider get disposed first, it will
automatically dispose all attached ServiceProviderEngineScope objects"_). So disposing either the
`ServiceProvider` or its `Root` scope disposes the other — they are two references into one
disposal, guarded so it only actually runs once (`_disposed` on each side). Disposing a
_non-root_ scope disposes only that scope.

### Behavior after the root is disposed

| Operation                                                               | Result                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `provider.GetService(...)` on the disposed root                         | `ObjectDisposedException` — `ServiceProvider.GetService` checks `_disposed` first (`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`)                          |
| `provider.CreateScope()` on the disposed root                           | `ObjectDisposedException` — same check in `ServiceProvider.CreateScope`                                                                                                        |
| resolving from a scope that was already open when the root was disposed | `ObjectDisposedException` — `ServiceProviderEngineScope.GetService` checks its own `_disposed`, and disposing the root disposes every attached scope (root propagation, above) |

The thrown type is always `ObjectDisposedException`, constructed with `nameof(IServiceProvider)`
as the object name (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ThrowHelper.cs`,
`ThrowObjectDisposedException`) — the message names `IServiceProvider` regardless of whether the
disposed instance was the root, a scope, or the `ServiceProvider` itself.

Asserted by `RootProviderDispose_PreventsServiceResolution`, `RootProviderDispose_PreventsScopeCreation`,
`RootProviderDispose_PreventsServiceResolution_InChildScope`, `ScopeDispose_PreventsServiceResolution`
(which also asserts the root itself is still usable — `provider.CreateScope()` still succeeds —
after only a _child_ scope was disposed)
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`), and
`RootEngineScopeDisposeTest`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderEngineScopeTests.cs`).

## 3. Disposal

### What gets tracked

`ServiceProviderEngineScope.CaptureDisposable(object? service)` is the single funnel: it skips
capture only when `service` is the scope itself (`ReferenceEquals(this, service)` — prevents a
scope capturing the `IServiceProvider`/`IServiceScope` it handed out as if it were a plain
disposable) or when `service` is neither `IDisposable` nor `IAsyncDisposable`. Everything else
resolved through the runtime resolver is captured — this funnel runs for constructor-activated
instances (`VisitConstructor` → whichever cache visitor called it), factory-created instances
(`FactoryCallSite` has `ImplementationType == null`, so `ServiceCallSite.CaptureDisposable` is
statically `true` for every factory registration regardless of what the factory actually
returns), and open/closed-generic constructed instances alike
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`,
`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceCallSite.cs`).

**A pre-built instance (`AddSingleton(instance)`) is never captured.** Its call site is a
`ConstantCallSite`, resolved by `CallSiteRuntimeResolver.VisitConstant`, which returns
`constantCallSite.DefaultValue` directly with no call to `CaptureDisposable` anywhere in that
path (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteRuntimeResolver.cs`).
Asserted by `SingletonServiceCreatedFromInstanceIsNotDisposedWhenContainerIsDisposed`, contrasted
with `SingletonServiceCreatedFromFactoryIsDisposedWhenContainerIsDisposed`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`), and
by `DoesNotDisposeSingletonInstances`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`).

### Which scope owns a transient's disposal

A transient's `ResultCache.Location` is `Dispose`; `CallSiteRuntimeResolver.VisitDisposeCache`
resolves it via `context.Scope.CaptureDisposable(...)` where `context.Scope` is whichever scope
(root or otherwise) the top-level `GetService` call started from — **not** necessarily the scope
that owns the object being constructed around it. A disposable transient resolved directly from
the root is tracked by the root and lives until the root disposes; the same transient resolved
from inside a scope is tracked by that scope and disposed when the scope disposes. Asserted by
`TransientServiceCanBeResolvedFromScope` (distinct instances per call, no lifetime assertion
beyond that) together with `DisposingScopeDisposesService`, which resolves a transient from a
scope and checks it is disposed at scope-exit while a transient resolved from the root beforehand
is only disposed when the root itself is disposed later
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/DependencyInjectionSpecificationTests.cs`).

### Instances created during a resolution that later fails

Capture happens at the moment each individual call site resolves, inside
`VisitDisposeCache`/`VisitCache`/`VisitRootCache`, _before_ control returns to the parent
`VisitConstructor` that is assembling the object graph
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteRuntimeResolver.cs`,
`VisitConstructor` resolves `ParameterCallSites` in a loop, each via `VisitCallSite`, before
invoking the constructor). So if parameter _N_ is a disposable transient that is constructed
successfully but parameter _N+1_ throws (or the enclosing constructor itself throws), parameter
_N_'s instance has already been captured by the resolving scope and will still be disposed when
that scope disposes, even though the overall `GetService` call that was assembling the graph
threw and returned nothing. No specification test constructs this exact case; it follows directly
from the order of operations in `VisitConstructor` and `CaptureDisposable` above.

### Disposal order

Reverse of creation order. `_disposables` is a plain `List<object?>` appended to as each
instance is captured; both `Dispose()` and `DisposeAsync()` walk it `for (i = Count - 1; i >= 0; i--)`
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).
Asserted by `DisposesInReverseOrderOfCreation`
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/DependencyInjectionSpecificationTests.cs`),
which also shows a shared dependency (a singleton injected into several sibling services) is
disposed after every one of its dependents, since the dependency call site resolves — and is
therefore captured — before its dependents' constructors run.

### Deduplication of a shared instance

If one instance was captured more than once (for example a singleton exposed under several
service types via factory forwarding — `services.AddSingleton<IFoo>(sp => sp.GetRequiredService<Impl>())`
registered twice), `BeginDispose` deduplicates `_disposables` by reference before disposing:
a linear reference-equality scan for 16 or fewer entries, a `HashSet<object>(ReferenceEqualityComparer.Instance)`
above that, nulling out every duplicate slot but the first so each shared instance disposes
exactly once and disposal order (reverse-of-first-capture) is preserved
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`,
`DeduplicateDisposables`, `MaxDisposablesForLinearDedup = 16`). Asserted by
`SharedSingletonResolvedAsMultipleServices_IsDisposedOnce`, `SharedSingletonIsDisposedAfterDependents`,
`SharedSingletonWithManyAliases_IsDisposedOnce` (20 aliases, exercising the `HashSet` path), and
`DisposeAsync_SkipsNulledDuplicatesInAsyncContinuation`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderEngineScopeTests.cs`).

### Idempotence of a second dispose

`BeginDispose()` returns `null` immediately if `_disposed` is already `true`; both `Dispose()`
and `DisposeAsync()` treat a `null` result as "nothing to do" and return without touching
anything (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).
Asserted by `DoubleDisposeWorks`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderEngineScopeTests.cs`).

### Sync `Dispose()` on an `IAsyncDisposable`-only instance

Throws `InvalidOperationException` with message
`"'{0}' type only implements IAsyncDisposable. Use DisposeAsync to dispose the container."`
(`Microsoft.Extensions.DependencyInjection/src/Resources/Strings.resx`, key
`AsyncDisposableServiceDispose`; formatted with `TypeNameHelper.GetTypeDisplayName(disposableEntry)`
in `Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`,
`Dispose()`). This is thrown _per instance_, inside the reverse-order disposal loop, and does
not stop the loop — every other tracked instance is still disposed (or attempted), and every
exception raised along the way (this one or any thrown by a disposable's own `Dispose()`) is
collected, not thrown immediately (see next section).

### `DisposeAsync()` over sync-only disposables

No exception, no async-over-sync: `DisposeAsync()`'s loop checks `disposable is IAsyncDisposable`
first and falls back to a plain synchronous `((IDisposable)disposable).Dispose()` call in the
same loop iteration when it isn't (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).
Asserted by `AddDisposablesAndAsyncDisposables_DisposeAsync_AllDisposed`, which mixes
`IDisposable`-only, `IAsyncDisposable`-only, and (optionally) a delayed-async disposable in one
provider and disposes all three via one `DisposeAsync()` call
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`).

### Exception aggregation during disposal

Both `Dispose()` and `DisposeAsync()` collect every exception raised while disposing tracked
instances into a shared accumulator (`AddExceptionToCache`/`CheckExceptionCache`,
`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`): the
first exception is captured via `ExceptionDispatchInfo` (preserving its original stack trace); a
second promotes the accumulator to a `List<Exception>`. After the loop, one exception rethrows
via `ExceptionDispatchInfo.Throw()` (stack trace preserved), two or more throw a plain
`AggregateException` wrapping the list. Every tracked instance is still given a chance to dispose
regardless of earlier failures. Asserted by `Dispose_ServiceThrows_DisposesAllAndThrows` (single
failure → the original `InvalidOperationException`, not wrapped) and
`Dispose_TwoServicesThrows_DisposesAllAndThrowsAggregateException` (two failures →
`AggregateException` with both inner exceptions, and every disposable — including the ones that
didn't throw — observed as disposed), mirrored for `DisposeAsync`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderEngineScopeTests.cs`).

### `DisposeAsync()` yielding mid-list

If an `IAsyncDisposable.DisposeAsync()` call does not complete synchronously
(`!vt.IsCompletedSuccessfully`), the loop hands off to a local `static async ValueTask Await(...)`
that awaits the in-flight call with `ConfigureAwait(false)` and then continues the same
reverse-order walk from where it left off, still skipping `null` (deduplicated) slots and still
accumulating exceptions the same way
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`,
`DisposeAsync()` / `Await`). Asserted by `DisposeAsync_SkipsNulledDuplicatesInAsyncContinuation`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderEngineScopeTests.cs`).

### What disposing a scope does to its cache

`_disposed = true` is set, but **`ResolvedServices` itself is never cleared**, by design — the
comment in `BeginDispose` explains a background-compiled delegate (see §"scoped ... after
compilation" tests below) might still be mid-lookup against it, and clearing would risk that
lookup missing a cached singleton and trying to recreate it, which would then throw
`ObjectDisposedException` from deeper in the stack instead of failing predictably at the
`GetService` entry point (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`).
In practice this is moot for a disposed _scope_ because `GetService` refuses to run at all once
`_disposed` is `true` — the dictionary is simply abandoned, not read again.

### Thread-safety of dispose against concurrent resolution

`CaptureDisposable` takes the scope's `Sync` lock, and if `_disposed` is already `true` inside
that lock, it disposes the just-created `service` immediately — synchronously via `Dispose()` if
it is `IDisposable`, otherwise sync-over-async via `Task.Run(() => ((IAsyncDisposable)localService).DisposeAsync().AsTask()).GetAwaiter().GetResult()`
— and then throws `ObjectDisposedException`, so a resolution racing a concurrent dispose never
leaks an undisposed instance and never returns a value to its caller
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/ServiceProviderEngineScope.cs`,
`CaptureDisposable`). Asserted by `GetService_DisposeOnSameThread_Throws`,
`GetService_DisposeOnSameThread_ThrowsAndDoesNotHangAndDisposeGetsCalled`, and
`GetAsyncService_DisposeAsyncOnSameThread_ThrowsAndDoesNotHangAndDisposeAsyncGetsCalled` — all
three dispose the provider from _inside_ the constructor of the object being resolved, and all
three assert the call still throws `ObjectDisposedException` (never hangs) and the resource is
still disposed (`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`).
`Sync` is also the lock `CallSiteRuntimeResolver.VisitCache` takes to check/populate
`ResolvedServices` (§1), so a dispose in progress and a scoped resolution in progress on the same
scope serialize against each other through that same lock object.

## 4. Validation

`ServiceProviderOptions.ValidateScopes` and `ValidateOnBuild` both default to `false`
(`Microsoft.Extensions.DependencyInjection/src/ServiceProviderOptions.cs`); `ServiceProviderOptions.Default`
is a single shared instance with both left at their defaults, used whenever
`BuildServiceProvider()` is called with no options
(`Microsoft.Extensions.DependencyInjection/src/ServiceCollectionContainerBuilderExtensions.cs`).

### `ValidateScopes`

When `true`, `ServiceProvider`'s constructor creates a `CallSiteValidator`
(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteValidator.cs`); when
`false`, `_callSiteValidator` stays `null` and every check below is skipped entirely
(`ServiceProvider.OnCreate`/`OnResolve` no-op when the field is `null`).

Two independent checks, both `InvalidOperationException`, both driven off the _first_ scoped
service found while walking a call site tree depth-first (`CallSiteValidator.VisitCallSite`
caches, per `ServiceCacheKey`, either `null` — no scoped dependency anywhere in the tree — or the
`Type` of the first scoped service found; a `IServiceScopeFactory` dependency is explicitly
exempted in `VisitScopeCache`, since a singleton is allowed to hold a scope factory):

| Situation                                                                                                                                            | Fires at                                                                                              | Exception message                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a scoped service's call-site tree, reached while resolving _any_ service, contains another scoped dependency underneath a singleton in the same tree | call-site _build_ time, in `OnCreate` → `ValidateCallSite`                                            | `Cannot consume {2} service '{0}' from {3} '{1}'.` → e.g. `Cannot consume scoped service 'IBar' from singleton 'IFoo'.` (`SR.ScopedInSingletonException`) |
| a scoped service is resolved directly (`GetService(typeof(IBar))`) while the resolving scope `IsRootScope`                                           | resolution time, in `OnResolve` → `ValidateResolution`, only when `ReferenceEquals(scope, rootScope)` | `Cannot resolve {1} service '{0}' from root provider.` (`SR.DirectScopedResolvedFromRootException`)                                                       |
| a _non_-scoped service is resolved from the root, but its call-site tree contains a scoped dependency                                                | same as above, same method, different branch (service type ≠ the scoped type found)                   | `Cannot resolve '{0}' from root provider because it requires {2} service '{1}'.` (`SR.ScopedResolvedFromRootException`)                                   |

(`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteValidator.cs`;
`{2}`/`{3}` are always the lowercased lifetime name, `"scoped"`/`"singleton"`.) The captive
check (row 1) fires whether the scoped dependency is reached directly as a constructor
parameter, through an intermediate transient, or through an intermediate singleton — asserted by
`GetService_Throws_WhenScopedIsInjectedIntoSingleton`,
`GetService_Throws_WhenScopedIsInjectedIntoSingletonThroughTransient`,
`GetService_Throws_WhenScopedIsInjectedIntoSingletonThroughSingleton`, and (while inside an open
scope) `GetService_Throws_WhenScopedIsInjectedIntoSingletonThroughSingletonAndScopedWhileInScope`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderValidationTests.cs`). The
root-resolution checks (rows 2–3) fire only when the resolving scope actually is the root — the
same scoped service resolved from an _opened_ scope never triggers them, only the captive check
can (asserted by `GetService_Throws_WhenGetServiceForScopedServiceIsCalledOnRoot`,
`GetService_Throws_WhenGetServiceForScopedServiceIsCalledOnRootViaTransient`). Row 2 vs. row 3 is
decided purely by whether the resolved service type equals the first scoped type found
(`CallSiteValidator.ValidateResolution`, `if (serviceType == scopedService)`).

`ValidateResolution` runs on **every** `GetService` call (`ServiceProvider.OnResolve`, called
unconditionally from `ServiceProvider.GetService`), not just the first — asserted by
`GetService_Throws_WhenGetServiceForScopedServiceIsCalledOnRoot_IL_Replacement`, which forces the
dynamic engine to switch from the interpreted path to the compiled (IL-emit) path mid-test and
re-asserts the same exception fires afterward. `ValidateCallSite` (the tree walk that finds the
first scoped type) runs once per call site, the first time it is built, and is cached from then
on by `_scopedServices` inside `CallSiteValidator` — so the _walk_ is one-time work, but the
_root-scope check_ against that cached result happens on every resolution.

Last-wins interacts with `ValidateScopes` exactly as with everything else:
`GetService_DoesNotThrow_WhenGetServiceForPolymorphicServiceIsCalledOnRoot_AndTheLastOneIsNotScoped`
and (the reverse) `GetService_Throws_WhenGetServiceForServiceWithMultipleImplementationScopesWhereLastIsScoped`
show the check only ever looks at the _last_ registration for a service type; an `IEnumerable<T>`
resolution is validated per-element instead, so a mix where only some elements are scoped throws
only when actually walking the scoped elements —
`ScopeValidation_ShouldBeAbleToDistingushGenericCollections_WhenGetServiceIsCalledOnRoot`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderValidationTests.cs`).

`ValidateScopes` does not affect keyed resolution beyond the same lifetime checks applying to
keyed descriptors too (§6); it does, notably, still let a scope factory be injected into a
singleton (`GetService_DoesNotThrow_WhenScopeFactoryIsInjectedIntoSingleton`,
`BuildServiceProvider_ValidateOnBuild_DoesNotThrow_WhenScopeFactoryIsInjectedIntoSingleton`).

### `ValidateOnBuild`

Runs once, synchronously, inside the `ServiceProvider` constructor, after the built-in services
are registered and after `_callSiteValidator` is created (so `ValidateOnBuild` always implies
whatever `ValidateScopes` would have caught is caught too, if both are `true`):

```csharp
if (options.ValidateOnBuild)
{
    List<Exception>? exceptions = null;
    foreach (ServiceDescriptor serviceDescriptor in serviceDescriptors)
    {
        try { ValidateService(serviceDescriptor); }
        catch (Exception e) { exceptions ??= new(); exceptions.Add(e); }
    }
    if (exceptions != null)
        throw new AggregateException("Some services are not able to be constructed", exceptions.ToArray());
}
```

(`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`.) `ValidateService` skips a
descriptor entirely — no call site is built, no exception possible — when its `ServiceType` is
an _open_ generic type definition (`IsGenericType && !IsConstructedGenericType`); every other
descriptor, including a pre-built instance or a factory, is validated by asking
`CallSiteFactory.GetCallSite(descriptor, new CallSiteChain())` for that exact descriptor's call
site (bypassing the exact/open-generic/enumerable dispatch used for ordinary resolution) and then
running it through `OnCreate` (the same `ValidateCallSite` used by `ValidateScopes`, if enabled).
A pre-built instance is therefore still checked for assignability (its `ConstantCallSite`
constructor throws `ArgumentException` if the instance isn't an instance of the service type) but
can never trip a captive-dependency check, since it has no children to walk. Any exception raised
while building or validating one descriptor's call site is caught and re-wrapped:

```csharp
throw new InvalidOperationException($"Error while validating the service descriptor '{descriptor}': {e.Message}", e);
```

(`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`, `ValidateService`), where
`{descriptor}` is `ServiceDescriptor.ToString()` — `ServiceType: {type} Lifetime: {lifetime} ImplementationType|ImplementationFactory|ImplementationInstance: {value}`
(`Microsoft.Extensions.DependencyInjection.Abstractions/src/ServiceDescriptor.cs`). Every
descriptor is attempted independently — one throwing does not stop the others from being checked
— and every resulting `InvalidOperationException` is collected into the one `AggregateException`,
in descriptor-registration order, whose own message is always exactly
`"Some services are not able to be constructed"`.

Asserted by: `BuildServiceProvider_ValidateOnBuild_Throws_WhenScopedIsInjectedIntoSingleton` and
its reverse-registration-order twin (same result regardless of registration order — the tree walk
finds the dependency either way); `BuildServiceProvider_ValidateOnBuild_Throws_WhenScopedIsInjectedIntoSingleton_CachedCallSites`
and `BuildServiceProvider_ValidateOnBuild_DoesNotThrow_CachedCallSites` (validating one descriptor
can reuse a call site already cached while validating an earlier one, without that reuse hiding a
problem); `BuildServiceProvider_ValidateOnBuild_ThrowsForUnresolvableServices` (an unresolvable
dependency and a self-referential circular dependency reported as two separate inner exceptions,
each with the underlying `CannotResolveService`/`CircularDependencyException` message);
`BuildServiceProvider_ValidateOnBuild_ValidatesAllDescriptors` (every descriptor for a
multiply-registered service type is validated, not just the last); `BuildServiceProvider_ValidateOnBuild_SkipsOpenGenerics`;
`BuildServiceProvider_ValidateOnBuild_ThrowsWhenImplementationIsNotAssignableToService` (both an
implementation-type mismatch and a pre-built-instance-type mismatch reported, with the exact
`ImplementationTypeCantBeConvertedToServiceType` / `ConstantCantBeConvertedToServiceType`
messages); `BuildServiceProvider_ValidateOnBuild_DoesNotThrow_WhenScopeFactoryIsInjectedIntoSingleton`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderValidationTests.cs`).
`ValidateOnBuild_True_ResolvesConstrainedOpenGeneric` and
`BuildServiceProvider_ValidateOnBuild_DoesNotThrow_WhenKeyedSingletonInstanceAndScopedShareServiceType`
(`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`,
`.../ServiceProviderValidationTests.cs`) round out edge cases (a constrained open generic that
only closes successfully for some type arguments; a keyed singleton instance and an unkeyed
scoped service sharing one service type do not cross-contaminate validation).

## 5. Built-in registered services

Registered once, directly onto `CallSiteFactory`, in the `ServiceProvider` constructor, in this
order (also enumerated by `CallSiteFactory.IsService`, which the constructor's comment says must
be kept in sync with this list):

| Service type                     | Call site                                                                   | Effective lifetime / identity                                                  |
| -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `IServiceProvider`               | `ServiceProviderCallSite()`                                                 | resolves to whichever scope is currently resolving (§2) — not a fixed instance |
| `IServiceScopeFactory`           | `ConstantCallSite(typeof(IServiceScopeFactory), Root)`                      | the one `Root` scope of this provider, forever                                 |
| `IServiceProviderIsService`      | `ConstantCallSite(typeof(IServiceProviderIsService), CallSiteFactory)`      | the one `CallSiteFactory` of this provider                                     |
| `IServiceProviderIsKeyedService` | `ConstantCallSite(typeof(IServiceProviderIsKeyedService), CallSiteFactory)` | same `CallSiteFactory` instance, exposed under its other interface             |

(`Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs`, constructor.)
`CallSiteFactory` itself implements both `IServiceProviderIsService` and
`IServiceProviderIsKeyedService` (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteFactory.cs`).
`IServiceProviderIsService.IsService(Type)` answers `true` for: any explicitly registered
`ServiceIdentifier` (unkeyed) or, for a keyed query, a registration under that exact key or under
`KeyedService.AnyKey`; `IEnumerable<T>` for any `T` (always answers `true`, even with zero
registered elements, since an empty enumerable is still resolvable); a closed generic whose open
generic definition is registered; and the four built-ins above. An _open_ generic type definition
always answers `false` — "querying for an open generic should return false (they aren't
resolvable)" (`Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteFactory.cs`,
`IsService(ServiceIdentifier)`). Asserted by `ExplicitServiceRegisterationWithIsService`,
`OpenGenericsWithIsService`, `ClosedGenericsWithIsService`, `IEnumerableWithIsServiceAlwaysReturnsTrue`,
`BuiltInServicesWithIsServiceReturnsTrue`
(`Microsoft.Extensions.DependencyInjection.Specification.Tests/src/ServiceProviderIsServiceSpecificationTests.cs`).

None of the four built-ins is ever captured for disposal: `IServiceProvider`'s call site returns
the scope itself and `CaptureDisposable` explicitly excludes `ReferenceEquals(this, service)`;
the other three are `ConstantCallSite`s, which never route through `CaptureDisposable` at all
(§3).

## 6. Keyed services

**Not yet ported.** Recorded here only as the shape the standard lifetime model will eventually
need to account for, from `Microsoft.Extensions.DependencyInjection/src/ServiceLookup/CallSiteFactory.cs`
and `Microsoft.Extensions.DependencyInjection.Specification.Tests/src/KeyedDependencyInjectionSpecificationTests.cs`:
a keyed registration's `ServiceIdentifier` includes its key, so caching (singleton `Value` on the
call site, scoped `ResolvedServices` keyed by `ServiceCacheKey`) is keyed by `(key, type)` exactly
like an unkeyed registration is keyed by `(null, type)` — the three lifetimes behave identically
per key, independently across keys (`ResolveKeyedSingletonFromScopeServiceProvider`,
`ResolveKeyedScopedFromScopeServiceProvider`, `ResolveKeyedTransientFromScopeServiceProvider`: a
keyed singleton is shared across scopes, a keyed scoped service is one instance per scope, a
keyed transient is a new instance every call — all exactly as for the unkeyed case). A
`KeyedService.AnyKey` registration is a catch-all resolved only through `GetKeyedService`/
`GetRequiredKeyedService` with an explicit key, never through the unkeyed `GetService`, and
querying `GetKeyedService` with `serviceKey == KeyedService.AnyKey` itself throws
`InvalidOperationException` unless the requested type is `IEnumerable<T>`
(`KeyedServiceAnyKeyUsedToResolveService`, thrown from `ServiceProvider.GetKeyedService`/`GetRequiredKeyedService`).

## 7. Other behavior the specification tests assert

Swept from every file under `Microsoft.Extensions.DependencyInjection.Specification.Tests/src/`
and `Microsoft.Extensions.DependencyInjection/tests/DI.Tests/`; only the items with lifetime,
scope, disposal, or validation content not already covered above are listed.

- **`ScopesAreFlatNotHierarchical` / `NestedScopedServiceCanBeResolvedWithNoFallbackProvider`** —
  covered in §2; restated here as confirmation there is no "parent scope" fallback lookup
  anywhere in the resolution path.
- **`WorksWithWideScopedTrees`** (`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`)
  — a scoped service with many sibling scoped dependencies resolves correctly; exercises breadth
  in the call-site tree rather than a new behavior.
- **`ScopedServiceResolvedFromSingletonAfterCompilation` / `...2` / `...3`**
  (`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`) —
  the dynamic engine may recompile a call site's realized delegate on a background thread after
  enough resolutions; these assert that once recompiled, the scoped/singleton cache identity
  observed by callers is unchanged (same instance before and after the swap). This is an
  implementation detail of the compiled engines, not of the lifetime model itself, but it means
  an implementer must not assume a "realized" resolver function is created only once per call
  site.
- **`SafelyDisposeNestedProviderReferences`** — a transient that itself holds a reference to the
  `IServiceProvider` it was resolved from can be disposed directly by the caller without special
  handling; unrelated to container-driven disposal ordering.
- **`ResolveKeyedServiceWithKeyedParameter_MissingRegistrationButWithUnkeyedService`** — an
  unkeyed registration is never used to satisfy a keyed dependency, even when no keyed
  registration exists (keyed and unkeyed lookups never cross), asserted through
  `ValidateOnBuild`'s aggregation reporting the missing keyed dependency by name.
- **`InvalidConstrainedOpenGenericIsSkippedInEnumerableButThrowsInSingleResolution`**
  (`Microsoft.Extensions.DependencyInjection/tests/DI.Tests/ServiceProviderContainerTests.cs`) —
  when the last registration for a service type is an open generic whose constraints the
  requested closed type violates, `IEnumerable<T>` resolution silently omits it while single-service
  resolution (`GetService`) throws `ArgumentException` — not a lifetime distinction, but relevant
  wherever last-wins semantics (§1) meet open generics.
