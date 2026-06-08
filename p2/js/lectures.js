// p2/js/lectures.js — 講義（板書文字）編輯器。每維度一段，全域。
// 存 rbf2app-staging：config/board = { board: {維度名: 文字}, updatedAt }（現行 rbf2 規則已允許 config 寫入，免改規則）。
// 註：rbf1 是 settings/board.boardJson(字串)；P2 用 config/board.board(map)，之後接報告頁時對應讀這裡。
import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc } from './fb.js';

const DIMS = (window.DIMS_META && window.DIMS_META.dims) || [];
const LS = 'lectures_draft_v1';
let user = null, role = null, board = {}, lastSavedJson = null, lastSavedAt = null, userEdited = false;
const isStaff = () => !!user && (role === 'admin' || role === 'teacher');
const $ = id => document.getElementById(id);
function el(t, a = {}, k = []) {
  const e = document.createElement(t);
  for (const key in a) { if (key === 'class') e.className = a[key]; else if (key === 'text') e.textContent = a[key]; else if (key.startsWith('on')) e.addEventListener(key.slice(2), a[key]); else e.setAttribute(key, a[key]); }
  (Array.isArray(k) ? k : [k]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}
const hue = i => 'hsl(' + ((i * 28) % 360) + ',38%,46%)';
function curJson() { return JSON.stringify(DIMS.map(d => board[d.name] || '')); }

function saveDraft() { try { localStorage.setItem(LS, JSON.stringify(board)); } catch (e) {} }
function loadDraft() { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); if (v && typeof v === 'object') board = v; } catch (e) {} }

function renderHeader() {
  $('status').textContent = !fbOK() ? '🔌 Firebase 未連線' : (!user ? '未登入' : ('已登入：' + (user.email || user.uid) + '｜角色：' + (role || '（無，不能存）')));
  $('btn-login').style.display = (fbOK() && !user) ? '' : 'none';
  $('btn-logout').style.display = user ? '' : 'none';
  $('warn').innerHTML = '';
  if (user && !isStaff()) $('warn').appendChild(el('div', { class: 'role-warn' }, [
    el('div', { text: '⚠️ 已登入，但角色不是 admin/teacher → 不能儲存（以下可看可編，但存不進去）。' }),
    el('div', { text: '你的 UID：' + user.uid + '　請到 Firestore 把 users/' + user.uid + ' 的 role 設成 admin。' })
  ]));
}
function renderSaveStatus() {
  const s = $('save-status'); if (!s) return;
  if (!fbOK() || !user) { s.textContent = '（未登入：只存本機草稿，登入後才能儲存）'; s.className = 'save-status'; return; }
  const dirty = curJson() !== lastSavedJson;
  s.textContent = dirty ? '● 尚未儲存' : ('已儲存 ✓' + (lastSavedAt ? ' ' + lastSavedAt : ''));
  s.className = 'save-status ' + (dirty ? 'dirty' : 'ok');
}

function renderDims() {
  const chips = $('chips'); chips.innerHTML = '';
  const box = $('dims'); box.innerHTML = '';
  DIMS.forEach((d, i) => {
    const id = 'dim-' + i;
    const chip = el('span', { class: 'chip', text: (i + 1) + ' ' + d.name }); chip.style.borderColor = hue(i);
    chip.addEventListener('click', () => { const t = $(id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    chips.appendChild(chip);

    const block = el('div', { class: 'dim-block', id });
    block.style.setProperty('--hue', hue(i));
    const poles = el('span', { class: 'dim-poles' }, [
      el('span', { class: d.aT === '靜' ? 'pole-s' : 'pole-d', text: d.a + '(' + (d.aT || '') + ')' }),
      document.createTextNode(' ｜ '),
      el('span', { class: d.bT === '靜' ? 'pole-s' : 'pole-d', text: d.b + '(' + (d.bT || '') + ')' })
    ]);
    block.appendChild(el('div', { class: 'dim-head' }, [el('span', { class: 'dim-no', text: '#' + (i + 1) }), el('span', { class: 'dim-name', text: d.name }), poles]));
    const ta = el('textarea', { class: 'dim-ta', placeholder: '輸入「' + d.name + '」的板書講義…' });
    ta.value = board[d.name] || '';
    ta.addEventListener('input', () => { board[d.name] = ta.value; userEdited = true; saveDraft(); renderSaveStatus(); });
    block.appendChild(ta);
    box.appendChild(block);
  });
}

async function loadFromServer() {
  if (!fbOK() || !user) { renderSaveStatus(); return; }
  try {
    const s = await getDoc(doc(db, 'config', 'board'));
    const server = (s.exists() && s.data().board) ? s.data().board : {};
    lastSavedJson = JSON.stringify(DIMS.map(d => server[d.name] || ''));
    if (!userEdited) { board = server; renderDims(); }   // 沒有本機未存編輯 → 採用伺服器版
    renderSaveStatus();
  } catch (e) { renderSaveStatus(); }
}

async function save() {
  if (!fbOK() || !user) return alert('請先用 Google 登入');
  if (!isStaff()) return alert('需 admin/teacher 才能儲存。\n你的 UID：' + user.uid);
  const snap = curJson();
  try {
    await setDoc(doc(db, 'config', 'board'), { board, updatedAt: new Date().toISOString() }, { merge: true });
    lastSavedJson = snap; lastSavedAt = new Date().toTimeString().slice(0, 5); userEdited = false;
    renderSaveStatus();
  } catch (e) { alert('儲存失敗：' + (e.code || e.message)); }
}

function boot() {
  loadDraft();
  $('btn-login').addEventListener('click', () => login().catch(e => alert('登入失敗：' + (e.code || e.message))));
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-save').addEventListener('click', save);
  window.addEventListener('beforeunload', e => { if (user && curJson() !== lastSavedJson) { e.preventDefault(); e.returnValue = ''; } });
  renderHeader(); renderDims(); renderSaveStatus();
  onUser((u, r) => { user = u; role = r; renderHeader(); loadFromServer(); });
}
boot();
