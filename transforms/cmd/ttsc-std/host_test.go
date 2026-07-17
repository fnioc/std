package main

import (
	"bytes"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

func stageNames(stages []stageDef) []string {
	names := make([]string, len(stages))
	for i, s := range stages {
		names[i] = s.name
	}
	return names
}

func TestSelectStagesCanonicalOrderRegardlessOfManifestOrder(t *testing.T) {
	// Manifest lists the stages out of order (and inline LAST); selection must
	// still run in the hardcoded canonical order inline -> nameof -> di ->
	// di-options -> config. inline running first is load-bearing: it substitutes
	// sugar bodies before any primitive stage (nameof especially) runs, so the
	// synthetic nameof calls it mints are in place for the nameof handoff.
	entries := []pluginEntry{
		{Name: stagePrefix + "config"},
		{Name: stagePrefix + "di_options"},
		{Name: stagePrefix + "nameof"},
		{Name: stagePrefix + "di"},
		{Name: stagePrefix + "inline"},
	}
	got, err := selectStages(entries, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{
		stagePrefix + "inline",
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

func TestSelectStagesInlinePrecedesDi(t *testing.T) {
	// A consumer selecting only inline + di (manifest order di-then-inline): the
	// inline stage must still be emitted before the di stage, since its output is
	// what di lowers.
	got, err := selectStages([]pluginEntry{{Name: stagePrefix + "di"}, {Name: stagePrefix + "inline"}}, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	names := stageNames(got)
	want := []string{stagePrefix + "inline", stagePrefix + "di"}
	if len(names) != len(want) || names[0] != want[0] || names[1] != want[1] {
		t.Fatalf("inline+di selection = %v, want %v (inline first)", names, want)
	}
}

// TestRunTransformZeroStagesIsHardError is owner task #2's guard: a run with no
// rhombusstd_* stage selected and no linked plugins must fail loud (NO_STAGES)
// BEFORE loading the program — proven here by the bogus tsconfig never being
// read (no config-diagnostic in the output, just the NO_STAGES line).
func TestRunTransformZeroStagesIsHardError(t *testing.T) {
	// Force an empty linked manifest so the guard's second condition holds
	// regardless of the ambient environment.
	t.Setenv(driver.LinkedPluginsEnv, "")
	var errBuf, outBuf bytes.Buffer
	restore := swapStreams(&outBuf, &errBuf)
	defer restore()

	code := runTransform([]string{"--tsconfig=/nonexistent/tsconfig.json", "--plugins-json", "[]"})
	if code != 2 {
		t.Fatalf("zero-stage run exit = %d, want 2\nstderr: %s", code, errBuf.String())
	}
	if !contains(errBuf.String(), "NO_STAGES") {
		t.Fatalf("stderr does not mention NO_STAGES: %q", errBuf.String())
	}
}

// TestRunTransformLinkedOnlyIsNotZeroStages confirms the guard does NOT fire when
// a linked plugin is present even though no rhombusstd_* stage was selected: the
// run proceeds past the guard (and then fails elsewhere on the bogus tsconfig),
// so whatever error appears, it is not NO_STAGES.
func TestRunTransformLinkedOnlyIsNotZeroStages(t *testing.T) {
	t.Setenv(driver.LinkedPluginsEnv, `[{"name":"@ttsc/banner"}]`)
	var errBuf, outBuf bytes.Buffer
	restore := swapStreams(&outBuf, &errBuf)
	defer restore()

	code := runTransform([]string{
		"--tsconfig=/nonexistent/tsconfig.json",
		"--plugins-json", `[{"name":"@ttsc/banner"}]`,
	})
	// It fails (bogus tsconfig), but the failure is not the zero-stage guard.
	if code == 0 {
		t.Fatalf("expected a non-zero exit against a bogus tsconfig, got 0")
	}
	if contains(errBuf.String(), "NO_STAGES") {
		t.Fatalf("NO_STAGES fired even though a linked plugin was present: %q", errBuf.String())
	}
}

// swapStreams redirects the package-level stdout/stderr writers to the given
// buffers and returns a restore func. runTransform writes exclusively through
// these package vars, so this captures everything it emits.
func swapStreams(out, err *bytes.Buffer) func() {
	prevOut, prevErr := stdout, stderr
	stdout, stderr = out, err
	return func() { stdout, stderr = prevOut, prevErr }
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
