/* Hand-written declarations for the vendored, minified htm — see the note in
   preact.d.mts. `html` is a tagged template that returns whatever the bound
   hyperscript function returns: one vnode, or an array of them when the
   template has several roots. */

import type { VNode } from './preact.mjs';

declare const htm: {
  bind(
    h: (type: unknown, props?: unknown, ...children: unknown[]) => VNode,
  ): (strings: TemplateStringsArray, ...values: unknown[]) => VNode | VNode[];
};

export default htm;
