const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const c = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
(async () => {
  const key = 'promo/.public-test';
  await c.send(new PutObjectCommand({ Bucket: 'medprom-media', Key: key, Body: Buffer.from('x'), ContentType: 'text/plain' }));
  let status = 'n/a';
  try {
    const r = await fetch(`${process.env.R2_PUBLIC_URL}/${key}`);
    status = `${r.status} ${r.headers.get('content-type') || ''}`;
  } catch (e) {
    status = `fetch-err: ${e.message}`;
  }
  console.log('R2_PUBLIC_URL:', process.env.R2_PUBLIC_URL, '→', status);
  await c.send(new DeleteObjectCommand({ Bucket: 'medprom-media', Key: key }));
  console.log('cleaned');
})().catch((e) => { console.error('err:', e.message); process.exit(1); });
