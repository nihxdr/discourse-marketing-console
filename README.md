# Discourse Marketing Console

Tools for operating a [Discourse](https://www.discourse.org/) community via its API —
built for marketing / community teams. Two parts:

| Part | What it is |
|---|---|
| **`app/`** | Static web app (HTML/CSS/JS, no backend). Pick a user to *act as*, then create topics, reply, create categories, create users, send messages, like/edit/delete posts, browse the feed. Deployable to GitHub Pages. See [`app/README.md`](app/README.md). |
| **`discourse-seed.py`** | CLI script that bulk-seeds realistic users, categories, and threaded discussions. |

## Security — read before using

- **Never commit API keys.** The seed script and web app both require a Discourse
  admin API key. The script reads it from environment / `.env` (gitignored). The
  web app takes it in the browser and stores it locally only.
- A Discourse **global admin key = full forum control**. Treat it like a root
  password. Prefer least-privilege / scoped keys where possible.
- If a key is ever exposed, **rotate it** in Discourse: Admin → API → revoke + new key.

## Seed script usage

```bash
pip install requests python-dotenv
cp .env.example .env        # then fill in your values
python discourse-seed.py
```

Created content is logged to `created_content.json` (gitignored) so it can be
deleted later via the script's `delete_all_seeded_content()`.

## Web app

```bash
cd app
python3 -m http.server 8000   # http://localhost:8000
```

Full setup, CORS configuration, and GitHub Pages deploy steps in
[`app/README.md`](app/README.md).
