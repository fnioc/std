package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// buildRegContextWorkspace lays out a di.core + consumer app whose `addClass`
// verb RETURNS the manifest itself (`IServiceManifestBase`), so a registration
// can be threaded through an assignment, a `const` initializer, or a `return`
// and still type-check. It is the fixture for the immutable-manifest
// generalization (#269): registration sugar is almost never a bare top-level
// expression statement any more, so the di stage must recognize it in every
// expression context, not only a top-level `ExpressionStatement`.
func buildRegContextWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "di.core")
	writeFile(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	// The runtime overload returns the manifest itself so the immutable-manifest
	// threading forms (`s = s.addClass(...)`, `const s = m.addClass(...)`,
	// `return m.addClass(...)`) all type-check.
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): IServiceManifestBase;
}
export declare const services: IServiceManifestBase;
`)

	app := filepath.Join(root, "packages", "app")
	writeFile(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@rhombus-std/di.core": "workspace:*" }
}`)
	linkPkg(t, app, "@rhombus-std/di.core", core)

	// The standard consumer augmentation: the token-free `addClass<T>()` sugar
	// overload merges onto di.core's IServiceManifestBase so a `m.addClass<T>(C)`
	// call anchors on the di.core member the di stage recognizes.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass<T>(ctor: unknown): IServiceManifestBase;
  }
}
export {};
`)
	writeFile(t, filepath.Join(app, "main.ts"), mainSrc)
	writeFile(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "sugar.d.ts", "node_modules/@rhombus-std/di.core/src/index.ts"]
}`)

	prog, diags, err := driver.LoadProgram(app, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatalf("LoadProgram: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("config diagnostics: %v", diags)
	}
	return prog, app
}

// TestDiLowersRegistrationInAllExpressionContexts pins the immutable-manifest
// generalization: the di stage lowers a direct `addClass<I>(C)` registration
// wherever it appears in expression context — an assignment RHS, a `const`
// initializer, and a `return` inside a factory function — not only a bare
// top-level expression statement. Before the file-wide pass, only the top-level
// expression statement lowered and the other three survived un-lowered (and would
// throw di.core's sugar-not-lowered guard at runtime).
func TestDiLowersRegistrationInAllExpressionContexts(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
import type { IServiceManifestBase } from '@rhombus-std/di.core';
interface IFoo {}
class Foo implements IFoo {}
interface IBar {}
class Bar implements IBar {}
interface IBaz {}
class Baz implements IBaz {}

// assignment RHS
let s = services;
s = s.addClass<IFoo>(Foo);

// const-declaration initializer
const built = services.addClass<IBar>(Bar);

// return inside a factory function
function register(m: IServiceManifestBase): IServiceManifestBase {
  return m.addClass<IBaz>(Baz);
}

void s;
void built;
void register;
`
	prog, app := buildRegContextWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerDi(t, prog, app)

	if strings.Contains(out, "addClass<") {
		t.Fatalf("a sugar `addClass<...>` registration survived un-lowered:\n%s", out)
	}
	for _, want := range []string{`:IFoo"`, `:IBar"`, `:IBaz"`} {
		if !strings.Contains(out, want) {
			t.Fatalf("expected a lowered registration token ending in %s, got:\n%s", want, out)
		}
	}
	if n := strings.Count(out, ".addClass("); n != 3 {
		t.Fatalf("expected 3 lowered .addClass(\"…\", …) calls (assignment, const, return), got %d:\n%s", n, out)
	}
}
