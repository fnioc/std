package mergesynthtransform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// fixturePrelude declares local stand-ins for the primitives install functions.
// The stage matches the callee's resolved symbol NAME (alias-followed), so a
// local declaration anchors identically to the real import — no workspace
// linkage needed to exercise the rewrite.
const fixturePrelude = `type MergeStrategy = (original: (...a: unknown[]) => unknown, extension: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown;
export function registerAugmentations(token: string, set: object, merge?: Record<string, MergeStrategy>): void {}
export function applyAugmentations(Ctor: object, set: object, merge?: Record<string, MergeStrategy>): void {}
export interface IAlpha { id: number; }
`

// loadFixture writes a one-file strict project and loads it.
func loadFixture(t *testing.T, source string) (*driver.Program, *shimast.SourceFile) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "app.ts"), fixturePrelude+source)
	write(t, filepath.Join(root, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["app.ts"]
}`)
	prog, diags, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatalf("LoadProgram: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("config diagnostics: %v", diags)
	}
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), "app.ts") {
			return prog, sf
		}
	}
	t.Fatal("app.ts not in program")
	return nil, nil
}

// run applies the stage to the fixture and reprints, mirroring the host's emit
// pipeline (parent fixup + printer bound to the same EmitContext).
func run(t *testing.T, source string) (string, []Diagnostic) {
	t.Helper()
	prog, sf := loadFixture(t, source)
	defer func() { _ = prog.Close() }()
	var diags []Diagnostic
	transform := New(prog, func(d Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	out := transform(ec, sf)
	if out == nil {
		out = sf
	}
	shimast.SetParentInChildrenUnset(out.AsNode())
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(out.AsNode(), out, writer, nil)
	return writer.String(), diags
}

func TestSynthesizesGuardedStrategyFromUnionParameter(t *testing.T) {
	out, diags := run(t, `
export const AlphaExtensions = {
  describe(self: IAlpha, opts: { verbose: boolean } | number): string {
    return String(opts);
  },
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if !strings.Contains(out, `registerAugmentations("t:IAlpha", AlphaExtensions, {`) {
		t.Fatalf("no synthesized third argument:\n%s", out)
	}
	if !strings.Contains(out, "describe: function (original, extension)") {
		t.Fatalf("no describe strategy in output:\n%s", out)
	}
	// The typia guard is inlined plain JS: a structural typeof check on the
	// union, with no typia reference of any kind surviving.
	if !strings.Contains(out, "typeof") {
		t.Fatalf("no structural guard emitted:\n%s", out)
	}
	for _, forbidden := range []string{"typia", "createIs"} {
		if strings.Contains(out, forbidden) {
			t.Fatalf("emitted output mentions %q:\n%s", forbidden, out)
		}
	}
	// Dispatch shape: guard hit -> extension, miss -> original.
	if !strings.Contains(out, "extension(this, ...args)") || !strings.Contains(out, "original.call(this, ...args)") {
		t.Fatalf("dispatcher does not route between extension and original:\n%s", out)
	}
}

func TestHandAuthoredStrategyWinsAndIsNotSynthesized(t *testing.T) {
	out, diags := run(t, `
export const AlphaExtensions = {
  describe(self: IAlpha, opts: number): string { return String(opts); },
  tag(self: IAlpha, name: string): string { return name; },
};
const handMerge = {
  describe(original: (...a: unknown[]) => unknown, extension: (...a: unknown[]) => unknown) {
    return original;
  },
} satisfies Record<string, MergeStrategy>;
registerAugmentations("t:IAlpha", AlphaExtensions, handMerge);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	// Only the uncovered member is synthesized...
	if !strings.Contains(out, "tag: function (original, extension)") {
		t.Fatalf("uncovered member tag not synthesized:\n%s", out)
	}
	if strings.Contains(out, "describe: function (original, extension)") {
		t.Fatalf("hand-covered member describe was synthesized anyway:\n%s", out)
	}
	// ...and the hand-authored object is spread LAST, so it wins at runtime too.
	spread := strings.Index(out, "...handMerge")
	synthesized := strings.Index(out, "tag: function")
	if spread < 0 || synthesized < 0 || spread < synthesized {
		t.Fatalf("hand merge is not spread after the synthesized entries:\n%s", out)
	}
}

func TestFullyCoveredCallIsLeftUntouched(t *testing.T) {
	source := `
export const AlphaExtensions = {
  describe(self: IAlpha, opts: number): string { return String(opts); },
};
const handMerge = {
  describe(original: (...a: unknown[]) => unknown, extension: (...a: unknown[]) => unknown) {
    return original;
  },
} satisfies Record<string, MergeStrategy>;
registerAugmentations("t:IAlpha", AlphaExtensions, handMerge);
`
	out, diags := run(t, source)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if !strings.Contains(out, `registerAugmentations("t:IAlpha", AlphaExtensions, handMerge);`) {
		t.Fatalf("fully hand-covered call was rewritten:\n%s", out)
	}
}

func TestUnDerivableMemberFallsBackToAlwaysPass(t *testing.T) {
	for name, decl := range map[string]string{
		"generic": `pick<T>(self: IAlpha, value: T): T { return value; }`,
		"unknown": `pick(self: IAlpha, value: unknown): unknown { return value; }`,
		"any":     `pick(self: IAlpha, value: any): unknown { return value; }`,
		"untyped": `pick(self: IAlpha, value = 1): unknown { return value; }`,
	} {
		out, diags := run(t, `
export const AlphaExtensions = { `+decl+` };
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
		if len(diags) != 0 {
			t.Fatalf("%s: unexpected diagnostics: %+v", name, diags)
		}
		if !strings.Contains(out, "pick: function (original, extension)") {
			t.Fatalf("%s: no pick strategy:\n%s", name, out)
		}
		// The always-pass form: the dispatcher unconditionally runs the
		// extension — no arity or guard conjuncts at all.
		if strings.Contains(out, "args.length") {
			t.Fatalf("%s: un-derivable member gained arity conjuncts:\n%s", name, out)
		}
		if strings.Contains(out, "original.call") {
			t.Fatalf("%s: un-derivable member routes to original:\n%s", name, out)
		}
		if !strings.Contains(out, "extension(this, ...args)") {
			t.Fatalf("%s: extension not invoked:\n%s", name, out)
		}
	}
}

func TestOptionalParameterAndArityBounds(t *testing.T) {
	out, diags := run(t, `
export const AlphaExtensions = {
  fmt(self: IAlpha, a: string, b?: number): string { return a + String(b); },
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if !strings.Contains(out, "args.length >= 1") || !strings.Contains(out, "args.length <= 2") {
		t.Fatalf("arity bounds missing:\n%s", out)
	}
	if !strings.Contains(out, "g0(args[0])") {
		t.Fatalf("required-parameter guard missing:\n%s", out)
	}
	if !strings.Contains(out, "args[1] === undefined || g1(args[1])") {
		t.Fatalf("optional-parameter guard missing its absent short-circuit:\n%s", out)
	}
}

func TestRestParameterGuardsTheSliceWithoutUpperBound(t *testing.T) {
	out, diags := run(t, `
export const AlphaExtensions = {
  store(self: IAlpha, ...rest: [key: string] | [key: string, ttl: number]): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if !strings.Contains(out, "g0(args.slice(0))") {
		t.Fatalf("rest guard does not validate the slice:\n%s", out)
	}
	if strings.Contains(out, "args.length <=") {
		t.Fatalf("rest member must not carry an upper arity bound:\n%s", out)
	}
}

func TestApplyAugmentationsIsRewrittenToo(t *testing.T) {
	out, diags := run(t, `
export class Alpha implements IAlpha { id = 1; }
export const AlphaExtensions = {
  describe(self: IAlpha, opts: number): string { return String(opts); },
};
applyAugmentations(Alpha, AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if !strings.Contains(out, "applyAugmentations(Alpha, AlphaExtensions, {") {
		t.Fatalf("applyAugmentations not rewritten:\n%s", out)
	}
}

func TestOpaqueSetExpressionIsLeftUntouched(t *testing.T) {
	out, diags := run(t, `
declare function makeSet(): object;
registerAugmentations("t:IAlpha", makeSet());
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if !strings.Contains(out, `registerAugmentations("t:IAlpha", makeSet());`) {
		t.Fatalf("opaque set call was rewritten:\n%s", out)
	}
}

func TestGuardValidatesDeepObjectShape(t *testing.T) {
	// The scope contract: object-interface props validate deep. The guard for
	// a MemoryCacheEntryOptions-like bag must check its property types, not
	// just typeof input === "object".
	out, diags := run(t, `
interface EntryOptions { size?: number; sliding?: number; tag: string; }
export const AlphaExtensions = {
  configure(self: IAlpha, options: EntryOptions): void {},
};
registerAugmentations("t:IAlpha", AlphaExtensions);
`)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	for _, needle := range []string{"tag", "size", "sliding"} {
		if !strings.Contains(out, needle) {
			t.Fatalf("deep guard does not mention property %q:\n%s", needle, out)
		}
	}
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
