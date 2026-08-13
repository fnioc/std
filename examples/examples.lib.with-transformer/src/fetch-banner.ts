import type { IBanner } from '@rhombus-std/examples.contracts';

/**
 * Simulates an async banner fetch — the source of this library's
 * `Promise<IBanner>` registration. Nothing registers a bare `IBanner`; an app
 * reaches the banner by awaiting what `getRequiredService` hands back for the
 * `Promise<IBanner>` token.
 */
export async function fetchBanner(): Promise<IBanner> {
  await Promise.resolve(); // stand-in for a real network round-trip
  return { text: '== @rhombus-std interop demo ==' };
}
