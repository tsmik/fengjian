// p2/js/users_admin.js — 使用者 / 白名單管理（rbf2app-staging）。
// allowedUsers/{email} = { email, role, name, period, note, photo, addedAt, updatedAt }。
//   name=姓名, period=上課期間(自由文字), note=備註(可多行), photo=大頭照縮圖(base64 jpeg, 最長邊≤200px)。
//   白名單＝可登入名單(前端登入靠它放行)；admin 可寫、登入者可讀。
// 註：現行規則 users/{uid} 只能本人讀寫，admin 無法列出/改別人的 users.role；
//     所以這裡管的是 allowedUsers。「角色實際生效」需登入流程把 allowedUsers.role 帶進 users/{uid}（之後接報告/部署時做）。
import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from './fb.js';

let user = null, role = null;
const isAdmin = () => !!user && role === 'admin';
const $ = id => document.getElementById(id);
const roleZh = r => r === 'admin' ? '管理員' : r === 'teacher' ? '老師' : '學員';
const roleCls = r => r === 'admin' ? 'admin' : r === 'teacher' ? 'teacher' : 'student';
function el(t, a = {}, k = []) { const e = document.createElement(t); for (const x in a) { if (x === 'class') e.className = a[x]; else if (x === 'text') e.textContent = a[x]; else if (x === 'value') e.value = a[x]; else if (x.startsWith('on')) e.addEventListener(x.slice(2), a[x]); else e.setAttribute(x, a[x]); } (Array.isArray(k) ? k : [k]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return e; }
const initial = s => (s || '').trim().charAt(0).toUpperCase() || '?';

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
    arr.sort((a, b) => (a.name || a.email || a.id).localeCompare(b.name || b.email || b.id, 'zh-Hant'));
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'hint', text: '白名單共 ' + arr.length + ' 人' }));
    if (!arr.length) box.appendChild(el('div', { class: 'hint', text: '尚無白名單。用上方欄位加入 email。' }));
    arr.forEach(u => box.appendChild(renderCard(u)));
  } catch (e) { box.innerHTML = ''; box.appendChild(el('div', { class: 'hint', text: '讀取失敗：' + (e.code || e.message) })); }
}

// ── 一張學員卡片：上半頭部恆顯，點開後展開可編輯欄位 ──
function renderCard(u) {
  const r = u.role || 'student';
  const display = u.name || u.email || u.id;

  // 頭像（縮圖 or 文字佔位）
  const avatar = u.photo
    ? el('img', { class: 'avatar', src: u.photo, alt: display })
    : el('div', { class: 'avatar ph', text: initial(display) });

  const badge = el('span', { class: 'badge ' + roleCls(r), text: roleZh(r) });
  const nameEl = el('div', { class: 'card-name' }, [
    el('span', { text: u.name || '(未填姓名)' }),
    u.name ? el('span', { class: 'em-sub', text: u.email || u.id }) : null
  ]);
  const metaEl = el('div', { class: 'card-meta' }, [
    u.name ? null : el('span', { text: u.email || u.id }),
    u.period ? el('span', { text: '期間：' + u.period }) : null
  ]);
  const head = el('div', { class: 'card-head' }, [
    avatar, el('div', { class: 'card-main' }, [nameEl, metaEl]), badge, el('span', { class: 'chev', text: '▸' })
  ]);

  const body = el('div', { class: 'card-body' });
  const card = el('div', { class: 'card' }, [head, body]);
  let built = false;
  head.addEventListener('click', () => {
    const open = card.classList.toggle('open');
    if (open && !built) { buildEditor(body, u); built = true; }
  });
  return card;
}

function buildEditor(body, u) {
  const ro = !isAdmin();
  const display = u.name || u.email || u.id;

  // email（唯讀，文件 id）
  const emailFld = el('div', { class: 'fld ro' }, [
    el('label', { text: 'Email（帳號 / 不可改）' }), el('div', { class: 'v', text: u.email || u.id })
  ]);

  // 姓名
  const nameIn = el('input', { type: 'text', value: u.name || '', placeholder: '姓名' });
  nameIn.disabled = ro;
  const nameFld = el('div', { class: 'fld' }, [el('label', { text: '姓名' }), nameIn]);

  // 角色
  const roleSel = el('select', {}, ['student', 'teacher', 'admin'].map(v => el('option', { value: v, text: roleZh(v) + (v === 'student' ? '' : '(' + v + ')') })));
  roleSel.value = u.role || 'student'; roleSel.disabled = ro;
  const roleFld = el('div', { class: 'fld' }, [el('label', { text: '角色' }), roleSel]);

  // 上課期間
  const periodIn = el('input', { type: 'text', value: u.period || '', placeholder: '例：2026 春季 / 第 3 期' });
  periodIn.disabled = ro;
  const periodFld = el('div', { class: 'fld' }, [el('label', { text: '上課期間' }), periodIn]);

  // 備註
  const noteIn = el('textarea', { placeholder: '備註（可多行）' });
  noteIn.value = u.note || ''; noteIn.disabled = ro;
  const noteFld = el('div', { class: 'fld' }, [el('label', { text: '備註' }), noteIn]);

  // 照片
  let photoData = u.photo || '';
  const prev = photoData
    ? el('img', { class: 'photo-prev', src: photoData, alt: '大頭照' })
    : el('div', { class: 'photo-prev ph', text: '無照片' });
  const fileIn = el('input', { type: 'file', accept: 'image/*' });
  fileIn.disabled = ro;
  const rmPhotoBtn = el('button', { class: 'btn xs danger', text: '移除照片' });
  rmPhotoBtn.disabled = ro || !photoData;
  const photoCtrls = el('div', {}, [fileIn, ro ? null : el('div', { style: 'margin-top:6px;' }, [rmPhotoBtn])]);
  const photoRow = el('div', { class: 'photo-row' }, [prev, photoCtrls]);
  const photoFld = el('div', { class: 'fld' }, [el('label', { text: '大頭照（自動縮成 ≤200px 縮圖存檔）' }), photoRow]);

  function setPreview(data) {
    photoData = data || '';
    const np = photoData ? el('img', { class: 'photo-prev', src: photoData, alt: '大頭照' }) : el('div', { class: 'photo-prev ph', text: '無照片' });
    photoRow.replaceChild(np, photoRow.firstChild);
    rmPhotoBtn.disabled = ro || !photoData;
  }
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    try { setPreview(await fileToThumb(f, 200)); }
    catch (e) { alert('讀取圖片失敗：' + (e.message || e)); }
    fileIn.value = '';
  });
  rmPhotoBtn.addEventListener('click', () => setPreview(''));

  // 頁腳：存檔 / 移除 / 狀態
  const state = el('span', { class: 'save-state' });
  const foot = el('div', { class: 'card-foot' });
  if (!ro) {
    const saveBtn = el('button', { class: 'btn sm primary', text: '儲存' });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true; state.className = 'save-state'; state.textContent = '儲存中…';
      const data = {
        email: u.email || u.id,
        name: nameIn.value.trim(),
        role: roleSel.value,
        period: periodIn.value.trim(),
        note: noteIn.value,
        photo: photoData,
        updatedAt: new Date().toISOString()
      };
      try {
        await setDoc(doc(db, 'allowedUsers', u.id), data, { merge: true });
        Object.assign(u, data);
        state.className = 'save-state ok'; state.textContent = '✓ 已儲存';
        refreshCardHead(body, u);
      } catch (e) { state.className = 'save-state err'; state.textContent = '儲存失敗：' + (e.code || e.message); }
      saveBtn.disabled = false;
    });
    const rmBtn = el('button', { class: 'btn sm danger', text: '移除此人' });
    rmBtn.addEventListener('click', () => removeUser(u));
    foot.appendChild(saveBtn); foot.appendChild(rmBtn);
  }
  foot.appendChild(state);
  if (u.addedAt || u.updatedAt) foot.appendChild(el('span', { class: 'save-state', text: tsHint(u) }));

  body.innerHTML = '';
  [emailFld, nameFld, roleFld, periodFld, noteFld, photoFld, foot].forEach(x => body.appendChild(x));
  if (ro) body.appendChild(el('div', { class: 'hint', text: '（你不是 admin，欄位唯讀。）' }));
}

function tsHint(u) {
  const fmt = s => { try { return new Date(s).toLocaleDateString('zh-Hant'); } catch (e) { return s; } };
  const parts = [];
  if (u.addedAt) parts.push('加入 ' + fmt(u.addedAt));
  if (u.updatedAt) parts.push('更新 ' + fmt(u.updatedAt));
  return parts.join('　·　');
}

// 存檔後即時更新卡片頭部（頭像/姓名/角色/期間），不必整列重讀
function refreshCardHead(body, u) {
  const card = body.closest('.card'); if (!card) return;
  const head = card.querySelector('.card-head');
  const fresh = renderCard(u);
  const newHead = fresh.querySelector('.card-head');
  card.replaceChild(newHead, head);
  // 新頭部沿用目前展開狀態；body 編輯器已存在，點頭部只切換顯示
  newHead.addEventListener('click', () => card.classList.toggle('open'));
}

// 檔案 → 置中裁切的方形縮圖 base64（最長邊 ≤ max）
function fileToThumb(file, max) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('檔案讀取失敗'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('不是有效圖片'));
      img.onload = () => {
        let { width: w, height: h } = img;
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
  if (!confirm('把「' + (u.name || u.email || u.id) + '」移出白名單？（之後此人將無法登入）')) return;
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
