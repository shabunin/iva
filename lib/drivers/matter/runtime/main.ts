/**
 * iva-matter.js: the Matter driver on the panel (lib/drivers/matter, bundled
 * with matter.js by iva). <Matter> starts it: IvaMatter.start({...}).
 */

import { cf } from './cf.js';
import { MatterDriver, type StartOptions } from './controller.js';

const IvaMatter = {
  driver: undefined as MatterDriver | undefined,
  /** the driver up (the systems connect a moment after the scripts start: it waits for them) */
  start(options: StartOptions): MatterDriver {
    const driver = new MatterDriver(cf(), options);
    this.driver = driver;
    setTimeout(() => {
      driver.start().catch((e) => cf().log(`matter: ${(e as Error)?.stack ?? e}`));
    }, 1500);
    return driver;
  },
  /** a device from its setup code (what the Commission page's Go does) */
  commission(code: string): void {
    void this.driver?.commission(code);
  },
  stop(): void {
    void this.driver?.stop();
    this.driver = undefined;
  },
};

(globalThis as unknown as { IvaMatter: typeof IvaMatter }).IvaMatter = IvaMatter;

export { IvaMatter };
