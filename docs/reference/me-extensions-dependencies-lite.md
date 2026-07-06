# ME.* dependency map — lite (skeleton)

The same graph as [`me-extensions-dependencies.md`](me-extensions-dependencies.md) with the
concrete **provider / sink / impl leaves** dropped — the architectural skeleton only.

Omitted: Configuration.{CommandLine, EnvironmentVariables, Json, Ini, Xml, UserSecrets,
FileExtensions}, Logging.{Console, Debug, EventLog, EventSource, TraceSource},
FileProviders.{Physical, Composite}, Caching.Memory (and external FileSystemGlobbing).
Kept: each family's core + `.Abstractions`, the Configuration binder, and the cross-family
bridges (Options.ConfigurationExtensions, Logging.Configuration).

```mermaid
graph LR
  classDef abs fill:#e6f0ff,stroke:#4a80d0,color:#12233f;
  classDef leaf fill:#f3f3f3,stroke:#999,color:#333;

  Prim[Primitives]:::leaf

  subgraph DI[DependencyInjection]
    DIAbs[DI.Abstractions]:::abs
    DIx[DependencyInjection]
  end
  subgraph OPT[Options]
    Opt[Options]
    OptCfg[Options.ConfigurationExtensions]
  end
  subgraph CFG[Configuration]
    CfgAbs[Configuration.Abstractions]:::abs
    Cfg[Configuration]
    CfgBind[Configuration.Binder]
  end
  subgraph LOG[Logging]
    LogAbs[Logging.Abstractions]:::abs
    Log[Logging]
    LogCfg[Logging.Configuration]
  end
  subgraph DIAG[Diagnostics]
    DiagAbs[Diagnostics.Abstractions]:::abs
    Diag[Diagnostics]
  end
  FPAbs[FileProviders.Abstractions]:::abs
  CacheAbs[Caching.Abstractions]:::abs
  subgraph HOST[Hosting]
    HostAbs[Hosting.Abstractions]:::abs
    Host[Hosting]
  end
  Http[Http]

  CfgAbs --> Prim
  Cfg --> CfgAbs & Prim
  CfgBind --> Cfg & CfgAbs

  DIx --> DIAbs

  Opt --> DIAbs & Prim
  OptCfg --> Opt & CfgBind & CfgAbs & DIAbs & Prim

  LogAbs --> DIAbs
  Log --> DIAbs
  LogCfg --> Log & CfgBind & Cfg & CfgAbs & DIAbs & LogAbs & Opt

  DiagAbs --> DIAbs & Opt
  Diag --> Cfg & OptCfg & DiagAbs

  FPAbs --> Prim
  CacheAbs --> Prim

  HostAbs --> CfgAbs & DIAbs & DiagAbs & FPAbs & LogAbs
  Host --> Cfg & CfgBind & DIx & Diag & Log & LogCfg & CfgAbs & DIAbs & FPAbs & HostAbs & LogAbs & Opt

  Http --> Log & Diag & CfgAbs & DIAbs & LogAbs & Opt
```

See the full map for the provider edges and the complete adjacency list.
