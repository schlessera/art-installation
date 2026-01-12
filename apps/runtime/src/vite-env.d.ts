/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GALLERY_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
