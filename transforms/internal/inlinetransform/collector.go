package inlinetransform

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// OwnedEntry is one publish-list entry together with the absolute directory of
// the package that declared it. Impl resolution (side-parse) is rooted at
// PackageDir; the entry belongs to that package regardless of which imported
// file it was concatenated from.
type OwnedEntry struct {
	Entry      Entry
	PackageDir string
}

// Collect walks the consumer package's workspace dependency graph and returns
// every rhombus.inline entry any reachable workspace package declares, each
// tagged with its owning package directory. The walk is:
//
//   - consumer root = the nearest package.json above consumerCwd;
//   - workspace map = name -> dir, from the repo-root package.json "workspaces"
//     globs (nearest ancestor carrying the key), falling back to node_modules
//     resolution — the bun isolated-linker symlinks make both the real build and
//     the e2e fixture resolvable through node_modules;
//   - a recursive walk over dependencies ∪ devDependencies ∪ peerDependencies,
//     workspace-resident packages only, deduped and cycle-guarded by directory.
//
// The consumer package itself is visited too, so a consumer that declares its
// own inline entries is honored. Output order is deterministic (walk order with
// dependency names sorted), for stable diagnostics and parity.
func Collect(consumerCwd string) ([]OwnedEntry, error) {
	consumerRoot, err := findPackageRoot(consumerCwd)
	if err != nil {
		return nil, err
	}
	wsMap := workspaceMap(consumerRoot)

	var out []OwnedEntry
	visited := map[string]bool{}
	var walk func(dir string) error
	walk = func(dir string) error {
		dir = filepath.Clean(dir)
		if visited[dir] {
			return nil
		}
		visited[dir] = true

		entries, lerr := LoadInlineEntries(dir)
		if lerr != nil {
			return lerr
		}
		for _, e := range entries {
			out = append(out, OwnedEntry{Entry: e, PackageDir: dir})
		}

		deps, derr := dependencyNames(dir)
		if derr != nil {
			return derr
		}
		for _, name := range deps {
			depDir := resolveDependencyDir(name, wsMap, dir, consumerRoot)
			if depDir == "" {
				continue // non-workspace / unresolvable → no honored inline config
			}
			if werr := walk(depDir); werr != nil {
				return werr
			}
		}
		return nil
	}
	if err := walk(consumerRoot); err != nil {
		return nil, err
	}
	return out, nil
}

// findPackageRoot walks up from start to the nearest directory containing a
// package.json.
func findPackageRoot(start string) (string, error) {
	dir := filepath.Clean(start)
	for {
		if fileExists(filepath.Join(dir, "package.json")) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("inline: no package.json above %s", start)
		}
		dir = parent
	}
}

// workspaceMap builds a package-name -> absolute-dir map from the repo-root
// package.json's "workspaces" globs. The repo root is the nearest ancestor of
// consumerRoot whose package.json carries "workspaces". No such ancestor →
// degenerate single-package mode (empty map): the consumer is the only package,
// and dependency resolution falls back to node_modules.
func workspaceMap(consumerRoot string) map[string]string {
	repoRoot, globs := findWorkspaceRoot(consumerRoot)
	m := map[string]string{}
	if repoRoot == "" {
		return m
	}
	for _, glob := range globs {
		for _, dir := range expandWorkspaceGlob(repoRoot, glob) {
			if name := packageName(dir); name != "" {
				m[name] = dir
			}
		}
	}
	return m
}

// findWorkspaceRoot returns the nearest ancestor of start (inclusive) whose
// package.json declares "workspaces", plus the parsed glob list.
func findWorkspaceRoot(start string) (string, []string) {
	dir := filepath.Clean(start)
	for {
		globs, ok := workspaceGlobs(filepath.Join(dir, "package.json"))
		if ok {
			return dir, globs
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", nil
		}
		dir = parent
	}
}

// workspaceGlobs parses the "workspaces" field (array | { packages: [] }).
func workspaceGlobs(pkgPath string) ([]string, bool) {
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		return nil, false
	}
	var raw struct {
		Workspaces json.RawMessage `json:"workspaces"`
	}
	if err := json.Unmarshal(data, &raw); err != nil || len(raw.Workspaces) == 0 {
		return nil, false
	}
	var list []string
	if err := json.Unmarshal(raw.Workspaces, &list); err == nil {
		return list, true
	}
	var obj struct {
		Packages []string `json:"packages"`
	}
	if err := json.Unmarshal(raw.Workspaces, &obj); err == nil {
		return obj.Packages, true
	}
	return nil, false
}

// expandWorkspaceGlob expands one workspace glob relative to repoRoot. Only the
// trailing single-level `*` form (e.g. "libraries/*") and literal paths are
// supported — the forms this repo's workspaces use.
func expandWorkspaceGlob(repoRoot, glob string) []string {
	glob = filepath.ToSlash(strings.TrimSpace(glob))
	if !strings.Contains(glob, "*") {
		dir := filepath.Join(repoRoot, filepath.FromSlash(glob))
		if fileExists(filepath.Join(dir, "package.json")) {
			return []string{dir}
		}
		return nil
	}
	// Support a single trailing "/*" wildcard: <prefix>/*.
	prefix := strings.TrimSuffix(glob, "/*")
	if strings.Contains(prefix, "*") {
		return nil // deeper globbing unsupported (not used by this repo)
	}
	base := filepath.Join(repoRoot, filepath.FromSlash(prefix))
	kids, err := os.ReadDir(base)
	if err != nil {
		return nil
	}
	var out []string
	for _, k := range kids {
		if !k.IsDir() {
			continue
		}
		dir := filepath.Join(base, k.Name())
		if fileExists(filepath.Join(dir, "package.json")) {
			out = append(out, dir)
		}
	}
	return out
}

// resolveDependencyDir resolves a dependency name to a package directory:
// workspace-map hit first, then node_modules under the depending package or the
// consumer root (the bun isolated linker symlinks workspace packages there).
// Returns "" when the dependency is not resolvable to an on-disk package.
func resolveDependencyDir(name string, wsMap map[string]string, fromDir, consumerRoot string) string {
	if dir, ok := wsMap[name]; ok {
		return dir
	}
	for _, base := range []string{fromDir, consumerRoot} {
		candidate := filepath.Join(base, "node_modules", filepath.FromSlash(name))
		if fileExists(filepath.Join(candidate, "package.json")) {
			real, err := filepath.EvalSymlinks(candidate)
			if err != nil {
				return candidate
			}
			return real
		}
	}
	return ""
}

// dependencyNames reads dir/package.json and returns the sorted union of its
// dependencies, devDependencies, and peerDependencies keys.
func dependencyNames(dir string) ([]string, error) {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("inline: cannot read package.json in %s: %w", dir, err)
	}
	var pkg struct {
		Dependencies     map[string]string `json:"dependencies"`
		DevDependencies  map[string]string `json:"devDependencies"`
		PeerDependencies map[string]string `json:"peerDependencies"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, fmt.Errorf("inline: malformed package.json in %s: %w", dir, err)
	}
	set := map[string]bool{}
	for _, m := range []map[string]string{pkg.Dependencies, pkg.DevDependencies, pkg.PeerDependencies} {
		for k := range m {
			set[k] = true
		}
	}
	names := make([]string, 0, len(set))
	for k := range set {
		names = append(names, k)
	}
	sort.Strings(names)
	return names, nil
}

// packageName reads the "name" field of dir/package.json.
func packageName(dir string) string {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return ""
	}
	var pkg struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return ""
	}
	return pkg.Name
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
