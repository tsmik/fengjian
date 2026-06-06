// p2/js/admin2.js — admin2 條件編輯器（v0.6 §11/§4）
// 只蓋「編輯器 UI」。不預編 rule1 內容、不預標主/輔（role 預設「未標」）。
// observations 來源＝離線打包的 window.OBSERVATIONS（鏡像 rbf2app-staging 的 138 筆）。
// 登入(Google)＋teacher/admin 角色後，可把套裝存進 rbf2app-staging 的 ruleSets。
// 任何時候都可「匯出 JSON」「自動存草稿(localStorage)」，不需登入即可使用。

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const RBF2_STAGING = {
  apiKey: 'AIzaSyDZ3z9LV1g3rnhO0QjmYOfipUGMtD1cq7g',
  authDomain: 'rbf2app-staging.firebaseapp.com',
  projectId: 'rbf2app-staging',
  storageBucket: 'rbf2app-staging.firebasestorage.app',
  messagingSenderId: '565853308902',
  appId: '1:565853308902:web:8a7a3e63df1291124df827'
};

const META = window.DIMS_META;
const OBS = window.OBSERVATIONS || [];
const OBS_BY_ID = {}; OBS.forEach(o => { OBS_BY_ID[o.obsId] = o; });

// ---------- state ----------
const LS_KEY = 'admin2_draft_v1';
let state = {
  ruleSet: { id: 'test-' + nowStamp(), name: '測試套裝', note: '', basedOn: null, status: 'draft', createdAt: new Date().toISOString() },
  dims: {},                                  // {dimIndex: {parts:{partName:def}}}
  spice: { levels: ['大辣', '中辣', '小辣'], rounding: 'B', ratios: { 大辣: '', 中辣: '', 小辣: '' } },
  curDim: 0, curPart: null,
  active: null                               // {part, cardId, comboIdx} 供「點 observation 加入」用
};
let auth = null, db = null, user = null, role = null, fbOK = false;

function nowStamp() { const d = new Date(); return d.toISOString().slice(0, 19).replace(/[-:T]/g, ''); }
function uid() { return 'c' + Math.random().toString(36).slice(2, 8); }
function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'draggable') e.draggable = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  (Array.isArray(kids) ? kids : [kids]).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function $(id) { return document.getElementById(id); }

// ---------- ruleset model helpers ----------
function partMeta(name) {
  const agg = META.aggregates.find(a => a.name === name);
  if (agg) return { kind: 'aggregate', agg };
  const lf = META.leafParts.find(l => l.name === name);
  return { kind: 'leaf', leaf: lf };
}
function ensureDim(di) { if (!state.dims[di]) state.dims[di] = { parts: {} }; return state.dims[di]; }
function getPart(di, name, createDefault) {
  const d = ensureDim(di);
  if (!d.parts[name] && createDefault) {
    const pm = partMeta(name);
    if (pm.kind === 'aggregate') d.parts[name] = { kind: 'aggregate', targetPole: null, threshold: 1, children: [] };
    else d.parts[name] = { kind: 'leaf', targetPole: null, lrMode: pm.leaf && pm.leaf.paired ? 'both' : 'none', cards: [] };
  }
  return d.parts[name];
}
function partHasContent(di, name) {
  const p = state.dims[di] && state.dims[di].parts[name];
  if (!p) return false;
  if (p.kind === 'aggregate') return p.children.length > 0;
  return p.cards.length > 0;
}

// ---------- persistence ----------
function saveDraft() { try { localStorage.setItem(LS_KEY, JSON.stringify({ ruleSet: state.ruleSet, dims: state.dims, spice: state.spice })); } catch (e) {} }
function loadDraft() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (j && j.dims) { state.ruleSet = j.ruleSet; state.dims = j.dims; state.spice = j.spice || state.spice; }
  } catch (e) {}
}
function serialize() {
  const out = { ruleSet: state.ruleSet, spice: state.spice, dims: {} };
  Object.keys(state.dims).forEach(di => {
    const parts = {};
    const dp = state.dims[di].parts;
    Object.keys(dp).forEach(pn => { if (partHasContent(di, pn)) parts[pn] = dp[pn]; });
    if (Object.keys(parts).length) {
      out.dims[di] = { dimIndex: +di, dimName: META.dims[di].name, positiveType: META.dims[di].positiveType, negativeType: META.dims[di].negativeType, parts };
    }
  });
  return out;
}

// ---------- Firebase ----------
function initFirebase() {
  try {
    const app = initializeApp(RBF2_STAGING);
    auth = getAuth(app); db = getFirestore(app); fbOK = true;
    onAuthStateChanged(auth, async (u) => {
      user = u; role = null;
      if (u) { try { const s = await getDoc(doc(db, 'users', u.uid)); if (s.exists()) role = s.data().role || null; } catch (e) {} }
      renderHeader();
    });
  } catch (e) { fbOK = false; renderHeader(); }
}
async function login() { if (!fbOK) return alert('Firebase 未初始化'); try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert('登入失敗：' + (e.code || e.message)); } }
async function logout() { if (auth) await signOut(auth); }
function isStaff() { return !!user && (role === 'admin' || role === 'teacher'); }

async function saveToStaging() {
  if (!fbOK || !user) return alert('請先用 Google 登入');
  if (!isStaff()) return alert('此帳號角色＝' + (role || '（無）') + '，需 admin/teacher 才能存到 staging。\n你的 UID：' + user.uid + '\n（請先把這個 UID 設成 admin/teacher）');
  const data = serialize();
  try {
    await setDoc(doc(db, 'ruleSets', state.ruleSet.id), { ...state.ruleSet, savedAt: new Date().toISOString() });
    await setDoc(doc(db, 'config', 'spiceScript_draft'), state.spice, { merge: true });
    for (const di of Object.keys(data.dims)) {
      await setDoc(doc(db, 'ruleSets', state.ruleSet.id, 'dims', String(di)), data.dims[di]);
    }
    alert('已存到 rbf2app-staging：ruleSets/' + state.ruleSet.id + '（' + Object.keys(data.dims).length + ' 維有內容）');
  } catch (e) { alert('存檔失敗：' + (e.code || e.message)); }
}

// ================= RENDER =================
function renderAll() { renderHeader(); renderDims(); renderParts(); renderEditor(); renderSpice(); renderPalette(); saveDraft(); }

function renderHeader() {
  const h = $('hdr-status');
  if (!h) return;
  let txt;
  if (!fbOK) txt = '🔌 離線模式（可編輯/匯出；登入才可存 staging）';
  else if (!user) txt = '未登入';
  else txt = '已登入：' + (user.email || user.uid) + '｜角色：' + (role || '（無，無法存 staging）');
  h.textContent = txt;
  $('btn-login').style.display = (fbOK && !user) ? '' : 'none';
  $('btn-logout').style.display = (fbOK && user) ? '' : 'none';
  $('rs-name').value = state.ruleSet.name;
}

function renderDims() {
  const box = $('col-dims'); box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: '維度（13）' }));
  META.dims.forEach(d => {
    const n = state.dims[d.index] ? Object.keys(state.dims[d.index].parts).filter(p => partHasContent(d.index, p)).length : 0;
    const row = el('div', { class: 'list-row' + (state.curDim === d.index ? ' sel' : ''), onclick: () => { state.curDim = d.index; state.curPart = null; renderAll(); } }, [
      el('span', { class: 'lr-name', text: d.index + '. ' + d.name }),
      el('span', { class: 'lr-sub', text: d.positiveType + '/' + d.negativeType + (n ? '｜' + n + '部位' : '') })
    ]);
    box.appendChild(row);
  });
}

function renderParts() {
  const box = $('col-parts'); box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: 'dim' + state.curDim + ' ' + META.dims[state.curDim].name + ' — 部位' }));
  box.appendChild(el('div', { class: 'group-label', text: '葉部位' }));
  META.leafParts.forEach(lf => box.appendChild(partRow(lf.name, lf.paired ? '可左右' : '')));
  box.appendChild(el('div', { class: 'group-label', text: '聚合部位' }));
  META.aggregates.forEach(a => box.appendChild(partRow(a.name, '聚合 ' + a.children.join('/'))));
}
function partRow(name, sub) {
  const has = partHasContent(state.curDim, name);
  return el('div', { class: 'list-row' + (state.curPart === name ? ' sel' : ''), onclick: () => { state.curPart = name; state.active = null; renderEditor(); renderPalette(); renderParts(); } }, [
    el('span', { class: 'lr-name', text: (has ? '● ' : '○ ') + name }),
    el('span', { class: 'lr-sub', text: sub })
  ]);
}

function renderEditor() {
  const box = $('col-editor'); box.innerHTML = '';
  if (!state.curPart) { box.appendChild(el('div', { class: 'hint', text: '← 選一個部位開始編輯' })); return; }
  const pm = partMeta(state.curPart);
  box.appendChild(el('div', { class: 'ed-title', text: 'dim' + state.curDim + ' / ' + state.curPart + '（' + (pm.kind === 'aggregate' ? '聚合部位' : '葉部位') + '）' }));
  if (pm.kind === 'aggregate') renderAggEditor(box, getPart(state.curDim, state.curPart, true), pm);
  else renderLeafEditor(box, getPart(state.curDim, state.curPart, true), pm);
}

function poleRadios(def, onchange) {
  const dm = META.dims[state.curDim];
  const wrap = el('div', { class: 'field' }, [el('label', { class: 'fl', text: '目標極（達標時判到哪一極）' })]);
  [['pos', dm.positiveType], ['neg', dm.negativeType]].forEach(([k, label]) => {
    const id = 'pole-' + k;
    const r = el('input', { type: 'radio', name: 'pole-' + state.curDim + '-' + state.curPart, id });
    r.checked = def.targetPole === label;
    r.addEventListener('change', () => { def.targetPole = label; onchange(); });
    wrap.appendChild(el('label', { class: 'inline' }, [r, ' ' + label]));
  });
  return wrap;
}

function renderLeafEditor(box, def, pm) {
  box.appendChild(poleRadios(def, saveDraft));
  // lrMode
  const lrWrap = el('div', { class: 'field' }, [el('label', { class: 'fl', text: '左右模式' })]);
  [['both', '都要(左右都成立)'], ['either', '任一(左或右)'], ['none', '不分左右']].forEach(([v, label]) => {
    const r = el('input', { type: 'radio', name: 'lr-' + state.curDim + '-' + state.curPart });
    r.checked = def.lrMode === v;
    r.addEventListener('change', () => { def.lrMode = v; saveDraft(); });
    lrWrap.appendChild(el('label', { class: 'inline' }, [r, ' ' + label]));
  });
  box.appendChild(lrWrap);

  box.appendChild(el('div', { class: 'cards-head' }, [
    el('span', { text: '卡片（卡間＝或；卡內 combo 間＝或；combo 內葉＝而且）' }),
    el('button', { class: 'btn sm', text: '＋新增卡片', onclick: () => { def.cards.push({ id: uid(), role: null, combos: [[]] }); renderEditor(); renderParts(); saveDraft(); } })
  ]));
  if (!def.cards.length) box.appendChild(el('div', { class: 'hint', text: '尚無卡片。新增卡片後，把左側 observation 拖進（或點進）combo。' }));
  def.cards.forEach((card, ci) => box.appendChild(renderCard(def, card, ci)));
}

function renderCard(def, card, ci) {
  const wrap = el('div', { class: 'card' });
  // header: role + move + delete
  const roleSel = el('select', { class: 'role-sel', onchange: (e) => { card.role = e.target.value || null; saveDraft(); renderParts(); } });
  [['', '未標'], ['main', '主'], ['aux', '輔']].forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if ((card.role || '') === v) o.selected = true; roleSel.appendChild(o); });
  wrap.appendChild(el('div', { class: 'card-head' }, [
    el('span', { class: 'card-tag', text: '卡片 ' + (ci + 1) }),
    el('label', { class: 'inline', text: '標記：' }), roleSel,
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn xs', text: '▲', onclick: () => { if (ci > 0) { [def.cards[ci - 1], def.cards[ci]] = [def.cards[ci], def.cards[ci - 1]]; renderEditor(); saveDraft(); } } }),
    el('button', { class: 'btn xs', text: '▼', onclick: () => { if (ci < def.cards.length - 1) { [def.cards[ci + 1], def.cards[ci]] = [def.cards[ci], def.cards[ci + 1]]; renderEditor(); saveDraft(); } } }),
    el('button', { class: 'btn xs danger', text: '✕', onclick: () => { def.cards.splice(ci, 1); renderEditor(); renderParts(); saveDraft(); } })
  ]));
  // combos
  card.combos.forEach((combo, cj) => {
    if (cj > 0) wrap.appendChild(el('div', { class: 'or-sep', text: '— 或 —' }));
    wrap.appendChild(renderCombo(card, combo, cj));
  });
  wrap.appendChild(el('button', { class: 'btn xs', text: '＋combo（或）', onclick: () => { card.combos.push([]); renderEditor(); saveDraft(); } }));
  return wrap;
}

function renderCombo(card, combo, cj) {
  const isActive = state.active && state.active.cardId === card.id && state.active.comboIdx === cj;
  const drop = el('div', {
    class: 'combo' + (isActive ? ' active' : ''),
    ondragover: (e) => { e.preventDefault(); drop.classList.add('dragover'); },
    ondragleave: () => drop.classList.remove('dragover'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('dragover'); const id = e.dataTransfer.getData('text/obsid'); if (id) addLeaf(card, combo, id); },
    onclick: () => { state.active = { part: state.curPart, cardId: card.id, comboIdx: cj }; renderEditor(); }
  });
  drop.appendChild(el('span', { class: 'combo-tag', text: (isActive ? '◉ ' : '') + 'combo' + (cj + 1) + '（而且）' }));
  if (!combo.length) drop.appendChild(el('span', { class: 'hint', text: '拖 / 點 observation 進來' }));
  combo.forEach((leaf, li) => drop.appendChild(renderLeaf(card, combo, leaf, li)));
  return drop;
}

function renderLeaf(card, combo, leaf, li) {
  const o = OBS_BY_ID[leaf.ref];
  const wrap = el('div', { class: 'leaf' });
  wrap.appendChild(el('div', { class: 'leaf-head' }, [
    el('span', { class: 'leaf-label', text: (o ? o.label : leaf.ref) + '  〔' + leaf.ref + '〕' }),
    el('button', { class: 'btn xs danger', text: '✕', onclick: (e) => { e.stopPropagation(); combo.splice(li, 1); renderEditor(); saveDraft(); } })
  ]));
  const opts = (o ? o.options : []);
  const optBox = el('div', { class: 'opts' });
  opts.forEach(v => {
    const on = leaf.match.indexOf(v) >= 0;
    const chip = el('span', { class: 'opt' + (on ? ' on' : ''), text: v, onclick: (e) => { e.stopPropagation(); const i = leaf.match.indexOf(v); if (i >= 0) leaf.match.splice(i, 1); else leaf.match.push(v); renderEditor(); saveDraft(); } });
    optBox.appendChild(chip);
  });
  wrap.appendChild(optBox);
  if (!leaf.match.length) wrap.appendChild(el('div', { class: 'warn', text: '⚠ 尚未勾選任何「算符合」的選項' }));
  return wrap;
}

function addLeaf(card, combo, obsId) {
  if (combo.some(l => l.ref === obsId)) return;
  combo.push({ ref: obsId, match: [] });
  renderEditor(); saveDraft();
}

function renderAggEditor(box, def, pm) {
  box.appendChild(poleRadios(def, saveDraft));
  box.appendChild(el('div', { class: 'field' }, [
    el('label', { class: 'fl', text: '固定門檻（幾個子部位判到目標極才算成立；不受辣度影響）' }),
    (() => { const i = el('input', { type: 'number', min: '0', class: 'num', value: String(def.threshold) }); i.addEventListener('change', () => { def.threshold = Math.max(0, parseInt(i.value || '0', 10)); saveDraft(); }); return i; })()
  ]));
  box.appendChild(el('div', { class: 'cards-head' }, [el('span', { text: '子部位（勾選要納入計數的；paired 子部位可選左右）' })]));
  pm.agg.children.forEach(childName => {
    const cm = partMeta(childName);
    const paired = cm.kind === 'leaf' && cm.leaf && cm.leaf.paired;
    const entries = paired ? [[childName, 'L'], [childName, 'R']] : [[childName, null]];
    entries.forEach(([cn, side]) => {
      const exists = def.children.find(c => c.part === cn && (c.side || null) === side);
      const cb = el('input', { type: 'checkbox' }); cb.checked = !!exists;
      cb.addEventListener('change', () => {
        if (cb.checked) { if (!exists) def.children.push({ part: cn, side: side || undefined }); }
        else { const idx = def.children.findIndex(c => c.part === cn && (c.side || null) === side); if (idx >= 0) def.children.splice(idx, 1); }
        saveDraft(); renderParts();
      });
      box.appendChild(el('label', { class: 'agg-row' }, [cb, ' ' + cn + (side ? '（' + side + '）' : '')]));
    });
  });
}

function renderSpice() {
  const box = $('spice-box'); if (!box) return; box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: '辣度劇本（骨架）' }));
  box.appendChild(el('div', { class: 'hint', text: '取整機制＝B（輔門檻可低到 0）。三格 ratio 先留空，之後再填數字。輔門檻＝round(ratio × 輔卡數)。' }));
  state.spice.levels.forEach(lv => {
    const inp = el('input', { class: 'num', type: 'number', step: '0.05', min: '0', max: '1', placeholder: '(待填)', value: state.spice.ratios[lv] === '' ? '' : String(state.spice.ratios[lv]) });
    inp.addEventListener('change', () => { state.spice.ratios[lv] = inp.value === '' ? '' : parseFloat(inp.value); saveDraft(); });
    box.appendChild(el('div', { class: 'spice-row' }, [el('span', { class: 'spice-lv', text: lv }), el('span', { text: 'ratio =' }), inp]));
  });
}

function renderPalette() {
  const box = $('palette-inner'); if (!box) return; box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: 'observations（拖／點加入 combo）' }));
  const obsPart = state.curPart ? META.partToObsPart[state.curPart] : null;
  const search = el('input', { class: 'search', placeholder: '搜尋 label / id…', oninput: () => renderList(search.value) });
  const onlyRel = el('input', { type: 'checkbox' }); onlyRel.checked = true;
  box.appendChild(el('div', { class: 'pal-ctrl' }, [search, el('label', { class: 'inline' }, [onlyRel, ' 只看「' + (obsPart || '本部位') + '」'])]));
  const listBox = el('div', { class: 'pal-list' }); box.appendChild(listBox);
  onlyRel.addEventListener('change', () => renderList(search.value));
  function renderList(q) {
    listBox.innerHTML = '';
    q = (q || '').trim();
    let items = OBS;
    if (onlyRel.checked && obsPart) items = items.filter(o => o.part === obsPart);
    if (q) items = items.filter(o => (o.label + o.obsId).toLowerCase().indexOf(q.toLowerCase()) >= 0);
    if (!state.curPart) { listBox.appendChild(el('div', { class: 'hint', text: '先選部位' })); return; }
    items.slice(0, 200).forEach(o => {
      const item = el('div', {
        class: 'pal-item', draggable: true,
        ondragstart: (e) => e.dataTransfer.setData('text/obsid', o.obsId),
        onclick: () => { if (!state.active) return alert('先點一個 combo 當作加入目標（會標 ◉）'); const def = getPart(state.curDim, state.curPart, true); const card = def.cards.find(c => c.id === state.active.cardId); if (card) addLeaf(card, card.combos[state.active.comboIdx], o.obsId); }
      }, [el('span', { class: 'pi-label', text: o.label }), el('span', { class: 'pi-id', text: o.part + '·' + o.obsId })]);
      listBox.appendChild(item);
    });
    if (!items.length) listBox.appendChild(el('div', { class: 'hint', text: '無符合' }));
  }
  renderList('');
}

// ---------- top actions ----------
function newRuleSet() {
  const name = prompt('新套裝名稱：', '測試套裝 ' + nowStamp());
  if (name == null) return;
  state.ruleSet = { id: 'test-' + nowStamp(), name, note: '', basedOn: null, status: 'draft', createdAt: new Date().toISOString() };
  state.dims = {}; state.curPart = null;
  renderAll();
}
function exportJSON() {
  const data = serialize();
  const txt = JSON.stringify(data, null, 2);
  $('export-ta').value = txt;
  $('export-modal').style.display = 'flex';
}

// ---------- boot ----------
function boot() {
  loadDraft();
  $('btn-login').addEventListener('click', login);
  $('btn-logout').addEventListener('click', logout);
  $('btn-new').addEventListener('click', newRuleSet);
  $('btn-export').addEventListener('click', exportJSON);
  $('btn-save').addEventListener('click', saveToStaging);
  $('rs-name').addEventListener('change', (e) => { state.ruleSet.name = e.target.value; saveDraft(); });
  $('export-close').addEventListener('click', () => { $('export-modal').style.display = 'none'; });
  $('export-dl').addEventListener('click', () => {
    const blob = new Blob([$('export-ta').value], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: state.ruleSet.id + '.json' }); document.body.appendChild(a); a.click(); a.remove();
  });
  initFirebase();
  renderAll();
}
boot();
