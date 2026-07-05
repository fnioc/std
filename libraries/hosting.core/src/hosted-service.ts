/** A unit of work managed by the host's lifetime -- started and stopped alongside it. */
export interface IHostedService {
  start(cancellationToken: AbortSignal): Promise<void>;
  stop(cancellationToken: AbortSignal): Promise<void>;
}
