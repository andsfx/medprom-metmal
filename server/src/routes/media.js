/**
 * routes/media.js — penyajian gambar katalog yang diunggah staf.
 *
 *   GET /api/v1/media/:nama   — sajikan gambar (publik, cache selamanya)
 *
 * Hanya melayani berkas dari MEDIA_DIR (volume Docker). Foto bawaan deck
 * disajikan Vercel dari /media/*, bukan dari sini.
 */
import express from 'express';
import { kirimGambar } from '../media.js';

const router = express.Router();

router.get('/:nama', async (req, res) => {
  await kirimGambar(req.params?.nama, res);
});

export default router;
