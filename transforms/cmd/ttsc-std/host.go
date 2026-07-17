package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

const hostName = "ttsc-std"

const (
	categoryError   = "error"
	categoryWarning = "warning"
)

var (
	stdout io.Writer = os.Stdout
	stderr io.Writer = os.Stderr
)

// run dispatches the host command line: the transform-stage contract the ttsc
// host relies on plus `check`, `version`, and `help` for standalone use,
// mirroring the shared sidecar scaffolding's router.
func run(args []string) int {
	if len(args) == 0 {
		return runTransform(nil)
	}
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprintf(stdout, "%s - single owner ttsc transform host\n", hostName)
		return 0
	case "-v", "--version", "version":
		fmt.Fprintf(stdout, "%s dev\n", hostName)
		return 0
	case "transform":
		return runTransform(args[1:])
	case "check":
		return runTransform(args[1:])
	default:
		return runTransform(args)
	}
}

func runTransform(args []string) int {
	fs := flag.NewFlagSet("transform", flag.ContinueOnError)
	fs.SetOutput(stderr)
	_ = fs.String("file", "", "single file (unused: whole-project envelope only)")
	tsconfigPath := fs.String("tsconfig", "tsconfig.json", "tsconfig.json owning the project")
	cwdOverride := fs.String("cwd", "", "override the working directory")
	_ = fs.String("out", "", "unused: single-file output path")
	_ = fs.String("rewrite-mode", "", "unused: native rewrite backend id")
	_ = fs.String("output", "ts", "unused: single-file output kind")
	pluginsJSON := fs.String("plugins-json", "", "ordered ttsc plugin manifest")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	// Selection: the manifest names which stages the consumer declared. Every
	// rhombusstd_* entry resolves to one of this host's stages (an unknown one is
	// a hard error); a foreign entry is left to ttsc's linked machinery when it
	// is linked into this host, else rejected.
	entries, err := parsePluginEntries(*pluginsJSON)
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", hostName, err)
		return 2
	}
	linked, err := parsePluginEntries(os.Getenv(driver.LinkedPluginsEnv))
	if err != nil {
		fmt.Fprintf(stderr, "%s: linked manifest: %v\n", hostName, err)
		return 2
	}
	selected, err := selectStages(entries, namesOf(linked))
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", hostName, err)
		return 2
	}

	cwd := *cwdOverride
	if cwd == "" {
		var derr error
		cwd, derr = os.Getwd()
		if derr != nil {
			fmt.Fprintf(stderr, "%s: cwd: %v\n", hostName, derr)
			return 2
		}
	}

	prog, diags, err := driver.LoadProgram(cwd, *tsconfigPath, driver.LoadProgramOptions{ForceEmit: true})
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", hostName, err)
		return 2
	}
	if len(diags) > 0 {
		driver.WritePrettyDiagnostics(stderr, diags, cwd)
		return 2
	}
	defer prog.Close()

	// Run any foreign transforms linked into this host through ttsc's own driver
	// machinery (source preamble + program mutation), matching what the driver
	// does before its emit. LoadProgram already primed the linked state from the
	// TTSC_LINKED_PLUGINS_JSON env; this applies it deterministically and
	// surfaces any error rather than swallowing it.
	if err := prog.ApplyLinkedPlugins(); err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", hostName, err)
		return 2
	}

	ctx := plugin.NewContext(prog, cwd)
	out := projectEnvelope{
		Diagnostics: []envelopeDiagnostic{},
		TypeScript:  map[string]string{},
	}
	hasError := false
	emit := func(d envelopeDiagnostic) {
		out.Diagnostics = append(out.Diagnostics, d)
		if d.Category == categoryError {
			hasError = true
		}
	}

	transforms := make([]plugin.FileTransform, 0, len(selected))
	for _, stage := range selected {
		transforms = append(transforms, stage.build(prog, ctx, emit))
	}

	for _, sf := range prog.SourceFiles() {
		if sf.IsDeclarationFile {
			continue
		}
		key := sourceFileKey(cwd, filepath.ToSlash(sf.FileName()))
		if filepath.IsAbs(key) || key == ".." || strings.HasPrefix(key, "../") {
			continue
		}
		out.TypeScript[key] = transformFileToTypeScript(prog, transforms, sf)
	}

	if err := json.NewEncoder(stdout).Encode(out); err != nil {
		fmt.Fprintf(stderr, "%s: encode output: %v\n", hostName, err)
		return 3
	}
	if hasError {
		return 3
	}
	return 0
}

// pluginEntry is the manifest shape ttsc serializes into --plugins-json (and the
// TTSC_LINKED_PLUGINS_JSON env). Only the descriptor name drives selection here.
type pluginEntry struct {
	Config json.RawMessage `json:"config"`
	Name   string          `json:"name"`
	Stage  string          `json:"stage"`
}

// parsePluginEntries decodes a --plugins-json / linked-manifest value. An empty
// or whitespace-only string is "no plugins", not an error.
func parsePluginEntries(input string) ([]pluginEntry, error) {
	if strings.TrimSpace(input) == "" {
		return nil, nil
	}
	var entries []pluginEntry
	if err := json.Unmarshal([]byte(input), &entries); err != nil {
		return nil, fmt.Errorf("invalid plugin manifest: %w", err)
	}
	return entries, nil
}

// namesOf collects the descriptor names present in a manifest.
func namesOf(entries []pluginEntry) map[string]bool {
	names := make(map[string]bool, len(entries))
	for _, e := range entries {
		names[e.Name] = true
	}
	return names
}

// selectStages resolves the manifest into the ordered set of stages to run.
//
// Error contract (every failure loud):
//   - a rhombusstd_* name with no matching stage -> UNKNOWN_STAGE, naming it.
//   - a non-prefixed entry present in the linked manifest -> left to ttsc's
//     linked machinery (ApplyLinkedPlugins), skipped here.
//   - a non-prefixed entry NOT linked -> hard error naming it (this host composes
//     no foreign transforms yet).
//
// The returned slice follows canonicalStages order regardless of manifest order.
func selectStages(entries []pluginEntry, linkedNames map[string]bool) ([]stageDef, error) {
	chosen := map[string]bool{}
	for _, e := range entries {
		if strings.HasPrefix(e.Name, stagePrefix) {
			if _, ok := stageByName[e.Name]; !ok {
				return nil, fmt.Errorf("UNKNOWN_STAGE: %q is not a stage of this host", e.Name)
			}
			chosen[e.Name] = true
			continue
		}
		if linkedNames[e.Name] {
			continue
		}
		return nil, fmt.Errorf("plugin %q is neither a rhombusstd_* stage nor a linked plugin — this host composes no foreign transforms", e.Name)
	}
	out := make([]stageDef, 0, len(chosen))
	for _, stage := range canonicalStages {
		if chosen[stage.name] {
			out = append(out, stage)
		}
	}
	return out, nil
}

// transformFileToTypeScript lowers one file through every selected stage in a
// single EmitContext — canonical order, back-to-back — and prints the result
// back as TypeScript for the ttsc host to type-strip.
func transformFileToTypeScript(prog *driver.Program, transforms []plugin.FileTransform, sf *shimast.SourceFile) string {
	options := prog.TSProgram.Options()
	ec := shimprinter.NewEmitContext()
	result := sf
	for _, transform := range transforms {
		if next := transform(ec, result); next != nil {
			result = next
		}
	}
	shimast.SetParentInChildrenUnset(result.AsNode())
	writer := shimprinter.NewTextWriter(options.NewLine.GetNewLineCharacter(), 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{NewLine: options.NewLine}, shimprinter.PrintHandlers{}, ec)
	printer.Write(result.AsNode(), result, writer, nil)
	return writer.String()
}

type projectEnvelope struct {
	Diagnostics []envelopeDiagnostic `json:"diagnostics,omitempty"`
	TypeScript  map[string]string    `json:"typescript"`
}

type envelopeDiagnostic struct {
	File        *string `json:"file"`
	Category    string  `json:"category"`
	Code        string  `json:"code"`
	MessageText string  `json:"messageText"`
}

// envelopeFromPlugin converts a plugin.Diagnostic (no category of its own) into
// an envelope diagnostic under the given category.
func envelopeFromPlugin(d plugin.Diagnostic, category string) envelopeDiagnostic {
	return envelopeDiagnostic{
		File:        filePointer(d.File),
		Category:    category,
		Code:        d.Code,
		MessageText: d.Message,
	}
}

// envelopeFromDi converts a ditransform.Diagnostic, honoring its advisory
// Warning vs hard Error category so a warning does not fail emit.
func envelopeFromDi(d ditransform.Diagnostic) envelopeDiagnostic {
	category := categoryError
	if d.Category == ditransform.Warning {
		category = categoryWarning
	}
	return envelopeDiagnostic{
		File:        filePointer(d.File),
		Category:    category,
		Code:        d.Code,
		MessageText: d.Message,
	}
}

func filePointer(file string) *string {
	if file == "" {
		return nil
	}
	normalized := filepath.ToSlash(file)
	return &normalized
}

func sourceFileKey(cwd, file string) string {
	rel, err := filepath.Rel(cwd, filepath.FromSlash(file))
	if err != nil {
		return filepath.ToSlash(file)
	}
	return filepath.ToSlash(rel)
}
