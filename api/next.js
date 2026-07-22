const WHATSAPP_MSG =
  'Ol%C3%A1%2C%20vim%20do%20site%20e%20queria%20comprar%20em%20atacado';

const PHONES = [
  '5547992562582',
  '5547992498733',
  '5547991158287',
];

const LINKS = PHONES.map(
  (phone) => `https://wa.me/${phone}?text=${WHATSAPP_MSG}`
);

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = 'homelisas:whatsapp:seq:v3';
const COUNTER_URL = 'https://api.counterapi.dev/v1/homelisas/wa-rotate-v3/up';

async function fetchJson(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function incrRedis() {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const data = await fetchJson(
    `${REDIS_URL}/incr/${encodeURIComponent(REDIS_KEY)}`,
    { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } },
    1500
  );
  if (!data) return null;
  const n = Number(data.result);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function incrCounterApi() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await fetchJson(
      COUNTER_URL,
      { headers: { Accept: 'application/json' } },
      3000
    );
    if (data) {
      const n = Number(data.count);
      if (Number.isFinite(n) && n > 0) return n;
    }
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
  }
  return null;
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

  let count = await incrRedis();
  let source = 'redis';

  if (count === null) {
    count = await incrCounterApi();
    source = 'counterapi';
  }

  if (count === null) {
    // Avoid Date.now (breaks sequential fairness). Use a coarse shared fallback
    // only if every remote counter fails — still cycles through all 3 phones.
    count = Math.floor(Date.now() / 1000);
    source = 'fallback';
  }

  const index = (((count - 1) % LINKS.length) + LINKS.length) % LINKS.length;

  return res.status(200).json({
    index,
    phone: PHONES[index],
    url: LINKS[index],
    count,
    source,
    total: LINKS.length,
  });
};
