// `contentRootFileProvider` defaults to a `NullFileProvider` until a physical
// provider is wired in.

import { type IFileProvider, NullFileProvider } from '@rhombus-std/fileproviders.core';
import type { IHostEnvironment } from '@rhombus-std/hosting.core';
import { augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

// Interface-extends merge (augmentation doctrine): binding the IHostEnvironment
// SYMBOL flows every in-program augmentation of the interface (hosting.core's
// environment predicates isDevelopment/…) onto this concrete holder, so it
// satisfies `implements IHostEnvironment` without restating any member.
export interface HostingEnvironment extends IHostEnvironment {}

/**
 * The mutable {@link IHostEnvironment} the host populates while building. This
 * supports infrastructure and is not intended to be used directly.
 */
@augment(tokenfor<IHostEnvironment>())
export class HostingEnvironment implements IHostEnvironment {
  public environmentName = '';
  public applicationName = '';
  public contentRootPath = '';
  public contentRootFileProvider: IFileProvider = new NullFileProvider();
}
