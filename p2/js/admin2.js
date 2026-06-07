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
import { AGG_FIXED } from './engine.js';

const PAIRED = window.PAIRED_MAP || {};
const pairedOf = id => !!PAIRED[id];
// 規則部位 → observation 過濾（部位＋section，讓「頂骨」只看頂骨而非整個頭）
const PART_OBS = { '頂骨': ['頭', '頂骨'], '枕骨': ['頭', '枕骨'], '華陽骨': ['頭', '華陽骨'], '上停': ['額'], '耳': ['耳'], '眉': ['眉'], '眼': ['眼'], '鼻': ['鼻'], '口': ['口'], '顴': ['顴'], '人中': ['人中'], '地閣': ['地閣'], '頤': ['頤'] };

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
  curDim: 0, curPart: null, curGroup: null,  // curGroup = 選中的敘述分組 id
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
function uidG() { return 'g' + Math.random().toString(36).slice(2, 7); }
// 敘述分組 ≡ 卡片（1:1）：每張卡片有 簡稱(label)、註解(note，會顯示在部位觀察頁)、主/輔(role)、combos。
// 舊草稿（groups 容器 / 更舊的扁平 cards）自動攤平成卡片清單，向後相容。
function ensureCards(def) {
  if (def.groups) {
    const flat = [];
    def.groups.forEach(g => (g.cards || []).forEach(c => flat.push({ id: c.id || uidG(), label: c.label || g.label || '', note: c.note || '', role: c.role || null, combos: (c.combos && c.combos.length) ? c.combos : [[]] })));
    def.cards = flat; delete def.groups;
  }
  if (!def.cards) def.cards = [];
  def.cards.forEach(c => { if (!c.id) c.id = uidG(); if (!('label' in c)) c.label = ''; if (!('note' in c)) c.note = ''; if (!('role' in c)) c.role = null; if (!c.combos || !c.combos.length) c.combos = [[]]; });
}
function getPart(di, name, createDefault) {
  const d = ensureDim(di);
  if (!d.parts[name] && createDefault) {
    const pm = partMeta(name);
    if (pm.kind === 'aggregate') d.parts[name] = { kind: 'aggregate', children: [] };       // 門檻 universal（辣度連動），不存在 part 上
    else d.parts[name] = { kind: 'leaf', cards: [] };                                        // 目標極跟維度、左右由觀察題、無 lrMode
  }
  if (d.parts[name] && d.parts[name].kind === 'leaf') ensureCards(d.parts[name]);
  return d.parts[name];
}
function partHasContent(di, name) {
  const p = state.dims[di] && state.dims[di].parts[name];
  if (!p) return false;
  if (p.kind === 'aggregate') return p.children.length > 0;
  if (p.cards) return p.cards.length > 0;
  if (p.groups) return p.groups.some(g => (g.cards || []).length > 0);
  return false;
}

// ---------- persistence ----------
function saveDraft() { try { localStorage.setItem(LS_KEY, JSON.stringify({ ruleSet: state.ruleSet, dims: state.dims, spice: state.spice })); } catch (e) {} }
function migrateAllLeaves() {
  Object.values(state.dims || {}).forEach(d => Object.values(d.parts || {}).forEach(p => { if (p.kind === 'leaf') ensureCards(p); }));
}
function loadDraft() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (j && j.dims) { state.ruleSet = j.ruleSet; state.dims = j.dims; state.spice = j.spice || state.spice; migrateAllLeaves(); }
  } catch (e) {}
}
function serialize() {
  const out = { ruleSet: state.ruleSet, spice: state.spice, dims: {} };
  Object.keys(state.dims).forEach(di => {
    const parts = {};
    const dp = state.dims[di].parts;
    Object.keys(dp).forEach(pn => {
      const p = dp[pn];
      if (p.kind === 'leaf') { ensureCards(p); delete p.targetPole; delete p.lrMode; }     // universal 化：目標極跟維度、左右由觀察題
      if (p.kind === 'aggregate') { delete p.threshold; delete p.targetPole; }              // 門檻 universal（辣度連動）
      if (partHasContent(di, pn)) parts[pn] = p;
    });
    if (Object.keys(parts).length) {
      out.dims[di] = { dimIndex: +di, dimName: META.dims[di].name, positiveType: META.dims[di].positiveType, negativeType: META.dims[di].negativeType, targetPole: dimTargetPole(+di), parts };
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

function dimTargetPole(di) { return (state.dims[di] && state.dims[di].targetPole) || META.dims[di].positiveType; }
function renderDims() {
  const box = $('col-dims'); box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: '維度' }));
  META.dims.forEach(d => {
    const row = el('div', { class: 'list-row dim-row' + (state.curDim === d.index ? ' sel' : ''), onclick: () => { state.curDim = d.index; state.curPart = null; renderAll(); } });
    row.appendChild(el('span', { class: 'dim-name', text: d.name }));
    const cur = dimTargetPole(d.index);
    const pole = el('span', { class: 'dim-pole', onclick: (e) => e.stopPropagation() }, [el('span', { class: 'dp-label', text: '符合為' })]);
    [d.positiveType, d.negativeType].forEach(p => {
      const r = el('input', { type: 'radio', name: 'dpole-' + d.index }); r.checked = cur === p;
      r.addEventListener('change', () => { ensureDim(d.index).targetPole = p; saveDraft(); });
      pole.appendChild(el('label', { class: 'dp-opt' }, [r, p]));
    });
    row.appendChild(pole);
    box.appendChild(row);
  });
}

function renderParts() {
  const box = $('col-parts'); box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: META.dims[state.curDim].name + '：部位' }));
  box.appendChild(el('div', { class: 'group-label', text: '葉部位' }));
  META.leafParts.forEach(lf => box.appendChild(partRow(lf.name, lf.paired ? '可左右' : '', false)));
  box.appendChild(el('div', { class: 'group-label', text: '聚合部位' }));
  META.aggregates.forEach(a => box.appendChild(partRow(a.name, '', true)));
}
function partRow(name, sub, isAgg) {
  const has = !isAgg && partHasContent(state.curDim, name);
  const kids = [document.createTextNode((isAgg ? '' : (has ? '● ' : '○ ')) + name)];
  if (sub) kids.push(el('span', { class: 'pr-sub', text: '　' + sub }));
  return el('div', { class: 'list-row' + (state.curPart === name ? ' sel' : ''), onclick: () => { state.curPart = name; state.curGroup = null; state.active = null; renderEditor(); renderPalette(); renderParts(); } },
    [el('span', { class: 'lr-name' }, kids)]);
}

let focusCardId = null;
function renderEditor() { renderCardsListCol(); renderLeavesCol(); }

// 第 3 欄：敘述分組＝卡片管理（簡稱/主輔/註解/數量）。含部位層 目標極/左右模式。聚合→聚合編輯器。
function renderCardsListCol() {
  const box = $('col-groups'); box.innerHTML = '';
  if (!state.curPart) { box.appendChild(el('div', { class: 'col-title', text: '敘述分組' })); box.appendChild(el('div', { class: 'hint', text: '← 選部位' })); return; }
  const pm = partMeta(state.curPart);
  box.appendChild(el('div', { class: 'col-title', text: state.curPart + (pm.kind === 'aggregate' ? '（聚合）' : '（葉）') }));
  if (pm.kind === 'aggregate') { renderAggReadonly(box); return; }
  const def = getPart(state.curDim, state.curPart, true);
  box.appendChild(el('div', { class: 'col-title sub' }, [
    document.createTextNode('敘述分組＝卡片'),
    el('button', { class: 'btn xs add-card', text: '＋', title: '新增敘述分組（卡片）', onclick: () => addCard(def) })
  ]));
  if (!def.cards.length) box.appendChild(el('div', { class: 'hint', text: '＋ 新增一個敘述分組（＝一張卡片）' }));
  const list = el('div', { class: 'cardlist' });
  def.cards.forEach((card, ci) => list.appendChild(renderCardRow(def, card, ci)));
  box.appendChild(list);
  enableCardDrag(list, def);
}

function renderAggReadonly(box) {
  const agg = AGG_FIXED[state.curPart];
  box.appendChild(el('div', { class: 'hint', text: '聚合部位＝固定骨架（13 維皆同、不可編）。引用其他部位的逐側過關結果。' }));
  if (!agg) return;
  box.appendChild(el('div', { class: 'agg-ro' }, [
    el('div', { class: 'agg-ro-th', text: '門檻：過關子側數 ≥ ' + agg.threshold }),
    el('div', { class: 'fl', text: '引用子部位（逐側）' }),
    ...agg.children.map(c => el('div', { class: 'agg-ro-row', text: '· ' + c.part + (c.side ? '（' + c.side + '）' : '') }))
  ]));
}

function renderCardRow(def, card, ci) {
  const wrap = el('div', { class: 'cardrow', 'data-cid': card.id });
  const handle = el('span', { class: 'drag-h', text: '⠿', title: '拖曳排序' });
  const name = el('input', { class: 'cr-name', value: card.label, placeholder: '簡稱（卡片名）' });
  name.addEventListener('input', () => { card.label = name.value; saveDraft(); syncLeafHeader(card); });
  if (focusCardId === card.id) { focusCardId = null; setTimeout(() => name.focus(), 0); }
  const roleSel = el('select', { class: 'cr-role', onchange: (e) => { card.role = e.target.value || null; saveDraft(); syncLeafHeader(card); } });
  [['', '未標'], ['main', '主'], ['aux', '輔']].forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if ((card.role || '') === v) o.selected = true; roleSel.appendChild(o); });
  const note = el('textarea', { class: 'cr-note', placeholder: '註解 hint（會出現在部位觀察頁）' }); note.value = card.note || ''; note.style.display = 'none';
  const noteBtn = el('button', { class: 'btn xs note-toggle' + (card.note ? ' has' : ''), text: '✎', title: '註解 hint（點開編輯，編完收起）' });
  noteBtn.addEventListener('click', () => { const show = note.style.display === 'none'; note.style.display = show ? 'block' : 'none'; if (show) note.focus(); });
  note.addEventListener('input', () => { card.note = note.value; saveDraft(); noteBtn.classList.toggle('has', !!card.note); });
  note.addEventListener('blur', () => { note.style.display = 'none'; });
  wrap.appendChild(el('div', { class: 'cr-top' }, [handle, name, roleSel, noteBtn, el('button', { class: 'btn xs danger', text: '✕', onclick: () => deleteCard(def, ci) })]));
  wrap.appendChild(note);
  return wrap;
}

function enableCardDrag(list, def) {
  let from = null;
  [...list.children].forEach((row, ci) => {
    const h = row.querySelector('.drag-h'); if (!h) return;
    h.addEventListener('mousedown', () => { row.draggable = true; });
    row.addEventListener('dragstart', (e) => { from = ci; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('dragging'); from = null; });
    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop-into'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop-into'));
    row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('drop-into'); if (from == null || from === ci) return; const [m] = def.cards.splice(from, 1); def.cards.splice(ci, 0, m); renderCardsListCol(); renderLeavesCol(); saveDraft(); });
  });
}

// 第 4 欄：所有卡片展開（combo→葉）。卡片可在此上下移動。
function renderLeavesCol() {
  const box = $('col-cards'); box.innerHTML = '';
  if (!state.curPart) { box.appendChild(el('div', { class: 'hint', text: '← 選部位' })); return; }
  const pm = partMeta(state.curPart);
  if (pm.kind === 'aggregate') { box.appendChild(el('div', { class: 'hint', text: '聚合部位無卡片內容（固定骨架，見左欄）。' })); return; }
  const def = getPart(state.curDim, state.curPart, true);
  box.appendChild(el('div', { class: 'cards-head' }, [el('span', { text: '卡片內容（卡間＝或；卡內 combo＝或；combo 內葉＝而且）。點 combo → 右欄點/拖 observation 加葉。' })]));
  if (!def.cards.length) box.appendChild(el('div', { class: 'hint', text: '左欄＋新增敘述分組後，這裡會出現對應卡片。' }));
  def.cards.forEach((card, ci) => box.appendChild(renderCard(def, card, ci)));
}

function syncLeafHeader(card) {
  const c = document.querySelector('#col-cards .card[data-cid="' + card.id + '"]');
  if (!c) return;
  const tag = c.querySelector('.card-tag'); if (tag) tag.textContent = card.label || '（未命名敘述分組）';
  const badge = c.querySelector('.role-badge'); if (badge) { badge.textContent = card.role === 'main' ? '主' : (card.role === 'aux' ? '輔' : '未標'); badge.className = 'role-badge' + (card.role ? '' : ' none'); }
}


function renderCard(def, card, ci) {
  const wrap = el('div', { class: 'card', 'data-cid': card.id });
  wrap.appendChild(el('div', { class: 'card-head' }, [
    el('span', { class: 'card-tag', text: card.label || '（未命名敘述分組）' }),
    el('span', { class: 'role-badge' + (card.role ? '' : ' none'), text: card.role === 'main' ? '主' : (card.role === 'aux' ? '輔' : '未標') }),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn xs', text: '＋combo（或）', onclick: () => { card.combos.push([]); renderLeavesCol(); saveDraft(); } })
  ]));
  card.combos.forEach((combo, cj) => {
    if (cj > 0) wrap.appendChild(el('div', { class: 'or-sep', text: '— 或 —' }));
    wrap.appendChild(renderCombo(card, combo, cj));
  });
  return wrap;
}

// ---- 卡片（＝敘述分組）操作（排序用拖曳，見 enableCardDrag）----
function addCard(def) {
  const c = { id: uidG(), label: '', note: '', role: null, combos: [[]] };
  def.cards.push(c); focusCardId = c.id;
  renderCardsListCol(); renderLeavesCol(); renderParts(); saveDraft();
}
function deleteCard(def, ci) {
  const c = def.cards[ci];
  const hasContent = c.label || c.note || c.combos.some(cb => cb.length);
  if (hasContent && !confirm('刪除敘述分組（卡片）「' + (c.label || '未命名') + '」？')) return;
  def.cards.splice(ci, 1);
  renderCardsListCol(); renderLeavesCol(); renderParts(); saveDraft();
}

function renderCombo(card, combo, cj) {
  const isActive = state.active && state.active.cardId === card.id && state.active.comboIdx === cj;
  const drop = el('div', {
    class: 'combo' + (isActive ? ' active' : ''),
    ondragover: (e) => { e.preventDefault(); drop.classList.add('dragover'); },
    ondragleave: () => drop.classList.remove('dragover'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('dragover'); const id = e.dataTransfer.getData('text/obsid'); if (id) addLeaf(card, combo, id); },
    onclick: () => { state.active = { part: state.curPart, cardId: card.id, comboIdx: cj }; renderLeavesCol(); }
  });
  const head = el('div', { class: 'combo-head' }, [
    el('span', { class: 'combo-tag', text: (isActive ? '◉ ' : '') + 'combo' + (cj + 1) + '（而且）' }),
    el('span', { class: 'spacer' })
  ]);
  if (card.combos.length > 1) head.appendChild(el('button', { class: 'btn xs danger', text: '✕ 刪 combo', onclick: (e) => { e.stopPropagation(); card.combos.splice(cj, 1); if (state.active && state.active.cardId === card.id) state.active = null; renderLeavesCol(); saveDraft(); } }));
  drop.appendChild(head);
  if (!combo.length) drop.appendChild(el('span', { class: 'hint', text: '點此 combo（會標 ◉）再點右欄 observation，或拖進來' }));
  combo.forEach((leaf, li) => drop.appendChild(renderLeaf(card, combo, leaf, li)));
  return drop;
}

function renderLeaf(card, combo, leaf, li) {
  const o = OBS_BY_ID[leaf.ref];
  const wrap = el('div', { class: 'leaf' });
  const head = el('div', { class: 'leaf-head' }, [
    el('span', { class: 'leaf-label', text: (o ? o.label : leaf.ref) }),
    el('span', { class: 'lr-tag', text: pairedOf(leaf.ref) ? 'L/R' : '非L/R' })
  ]);
  if (!leaf.match.length) head.appendChild(el('span', { class: 'undef', text: '尚未定義條件' }));
  head.appendChild(el('span', { class: 'spacer' }));
  head.appendChild(el('button', { class: 'btn xs danger', text: '✕', onclick: (e) => { e.stopPropagation(); combo.splice(li, 1); renderLeavesCol(); saveDraft(); } }));
  wrap.appendChild(head);
  const optBox = el('div', { class: 'opts' });
  (o ? o.options : []).forEach(v => {
    const on = leaf.match.indexOf(v) >= 0;
    optBox.appendChild(el('span', { class: 'opt' + (on ? ' on' : ''), text: v, onclick: (e) => { e.stopPropagation(); const i = leaf.match.indexOf(v); if (i >= 0) leaf.match.splice(i, 1); else leaf.match.push(v); renderLeavesCol(); saveDraft(); } }));
  });
  wrap.appendChild(optBox);
  return wrap;
}

function addLeaf(card, combo, obsId) {
  if (combo.some(l => l.ref === obsId)) return;
  combo.push({ ref: obsId, match: [] });
  renderLeavesCol(); saveDraft();
}

function renderSpice() {
  const box = $('spice-box'); if (!box) return; box.innerHTML = '';
  box.appendChild(el('div', { class: 'sb-title', text: '辣度劇本（拖曳 bar，10% 一格）｜輔門檻＝輔得分÷輔滿分 ≥ 此比例；聚合門檻同此比例（主一律必中）' }));
  state.spice.levels.forEach(lv => {
    const empty = state.spice.ratios[lv] === '' || state.spice.ratios[lv] == null;
    const cur = empty ? 0 : Math.round(state.spice.ratios[lv] * 100);
    const valSpan = el('span', { class: 'spice-val', text: empty ? '—' : cur + '%' });
    const range = el('input', { type: 'range', min: '0', max: '100', step: '10', value: String(cur) });
    range.addEventListener('input', () => { const pct = parseInt(range.value, 10); state.spice.ratios[lv] = pct / 100; valSpan.textContent = pct + '%'; saveDraft(); });
    box.appendChild(el('div', { class: 'spice-row' }, [el('span', { class: 'spice-lv', text: lv }), range, valSpan]));
  });
}

function renderPalette() {
  const box = $('palette-inner'); if (!box) return; box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: 'observations' }));
  const filt = state.curPart ? PART_OBS[state.curPart] : null;   // [obsPart, section?]，跟著第二欄部位（頂骨只看頂骨）
  const search = el('input', { class: 'search', placeholder: '搜尋 label / id…', oninput: () => renderList(search.value) });
  const onlyRel = el('input', { type: 'checkbox' }); onlyRel.checked = true;
  box.appendChild(el('div', { class: 'pal-ctrl' }, [search, el('label', { class: 'inline' }, [onlyRel, ' 只看「' + (state.curPart || '本部位') + '」'])]));
  const listBox = el('div', { class: 'pal-list' }); box.appendChild(listBox);
  onlyRel.addEventListener('change', () => renderList(search.value));
  function renderList(q) {
    listBox.innerHTML = '';
    q = (q || '').trim();
    if (!state.curPart) { listBox.appendChild(el('div', { class: 'hint', text: '先選部位' })); return; }
    if (!filt) { listBox.appendChild(el('div', { class: 'hint', text: '此部位（聚合）不需 observation' })); return; }
    let items = OBS;
    if (onlyRel.checked) items = items.filter(o => o.part === filt[0] && (!filt[1] || o.section === filt[1]));
    if (q) items = items.filter(o => (o.label + o.obsId).toLowerCase().indexOf(q.toLowerCase()) >= 0);
    items.slice(0, 200).forEach(o => {
      const item = el('div', {
        class: 'pal-item', draggable: true,
        ondragstart: (e) => e.dataTransfer.setData('text/obsid', o.obsId),
        onclick: () => { if (!state.active) return alert('先點一個 combo 當作加入目標（會標 ◉）'); const def = getPart(state.curDim, state.curPart, true); const card = (def.cards || []).find(c => c.id === state.active.cardId); if (card) addLeaf(card, card.combos[state.active.comboIdx], o.obsId); }
      }, [
        el('span', { class: 'pi-label', text: o.label }),
        el('span', { class: 'pi-row' }, [el('span', { class: 'pi-id', text: o.obsId }), el('span', { class: 'lr-tag', text: pairedOf(o.obsId) ? 'L/R' : '非L/R' })])
      ]);
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
