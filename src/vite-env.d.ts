/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to 'web' only by vite.config.web.ts (the GitHub Pages build). */
  readonly VITE_TARGET?: 'web';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
