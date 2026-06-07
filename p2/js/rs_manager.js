// p2/js/rs_manager.js — 套裝管理（獨立分頁）。rbf2app-staging 的 ruleSets。
// 每套裝：名稱(name)、時期(period, YYYY-MM)、說明(note，可拉開的文字框)。
// 列出/新增/複製/設上線(config/active)/一鍵回滾/刪除；「編輯內容」→ 切到條件編輯器分頁載入該套裝。
import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from './fb.js';

let user = null, role = null;
const isStaff = () => !!user && (role === 'admin' || role === 'teacher');
const EDIT_KEY = 'admin2_edit_set';

function el(t, a = {}, k = []) {
  const e = document.createElement(t);
  for (const key in a) {
    if (key === 'class') e.className = a[key];
    else if (key === 'text') e.textContent = a[key];
    else if (key === 'value') e.value = a[key];
    else if (key.startsWith('on')) e.addEventListener(key.slice(2), a[key]);
    else e.setAttribute(key, a[key]);
  }
  (Array.isArray(k) ? k : [k]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}
const $ = id => document.getElementById(id);
function nowStamp() { const d = new Date(); return d.toISOString().slice(0, 19).replace(/[-:T]/g, ''); }
function editingId() { try { return (JSON.parse(localStorage.getItem(EDIT_KEY) || 'null') || {}).id || null; } catch (e) { return null; } }

function renderHeader() {
  $('status').textContent = !fbOK() ? '🔌 Firebase 未連線' : (!user ? '未登入' : ('已登入：' + (user.email || user.uid) + '｜角色：' + (role || '（無，不能改）')));
  $('btn-login').style.display = (fbOK() && !user) ? '' : 'none';
  $('btn-logout').style.display = user ? '' : 'none';
}

async function loadList() {
  renderHeader();
  const box = $('list'); box.innerHTML = '';
  if (!fbOK() || !user) { box.appendChild(el('div', { class: 'hint', text: '請先用 Google 登入(admin/teacher)。套裝存在 rbf2app-staging。' })); $('active-line').textContent = ''; return; }
  box.appendChild(el('div', { class: 'hint', text: '讀取中…' }));
  try {
    const snap = await getDocs(collection(db, 'ruleSets'));
    const sets = []; snap.forEach(d => sets.push({ id: d.id, ...d.data() }));
    let active = null; try { const a = await getDoc(doc(db, 'config', 'active')); if (a.exists()) active = a.data(); } catch (e) {}
    renderList(sets, active);
  } catch (e) { box.innerHTML = ''; box.appendChild(el('div', { class: 'hint', text: '讀取失敗：' + (e.code || e.message) })); }
}

function renderList(sets, active) {
  const box = $('list'); box.innerHTML = '';
  const activeId = active && active.activeRuleSetId, prevId = active && active.previousActiveRuleSetId;
  $('active-line').textContent = '上線中：' + (activeId || '（無）') + (prevId ? '　｜上一版：' + prevId : '');
  if (!sets.length) { box.appendChild(el('div', { class: 'hint', text: '尚無套裝。按「＋新套裝」建立。' })); return; }
  sets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const edId = editingId();
  sets.forEach(s => box.appendChild(renderCard(s, s.id === activeId, s.id === edId)));
}

function renderCard(s, isActive, isEditing) {
  const card = el('div', { class: 'rs-card' });
  let saveTimer = null;
  const savedTag = el('span', { class: 'saved', text: '' });
  const pushMeta = (patch) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!isStaff()) { savedTag.textContent = '需 admin/teacher'; return; }
      try { await setDoc(doc(db, 'ruleSets', s.id), { ...patch, savedAt: new Date().toISOString() }, { merge: true }); savedTag.textContent = '已存 ✓'; setTimeout(() => savedTag.textContent = '', 1500); }
      catch (e) { savedTag.textContent = '存失敗：' + (e.code || e.message); }
    }, 600);
  };
  // 名稱 + 時期 + 標記
  const name = el('input', { class: 'f-name', value: s.name || '' });
  name.addEventListener('input', () => { s.name = name.value; pushMeta({ name: name.value }); });
  const period = el('input', { class: 'f-period', type: 'month', value: s.period || '' });
  period.addEventListener('change', () => { s.period = period.value; pushMeta({ period: period.value }); });
  // 說明（拉開的文字框，比照筆記）
  const note = el('textarea', { class: 'f-note', value: s.note || '' });
  const noteBtn = el('button', { class: 'btn xs note-toggle' + (s.note ? ' has' : ''), text: '✎ 說明', title: '點開編輯說明' });
  noteBtn.addEventListener('click', () => { const show = note.style.display === 'none' || !note.style.display; note.style.display = show ? 'block' : 'none'; if (show) note.focus(); });
  note.addEventListener('input', () => { s.note = note.value; noteBtn.classList.toggle('has', !!note.value); pushMeta({ note: note.value }); });

  const top = el('div', { class: 'rs-top' }, [name, el('span', { text: '時期' }), period, noteBtn, savedTag]);
  if (isActive) top.appendChild(el('span', { class: 'badge act', text: '上線中' }));
  if (isEditing) top.appendChild(el('span', { class: 'badge edit', text: '編輯中' }));
  card.appendChild(top);
  card.appendChild(el('div', { class: 'rs-id', text: s.id + (s.basedOn ? '（複製自 ' + s.basedOn + '）' : '') + (s.createdAt ? '　建立 ' + s.createdAt.slice(0, 10) : '') }));
  card.appendChild(note);
  card.appendChild(el('div', { class: 'rs-acts' }, [
    el('button', { class: 'btn xs primary', text: '編輯內容', onclick: () => editContent(s.id) }),
    el('button', { class: 'btn xs', text: '複製', onclick: () => copySet(s.id) }),
    el('button', { class: 'btn xs', text: isActive ? '已上線' : '設為上線', onclick: () => { if (!isActive) setActive(s.id); } }),
    el('button', { class: 'btn xs danger', text: '刪除', onclick: () => deleteSet(s) })
  ]));
  return card;
}

// 「編輯內容」→ 寫信號 + 切到條件編輯器分頁（外殼接 hash）
function editContent(id) {
  localStorage.setItem(EDIT_KEY, JSON.stringify({ id, t: Date.now() }));
  try { window.top.location.hash = '#cond'; } catch (e) {}
}

async function newSet() {
  if (!isStaff()) return alert('需 admin/teacher');
  const id = 'set-' + nowStamp();
  try { await setDoc(doc(db, 'ruleSets', id), { name: '新套裝', period: '', note: '', basedOn: null, status: 'draft', createdAt: new Date().toISOString() }); loadList(); }
  catch (e) { alert('新增失敗：' + (e.code || e.message)); }
}
async function copySet(id) {
  if (!isStaff()) return alert('需 admin/teacher');
  try {
    const m = await getDoc(doc(db, 'ruleSets', id)); const dims = await getDocs(collection(db, 'ruleSets', id, 'dims'));
    const meta = m.exists() ? m.data() : {}; const newId = 'set-' + nowStamp();
    await setDoc(doc(db, 'ruleSets', newId), { name: (meta.name || '套裝') + ' 複本', period: meta.period || '', note: meta.note || '', basedOn: id, status: 'draft', createdAt: new Date().toISOString() });
    const batch = writeBatch(db); dims.forEach(d => batch.set(doc(db, 'ruleSets', newId, 'dims', d.id), d.data())); await batch.commit();
    loadList();
  } catch (e) { alert('複製失敗：' + (e.code || e.message)); }
}
async function setActive(id) {
  if (!isStaff()) return alert('需 admin/teacher');
  try {
    let prev = null; const a = await getDoc(doc(db, 'config', 'active')); if (a.exists()) prev = a.data().activeRuleSetId || null;
    await setDoc(doc(db, 'config', 'active'), { activeRuleSetId: id, previousActiveRuleSetId: prev, defaultSpice: (a.exists() && a.data().defaultSpice) || '中辣', updatedAt: new Date().toISOString() });
    loadList();
  } catch (e) { alert('設上線失敗：' + (e.code || e.message)); }
}
async function rollback() {
  if (!isStaff()) return alert('需 admin/teacher');
  try {
    const a = await getDoc(doc(db, 'config', 'active'));
    if (!a.exists() || !a.data().previousActiveRuleSetId) return alert('沒有上一版可回滾');
    const cur = a.data().activeRuleSetId, prev = a.data().previousActiveRuleSetId;
    if (!confirm('把上線版從「' + cur + '」回滾到「' + prev + '」？')) return;
    await setDoc(doc(db, 'config', 'active'), { activeRuleSetId: prev, previousActiveRuleSetId: cur, defaultSpice: a.data().defaultSpice || '中辣', updatedAt: new Date().toISOString() });
    loadList();
  } catch (e) { alert('回滾失敗：' + (e.code || e.message)); }
}
async function deleteSet(s) {
  if (!isStaff()) return alert('需 admin/teacher');
  if (!confirm('永久刪除套裝「' + (s.name || s.id) + '」及其全部維度內容？此動作不可復原。')) return;
  try {
    const dims = await getDocs(collection(db, 'ruleSets', s.id, 'dims'));
    const batch = writeBatch(db); dims.forEach(d => batch.delete(doc(db, 'ruleSets', s.id, 'dims', d.id))); batch.delete(doc(db, 'ruleSets', s.id)); await batch.commit();
    loadList();
  } catch (e) { alert('刪除失敗：' + (e.code || e.message)); }
}

function boot() {
  $('btn-login').addEventListener('click', () => login().catch(e => alert('登入失敗：' + (e.code || e.message))));
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-new').addEventListener('click', newSet);
  $('btn-rollback').addEventListener('click', rollback);
  $('btn-refresh').addEventListener('click', loadList);
  window.addEventListener('storage', e => { if (e.key === EDIT_KEY) loadList(); });  // 編輯中標記跟著變
  renderHeader();
  onUser((u, r) => { user = u; role = r; loadList(); });
}
boot();
