const { Redis } = require('@upstash/redis');

// Compat: mesma lista/ordem de /api/next-seller (painel Vesto)
const SELLERS = [
  { label: 'larissa', phone: '5547991158287' },
  { label: 'ana', phone: '5547992562582' },
  { label: 'alice', phone: '5547992498733' },
  { label: '992020510', phone: '5547992020510' },
];

const MESSAGE = 'Olá, vim do site e queria comprar em atacado';
const REDIS_KEY = 'homelisas:whatsapp:seller-seq';

const LINKS = SELLERS.map(
  (s) =>
    'https://wa.me/' +
    s.phone +
    '?text=' +
    encodeURIComponent(MESSAGE)
);

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redis = getRedis();
  let count = null;
  let source = 'redis';

  if (redis) {
    count = await incrCounter(redis);
  }

  if (count === null) {
    source = 'unavailable';
    return res.status(503).json({
      error: 'Counter unavailable',
      hint: 'Connect Upstash Redis on Vercel (KV_REST_API_URL / KV_REST_API_TOKEN)',
    });
  }

  const index = (((count - 1) % SELLERS.length) + SELLERS.length) % SELLERS.length;
  const seller = SELLERS[index];

  return res.status(200).json({
    ok: true,
    index,
    phone: seller.phone,
    label: seller.label,
    url: LINKS[index],
    message: MESSAGE,
    count,
    seq: count,
    source,
    total: SELLERS.length,
  });
};
