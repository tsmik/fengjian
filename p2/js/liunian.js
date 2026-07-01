// p2/js/liunian.js — 流年表編輯器。男/女各 1–99 歲，每歲 9 欄 + 關隘標記。
// 存 rbf2app-staging：config/liunian = { liunian:{男:[...],女:[...]}, updatedAt }（config 現行規則可寫，免改規則）。
// 註：rbf1 是 settings/liunian.liunianJson(字串)；P2 用 config/liunian.liunian(map)。預設值來自 admin.html 的 LIUNIAN_DEFAULT。
import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc } from './fb.js';

const DEFAULT = window.LIUNIAN_DEFAULT || { 男: [], 女: [] };
const COLS = [
  { key: 'name75', label: '七十五' }, { key: 'area75', label: '區域' }, { key: 'jiuzhi', label: '九執' },
  { key: 'yewu', label: '業務' }, { key: 'qinzu', label: '親族' }, { key: 'zinv', label: '子女' },
  { key: 'erbei', label: '耳鼻' }, { key: 'wuguan', label: '五官' }, { key: 'santing', label: '三停' }
];
const ALLKEYS = ['mark', ...COLS.map(c => c.key)];
const LS = 'liunian_draft_v1';
const clone = o => JSON.parse(JSON.stringify(o));
let user = null, role = null, gender = '男', data = clone(DEFAULT), lastSavedJson = null, lastSavedAt = null, userEdited = false;
const isStaff = () => !!user && (role === 'admin' || role === 'teacher');
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function el(t, a = {}, k = []) { const e = document.createElement(t); for (const x in a) { if (x === 'class') e.className = a[x]; else if (x === 'text') e.textContent = a[x]; else e.setAttribute(x, a[x]); } (Array.isArray(k) ? k : [k]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return e; }
function curJson() { return JSON.stringify(data); }
function normalize(d) { return (d && Array.isArray(d['男']) && Array.isArray(d['女']) && d['男'].length === 99 && d['女'].length === 99) ? d : clone(DEFAULT); }

function saveDraft() { try { localStorage.setItem(LS, JSON.stringify(data)); } catch (e) {} }
function loadDraft() { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); if (v) data = normalize(v); } catch (e) {} }

function renderHeader() {
  $('status').textContent = !fbOK() ? '🔌 Firebase 未連線' : (!user ? '未登入' : ('已登入：' + (user.email || user.uid) + '｜角色：' + (role || '（無）')));
  $('btn-login').style.display = (fbOK() && !user) ? '' : 'none';
  $('btn-logout').style.display = user ? '' : 'none';
  $('warn').innerHTML = '';
  if (user && !isStaff()) $('warn').appendChild(el('div', { class: 'role-warn' }, ['⚠️ 已登入，但角色不是 admin/teacher → 不能儲存。你的 UID：' + user.uid + '（請把 users/' + user.uid + ' 的 role 設成 admin）']));
}
function renderSaveStatus() {
  const s = $('save-status'); if (!s) return;
  if (!fbOK() || !user) { s.textContent = '（未登入：只存本機草稿）'; s.className = 'save-status'; return; }
  const dirty = curJson() !== lastSavedJson;
  s.textContent = dirty ? '● 尚未儲存' : ('已儲存 ✓' + (lastSavedAt ? ' ' + lastSavedAt : ''));
  s.className = 'save-status ' + (dirty ? 'dirty' : 'ok');
}
function updateChgCount() {
  let n = 0; const rows = data[gender], def = DEFAULT[gender] || [];
  for (let i = 0; i < rows.length; i++) ALLKEYS.forEach(k => { if ((rows[i][k] || '') !== ((def[i] || {})[k] || '')) n++; });
  $('chgcount').textContent = n ? ('本性別已改 ' + n + ' 格（黃底）' ) : '與預設相同';
}

function renderTable() {
  const rows = data[gender], def = DEFAULT[gender] || [];
  let h = '<table><thead><tr><th>歲</th><th>關隘</th>' + COLS.map(c => '<th>' + c.label + '</th>').join('') + '<th></th></tr></thead><tbody>';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], d = def[i] || {};
    h += '<tr' + (r.mark ? ' class="gate"' : '') + '><td class="age">' + r.age + '</td>';
    const mkChg = (r.mark || '') !== (d.mark || '');
    h += '<td class="' + (mkChg ? 'changed' : '') + '"><select class="mk' + (r.mark ? ' has' : '') + '" data-i="' + i + '">'
      + ['', '關', '隘'].map(o => '<option value="' + o + '"' + (o === (r.mark || '') ? ' selected' : '') + '>' + (o || '—') + '</option>').join('') + '</select></td>';
    COLS.forEach(c => { const v = r[c.key] || ''; h += '<td class="' + (v !== (d[c.key] || '') ? 'changed' : '') + '"><input class="c" data-i="' + i + '" data-k="' + c.key + '" value="' + esc(v) + '"></td>'; });
    h += '<td class="rst"><span class="rbtn" data-i="' + i + '" title="這列重置為預設">↺</span></td></tr>';
  }
  $('tbl').innerHTML = h + '</tbody></table>';
  updateChgCount();
}

function bindTable() {
  const t = $('tbl');
  t.addEventListener('input', e => {
    const el2 = e.target; if (!el2.classList || !el2.classList.contains('c')) return;
    const i = +el2.dataset.i, k = el2.dataset.k; data[gender][i][k] = el2.value; userEdited = true;
    el2.closest('td').classList.toggle('changed', (el2.value || '') !== ((DEFAULT[gender][i] || {})[k] || ''));
    saveDraft(); renderSaveStatus(); updateChgCount();
  });
  t.addEventListener('change', e => {
    const el2 = e.target; if (!el2.classList || !el2.classList.contains('mk')) return;
    const i = +el2.dataset.i; data[gender][i].mark = el2.value; userEdited = true;
    el2.classList.toggle('has', !!el2.value);
    el2.closest('td').classList.toggle('changed', (el2.value || '') !== ((DEFAULT[gender][i] || {}).mark || ''));
    el2.closest('tr').classList.toggle('gate', !!el2.value);
    saveDraft(); renderSaveStatus(); updateChgCount();
  });
  t.addEventListener('click', e => {
    const el2 = e.target; if (!el2.classList || !el2.classList.contains('rbtn')) return;
    const i = +el2.dataset.i; data[gender][i] = clone(DEFAULT[gender][i]); userEdited = true;
    saveDraft(); renderTable(); renderSaveStatus();
  });
}

function setGender(g) {
  gender = g;
  $('g-male').classList.toggle('on', g === '男'); $('g-female').classList.toggle('on', g === '女');
  renderTable();
}

async function loadFromServer() {
  if (!fbOK() || !user) { renderSaveStatus(); return; }
  try {
    const s = await getDoc(doc(db, 'config', 'liunian'));
    const server = (s.exists() && s.data().liunian) ? normalize(s.data().liunian) : clone(DEFAULT);
    lastSavedJson = JSON.stringify(server);
    if (!userEdited) { data = server; renderTable(); }
    renderSaveStatus();
  } catch (e) { renderSaveStatus(); }
}

async function save() {
  if (!fbOK() || !user) return alert('請先用 Google 登入');
  if (!isStaff()) return alert('需 admin/teacher 才能儲存。\n你的 UID：' + user.uid);
  const snap = curJson();
  try {
    await setDoc(doc(db, 'config', 'liunian'), { liunian: data, updatedAt: new Date().toISOString() }, { merge: true });
    lastSavedJson = snap; lastSavedAt = new Date().toTimeString().slice(0, 5); userEdited = false;
    renderSaveStatus();
  } catch (e) { alert('儲存失敗：' + (e.code || e.message)); }
}

function boot() {
  loadDraft();
  $('btn-login').addEventListener('click', () => login().catch(e => alert('登入失敗：' + (e.code || e.message))));
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-save').addEventListener('click', save);
  $('g-male').addEventListener('click', () => setGender('男'));
  $('g-female').addEventListener('click', () => setGender('女'));
  $('btn-reset-all').addEventListener('click', () => { if (!confirm('把「' + gender + '」整個流年表重置為預設？（另一性別不動，要儲存才生效）')) return; data[gender] = clone(DEFAULT[gender]); userEdited = true; saveDraft(); renderTable(); renderSaveStatus(); });
  window.addEventListener('beforeunload', e => { if (user && curJson() !== lastSavedJson && !window.__adminNavigating) { e.preventDefault(); e.returnValue = ''; } });
  bindTable();
  renderHeader(); renderTable(); renderSaveStatus();
  onUser((u, r) => { user = u; role = r; renderHeader(); loadFromServer(); });
}
boot();
