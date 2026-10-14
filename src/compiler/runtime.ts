/**
 * The JSX runtime iva projects are compiled with (`jsxImportSource: 'iva'`).
 * Elements are plain data; function components run right away, so a
 * project evaluates to a tree of iva's own elements only.
 */

export interface Source {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

export interface VNode {
  $$iva: 1;
  type: string;
  props: Record<string, any>;
  children: Child[];
  source?: Source;
}

export type Child = VNode | string | number | boolean | null | undefined | Child[];

const INTRINSIC = Symbol.for('iva.intrinsic');

export const Fragment = Symbol.for('iva.fragment');

/** @internal */
export function isVNode(v: unknown): v is VNode {
  return !!v && typeof v === 'object' && (v as VNode).$$iva === 1;
}

/** An iva element: `<Button>` etc. Calling it directly works too.
 * @internal */
export function intrinsic<P>(name: string): (props: P) => VNode {
  const fn = (props: any) => make(name, props);
  Object.defineProperty(fn, 'name', { value: name });
  (fn as any)[INTRINSIC] = name;
  return fn as any;
}

function make(type: string, props: Record<string, any> | null, source?: Source): VNode {
  const { children, ...rest } = props ?? {};
  return { $$iva: 1, type, props: rest, children: children === undefined ? [] : Array.isArray(children) ? children : [children], source };
}

/** Thrown with the element's place in the source. (The compiler checks the
 * name, not the class: the project bundle carries its own copy of this file.)
 * @internal */
export class JsxError extends Error {
  name = 'JsxError';
  constructor(message: string, public source?: Source) {
    super(message);
  }
}

/** @internal */
export function jsxDEV(type: any, props: Record<string, any> | null, _key?: unknown, _static?: boolean, source?: Source): Child {
  if (type === Fragment) return (props?.children ?? []) as Child;
  if (typeof type === 'function') {
    const name = type[INTRINSIC];
    if (name) return make(name, props, source);
    try {
      return type(props ?? {});
    } catch (e: any) {
      // keep the original error (its stack points into the component); the
      // call site is the fallback location
      if (e && typeof e === 'object' && e.name !== 'JsxError' && !e.ivaSource) e.ivaSource = source;
      throw e;
    }
  }
  if (typeof type === 'string') {
    throw new JsxError(`<${type}> is not an iva element (iva elements start with a capital letter: <Button>, <Text>, ...)`, source);
  }
  throw new JsxError(`invalid element type: ${String(type)} (an import that is undefined?)`, source);
}

export const jsx = (type: any, props: Record<string, any> | null, key?: unknown) => jsxDEV(type, props, key);
export const jsxs = jsx;

/** What editors check JSX against: iva elements are functions, there are no HTML tags. */
export declare namespace JSX {
  type Element = VNode;
  interface IntrinsicElements {}
  interface ElementChildrenAttribute {
    children: {};
  }
  /** props typed `any` (a plain-JS component's untyped props) */
  type UntypedKeys<P> = { [K in keyof P]-?: 0 extends 1 & P[K] ? K : never }[keyof P];
  /** A component's untyped props are optional; typed ones (iva's, JSDoc'd) are checked as declared. */
  type LibraryManagedAttributes<C, P> = [UntypedKeys<P>] extends [never] ? P : Omit<P, UntypedKeys<P>> & Partial<Pick<P, UntypedKeys<P>>>;
}
