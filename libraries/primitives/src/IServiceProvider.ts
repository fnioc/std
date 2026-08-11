import { type Type } from './Type/Type.js';

export interface IServiceProvider {
  getService(type: Type): any;
}
