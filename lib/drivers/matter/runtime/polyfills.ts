/**
 * What matter.js takes for granted that a panel's WebView may lack: the
 * resource-management symbols (matter.js reads obj[Symbol.dispose] itself,
 * a plain symbol does) and Promise.withResolvers.
 */

const S = Symbol as unknown as { dispose?: symbol; asyncDispose?: symbol };
if (!S.dispose) S.dispose = Symbol('Symbol.dispose');
if (!S.asyncDispose) S.asyncDispose = Symbol('Symbol.asyncDispose');

const P = Promise as unknown as { withResolvers?: <T>() => { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (e?: unknown) => void } };
if (!P.withResolvers) {
  P.withResolvers = <T>() => {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export {};
