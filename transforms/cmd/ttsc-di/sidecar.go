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

// The sidecar loop mirrors the shared plugin scaffolding's transform-stage
// contract but is category-aware: an advisory warning (990003 / 990011) is
// reported in the envelope without failing emit, matching the reference
// transformer where only hard errors gate the build. The shared plugin.Run
// treats every diagnostic as a build-failing error, so the registration port
// needs this thin variant; program loading and the context builder
// (plugin.NewContext) are reused unchanged.

const pluginName = "ttsc-di"

var (
	stdout io.Writer = os.Stdout
	stderr io.Writer = os.Stderr
)

func run(args []string) int {
	if len(args) == 0 {
		return runTransform(nil)
	}
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprintf(stdout, "%s - ttsc transform sidecar\n", pluginName)
		return 0
	case "-v", "--version", "version":
		fmt.Fprintf(stdout, "%s dev\n", pluginName)
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
	_ = fs.String("plugins-json", "", "ordered ttsc plugin payload")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	cwd := *cwdOverride
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			fmt.Fprintf(stderr, "%s: cwd: %v\n", pluginName, err)
			return 2
		}
	}

	prog, diags, err := driver.LoadProgram(cwd, *tsconfigPath, driver.LoadProgramOptions{ForceEmit: true})
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", pluginName, err)
		return 2
	}
	if len(diags) > 0 {
		driver.WritePrettyDiagnostics(stderr, diags, cwd)
		return 2
	}
	defer prog.Close()

	ctx := plugin.NewContext(prog, cwd)
	var collected []ditransform.Diagnostic
	transform := ditransform.New(prog, ctx, func(d ditransform.Diagnostic) {
		collected = append(collected, d)
	})

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

	hasError := false
	for _, d := range collected {
		out.Diagnostics = append(out.Diagnostics, toEnvelopeDiagnostic(d))
		if d.Category == ditransform.Error {
			hasError = true
		}
	}
	if err := json.NewEncoder(stdout).Encode(out); err != nil {
		fmt.Fprintf(stderr, "%s: encode output: %v\n", pluginName, err)
		return 3
	}
	if hasError {
		return 3
	}
	return 0
}

func transformFileToTypeScript(prog *driver.Program, transform ditransform.FileTransform, sf *shimast.SourceFile) string {
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

func toEnvelopeDiagnostic(d ditransform.Diagnostic) envelopeDiagnostic {
	var ptr *string
	if d.File != "" {
		normalized := filepath.ToSlash(d.File)
		ptr = &normalized
	}
	category := "error"
	if d.Category == ditransform.Warning {
		category = "warning"
	}
	return envelopeDiagnostic{
		File:        ptr,
		Category:    category,
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
