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
	"github.com/fnioc/std/transforms/internal/inlinetransform"
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
	case "transform", "check", "build":
		// Strip the subcommand token so the flag parser sees the flags that
		// follow it. ttsc drives an emitting build via the `build` subcommand
		// (source-to-source hosts still answer it with the envelope on stdout);
		// leaving "build" in front of the flags makes flag.Parse stop at that
		// positional and silently drop every flag after it — including
		// --plugins-json, which selection depends on.
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
	if err := fs.Parse(filterKnownArgs(args)); err != nil {
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

	// Task #2 — zero-stage guard: with no rhombusstd_* stage selected and no
	// linked plugin, this run would load the program and emit it unchanged, which
	// is never what a plugins array intends. Fail loud rather than silently no-op.
	if len(selected) == 0 && len(linked) == 0 {
		fmt.Fprintf(stderr, "%s: NO_STAGES: no rhombusstd_* stage selected and no linked plugins present — this run would load the program and emit it unchanged; check the tsconfig plugins array\n", hostName)
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

	artifacts := inlinetransform.NewArtifacts()
	env := &stageEnv{cwd: cwd, artifacts: artifacts}
	transforms := make([]plugin.FileTransform, 0, len(selected))
	for _, stage := range selected {
		transforms = append(transforms, stage.build(prog, ctx, env, emit))
	}

	for _, sf := range prog.SourceFiles() {
		if sf.IsDeclarationFile {
			continue
		}
		key := sourceFileKey(cwd, filepath.ToSlash(sf.FileName()))
		if filepath.IsAbs(key) || key == ".." || strings.HasPrefix(key, "../") {
			continue
		}
		out.TypeScript[key] = transformFileToTypeScript(prog, transforms, sf, artifacts, emit)
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

// knownValueFlags names the flags this host reads, each of which takes a value.
// Every other flag ttsc forwards to a native host (--emit, --quiet, --verbose,
// --outDir, --tsgo-args, threading/diagnostics knobs) is not ours to interpret.
var knownValueFlags = map[string]bool{
	"file":         true,
	"tsconfig":     true,
	"cwd":          true,
	"out":          true,
	"rewrite-mode": true,
	"output":       true,
	"plugins-json": true,
}

// filterKnownArgs keeps only this host's own flags (with their values, inline or
// space-separated) and drops every other flag ttsc forwards, so the strict Go
// flag parser does not reject an unknown one like `--quiet`. It mirrors the
// reference sidecar's filterHostArgs: an unknown flag is dropped, and a trailing
// bare value it might carry is consumed only when the next token is not itself a
// flag. The subcommand token is already stripped by the router.
func filterKnownArgs(args []string) []string {
	out := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		current := args[i]
		if current == "--" {
			break
		}
		if !strings.HasPrefix(current, "-") {
			continue
		}
		name, hasInlineValue := flagBase(current)
		if knownValueFlags[name] {
			out = append(out, current)
			if !hasInlineValue && i+1 < len(args) {
				i++
				out = append(out, args[i])
			}
			continue
		}
		if !hasInlineValue && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
			i++
		}
	}
	return out
}

// flagBase strips leading dashes from a flag token and reports whether it
// carries an inline `=value`, returning the bare flag name.
func flagBase(arg string) (string, bool) {
	name := strings.TrimLeft(arg, "-")
	before, _, found := strings.Cut(name, "=")
	return before, found
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
			if _, ok := stageByName[e.Name]; ok {
				chosen[e.Name] = true
				continue
			}
			// A preset bundle name expands into its ordered constituent stages;
			// canonicalStages below then sorts and dedups the union.
			if constituents, ok := bundleByName[e.Name]; ok {
				for _, name := range constituents {
					chosen[name] = true
				}
				continue
			}
			return nil, fmt.Errorf("UNKNOWN_STAGE: %q is not a stage or bundle of this host", e.Name)
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
// back as TypeScript for the ttsc host to type-strip. When the inline stage was
// active it runs the emit sweep (tripwire 2) over the fully-lowered output after
// parent pointers are fixed up, so a synthetic node can walk to a positioned
// ancestor, before printing.
func transformFileToTypeScript(prog *driver.Program, transforms []plugin.FileTransform, sf *shimast.SourceFile, artifacts *inlinetransform.Artifacts, emit func(envelopeDiagnostic)) string {
	options := prog.TSProgram.Options()
	ec := shimprinter.NewEmitContext()
	result := sf
	for _, transform := range transforms {
		if next := transform(ec, result); next != nil {
			result = next
		}
	}
	shimast.SetParentInChildrenUnset(result.AsNode())
	if artifacts != nil && artifacts.Active {
		for _, d := range inlinetransform.Sweep(result, artifacts) {
			emit(envelopeFromPlugin(d, categoryError))
		}
	}
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
