import type { ServiceProvider } from "./service-provider";

/** A running application host: the root object owning the service container and its lifetime. */
export interface IHost extends Disposable {
  readonly services: ServiceProvider;
  start(cancellationToken?: AbortSignal): Promise<void>;
  stop(cancellationToken?: AbortSignal): Promise<void>;
}
