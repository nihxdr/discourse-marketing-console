/* Discourse Marketing Console — static, no backend.
 *
 * Two connection modes:
 *   - 'admin' : Api-Key + Api-Username headers. Full power incl. impersonation,
 *               category/user creation. Key is a global admin key.
 *   - 'user'  : User-Api-Key header from Discourse's User-API-Key handshake.
 *               Acts as the connected member, with that member's permissions.
 *
 * The connected account's role (admin/mod/normal) gates which features show.
 * Credentials live only in this browser (sessionStorage by default, or
 * localStorage when "remember" is checked). Nothing transits any backend. */

const STORE_KEY = 'dmc_cfg';

const cfg = {
  mode: '',          // 'admin' | 'user' | 'proxy'
  url: '',           // public Discourse URL (for links; API base in admin/user mode)
  key: '',           // admin api key (admin mode)
  admin: '',         // admin username (admin mode)
  userApiKey: '',    // user-api-key (user mode)
  proxyUrl: '',      // Cloudflare Worker URL (proxy mode)
  proxyToken: '',    // shared proxy secret (proxy mode)
  username: '',      // resolved connected username
  isAdmin: false,
  isMod: false,
  clientId: '',      // stable per-device id for user-api-key revocation
  remember: false,
};

// proxy + direct-admin both carry admin powers (impersonation, listing users)
const adminMode = () => cfg.mode === 'admin' || cfg.mode === 'proxy';

// ─── storage ───────────────────────────────────────────────────────────
function persist() {
  const store = cfg.remember ? localStorage : sessionStorage;
  const other = cfg.remember ? sessionStorage : localStorage;
  store.setItem(STORE_KEY, JSON.stringify(cfg));
  other.removeItem(STORE_KEY);
}
function loadCfg() {
  let raw = sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY);
  if (raw) { try { Object.assign(cfg, JSON.parse(raw)); } catch (_) {} }
  if (!cfg.clientId) cfg.clientId = randHex(16);
}
function clearCfg() {
  sessionStorage.removeItem(STORE_KEY);
  localStorage.removeItem(STORE_KEY);
  Object.assign(cfg, {
    mode: '', key: '', admin: '', userApiKey: '', proxyUrl: '', proxyToken: '',
    username: '', isAdmin: false, isMod: false,
  });
}
function connected() {
  if (cfg.mode === 'proxy') return !!(cfg.proxyUrl && cfg.proxyToken);
  if (cfg.mode === 'admin') return !!(cfg.url && cfg.key);
  if (cfg.mode === 'user') return !!(cfg.url && cfg.userApiKey);
  return false;
}
const apiBase = () => (cfg.mode === 'proxy' ? cfg.proxyUrl : cfg.url).replace(/\/$/, '');

// ─── API core ──────────────────────────────────────────────────────────
function headers(asUser) {
  const h = { 'Content-Type': 'application/json' };
  if (cfg.mode === 'proxy') {
    h['X-Proxy-Token'] = cfg.proxyToken;
    const act = asUser || actingUser();
    if (act) h['X-Act-As'] = act;          // Worker maps this to Api-Username
  } else if (cfg.mode === 'admin') {
    h['Api-Key'] = cfg.key;
    h['Api-Username'] = asUser || actingUser() || cfg.admin || 'system';
  } else {
    h['User-Api-Key'] = cfg.userApiKey;    // bound to the user; no impersonation
  }
  return h;
}

async function api(method, path, body, asUser) {
  if (!connected()) throw new Error('Not connected — open Connection first.');
  const opts = { method, headers: headers(asUser) };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(apiBase() + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const msg = (data && data.errors && data.errors.join(', ')) ||
                (data && data.error) ||
                (typeof data === 'string' ? data.slice(0, 200) : `HTTP ${res.status}`);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data;
}
const apiGet = (p, asUser) => api('GET', p, undefined, asUser);
const apiPost = (p, b, asUser) => api('POST', p, b, asUser);
const apiPut = (p, b, asUser) => api('PUT', p, b, asUser);
const apiDelete = (p, b) => api('DELETE', p, b);

// ─── helpers ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
function actingUser() {
  if (!adminMode()) return '';   // user mode always acts as itself
  const v = $('actAsUser') && $('actAsUser').value;
  return v || '';
}
function isoFromLocal(v) {
  // datetime-local gives "YYYY-MM-DDTHH:mm" in local time → ISO8601 UTC
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function randHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 4500);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
async function withBtn(btn, fn) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '…';
  try { await fn(); }
  catch (e) { toast(e.message || String(e), 'bad'); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

// ─── caches ────────────────────────────────────────────────────────────
let categoriesCache = [];
async function loadCategories() {
  const data = await apiGet('/categories.json?include_subcategories=true');
  categoriesCache = (data.category_list && data.category_list.categories) || [];
  const opts = categoriesCache.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('topicCategory').innerHTML = opts;
  $('feedCategory').innerHTML =
    '<option value="">All categories</option>' +
    categoriesCache.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  return categoriesCache;
}
async function loadUsers() {
  if (!adminMode()) return [];   // listing users is admin-only
  const data = await apiGet('/admin/users/list/active.json?order=created&asc=false');
  const sel = $('actAsUser');
  const current = sel.value;
  const users = Array.isArray(data) ? data : [];
  sel.innerHTML =
    '<option value="">— admin (default) —</option>' +
    users.filter((u) => u.username)
      .map((u) => `<option value="${esc(u.username)}">${esc(u.username)}${u.name ? ' — ' + esc(u.name) : ''}</option>`)
      .join('');
  if (current) sel.value = current;
  return users;
}
const catById = (id) => categoriesCache.find((c) => String(c.id) === String(id));

// ─── role detection + UI gating ────────────────────────────────────────
async function detectRole() {
  // /session/current.json returns the acting user (admin Api-Username, or the
  // user-api-key's owner). Tells us admin/moderator flags.
  try {
    const data = await apiGet('/session/current.json');
    const u = (data && data.current_user) || {};
    cfg.username = u.username || cfg.username;
    cfg.isAdmin = !!u.admin;
    cfg.isMod = !!u.moderator;
  } catch (_) {
    // user-api-key may lack session_info scope; fall back to mode assumption
    cfg.isAdmin = adminMode();
    cfg.isMod = cfg.isAdmin;
  }
}
function applyRole() {
  const isAdmin = cfg.isAdmin;
  document.querySelectorAll('.admin-only').forEach((el) => { el.hidden = !isAdmin; });
  // Impersonation needs Api-Username (admin key direct, or via the proxy). A
  // user-api-key can't impersonate — hide the Acting-as bar in user mode.
  $('actbar').hidden = !(isAdmin && adminMode());
  // Backdating posts needs a global admin key (proxy/admin mode) — Discourse
  // only honours created_at for staff-level API requests.
  document.querySelectorAll('.backdate-field').forEach((el) => { el.hidden = !adminMode(); });
  // if a hidden admin tab was active, fall back to Browse
  const active = document.querySelector('.tab.active');
  if (active && active.classList.contains('admin-only') && !isAdmin) switchTab('feed');

  const badge = $('roleBadge');
  if (connected()) {
    const role = isAdmin ? 'admin' : (cfg.isMod ? 'moderator' : 'member');
    badge.hidden = false;
    badge.textContent = `${cfg.username || '?'} · ${role}`;
    badge.className = 'pill ' + (isAdmin ? 'pill-ok' : 'pill-muted');
  } else {
    badge.hidden = true;
  }
  const who = isAdmin ? 'the Acting-as user' : 'you (' + (cfg.username || 'connected user') + ')';
  $('topicAs').textContent = 'Posted as ' + who + '.';
  $('replyAs').textContent = 'Posted as ' + who + '.';
}

// ─── connection lifecycle ──────────────────────────────────────────────
function setConn(ok, label) {
  const el = $('connStatus');
  el.textContent = label;
  el.className = 'pill ' + (ok ? 'pill-ok' : 'pill-bad');
}
async function refreshAll() {
  if (!connected()) { setConn(false, 'Not connected'); applyRole(); return; }
  try {
    await detectRole();
    await loadCategories();
    setConn(true, 'Connected · ' + cfg.url.replace(/^https?:\/\//, ''));
    applyRole();
    if (cfg.isAdmin) { try { await loadUsers(); } catch (_) {} }
  } catch (e) {
    setConn(false, 'Connection failed');
    toast('Connection failed: ' + e.message, 'bad');
  }
}

// ─── User-API-Key handshake (paste-back variant) ───────────────────────
// Avoids per-forum redirect whitelisting: Discourse displays an encrypted
// code, the user pastes it back, we decrypt with the private key we made.
let _keypair = null;     // { priv, pub }  PEM strings
let _nonce = '';

function buildAuthUrl() {
  const base = cfg.url.replace(/\/$/, '');
  if (!base) throw new Error('Enter the Discourse URL first.');
  const crypt = new JSEncrypt({ default_key_size: 2048 });
  crypt.getKey();
  _keypair = { priv: crypt.getPrivateKey(), pub: crypt.getPublicKey() };
  _nonce = randHex(16);
  if (!cfg.clientId) cfg.clientId = randHex(16);
  const params = new URLSearchParams({
    application_name: 'Marketing Console',
    client_id: cfg.clientId,
    scopes: 'session_info,read,write,notifications',
    public_key: _keypair.pub,
    nonce: _nonce,
  });
  return base + '/user-api-key/new?' + params.toString();
}

function decryptPayload(payloadB64) {
  if (!_keypair) throw new Error('Generate the authorization link first (step 1).');
  const crypt = new JSEncrypt();
  crypt.setPrivateKey(_keypair.priv);
  const json = crypt.decrypt(payloadB64.trim().replace(/\s+/g, ''));
  if (!json) throw new Error('Could not decrypt — wrong code, or link was regenerated after copying.');
  let obj;
  try { obj = JSON.parse(json); } catch (_) { throw new Error('Decrypted payload is not valid JSON.'); }
  if (obj.nonce !== _nonce) throw new Error('Nonce mismatch — possible tampering. Restart the handshake.');
  if (!obj.key) throw new Error('No key in payload.');
  return obj.key;
}

// ─── BROWSE ────────────────────────────────────────────────────────────
async function loadFeed() {
  const scope = $('feedScope').value;
  const catId = $('feedCategory').value;
  const list = $('feedList');
  list.innerHTML = '<p class="muted">Loading…</p>';

  if (scope === 'categories') {
    await loadCategories();
    list.innerHTML = categoriesCache.map((c) => `
      <div class="item">
        <h4><span class="cat-chip" style="background:#${esc(c.color)}">${esc(c.name)}</span></h4>
        <div class="meta"><span>id <b>${c.id}</b></span><span>${c.topic_count || 0} topics</span><span>slug: ${esc(c.slug)}</span></div>
        ${c.description ? `<p class="muted">${esc(c.description)}</p>` : ''}
      </div>`).join('') || '<p class="muted">No categories.</p>';
    return;
  }

  let path = '/latest.json?order=created';
  if (catId) { const c = catById(catId); if (c) path = `/c/${c.slug}/${c.id}.json`; }
  const data = await apiGet(path);
  const topics = (data.topic_list && data.topic_list.topics) || [];
  if (!topics.length) { list.innerHTML = '<p class="muted">No topics.</p>'; return; }
  list.innerHTML = topics.map((t) => {
    const c = catById(t.category_id);
    return `
    <div class="item">
      <h4>${esc(t.title)}</h4>
      <div class="meta">
        <span>topic <b>${t.id}</b></span>
        ${c ? `<span class="cat-chip" style="background:#${esc(c.color)}">${esc(c.name)}</span>` : ''}
        <span>${t.posts_count || 0} posts</span>
        <span>${t.reply_count || 0} replies</span>
      </div>
      <div class="actions">
        <button class="btn btn-sm" data-reply="${t.id}">Reply</button>
        <a class="btn btn-sm btn-ghost" href="${esc(cfg.url.replace(/\/$/, ''))}/t/${t.id}" target="_blank" rel="noopener">Open ↗</a>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-reply]').forEach((b) => {
    b.addEventListener('click', () => {
      switchTab('reply');
      $('replyTopicId').value = b.getAttribute('data-reply');
      loadTopicPreview();
    });
  });
}

// ─── NEW TOPIC ─────────────────────────────────────────────────────────
async function submitTopic() {
  const category = $('topicCategory').value;
  const title = $('topicTitle').value.trim();
  const raw = $('topicBody').value.trim();
  if (!title || !raw) { toast('Title and body required.', 'bad'); return; }
  const body = { title, raw, category: Number(category) };
  const when = isoFromLocal($('topicCreatedAt').value);
  if (when) body.created_at = when;
  const data = await apiPost('/posts.json', body);
  toast(`Topic created — topic ${data.topic_id}, post ${data.id}${when ? ' @ ' + when : ''}`, 'ok');
  $('topicTitle').value = ''; $('topicBody').value = ''; $('topicCreatedAt').value = '';
}

// ─── REPLY ─────────────────────────────────────────────────────────────
async function loadTopicPreview() {
  const id = $('replyTopicId').value;
  const box = $('replyPreview');
  if (!id) { box.classList.remove('show'); return; }
  try {
    const t = await apiGet(`/t/${id}.json`);
    const op = (t.post_stream && t.post_stream.posts && t.post_stream.posts[0]) || {};
    box.innerHTML = `<b>${esc(t.title)}</b><br>by ${esc(op.username || '?')} · ${t.posts_count || 0} posts<br>` +
      `<span>${esc((op.cooked || '').replace(/<[^>]+>/g, '').slice(0, 220))}…</span>`;
    box.classList.add('show');
  } catch (e) {
    box.innerHTML = '<span class="pill-bad">' + esc(e.message) + '</span>';
    box.classList.add('show');
  }
}
async function submitReply() {
  const topic_id = Number($('replyTopicId').value);
  const raw = $('replyBody').value.trim();
  const replyTo = $('replyToPostNumber').value;
  if (!topic_id || !raw) { toast('Topic ID and body required.', 'bad'); return; }
  const body = { topic_id, raw };
  if (replyTo) body.reply_to_post_number = Number(replyTo);
  const when = isoFromLocal($('replyCreatedAt').value);
  if (when) body.created_at = when;
  const data = await apiPost('/posts.json', body);
  toast(`Reply posted — post ${data.id}${when ? ' @ ' + when : ''}`, 'ok');
  $('replyBody').value = ''; $('replyCreatedAt').value = '';
}

// ─── CATEGORY (admin) ──────────────────────────────────────────────────
async function submitCategory() {
  const name = $('catName').value.trim();
  if (!name) { toast('Name required.', 'bad'); return; }
  const body = {
    name,
    color: $('catColor').value.replace('#', '') || '3358F2',
    text_color: $('catTextColor').value.replace('#', '') || 'FFFFFF',
  };
  const slug = $('catSlug').value.trim();
  if (slug) body.slug = slug;
  const desc = $('catDesc').value.trim();
  const data = await apiPost('/categories.json', body);
  const catId = data.category && data.category.id;
  if (desc && catId) { try { await apiPut(`/categories/${catId}.json`, { ...body, description: desc }); } catch (_) {} }
  toast(`Category created — id ${catId}`, 'ok');
  $('catName').value = ''; $('catSlug').value = ''; $('catDesc').value = '';
  await loadCategories();
}

// ─── NEW USER (admin) ──────────────────────────────────────────────────
async function submitUser() {
  const name = $('userName').value.trim();
  const username = $('userUsername').value.trim();
  const email = $('userEmail').value.trim();
  const password = $('userPassword').value;
  const bio = $('userBio').value.trim();
  if (!username || !email || !password) { toast('Username, email, password required.', 'bad'); return; }
  const data = await apiPost('/users.json', { name, username, email, password, active: true, approved: true });
  if (data && data.success === false) throw new Error(data.message || 'User creation failed');
  if (bio) { try { await apiPut(`/u/${username}.json`, { bio_raw: bio, username }); } catch (_) {} }
  toast(`User created — ${username}`, 'ok');
  $('userName').value = ''; $('userUsername').value = ''; $('userEmail').value = ''; $('userBio').value = '';
  try { await loadUsers(); } catch (_) {}
}

// ─── MESSAGE ───────────────────────────────────────────────────────────
async function submitMessage() {
  const target = $('msgRecipients').value.trim();
  const title = $('msgTitle').value.trim();
  const raw = $('msgBody').value.trim();
  if (!target || !title || !raw) { toast('Recipients, subject, body required.', 'bad'); return; }
  const data = await apiPost('/posts.json', {
    title, raw,
    target_recipients: target.replace(/\s+/g, ''),
    archetype: 'private_message',
  });
  toast(`Message sent — topic ${data.topic_id}`, 'ok');
  $('msgBody').value = '';
}

// ─── MODERATE ──────────────────────────────────────────────────────────
async function submitLike() {
  const id = Number($('likePostId').value);
  if (!id) { toast('Post ID required.', 'bad'); return; }
  await apiPost('/post_actions.json', { id, post_action_type_id: 2 });
  toast(`Liked post ${id}`, 'ok');
}
async function loadPostRaw() {
  const id = $('editPostId').value;
  if (!id) { toast('Post ID required.', 'bad'); return; }
  const data = await apiGet(`/posts/${id}.json`);
  $('editPostBody').value = data.raw || '';
  toast('Loaded current text.', 'ok');
}
async function submitEdit() {
  const id = Number($('editPostId').value);
  const raw = $('editPostBody').value;
  if (!id || !raw.trim()) { toast('Post ID and body required.', 'bad'); return; }
  await apiPut(`/posts/${id}.json`, { post: { raw } });
  toast(`Post ${id} updated`, 'ok');
}
async function submitDelete() {
  const id = Number($('deletePostId').value);
  if (!id) { toast('Post ID required.', 'bad'); return; }
  if (!confirm(`Delete post ${id}? This cannot be undone from here.`)) return;
  await apiDelete(`/posts/${id}.json`, { context: 'Marketing Console' });
  toast(`Deleted post ${id}`, 'ok');
}

// ─── tabs ──────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
}

// ─── connection modal ──────────────────────────────────────────────────
function openSettings() {
  $('cfgUrl').value = cfg.url;
  $('cfgKey').value = cfg.key;
  $('cfgAdmin').value = cfg.admin;
  $('cfgProxyUrl').value = cfg.proxyUrl;
  $('cfgProxyToken').value = cfg.proxyToken;
  $('cfgRemember').checked = cfg.remember;
  $('testResult').textContent = '';
  $('disconnectBtn').hidden = !connected();
  $('settingsModal').hidden = false;
}
function closeSettings() { $('settingsModal').hidden = true; }
function switchMethod(m) {
  document.querySelectorAll('.mtab').forEach((b) => b.classList.toggle('active', b.dataset.method === m));
  document.querySelectorAll('.method').forEach((p) => p.classList.toggle('active', p.id === 'method-' + m));
}

// ─── theme ─────────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('dmc_theme', t);
  const b = $('themeToggle');
  if (b) b.textContent = t === 'light' ? '☀' : '🌙';
}

// ─── wire up ───────────────────────────────────────────────────────────
function init() {
  loadCfg();
  applyTheme(localStorage.getItem('dmc_theme') || 'light');
  $('themeToggle').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab)));
  document.querySelectorAll('.mtab').forEach((b) =>
    b.addEventListener('click', () => switchMethod(b.dataset.method)));

  $('openSettings').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);

  $('disconnectBtn').addEventListener('click', () => {
    clearCfg();
    setConn(false, 'Not connected');
    applyRole();
    closeSettings();
    toast('Disconnected and cleared.', 'ok');
  });

  // Admin key connect
  $('connectAdmin').addEventListener('click', function () {
    withBtn(this, async () => {
      cfg.mode = 'admin';
      cfg.url = $('cfgUrl').value.trim();
      cfg.key = $('cfgKey').value.trim();
      cfg.admin = $('cfgAdmin').value.trim() || 'system';
      cfg.remember = $('cfgRemember').checked;
      if (!cfg.url || !cfg.key) throw new Error('URL and admin key required.');
      await detectRole();
      persist();
      closeSettings();
      await refreshAll();
      toast('Connected as admin.', 'ok');
    });
  });

  // Proxy connect (impersonation via Cloudflare Worker)
  $('connectProxy').addEventListener('click', function () {
    withBtn(this, async () => {
      cfg.mode = 'proxy';
      cfg.url = $('cfgUrl').value.trim();          // public forum URL, for links
      cfg.proxyUrl = $('cfgProxyUrl').value.trim();
      cfg.proxyToken = $('cfgProxyToken').value.trim();
      cfg.remember = $('cfgRemember').checked;
      if (!cfg.proxyUrl || !cfg.proxyToken) throw new Error('Proxy URL and token required.');
      await detectRole();
      persist();
      closeSettings();
      await refreshAll();
      toast('Connected via proxy.', 'ok');
    });
  });

  $('testConn').addEventListener('click', function () {
    const prev = { ...cfg };
    cfg.mode = 'admin';
    cfg.url = $('cfgUrl').value.trim();
    cfg.key = $('cfgKey').value.trim();
    cfg.admin = $('cfgAdmin').value.trim() || 'system';
    $('testResult').textContent = 'Testing…';
    apiGet('/categories.json')
      .then(() => { $('testResult').textContent = '✅ Connected'; Object.assign(cfg, prev); })
      .catch((e) => { $('testResult').textContent = '❌ ' + e.message; Object.assign(cfg, prev); });
  });

  // User-API-Key handshake
  $('genAuthLink').addEventListener('click', function () {
    withBtn(this, async () => {
      cfg.url = $('cfgUrl').value.trim();
      const url = buildAuthUrl();
      window.open(url, '_blank', 'noopener');
      $('authHint').style.display = 'block';
      toast('Authorization page opened. Approve, copy the code, paste it below.', 'ok');
    });
  });
  $('connectAccount').addEventListener('click', function () {
    withBtn(this, async () => {
      cfg.url = $('cfgUrl').value.trim();
      const payload = $('userApiPayload').value;
      if (!cfg.url) throw new Error('Enter the Discourse URL first.');
      if (!payload.trim()) throw new Error('Paste the authorization code first.');
      const key = decryptPayload(payload);
      cfg.mode = 'user';
      cfg.userApiKey = key;
      cfg.remember = $('cfgRemember').checked;
      await detectRole();
      persist();
      $('userApiPayload').value = '';
      closeSettings();
      await refreshAll();
      toast('Connected as ' + (cfg.username || 'member') + '.', 'ok');
    });
  });

  $('refreshUsers').addEventListener('click', function () { withBtn(this, loadUsers); });
  $('loadFeed').addEventListener('click', function () { withBtn(this, loadFeed); });
  $('submitTopic').addEventListener('click', function () { withBtn(this, submitTopic); });
  $('loadTopicPreview').addEventListener('click', function () { withBtn(this, loadTopicPreview); });
  $('submitReply').addEventListener('click', function () { withBtn(this, submitReply); });
  $('submitCategory').addEventListener('click', function () { withBtn(this, submitCategory); });
  $('submitUser').addEventListener('click', function () { withBtn(this, submitUser); });
  $('submitMessage').addEventListener('click', function () { withBtn(this, submitMessage); });
  $('submitLike').addEventListener('click', function () { withBtn(this, submitLike); });
  $('loadPostRaw').addEventListener('click', function () { withBtn(this, loadPostRaw); });
  $('submitEdit').addEventListener('click', function () { withBtn(this, submitEdit); });
  $('submitDelete').addEventListener('click', function () { withBtn(this, submitDelete); });

  applyRole();
  if (connected()) refreshAll();
  else openSettings();
}

document.addEventListener('DOMContentLoaded', init);
