import { Type } from './Type/Type';

export interface IServiceProvider {
  resolve(type: Type): any;
}
