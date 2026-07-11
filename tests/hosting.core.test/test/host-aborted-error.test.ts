import { HostAbortedError } from '@rhombus-std/hosting.core/internal/index';
import { expect, test } from 'bun:test';

test('HostAbortedError() uses the system-supplied message', () => {
  const error = new HostAbortedError();
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('HostAbortedError');
  expect(error.message).toBe('The host was aborted.');
  expect(error.cause).toBeUndefined();
});

test('HostAbortedError(message) uses the supplied message', () => {
  const error = new HostAbortedError('shutting down');
  expect(error.message).toBe('shutting down');
  expect(error.cause).toBeUndefined();
});

test('HostAbortedError(message, innerError) wraps the inner error as the cause', () => {
  const inner = new Error('root cause');
  const error = new HostAbortedError('shutting down', inner);
  expect(error.message).toBe('shutting down');
  expect(error.cause).toBe(inner);
});

test('HostAbortedError(undefined, innerError) still falls back to the default message', () => {
  const inner = new Error('root cause');
  const error = new HostAbortedError(undefined, inner);
  expect(error.message).toBe('The host was aborted.');
  expect(error.cause).toBe(inner);
});
