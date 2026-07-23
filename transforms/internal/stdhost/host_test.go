package stdhost

import (
	"bytes"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

func stageNames(stages []Stage) []string {
	names := make([]string, len(stages))
	for i, s := range stages {
		names[i] = s.Name
	}
	return names
}

// testHost is the base host every selection/CLI test drives — the same stage
// table cmd/ttsc-std composes.
func testHost() Host {
	return Host{Name: "ttsc-std", Stages: BaseStages(), Bundles: BaseBundles()}
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
	got, err := selectStages(testHost(), entries, nil, nil)
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
	got, err := selectStages(testHost(), []pluginEntry{{Name: stagePrefix + "di"}, {Name: stagePrefix + "inline"}}, nil, nil)
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

	code := runTransform(testHost(), []string{"--tsconfig=/nonexistent/tsconfig.json", "--plugins-json", "[]"})
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

	code := runTransform(testHost(), []string{
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

// TestSelectStagesBundleExpandsToOrderedSet is the preset core: a consumer that
// declares ONLY the di.core bundle descriptor (rhombusstd_di_bundle) must get its
// constituent stages selected in canonical order — inline -> nameof ->
// signatureof -> keyof -> valueof -> di — without ever listing them by hand. The
// binary owns both the membership and the order.
func TestSelectStagesBundleExpandsToOrderedSet(t *testing.T) {
	got, err := selectStages(testHost(), []pluginEntry{{Name: stagePrefix + "di_bundle"}}, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{
		stagePrefix + "inline",
		stagePrefix + "nameof",
		stagePrefix + "signatureof",
		stagePrefix + "keyof",
		stagePrefix + "valueof",
		stagePrefix + "di",
	}
	names := stageNames(got)
	if len(names) != len(want) {
		t.Fatalf("bundle selection = %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("bundle selection = %v, want %v", names, want)
		}
	}
}

// TestSelectStagesBundlePlusExtraStageDedups: declaring the bundle AND one of its
// own constituents (or a stage outside it) must not double-run any stage, and the
// result stays in canonical order. Here the manifest carries the bundle plus an
// explicit `di` (already in the bundle) and `di_options` (outside it).
func TestSelectStagesBundlePlusExtraStageDedups(t *testing.T) {
	got, err := selectStages(testHost(), []pluginEntry{
		{Name: stagePrefix + "di_options"},
		{Name: stagePrefix + "di_bundle"},
		{Name: stagePrefix + "di"},
	}, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{
		stagePrefix + "inline",
		stagePrefix + "nameof",
		stagePrefix + "signatureof",
		stagePrefix + "keyof",
		stagePrefix + "valueof",
		stagePrefix + "di",
		stagePrefix + "di_options",
	}
	names := stageNames(got)
	if len(names) != len(want) {
		t.Fatalf("bundle+extra selection = %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("bundle+extra selection = %v, want %v", names, want)
		}
	}
}

// TestSelectStagesUnknownBundleIsHardError: a prefixed name that is neither a
// stage nor a bundle stays a hard error naming it.
func TestSelectStagesUnknownBundleIsHardError(t *testing.T) {
	_, err := selectStages(testHost(), []pluginEntry{{Name: stagePrefix + "mystery_bundle"}}, nil, nil)
	if err == nil {
		t.Fatal("expected UNKNOWN_STAGE error for an unknown bundle, got nil")
	}
	if got := err.Error(); !contains(got, "UNKNOWN_STAGE") {
		t.Fatalf("error %q does not mention UNKNOWN_STAGE", got)
	}
}

func TestSelectStagesScopesToDeclaredStages(t *testing.T) {
	// A nameof-only consumer activates ONLY the nameof stage — di must not run.
	got, err := selectStages(testHost(), []pluginEntry{{Name: stagePrefix + "nameof"}}, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if names := stageNames(got); len(names) != 1 || names[0] != stagePrefix+"nameof" {
		t.Fatalf("nameof-only selection = %v, want [%q]", names, stagePrefix+"nameof")
	}
}

// TestSelectStagesUnionsDependencyScan: the host's own dependency scan (§100) is
// the default selection channel. Its bare stage ids activate the matching stages
// in canonical order, unioned with (and deduped against) the manifest — here the
// manifest carries only nameof (what ttsc's direct discovery spawned the host
// with) while the scan supplies the transitive superset.
func TestSelectStagesUnionsDependencyScan(t *testing.T) {
	got, err := selectStages(
		testHost(),
		[]pluginEntry{{Name: stagePrefix + "nameof"}},
		nil,
		[]string{"di", "nameof", "signatureof", "inline"},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{
		stagePrefix + "inline",
		stagePrefix + "nameof",
		stagePrefix + "signatureof",
		stagePrefix + "di",
	}
	names := stageNames(got)
	if len(names) != len(want) {
		t.Fatalf("scan-union selection = %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("scan-union selection = %v, want %v", names, want)
		}
	}
}

// TestSelectStagesUnknownScanStageIsHardError: a scan id with no matching stage is
// a loud UNKNOWN_STAGE, the same contract as a bogus manifest name.
func TestSelectStagesUnknownScanStageIsHardError(t *testing.T) {
	_, err := selectStages(testHost(), nil, nil, []string{"bogus"})
	if err == nil {
		t.Fatal("expected UNKNOWN_STAGE for an unknown scan id, got nil")
	}
	if got := err.Error(); !contains(got, "UNKNOWN_STAGE") {
		t.Fatalf("error %q does not mention UNKNOWN_STAGE", got)
	}
}

func TestSelectStagesUnknownStageIsHardError(t *testing.T) {
	_, err := selectStages(testHost(), []pluginEntry{{Name: stagePrefix + "bogus"}}, nil, nil)
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
		testHost(),
		[]pluginEntry{{Name: stagePrefix + "nameof"}, {Name: "@ttsc/banner"}},
		map[string]bool{"@ttsc/banner": true},
		nil,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if names := stageNames(got); len(names) != 1 || names[0] != stagePrefix+"nameof" {
		t.Fatalf("selection = %v, want just the nameof stage", names)
	}
}

func TestSelectStagesForeignUnlinkedEntryIsHardError(t *testing.T) {
	_, err := selectStages(testHost(), []pluginEntry{{Name: "@ttsc/banner"}}, nil, nil)
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
