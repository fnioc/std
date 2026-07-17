package main

import "testing"

func stageNames(stages []stageDef) []string {
	names := make([]string, len(stages))
	for i, s := range stages {
		names[i] = s.name
	}
	return names
}

func TestSelectStagesCanonicalOrderRegardlessOfManifestOrder(t *testing.T) {
	// Manifest lists config before nameof; selection must still run in the
	// hardcoded canonical order nameof -> di -> di-options -> config.
	entries := []pluginEntry{
		{Name: stagePrefix + "config"},
		{Name: stagePrefix + "di_options"},
		{Name: stagePrefix + "nameof"},
		{Name: stagePrefix + "di"},
	}
	got, err := selectStages(entries, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{
		stagePrefix + "nameof",
		stagePrefix + "di",
		stagePrefix + "di_options",
		stagePrefix + "config",
	}
	names := stageNames(got)
	if len(names) != len(want) {
		t.Fatalf("got %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("got %v, want %v", names, want)
		}
	}
}

func TestSelectStagesScopesToDeclaredStages(t *testing.T) {
	// A nameof-only consumer activates ONLY the nameof stage — di must not run.
	got, err := selectStages([]pluginEntry{{Name: stagePrefix + "nameof"}}, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if names := stageNames(got); len(names) != 1 || names[0] != stagePrefix+"nameof" {
		t.Fatalf("nameof-only selection = %v, want [%q]", names, stagePrefix+"nameof")
	}
}

func TestSelectStagesUnknownStageIsHardError(t *testing.T) {
	_, err := selectStages([]pluginEntry{{Name: stagePrefix + "bogus"}}, nil)
	if err == nil {
		t.Fatal("expected UNKNOWN_STAGE error, got nil")
	}
	if got := err.Error(); got == "" || !contains(got, "UNKNOWN_STAGE") {
		t.Fatalf("error %q does not mention UNKNOWN_STAGE", got)
	}
}

func TestSelectStagesForeignLinkedEntryIsDeferred(t *testing.T) {
	// A non-prefixed entry present in the linked manifest is left to ttsc's
	// linked machinery, not rejected and not run as one of our stages.
	got, err := selectStages(
		[]pluginEntry{{Name: stagePrefix + "nameof"}, {Name: "@ttsc/banner"}},
		map[string]bool{"@ttsc/banner": true},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if names := stageNames(got); len(names) != 1 || names[0] != stagePrefix+"nameof" {
		t.Fatalf("selection = %v, want just the nameof stage", names)
	}
}

func TestSelectStagesForeignUnlinkedEntryIsHardError(t *testing.T) {
	_, err := selectStages([]pluginEntry{{Name: "@ttsc/banner"}}, nil)
	if err == nil {
		t.Fatal("expected a hard error for an unlinked foreign plugin, got nil")
	}
	if got := err.Error(); !contains(got, "@ttsc/banner") {
		t.Fatalf("error %q does not name the offending plugin", got)
	}
}

func TestFilterKnownArgsDropsForwardedFlagsKeepsOurs(t *testing.T) {
	// The `build` subcommand token is already stripped by the router. ttsc then
	// forwards --quiet / --emit / --outDir / --tsgo-args, none of which this host
	// defines; they must be dropped while our own flags (inline and
	// space-separated) survive with their values.
	in := []string{
		"--tsconfig=/p/tsconfig.json",
		"--plugins-json", `[{"name":"rhombusstd_nameof"}]`,
		"--cwd=/p",
		"--emit",
		"--outDir=/p/dist",
		"--quiet",
		"--tsgo-args=[\"--x\"]",
	}
	got := filterKnownArgs(in)
	want := []string{
		"--tsconfig=/p/tsconfig.json",
		"--plugins-json", `[{"name":"rhombusstd_nameof"}]`,
		"--cwd=/p",
	}
	if len(got) != len(want) {
		t.Fatalf("filterKnownArgs = %q, want %q", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("filterKnownArgs = %q, want %q", got, want)
		}
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
