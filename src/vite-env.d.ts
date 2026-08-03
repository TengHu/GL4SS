/// <reference types="vite/client" />

/** Set in vite.config.ts from git — the commit this bundle was assembled from. */
interface ImportMetaEnv {
  readonly VITE_BUILD?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
