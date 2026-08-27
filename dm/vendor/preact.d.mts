/* Hand-written declarations for the vendored, minified preact — dev-only,
   read by `tsc --checkJs` and by nothing else. They exist so the typechecker
   does not try to infer types out of a minified bundle (it produces two
   hundred errors in code we did not write and will never edit), and so the
   handful of entry points this app actually uses are typed rather than any.

   preact.mjs itself stays byte-for-byte upstream. If it is ever updated,
   this file is the only thing to reconcile — and only if these five exports
   change shape, which they have not since 2016. */

export interface VNode {
  type: unknown;
  props: Record<string, unknown>;
  key: string | number | null;
}

export type ComponentChildren = unknown;

export function h(type: unknown, props?: unknown, ...children: unknown[]): VNode;

export function render(
  vnode: VNode | null,
  parent: Element | Document | ShadowRoot | DocumentFragment,
): void;

export const Fragment: unknown;

export class Component<P = Record<string, unknown>, S = Record<string, unknown>> {
  props: P;
  state: S;
  setState(next: Partial<S> | ((prev: S, props: P) => Partial<S>)): void;
  forceUpdate(): void;
  render(props?: P, state?: S): VNode | null;
}
