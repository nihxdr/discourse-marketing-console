# Discourse Marketing Console

A static web app + serverless proxy for operating a
[Discourse](https://www.discourse.org/) community via its API — built for
marketing / community teams.

| Part | What it is |
|---|---|
| **`app/`** | Static web app (HTML/CSS/JS, no backend). Connect to a Discourse, then create topics, reply, create categories/users, send messages, like/edit/delete posts, browse. As admin/proxy you can post as any user. Deploys to GitHub Pages. See [`app/README.md`](app/README.md). |
| **`worker/`** | Cloudflare Worker that holds an admin key server-side and injects `Api-Key`/`Api-Username`, enabling impersonation from the browser without exposing the key. See [`worker/README.md`](worker/README.md). |

## Security — read before using

- **No admin key in the browser or git.** The web app's seamless mode uses scoped
  Discourse User-API-Keys; impersonation goes through the Worker, which keeps the
  admin key in Cloudflare's secret store only.
- A Discourse **global admin key = full forum control**. Treat it like a root
  password. The Worker's `PROXY_TOKEN` is equally sensitive — anyone holding it can
  act as any user. Share narrowly, rotate if exposed.
- If a key/token is ever exposed, **rotate it** (Discourse: Admin → API → revoke +
  new key; Worker: `wrangler secret put PROXY_TOKEN`).

## Web app

```bash
cd app
python3 -m http.server 8000   # http://localhost:8000
```

Connection methods, CORS configuration, and GitHub Pages deploy steps in
[`app/README.md`](app/README.md). Proxy/impersonation setup in
[`worker/README.md`](worker/README.md).
