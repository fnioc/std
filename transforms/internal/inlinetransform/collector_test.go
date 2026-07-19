package inlinetransform

import (
	"path/filepath"
	"testing"
)

// implsOf returns the set of impl names across a collected entry list.
func implsOf(owned []OwnedEntry) map[string]bool {
	set := map[string]bool{}
	for _, oe := range owned {
		set[oe.Entry.Impl] = true
	}
	return set
}

// TestCollectOwnEntries: a consumer package's OWN rhombus.inline entries are
// honored, tagged with the consumer's own directory.
func TestCollectOwnEntries(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)
	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "rhombus.inline": { "entries": [ { "impl": "own" } ] }
}`)

	owned, err := Collect(app)
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if len(owned) != 1 {
		t.Fatalf("expected 1 own entry, got %d: %+v", len(owned), owned)
	}
	if owned[0].Entry.Impl != "own" {
		t.Fatalf("Impl = %q, want own", owned[0].Entry.Impl)
	}
	if owned[0].PackageDir != filepath.Clean(app) {
		t.Fatalf("PackageDir = %q, want %q", owned[0].PackageDir, filepath.Clean(app))
	}
}

// TestCollectCyclicDeps: two workspace packages depending on each other must be
// each collected once and the walk must terminate (the visited-by-directory
// cycle guard). A failure here hangs, not just miscounts.
func TestCollectCyclicDeps(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)
	write(t, filepath.Join(root, "packages", "a", "package.json"), `{
  "name": "@scope/a",
  "dependencies": { "@scope/b": "workspace:*" },
  "rhombus.inline": { "entries": [ { "impl": "a" } ] }
}`)
	write(t, filepath.Join(root, "packages", "b", "package.json"), `{
  "name": "@scope/b",
  "dependencies": { "@scope/a": "workspace:*" },
  "rhombus.inline": { "entries": [ { "impl": "b" } ] }
}`)

	owned, err := Collect(filepath.Join(root, "packages", "a"))
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if len(owned) != 2 {
		t.Fatalf("a↔b cycle should yield exactly 2 entries, got %d: %+v", len(owned), owned)
	}
	impls := implsOf(owned)
	if !impls["a"] || !impls["b"] {
		t.Fatalf("expected both a and b collected once, got %v", impls)
	}
}

// TestCollectPeerAndDevDeps: entries reachable only via peerDependencies (this
// repo's real graph shape, e.g. di ← di.core) and via devDependencies are both
// traversed.
func TestCollectPeerAndDevDeps(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)
	write(t, filepath.Join(root, "packages", "app", "package.json"), `{
  "name": "@scope/app",
  "peerDependencies": { "@scope/peer": "workspace:*" },
  "devDependencies": { "@scope/dev": "workspace:*" }
}`)
	write(t, filepath.Join(root, "packages", "peer", "package.json"), `{
  "name": "@scope/peer",
  "rhombus.inline": { "entries": [ { "impl": "peer" } ] }
}`)
	write(t, filepath.Join(root, "packages", "dev", "package.json"), `{
  "name": "@scope/dev",
  "rhombus.inline": { "entries": [ { "impl": "dev" } ] }
}`)

	owned, err := Collect(filepath.Join(root, "packages", "app"))
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	impls := implsOf(owned)
	if !impls["peer"] {
		t.Fatalf("peerDependencies entry not collected: %v", impls)
	}
	if !impls["dev"] {
		t.Fatalf("devDependencies entry not collected: %v", impls)
	}
}

// TestCollectProjectStagesRootOnlyDevDeps exercises the STAGE face and the
// root-only-devDeps refinement in ONE walk (§100): the root's own devDep stages
// and the transitive dep/peer stages are collected, but a transitive dependency's
// devDep stages are NOT — a core that devDeps its own transformer must never
// force-activate that stage on a consumer of the core.
func TestCollectProjectStagesRootOnlyDevDeps(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)
	// app: a runtime dep on a core, a dev dep on a transformer.
	write(t, filepath.Join(root, "packages", "app", "package.json"), `{
  "name": "@scope/app",
  "dependencies": { "@scope/core": "workspace:*" },
  "devDependencies": { "@scope/roottf": "workspace:*" }
}`)
	// roottf: the root's own devDep transformer (stages collected) whose runtime dep
	// on another transformer (transitive dep) is also collected.
	write(t, filepath.Join(root, "packages", "roottf", "package.json"), `{
  "name": "@scope/roottf",
  "dependencies": { "@scope/deptf": "workspace:*" },
  "ttsc": { "stages": ["nameof"] }
}`)
	write(t, filepath.Join(root, "packages", "deptf", "package.json"), `{
  "name": "@scope/deptf",
  "ttsc": { "stages": ["signatureof"] }
}`)
	// core: no stages, but devDeps a transformer whose stages must NOT leak — the
	// core is not the root, so its devDeps are its own build tooling.
	write(t, filepath.Join(root, "packages", "core", "package.json"), `{
  "name": "@scope/core",
  "devDependencies": { "@scope/leaktf": "workspace:*" }
}`)
	write(t, filepath.Join(root, "packages", "leaktf", "package.json"), `{
  "name": "@scope/leaktf",
  "ttsc": { "stages": ["di"] }
}`)

	scan, err := CollectProject(filepath.Join(root, "packages", "app"))
	if err != nil {
		t.Fatalf("CollectProject: %v", err)
	}
	got := map[string]bool{}
	for _, s := range scan.Stages {
		got[s] = true
	}
	if !got["nameof"] {
		t.Errorf("root devDep transformer stage 'nameof' not collected: %v", scan.Stages)
	}
	if !got["signatureof"] {
		t.Errorf("transitive dep transformer stage 'signatureof' not collected: %v", scan.Stages)
	}
	if got["di"] {
		t.Errorf("transitive DEVDEP stage 'di' leaked (root-only devDeps violated): %v", scan.Stages)
	}
}

// TestWorkspaceObjectForm: the object form of the "workspaces" field
// (`{ "packages": [...] }`) must be parsed for the workspace map.
func TestWorkspaceObjectForm(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "ws", "private": true,
  "workspaces": { "packages": ["packages/*"] }
}`)
	write(t, filepath.Join(root, "packages", "app", "package.json"), `{
  "name": "@scope/app",
  "dependencies": { "@scope/lib": "workspace:*" }
}`)
	write(t, filepath.Join(root, "packages", "lib", "package.json"), `{
  "name": "@scope/lib",
  "rhombus.inline": { "entries": [ { "impl": "lib" } ] }
}`)

	owned, err := Collect(filepath.Join(root, "packages", "app"))
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if !implsOf(owned)["lib"] {
		t.Fatalf("object-form workspaces did not resolve @scope/lib: %+v", owned)
	}
}
