/** {@link Omit} applied per union member — plain `Omit` keeps only the union's common keys. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * `T`, refused outright when it is assignable to `Not` — an assignability veto in a parameter
 * position, where {@link Exclude} could only filter union members.
 */
export type ButNot<T, Not> = T & (T extends Not ? never : unknown);
