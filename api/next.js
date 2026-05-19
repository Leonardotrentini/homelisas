const WHATSAPP_MSG =
  'Ol%C3%A1%2C%20vim%20do%20site!%20E%20quero%20comprar%20no%20atacado!';
const LINKS = [
  `https://wa.me/5547992020510?text=${WHATSAPP_MSG}`,
  `https://wa.me/5547992562582?text=${WHATSAPP_MSG}`,
];
const COUNTER_URL = 'https://api.counterapi.dev/v1/homelisas/whatsapp/up';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let count = 0;
  try {
    const response = await fetch(COUNTER_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Counter API ${response.status}`);
    const data = await response.json();
    count = Number(data.count);
    if (!Number.isFinite(count) || count < 1) throw new Error('Invalid count');
  } catch {
    count = Date.now();
  }

  const index = (count - 1) % LINKS.length;
  const safeIndex = ((index % LINKS.length) + LINKS.length) % LINKS.length;

  return res.status(200).json({
    index: safeIndex,
    url: LINKS[safeIndex],
    count,
  });
};
