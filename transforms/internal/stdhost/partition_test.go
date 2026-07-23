package stdhost

import "testing"

// TestPartitionStagesRoutesMergesynthToPrePass pins the pre-pass/loop split
// runTransform applies before building each stage into its FileTransform: the
// mergesynth stage — augmentation-side, its matches only ever source-written
// installs — must land in the one-shot PRE-PASS, and every other stage in the
// LOOPED set (Open issue 2). Getting this wrong would either loop mergesynth (which
// re-wraps hand-merge installs forever, see mergesynthtransform's
// TestHandMergeReWrapsOnSecondPass) or drop a real lowering stage out of the loop.
func TestPartitionStagesRoutesMergesynthToPrePass(t *testing.T) {
	selected := testHost().Stages // the full canonical stage table

	// Sanity: the base table actually carries mergesynth, else this test proves
	// nothing.
	var hasMergesynth bool
	for _, s := range selected {
		if s.Name == stagePrefix+"mergesynth" {
			hasMergesynth = true
		}
	}
	if !hasMergesynth {
		t.Fatalf("base stage table has no %smergesynth stage — the split has nothing to route", stagePrefix)
	}

	prePass, loop := partitionStages(selected)

	if len(prePass) != 1 {
		t.Fatalf("prePass should hold exactly the mergesynth stage, got %v", stageNames(prePass))
	}
	if prePass[0].Name != stagePrefix+"mergesynth" {
		t.Errorf("prePass stage = %q, want %smergesynth", prePass[0].Name, stagePrefix)
	}
	if len(prePass)+len(loop) != len(selected) {
		t.Errorf("partition dropped or duplicated stages: %d prePass + %d loop != %d selected", len(prePass), len(loop), len(selected))
	}
	for _, s := range loop {
		if s.Name == stagePrefix+"mergesynth" {
			t.Errorf("mergesynth leaked into the looped set — it must run once as a pre-pass, never in the loop")
		}
	}
	// The loop must preserve the canonical order of the non-mergesynth stages.
	wantLoop := make([]string, 0, len(selected))
	for _, s := range selected {
		if s.Name != stagePrefix+"mergesynth" {
			wantLoop = append(wantLoop, s.Name)
		}
	}
	gotLoop := stageNames(loop)
	if len(gotLoop) != len(wantLoop) {
		t.Fatalf("loop stages = %v, want %v", gotLoop, wantLoop)
	}
	for i := range wantLoop {
		if gotLoop[i] != wantLoop[i] {
			t.Fatalf("loop stage order = %v, want %v", gotLoop, wantLoop)
		}
	}
}

// TestPartitionStagesWithoutMergesynthLoopsEverything covers the degenerate case: a
// selection that names no mergesynth stage yields an empty pre-pass and loops the
// whole set — the host then runs no pre-pass and every stage under the fixed-point
// loop.
func TestPartitionStagesWithoutMergesynthLoopsEverything(t *testing.T) {
	selected := []Stage{
		{Name: stagePrefix + "inline"},
		{Name: stagePrefix + "nameof"},
		{Name: stagePrefix + "di"},
	}
	prePass, loop := partitionStages(selected)
	if len(prePass) != 0 {
		t.Errorf("prePass should be empty when no mergesynth is selected, got %v", stageNames(prePass))
	}
	if len(loop) != len(selected) {
		t.Errorf("every selected stage should loop when no mergesynth is present, got %v", stageNames(loop))
	}
}
