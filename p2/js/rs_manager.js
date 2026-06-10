// p2/js/rs_manager.js — 套裝管理（獨立分頁）。rbf2app-staging 的 ruleSets。
// 每套裝：名稱(name)、時期(period, YYYY-MM)、說明(note，可拉開的文字框)。
// 列出/新增/複製/設上線(config/active)/一鍵回滾/刪除；「編輯內容」→ 切到條件編輯器分頁載入該套裝。
import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from './fb.js';
import { diffSets, diffObsLib } from './rs_diff.js';

let user = null, role = null, showArchived = false;
let lastDiff = null, diffObsMode = false, showAllCond = false;
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
  if (!isStaff()) box.appendChild(el('div', { class: 'role-warn' }, [
    el('div', { text: '⚠️ 已登入，但角色不是 admin/teacher → 不能新增/修改套裝(以下唯讀)。' }),
    el('div', { text: '你的 UID：' + user.uid }),
    el('div', { text: '解法：Firebase console → rbf2app-staging → Firestore → 建/開 users/' + user.uid + ' → 加欄位 role = admin（字串）→ 回來「重新整理」。' })
  ]));
  const activeId = active && active.activeRuleSetId, prevId = active && active.previousActiveRuleSetId;
  const an = sets.find(x => x.id === activeId), pn = sets.find(x => x.id === prevId);
  $('active-line').textContent = '上線中：' + (an ? an.name || activeId : (activeId || '（無）')) + (prevId ? '　｜上一版：' + (pn ? pn.name || prevId : prevId) : '');
  if (!sets.length) { box.appendChild(el('div', { class: 'hint', text: '尚無套裝。按「＋新套裝」建立。' })); return; }
  const edId = editingId();
  sets.sort((a, b) => {                                    // 編輯中的排最上面，其餘日期降冪
    const ae = a.id === edId ? 1 : 0, be = b.id === edId ? 1 : 0;
    if (ae !== be) return be - ae;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  renderDiffControls(sets);
  const live = sets.filter(s => s.status !== 'archived'), archived = sets.filter(s => s.status === 'archived');
  live.forEach((s, i) => box.appendChild(renderCard(s, s.id === activeId, s.id === edId, i + 1)));
  if (archived.length) {
    const t = el('div', { class: 'arch-toggle', text: (showArchived ? '▾ 隱藏封存' : '▸ 顯示封存') + '（' + archived.length + '）' });
    t.addEventListener('click', () => { showArchived = !showArchived; renderList(sets, active); });
    box.appendChild(t);
    if (showArchived) archived.forEach(s => box.appendChild(renderCard(s, s.id === activeId, s.id === edId, null)));
  }
}

// 點文字才出現編輯框、移開(blur)就收回成文字
function inlineField(get, save, opts) {
  const wrap = el('span', { class: 'inline-field' + (opts.multiline ? ' ml' : '') });
  function showText() {
    wrap.innerHTML = '';
    const v = get();
    const t = el(opts.multiline ? 'div' : 'span', { class: 'if-text ' + (opts.cls || '') + (v ? '' : ' empty'), text: v || opts.placeholder });
    t.addEventListener('click', showEdit);
    wrap.appendChild(t);
  }
  function showEdit() {
    wrap.innerHTML = '';
    const inp = opts.multiline ? el('textarea', { class: 'if-input ' + (opts.cls || '') }) : el('input', { class: 'if-input ' + (opts.cls || '') });
    inp.value = get();
    inp.addEventListener('blur', () => { save(inp.value); showText(); });
    if (!opts.multiline) inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    wrap.appendChild(inp); inp.focus();
  }
  showText();
  return wrap;
}

function renderCard(s, isActive, isEditing, n) {
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
  const nameF = inlineField(() => s.name, v => { s.name = v; pushMeta({ name: v }); }, { placeholder: '（未命名，點此改名）', cls: 'f-name' });
  const period = el('input', { class: 'f-period', type: 'month', value: s.period || '' });
  period.addEventListener('change', () => { s.period = period.value; pushMeta({ period: period.value }); });

  const isArch = s.status === 'archived';
  const top = el('div', { class: 'rs-top' }, [
    n ? el('span', { class: 'rs-num', text: '#' + n }) : null,
    nameF, el('span', { class: 'lbl', text: '時期' }), period, savedTag
  ]);
  top.appendChild(el('span', { class: 'badge ' + (isActive ? 'act' : isArch ? 'arch' : 'draft'), text: isActive ? '上線中' : isArch ? '封存' : '草稿' }));
  if (isEditing) top.appendChild(el('span', { class: 'badge edit', text: '編輯中' }));
  card.appendChild(top);
  card.appendChild(el('div', { class: 'note-line' }, [el('span', { class: 'lbl', text: '說明' }), inlineField(() => s.note, v => { s.note = v; pushMeta({ note: v }); }, { multiline: true, placeholder: '（點此加說明…）', cls: 'f-note2' })]));
  const saved = s.savedAt ? s.savedAt.slice(0, 16).replace('T', ' ') : '尚未存內容';
  card.appendChild(el('div', { class: 'rs-meta', text: '最後儲存 ' + saved + '　·　已編 ' + (s.dimsAuthored || 0) + ' 維 / ' + (s.partsAuthored || 0) + ' 部位' }));
  let acts;
  if (isArch) {
    acts = [
      el('button', { class: 'btn xs', text: '還原', onclick: () => setStatus(s, 'draft') }),
      el('button', { class: 'btn xs', text: '複製', onclick: () => copySet(s.id) }),
      el('button', { class: 'btn xs danger', text: '永久刪除', onclick: () => deleteSet(s, isActive) })
    ];
  } else {
    acts = [
      el('button', { class: 'btn xs primary', text: '編輯內容', onclick: () => editContent(s.id) }),
      el('button', { class: 'btn xs', text: '複製', onclick: () => copySet(s.id) }),
      el('button', { class: 'btn xs', text: isActive ? '已上線' : '設為上線', onclick: () => { if (isActive) return; if (!(s.dimsAuthored > 0) && !confirm('此套裝尚無內容（' + (s.partsAuthored || 0) + ' 部位），設為上線後學員會讀到空規則。確定設上線？')) return; setActive(s.id); } }),
      el('button', { class: 'btn xs', text: '封存', title: isActive ? '上線中的套裝不能封存' : '', onclick: () => { if (isActive) return alert('這是「上線中」的套裝，不能封存。請先把別份設為上線或回滾。'); setStatus(s, 'archived'); } })
    ];
  }
  card.appendChild(el('div', { class: 'rs-acts' }, acts));
  return card;
}

async function setStatus(s, status) {
  if (!isStaff()) return alert('需 admin/teacher');
  if (status === 'archived' && !confirm('封存套裝「' + (s.name || s.id) + '」？封存後預設會收起來（可還原，不會刪資料）。')) return;
  try { await setDoc(doc(db, 'ruleSets', s.id), { status }, { merge: true }); loadList(); }
  catch (e) { alert('操作失敗：' + (e.code || e.message)); }
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
    const m = await getDoc(doc(db, 'ruleSets', id));
    const dims = await getDocs(collection(db, 'ruleSets', id, 'dims'));
    const obs = await getDocs(collection(db, 'ruleSets', id, 'observations'));   // 題庫一起 fork
    const lay = await getDoc(doc(db, 'ruleSets', id, 'obsmeta', 'layout'));
    const meta = m.exists() ? m.data() : {}; const newId = 'set-' + nowStamp();
    await setDoc(doc(db, 'ruleSets', newId), { name: (meta.name || '套裝') + ' 複本', period: meta.period || '', note: meta.note || '', basedOn: id, status: 'draft', createdAt: new Date().toISOString() });
    { const b = writeBatch(db); dims.forEach(d => b.set(doc(db, 'ruleSets', newId, 'dims', d.id), d.data())); await b.commit(); }
    if (!obs.empty) { const arr = []; obs.forEach(d => arr.push(d)); for (let i = 0; i < arr.length; i += 400) { const b = writeBatch(db); arr.slice(i, i + 400).forEach(d => b.set(doc(db, 'ruleSets', newId, 'observations', d.id), d.data())); await b.commit(); } }
    if (lay.exists()) await setDoc(doc(db, 'ruleSets', newId, 'obsmeta', 'layout'), lay.data());
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
async function deleteSet(s, isActive) {
  if (!isStaff()) return alert('需 admin/teacher');
  if (isActive) return alert('這是「上線中」的套裝，不能刪除。');
  if (!confirm('永久刪除套裝「' + (s.name || s.id) + '」及其全部維度內容＋題庫？此動作不可復原。')) return;
  try {
    const dims = await getDocs(collection(db, 'ruleSets', s.id, 'dims'));
    const obs = await getDocs(collection(db, 'ruleSets', s.id, 'observations'));
    const refs = [];
    dims.forEach(d => refs.push(doc(db, 'ruleSets', s.id, 'dims', d.id)));
    obs.forEach(d => refs.push(doc(db, 'ruleSets', s.id, 'observations', d.id)));
    refs.push(doc(db, 'ruleSets', s.id, 'obsmeta', 'layout'));
    refs.push(doc(db, 'ruleSets', s.id));   // 主檔最後
    for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
    loadList();
  } catch (e) { alert('刪除失敗：' + (e.code || e.message)); }
}

// ===== 版本比較（右欄）=====
function renderDiffControls(sets) {
  const a = $('cmp-a'), b = $('cmp-b'); if (!a || !b) return;
  const pa = a.value, pb = b.value;
  const fill = sel => { sel.innerHTML = ''; sets.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = (s.name || s.id) + (s.status === 'archived' ? '（封存）' : ''); sel.appendChild(o); }); };
  fill(a); fill(b);
  if (pa) a.value = pa; if (pb) b.value = pb;
  if (!a.value && sets[0]) a.value = sets[0].id;
  if (!b.value) b.value = (sets[1] || sets[0] || {}).id || '';
}

async function loadSetFull(id) {
  const m = await getDoc(doc(db, 'ruleSets', id));
  const ds = await getDocs(collection(db, 'ruleSets', id, 'dims'));
  const os = await getDocs(collection(db, 'ruleSets', id, 'observations'));   // 題庫一起比對
  const dims = {}; ds.forEach(x => { const dd = x.data(); dims[+dd.dimIndex] = dd; });
  const obs = {}; os.forEach(x => { const o = x.data(); obs[o.obsId || x.id] = o; });
  const meta = m.exists() ? m.data() : {};
  return { id, name: meta.name || id, basedOn: meta.basedOn || null, dims, obs };
}

async function runCompare() {
  const aId = $('cmp-a').value, bId = $('cmp-b').value;
  const out = $('diff-out'); out.innerHTML = '';
  if (!aId || !bId) { out.appendChild(el('div', { class: 'hint', text: '請先選兩個版本。' })); return; }
  if (aId === bId) { out.appendChild(el('div', { class: 'hint', text: '請選兩個「不同」的版本。' })); return; }
  out.appendChild(el('div', { class: 'hint', text: '比較中…' }));
  try {
    const [A, B] = await Promise.all([loadSetFull(aId), loadSetFull(bId)]);
    lastDiff = diffSets(A, B); lastDiff._a = A.name; lastDiff._b = B.name; lastDiff.obsLib = diffObsLib(A.obs, B.obs); showAllCond = false;
    renderDiffReport();
  } catch (e) { out.innerHTML = ''; out.appendChild(el('div', { class: 'hint', text: '比較失敗：' + (e.code || e.message) })); }
}

function renderDiffRow(r) {
  const tag = r.type === 'add' ? '＋新增' : r.type === 'remove' ? '－刪除' : '✎修改';
  const cls = r.type === 'add' ? 'd-add' : r.type === 'remove' ? 'd-remove' : 'd-change';
  const main = diffObsMode
    ? (r.dim + '›' + r.part + '›' + r.card + '：' + r.cond)
    : (r.dim + '›' + r.part + '›「' + r.label + '」' + (r.role ? '（' + r.role + '）' : ''));
  const row = el('div', { class: 'ds-row ' + cls }, [el('span', { class: 'd-tag', text: tag }), el('span', { text: ' ' + main })]);
  if (!diffObsMode && r.type === 'change' && r.detail) row.appendChild(el('div', { class: 'd-detail', text: r.detail }));
  return row;
}

// 題庫差異區：依部位分類、可收合
function renderObsLibSection(d) {
  const ol = d.obsLib || { added: [], removed: [], changed: [] };
  const total = ol.added.length + ol.removed.length + ol.changed.length;
  const sec = el('div', { class: 'ds' }, [el('div', { class: 'ds-head', text: '題庫差異（觀察題）—— A「' + d._a + '」→ B「' + d._b + '」　共 ' + total + ' 筆' })]);
  if (!total) { sec.appendChild(el('div', { class: 'hint', text: '兩版本題庫一致。' })); return sec; }
  const byPart = {};
  const push = (part, kind, item) => { (byPart[part] = byPart[part] || { added: [], removed: [], changed: [] })[kind].push(item); };
  ol.added.forEach(x => push(x.part || '(未分)', 'added', x));
  ol.removed.forEach(x => push(x.part || '(未分)', 'removed', x));
  ol.changed.forEach(x => push(x.part || '(未分)', 'changed', x));
  Object.keys(byPart).forEach(part => {
    const g = byPart[part];
    const det = el('details', { class: 'ds-det', open: '' });
    det.appendChild(el('summary', { text: part + '　（＋' + g.added.length + ' －' + g.removed.length + ' ✎' + g.changed.length + '）' }));
    g.added.forEach(x => det.appendChild(el('div', { class: 'ds-row', text: '＋ 新題 ' + (x.label || x.id) + '（' + x.id + '）' })));
    g.removed.forEach(x => det.appendChild(el('div', { class: 'ds-row', text: '－ 刪題 ' + (x.label || x.id) + '（' + x.id + '）' })));
    g.changed.forEach(x => {
      const bits = [];
      if (x.aLabel !== x.bLabel) bits.push('題目「' + x.aLabel + '」→「' + x.bLabel + '」');
      if (x.aOpts !== x.bOpts) bits.push('選項「' + (x.aOpts || '（無）') + '」→「' + (x.bOpts || '（無）') + '」');
      det.appendChild(el('div', { class: 'ds-row', text: '✎ 改題（' + x.id + '）：' + bits.join('；') }));
    });
    sec.appendChild(det);
  });
  return sec;
}
function renderDiffReport() {
  const box = $('diff-out'); box.innerHTML = ''; if (!lastDiff) return;
  const d = lastDiff, s = d.summary;
  const ov = el('div', { class: 'ds' }, [
    el('div', { class: 'ds-head', text: '關係與總覽' }),
    el('div', { class: 'ov-rel', text: '• ' + d.relationship }),
    el('div', { text: '• 規則差異：共 ' + (s.cardsAdded + s.cardsRemoved + s.cardsChanged) + ' 條（＋新增' + s.cardsAdded + '、－刪除' + s.cardsRemoved + '、✎修改' + s.cardsChanged + '）' }),
    el('div', { text: '• 題庫差異：＋新題' + ((d.obsLib && d.obsLib.added.length) || 0) + '、－刪題' + ((d.obsLib && d.obsLib.removed.length) || 0) + '、✎改題' + ((d.obsLib && d.obsLib.changed.length) || 0) }),
    el('div', { text: '• 辣度差異：' + s.spiceDiffs + ' 個部位設定不同' }),
    el('div', { text: '• 目標極差異：' + s.poleDiffs + ' 個維度不同' }),
    el('div', { text: '• 規模：A「' + d._a + '」' + s.aCount + ' 條 / ' + s.aParts + ' 部位　B「' + d._b + '」' + s.bCount + ' 條 / ' + s.bParts + ' 部位' })
  ]);
  box.appendChild(ov);
  box.appendChild(renderObsLibSection(d));   // 題庫差異放在條件差異前面

  const cd = el('div', { class: 'ds' }, [el('div', { class: 'ds-head', text: diffObsMode ? '條件差異（觀察題層級）' : '條件差異（卡片層級）' })]);
  const rows = diffObsMode ? d.obsDiffs : d.conditionDiffs;
  if (!rows.length) cd.appendChild(el('div', { class: 'hint', text: '兩版本一致，沒有差異。' }));
  (showAllCond ? rows : rows.slice(0, 10)).forEach(r => cd.appendChild(renderDiffRow(r)));
  if (rows.length > 10 && !showAllCond) { const more = el('div', { class: 'more', text: '顯示全部（共 ' + rows.length + ' 條）' }); more.addEventListener('click', () => { showAllCond = true; renderDiffReport(); }); cd.appendChild(more); }
  box.appendChild(cd);

  if (d.spiceDiffs.length) {
    const sp = el('div', { class: 'ds' }, [el('div', { class: 'ds-head', text: '辣度設定差別' })]);
    d.spiceDiffs.forEach(x => sp.appendChild(el('div', { class: 'ds-row', text: '• ' + x.dim + '›' + x.part + '　' + x.level + '　' + x.from + ' → ' + x.to })));
    box.appendChild(sp);
  }
  if (d.poleDiffs.length) {
    const po = el('div', { class: 'ds' }, [el('div', { class: 'ds-head', text: '目標極差別' })]);
    d.poleDiffs.forEach(x => po.appendChild(el('div', { class: 'ds-row', text: '• ' + x.dim + '　符合為 ' + x.from + ' → ' + x.to })));
    box.appendChild(po);
  }
}

function boot() {
  $('btn-login').addEventListener('click', () => login().catch(e => alert('登入失敗：' + (e.code || e.message))));
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-new').addEventListener('click', newSet);
  $('btn-rollback').addEventListener('click', rollback);
  $('btn-refresh').addEventListener('click', loadList);
  $('cmp-run').addEventListener('click', runCompare);
  $('cmp-obs').addEventListener('change', () => { diffObsMode = $('cmp-obs').checked; showAllCond = false; if (lastDiff) renderDiffReport(); });
  window.addEventListener('storage', e => { if (e.key === EDIT_KEY) loadList(); });  // 編輯中標記跟著變
  renderHeader();
  onUser((u, r) => { user = u; role = r; loadList(); });
}
boot();
