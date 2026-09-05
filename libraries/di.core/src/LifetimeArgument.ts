/** Lets the lifetime argument be omitted entirely when `undefined` is in the vocabulary. */
export type LifetimeArgument<Lifetime> = undefined extends Lifetime ? [lifetime?: Lifetime] : [lifetime: Lifetime];
