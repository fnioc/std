package inlinetransform

import (
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// The declaration set every case here shares: the token-taking primitive, the
// sugar's own face, and a THIRD overload that has nothing to do with the sugar
// yet carries the same type-parameter and value-parameter counts as its face.
// That last one is what makes the pair below meaningful — the two faces are
// distinguishable only by their value parameters' names.
const declaredFaceSugarDTS = `declare module '@scope/core' {
  interface IQuery {
    isService(token: string, extra: number): boolean;
    isService<T>(extra: number): boolean;
    isService<X>(mismatched: string): boolean;
  }
}
export {};
`

const declaredFaceCoreIndex = `export interface IQuery {}
export declare const provider: IQuery;
`

// TestUnrelatedOverloadIsNotClaimed: a call the checker binds, unambiguously, to
// a declaration the sugar's implementation does not serve must be left alone.
// Serving is by exact value parameters, so the unrelated overload — same counts,
// different parameter name — never enters the inline plan, and the call emerges
// untouched with no diagnostic against it.
func TestUnrelatedOverloadIsNotClaimed(t *testing.T) {
	inlineBody := `import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IQuery } from './index';
export namespace QueryInline {
  export function isService<T>(this: IQuery, extra: number): boolean {
    return this.isService(tokenfor<T>(), extra);
  }
}
`
	// A string argument and no type argument: only the third declaration accepts
	// this call, and it is not the one the implementation serves.
	mainSrc := `/// <reference path="./sugar.d.ts" />
import { provider } from '@scope/core';
export const bad = provider.isService('x');
`
	prog, app := buildWorkspace(t, declaredFaceCoreIndex, inlineBody, declaredFaceSugarDTS, mainSrc)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })

	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	out := reprint(ec, transform(ec, main))

	if !strings.Contains(out, "provider.isService('x')") {
		t.Errorf("expected the unrelated overload's call to survive untouched, got:\n%s\ndiagnostics: %+v", out, diags)
	}
	if len(diags) != 0 {
		t.Errorf("a call the implementation never served must draw no diagnostic, got %+v", diags)
	}
}

// TestRestShapedImplementationIsRefused: an implementation that absorbs its
// parameters into a rest has no declared face to compare against, so it could
// serve any declaration of equal type-parameter count. It is refused where it is
// read, naming the member, rather than silently claiming a stranger.
func TestRestShapedImplementationIsRefused(t *testing.T) {
	inlineBody := `import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IQuery } from './index';
export namespace QueryInline {
  export function isService<T>(this: IQuery, ...rest: any[]): boolean {
    return this.isService(tokenfor<T>(), ...rest);
  }
}
`
	mainSrc := `/// <reference path="./sugar.d.ts" />
import { provider } from '@scope/core';
export const bad = provider.isService('x');
`
	prog, app := buildWorkspace(t, declaredFaceCoreIndex, inlineBody, declaredFaceSugarDTS, mainSrc)
	defer func() { _ = prog.Close() }()

	var diags []plugin.Diagnostic
	Build(prog, bodiesFor(t, app), NewArtifacts(), func(d plugin.Diagnostic) { diags = append(diags, d) })

	found := false
	for _, d := range diags {
		if strings.Contains(d.Message, "INLINE_REST_BODY") && strings.Contains(d.Message, "isService") {
			found = true
		}
	}
	if !found {
		t.Errorf("want an INLINE_REST_BODY refusal naming the member, got %+v", diags)
	}
}
