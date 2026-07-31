/**
 * localStorage that cannot take the page down.
 *
 * Accessing `window.localStorage` THROWS — it does not return null — when an
 * origin has site data blocked, in some private-browsing modes, and under
 * hardened privacy settings. The portal read it from three lazy useState
 * initialisers, i.e. during first render, so on those browsers React unwound the
 * initial mount and `#root` stayed empty. Now that index.html is the site root,
 * that was a blank dark page at the public URL with no message and no console
 * hint a normal visitor would find — and it is not reproducible in a browser
 * where storage works, so it would have gone unnoticed indefinitely.
 *
 * Everything degrades to an in-memory map: the session works, it just does not
 * persist. That is the right trade for a visitor who has deliberately blocked
 * storage anyway.
 */

const memory = new Map<string, string>();
let warned = false;

function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[looking-glass] localStorage is unavailable (site data blocked or private mode). ' +
      'Your API key and settings will not persist beyond this tab.',
    err,
  );
}

export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      warnOnce(err);
      return memory.get(key) ?? null;
    }
  },

  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      warnOnce(err);
      memory.set(key, value);
    }
  },

  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      warnOnce(err);
      memory.delete(key);
    }
  },

  /** Whether writes actually survive a reload. Drives honest UI copy. */
  get isPersistent(): boolean {
    try {
      const probe = '__lg_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  },
};
