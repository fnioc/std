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

	"github.com/fnioc/std/transforms/internal/dioptionstransform"
	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

// The aggregate loop mirrors the registration sidecar's category-aware envelope
// (an advisory warning is reported without failing emit) and adds the options
// stage: each file is lowered by the registration transform, then by the
// addOptions transform, inside ONE shared EmitContext over ONE loaded program.
// The two stages touch disjoint call shapes (registration verbs vs `addOptions`),
// so running them back-to-back is order-independent and each still sees the
// original type nodes for the calls it owns.

const pluginName = "ttsc-di-app"

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

	var collected []envelopeDiagnostic
	hasError := false

	registration := ditransform.New(prog, ctx, func(d ditransform.Diagnostic) {
		collected = append(collected, fromRegistrationDiagnostic(d))
		if d.Category == ditransform.Error {
			hasError = true
		}
	})
	options := dioptionstransform.AddOptionsTransform(prog, ctx, func(d plugin.Diagnostic) {
		collected = append(collected, fromOptionsDiagnostic(d))
		hasError = true
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
		out.TypeScript[key] = transformFileToTypeScript(prog, registration, options, sf)
	}

	out.Diagnostics = append(out.Diagnostics, collected...)
	if err := json.NewEncoder(stdout).Encode(out); err != nil {
		fmt.Fprintf(stderr, "%s: encode output: %v\n", pluginName, err)
		return 3
	}
	if hasError {
		return 3
	}
	return 0
}

// transformFileToTypeScript lowers one file through both stages in a single
// EmitContext — registration first, then addOptions — and prints the result back
// as TypeScript for the ttsc host to type-strip.
func transformFileToTypeScript(
	prog *driver.Program,
	registration ditransform.FileTransform,
	options plugin.FileTransform,
	sf *shimast.SourceFile,
) string {
	tsOptions := prog.TSProgram.Options()
	ec := shimprinter.NewEmitContext()
	result := sf
	if next := registration(ec, result); next != nil {
		result = next
	}
	if next := options(ec, result); next != nil {
		result = next
	}
	shimast.SetParentInChildrenUnset(result.AsNode())
	writer := shimprinter.NewTextWriter(tsOptions.NewLine.GetNewLineCharacter(), 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{NewLine: tsOptions.NewLine}, shimprinter.PrintHandlers{}, ec)
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

func fromRegistrationDiagnostic(d ditransform.Diagnostic) envelopeDiagnostic {
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

func fromOptionsDiagnostic(d plugin.Diagnostic) envelopeDiagnostic {
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
