package main

import (
	"fmt"
	"go/parser"
	"go/token"
	"os"
	"strings"

	"github.com/go-toolsmith/minformat"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: gominfmt [-w] file...")
		os.Exit(1)
	}
	args := os.Args[1:]
	write := false
	if args[0] == "-w" {
		write = true
		args = args[1:]
	}
	for _, path := range args {
		if err := processFile(path, write); err != nil {
			fmt.Fprintf(os.Stderr, "%s: %v\n", path, err)
			os.Exit(1)
		}
	}
}

func processFile(path string, write bool) error {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return err
	}
	var buf strings.Builder
	if err := minformat.Node(&buf, fset, f); err != nil {
		return err
	}
	if write {
		return os.WriteFile(path, []byte(buf.String()), 0o644)
	}
	_, err = os.Stdout.WriteString(buf.String())
	return err
}
