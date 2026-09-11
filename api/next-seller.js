const { Redis } = require('@upstash/redis');

// Mesma lista do painel Vesto → Integrações → Meta
const SELLERS = [
  { label: 'larissa', phone: '5547991158287' },
  { label: 'ana', phone: '5547992562582' },
  { label: 'alice', phone: '5547992498733' },
];

const MESSAGE = 'Olá, vim do site e queria comprar em atacado';
const REDIS_KEY = 'homelisas:whatsapp:seller-seq';

function getRedis() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function incrCounter(redis) {
  try {
    const count = await redis.incr(REDIS_KEY);
    const n = Number(count);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const redis = getRedis();
  let seq = null;

  if (redis) {
    seq = await incrCounter(redis);
  }

  if (seq === null) {
    return res.status(503).json({
      ok: false,
      error: 'Counter unavailable',
      hint: 'Connect Upstash Redis on Vercel (KV_REST_API_URL / KV_REST_API_TOKEN)',
    });
  }

  const index = (((seq - 1) % SELLERS.length) + SELLERS.length) % SELLERS.length;
  const seller = SELLERS[index];

  return res.status(200).json({
    ok: true,
    phone: seller.phone,
    label: seller.label,
    index,
    total: SELLERS.length,
    seq,
    message: MESSAGE,
  });
};
