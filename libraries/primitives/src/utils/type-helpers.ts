/** {@link Omit} applied per union member — plain `Omit` keeps only the union's common keys. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
