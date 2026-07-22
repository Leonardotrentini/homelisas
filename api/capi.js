const PIXEL_ID = process.env.META_PIXEL_ID || '820651490741491';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const GRAPH_VERSION = 'v21.0';

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim();
  return req.headers['x-real-ip'] || null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e5) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventName = String(body.event_name || '').trim();
  const allowed = new Set(['PageView', 'Lead', 'Contact', 'ViewContent']);
  if (!allowed.has(eventName)) {
    return res.status(400).json({ error: 'Invalid event_name' });
  }

  const eventId =
    String(body.event_id || '').trim() ||
    `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const userData = {
    client_user_agent: req.headers['user-agent'] || undefined,
  };

  const ip = clientIp(req);
  if (ip) userData.client_ip_address = ip;

  const fbp = body.fbp ? String(body.fbp).slice(0, 128) : '';
  const fbc = body.fbc ? String(body.fbc).slice(0, 256) : '';
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    user_data: userData,
  };

  const sourceUrl = body.event_source_url
    ? String(body.event_source_url).slice(0, 2048)
    : '';
  if (sourceUrl) event.event_source_url = sourceUrl;

  if (eventName === 'Lead' || eventName === 'Contact') {
    event.custom_data = {
      content_name: 'whatsapp_consultor',
      content_category: 'atacado',
    };
  }

  const payload = {
    data: [event],
    // Helps Meta validate payload in Events Manager test events when provided
    ...(body.test_event_code
      ? { test_event_code: String(body.test_event_code).slice(0, 32) }
      : {}),
  };

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: data.error || data,
      });
    }

    return res.status(200).json({
      ok: true,
      event_id: eventId,
      events_received: data.events_received,
      fbtrace_id: data.fbtrace_id,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'CAPI request failed' });
  }
};
