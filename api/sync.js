module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    body = body || {};

    const targetUrl = String(body.targetUrl || '').trim();
    const payload = body.payload || {};

    if (!targetUrl) {
      res.status(400).json({ success: false, message: 'NO_TARGET_URL' });
      return;
    }

    let parsed;
    try { parsed = new URL(targetUrl); } catch (_) {
      res.status(400).json({ success: false, message: 'INVALID_TARGET_URL' });
      return;
    }

    const allowedHost = parsed.hostname === 'script.google.com';
    const allowedPath = parsed.pathname.startsWith('/macros/s/');
    if (!allowedHost || !allowedPath || parsed.protocol !== 'https:') {
      res.status(400).json({ success: false, message: 'TARGET_NOT_ALLOWED' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let upstream;
    try {
      upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); }
    catch (_) {
      res.status(502).json({
        success: false,
        message: 'UPSTREAM_NON_JSON',
        upstreamStatus: upstream.status,
        preview: text.slice(0, 300)
      });
      return;
    }

    res.status(upstream.ok ? 200 : 502).json(data);
  } catch (err) {
    const message = err && err.name === 'AbortError'
      ? 'PROXY_TIMEOUT'
      : (err && err.message ? err.message : String(err));
    res.status(502).json({ success: false, message });
  }
};
