/**
 * Server pratinjau lokal untuk verifikasi visual build produksi.
 *
 * Menyajikan dist/ DAN mem-proksikan /api/* ke API produksi, sehingga katalog
 * nyata ikut termuat tanpa perlu melonggarkan whitelist CORS produksi.
 *
 *   node scripts/preview-server.mjs [port]
 *
 * Hanya alat verifikasi lokal — tidak dipakai di produksi.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.argv[2] || 4173);
const API = process.env.PREVIEW_API || 'https://promapi.metmalcommunityspace.web.id';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Proksi API — menghindari CORS dengan menyatukan origin.
  // Meneruskan body, cookie, dan Set-Cookie agar alur login ikut teruji.
  if (url.pathname.startsWith('/api/')) {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      const headers = { accept: 'application/json' };
      if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
      if (req.headers.cookie) headers.cookie = req.headers.cookie;

      const upstream = await fetch(API + url.pathname + url.search, {
        method: req.method,
        headers,
        body,
      });

      const out = Buffer.from(await upstream.arrayBuffer());
      const resHeaders = {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      };
      // Cookie sesi: buang atribut Secure/Domain agar berlaku di http://127.0.0.1.
      const setCookie = upstream.headers.getSetCookie?.() ?? [];
      if (setCookie.length > 0) {
        resHeaders['Set-Cookie'] = setCookie.map((c) =>
          c
            .split(';')
            .filter((p) => !/^\s*(secure|domain=)/i.test(p))
            .join(';')
            .replace(/samesite=none/i, 'SameSite=Lax'),
        );
      }
      res.writeHead(upstream.status, resHeaders);
      res.end(out);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
    return;
  }

  // Berkas statis; selain itu jatuh ke index.html (rute SPA).
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html');
  }

  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Pratinjau siap di http://127.0.0.1:${PORT} (API → ${API})`);
});
