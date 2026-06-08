// p2/js/users_admin.js — 使用者 / 白名單管理（rbf2app-staging）。三欄式：分組｜名片卡｜預覽編輯。
// allowedUsers/{email} = { email, role, name, period, note, photo, group, addedAt, updatedAt }。
//   group=分組名稱(字串，空=未分組)；photo=大頭照縮圖(base64 jpeg, 最長邊≤200px)。
// 分組清單存在保留文件 allowedUsers/__groups__ = { groups:[...], _meta:true }（避免新 collection 被規則擋）。
//   白名單＝可登入名單；admin 可寫、登入者可讀。
// 註：users/{uid} 只能本人讀寫，所以「角色實際生效」需登入流程把 allowedUsers.role 帶進 users/{uid}（之後接報告/部署時做）。
import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from './fb.js';

const GROUPS_DOC = '__groups__';
const NONE = '__none__';      // 未分組 filter
const ALL = '__all__';        // 全部 filter

let user = null, role = null;
let users = [];               // [{id, ...data}]（不含 meta）
let groups = [];              // 分組名稱清單（有序）
let selGroup = ALL;           // 目前選的分組 filter
let selId = null;             // 目前選的人 id

const isAdmin = () => !!user && role === 'admin';
const $ = id => document.getElementById(id);
const roleZh = r => r === 'admin' ? '管理員' : r === 'teacher' ? '老師' : '學員';
const roleCls = r => r === 'admin' ? 'admin' : r === 'teacher' ? 'teacher' : 'student';
const initial = s => (s || '').trim().charAt(0).toUpperCase() || '?';
const groupOf = u => (u.group || '').trim();
function el(t, a = {}, k = []) { const e = document.createElement(t); for (const x in a) { if (x === 'class') e.className = a[x]; else if (x === 'text') e.textContent = a[x]; else if (x === 'value') e.value = a[x]; else if (x.startsWith('on')) e.addEventListener(x.slice(2), a[x]); else e.setAttribute(x, a[x]); } (Array.isArray(k) ? k : [k]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return e; }

// ── 頭部 ──
function renderHeader() {
  $('status').textContent = !fbOK() ? '🔌 Firebase 未連線' : (!user ? '未登入' : ('已登入：' + (user.email || user.uid)));
  $('btn-login').style.display = (fbOK() && !user) ? '' : 'none';
  $('btn-logout').style.display = user ? '' : 'none';
  $('me-badge').innerHTML = '';
  if (user) $('me-badge').appendChild(el('span', { class: 'badge ' + roleCls(role), text: roleZh(role) }));
  $('warn').innerHTML = '';
  if (user && !isAdmin()) $('warn').appendChild(el('div', { class: 'role-warn', text: '你的角色不是 admin → 可看白名單，但不能新增/改/移除（只有 admin 能寫）。' }));
}

// ── 載入全部 ──
async function loadAll() {
  renderHeader();
  if (!fbOK() || !user) {
    groups = []; users = [];
    renderGroups(); renderAddbar(); renderCards(); renderDetail();
    $('clist').innerHTML = ''; $('clist').appendChild(el('div', { class: 'hint', text: '登入後顯示白名單。' }));
    return;
  }
  $('clist').innerHTML = ''; $('clist').appendChild(el('div', { class: 'hint', text: '讀取中…' }));
  try {
    const snap = await getDocs(collection(db, 'allowedUsers'));
    users = []; let meta = null;
    snap.forEach(d => { if (d.id === GROUPS_DOC || d.data()._meta) meta = d.data(); else users.push({ id: d.id, ...d.data() }); });
    users.sort((a, b) => (a.name || a.email || a.id).localeCompare(b.name || b.email || b.id, 'zh-Hant'));
    // 分組清單＝ meta 清單 ∪ 使用者實際用到的分組
    const fromUsers = [...new Set(users.map(groupOf).filter(Boolean))];
    const fromMeta = (meta && Array.isArray(meta.groups)) ? meta.groups : [];
    groups = [...fromMeta];
    fromUsers.forEach(g => { if (!groups.includes(g)) groups.push(g); });
    if (selGroup !== ALL && selGroup !== NONE && !groups.includes(selGroup)) selGroup = ALL;
    if (selId && !users.some(u => u.id === selId)) selId = null;
    renderGroups(); renderAddbar(); renderCards(); renderDetail();
  } catch (e) {
    $('clist').innerHTML = ''; $('clist').appendChild(el('div', { class: 'hint', text: '讀取失敗：' + (e.code || e.message) }));
  }
}

// ── 左欄：分組 ──
function countIn(g) {
  if (g === ALL) return users.length;
  if (g === NONE) return users.filter(u => !groupOf(u)).length;
  return users.filter(u => groupOf(u) === g).length;
}
function gItem(key, label) {
  const sel = selGroup === key;
  const row = el('div', { class: 'g-item' + (sel ? ' sel' : ''), onclick: () => { selGroup = key; renderGroups(); renderCards(); } }, [
    el('span', { class: 'g-name', text: label }),
    el('span', { class: 'g-cnt', text: countIn(key) })
  ]);
  if (isAdmin() && key !== ALL && key !== NONE) {
    const ops = el('span', { class: 'g-ops' }, [
      el('button', { class: 'btn xs', text: '✎', title: '改名', onclick: e => { e.stopPropagation(); renameGroup(key); } }),
      el('button', { class: 'btn xs danger', text: '✕', title: '刪除分組', onclick: e => { e.stopPropagation(); deleteGroup(key); } })
    ]);
    row.appendChild(ops);
  }
  return row;
}
function renderGroups() {
  const box = $('glist'); box.innerHTML = '';
  box.appendChild(gItem(ALL, '全部'));
  groups.forEach(g => box.appendChild(gItem(g, g)));
  if (countIn(NONE) > 0) box.appendChild(gItem(NONE, '未分組'));
  // 新增分組
  const add = $('g-add'); add.innerHTML = '';
  if (isAdmin()) {
    const inp = el('input', { type: 'text', placeholder: '新分組名稱…' });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') addGroup(inp); });
    add.appendChild(inp);
    add.appendChild(el('button', { class: 'btn sm primary', text: '＋ 新增分組', onclick: () => addGroup(inp) }));
  }
  $('g-note').textContent = '白名單＝可登入名單。分組僅供整理，不影響登入權限。';
}

async function saveGroups() {
  await setDoc(doc(db, 'allowedUsers', GROUPS_DOC), { groups, _meta: true, updatedAt: new Date().toISOString() }, { merge: true });
}
async function addGroup(inp) {
  if (!isAdmin()) return;
  const name = (inp.value || '').trim();
  if (!name) return;
  if (name === ALL || name === NONE) return alert('這個名稱是保留字，請換一個。');
  if (groups.includes(name)) { inp.value = ''; selGroup = name; renderGroups(); renderCards(); return; }
  groups.push(name); inp.value = '';
  try { await saveGroups(); selGroup = name; renderGroups(); renderCards(); }
  catch (e) { alert('新增分組失敗：' + (e.code || e.message)); groups = groups.filter(g => g !== name); renderGroups(); }
}
async function renameGroup(old) {
  if (!isAdmin()) return;
  const nn = prompt('把分組「' + old + '」改名為：', old);
  if (nn == null) return;
  const name = nn.trim();
  if (!name || name === old) return;
  if (groups.includes(name)) return alert('已有同名分組。');
  try {
    groups = groups.map(g => g === old ? name : g);
    const batch = writeBatch(db);
    users.filter(u => groupOf(u) === old).forEach(u => { u.group = name; batch.set(doc(db, 'allowedUsers', u.id), { group: name }, { merge: true }); });
    await batch.commit();
    await saveGroups();
    if (selGroup === old) selGroup = name;
    renderGroups(); renderCards(); renderDetail();
  } catch (e) { alert('改名失敗：' + (e.code || e.message)); loadAll(); }
}
async function deleteGroup(name) {
  if (!isAdmin()) return;
  const n = countIn(name);
  if (!confirm('刪除分組「' + name + '」？' + (n ? '（' + n + ' 人會變成「未分組」，不會刪到人）' : ''))) return;
  try {
    groups = groups.filter(g => g !== name);
    const batch = writeBatch(db);
    users.filter(u => groupOf(u) === name).forEach(u => { u.group = ''; batch.set(doc(db, 'allowedUsers', u.id), { group: '' }, { merge: true }); });
    await batch.commit();
    await saveGroups();
    if (selGroup === name) selGroup = ALL;
    renderGroups(); renderCards(); renderDetail();
  } catch (e) { alert('刪除失敗：' + (e.code || e.message)); loadAll(); }
}

// ── 中欄：加人列＋名片卡 ──
function renderAddbar() {
  const bar = $('addbar'); bar.innerHTML = '';
  if (!isAdmin()) return;
  const email = el('input', { type: 'email', placeholder: 'email 加入白名單…', autocomplete: 'off' });
  const rsel = el('select', {}, ['student', 'teacher', 'admin'].map(v => el('option', { value: v, text: roleZh(v) })));
  const btn = el('button', { class: 'btn sm primary', text: '＋ 加入', onclick: () => addUser(email, rsel) });
  email.addEventListener('keydown', e => { if (e.key === 'Enter') addUser(email, rsel); });
  bar.appendChild(email); bar.appendChild(rsel); bar.appendChild(btn);
}
function filtered() {
  if (selGroup === ALL) return users;
  if (selGroup === NONE) return users.filter(u => !groupOf(u));
  return users.filter(u => groupOf(u) === selGroup);
}
function renderCards() {
  const box = $('clist'); box.innerHTML = '';
  if (!fbOK() || !user) { box.appendChild(el('div', { class: 'hint', text: '登入後顯示白名單。' })); return; }
  const arr = filtered();
  if (!arr.length) { box.appendChild(el('div', { class: 'hint', text: users.length ? '這個分組還沒有人。' : '尚無白名單。用上方欄位加入 email。' })); return; }
  arr.forEach(u => {
    const display = u.name || u.email || u.id;
    const av = u.photo ? el('img', { class: 'av', src: u.photo, alt: display }) : el('div', { class: 'av ph', text: initial(display) });
    const card = el('div', { class: 'ncard' + (u.id === selId ? ' sel' : ''), onclick: () => { selId = u.id; renderCards(); renderDetail(); } }, [
      av,
      el('div', { class: 'ncard-main' }, [
        el('div', { class: 'ncard-name', text: u.name || u.email || u.id }),
        el('div', { class: 'ncard-note', text: u.note ? u.note.replace(/\s+/g, ' ').trim() : (u.name ? (u.email || u.id) : '（無備註）') })
      ])
    ]);
    box.appendChild(card);
  });
}

// ── 右欄：預覽 / 編輯 ──
function renderDetail() {
  const box = $('detail'); box.innerHTML = '';
  if (!fbOK() || !user) { box.appendChild(el('div', { class: 'd-empty', text: '請先用 Google 登入。' })); return; }
  const u = users.find(x => x.id === selId);
  if (!u) { box.appendChild(el('div', { class: 'd-empty', text: '← 在中間點一張名片卡，這裡會顯示姓名、備註、照片、分組，可直接編輯。' })); return; }
  const ro = !isAdmin();
  const display = u.name || u.email || u.id;

  let photoData = u.photo || '';
  const photoImg = () => photoData ? el('img', { class: 'd-photo', src: photoData, alt: display }) : el('div', { class: 'd-photo ph', text: '無照片' });
  const photoWrap = el('div', {}, [photoImg()]);
  const fileIn = el('input', { type: 'file', accept: 'image/*' }); fileIn.disabled = ro;
  const rmPhoto = el('button', { class: 'btn xs danger', text: '移除照片' }); rmPhoto.disabled = ro || !photoData;
  function setPhoto(d) { photoData = d || ''; photoWrap.replaceChild(photoImg(), photoWrap.firstChild); rmPhoto.disabled = ro || !photoData; }
  fileIn.addEventListener('change', async () => { const f = fileIn.files && fileIn.files[0]; if (!f) return; try { setPhoto(await fileToThumb(f, 200)); } catch (e) { alert('讀取圖片失敗：' + (e.message || e)); } fileIn.value = ''; });
  rmPhoto.addEventListener('click', () => setPhoto(''));
  const photoCtrls = el('div', {}, ro ? [] : [fileIn, el('div', { style: 'margin-top:6px;' }, [rmPhoto])]);
  const photoRow = el('div', { class: 'd-photo-row' }, [photoWrap, photoCtrls]);

  const nameIn = el('input', { type: 'text', value: u.name || '', placeholder: '姓名' }); nameIn.disabled = ro;
  const nameFld = el('div', { class: 'fld' }, [el('label', { text: '姓名' }), nameIn]);

  const grpSel = el('select', {}, [el('option', { value: '', text: '未分組' })].concat(groups.map(g => el('option', { value: g, text: g }))));
  grpSel.value = groupOf(u); grpSel.disabled = ro;
  const grpFld = el('div', { class: 'fld' }, [el('label', { text: '分組' }), grpSel]);

  const noteIn = el('textarea', { placeholder: '備註（可多行）' }); noteIn.value = u.note || ''; noteIn.disabled = ro;
  const noteFld = el('div', { class: 'fld' }, [el('label', { text: '備註' }), noteIn]);

  const photoFld = el('div', { class: 'fld' }, [el('label', { text: '大頭照（自動縮成 ≤200px 縮圖存檔）' }), photoRow]);

  // 次要欄位：角色、上課期間（沿用 v2，不丟功能）
  const roleSel = el('select', {}, ['student', 'teacher', 'admin'].map(v => el('option', { value: v, text: roleZh(v) + (v === 'student' ? '' : '(' + v + ')') })));
  roleSel.value = u.role || 'student'; roleSel.disabled = ro;
  const roleFld = el('div', { class: 'fld' }, [el('label', { text: '角色' }), roleSel]);

  const periodIn = el('input', { type: 'text', value: u.period || '', placeholder: '例：2026 春季' }); periodIn.disabled = ro;
  const periodFld = el('div', { class: 'fld' }, [el('label', { text: '上課期間' }), periodIn]);

  const emailFld = el('div', { class: 'fld ro' }, [el('label', { text: 'Email（帳號 / 不可改）' }), el('div', { class: 'v', text: u.email || u.id })]);

  const state = el('span', { class: 'save-state' });
  const foot = el('div', { class: 'd-foot' });
  if (!ro) {
    const saveBtn = el('button', { class: 'btn primary', text: '儲存' });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true; state.className = 'save-state'; state.textContent = '儲存中…';
      const data = { email: u.email || u.id, name: nameIn.value.trim(), group: grpSel.value, note: noteIn.value, photo: photoData, role: roleSel.value, period: periodIn.value.trim(), updatedAt: new Date().toISOString() };
      try {
        await setDoc(doc(db, 'allowedUsers', u.id), data, { merge: true });
        Object.assign(u, data);
        state.className = 'save-state ok'; state.textContent = '✓ 已儲存';
        renderGroups(); renderCards();   // 名字/備註/分組可能變 → 同步左中欄
      } catch (e) { state.className = 'save-state err'; state.textContent = '儲存失敗：' + (e.code || e.message); }
      saveBtn.disabled = false;
    });
    const rmBtn = el('button', { class: 'btn danger', text: '移除此人' });
    rmBtn.addEventListener('click', () => removeUser(u));
    foot.appendChild(saveBtn); foot.appendChild(rmBtn);
  }
  foot.appendChild(state);
  if (u.addedAt || u.updatedAt) foot.appendChild(el('span', { class: 'save-state', text: tsHint(u) }));

  const wrap = el('div', { class: 'detail-wrap' }, [photoFld, nameFld, grpFld, noteFld, roleFld, periodFld, emailFld, foot]);
  if (ro) wrap.appendChild(el('div', { class: 'hint', text: '（你不是 admin，欄位唯讀。）' }));
  box.appendChild(wrap);
}

function tsHint(u) {
  const fmt = s => { try { return new Date(s).toLocaleDateString('zh-Hant'); } catch (e) { return s; } };
  const p = [];
  if (u.addedAt) p.push('加入 ' + fmt(u.addedAt));
  if (u.updatedAt) p.push('更新 ' + fmt(u.updatedAt));
  return p.join('　·　');
}

// 檔案 → 縮圖 base64（最長邊 ≤ max）
function fileToThumb(file, max) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('檔案讀取失敗'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('不是有效圖片'));
      img.onload = () => {
        let w = img.width, h = img.height;
        const scale = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const cv = el('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.7));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

async function addUser(emailInp, roleSel) {
  if (!isAdmin()) return alert('只有 admin 能新增白名單。');
  const email = (emailInp.value || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('請輸入有效 email。');
  if (email === GROUPS_DOC) return alert('這個 email 是保留字。');
  const data = { email, role: roleSel.value, addedAt: new Date().toISOString() };
  if (selGroup !== ALL && selGroup !== NONE) data.group = selGroup;   // 在某分組內加人 → 直接歸該組
  try {
    await setDoc(doc(db, 'allowedUsers', email), data, { merge: true });
    emailInp.value = ''; selId = email; await loadAll();
  } catch (e) { alert('新增失敗：' + (e.code || e.message)); }
}

async function removeUser(u) {
  if (!isAdmin()) return alert('只有 admin 能移除。');
  if (!confirm('把「' + (u.name || u.email || u.id) + '」移出白名單？（之後此人將無法登入）')) return;
  try { await deleteDoc(doc(db, 'allowedUsers', u.id)); if (selId === u.id) selId = null; await loadAll(); }
  catch (e) { alert('移除失敗：' + (e.code || e.message)); }
}

function boot() {
  $('btn-login').addEventListener('click', () => login().catch(e => alert('登入失敗：' + (e.code || e.message))));
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-refresh').addEventListener('click', loadAll);
  renderHeader();
  onUser((u, r) => { user = u; role = r; loadAll(); });
}
boot();
