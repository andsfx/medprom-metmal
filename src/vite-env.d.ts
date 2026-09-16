/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** '0' menyembunyikan kanal unggah berkas (instance tanpa kredensial Drive). */
  readonly VITE_PROMO_UPLOAD_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
