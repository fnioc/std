import type { Middleware } from '@rhombus-std/di.core';
import { scopeId } from './symbols.js';

/** The one layer a provider adds over the model: which scope the asks entering through it run under. */
export function createMarkerMiddleware(id: symbol): Middleware {
  return function markScope(next) {
    return function mark(request) {
      request[scopeId] = id;
      return next(request);
    };
  };
}
