# AGENTS.md — medprom-metmal

Platform pengajuan materi media promosi tenant Metropolitan Mall Bekasi.
Bahasa UI dan pesan error: **Indonesia**. Katalog media bersumber dari deck
"MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026".

## Arsitektur

- Frontend: React 19 + Vite + Tailwind v4, SPA di Vercel (semua path rewrite ke `index.html`).
- API: Express 4 + Postgres 16 di VPS via Docker Compose, Caddy proxy ke `127.0.0.1:3002`.
- Storage: Google Drive akun `mediapromosi.metmalbekasi@gmail.com` (REST v3 via fetch, tanpa SDK).
- Lookup tenant: API loyalitas MID (opsional; kosong = fallback isian manual).

```
Browser → Vercel (FE) → REST /api/v1 → API VPS → Postgres / Drive / API MID
```

## Setup lokal

Prasyarat: Node 20+, Postgres 16.

```bash
npm ci
cp .env.example .env          # isi DATABASE_URL, JWT_SECRET, GOOGLE_*
npm run db:migrate            # idempotent — aman diulang
npm run db:seed               # idempotent — tidak menimpa harga/ketentuan admin
ADMIN_PASSWORD='...' node server/scripts/create-admin.mjs admin@metmal.co.id '' 'Admin Medprom'
npm run dev:api               # → http://localhost:3001
npm run dev                   # → http://localhost:5173
```

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` / `npm run dev:api` | FE / API mode pengembangan |
| `npm test` | Vitest (route server + komponen) |
| `npm run build` | `tsc && vite build` — **wajib hijau sebelum commit** |
| `npm run db:migrate` / `npm run db:seed` | Skema / katalog (idempotent) |
| `node scripts/verify-e2e.mjs` | Verifikasi browser: katalog → form → dashboard → riwayat |
| `node scripts/verify-tenant-upload.mjs` | Verifikasi upload file nyata (butuh `VERIFY_PASSWORD`) |
| `node scripts/verify-admin-flow.mjs` | Verifikasi status staf → terlihat tenant |
| `node scripts/drive-auth.mjs` | Produksi `GOOGLE_REFRESH_TOKEN` (sekali, mesin lokal) |
| `node scripts/drive-sweep.mjs [--apply]` | Laporan file Drive yatim; `--apply` hapus yang > 24 jam |

Gate verifikasi: `npm run build` + `npx vitest run` (44/44) + `node --check` file server yang diubah.

## Standar kode

- **Diff minimal dan bedah**: ubah baris yang perlu saja; jangan format ulang file. Konvensi kedua di samping yang ada dilarang — ikuti pola file.
- **Tanpa dependensi baru** tanpa persetujuan (multpart di-parse manual, tanpa multer/SDK).
- Warna via token (`var(--brand-*)`), bukan hex hardcode. Kontras teks AA: `*-600/700` untuk teks kecil, bukan `*-500`.
- Klaim di komentar/docs harus cocok dengan kode — docs basi wajib diperbaiki saat menyentuh area itu.
- Research dulu sebelum edit: baca bagian file yang relevan, cek callsites (`lsp references` untuk simbol ekspor).
- Envelope respons: `{ success, error?, data? }`. Error message Indonesia, verbatim ke UI.
- Fail-closed: konfigurasi hilang (MID key, Drive) → tolak bersih, jangan bypass.
- Input selalu `sanitize` (batas panjang, strip NUL). Rate limit: submit 10/60 mnt/IP, upload 5/15 mnt/IP, fingerprint 5/24 jam.
- Klaim klien tidak dipercaya: nama/MIME/ukuran diambil dari metadata Drive; magic bytes dicek SEBELUM tulis ke Drive.
- Konstanta sinkron FE↔BE: batas 50MB di `src/constants/promo.ts` dan `server/src/drive.js`.
- Satu objek Drive = satu pengajuan (`drive_file_id` guard + unique index).

## Testing

- Runner Vitest. Test route di `__tests__/api/`, test komponen co-located (`__tests__/` di samping komponen).
- Setiap komponen baru wajib mount test (impor `useEffect` tanpa call-site = bau bug).
- E2E via Playwright chromium langsung (`node -e`/`mjs` + `page.route`); satu handler route-mock dengan dispatch internal (bukan banyak `p.route`).
- Test baru hanya untuk kontrak yang rapuh; jangan assert implementasi/plumbing. Test basi yang mengunci teks/insidental → hapus, jangan re-pin.

## Commit & rilis

- Pesan commit konvensional berbahasa Indonesia: `feat|fix|docs|ops|chore|security: ...` (imperatif, area jelas).
- Sebelum commit: build hijau + test hijau + scan secret (`git diff --cached --name-only` tidak memuat `.env`, `client_secret*`, `*-token.json`).
- `CHANGELOG.md` mengikuti Keep a Changelog + SemVer; setiap rilis fitur → bump `package.json` + entri changelog.
- **Urutan deploy wajib**: API + skema dulu, frontend terakhir. Frontend baru di atas API lama = tombol yang pasti gagal.

## Storage Drive & secrets

- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, opsional `DRIVE_ROOT_FOLDER_ID`. Hanya template (`*.example`) yang ikut git.
- Produksi token: `GOOGLE_CLIENT_ID/SECRET=... node scripts/drive-auth.mjs`, buka URL, login akun mediapromosi, izinkan. Syarat GCP: akun mediapromosi terdaftar di **OAuth consent screen → Test users** (status Testing) + Drive API enabled. Redirect URI persis `http://localhost:3715/callback`.
- `.env` dan `scripts/client_secret_*.json` git-ignore — tidak pernah commit. `deploy/vps/.env` tidak ada di repo; salin manual 3 var `GOOGLE_*` dari `.env` lokal saat deploy.
- Alur upload: browser → `POST /api/v1/drive/upload` (multipart streaming) → `POST /api/v1/promo/submit` dengan `drive_file_id`. Mode tautan: URL http(s) saja, tanpa file.

## Deploy & operasional

Panduan penuh: `deploy/vps/README-DEPLOY.md`. Ringkasnya: rsync repo (tanpa `node_modules/dist/.env*`) → `cp .env.example .env` → `docker compose up -d` → `db-migrate` + `seed` (dari container api) → Caddy subdomain → smoke `GET /healthz` → Vercel (`VITE_API_URL`) → isi `CORS_ORIGIN` → restart api.

- Backup DB: cron 03:30 WIB, `pg_dump` gzip, retensi 14 hari.
- Sweep Drive yatim: cron opsional setelah backup.

## Struktur

```
src/components/promo/   katalog, wizard pengajuan, riwayat, tenant-select
src/components/admin/   login + dashboard staf
src/utils/ + src/lib/rest.ts   promoApi, adminApi, fingerprint, klien REST
server/src/drive.js     upload/verifikasi/delete/metadata Drive
server/src/routes/      promo (publik), admin (staf), auth
server/schema.sql       skema (sumber migrate)
scripts/                db-migrate, drive-auth, drive-sweep, verify-*
__tests__/api/          test route server
deploy/vps/             docker-compose, .env.example, panduan deploy
```

Lisensi: proprietary, internal Metropolitan Mall Bekasi.
