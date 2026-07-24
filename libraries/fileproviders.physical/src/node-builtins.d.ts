// Compile-scope typings for the two `node:` modules this package imports,
// declared with exactly the signatures the call sites use (no @types/node
// dependency). Nothing imports this file, so it's never shipped; if a
// consumer's own program has @types/node, these merely merge in as extra
// overloads.

declare module 'node:fs' {
  export interface Stats {
    readonly size: number;
    readonly mtime: Date;
    readonly mtimeMs: number;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export interface FSWatcher {
    close(): void;
  }
  export function statSync(path: string, options: { throwIfNoEntry: false; }): Stats | undefined;
  export function readdirSync(path: string, options: { withFileTypes: true; }): Dirent[];
  export function openSync(path: string, flags: string): number;
  export function readSync(fd: number, buffer: Uint8Array, offset: number, length: number,
    position: number | null): number;
  export function closeSync(fd: number): void;
  export function watch(path: string, options: { recursive?: boolean; },
    listener: (eventType: string, filename: string | null) => void): FSWatcher;
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export const sep: string;
}
