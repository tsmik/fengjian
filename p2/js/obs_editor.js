// p2/js/obs_editor.js — 觀察庫編輯器（v0.7 §1/§2）
// 層級：部位 → section（一等公民，可改名/排序/刪除、題可跨 section 搬移）→ 題目 → 選項。
// 含：ID 自動生成、刪除保護（被規則引用的題/選項不給刪，v0.6 §11 A）、被哪些維度引用標籤（§11 B）。
// 直接讀寫 rbf2app-staging：observations（內容）＋ config/questionsLayout（順序/分組）。
// 未登入時用打包資料離線預覽（可編、不可存）。

import { fbOK, onUser, login, logout, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from './fb.js';

const LAYOUT0 = window.QUESTIONS_LAYOUT || {};
const OBS0 = window.OBSERVATIONS || [];
const REF_DIMS = window.REF_DIMS || {};
const REF_VALS = window.REF_VALS || {};
const PAIRED = window.PAIRED_MAP || {};
const PART_ORDER = Object.keys(LAYOUT0);
const PART_PREFIX = { '頭': 'h', '額': 'e', '耳': 'er', '眉': 'br', '眼': 'ey', '鼻': 'n', '顴': 'q', '口': 'm', '人中': 'p', '地閣': 'c', '頤': 'y' };

let content = {};      // obsId -> {obsId,part,section,label,paired,options:[{v,hint}],note,sourceQid}
let layout = {};       // part -> [{label,qIds:[]}]
let curPart = PART_ORDER[0], curQ = null;
let dirty = new Set(), deleted = new Set(), layoutDirty = false;
let user = null, role = null, online = false;
let curSet = null, sets = [], seedAll = false;   // 套裝化：目前編輯的套裝、套裝清單、是否首次建入

async function renderRsSelect() {
  const sel = $('rs-select'); if (!sel) return;
  if (!user) { sel.innerHTML = ''; sel.appendChild(new Option('（登入後選套裝）', '')); return; }
  try {
    const snap = await getDocs(collection(db, 'ruleSets')); sets = []; snap.forEach(d => sets.push({ id: d.id, ...d.data() }));
    sets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    sel.innerHTML = '';
    if (!sets.length) { sel.appendChild(new Option('（尚無套裝→到套裝分頁新增）', '')); return; }
    sets.forEach(s => sel.appendChild(new Option((s.name || s.id) + (s.status === 'archived' ? '（封存）' : ''), s.id)));
    if (!curSet || !sets.some(s => s.id === curSet)) {
      let sig = null; try { sig = JSON.parse(localStorage.getItem('admin2_edit_set') || 'null'); } catch (e) {}
      const pick = (sig && sig.id && sets.filter(s => s.id === sig.id)[0]) || sets.filter(s => /202605|人相兵法/.test(s.name || ''))[0] || sets[0];
      curSet = pick.id;
    }
    sel.value = curSet;
  } catch (e) {}
}

/* ---------- helpers ---------- */
function el(t, a = {}, k = []) {
  const e = document.createElement(t);
  for (const key in a) {
    if (key === 'class') e.className = a[key];
    else if (key === 'text') e.textContent = a[key];
    else if (key === 'html') e.innerHTML = a[key];
    else if (key.startsWith('on')) e.addEventListener(key.slice(2), a[key]);
    else if (key === 'value') e.value = a[key];
    else if (key === 'checked') e.checked = a[key];
    else e.setAttribute(key, a[key]);
  }
  (Array.isArray(k) ? k : [k]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}
const $ = id => document.getElementById(id);
function toast(m) { const t = $('toast'); t.textContent = m; t.style.opacity = '1'; setTimeout(() => t.style.opacity = '0', 1800); }
function toInternal(o) {
  const opts = (o.options || []).map(v => ({ v, hint: (o.optionHints && o.optionHints[v]) || '' }));
  return { obsId: o.obsId, part: o.part, section: o.section || '', label: o.label || '',
    paired: ('paired' in o) ? !!o.paired : !!PAIRED[o.obsId], options: opts, note: o.note || '', sourceQid: o.sourceQid || o.obsId };
}
function toDoc(c) {
  const options = c.options.map(o => o.v);
  const optionHints = {}; c.options.forEach(o => { if (o.hint) optionHints[o.v] = o.hint; });
  const d = { obsId: c.obsId, part: c.part, section: c.section, label: c.label, paired: !!c.paired, options, note: c.note || '', sourceQid: c.sourceQid };
  if (Object.keys(optionHints).length) d.optionHints = optionHints;
  return d;
}
function markObs(id) { dirty.add(id); layoutDirty = layoutDirty; updateDirty(); }
function markLayout() { layoutDirty = true; updateDirty(); }
function updateDirty() {
  if (seedAll) { $('dirtywrap').innerHTML = '此套裝尚未有題庫，按「儲存」建立基準 ' + Object.keys(content).length + ' 題 <span class="dirtydot"></span>'; return; }
  const n = dirty.size + deleted.size + (layoutDirty ? 1 : 0);
  $('dirtywrap').innerHTML = n ? ('未存變更 ' + (dirty.size + deleted.size) + ' 筆' + (layoutDirty ? '＋版面' : '') + ' <span class="dirtydot"></span>') : '';
}
function refDimsOf(id) { return REF_DIMS[id] || []; }
function valUsed(id, v) { return (REF_VALS[id] || []).indexOf(v) >= 0; }

/* ---------- model build ---------- */
function reconcile() {
  Object.keys(layout).forEach(part => layout[part].forEach(sec => { sec.qIds = sec.qIds.filter(id => content[id]); }));
  Object.values(content).forEach(c => {
    if (!layout[c.part]) layout[c.part] = [];
    if (layout[c.part].some(sec => sec.qIds.indexOf(c.obsId) >= 0)) return;
    let sec = layout[c.part].find(s => s.label === c.section);
    if (!sec) { sec = { label: c.section || '(未分組)', qIds: [] }; layout[c.part].push(sec); }
    sec.qIds.push(c.obsId);
  });
}
function loadBundled() {
  content = {}; OBS0.forEach(o => content[o.obsId] = toInternal(o));
  layout = JSON.parse(JSON.stringify(LAYOUT0));
  reconcile();
}
// 套裝化：讀「目前選的套裝」自己的題庫；若該套裝還沒有 → 載入全域(或打包)當底，seedAll=true（首存整份建入）
async function loadSet(setId) {
  curSet = setId;
  const snap = await getDocs(collection(db, 'ruleSets', setId, 'observations'));
  if (snap && !snap.empty) {
    content = {}; snap.forEach(d => { const o = d.data(); content[o.obsId || d.id] = toInternal(o); });
    seedAll = false;
  } else {
    let g = null; try { g = await getDocs(collection(db, 'observations')); } catch (e) {}
    content = {};
    if (g && !g.empty) g.forEach(d => { const o = d.data(); content[o.obsId || d.id] = toInternal(o); });
    else OBS0.forEach(o => content[o.obsId] = toInternal(o));   // 連全域都沒有 → 打包基準
    seedAll = true;
  }
  // 版面：套裝自己的 → 全域 → 打包
  let lay = null; try { lay = await getDoc(doc(db, 'ruleSets', setId, 'obsmeta', 'layout')); } catch (e) {}
  if (lay && lay.exists() && lay.data().layout) layout = lay.data().layout;
  else { let gl = null; try { gl = await getDoc(doc(db, 'config', 'questionsLayout')); } catch (e) {} layout = (gl && gl.exists() && gl.data().layout) ? gl.data().layout : JSON.parse(JSON.stringify(LAYOUT0)); }
  reconcile();
  dirty.clear(); deleted.clear(); layoutDirty = false;
}

/* ---------- id gen ---------- */
function nextId(part) {
  const pre = PART_PREFIX[part] || 'x';
  const re = new RegExp('^' + pre + '(\\d+)$');
  let max = 0;
  Object.keys(content).forEach(id => { const m = id.match(re); if (m) max = Math.max(max, +m[1]); });
  return pre + (max + 1);
}
function sectionsOf(part) { return layout[part] || []; }
function sectionOfQ(id) { const c = content[id]; return c ? c.section : ''; }

/* =================== RENDER =================== */
function renderAll() { renderHeader(); renderParts(); renderSections(); renderEd(); updateDirty(); }

function renderHeader() {
  let s;
  if (!online) s = fbOK() ? '未登入（離線預覽，登入後讀/存 staging 真資料）' : '🔌 Firebase 未連線';
  else s = '已登入：' + (user.email || user.uid) + '｜角色：' + (role || '（無，不能存）');
  $('status').textContent = s;
  $('btn-login').style.display = (fbOK() && !user) ? '' : 'none';
  $('btn-logout').style.display = (user) ? '' : 'none';
  const canSave = !!user && (role === 'admin' || role === 'teacher');
  $('btn-save').disabled = !canSave;
}

function renderParts() {
  const box = $('col-parts'); box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: '部位（11）' }));
  PART_ORDER.forEach(p => {
    const cnt = (layout[p] || []).reduce((a, s) => a + s.qIds.length, 0);
    box.appendChild(el('div', { class: 'prow' + (curPart === p ? ' sel' : ''), onclick: () => { curPart = p; curQ = null; renderAll(); } },
      [el('span', { text: p }), el('span', { class: 'cnt', text: cnt + ' 題' })]));
  });
}

function renderSections() {
  const box = $('col-sections'); box.innerHTML = '';
  const head = el('div', { class: 'col-title' }, [
    document.createTextNode(curPart + '　section（拖題目用 ▲▼／搬移下拉）　'),
  ]);
  box.appendChild(head);
  box.appendChild(el('button', { class: 'btn sm', text: '＋ 新增 section', onclick: addSection }));
  const secs = sectionsOf(curPart);
  if (!secs.length) box.appendChild(el('div', { class: 'empty', text: '此部位尚無 section' }));
  secs.forEach((sec, si) => box.appendChild(renderSection(sec, si, secs)));
}

function renderSection(sec, si, secs) {
  const wrap = el('div', { class: 'section' });
  const label = el('span', { class: 'sec-label' }, [sec.label, el('span', { class: 'pen', text: '✎' })]);
  label.addEventListener('click', () => renameSection(sec));
  wrap.appendChild(el('div', { class: 'sec-head' }, [
    label,
    el('span', { class: 'grow', html: '<span style="flex:1"></span>' }),
    el('button', { class: 'btn xs', text: '▲', onclick: () => moveSection(si, -1) }),
    el('button', { class: 'btn xs', text: '▼', onclick: () => moveSection(si, 1) }),
    el('button', { class: 'btn xs', text: '＋題', onclick: () => addQuestion(sec) }),
    el('button', { class: 'btn xs danger', text: '✕', onclick: () => deleteSection(sec) })
  ]));
  const body = el('div', { class: 'sec-body' });
  if (!sec.qIds.length) body.appendChild(el('div', { class: 'empty', text: '（空 section）' }));
  sec.qIds.forEach((id, qi) => {
    const c = content[id]; if (!c) return;
    const nref = refDimsOf(id).length;
    body.appendChild(el('div', { class: 'qrow' + (curQ === id ? ' sel' : ''), onclick: () => { curQ = id; renderSections(); renderEd(); } }, [
      el('span', { class: 'qid', text: id }),
      el('span', { class: 'qtext', text: c.label || '（未命名）' }),
      el('span', { class: 'qopts', text: c.options.length + '選' }),
      el('span', { class: 'badge' + (nref ? '' : ' zero'), text: nref + '維' }),
      el('button', { class: 'btn xs', text: '▲', onclick: (e) => { e.stopPropagation(); moveQ(sec, qi, -1); } }),
      el('button', { class: 'btn xs', text: '▼', onclick: (e) => { e.stopPropagation(); moveQ(sec, qi, 1); } })
    ]));
  });
  wrap.appendChild(body);
  return wrap;
}

function renderEd() {
  const box = $('ed'); box.innerHTML = '';
  if (!curQ || !content[curQ]) { box.appendChild(el('div', { class: 'empty', text: '← 選一題，或在 section 上「＋題」' })); return; }
  const c = content[curQ];
  const card = el('div', { class: 'ed-card' });
  // id + delete
  const nref = refDimsOf(c.obsId);
  card.appendChild(el('div', { class: 'rowflex' }, [
    el('span', { class: 'qid-big', text: 'id：' + c.obsId }),
    el('span', { class: 'grow', html: '<span style="flex:1"></span>' }),
    el('button', { class: 'btn xs danger', text: '刪除此題', onclick: () => deleteQuestion(c) })
  ]));
  // text
  card.appendChild(el('label', { class: 'fl', text: '題目文字' }));
  card.appendChild(el('input', { class: 't', value: c.label, oninput: (e) => { c.label = e.target.value; markObs(c.obsId); renderSectionsLabelOnly(); } }));
  // paired + section move
  const paired = el('input', { type: 'checkbox', checked: c.paired }); paired.addEventListener('change', () => { c.paired = paired.checked; markObs(c.obsId); });
  const secSel = el('select', { class: 't', onchange: (e) => moveQToSection(c, e.target.value) });
  sectionsOf(c.part).forEach(s => { const o = el('option', { value: s.label, text: s.label }); if (s.label === c.section) o.selected = true; secSel.appendChild(o); });
  card.appendChild(el('div', { class: 'rowflex', style: 'margin-top:10px' }, [
    el('label', { class: 'inline' }, [paired, ' 左右題（分左右收集）']),
  ]));
  card.appendChild(el('label', { class: 'fl', text: '所屬 section（可搬移）' }));
  card.appendChild(secSel);
  // ref tags
  card.appendChild(el('label', { class: 'fl', text: '被哪些維度引用' }));
  const tags = el('div', { class: 'tags' });
  if (nref.length) nref.forEach(d => tags.appendChild(el('span', { class: 'tag', text: d })));
  else tags.appendChild(el('span', { class: 'tag', text: '（未被任何維度引用）' }));
  card.appendChild(tags);
  if (nref.length) card.appendChild(el('div', { class: 'protect', text: '⚠ 此題被 ' + nref.length + ' 個維度引用：刪除被擋；改題目文字不影響比對，但改/刪選項值會影響規則命中。' }));
  // options
  card.appendChild(el('label', { class: 'fl', text: '選項（值／提示）' }));
  c.options.forEach((op, oi) => card.appendChild(renderOpt(c, op, oi)));
  card.appendChild(el('button', { class: 'btn xs', text: '＋ 選項', onclick: () => { c.options.push({ v: '', hint: '' }); markObs(c.obsId); renderEd(); } }));
  // note
  card.appendChild(el('label', { class: 'fl', text: '備註（note）' }));
  card.appendChild(el('textarea', { class: 't', value: c.note, oninput: (e) => { c.note = e.target.value; markObs(c.obsId); } }));
  box.appendChild(card);
}

function renderOpt(c, op, oi) {
  const used = valUsed(c.obsId, op.v);
  const v = el('input', { class: 't v', value: op.v, placeholder: '值', oninput: (e) => { op.v = e.target.value; markObs(c.obsId); } });
  const h = el('input', { class: 't h', value: op.hint, placeholder: '提示（可空）', oninput: (e) => { op.hint = e.target.value; markObs(c.obsId); } });
  const del = el('button', { class: 'btn xs danger', text: '✕', title: used ? '被規則引用，不可刪' : '刪除', onclick: () => {
    if (used) return toast('「' + op.v + '」被規則引用，不可刪');
    c.options.splice(oi, 1); markObs(c.obsId); renderEd();
  } });
  const up = el('button', { class: 'btn xs', text: '▲', onclick: () => { if (oi > 0) { [c.options[oi - 1], c.options[oi]] = [c.options[oi], c.options[oi - 1]]; markObs(c.obsId); renderEd(); } } });
  const dn = el('button', { class: 'btn xs', text: '▼', onclick: () => { if (oi < c.options.length - 1) { [c.options[oi + 1], c.options[oi]] = [c.options[oi], c.options[oi + 1]]; markObs(c.obsId); renderEd(); } } });
  return el('div', { class: 'opt' }, [v, h, up, dn, del]);
}

// 只更新 section 欄的題目文字（避免每打一字整欄重畫搶焦點）
function renderSectionsLabelOnly() {
  const c = content[curQ]; if (!c) return;
  document.querySelectorAll('#col-sections .qrow').forEach(r => {
    if (r.querySelector('.qid') && r.querySelector('.qid').textContent === c.obsId) r.querySelector('.qtext').textContent = c.label || '（未命名）';
  });
}

/* =================== OPERATIONS =================== */
function addSection() {
  const name = prompt('新 section 名稱：', '');
  if (!name) return;
  if (sectionsOf(curPart).some(s => s.label === name)) return toast('已有同名 section');
  layout[curPart].push({ label: name, qIds: [] }); markLayout(); renderSections();
}
function renameSection(sec) {
  const name = prompt('改 section 名稱：', sec.label);
  if (name == null || name === sec.label) return;
  if (sectionsOf(curPart).some(s => s !== sec && s.label === name)) return toast('已有同名 section');
  const old = sec.label; sec.label = name;
  sec.qIds.forEach(id => { if (content[id]) { content[id].section = name; dirty.add(id); } });
  markLayout(); renderAll();
}
function deleteSection(sec) {
  if (sec.qIds.length) return toast('section 內還有題目，請先搬走或刪除');
  layout[curPart] = layout[curPart].filter(s => s !== sec); markLayout(); renderSections();
}
function moveSection(si, d) {
  const arr = layout[curPart]; const j = si + d; if (j < 0 || j >= arr.length) return;
  [arr[si], arr[j]] = [arr[j], arr[si]]; markLayout(); renderSections();
}
function addQuestion(sec) {
  const id = nextId(curPart);
  content[id] = { obsId: id, part: curPart, section: sec.label, label: '', paired: false, options: [], note: '', sourceQid: id };
  sec.qIds.push(id); markObs(id); markLayout(); curQ = id; renderAll();
}
function deleteQuestion(c) {
  const refs = refDimsOf(c.obsId);
  if (refs.length) return toast('此題被 ' + refs.length + ' 維度引用（' + refs.slice(0, 3).join('、') + '…），不可刪');
  // remove from layout
  sectionsOf(c.part).forEach(s => { s.qIds = s.qIds.filter(x => x !== c.obsId); });
  delete content[c.obsId];
  if (!OBS0.some(o => o.obsId === c.obsId)) dirty.delete(c.obsId); else deleted.add(c.obsId);
  dirty.delete(c.obsId);
  if (curQ === c.obsId) curQ = null;
  markLayout(); renderAll();
}
function moveQ(sec, qi, d) {
  const j = qi + d; if (j < 0 || j >= sec.qIds.length) return;
  [sec.qIds[qi], sec.qIds[j]] = [sec.qIds[j], sec.qIds[qi]]; markLayout(); renderSections();
}
function moveQToSection(c, newLabel) {
  if (newLabel === c.section) return;
  sectionsOf(c.part).forEach(s => { s.qIds = s.qIds.filter(x => x !== c.obsId); });
  let target = sectionsOf(c.part).find(s => s.label === newLabel);
  if (!target) { target = { label: newLabel, qIds: [] }; layout[c.part].push(target); }
  target.qIds.push(c.obsId); c.section = newLabel; dirty.add(c.obsId); markLayout(); renderAll();
}

/* =================== SAVE =================== */
async function save() {
  if (!user) return alert('請先用 Google 登入');
  if (!(role === 'admin' || role === 'teacher')) return alert('角色＝' + (role || '（無）') + '，需 admin/teacher。\n你的 UID：' + user.uid);
  if (!curSet) return alert('請先在上方選一個套裝。');
  const obsPath = id => doc(db, 'ruleSets', curSet, 'observations', id);
  const layPath = doc(db, 'ruleSets', curSet, 'obsmeta', 'layout');
  try {
    if (seedAll) {
      // 首次：把整份題庫寫入此套裝（分批 ≤400），確保完整不殘缺
      const ids = Object.keys(content);
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db); ids.slice(i, i + 400).forEach(id => b.set(obsPath(id), toDoc(content[id]))); await b.commit();
      }
      await setDoc(layPath, { layout, updatedAt: new Date().toISOString() });
      seedAll = false;
      toast('已建立此套裝題庫：' + Object.keys(content).length + ' 題');
    } else {
      const batch = writeBatch(db);
      dirty.forEach(id => { if (content[id]) batch.set(obsPath(id), toDoc(content[id])); });
      deleted.forEach(id => batch.delete(obsPath(id)));
      batch.set(layPath, { layout, updatedAt: new Date().toISOString() });
      await batch.commit();
      toast('已存：' + dirty.size + ' 題、刪 ' + deleted.size + ' 題、版面已更新');
    }
    dirty.clear(); deleted.clear(); layoutDirty = false; updateDirty();
  } catch (e) { alert('存檔失敗：' + (e.code || e.message)); }
}

/* =================== BOOT =================== */
function boot() {
  loadBundled();           // 先離線預覽
  $('btn-login').addEventListener('click', () => login().catch(e => alert('登入失敗：' + (e.code || e.message))));
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-save').addEventListener('click', save);
  $('rs-select').addEventListener('change', async e => {
    const v = e.target.value; if (!v || v === curSet) return;
    if ((dirty.size || deleted.size || layoutDirty) && !confirm('目前套裝有未儲存變更，切換會丟掉這些變更。確定切換？')) { $('rs-select').value = curSet; return; }
    try { await loadSet(v); } catch (err) { alert('載入失敗：' + (err.code || err.message)); }
    if (!PART_ORDER.includes(curPart)) curPart = PART_ORDER[0];
    renderAll();
  });
  window.addEventListener('focus', () => { if (user) renderRsSelect(); });   // 切回來時刷新套裝清單(新建的套裝才會出現)
  renderAll();
  onUser(async (u, r) => {
    user = u; role = r;
    if (u) {
      online = true;
      try { await renderRsSelect(); if (curSet) await loadSet(curSet); } catch (e) { toast('讀 staging 失敗：' + (e.code || e.message)); }
    } else { online = false; }
    if (!PART_ORDER.includes(curPart)) curPart = PART_ORDER[0];
    renderAll();
  });
}
boot();
