// p2/js/admin2.js — admin2 條件編輯器（v0.6 §11/§4）
// 只蓋「編輯器 UI」。不預編 rule1 內容、不預標主/輔（role 預設「未標」）。
// observations 來源＝離線打包的 window.OBSERVATIONS（鏡像 rbf2app-staging 的 138 筆）。
// 登入(Google)＋teacher/admin 角色後，可把套裝存進 rbf2app-staging 的 ruleSets。
// 任何時候都可「匯出 JSON」「自動存草稿(localStorage)」，不需登入即可使用。

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc, writeBatch }
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
let OBS = window.OBSERVATIONS || [];                 // 靜態快照當後備；登入後改讀 live Firestore
const OBS_BY_ID = {};
function indexObs() { for (const k in OBS_BY_ID) delete OBS_BY_ID[k]; OBS.forEach(o => { OBS_BY_ID[o.obsId] = o; }); }
indexObs();

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
let lastSavedJson = null, lastSavedAt = null;   // 已儲存到 staging 的內容快照 + 時間，用來算「未儲存」

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
function saveDraft() { try { localStorage.setItem(LS_KEY, JSON.stringify({ ruleSet: state.ruleSet, dims: state.dims, spice: state.spice })); } catch (e) {} renderSaveStatus(); recordHistory(); }
function curJson() { try { return JSON.stringify(serialize()); } catch (e) { return ''; } }
function isDirty() { return !!user && curJson() !== lastSavedJson; }
function renderSaveStatus() {
  const s = $('save-status'); if (!s) return;
  // 短文字＋完整說明放 title（滑鼠移上去才顯示），避免長文字撐寬整行擋到分頁列。
  if (!fbOK || !user) { s.textContent = '本機草稿'; s.title = '未登入：編輯只存在本機草稿，按「儲存」前請先登入'; s.className = 'save-status'; return; }
  const dirty = curJson() !== lastSavedJson;
  s.textContent = dirty ? '● 未儲存' : ('已儲存 ✓' + (lastSavedAt ? ' ' + lastSavedAt : ''));
  s.title = dirty ? '尚未儲存到套裝（編輯會自動留本機草稿；按「儲存」才寫進套裝＝學員看的版本）' : '已寫進套裝（＝學員看的版本）';
  s.className = 'save-status ' + (dirty ? 'dirty' : 'ok');
}
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
      if (partHasContent(di, pn)) parts[pn] = (p.kind === 'leaf')
        ? { ...p, cards: (p.cards || []).map(c => ({ ...c, combos: (c.combos || []).map(cb => ({ leaves: cb })) })) }   // combo 包成 {leaves:[]}：Firestore 不接受巢狀陣列
        : p;
    });
    if (Object.keys(parts).length) {
      out.dims[di] = { dimIndex: +di, dimName: META.dims[di].name, positiveType: META.dims[di].positiveType, negativeType: META.dims[di].negativeType, targetPole: dimTargetPole(+di), targetPoleName: dimTargetName(+di), poleFlip: dimPoleFlip(+di), parts };
    }
  });
  return out;
}

// ---------- undo / redo（快照 ruleSet/dims/spice；不含選取狀態）----------
let _hist = [], _hi = -1, _restoring = false;
function _snap() { try { return JSON.stringify({ ruleSet: state.ruleSet, dims: state.dims, spice: state.spice }); } catch (e) { return ''; } }
function recordHistory() {
  if (_restoring) return;
  const s = _snap(); if (!s) return;
  if (_hi >= 0 && _hist[_hi] === s) return;          // 無實質變化（如純選取）不記
  _hist = _hist.slice(0, _hi + 1); _hist.push(s); _hi = _hist.length - 1;
  if (_hist.length > 100) { _hist.shift(); _hi--; }  // 上限 100 步
  renderUndoBtns();
}
function resetHistory() { _hist = [_snap()]; _hi = 0; renderUndoBtns(); }   // 載入新套裝後重設基準
function _applySnap(s) {
  let j; try { j = JSON.parse(s); } catch (e) { return; }
  state.ruleSet = j.ruleSet; state.dims = j.dims; state.spice = j.spice || state.spice;
  state.curPart = null; state.curGroup = null; state.active = null;
  _restoring = true; migrateAllLeaves(); renderAll(); _restoring = false;
  renderUndoBtns();
}
function undo() { if (_hi > 0) { _hi--; _applySnap(_hist[_hi]); } }
function redo() { if (_hi < _hist.length - 1) { _hi++; _applySnap(_hist[_hi]); } }
function renderUndoBtns() { const u = $('btn-undo'), r = $('btn-redo'); if (u) u.disabled = _hi <= 0; if (r) r.disabled = _hi >= _hist.length - 1; }

// ---------- 匯出維度為 Markdown（人看的摘要）----------
let _exportFmt = 'json';
function _roleZh(r) { return r === 'main' ? '主' : r === 'aux' ? '輔' : '未標'; }
function _leafText(leaf) {
  const o = OBS_BY_ID[leaf.ref]; const name = o ? o.label : leaf.ref;
  return (!leaf.match || !leaf.match.length) ? (name + '（未定義條件）') : (name + '＝' + leaf.match.join('／'));
}
function buildMarkdown() {
  const L = [];
  L.push('# 條件編輯器匯出（維度）— ' + (state.ruleSet.name || '(未命名套裝)'));
  L.push('');
  L.push('> 匯出時間：' + new Date().toLocaleString('zh-Hant'));
  const dimsWith = META.dims.filter(d => Object.keys((state.dims[d.index] && state.dims[d.index].parts) || {}).some(pn => partHasContent(d.index, pn)));
  L.push('> 有內容的維度：' + dimsWith.length + ' / ' + META.dims.length);
  L.push('');
  META.dims.forEach(d => {
    const di = d.index, dim = state.dims[di], parts = (dim && dim.parts) || {};
    const partNames = Object.keys(parts).filter(pn => partHasContent(di, pn));
    if (!partNames.length) return;
    L.push('## ' + d.name + '（符合為「' + dimTargetName(di) + '」）');
    partNames.forEach(pn => {
      const p = parts[pn];
      if (p.kind === 'aggregate') {
        L.push('### ' + pn + '（聚合部位）');
        (p.children || []).forEach(c => L.push('- ' + c.part + (c.side ? '（' + c.side + '）' : '')));
      } else {
        L.push('### ' + pn);
        (p.cards || []).forEach(c => {
          const note = c.note ? '　＿註：' + c.note.replace(/\s+/g, ' ').trim() : '';
          L.push('- **' + (c.label || '(未命名卡片)') + '**〔' + _roleZh(c.role) + '〕' + note);
          const combos = (c.combos || []).filter(cb => cb.length);
          if (!combos.length) { L.push('  - （尚無條件）'); return; }
          if (combos.length === 1) L.push('  - 條件（皆須符合）：' + combos[0].map(_leafText).join('；'));
          else { L.push('  - 符合下列任一組：'); combos.forEach((cb, i) => L.push('    - 組' + (i + 1) + '（皆須）：' + cb.map(_leafText).join('；'))); }
        });
      }
    });
    L.push('');
  });
  return L.join('\n');
}
function exportMarkdown() { _exportFmt = 'md'; $('export-ta').value = buildMarkdown(); $('export-title').textContent = '維度 Markdown（人看的摘要）'; $('export-modal').style.display = 'flex'; }

// ---------- observations 即時讀取（登入後改用 live Firestore，讓觀察庫新增/改的題目馬上可用）----------
let _lastObs = 0;
function _obsSig(arr) { return arr.map(o => o.obsId + ':' + (o.label || '') + ':' + (o.options || []).join(',')).join('|'); }
async function loadLiveObs(force) {
  if (!fbOK || !db || !user) return;                       // 沒登入讀不到（規則限登入），維持靜態後備
  if (!force && Date.now() - _lastObs < 8000) return;      // 節流：聚焦時最多 8 秒抓一次
  _lastObs = Date.now();
  try {
    const snap = await getDocs(collection(db, 'observations'));
    const live = {}; snap.forEach(d => { const o = d.data(); if (o && o.obsId) live[o.obsId] = o; });
    if (!Object.keys(live).length) return;                 // 沒讀到就不動
    // 以靜態順序為主套用 live 版本（反映編輯）；live 有靜態沒有的新題接在後面；靜態有 live 沒有的(已刪)去掉
    const order = (window.OBSERVATIONS || []).map(o => o.obsId);
    const next = []; order.forEach(id => { if (live[id]) { next.push(live[id]); delete live[id]; } });
    Object.keys(live).forEach(id => next.push(live[id]));
    if (_obsSig(next) === _obsSig(OBS)) return;             // 沒變就不重畫，避免打斷正在編輯
    OBS = next; indexObs();
    renderPalette(); renderEditor();                       // 重畫用到題目的欄位（observation 欄＋葉條件）
  } catch (e) { /* 讀失敗：維持目前 OBS */ }
}

// ---------- Firebase ----------
function initFirebase() {
  try {
    const app = initializeApp(RBF2_STAGING);
    auth = getAuth(app); db = getFirestore(app); fbOK = true;
    onAuthStateChanged(auth, async (u) => {
      user = u; role = null;
      // role 來源＝白名單 allowedUsers/{email}（admin 才可寫）；不再讀本人可寫的 users/{uid}.role。
      if (u) {
        const email = (u.email || '').toLowerCase();
        try { if (email) { const s = await getDoc(doc(db, 'allowedUsers', email)); if (s.exists()) role = s.data().role || null; } } catch (e) {}
        if (email === 'chaojentseng@gmail.com') role = 'admin';   // bootstrap：與規則一致，防鎖死
      }
      renderHeader();
      renderRsSelect();
      if (u) { checkEditSignal(); loadLiveObs(true); }   // 登入後：載入指定套裝、並抓 live 題庫
    });
  } catch (e) { fbOK = false; renderHeader(); }
}
async function login() { if (!fbOK) return alert('Firebase 未初始化'); try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert('登入失敗：' + (e.code || e.message)); } }
async function logout() { if (auth) await signOut(auth); }
function isStaff() { return !!user && (role === 'admin' || role === 'teacher'); }

async function saveToStaging() {
  if (!fbOK || !user) return alert('請先用 Google 登入');
  if (!isStaff()) return alert('此帳號角色＝' + (role || '（無）') + '，需 admin/teacher 才能存到 staging。\n你的 UID：' + user.uid + '\n（請先把這個 UID 設成 admin/teacher）');
  // 護欄：套裝必須在「套裝」分頁存在才能存（避免用 setDoc 把已刪/不存在的套裝復活）
  let exists = false; try { exists = (await getDoc(doc(db, 'ruleSets', state.ruleSet.id))).exists(); } catch (e) {}
  if (!exists) { renderRsSelect(); return alert('這份套裝在「套裝」分頁不存在（可能已被刪除）。\n請到「套裝」分頁新增或選一份，按「編輯內容」進來再存。'); }
  const snap = curJson();
  const data = serialize();
  const dimsAuthored = Object.keys(data.dims).length;
  let partsAuthored = 0; Object.values(data.dims).forEach(d => partsAuthored += Object.keys(d.parts || {}).length);
  try {
    // meta（名稱/時期/說明/狀態）一律由「套裝」分頁管理，這裡只更新「內容完整度」，不覆蓋 meta（避免蓋掉那邊的改名）
    await setDoc(doc(db, 'ruleSets', state.ruleSet.id), { savedAt: new Date().toISOString(), dimsAuthored, partsAuthored }, { merge: true });
    for (const di of Object.keys(data.dims)) {
      await setDoc(doc(db, 'ruleSets', state.ruleSet.id, 'dims', String(di)), JSON.parse(JSON.stringify(data.dims[di])));  // 去掉 undefined
    }
    lastSavedJson = snap; lastSavedAt = new Date().toTimeString().slice(0, 5);
    renderSaveStatus(); renderRsSelect();
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
}

// 每維度的極性設定：poleFlip（動靜對應）＋ tgt（符合為哪一極 a/b）
function dimPoleFlip(di) { return !!(state.dims[di] && state.dims[di].poleFlip); }
function dimTgt(di) { return (state.dims[di] && state.dims[di].tgt) || 'a'; }
function poleDong(di, ab) { const d = META.dims[di], f = dimPoleFlip(di); return ab === 'a' ? (f ? d.bT : d.aT) : (f ? d.aT : d.bT); }
function dimTargetName(di) { const d = META.dims[di]; return dimTgt(di) === 'a' ? d.a : d.b; }   // 目標極名（形/勢）
function dimTargetPole(di) { return poleDong(di, dimTgt(di)); }                                    // 目標極動靜（給引擎）
function renderDims() {
  const box = $('col-dims'); box.innerHTML = '';
  box.appendChild(el('div', { class: 'col-title', text: '維度' }));
  META.dims.forEach(d => {
    const row = el('div', { class: 'list-row dim-row' + (state.curDim === d.index ? ' sel' : ''), onclick: () => { state.curDim = d.index; state.curPart = null; renderAll(); } });
    row.appendChild(el('span', { class: 'dim-name', text: d.name + '　符合為' + dimTargetName(d.index) }));
    box.appendChild(row);
  });
}

function renderParts() {
  const box = $('col-parts'); box.innerHTML = '';
  const dm = META.dims[state.curDim];
  box.appendChild(el('div', { class: 'col-title', text: dm.name + '：部位' }));
  // 維度極性設定：動靜對應 ＋ 符合為
  const ctrl = el('div', { class: 'pole-ctrl' });
  [[false, dm.a + ' ' + dm.aT + '｜' + dm.b + ' ' + dm.bT], [true, dm.a + ' ' + dm.bT + '｜' + dm.b + ' ' + dm.aT]].forEach(([flip, label]) => {
    const r = el('input', { type: 'radio', name: 'pflip-' + state.curDim }); r.checked = dimPoleFlip(state.curDim) === flip;
    r.addEventListener('change', () => { ensureDim(state.curDim).poleFlip = flip; saveDraft(); renderDims(); });
    ctrl.appendChild(el('label', { class: 'pole-opt' }, [r, ' ' + label]));
  });
  const tg = el('div', { class: 'pole-tgt' }, [el('span', { class: 'fl', text: '符合為' })]);
  [['a', dm.a], ['b', dm.b]].forEach(([ab, name]) => {
    const r = el('input', { type: 'radio', name: 'ptgt-' + state.curDim }); r.checked = dimTgt(state.curDim) === ab;
    r.addEventListener('change', () => { ensureDim(state.curDim).tgt = ab; saveDraft(); renderDims(); });
    tg.appendChild(el('label', { class: 'pole-opt' }, [r, ' ' + name]));
  });
  ctrl.appendChild(tg);
  box.appendChild(ctrl);
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
  renderPartSpice(box, def);
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

// 每部位辣度門檻：大/中/小辣 各「要中幾個輔」（主一律必中）
function renderPartSpice(box, def) {
  const auxCount = (def.cards || []).filter(c => c.role !== 'main').length;
  const wrap = el('div', { class: 'spice-need' }, [el('div', { class: 'fl', text: '辣度門檻：要中幾個輔（共 ' + auxCount + ' 輔；主必中）' })]);
  const row = el('div', { class: 'spice-need-row' });
  ['大辣', '中辣', '小辣'].forEach(lv => {
    const cur = (def.spice && def.spice[lv] != null) ? Math.min(def.spice[lv], auxCount) : auxCount;
    const inp = el('input', { type: 'number', class: 'sn-num', min: '0', max: String(auxCount), value: String(cur) });
    inp.addEventListener('change', () => {
      if (!def.spice) def.spice = {};
      let v = parseInt(inp.value || '0', 10); if (isNaN(v)) v = 0; v = Math.max(0, Math.min(v, auxCount));
      def.spice[lv] = v; inp.value = String(v); saveDraft();
    });
    row.appendChild(el('label', { class: 'sn-cell' }, [el('span', { class: 'sn-lv', text: lv }), inp]));
  });
  wrap.appendChild(row);
  box.appendChild(wrap);
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
  box.appendChild(el('div', { class: 'sb-title', text: '辣度＝每個部位各自設「大/中/小辣 要中幾個輔」（在第三欄部位上方設定，主一律必中）。學員看報告時選大/中/小辣;聚合門檻固定、不受辣度。' }));
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
    items = items.slice(0, 200);
    function obsItem(o) {
      return el('div', {
        class: 'pal-item', draggable: true,
        ondragstart: (e) => e.dataTransfer.setData('text/obsid', o.obsId),
        onclick: () => { if (!state.active) return alert('先點一個 combo 當作加入目標（會標 ◉）'); const def = getPart(state.curDim, state.curPart, true); const card = (def.cards || []).find(c => c.id === state.active.cardId); if (card) addLeaf(card, card.combos[state.active.comboIdx], o.obsId); }
      }, [
        el('span', { class: 'pi-label', text: o.label }),
        el('span', { class: 'pi-row' }, [el('span', { class: 'pi-id', text: o.obsId }), el('span', { class: 'lr-tag', text: pairedOf(o.obsId) ? 'L/R' : '非L/R' })])
      ]);
    }
    // 依 section（部位題目的分類，如 頂骨/枕骨/華陽骨）分組顯示
    const groups = [];
    items.forEach(o => { const sec = o.section || '（未分類）'; let g = groups.find(x => x.sec === sec); if (!g) { g = { sec, list: [] }; groups.push(g); } g.list.push(o); });
    groups.forEach(g => { listBox.appendChild(el('div', { class: 'pal-sec', text: g.sec })); g.list.forEach(o => listBox.appendChild(obsItem(o))); });
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
  _exportFmt = 'json';
  const data = serialize();
  $('export-ta').value = JSON.stringify(data, null, 2);
  $('export-title').textContent = '套裝 JSON（v0.6 §A.2 形狀）';
  $('export-modal').style.display = 'flex';
}

// ================= 套裝管理（ruleSets） =================
// 從 Firestore 形狀還原回編輯器 state（poleFlip/tgt 由 targetPoleName 反推）
function applyRuleSet(meta, dimDocs) {
  state.ruleSet = { id: meta.id, name: meta.name || '', note: meta.note || '', basedOn: meta.basedOn || null, status: meta.status || 'draft', createdAt: meta.createdAt || new Date().toISOString() };
  state.dims = {};
  dimDocs.forEach(dd => {
    const di = +dd.dimIndex; const m = META.dims[di];
    const tgt = (m && dd.targetPoleName && dd.targetPoleName === m.b) ? 'b' : 'a';
    const parts = dd.parts || {};   // 把 {leaves:[]} 還原回記憶體用的陣列 combo
    Object.keys(parts).forEach(pn => { const pp = parts[pn]; if (pp && Array.isArray(pp.cards)) pp.cards.forEach(c => { if (Array.isArray(c.combos)) c.combos = c.combos.map(cb => Array.isArray(cb) ? cb : (cb && cb.leaves) ? cb.leaves : []); }); });
    state.dims[di] = { parts, poleFlip: !!dd.poleFlip, tgt };
  });
  state.curPart = null; state.curGroup = null; state.active = null;
  migrateAllLeaves(); renderAll();
  lastSavedJson = curJson(); lastSavedAt = '（剛載入）'; renderSaveStatus(); renderRsSelect();
  resetHistory();   // 載入新套裝＝新的 undo 基準（不可往上一份套裝 undo）
}

async function loadRsIntoEditor(id) {
  try {
    const metaSnap = await getDoc(doc(db, 'ruleSets', id));
    const dimsSnap = await getDocs(collection(db, 'ruleSets', id, 'dims'));
    const dimDocs = []; dimsSnap.forEach(d => dimDocs.push(d.data()));
    applyRuleSet({ id, ...(metaSnap.exists() ? metaSnap.data() : {}) }, dimDocs);
  } catch (e) { alert('載入失敗：' + (e.code || e.message)); }
}

// 「套裝」分頁按「編輯內容」→ 寫 localStorage 信號；這裡接到就載入該套裝（需登入）
const EDIT_KEY = 'admin2_edit_set';
function checkEditSignal() {
  let sig = null; try { sig = JSON.parse(localStorage.getItem(EDIT_KEY) || 'null'); } catch (e) {}
  if (sig && sig.id && user && sig.id !== state.ruleSet.id) loadRsIntoEditor(sig.id);
}

// 上方「套裝」下拉：選哪一份套裝來編（套裝在「套裝」分頁建立/改名）
async function renderRsSelect() {
  const sel = $('rs-select'); if (!sel) return;
  const cur = state.ruleSet.id, curName = state.ruleSet.name || '(未命名)';
  if (!fbOK || !user) { sel.innerHTML = ''; const o = el('option', { value: '', text: curName + '（本機草稿）' }); o.selected = true; sel.appendChild(o); return; }
  try {
    const snap = await getDocs(collection(db, 'ruleSets'));
    const sets = []; snap.forEach(d => sets.push({ id: d.id, ...d.data() }));
    sets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    sel.innerHTML = '';
    if (!sets.length) { sel.appendChild(el('option', { value: '', text: '（尚無套裝→到「套裝」分頁新增）' })); return; }
    let found = false;
    sets.forEach(s => { const o = el('option', { value: s.id, text: s.name || s.id }); if (s.id === cur) { o.selected = true; found = true; } sel.appendChild(o); });
    if (!found) { const o = el('option', { value: cur, text: curName + '（不在套裝清單）' }); sel.insertBefore(o, sel.firstChild); o.selected = true; }
  } catch (e) { sel.innerHTML = ''; sel.appendChild(el('option', { value: '', text: '讀取失敗' })); }
}

// 在編輯器分頁直接把目前套裝設為上線（有確認＋未存/空套裝護欄）
async function setActiveFromEditor() {
  if (!fbOK || !user) return alert('請先用 Google 登入');
  if (!isStaff()) return alert('需 admin/teacher 才能設為上線');
  if (isDirty()) return alert('目前有未儲存的變更，請先按「儲存」再設為上線。');
  let exists = false; try { exists = (await getDoc(doc(db, 'ruleSets', state.ruleSet.id))).exists(); } catch (e) {}
  if (!exists) { renderRsSelect(); return alert('這份套裝在「套裝」分頁不存在（可能已被刪除），無法設為上線。'); }
  const dn = Object.keys(serialize().dims).length;
  if (dn === 0 && !confirm('此套裝尚無內容（0 維），設為上線後學員會讀到空規則。確定？')) return;
  if (!confirm('把目前套裝《' + (state.ruleSet.name || state.ruleSet.id) + '》設為上線（＝學員看到的版本）？')) return;
  try {
    let prev = null; const a = await getDoc(doc(db, 'config', 'active')); if (a.exists()) prev = a.data().activeRuleSetId || null;
    await setDoc(doc(db, 'config', 'active'), { activeRuleSetId: state.ruleSet.id, previousActiveRuleSetId: prev, defaultSpice: (a.exists() && a.data().defaultSpice) || '中辣', updatedAt: new Date().toISOString() });
    alert('已設為上線：' + (state.ruleSet.name || state.ruleSet.id));
  } catch (e) { alert('設上線失敗：' + (e.code || e.message)); }
}

// ---------- boot ----------
function boot() {
  loadDraft();
  $('btn-login').addEventListener('click', login);
  $('btn-logout').addEventListener('click', logout);
  $('btn-export').addEventListener('click', exportJSON);
  $('btn-export-md').addEventListener('click', exportMarkdown);
  $('btn-save').addEventListener('click', saveToStaging);
  $('btn-setlive').addEventListener('click', setActiveFromEditor);
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // 在輸入框內讓瀏覽器原生 undo 文字
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  $('rs-select').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v || v === state.ruleSet.id) return;
    if (isDirty() && !confirm('目前套裝有未儲存變更，切換會丟掉這些變更（本機草稿仍保留）。確定切換？')) { renderRsSelect(); return; }
    loadRsIntoEditor(v);
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  $('export-close').addEventListener('click', () => { $('export-modal').style.display = 'none'; });
  window.addEventListener('storage', e => { if (e.key === EDIT_KEY) checkEditSignal(); });
  window.addEventListener('focus', () => { loadLiveObs(false); if (user) renderRsSelect(); });   // 切回來時刷新 live 題庫＋套裝清單
  $('export-dl').addEventListener('click', () => {
    const md = _exportFmt === 'md';
    const blob = new Blob([$('export-ta').value], { type: md ? 'text/markdown' : 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: state.ruleSet.id + (md ? '.md' : '.json') }); document.body.appendChild(a); a.click(); a.remove();
  });
  initFirebase();
  renderAll();
  renderRsSelect();
  resetHistory();   // 初始 undo 基準
}
boot();
