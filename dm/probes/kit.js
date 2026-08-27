/* What every probe needs, so that no probe reinvents it — and, more to the
   point, so that a probe that throws still REPORTS. An exception on line 40
   used to mean "did not report", which reads like a hang and hides the actual
   error one line up.

   Probes report by console.log because there is no relay any more: the runner
   (probes/run.sh) reads the line back off Chrome's stderr. */

/** @type {{ok: boolean, name: string, got?: unknown, want?: unknown}[]} */
const results = [];

/** One assertion. Compared by shape, so arrays and objects read naturally. */
export function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push({ ok, name, ...(ok ? {} : { got, want }) });
  return ok;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Wait for a condition to become truthy — two windows, a render and a disk
    write are all asynchronous with respect to each other, and polling is
    honest about that where a fixed sleep only looks like it is. */
export async function until(fn, ms = 5000) {
  const stop = Date.now() + ms;
  for (;;) {
    let v;
    try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() > stop) return null;
    await sleep(50);
  }
}

export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];
export const byText = (sel, text) =>
  $$(sel).find(el => el.textContent.trim().includes(text));

/** Type into an uncontrolled box the way a person does: put the value in, then
    fire the event the component is actually listening for. */
export function type(input, value, event = 'change') {
  input.value = value;
  input.dispatchEvent(new Event(event, { bubbles: true }));
}

/** An empty OPFS root to build a campaign in. Keys are collected before
    anything is removed: deleting while iterating the same directory skips
    entries and leaves the probe running against somebody else's leftovers. */
export async function freshRoot() {
  const root = await navigator.storage.getDirectory();
  const names = [];
  for await (const name of root.keys()) names.push(name);
  for (const name of names) {
    try { await root.removeEntry(name, { recursive: true }); } catch { /* raced */ }
  }
  return root;
}

/**
 * Run a probe body and report whatever happened — including an exception,
 * which becomes a failed check rather than a silent hang.
 * @param {string} name the sentinel the runner greps for, e.g. 'MESA'
 * @param {() => Promise<void>} body
 */
export async function probe(name, body) {
  let thrown = null;
  try {
    await body();
  } catch (e) {
    thrown = (e && e.stack) || String(e);
    results.push({ ok: false, name: 'the probe threw', got: thrown, want: 'no exception' });
  }
  const failed = results.filter(r => !r.ok);
  const out = document.getElementById('out');
  if (out) out.textContent = results.map(r => (r.ok ? '✔ ' : '✖ ') + r.name).join('\n');
  console.log(`PROBE:${name} ` + JSON.stringify({
    total: results.length, failed: failed.length, failures: failed,
  }));
}
