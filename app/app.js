/* Colab Console — static Discourse marketing toolkit.
 * All Discourse calls run from the browser using an admin API key the user
 * pastes in Settings. Key lives only in localStorage; nothing is committed. */

const LS_KEY = 'colab_console_cfg';

const cfg = {
  url: '',
  key: '',
  admin: '',
};

// ─── config persistence ────────────────────────────────────────────────
function loadCfg() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    Object.assign(cfg, saved);
  } catch (_) {}
}
function saveCfg() {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}
function configured() {
  return cfg.url && cfg.key && cfg.admin;
}

// ─── API core ──────────────────────────────────────────────────────────
function headers(asUser) {
  return {
    'Api-Key': cfg.key,
    'Api-Username': asUser || actingUser() || cfg.admin,
    'Content-Type': 'application/json',
  };
}

async function api(method, path, body, asUser) {
  if (!configured()) throw new Error('Not configured — open Settings first.');
  const opts = { method, headers: headers(asUser) };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(cfg.url.replace(/\/$/, '') + path, opts);
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

// ─── small helpers ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
function actingUser() {
  const v = $('actAsUser') && $('actAsUser').value;
  return v || '';
}
function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 4200);
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
  // populate category selects
  const opts = categoriesCache
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');
  $('topicCategory').innerHTML = opts;
  $('feedCategory').innerHTML =
    '<option value="">All categories</option>' +
    categoriesCache.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  return categoriesCache;
}

async function loadUsers() {
  // admin list of active users → populate "act as" selector
  const data = await apiGet('/admin/users/list/active.json?order=created&asc=false');
  const sel = $('actAsUser');
  const current = sel.value;
  const users = Array.isArray(data) ? data : [];
  sel.innerHTML =
    '<option value="">— admin (default) —</option>' +
    users
      .filter((u) => u.username)
      .map((u) => `<option value="${esc(u.username)}">${esc(u.username)}${u.name ? ' — ' + esc(u.name) : ''}</option>`)
      .join('');
  if (current) sel.value = current;
  return users;
}

function catById(id) {
  return categoriesCache.find((c) => String(c.id) === String(id));
}

// ─── connection ────────────────────────────────────────────────────────
function setConn(ok, label) {
  const el = $('connStatus');
  el.textContent = label;
  el.className = 'pill ' + (ok ? 'pill-ok' : 'pill-bad');
}

async function testConnection() {
  const data = await apiGet('/categories.json');
  return data;
}

async function refreshAll() {
  if (!configured()) { setConn(false, 'Not connected'); return; }
  try {
    await loadCategories();
    setConn(true, 'Connected · ' + cfg.url.replace(/^https?:\/\//, ''));
    try { await loadUsers(); } catch (_) { /* non-admin keys still post fine */ }
  } catch (e) {
    setConn(false, 'Connection failed');
    toast('Connection failed: ' + e.message, 'bad');
  }
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

  // latest topics
  let path = '/latest.json?order=created';
  if (catId) {
    const c = catById(catId);
    if (c) path = `/c/${c.slug}/${c.id}.json`;
  }
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
  const data = await apiPost('/posts.json', { title, raw, category: Number(category) });
  toast(`Topic created — topic ${data.topic_id}, post ${data.id}`, 'ok');
  $('topicTitle').value = ''; $('topicBody').value = '';
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
  const data = await apiPost('/posts.json', body);
  toast(`Reply posted — post ${data.id}`, 'ok');
  $('replyBody').value = '';
}

// ─── CATEGORY ──────────────────────────────────────────────────────────
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
  // description on a category = the body of its definition topic; set via PUT
  if (desc && catId) {
    try { await apiPut(`/categories/${catId}.json`, { ...body, description: desc }); } catch (_) {}
  }
  toast(`Category created — id ${catId}`, 'ok');
  $('catName').value = ''; $('catSlug').value = ''; $('catDesc').value = '';
  await loadCategories();
}

// ─── NEW USER ──────────────────────────────────────────────────────────
async function submitUser() {
  const name = $('userName').value.trim();
  const username = $('userUsername').value.trim();
  const email = $('userEmail').value.trim();
  const password = $('userPassword').value;
  const bio = $('userBio').value.trim();
  if (!username || !email || !password) { toast('Username, email, password required.', 'bad'); return; }
  const data = await apiPost('/users.json', {
    name, username, email, password, active: true, approved: true,
  });
  if (data && data.success === false) throw new Error(data.message || 'User creation failed');
  if (bio) {
    try { await apiPut(`/u/${username}.json`, { bio_raw: bio, username }); } catch (_) {}
  }
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
  await apiDelete(`/posts/${id}.json`, { context: 'Colab Console' });
  toast(`Deleted post ${id}`, 'ok');
}

// ─── tabs ──────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) =>
    p.classList.toggle('active', p.id === 'tab-' + name));
}

// ─── settings modal ────────────────────────────────────────────────────
function openSettings() {
  $('cfgUrl').value = cfg.url;
  $('cfgKey').value = cfg.key;
  $('cfgAdmin').value = cfg.admin;
  $('testResult').textContent = '';
  $('settingsModal').hidden = false;
}
function closeSettings() { $('settingsModal').hidden = true; }

// ─── wire up ───────────────────────────────────────────────────────────
function init() {
  loadCfg();

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab)));

  $('openSettings').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);
  $('saveSettings').addEventListener('click', () => {
    cfg.url = $('cfgUrl').value.trim();
    cfg.key = $('cfgKey').value.trim();
    cfg.admin = $('cfgAdmin').value.trim();
    saveCfg();
    closeSettings();
    refreshAll();
  });
  $('testConn').addEventListener('click', function () {
    const prev = { ...cfg };
    cfg.url = $('cfgUrl').value.trim();
    cfg.key = $('cfgKey').value.trim();
    cfg.admin = $('cfgAdmin').value.trim();
    $('testResult').textContent = 'Testing…';
    testConnection()
      .then(() => { $('testResult').textContent = '✅ Connected'; })
      .catch((e) => { $('testResult').textContent = '❌ ' + e.message; Object.assign(cfg, prev); });
  });

  $('refreshUsers').addEventListener('click', function () {
    withBtn(this, loadUsers);
  });

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

  if (configured()) refreshAll();
  else { openSettings(); }
}

document.addEventListener('DOMContentLoaded', init);
