package transforms

import (
	"bytes"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// TestStagedSourceCarriesNoCommentsAndReformats pins what the published Go tree
// is: the staging script runs every file through the minifier, so not one
// comment reaches the registry, and the bytes it ships are still canonical Go —
// a consumer's `gofmt` restores readable source and then has nothing left to
// change.
func TestStagedSourceCarriesNoCommentsAndReformats(t *testing.T) {
	repoRoot, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}

	stage := exec.Command("bun", filepath.Join("scripts", "stage-transforms.ts"))
	stage.Dir = repoRoot
	if out, err := stage.CombinedOutput(); err != nil {
		t.Fatalf("staging failed: %v\n%s", err, out)
	}

	// The staged tree is minified Go inside the module's own directory, which the
	// gofmt gate walks, so it is removed once the assertions have read it.
	stageDir := filepath.Join(repoRoot, "transforms", "dist", "publish")
	defer func() { _ = os.RemoveAll(stageDir) }()
	var staged []string
	err = filepath.WalkDir(stageDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && strings.HasSuffix(path, ".go") {
			staged = append(staged, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(staged) == 0 {
		t.Fatalf("no staged .go files under %s", stageDir)
	}

	for _, path := range staged {
		t.Run(mustRel(t, stageDir, path), func(t *testing.T) {
			source, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			file, err := parser.ParseFile(token.NewFileSet(), path, source, parser.ParseComments)
			if err != nil {
				t.Fatalf("staged file does not parse: %v", err)
			}
			if len(file.Comments) != 0 {
				t.Fatalf("staged file carries %d comment groups, want none", len(file.Comments))
			}

			formatted, err := format.Source(source)
			if err != nil {
				t.Fatalf("gofmt over the staged file failed: %v", err)
			}
			reformatted, err := format.Source(formatted)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(formatted, reformatted) {
				t.Fatal("the gofmt'd staged file is not canonical: a second pass changed it")
			}
		})
	}
}

func mustRel(t *testing.T, base, path string) string {
	t.Helper()
	rel, err := filepath.Rel(base, path)
	if err != nil {
		t.Fatal(err)
	}
	return rel
}
