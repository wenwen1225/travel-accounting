// Read-only GAS proxy for isolated testing. Never accepts arbitrary target URLs.
// Configure TRAVEL_GAS_URL as a Vercel server environment variable.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({success:false, code:'METHOD_NOT_ALLOWED'});
  }
  const action = req.body && typeof req.body === 'object'
    ? req.body.action
    : (() => { try { return JSON.parse(req.body || '{}').action; } catch (_) { return ''; } })();
  if (!['getAllData', 'getVersion', 'getCloudRevision'].includes(action)) {
    return res.status(403).json({success:false, code:'READ_ONLY'});
  }
  const gasUrl = process.env.TRAVEL_GAS_URL || '';
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gasUrl)) {
    return res.status(503).json({success:false, code:'GAS_NOT_CONFIGURED'});
  }
  try {
    const response = await fetch(gasUrl, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action}), redirect:'follow',
      signal:AbortSignal.timeout(22000)
    });
    const raw = await response.text();
    if (!response.ok) {
      return res.status(502).json({success:false, code:'GAS_HTTP_ERROR', httpStatus:response.status});
    }
    let data;
    try { data = JSON.parse(raw); }
    catch (_) { return res.status(502).json({success:false, code:'GAS_INVALID_JSON'}); }
    if (!data || data.success !== true) {
      return res.status(502).json({success:false, code:'GAS_REJECTED', message:String(data?.message || '')});
    }
    if (action === 'getAllData' && !Array.isArray(data.trips)) {
      return res.status(502).json({success:false, code:'TRIPS_NOT_ARRAY'});
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({
      success:false,
      code:err?.name === 'TimeoutError' ? 'GAS_TIMEOUT' : 'GAS_UNREACHABLE'
    });
  }
};