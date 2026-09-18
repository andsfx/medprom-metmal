# Deploy VPS — medprom-metmal (API)

Frontend di **Vercel**, API + Postgres di **VPS** (sama box dengan app event
Metmal: `vm-2-245-ubuntu`, 100.69.24.32 via Tailscale). Caddy host memegang
TLS dan mem-proxy subdomain baru ke `127.0.0.1:3002`.

## 1. Prasyarat

- VPS: Docker + Caddy aktif (sudah ada; app event lama jalan di 127.0.0.1:8080).
- Google Cloud: buat project, aktifkan Google Drive API, buat OAuth 2.0 client ID
  (Application type: "Web application"). Tambahkan redirect URI persis:
  `http://localhost:3715/callback`. Di **OAuth consent screen → Test users**,
  daftarkan `mediapromosi.metmalbekasi@gmail.com` (status Testing cukup untuk
  scope `drive.file`). Unduh JSON kredensial, lalu dari mesin lokal:
  `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/drive-auth.mjs`
  → buka URL, login akun mediapromosi, izinkan → isi `GOOGLE_REFRESH_TOKEN`
  di `.env` VPS. `DRIVE_ROOT_FOLDER_ID` opsional (kosong = root My Drive).
- Domain: subdomain di `metmalcommunityspace.web.id` (mis.
  `promapi.metmalcommunityspace.web.id`) — DNS A record → IP publik VPS.

## 2. Taruh kode di VPS

```bash
# Dari lokal (Windows) — rsync repo tanpa node_modules.
# WAJIB: ikut mengecualikan kredensial. `.gitignore` TIDAK berlaku di rsync,
# jadi tanpa baris exclude ini `scripts/client_secret_*.json` ikut tersalin ke VPS.
# Catatan: `.env.example` sengaja TIDAK dikecualikan (kecualikan `.env` spesifik,
# bukan pola `.env*`) supaya `cp .env.example .env` di langkah 3 tetap bisa jalan
# di VPS yang baru.
rsync -az --delete \
  --exclude node_modules --exclude dist \
  --exclude '.env' --exclude '.env.local' --exclude '.env.production' \
  --exclude '.vercel' --exclude '*.log' \
  --exclude 'client_secret*.json' --exclude '*-token.json' \
  --exclude 'backups/' \
  /d/Andy/medprom-metmal/ root@100.69.24.32:/opt/medprom/
```

## 3. Konfigurasi & jalankan

```bash
ssh root@100.69.24.32
cd /opt/medprom/deploy/vps
cp .env.example .env && nano .env      # isi semua nilai
docker compose up -d                   # postgres + api (port internal 3002)

# Pastikan container hidup dan tabel sudah ada:
docker compose ps
docker compose exec -T postgres psql -U medprom -d medprom -c '\dt'
```

## 4. Migrate schema + seed katalog + admin

Schema & seed jalan dari dalam container (DATABASE_URL internal):

```bash
docker compose exec api node scripts/db-migrate.mjs
docker compose exec api node server/scripts/seed-media-types.mjs

# Akun admin pertama — password via env, JANGAN argv:
ADMIN_PASSWORD='Password-Kuat-Min-8' docker compose exec -e ADMIN_PASSWORD \
  api node server/scripts/create-admin.mjs admin@metmal.co.id '' 'Admin Medprom'
```

Kedua perintah idempotent — aman dijalankan ulang setelah update kode.
`db-migrate.mjs` menerapkan `server/schema.sql`: kolom penyimpanan Drive
(`source_type`, `link_url`, `drive_file_id`), kolom data PRD (nomor pengajuan,
token status, snapshot unit, campaign/judul/deskripsi materi, periode tayang),
tabel versi materi/riwayat status/pemasangan, **serta remap status lama (4 nilai)
ke 8 nilai PRD**.
`seed-media-types.mjs` menyinkronkan `accepted_formats` dan `rules` — dua kolom
yang bersumber dari deck 2026 — tanpa menimpa harga/lokasi yang sudah diedit
admin. Menjalankan seed setelah update kode akan menyebarkan koreksi ketentuan
ke instance yang sudah jalan.

> **Saat memperbarui instance yang sudah jalan, hentikan API dulu sebelum
> menerapkan skema** — jangan `up -d` lalu `db-migrate` pada API lama
> (`AGENTS.md` pitfall #10). Constraint baru menolak nilai lama, jadi API lama
> yang melayani skema baru akan membalas 400 pada tiap pengajuan **padahal
> `/healthz` tetap hijau**. Urutan aman ada di langkah 7 (stop api → migrate →
> seed → up api). Blok di atas hanya untuk pemasangan pertama, saat belum ada
> API yang melayani trafik.

## 5. Caddy subdomain

Bloknya **berversi** di repo: `deploy/vps/Caddyfile`. Salin ke
`/etc/caddy/Caddyfile` (atau `import /opt/medprom/deploy/vps/Caddyfile`), lalu
`caddy reload --config /etc/caddy/Caddyfile`.

> **`header_up X-Real-IP {remote_host}` WAJIB ada.** `server/src/lib/rateLimit.js`
> memakai `X-Real-IP` sebagai identitas klien (X-Forwarded-For sengaja
> diabaikan). Tanpa `header_up` ini Caddy tidak menimpa nilai kiriman klien,
> sehingga rate limit bisa dilewati dengan memalsukan header.

## 6. Smoke test API

```bash
curl -s https://promapi.metmalcommunityspace.web.id/healthz
# {"success":true,"data":{"status":"ok","db":true}}
curl -s https://promapi.metmalcommunityspace.web.id/api/v1/promo/media-types | head -c 300
```

## 7. Frontend → Vercel

```bash
cd D:/Andy/medprom-metmal
npm ci && npm run build
vercel link            # project baru: medprom-metmal
vercel env add VITE_API_URL production   # https://promapi.metmalcommunityspace.web.id
vercel env add VITE_TURNSTILE_SITE_KEY production   # sitekey publik Turnstile
vercel --prod
```

Setelah deploy Vercel: isi `CORS_ORIGIN` di `.env` VPS dengan URL produksi
Vercel, lalu `docker compose up -d` (restart api).

Urutan ini **wajib**: API dan skema harus lebih dulu, frontend terakhir.
Mendahulukan frontend membuat tenant melihat tombol yang pasti gagal
(mis. opsi baru ditolak API lama).

```bash
# 1. Kirim kode rilis ke VPS (exclude kredensial — lihat langkah 2)
rsync -az --delete \
  --exclude node_modules --exclude dist \
  --exclude '.env' --exclude '.env.local' --exclude '.env.production' \
  --exclude '.vercel' --exclude '*.log' \
  --exclude 'client_secret*.json' --exclude '*-token.json' \
  --exclude 'backups/' \
  /d/Andy/medprom-metmal/ root@100.69.24.32:/opt/medprom/

# 2. Hentikan API lama, terapkan skema, baru naikkan API baru (pitfall #10).
#    Jangan `up -d` lebih dulu: API lama + constraint baru = tiap pengajuan
#    gagal 400 meski /healthz hijau. `run --rm` dipakai karena container api
#    sedang dimatikan (exec butuh container hidup).
ssh root@100.69.24.32
cd /opt/medprom/deploy/vps
docker compose stop api
docker compose run --rm api node scripts/db-migrate.mjs
docker compose run --rm api node server/scripts/seed-media-types.mjs
docker compose up -d api

# 3. Pastikan API sudah versi baru — tautan tidak valid harus ditolak dengan
#    pesan tautan, bukan "drive_file_id wajib diisi" (API lama).
curl -s -X POST https://promapi.metmalcommunityspace.web.id/api/v1/promo/submit \
  -H 'Content-Type: application/json' \
  -d '{"media_type_slug":"sosmed-feed","tenant_name":"Cek Rilis","pic_name":"Cek","pic_phone":"081234567890","link_url":"bukan-url"}'
# Harapan: {"success":false,"errors":["Tautan materi harus berupa URL http/https yang valid"]}
# Pesan lain (mis. "drive_file_id wajib diisi") → API belum ter-update, JANGAN lanjut.

# 4. Katalog harus sudah tersinkron dari deck (butuh `db:seed` terbaru)
curl -s https://promapi.metmalcommunityspace.web.id/api/v1/promo/media-types \
  | grep -o '"accepted_formats":"[^"]*"' | head -3
# Harapan: media cetak memuat JPEG,PNG,PDF (Digital Poster: JPEG saja)

curl -s https://promapi.metmalcommunityspace.web.id/api/v1/promo/media-types \
  | grep -c 'marketing@malmetropolitan.com'
# Harapan: 2 (sosmed-feed + sosmed-story). Angka 0 → seed belum dijalankan.

# 5. Baru deploy frontend
cd D:/Andy/medprom-metmal && npm ci && npm run build && vercel --prod
```

## 8. Operasional

- Backup DB **terpasang**: cron `30 3 * * *` (WIB) menjalankan
  `/opt/medprom/deploy/vps/backup.sh` → `pg_dump` gzip ke
  `/opt/medprom/backups`, retensi 14 hari, log di `/var/log/medprom-backup.log`.
  Restore: `gunzip -c <file>.sql.gz | docker compose exec -T postgres psql -U medprom -d medprom`.
  (03:30 — digeser dari backup app event 03:00 agar tidak berebut I/O.)
- Log: `docker compose logs -f api`.
- Akun baru/reset password: lihat perintah di `/admin` tab Pengguna, atau
  `create-admin.mjs --reset` (env `ADMIN_PASSWORD`, role via `ADMIN_ROLE`).
- MID_API_KEY: begitu Metland memberi key → isi di `.env`, lalu
  `docker compose up -d` (restart api). Selama kosong, pemilih tenant memakai
  fallback isian nama manual.
- Captcha Turnstile: buat widget di dashboard Cloudflare, lalu isi
  `TURNSTILE_SECRET_KEY` **dan** `TURNSTILE_HOSTNAMES` (hostname frontend
  produksi, dipisah koma; tanpa `localhost`) di `.env` VPS, serta
  `VITE_TURNSTILE_SITE_KEY` di env Vercel (build ulang). Tanpa secret key,
  verifikasi `/lacak` dilewati dan server menulis peringatan saat boot; secret
  terisi tanpa allowlist hostname membuat verifikasi ditolak `503`.
- Sweep file yatim (opsional): cron `0 4 * * *` (WIB) menjalankan
  `node scripts/drive-sweep.mjs --apply >> /var/log/medprom-sweep.log 2>&1`
  dari host yang punya env `GOOGLE_*` + `DATABASE_URL` → tanpa `--apply`
  hanya melapor; dengan `--apply` menghapus file yatim > 24 jam (diupload
  tapi tak pernah jadi pengajuan). Bukan `docker compose exec` (skrip butuh
  kredensial host, path-nya `scripts/` bukan `server/scripts/`).
