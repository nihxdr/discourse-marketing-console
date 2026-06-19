# Colab Console — Discourse Marketing Toolkit

Static web app for the marketing team to operate the
[colab.blend-ed.com](https://colab.blend-ed.com) Discourse forum via its API:
pick any user to **act as**, then create topics, reply, create categories,
create users, send messages, like / edit / delete posts, and browse the feed.

It is the `discourse-seed.py` script's capabilities, plus more, as a clickable UI.
No build step, no backend — pure HTML/CSS/JS, deployable to GitHub Pages.

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

- The app needs an **admin global API key**. It is **pasted in Settings** and
  stored **only in your browser** (`localStorage`). It is never committed and
  never uploaded anywhere except direct requests to your Discourse instance.
- **Do NOT hardcode the key into these files** and push to a public repo. Anyone
  with the key has full admin over the forum.
- Each marketing user enters the key in their own browser, or you keep the repo
  private. Treat the key like a password — rotate it in Discourse admin if leaked.

> The key currently in `../discourse-seed.py` is committed in plaintext. Rotate
> it (Admin → API → revoke + new key) before sharing that script or this repo.

---

## One-time Discourse setup (CORS)

Because the app runs in the browser on a different origin than the forum,
Discourse must allow cross-origin API calls. **Admin → Settings → search "cors":**

1. Enable **`enable_cors`** (checkbox) — `true`.
2. **`cors_origins`** — add the exact origin the app is served from, one per line:
   - GitHub Pages: `https://<username>.github.io`
   - Custom domain later: `https://tools.blend-ed.com`
   - Local testing: `http://localhost:8000`
3. Save, then **rebuild/restart** if self-hosted
   (`./launcher rebuild app`) — some Discourse hosts require the env var
   `DISCOURSE_ENABLE_CORS: true` and `DISCOURSE_CORS_ORIGIN` in `app.yml`.

If a request fails with a CORS error in the browser console, the origin isn't in
`cors_origins`. Use the **Test connection** button in Settings to verify.

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
