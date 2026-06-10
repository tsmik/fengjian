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
let baseSet = null, baseContent = {}, baseLayout = {};   // 對照基準套裝（唯讀）

function baseSetName() { const s = sets.filter(x => x.id === baseSet)[0]; return s ? (s.name || s.id) : baseSet; }
function renderBaseSelect() {
  const sel = $('base-select'); if (!sel) return;
  sel.innerHTML = ''; sel.appendChild(new Option('（無，不對照）', ''));
  sets.forEach(s => sel.appendChild(new Option((s.name || s.id) + (s.status === 'archived' ? '（封存）' : ''), s.id)));
  sel.value = baseSet || '';
}
async function loadBaseSet(setId) {
  baseSet = setId || null;
  try { localStorage.setItem('obs_base_set', baseSet || ''); } catch (e) {}
  baseContent = {}; baseLayout = {};
  if (!baseSet) return;
  let snap = null; try { snap = await getDocs(collection(db, 'ruleSets', baseSet, 'observations')); } catch (e) {}
  if (snap && !snap.empty) snap.forEach(d => { const o = d.data(); baseContent[o.obsId || d.id] = toInternal(o); });
  else { let g = null; try { g = await getDocs(collection(db, 'observations')); } catch (e) {} if (g && !g.empty) g.forEach(d => { const o = d.data(); baseContent[o.obsId || d.id] = toInternal(o); }); else OBS0.forEach(o => baseContent[o.obsId] = toInternal(o)); }
  let lay = null; try { lay = await getDoc(doc(db, 'ruleSets', baseSet, 'obsmeta', 'layout')); } catch (e) {}
  baseLayout = (lay && lay.exists() && lay.data().layout) ? lay.data().layout : {};
}

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
      let last = null, sig = null;
      try { last = localStorage.getItem('obs_last_set'); } catch (e) {}   // 觀察庫自己的記憶鍵（不被條件編輯器覆蓋）
      try { sig = JSON.parse(localStorage.getItem('admin2_edit_set') || 'null'); } catch (e) {}
      const pick = (last && sets.filter(s => s.id === last)[0]) || (sig && sig.id && sets.filter(s => s.id === sig.id)[0]) || sets.filter(s => /202605|人相兵法/.test(s.name || ''))[0] || sets[0];
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
const DIM_COLORS = { '形勢': '#6B8C5A', '經緯': '#4A7A6E', '方圓': '#8A8078', '曲直': '#A07850', '收放': '#9A6878', '緩急': '#9A8A50', '順逆': '#4A7A9A', '分合': '#7A6890', '真假': '#5A8A6A', '攻守': '#5A8A5A', '奇正': '#7A6088', '虛實': '#4A8078', '進退': '#4A6E8A' };
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
  try { localStorage.setItem('obs_last_set', setId); } catch (e) {}   // 記住觀察庫最後選的套裝
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
function persistNav() { if (!curSet) return; try { localStorage.setItem('obs_last_nav', JSON.stringify({ set: curSet, part: curPart, q: curQ })); } catch (e) {} }   // curSet 未設(初始離線渲染)時不存，避免覆蓋上次記憶
// 對照欄：唯讀顯示基準套裝在目前部位的題目（依 section 分組＋選項）
function renderBase() {
  const box = $('col-base'); if (!box) return; box.innerHTML = '';
  const wrap = document.querySelector('.wrap'); if (wrap) wrap.classList.toggle('compare', !!baseSet);
  if (!baseSet) return;
  box.appendChild(el('div', { class: 'col-title', text: '基準對照：' + baseSetName() + '（' + curPart + '）' }));
  const qs = Object.values(baseContent).filter(c => c.part === curPart);
  if (!qs.length) { box.appendChild(el('div', { class: 'empty', text: '（基準此部位無題目）' })); return; }
  const order = (baseLayout[curPart] || []).map(s => s.label);
  const bySec = {}; qs.forEach(c => { const k = c.section || '(未分組)'; (bySec[k] = bySec[k] || []).push(c); });
  const secNames = [...new Set([...order, ...Object.keys(bySec)])].filter(s => bySec[s]);
  secNames.forEach(sn => {
    box.appendChild(el('div', { class: 'base-sec', text: sn }));
    bySec[sn].forEach(c => box.appendChild(el('div', { class: 'base-q' }, [
      el('div', { class: 'bq-label', text: c.label || '（未命名）' }),
      el('div', { class: 'base-opts', text: (c.options || []).map(o => o.v).join('／') || '（無選項）' })
    ])));
  });
}
function renderAll() { renderHeader(); renderParts(); renderBase(); renderSections(); renderEd(); updateDirty(); persistNav(); }

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
    body.appendChild(el('div', { class: 'qrow' + (curQ === id ? ' sel' : ''), onclick: () => { curQ = id; renderSections(); renderEd(); persistNav(); } }, [
      el('span', { class: 'qid', text: id }),
      el('span', { class: 'qtext', text: c.label || '（未命名）' }),
      el('span', { class: 'qopts', text: c.options.length + '選' }),
      el('span', { class: 'badge' + (nref ? '' : ' zero'), text: '引用' + nref + '次' }),
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
  // text + note（備註移到題目文字下方，預設一行）
  card.appendChild(el('label', { class: 'fl', text: '題目文字' }));
  card.appendChild(el('input', { class: 't', value: c.label, oninput: (e) => { c.label = e.target.value; markObs(c.obsId); renderSectionsLabelOnly(); } }));
  card.appendChild(el('label', { class: 'fl', text: '備註（note）' }));
  card.appendChild(el('textarea', { class: 't note1', rows: '1', value: c.note, oninput: (e) => { c.note = e.target.value; markObs(c.obsId); } }));
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
  if (nref.length) nref.forEach(d => tags.appendChild(el('span', { class: 'tag dimtag', text: d, style: 'background:' + (DIM_COLORS[d] || '#9a8f7d') + ';color:#fff;border-color:transparent;' })));
  else tags.appendChild(el('span', { class: 'tag', text: '（未被任何維度引用）' }));
  card.appendChild(tags);
  if (nref.length) card.appendChild(el('div', { class: 'protect', text: '⚠ 此題被 ' + nref.length + ' 個維度引用：刪除被擋；改題目文字不影響比對，但改/刪選項值會影響規則命中。' }));
  // options
  card.appendChild(el('label', { class: 'fl', text: '選項（值／提示）' }));
  c.options.forEach((op, oi) => card.appendChild(renderOpt(c, op, oi)));
  card.appendChild(el('button', { class: 'btn xs', text: '＋ 選項', onclick: () => { c.options.push({ v: '', hint: '' }); markObs(c.obsId); renderEd(); } }));
  box.appendChild(card);
}

function renderOpt(c, op, oi) {
  const used = valUsed(c.obsId, op.v);
  const v = el('input', { class: 't v', value: op.v, placeholder: '值', oninput: (e) => { op.v = e.target.value; markObs(c.obsId); } });
  const h = el('input', { class: 't h', value: op.hint, placeholder: '提示（可空）', oninput: (e) => { op.hint = e.target.value; markObs(c.obsId); } });
  const del = el('button', { class: 'btn xs danger', text: '✕', title: used ? '基準有規則引用此值（刪前確認）' : '刪除', onclick: () => {
    if (used && !confirm('「' + op.v + '」在基準被規則引用，刪除可能影響命中。仍要刪除？')) return;
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
  if (refs.length && !confirm('此題在基準被 ' + refs.length + ' 個維度引用（' + refs.slice(0, 3).join('、') + '…）。\n刪除後這些條件會找不到此題（重構題庫時常見）。仍要刪除？')) return;
  // remove from layout
  sectionsOf(c.part).forEach(s => { s.qIds = s.qIds.filter(x => x !== c.obsId); });
  delete content[c.obsId];
  deleted.add(c.obsId);   // 一律記入待刪（刪伺服器上不存在的 doc 是無害 no-op；修：原本靠 OBS0 判斷，套裝題庫的題刪不掉）
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
      if (deleted.size) { const b = writeBatch(db); deleted.forEach(id => b.delete(obsPath(id))); await b.commit(); }   // 連帶刪除
      await setDoc(layPath, { layout, updatedAt: new Date().toISOString() });
      seedAll = false;
      toast('已建立此套裝題庫：' + Object.keys(content).length + ' 題');
    } else {
      const batch = writeBatch(db);
      dirty.forEach(id => { if (content[id]) batch.set(obsPath(id), toDoc(content[id])); });
      deleted.forEach(id => batch.delete(obsPath(id)));
      await batch.commit();                                         // 先存題目（版面寫入若出狀況不會連坐回滾題目）
      await setDoc(layPath, { layout, updatedAt: new Date().toISOString() });   // 版面分開存
      // 記錄這次改動的題目 → 條件編輯器標示「需檢視」(累積到 obsmeta/stale)
      if (dirty.size || deleted.size) { const changed = {}; dirty.forEach(id => changed[id] = true); deleted.forEach(id => changed[id] = true); try { await setDoc(doc(db, 'ruleSets', curSet, 'obsmeta', 'stale'), changed, { merge: true }); } catch (e) {} }
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
  $('base-select').addEventListener('change', async e => {
    try { await loadBaseSet(e.target.value); } catch (err) { alert('載入基準失敗：' + (err.code || err.message)); }
    renderAll();
  });
  window.addEventListener('focus', () => { if (user) { renderRsSelect(); renderBaseSelect(); } });   // 切回來時刷新套裝清單(新建的套裝才會出現)
  renderAll();
  onUser(async (u, r) => {
    user = u; role = r;
    if (u) {
      online = true;
      try {
        await renderRsSelect(); if (curSet) await loadSet(curSet);
        let nav = null; try { nav = JSON.parse(localStorage.getItem('obs_last_nav') || 'null'); } catch (e) {}
        if (nav && nav.set === curSet) {   // refresh 後停在上次的部位/題目
          if (nav.part && PART_ORDER.includes(nav.part)) curPart = nav.part;
          if (nav.q && content[nav.q]) curQ = nav.q;
        }
        let bs = null; try { bs = localStorage.getItem('obs_base_set'); } catch (e) {}   // 還原對照基準
        if (bs && sets.filter(s => s.id === bs)[0] && bs !== curSet) baseSet = bs;
        renderBaseSelect(); if (baseSet) await loadBaseSet(baseSet);
      } catch (e) { toast('讀 staging 失敗：' + (e.code || e.message)); }
    } else { online = false; }
    if (!PART_ORDER.includes(curPart)) curPart = PART_ORDER[0];
    renderAll();
  });
}
boot();
