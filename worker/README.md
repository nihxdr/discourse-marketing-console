# Discourse admin proxy (Cloudflare Worker)

A ~60-line serverless proxy that lets the browser app **impersonate users** with a
global admin key — which a pure browser app can't do, because Discourse's CORS
allowlist blocks the `Api-Key` / `Api-Username` headers.

The Worker holds the admin key as a secret, injects `Api-Key` + `Api-Username`
server-side, and returns CORS headers for your Pages origin. **The admin key never
reaches the browser** — this also fixes the key-exposure risk of pasting it in the UI.

```
browser app ──X-Proxy-Token, X-Act-As──▶ Worker ──Api-Key + Api-Username──▶ Discourse
```

## Deploy (5 min, free tier)

1. Install Wrangler and log in:
   ```bash
   npm i -g wrangler
   wrangler login
   ```
2. From this `worker/` folder, set the secrets (prompted for each value):
   ```bash
   wrangler secret put DISCOURSE_URL        # https://colab.blend-ed.com
   wrangler secret put DISCOURSE_API_KEY    # global admin key
   wrangler secret put PROXY_TOKEN          # invent a long random string; share with the team
   ```
3. Edit `wrangler.toml` → `ALLOWED_ORIGIN` to your app origin
   (`https://nihxdr.github.io`, or your custom domain later).
4. Deploy:
   ```bash
   wrangler deploy
   ```
   Wrangler prints a URL like `https://discourse-proxy.<you>.workers.dev`.

## Connect the app

In the app's **Connection** modal → **Proxy (impersonation)** tab:
- **Proxy URL** = the `*.workers.dev` URL from `wrangler deploy`
- **Proxy token** = the `PROXY_TOKEN` you set
- **Discourse URL** (top field) = `https://colab.blend-ed.com` (only used to build
  "Open ↗" links)

Connect → the **Acting as** dropdown fills with all users → posts/replies are
attributed to the selected persona. Same power as the seed script.

## Security

- `PROXY_TOKEN` gates the Worker so it isn't an open relay for your admin key.
  Anyone with the token + URL can act as any user — share only with the marketing
  team, rotate it (`wrangler secret put PROXY_TOKEN` + redeploy) if leaked.
- `ALLOWED_ORIGIN` limits which web origin browsers may call it from (defense in
  depth; the token is the real gate, since non-browser clients can forge Origin).
- The admin key lives only in Cloudflare's secret store, never in git or the browser.
- Rotate the Discourse key anytime: update it in Discourse, then
  `wrangler secret put DISCOURSE_API_KEY` + `wrangler deploy`.
