// Lives here rather than in `di.core` so the augmentation registry
// (`augmentation-registry.ts`) can key its bags on it without a di.core
// dependency. `di.core` re-exports this type unchanged, so every consumer
// that imports `Token` from `@rhombus-std/di.core` keeps working.

/**
 * A stable string identifying an interface — the DI key AND the augmentation
 * registry key.
 */
export type Token = string;
