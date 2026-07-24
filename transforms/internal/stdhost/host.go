// Package stdhost is the shared single-owner ttsc transform-host scaffolding
// behind the @rhombus-std owner binary. The command (cmd/ttsc-std) is a thin
// main that composes a Host value — a name, an ordered stage table, and the
// preset bundles — and hands it to Run; everything else (manifest parsing,
// runtime stage selection, the linked-plugin handoff, the per-file transform
// loop, and the JSON envelope) lives here once.
//
// There is ONE host. It links typia through the merge-synthesis stage
// (internal/mergesynthtransform, #213), which the base stage table now carries;
// the former two-binary split — a published typia-free host plus an
// in-repo-only sibling that added mergesynth — is retired. typia is fully
// lowered at build time and appears in no shipped artifact or npm manifest (the
// stage embeds its guards as inlined plain JS), so the single binary stays a
// build-time-only tool with no typia runtime footprint.
package stdhost

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

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/tokens"
)

const (
	categoryError   = "error"
	categoryWarning = "warning"
)

var (
	stdout io.Writer = os.Stdout
	stderr io.Writer = os.Stderr
)

// Host is one owner binary's identity: its diagnostic name, its ordered stage
// table (the slice order IS the canonical execution order), and the preset
// bundle expansions it accepts.
type Host struct {
	Name    string
	Stages  []Stage
	Bundles map[string][]string
}

// Stage pairs a descriptor name with its transform builder.
type Stage struct {
	Name  string
	Build Builder
}

// Env carries the cross-stage state a builder may need: the project working
// directory, the per-run inline artifacts (populated by the inline stage, read by
// nameof and the emit sweep), and the inline BODIES the host pre-collected in its
// single §100 dependency scan (threaded to the inline stage so the walk runs once).
type Env struct {
	Cwd       string
	Artifacts *inlinetransform.Artifacts
	Bodies    []inlinetransform.OwnedEntry
}

// Sink receives one diagnostic from a stage's transform.
type Sink func(Diag)

// Diag is a stage diagnostic destined for the envelope. Warning diagnostics
// are reported without failing the emit; everything else is a hard error.
type Diag struct {
	File    string
	Warning bool
	Code    string
	Message string
}

// Builder adapts a stage's native transform factory (each with its own
// diagnostic type) onto the shared FileTransform + Diag contract.
type Builder func(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform

// DiagFromPlugin converts a plugin.Diagnostic (no category of its own) into a
// hard-error Diag.
func DiagFromPlugin(d plugin.Diagnostic) Diag {
	return Diag{
		File:    d.File,
		Code:    d.Code,
		Message: d.Message,
	}
}

// DiagFromDi converts a signatures.Diagnostic, honoring its advisory Warning
// vs hard Error category so a warning does not fail emit. It carries the shared
// signature-extraction engine's §4.5 advisory the signatureof stage surfaces.
func DiagFromDi(d signatures.Diagnostic) Diag {
	return Diag{
		File:    d.File,
		Warning: d.Category == signatures.Warning,
		Code:    d.Code,
		Message: d.Message,
	}
}

// Run dispatches the host command line: the transform-stage contract the ttsc
// host relies on plus `check`, `version`, and `help` for standalone use,
// mirroring the shared sidecar scaffolding's router.
func Run(host Host, args []string) int {
	if len(args) == 0 {
		return runTransform(host, nil)
	}
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprintf(stdout, "%s - single owner ttsc transform host\n", host.Name)
		return 0
	case "-v", "--version", "version":
		fmt.Fprintf(stdout, "%s dev\n", host.Name)
		return 0
	case "transform", "check", "build":
		// Strip the subcommand token so the flag parser sees the flags that
		// follow it. ttsc drives an emitting build via the `build` subcommand
		// (source-to-source hosts still answer it with the envelope on stdout);
		// leaving "build" in front of the flags makes flag.Parse stop at that
		// positional and silently drop every flag after it — including
		// --plugins-json, which selection depends on.
		return runTransform(host, args[1:])
	default:
		return runTransform(host, args)
	}
}

func runTransform(host Host, args []string) int {
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
		fmt.Fprintf(stderr, "%s: %v\n", host.Name, err)
		return 2
	}
	linked, err := parsePluginEntries(os.Getenv(driver.LinkedPluginsEnv))
	if err != nil {
		fmt.Fprintf(stderr, "%s: linked manifest: %v\n", host.Name, err)
		return 2
	}
	cwd := *cwdOverride
	if cwd == "" {
		var derr error
		cwd, derr = os.Getwd()
		if derr != nil {
			fmt.Fprintf(stderr, "%s: cwd: %v\n", host.Name, derr)
			return 2
		}
	}

	// §100 declare-by-depending: ONE workspace dependency scan yields BOTH the
	// stage set to activate AND the inline bodies to substitute. ttsc's own
	// auto-discovery is direct-only (it spawns this host from the consumer's
	// direct *.transformer dep); this scan supplies the transitive stage union — a
	// di.transformer consumer reaches primitives' stages through di.transformer ->
	// primitives.transformer — and the bodies, threaded into the inline stage so
	// the walk runs exactly once.
	scan, scanErr := inlinetransform.CollectProject(cwd)
	if scanErr != nil {
		fmt.Fprintf(stderr, "%s: dependency scan: %v\n", host.Name, scanErr)
		return 2
	}

	selected, err := selectStages(host, entries, namesOf(linked), scan.Stages)
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", host.Name, err)
		return 2
	}

	// Zero-stage guard: with no stage selected (empty manifest AND empty scan) and
	// no linked plugin, this run would load the program and emit it unchanged,
	// which a lowering build never intends. Fail loud rather than silently no-op.
	// A real lowering package always reaches a *.transformer, so this rarely fires.
	if len(selected) == 0 && len(linked) == 0 {
		fmt.Fprintf(stderr, "%s: NO_STAGES: no rhombusstd_* stage selected (empty manifest + empty dependency scan) and no linked plugins present — this run would load the program and emit it unchanged; check that the package reaches a @rhombus-std/*.transformer dependency\n", host.Name)
		return 2
	}

	prog, diags, err := driver.LoadProgram(cwd, *tsconfigPath, driver.LoadProgramOptions{ForceEmit: true})
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", host.Name, err)
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
		fmt.Fprintf(stderr, "%s: %v\n", host.Name, err)
		return 2
	}

	ctx := plugin.NewContext(prog, cwd)
	out := projectEnvelope{
		Diagnostics: []envelopeDiagnostic{},
		TypeScript:  map[string]string{},
	}
	hasError := false
	emit := func(d Diag) {
		out.Diagnostics = append(out.Diagnostics, envelopeFromDiag(d))
		if !d.Warning {
			hasError = true
		}
	}
	// Route the token core's hard derivation diagnostics (a type reachable only
	// through a non-barrel, non-tokens export subpath) into the envelope as errors.
	ctx.Diag = func(file string, start int, code, message string) {
		emit(DiagFromPlugin(plugin.Diagnostic{File: file, Start: start, Code: code, Message: message}))
	}

	artifacts := inlinetransform.NewArtifacts()
	env := &Env{Cwd: cwd, Artifacts: artifacts, Bodies: scan.Bodies}

	// Split the selected stages into the one-shot PRE-PASS (mergesynth) and the
	// LOOPED set (everything else), then build each into its FileTransform — see
	// partitionStages for the why. The prePass runs once before the loop; the loop
	// runs the rest to a fixed point.
	prePassStages, loopStages := partitionStages(selected)
	prePass := make([]plugin.FileTransform, 0, len(prePassStages))
	for _, stage := range prePassStages {
		prePass = append(prePass, stage.Build(prog, ctx, env, emit))
	}
	loop := make([]plugin.FileTransform, 0, len(loopStages))
	for _, stage := range loopStages {
		loop = append(loop, stage.Build(prog, ctx, env, emit))
	}

	for _, sf := range prog.SourceFiles() {
		if sf.IsDeclarationFile {
			continue
		}
		key := sourceFileKey(cwd, filepath.ToSlash(sf.FileName()))
		if filepath.IsAbs(key) || key == ".." || strings.HasPrefix(key, "../") {
			continue
		}
		out.TypeScript[key] = transformFileToTypeScript(prog, prePass, loop, sf, artifacts, emit)
	}

	if err := json.NewEncoder(stdout).Encode(out); err != nil {
		fmt.Fprintf(stderr, "%s: encode output: %v\n", host.Name, err)
		return 3
	}
	if hasError {
		return 3
	}
	return 0
}

// partitionStages splits the selected stages into the one-shot PRE-PASS
// (mergesynth) and the LOOPED set (everything else). Mergesynth is
// augmentation-side: its matches are source-written
// registerAugmentations/applyAugmentations installs, and NO sugar body mints one,
// so the loop can never produce fresh work for it — running it exactly once before
// the loop keeps termination trivially explainable (Open issue 2). The rest run
// repeatedly to a fixed point, since each sugar chain peels one layer per pass. The
// relative order within each group is preserved from selection; the loop's
// correctness does not depend on it (disjoint match sets).
func partitionStages(selected []Stage) (prePass, loop []Stage) {
	for _, stage := range selected {
		if stage.Name == stagePrefix+"mergesynth" {
			prePass = append(prePass, stage)
		} else {
			loop = append(loop, stage)
		}
	}
	return prePass, loop
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

// selectStages resolves the stages to run: the UNION of the host's own dependency
// scan (§100 declare-by-depending — the transitive stage superset) and the
// manifest (ttsc's direct-discovery spawn set plus any explicit tsconfig
// override/opt-in). Each scan id maps to its rhombusstd_<id> stage name.
//
// Error contract (every failure loud):
//   - a scan id or rhombusstd_* manifest name with no matching stage ->
//     UNKNOWN_STAGE, naming it.
//   - a non-prefixed entry present in the linked manifest -> left to ttsc's
//     linked machinery (ApplyLinkedPlugins), skipped here.
//   - a non-prefixed entry NOT linked -> hard error naming it (this host composes
//     no foreign transforms yet).
//
// The returned slice follows the host's stage-table order regardless of scan or
// manifest order.
func selectStages(host Host, entries []pluginEntry, linkedNames map[string]bool, scanStages []string) ([]Stage, error) {
	index := make(map[string]bool, len(host.Stages))
	for _, s := range host.Stages {
		index[s.Name] = true
	}
	chosen := map[string]bool{}
	// Seed from the dependency scan: the transitive stage union (§100), the
	// superset of what ttsc's direct-only discovery placed in the manifest.
	for _, id := range scanStages {
		name := stagePrefix + id
		if !index[name] {
			return nil, fmt.Errorf("UNKNOWN_STAGE: dependency scan requested %q which is not a stage of this host", name)
		}
		chosen[name] = true
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name, stagePrefix) {
			if index[e.Name] {
				chosen[e.Name] = true
				continue
			}
			// A preset bundle name expands into its ordered constituent stages;
			// the host's stage-table order below then sorts and dedups the union.
			if constituents, ok := host.Bundles[e.Name]; ok {
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
	out := make([]Stage, 0, len(chosen))
	for _, stage := range host.Stages {
		if chosen[stage.Name] {
			out = append(out, stage)
		}
	}
	return out, nil
}

// maxLoopPasses bounds the fixed-point loop. Each sugar chain peels one layer per
// pass, so a real file settles in a handful of passes (a 3-deep registration chain
// takes 3); 16 is a generous ceiling far above any legitimate chain depth. Hitting
// it means a stage is NOT identity-preserving on a no-op (it rebuilds the tree
// every pass, so the loop can never observe a fixed point) or two stages are
// rewriting the same node back and forth — either way an engine bug, surfaced
// LOUDLY as a per-file FIXED_POINT_EXHAUSTED error rather than a silent cap or an
// infinite spin.
const maxLoopPasses = 16

// transformFileToTypeScript lowers one file to its fixed point in a single
// EmitContext and prints the result back as TypeScript for the ttsc host to
// type-strip.
//
// Mergesynth is a ONE-SHOT PRE-PASS, run once before the loop (Open issue 2): it
// is augmentation-side, its matches are only ever the SOURCE-WRITTEN
// registerAugmentations/applyAugmentations installs, and no sugar body mints one,
// so the loop can never create fresh work for it — and one-shot placement makes
// termination trivially explainable. (In the loop it also misbehaves: its
// strategyNames has no spread-assignment case, so it re-wraps a hand-merge install
// every pass and never settles — mergesynth.go.) REJOIN CONDITION, if a future
// sugar body ever EMITS an install call: mergesynth must move back INTO the loop
// AND gain a spread-recursing strategyNames (recurse through resolveObjectLiteral)
// so the loop's newly-minted installs are re-seen.
//
// The remaining stages run under RunToFixedPoint — the whole set, back to back,
// until a full pass changes nothing. Change detection is pointer identity (every
// stage returns the identical *SourceFile on a no-op). Only after the loop settles
// does the emit sweep run (tripwire 2) — once, over the fully-lowered, fully-
// parented output — so a synthetic node can walk to a positioned ancestor.
func transformFileToTypeScript(prog *driver.Program, prePass, loop []plugin.FileTransform, sf *shimast.SourceFile, artifacts *inlinetransform.Artifacts, emit Sink) string {
	options := prog.TSProgram.Options()
	ec := shimprinter.NewEmitContext()
	result := sf

	prePassChanged := false
	for _, transform := range prePass {
		if next := transform(ec, result); next != nil && next != result {
			result = next
			prePassChanged = true
		}
	}
	if prePassChanged {
		shimast.SetParentInChildrenUnset(result.AsNode())
	}

	var exhausted bool
	result, _, exhausted = plugin.RunToFixedPoint(ec, loop, result, maxLoopPasses)
	if exhausted {
		emit(Diag{
			File:    filepath.ToSlash(sf.FileName()),
			Code:    "FIXED_POINT_EXHAUSTED",
			Message: fmt.Sprintf("the transform loop did not reach a fixed point after %d passes — the file still changes on every pass. A stage is likely not identity-preserving on a no-op (it rebuilds the tree each pass), or two stages are rewriting the same node back and forth. This is an engine bug, not a user error.", maxLoopPasses),
		})
	}

	if artifacts != nil && artifacts.Active {
		for _, d := range inlinetransform.Sweep(result, artifacts) {
			emit(DiagFromPlugin(d))
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

// envelopeFromDiag converts a stage Diag into its envelope form.
func envelopeFromDiag(d Diag) envelopeDiagnostic {
	category := categoryError
	if d.Warning {
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
