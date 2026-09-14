/**
 * Give jsdom tests a working `localStorage` / `sessionStorage`.
 *
 * ── Why this is needed at all ────────────────────────────────────────────
 * Node 22 ships its own EXPERIMENTAL `localStorage` global. It takes the name
 * before jsdom can install its implementation, and then refuses to work
 * without `--localstorage-file`:
 *
 *   ExperimentalWarning: localStorage is not available because
 *   --localstorage-file was not provided.
 *
 * The result is a jsdom environment where `window` exists, `location` is
 * correct, and `localStorage` is `undefined` — so `localStorage.clear()` in a
 * beforeEach throws "Cannot read properties of undefined", and every test in
 * that file fails for a reason that has nothing to do with the code under
 * test. That is what had been happening to the six AuthStore tests.
 *
 * ── Why a shim rather than a Node flag ───────────────────────────────────
 * `--localstorage-file` would make Node's implementation work, but it
 * persists to a real file on disk, which is the opposite of what a test wants:
 * state would survive between runs. A per-run in-memory implementation is both
 * simpler and more correct for tests, and it does not depend on a Node flag
 * that may change again.
 *
 * Defensive on purpose: if a real implementation is present (a future Node,
 * a different environment), this leaves it alone.
 */

class MemoryStorage implements Storage {
  #data = new Map<string, string>();

  get length(): number {
    return this.#data.size;
  }
  clear(): void {
    this.#data.clear();
  }
  getItem(key: string): string | null {
    // Storage returns null for a missing key, never undefined.
    return this.#data.has(String(key)) ? this.#data.get(String(key))! : null;
  }
  key(index: number): string | null {
    return [...this.#data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.#data.delete(String(key));
  }
  setItem(key: string, value: string): void {
    // The real Storage coerces both to strings; tests that pass a number
    // should behave the same here as in a browser.
    this.#data.set(String(key), String(value));
  }
}

function works(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  try {
    const s = candidate as Storage;
    const probe = '__storage_probe__';
    s.setItem(probe, '1');
    const ok = s.getItem(probe) === '1';
    s.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}

function install(name: 'localStorage' | 'sessionStorage') {
  // Only in a DOM-ish environment. Node-environment tests have no business
  // with web storage and should keep failing if they touch it.
  if (typeof window === 'undefined') return;

  let existing: unknown;
  try {
    existing = (globalThis as Record<string, unknown>)[name];
  } catch {
    existing = undefined;
  }
  if (works(existing)) return;

  const storage = new MemoryStorage();
  for (const target of [globalThis, window] as unknown as Record<string, unknown>[]) {
    Object.defineProperty(target, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

install('localStorage');
install('sessionStorage');
