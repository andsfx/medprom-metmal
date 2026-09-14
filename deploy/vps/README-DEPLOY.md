# Deploy VPS — medprom-metmal (API)

Frontend di **Vercel**, API + Postgres di **VPS** (sama box dengan app event
Metmal: `vm-2-245-ubuntu`, 100.69.24.32 via Tailscale). Caddy host memegang
TLS dan mem-proxy subdomain baru ke `127.0.0.1:3002`.

## 1. Prasyarat

- VPS: Docker + Caddy aktif (sudah ada; app event lama jalan di 127.0.0.1:8080).
- Google Cloud: buat project, aktifkan Google Drive API, buat OAuth 2.0 client ID
  (Application type: "Web application"). Tambahkan URI redirect:
  `http://localhost:3000/oauth2callback`. Unduh credential JSON dan simpan
  sebagai `server/secrets/drive-credentials.json`. Jalankan `node server/scripts/drive-auth.mjs`
  untuk mendapatkan refresh token — isi `GOOGLE_DRIVE_REFRESH_TOKEN` di `.env`.
  Buat folder di Drive untuk penyimpanan media, catat folder ID-nya sebagai
  `GOOGLE_DRIVE_FOLDER_ID`.
- Domain: satu subdomain baru di `andotherstori.my.id` (mis.
  `promapi.andotherstori.my.id`) — DNS A record → IP publik VPS.

## 2. Taruh kode di VPS

```bash
# Dari lokal (Windows) — rsync repo tanpa node_modules:
rsync -az --delete --exclude node_modules --exclude dist --exclude .env* \
  /d/Andy/medprom-metmal/ root@100.69.24.32:/opt/medprom/
```

## 3. Konfigurasi & jalankan

```bash
ssh root@100.69.24.32
cd /opt/medprom/deploy/vps
cp .env.example .env && nano .env      # isi semua nilai
docker compose up -d                   # postgres + api (port internal 3002)

# Schema + seed katalog:
docker compose exec -T postgres psql -U medprom -d medprom -c '\dt'
docker compose exec -e PGPASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d= -f2) \
  api node -e 'console.log("see step 4")'
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
`db-migrate.mjs` menambah kolom `source_type` + `link_url` di
`promo_submissions` (mode kirim tautan), `seed-media-types.mjs`
menyinkronkan `accepted_formats` (mis. PNG menyusul JPEG) tanpa menimpa
harga/aturan yang sudah diedit admin.

## 5. Caddy subdomain

Tambah blok di `/etc/caddy/Caddyfile` lalu `caddy reload`:

```
promapi.andotherstori.my.id {
    reverse_proxy 127.0.0.1:3002
}
```

## 6. Smoke test API

```bash
curl -s https://promapi.andotherstori.my.id/healthz
# {"success":true,"data":{"status":"ok","db":true}}
curl -s https://promapi.andotherstori.my.id/api/v1/promo/media-types | head -c 300
```

## 7. Frontend → Vercel

```bash
cd D:/Andy/medprom-metmal
npm ci && npm run build
vercel link            # project baru: medprom-metmal
vercel env add VITE_API_URL production   # https://promapi.andotherstori.my.id
vercel --prod
```

Setelah deploy Vercel: isi `CORS_ORIGIN` di `.env` VPS dengan URL produksi
Vercel, lalu `docker compose up -d` (restart api).

## 8. Update ke rilis baru

Urutan ini **wajib**: API dan skema harus lebih dulu, frontend terakhir.
Frontend rilis 1.0.0 menampilkan opsi "Kirim Tautan", sementara API versi lama
menolaknya dengan `file_url wajib diisi`. Mendahulukan frontend membuat tenant
melihat tombol yang pasti gagal.

```bash
# 1. Kirim kode rilis ke VPS
rsync -az --delete --exclude node_modules --exclude dist --exclude .env* \
  /d/Andy/medprom-metmal/ root@100.69.24.32:/opt/medprom/

# 2. Restart API + terapkan skema dan katalog (keduanya idempotent)
ssh root@100.69.24.32
cd /opt/medprom/deploy/vps && docker compose up -d
docker compose exec api node scripts/db-migrate.mjs
docker compose exec api node server/scripts/seed-media-types.mjs

# 3. Pastikan API sudah versi baru — tautan valid TIDAK boleh ditolak
curl -s -X POST https://promapi.andotherstori.my.id/api/v1/promo/submit \
  -H 'Content-Type: application/json' \
  -d '{"media_type_slug":"spanduk","tenant_name":"Cek Rilis","pic_name":"Cek",
       "pic_phone":"081234567890","link_url":"https://drive.google.com/file/d/x/view"}'
# Masih menyebut "file_url wajib diisi" → API belum ter-update, JANGAN lanjut.

# 4. Katalog harus sudah memuat PNG
curl -s https://promapi.andotherstori.my.id/api/v1/promo/media-types \
  | grep -o '"accepted_formats":"[^"]*"' | head -3
# Harapan: JPEG,PNG,PDF

# 5. Baru deploy frontend
cd D:/Andy/medprom-metmal && npm ci && npm run build && vercel --prod
```

## 9. Operasional

- Backup DB **terpasang**: cron `30 3 * * *` (WIB) menjalankan
  `/opt/medprom/deploy/vps/backup.sh` → `pg_dump` gzip ke
  `/opt/medprom/backups`, retensi 14 hari, log di `/var/log/medprom-backup.log`.
  Restore: `gunzip -c <file>.sql.gz | docker compose exec -T postgres psql -U medprom -d medprom`.
  (03:30 — digeser dari backup app event 03:00 agar tidak berebut I/O.)
- Log: `docker compose logs -f api`.
- Akun baru/reset password: lihat perintah di `/admin` tab Pengguna, atau
  `create-admin.mjs --reset` (env `ADMIN_PASSWORD`, role via `ADMIN_ROLE`).
- MID_API_KEY: begitu Metland memberi key → isi di `.env`, `docker compose
  up -d`; pencarian tenant aktif otomatis (tanpa perubahan kode).
- Sweep file expired: cron `0 4 * * *` (WIB) menjalankan
  `docker compose exec api node server/scripts/drive-sweep.mjs` → menghapus file
  Drive lebih tua dari 30 hari yang tidak lagi dirujuk oleh pengajuan aktif.
  Log di `/var/log/medprom-sweep.log`.
