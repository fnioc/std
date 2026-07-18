// Package plugin holds the sidecar scaffolding every Go ttsc plugin in this repo
// shares: building the token-derivation context from a loaded program, running a
// per-file source-to-source transform across the whole project, and emitting the
// JSON envelope the ttsc host reads back (`{ diagnostics, typescript }`).
//
// The ttsc host drives a transform-stage plugin as
//
//	<binary> transform --tsconfig=<path> --plugins-json=<json> --cwd=<root>
//
// in project mode: no --file, one envelope on stdout, exit 3 when any diagnostic
// was raised. Individual plugins supply only their per-file AST transform and a
// name; this package owns the rest, mirroring the shape of the reference sidecar.
package plugin

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

	"github.com/fnioc/std/transforms/internal/tokens"
)

// FileTransform rewrites one source file inside a shared EmitContext, returning
// the rewritten file (or the input unchanged). It is the only plugin-specific
// piece; everything around it is generic.
type FileTransform func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile

// Diagnostic is a transform diagnostic destined for the envelope. Code is the
// stable string diagnostic code; File is an absolute path (empty when unknown).
type Diagnostic struct {
	File    string
	Start   int
	Code    string
	Message string
}

// Factory builds a plugin's per-file transform from a loaded program and a
// diagnostic sink. Returning the transform (rather than exposing the program)
// keeps the plugin's checker queries behind the same lifetime as the program.
type Factory func(prog *driver.Program, ctx *tokens.Context, addDiagnostic func(Diagnostic)) FileTransform

// Spec names a plugin and supplies its transform factory.
type Spec struct {
	Name    string
	Factory Factory
}

var (
	stdout io.Writer = os.Stdout
	stderr io.Writer = os.Stderr
)

// Run dispatches the sidecar command line. It supports the transform-stage
// contract the ttsc host relies on plus `check`, `version`, and `help` for
// standalone use, mirroring the reference sidecar's router.
func Run(spec Spec, args []string) int {
	if len(args) == 0 {
		return runTransform(spec, nil)
	}
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprintf(stdout, "%s - ttsc transform sidecar\n", spec.Name)
		return 0
	case "-v", "--version", "version":
		fmt.Fprintf(stdout, "%s dev\n", spec.Name)
		return 0
	case "transform":
		return runTransform(spec, args[1:])
	case "check":
		return runTransform(spec, args[1:])
	default:
		return runTransform(spec, args)
	}
}

func runTransform(spec Spec, args []string) int {
	fs := flag.NewFlagSet("transform", flag.ContinueOnError)
	fs.SetOutput(stderr)
	file := fs.String("file", "", "single file to transform (omit for whole-project envelope)")
	tsconfigPath := fs.String("tsconfig", "tsconfig.json", "tsconfig.json owning the project")
	cwdOverride := fs.String("cwd", "", "override the working directory")
	_ = fs.String("out", "", "unused: single-file output path")
	_ = fs.String("rewrite-mode", "", "unused: native rewrite backend id")
	_ = fs.String("output", "ts", "unused: single-file output kind")
	_ = fs.String("plugins-json", "", "ordered ttsc plugin payload")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	_ = file

	cwd := *cwdOverride
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			fmt.Fprintf(stderr, "%s: cwd: %v\n", spec.Name, err)
			return 2
		}
	}

	prog, diags, err := driver.LoadProgram(cwd, *tsconfigPath, driver.LoadProgramOptions{ForceEmit: true})
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", spec.Name, err)
		return 2
	}
	if len(diags) > 0 {
		driver.WritePrettyDiagnostics(stderr, diags, cwd)
		return 2
	}
	defer prog.Close()

	ctx := NewContext(prog, cwd)
	collected := []Diagnostic{}
	addDiagnostic := func(d Diagnostic) {
		collected = append(collected, d)
	}
	// The token core's hard derivation diagnostics (a type reachable only through a
	// non-barrel, non-tokens export subpath) flow through the same collector.
	ctx.Diag = func(file string, start int, code, message string) {
		addDiagnostic(Diagnostic{File: file, Start: start, Code: code, Message: message})
	}
	transform := spec.Factory(prog, ctx, addDiagnostic)

	out := projectEnvelope{
		Diagnostics: []envelopeDiagnostic{},
		TypeScript:  map[string]string{},
	}
	for _, sf := range prog.SourceFiles() {
		if sf.IsDeclarationFile {
			continue
		}
		key := sourceFileKey(cwd, filepath.ToSlash(sf.FileName()))
		if filepath.IsAbs(key) || key == ".." || strings.HasPrefix(key, "../") {
			continue
		}
		out.TypeScript[key] = transformFileToTypeScript(prog, transform, sf)
	}
	for _, d := range collected {
		out.Diagnostics = append(out.Diagnostics, toEnvelopeDiagnostic(d))
	}
	if err := json.NewEncoder(stdout).Encode(out); err != nil {
		fmt.Fprintf(stderr, "%s: encode output: %v\n", spec.Name, err)
		return 3
	}
	if len(out.Diagnostics) > 0 {
		return 3
	}
	return 0
}

// transformFileToTypeScript runs one file's transform in a fresh EmitContext and
// prints the result back as TypeScript, so the ttsc host can type-strip per file.
func transformFileToTypeScript(prog *driver.Program, transform FileTransform, sf *shimast.SourceFile) string {
	options := prog.TSProgram.Options()
	ec := shimprinter.NewEmitContext()
	result := sf
	if next := transform(ec, result); next != nil {
		result = next
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

func toEnvelopeDiagnostic(d Diagnostic) envelopeDiagnostic {
	var ptr *string
	if d.File != "" {
		normalized := filepath.ToSlash(d.File)
		ptr = &normalized
	}
	return envelopeDiagnostic{
		File:        ptr,
		Category:    "error",
		Code:        d.Code,
		MessageText: d.Message,
	}
}

func sourceFileKey(cwd, file string) string {
	rel, err := filepath.Rel(cwd, filepath.FromSlash(file))
	if err != nil {
		return filepath.ToSlash(file)
	}
	return filepath.ToSlash(rel)
}
