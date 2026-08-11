import { type Type } from './Type';

export interface IServiceProvider {
  getService(type: Type): any;
}
