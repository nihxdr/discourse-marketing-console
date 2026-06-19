/* Discourse admin proxy — Cloudflare Worker.
 *
 * Holds the admin API key server-side so the browser app never sees it and the
 * Discourse-CORS restriction on Api-Key / Api-Username headers is bypassed.
 *
 * Flow: browser → Worker (X-Proxy-Token + optional X-Act-As) → Discourse
 *       (Api-Key + Api-Username injected here).
 *
 * Secrets / vars (see wrangler.toml + README):
 *   DISCOURSE_URL       e.g. https://colab.blend-ed.com
 *   DISCOURSE_API_KEY   global admin key   (secret)
 *   PROXY_TOKEN         shared secret the app must send   (secret)
 *   ALLOWED_ORIGIN      e.g. https://nihxdr.github.io
 *   DEFAULT_USERNAME    fallback Api-Username (e.g. system)
 */

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Act-As, X-Proxy-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    // CORS preflight
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Auth gate — prevents the open internet from using your admin key
    const token = request.headers.get('X-Proxy-Token') || '';
    if (!env.PROXY_TOKEN || token !== env.PROXY_TOKEN) {
      return json({ errors: ['Forbidden: missing or wrong proxy token.'] }, 403);
    }
    if (!env.DISCOURSE_URL || !env.DISCOURSE_API_KEY) {
      return json({ errors: ['Worker misconfigured: set DISCOURSE_URL and DISCOURSE_API_KEY.'] }, 500);
    }

    const url = new URL(request.url);
    const target = env.DISCOURSE_URL.replace(/\/$/, '') + url.pathname + url.search;

    const headers = {
      'Api-Key': env.DISCOURSE_API_KEY,
      'Api-Username': request.headers.get('X-Act-As') || env.DEFAULT_USERNAME || 'system',
    };
    const ct = request.headers.get('Content-Type');
    if (ct) headers['Content-Type'] = ct;

    const init = { method: request.method, headers };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.text();

    let resp;
    try {
      resp = await fetch(target, init);
    } catch (e) {
      return json({ errors: ['Upstream fetch failed: ' + (e && e.message)] }, 502);
    }
    const body = await resp.text();
    const out = new Headers(cors);
    out.set('Content-Type', resp.headers.get('Content-Type') || 'application/json');
    return new Response(body, { status: resp.status, headers: out });
  },
};
