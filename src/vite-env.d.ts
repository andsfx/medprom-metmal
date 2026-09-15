/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** '1' menyalakan mode unggah legacy di wizard (default: link-only). */
  readonly VITE_PROMO_UPLOAD_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
