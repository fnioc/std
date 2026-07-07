// The one case-fold direction used everywhere a configuration key needs
// case-insensitive comparison (the provider store, the root's child-key
// dedup, and the key comparer's ordinal compare) -- sharing a single helper
// means the fold can never drift to the opposite direction in one spot.
export function foldKey(key: string): string {
  return key.toLowerCase();
}
