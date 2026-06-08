// p2/js/users_admin.js — 使用者 / 白名單管理（rbf2app-staging）。
// allowedUsers/{email} = { email, role, note, addedAt }。白名單＝可登入名單(前端登入靠它放行)；admin 可寫、登入者可讀。
// 註：現行規則 users/{uid} 只能本人讀寫，admin 無法列出/改別人的 users.role；
//     所以這裡管的是 allowedUsers。「角色實際生效」需登入流程把 allowedUsers.role 帶進 users/{uid}（之後接報告/部署時做）。
import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from './fb.js';

let user = null, role = null;
const isAdmin = () => !!user && role === 'admin';
const $ = id => document.getElementById(id);
const roleZh = r => r === 'admin' ? '管理員' : r === 'teacher' ? '老師' : '學員';
const roleCls = r => r === 'admin' ? 'admin' : r === 'teacher' ? 'teacher' : 'student';
function el(t, a = {}, k = []) { const e = document.createElement(t); for (const x in a) { if (x === 'class') e.className = a[x]; else if (x === 'text') e.textContent = a[x]; else if (x === 'value') e.value = a[x]; else if (x.startsWith('on')) e.addEventListener(x.slice(2), a[x]); else e.setAttribute(x, a[x]); } (Array.isArray(k) ? k : [k]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return e; }

function renderHeader() {
  $('status').textContent = !fbOK() ? '🔌 Firebase 未連線' : (!user ? '未登入' : ('已登入：' + (user.email || user.uid)));
  $('btn-login').style.display = (fbOK() && !user) ? '' : 'none';
  $('btn-logout').style.display = user ? '' : 'none';
  $('me').innerHTML = '';
  if (user) $('me').appendChild(el('div', {}, [
    el('div', {}, ['你：', el('b', { text: user.email || '(無 email)' }), '　角色：', el('span', { class: 'badge ' + roleCls(role), text: roleZh(role) })]),
    el('div', { class: 'hint', text: 'UID：' + user.uid }, [])
  ]));
  else $('me').textContent = '請先用 Google 登入。';
  $('warn').innerHTML = '';
  if (user && !isAdmin()) $('warn').appendChild(el('div', { class: 'role-warn', text: '你的角色不是 admin → 可以看白名單，但不能新增/改/移除（只有 admin 能寫白名單）。' }));
  $('effect-note').textContent = '說明：白名單＝「可登入名單」（前端登入靠它放行）。這裡標的角色目前是名單上的標記；要讓角色真正生效（admin/老師權限），需在登入流程把它帶進使用者資料 — 之後接報告/部署時一起做。';
}

async function loadList() {
  renderHeader();
  const box = $('list'); box.innerHTML = '';
  if (!fbOK() || !user) { box.appendChild(el('div', { class: 'hint', text: '登入後顯示白名單。' })); return; }
  box.appendChild(el('div', { class: 'hint', text: '讀取中…' }));
  try {
    const snap = await getDocs(collection(db, 'allowedUsers'));
    const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    arr.sort((a, b) => (a.email || a.id).localeCompare(b.email || b.id));
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'hint', text: '白名單共 ' + arr.length + ' 人' }));
    if (!arr.length) box.appendChild(el('div', { class: 'hint', text: '尚無白名單。用上方欄位加入 email。' }));
    arr.forEach(u => box.appendChild(renderRow(u)));
  } catch (e) { box.innerHTML = ''; box.appendChild(el('div', { class: 'hint', text: '讀取失敗：' + (e.code || e.message) })); }
}

function renderRow(u) {
  const r = u.role || 'student';
  const sel = el('select', {}, ['student', 'teacher', 'admin'].map(v => el('option', { value: v, text: roleZh(v) + (v === 'student' ? '' : '(' + v + ')') })));
  sel.value = r; sel.disabled = !isAdmin();
  sel.addEventListener('change', async () => {
    if (!isAdmin()) return;
    try { await setDoc(doc(db, 'allowedUsers', u.id), { role: sel.value }, { merge: true }); badge.className = 'badge ' + roleCls(sel.value); badge.textContent = roleZh(sel.value); }
    catch (e) { alert('更新失敗：' + (e.code || e.message)); sel.value = r; }
  });
  const badge = el('span', { class: 'badge ' + roleCls(r), text: roleZh(r) });
  const row = el('div', { class: 'row' }, [
    el('span', { class: 'em', text: u.email || u.id }), badge, sel
  ]);
  if (isAdmin()) row.appendChild(el('button', { class: 'btn xs danger', text: '移除', onclick: () => removeUser(u) }));
  return row;
}

async function addUser() {
  if (!isAdmin()) return alert('只有 admin 能新增白名單。');
  const email = ($('add-email').value || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('請輸入有效 email。');
  const r = $('add-role').value;
  try {
    await setDoc(doc(db, 'allowedUsers', email), { email, role: r, addedAt: new Date().toISOString() }, { merge: true });
    $('add-email').value = ''; loadList();
  } catch (e) { alert('新增失敗：' + (e.code || e.message)); }
}

async function removeUser(u) {
  if (!isAdmin()) return alert('只有 admin 能移除。');
  if (!confirm('把「' + (u.email || u.id) + '」移出白名單？（之後此人將無法登入）')) return;
  try { await deleteDoc(doc(db, 'allowedUsers', u.id)); loadList(); }
  catch (e) { alert('移除失敗：' + (e.code || e.message)); }
}

function boot() {
  $('btn-login').addEventListener('click', () => login().catch(e => alert('登入失敗：' + (e.code || e.message))));
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-refresh').addEventListener('click', loadList);
  $('add-btn').addEventListener('click', addUser);
  $('add-email').addEventListener('keydown', e => { if (e.key === 'Enter') addUser(); });
  renderHeader();
  onUser((u, r) => { user = u; role = r; loadList(); });
}
boot();
