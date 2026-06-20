# Discourse Marketing Console

Static web app to operate any Discourse forum via its API — for marketing /
community teams. Create topics, reply, send messages, like/edit/delete posts,
browse the feed and (as admin) create categories, create users, and post as any
user. No build step, no backend — pure HTML/CSS/JS, deployable to GitHub Pages.

## Two ways to connect

| Method | Who | What you can do | Setup |
|---|---|---|---|
| **My account** | Any member | Post / reply / PM / like as **yourself**, edit/delete **your own** posts, browse | Discourse `allow user api keys` = true (default). One copy-paste handshake. |
| **Proxy (impersonate)** | Marketing team | Everything **+ impersonate any user, create categories & users, moderate** | Deploy the Cloudflare Worker in [`../worker/`](../worker/), then enter its URL + token. |
| **Admin key** (direct) | — | Same as proxy, but ⚠ **blocked by standard Discourse CORS** (it disallows `Api-Key`/`Api-Username` headers from browsers) | Only works if you've widened your forum's allowed CORS headers. Use the proxy instead. |

The app **detects your role on connect** and hides what your account can't do.

**Why impersonation needs the proxy:** posting as another user requires the
`Api-Username` header, which Discourse's CORS allowlist blocks for browsers (only
`User-Api-Key` is allowed). The Worker injects that header server-side, so the
admin key never touches the browser. A seamless (`User-Api-Key`) connection is
cryptographically bound to one account and can never impersonate.

### How the seamless handshake works
1. App generates an RSA keypair in your browser.
2. You're sent to `your-forum/user-api-key/new` (you're already logged in there)
   and approve scoped access (`session_info, read, write, notifications`).
3. Discourse shows an encrypted code. Paste it back into the app.
4. App decrypts it locally → a scoped key bound to **your** account. Revoke any
   time under your Discourse → Preferences → Security.

No admin key, nothing pasted in plaintext, no per-forum redirect whitelist needed.
(Decryption uses the bundled `vendor/jsencrypt.min.js`, MIT, pinned with SRI —
browsers' built-in WebCrypto can't decrypt Discourse's PKCS1v15 payload.)

---

## Backdating posts (custom timestamp)

To build a realistic-looking thread, New Topic and Reply each have an optional
**Post date/time** picker. Leave it blank to post now; set it to backdate.

- The picker appears **only in admin/proxy mode**. Discourse honours a post's
  `created_at` only for staff-level (global admin key) API requests — a seamless
  `User-Api-Key` (normal member) connection can't backdate, so the field is hidden.
- The chosen local date/time is converted to UTC ISO-8601 and sent as `created_at`
  on `POST /posts.json`. The success toast echoes the applied timestamp.
- **Order matters for realism:** post the topic first, then each reply with a
  time *after* the topic and after the previous reply — same increasing-gap
  pattern the `discourse-seed.py` script used with its `delay` values.

**Verify once:** post a throwaway backdated topic, confirm the forum shows your
date (not "now"), then delete it via the Moderate tab. If it shows "now", this
forum gates `created_at` differently — the fallback is the admin
`PUT /t/{id}/change-timestamp` endpoint, which shifts a whole topic.

---

## What it does

| Tab | Action | Discourse API |
|---|---|---|
| Browse | Latest topics / list categories | `GET /latest.json`, `GET /categories.json` |
| New Topic | Post a topic as the acting user | `POST /posts.json` |
| Reply | Reply to a topic (optionally to a post #) | `POST /posts.json` |
| Category | Create a category | `POST /categories.json` |
| New User | Create an active+approved user | `POST /users.json` |
| Message | Send a private message | `POST /posts.json` (`archetype=private_message`) |
| Moderate | Like / edit / delete a post | `POST /post_actions.json`, `PUT /posts/{id}.json`, `DELETE /posts/{id}.json` |

**Acting as** sets the `Api-Username` header, so posts and replies are
attributed to the selected user (same mechanism as the seed script's `as_user`).

---

## Security model — read this

- **No backend.** Requests go straight from your browser to your Discourse.
  Credentials never transit any server of ours. The app is static and open source
  — audit it.
- **Credentials stay in your browser.** `sessionStorage` by default (cleared when
  the tab closes); tick "Remember on this device" to use `localStorage`. The
  **Disconnect & clear** button wipes both.
- **Prefer the seamless (User-API-Key) method** — it issues a scoped key bound to
  one account, revocable from Discourse Preferences. Use the admin key only when
  you genuinely need admin powers (impersonation, category/user creation). A
  global admin key = full forum control; treat it like a root password and rotate
  it (Admin → API → revoke + new key) if exposed.
- **Hardened client:** Content-Security-Policy blocks inline/external scripts
  (so an injection can't exfiltrate a key); the one vendored lib is pinned with
  Subresource Integrity; zero CDN/runtime dependencies.
- **Origin isolation:** `localStorage` is shared across all pages on one origin.
  On `username.github.io` every repo shares it — host this on a **dedicated custom
  domain** if multiple users will "remember" keys.

> The admin key once hardcoded in `../discourse-seed.py` has been moved to env
> vars. If that key was ever committed or shared, **rotate it** in Discourse.

---

## One-time Discourse setup (CORS)

The app runs in the browser on a different origin than the forum, so Discourse
must allow cross-origin API calls or every request fails.

### Standard Docker install (recommended)

SSH to the server, edit `containers/app.yml`, add under `env:`:

```yaml
env:
  DISCOURSE_ENABLE_CORS: true
  DISCOURSE_CORS_ORIGIN: 'https://nihxdr.github.io'
```

Then rebuild (required — env vars apply only on rebuild):

```bash
cd /var/discourse
./launcher rebuild app
```

- `DISCOURSE_CORS_ORIGIN`: exact `scheme://host`, **no trailing slash, no path**.
- Multiple origins: comma-separated, **no spaces** —
  `'https://nihxdr.github.io,https://tools.blend-ed.com'`.
- When set via env var, the admin-UI `cors_origins` setting is locked — manage
  origins in `app.yml`.

### Managed / non-Docker hosts

If you can't edit `app.yml`, use **Admin → Settings → search "cors"**: enable
`enable_cors` and add the origin(s) to `cors_origins` (one per line).

If a request fails with `No 'Access-Control-Allow-Origin'` in the browser
console, the origin isn't allowed. Use **Test connection** to verify.

---

## Run locally

It's static — any static server works (don't open `file://`, CORS blocks it):

```bash
cd app
python3 -m http.server 8000
# open http://localhost:8000
```

Then **⚙ Settings** → fill URL `https://colab.blend-ed.com`, the admin API key,
and admin username → **Test connection** → **Save**.

---

## Deploy to GitHub Pages

1. Push this `app/` folder to a repo (keep it **private** unless the key is only
   ever entered per-browser).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch*.
   - If `app/` is the repo root: branch `main`, folder `/ (root)`.
   - If `app/` is a subfolder: move its contents to repo root, or set Pages to a
     branch where these files sit at root. Pages can't serve an arbitrary
     subfolder except `/docs` — simplest is to make `app/` contents the root.
3. Add the resulting `https://<username>.github.io/<repo>/` origin to Discourse
   `cors_origins` (step above).
4. Custom domain later: Pages → Custom domain, then add that origin to
   `cors_origins` too.

`.nojekyll` is included so Pages serves the files verbatim.

---

## Files

```
app/
├── index.html   # UI + tabs
├── styles.css   # dark theme
├── app.js       # all Discourse API logic
├── .nojekyll    # tell Pages to skip Jekyll
└── README.md
```
