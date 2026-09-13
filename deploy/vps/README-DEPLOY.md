# Deploy VPS — medprom-metmal (API)

Frontend di **Vercel**, API + Postgres di **VPS** (sama box dengan app event
Metmal: `vm-2-245-ubuntu`, 100.69.24.32 via Tailscale). Caddy host memegang
TLS dan mem-proxy subdomain baru ke `127.0.0.1:3002`.

## 1. Prasyarat

- VPS: Docker + Caddy aktif (sudah ada; app event lama jalan di 127.0.0.1:8080).
- Cloudflare R2: buat bucket **`medprom-media`** + token access key (Account →
  R2 → Manage API Tokens). Catat `R2_PUBLIC_URL` (tab Settings → Public access).
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

## 8. Operasional

- Backup DB: mirror `backup.sh` app lama (cron pg_dump ke `/opt/medprom/backups`).
- Log: `docker compose logs -f api`.
- Akun baru/reset password: lihat perintah di `/admin` tab Pengguna, atau
  `create-admin.mjs --reset` (env `ADMIN_PASSWORD`, role via `ADMIN_ROLE`).
- MID_API_KEY: begitu Metland memberi key → isi di `.env`, `docker compose
  up -d`; pencarian gerai aktif otomatis (tanpa perubahan kode).
