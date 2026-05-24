// ============================================================
// 手機版手動輸入 tab — 13 維度 × 9 部位動靜直填 + 手動兵法報告 + 重要參數分析
// 職責：
//   - 手動輸入 tab mount / unmount
//   - 內部 segmented：輸入 / 手動兵法報告
//   - 13 維度 tile + 部位三態 toggle（靜 / — / 動）
//   - LS 草稿 per-uid + Firestore manualDataJson 同步
//   - 詳盡報告 PNG（手動版）
//   - 重要參數分析（手動版）
// 依賴：
//   - js/core.js (DIMS)
//   - js/m_main.js (auth, db, debugLog)
//   - js/m_input.js (setSaveStatus)
//   - js/m_report.js (generatePng — PNG 生成 helper，避免 duplicate)
//   - js/m_sens.js (renderManualSens)
//   - firebase firestore SDK
// 被用：m_main.js（mountManual / unmountManual / getManualDirty / discardManualDraft）
// retest 範圍：
//   - 13 維度 tile + 9 部位三態 toggle
//   - 進度數字 N/9
//   - LS 草稿 per-uid（重整保留）
//   - Firestore baseline 讀取（從 window.__userData.manualDataJson）
//   - 答題 / 清空 / 維度互斥 → 即時 setSaveStatus('dirty')
//   - 點儲存 → 寫 Firestore manualDataJson + 清 LS + 狀態回綠
//   - 桌機 staging manualDataJson 互通（兩端資料同步）
//   - 詳盡報告 PNG（手動版）+ 重要參數分析（手動版）
// ============================================================

import { DIMS, avgCoeff, calcDim, DIM_RULES } from './core.js';
import { buildRadar2MSVG, buildSDSVG } from './report_chart.js';
import { evaluatePart } from './rule_engine.js';
import { auth, db, debugLog, refreshUserData, getEffectiveUid } from './m_main.js';
import { setSaveStatus, getSaveStatus } from './m_input.js';
import { updateHomeProgress } from './m_home.js';
import { generatePng } from './m_report.js';
import { renderManualSens } from './m_sens.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const LS_DIM_IDX = 'm_manual_dim_idx';
const LS_VIEW = 'm_manual_view';

let _container = null;
// v1.7 階段 8：拿掉 _view，純用 _manualSubview，segmented 三個 tab
let _manualSubview = 'input';  // 'input' | 'overview' | 'sens'

// v1.7 階段 8：手動輸入 tab 上方 segmented 三個 tab
const SUBMODES = [
  { key: 'input',    label: '輸入' },
  { key: 'overview', label: '報告' },
  { key: 'sens',     label: '參數分析' },
];
let _manualDraft = null;
let _firestoreBaseline = null;
let _manualDimIdx = null;
let _isSavingManual = false;
let _baselineFingerprintAtMount = ''; // mount 時 firestore baseline JSON fingerprint
let _draftInitialized = false;         // 本次 app 載入是否已初始化 _manualDraft（從 firestore）

const PART_LABELS = ['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
const DIM_ROW_1_IDX = [0, 1, 2, 3, 4, 5];
const DIM_ROW_2_IDX = [6, 7, 8, 9, 10, 11, 12];

// ===== LS / draft helpers =====

function _getLsKey() {
  const uid = getEffectiveUid() || 'anon';
  return 'm_manual_draft_' + uid;
}

function _newEmptyMatrix() {
  return Array(13).fill(null).map(() => Array(9).fill(null));
}

function _initBaseline() {
  let baseline = null;
  try {
    if (window.__userData && window.__userData.manualDataJson) {
      const arr = JSON.parse(window.__userData.manualDataJson);
      if (Array.isArray(arr) && arr.length === 13) baseline = arr;
    }
  } catch (e) {}
  if (!baseline) baseline = _newEmptyMatrix();
  _firestoreBaseline = baseline;
}

// v1.7 階段 A：mount 不讀 LS，永遠用 firestore baseline 當 _manualDraft
// same-session 切 tab 用既有 _manualDraft；cross-session（重整）→ 重新初始化
function _loadManualDraft() {
  _initBaseline();
  if (!_draftInitialized) {
    _manualDraft = JSON.parse(JSON.stringify(_firestoreBaseline));
    _draftInitialized = true;
    // 清 LS 殘留
    try { localStorage.removeItem(_getLsKey()); } catch (e) {}
  }
}

function _hasLocalDraft() {
  try { return !!localStorage.getItem(_getLsKey()); } catch (e) { return false; }
}

function _saveManualDraft() {
  try { localStorage.setItem(_getLsKey(), JSON.stringify(_manualDraft)); } catch (e) {}
}

function _markDirty() {
  _saveManualDraft();
  setSaveStatus('dirty');
}

function _countAnswered(di) {
  if (!_manualDraft || !_manualDraft[di]) return 0;
  return _manualDraft[di].filter(v => v === 'A' || v === 'B').length;
}

// ===== exports for m_main.js =====

export function mountManual(container) {
  _container = container;
  // v1.7 階段 8：每次進手動輸入 tab 強制回到「輸入」view（不讀 LS）
  // v1.7 階段 12+：once LS 例外（報告 tab 卡片點擊時 set）
  _manualSubview = 'input';
  try {
    const once = localStorage.getItem('m_manual_view_once');
    if (once === 'input' || once === 'overview' || once === 'sens') {
      _manualSubview = once;
      localStorage.removeItem('m_manual_view_once');
    }
  } catch (e) {}
  // 維度 tile 展開狀態仍從 LS 讀（user 上次展開哪個維度）
  try {
    const savedDim = localStorage.getItem(LS_DIM_IDX);
    if (savedDim !== null && savedDim !== 'null') {
      const n = parseInt(savedDim, 10);
      if (!isNaN(n) && n >= 0 && n < 13) _manualDimIdx = n;
    }
  } catch (e) {}
  _loadManualDraft();
  _baselineFingerprintAtMount = JSON.stringify(_firestoreBaseline);
  _render();
  // mount 時必為 saved（_draft = firestore baseline，無 LS 殘留）；user 改才轉 dirty
  setSaveStatus('saved');
  // 綁儲存按鈕（覆蓋 m_input.js 的綁定）
  const saveBtn = document.getElementById('m-save-btn');
  if (saveBtn) saveBtn.onclick = handleManualSave;

  // v1.7 階段 A：背景 refresh firestore user doc（cross-device sync）
  // 改用 saveStatus 判斷：user 沒在編輯 → 無條件用 firestore 覆蓋
  refreshUserData().then((ok) => {
    if (!_container || !ok) return;
    const status = getSaveStatus();
    if (status === 'dirty' || status === 'saving') {
      debugLog('[Sync]', 'm_manual：skip override (user editing)');
      return;
    }
    const ud = window.__userData || {};
    let newBaseline = null;
    try {
      if (ud.manualDataJson) {
        const arr = JSON.parse(ud.manualDataJson);
        if (Array.isArray(arr) && arr.length === 13) newBaseline = arr;
      }
    } catch (e) {}
    if (!newBaseline) newBaseline = _newEmptyMatrix();
    _firestoreBaseline = newBaseline;
    _manualDraft = JSON.parse(JSON.stringify(newBaseline));
    _baselineFingerprintAtMount = JSON.stringify(newBaseline);
    try { localStorage.removeItem(_getLsKey()); } catch (e) {}
    setSaveStatus('saved');
    debugLog('[Sync]', 'm_manual：force override with firestore');
    _render();
  });
}

export function unmountManual() {
  if (_container) _container.innerHTML = '';
  _container = null;
}

export function getManualDirty() {
  return _hasLocalDraft();
}

export function discardManualDraft() {
  try { localStorage.removeItem(_getLsKey()); } catch (e) {}
  if (_firestoreBaseline) {
    _manualDraft = JSON.parse(JSON.stringify(_firestoreBaseline));
  } else {
    _manualDraft = _newEmptyMatrix();
  }
  setSaveStatus('saved');
}

// ===== save handler =====

async function handleManualSave() {
  if (_isSavingManual) return;
  _isSavingManual = true;
  setSaveStatus('saving');
  try {
    const uid = getEffectiveUid();
    if (!uid) throw new Error('no auth user');
    const manualJsonStr = JSON.stringify(_manualDraft);
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      manualDataJson: manualJsonStr,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    if (!window.__userData) window.__userData = {};
    window.__userData.manualDataJson = manualJsonStr;
    try { localStorage.removeItem(_getLsKey()); } catch (e) {}
    _firestoreBaseline = JSON.parse(JSON.stringify(_manualDraft));
    setSaveStatus('saved');
    // 同步首頁手動進度（13 維度 fill 數字）
    try { updateHomeProgress(); } catch (e) {}
  } catch (e) {
    debugLog('[m_manual]', '手動報告儲存失敗', e && e.message ? e.message : e);
    setSaveStatus('error');
  } finally {
    _isSavingManual = false;
  }
}

// ===== PNG export =====

async function exportManualPng(btn) {
  await generatePng({
    srcData: _manualDraft,
    drawOpts: { checkComplete: true },
    filenameSuffix: '_手動',
    btn: btn
  });
}

// ===== render =====

function _render() {
  if (!_container) return;
  // sens view 隱藏儲存按鈕（純看不寫）；其他 view 顯示
  const saveZone = document.getElementById('m-save-zone');
  if (saveZone) saveZone.classList.toggle('is-hidden', _manualSubview === 'sens');
  _container.innerHTML = _renderManualInput();
  _bindEvents();
}

function _renderManualInput() {
  // v1.7 階段 8：上方 segmented 三個 tab（輸入 / 報告 / 參數分析）
  const seg = SUBMODES.map(t =>
    `<button class="m-seg-btn ${_manualSubview === t.key ? 'm-seg-active' : ''}" data-mview="${t.key}">${t.label}</button>`
  ).join('');
  // v1.7 階段 11：頁面頂端 hint + segmented（拿掉 m-manual-view-bar wrapper，跟部位觀察 segmented 寬度一致）
  const viewToggle = `<div class="m-page-hint">直接輸入13維度的動/靜，產生報告</div><div class="m-segmented" role="tablist">${seg}</div>`;
  let body;
  if (_manualSubview === 'sens') {
    body = `<div class="m-sens-body">${renderManualSens(_manualDraft)}</div>`;
  } else if (_manualSubview === 'overview') {
    // v1.7 階段 14：流年參考搬到報告 tab，這裡不再顯示
    body = `${_renderCoeffSummary()}${_chartsHtml()}${_renderManualPngRow()}`;
  } else {
    body = `
      ${_renderDimRow(DIM_ROW_1_IDX, 6)}
      ${_renderDimRow(DIM_ROW_2_IDX, 7)}
      ${_manualDimIdx !== null ? _renderDimPanel(_manualDimIdx) : ''}
      ${_renderClearAllRow()}
    `;
  }
  return `${viewToggle}${body}`;
}

function _renderClearAllRow() {
  return `
    <div class="m-manual-clear-row">
      <button class="m-manual-clear-btn m-manual-clear-btn-all" data-mclear-all="1">清除全部填答</button>
    </div>
  `;
}

// v1.7 階段 11：renderCoeffSummary export — 給 m_manual + m_report.js auto view 共用
// 接收 matrix (13×9 'A'/'B'/null)，render 5 段橫向小結卡（4 個 dim group + 1 個跨群組總）
// 13 維度個別 PNG 背景色（同步桌機 report.js dimBg）
const DIM_BG = [
  '#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
  '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'
];
export function renderCoeffSummary(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 13) {
    matrix = Array(13).fill(null).map(() => Array(9).fill(null));
  }
  // 對齊桌機 report.js dimComplete 邏輯：9 格全填動或靜才算完成
  const _dimComplete = (di) => {
    for (let pi = 0; pi < 9; pi++) {
      if (matrix[di][pi] !== 'A' && matrix[di][pi] !== 'B') return false;
    }
    return true;
  };
  const _dimCoeff = (di) => {
    if (!_dimComplete(di)) return null;
    const r = calcDim(matrix, di);
    return r === null ? null : r.coeff.toFixed(2);
  };
  const _groupCoeff = (ids) => {
    const allFilled = ids.every(di => _dimComplete(di));
    return allFilled ? avgCoeff(matrix, ids) : null;
  };
  const boss = _groupCoeff([0,1,2]);
  const mgr  = _groupCoeff([3,4,5]);
  const pre  = _groupCoeff([0,1,2,3,4,5]);
  const luck = _groupCoeff([6,7,8]);
  const post = _groupCoeff([9,10,11,12]);
  const total = _groupCoeff([0,1,2,3,4,5,6,7,8,9,10,11,12]);
  const renderDim = (di) => {
    const v = _dimCoeff(di);
    const dim = DIMS[di];
    // 判斷主導字 + 主導類型（靜/動），用來在維度名底下加底線
    let dominantChar = null;
    let dominantType = null;
    if (v !== null) {
      const r = calcDim(matrix, di);
      if (r) {
        if (r.a > r.b) { dominantChar = dim.a; dominantType = dim.aT; }
        else if (r.b > r.a) { dominantChar = dim.b; dominantType = dim.bT; }
      }
    }
    const nameHtml = [...dim.dn].map(ch => {
      if (ch === dominantChar) {
        const cls = dominantType === '靜' ? 'is-jing' : 'is-dong';
        return `<span class="m-coeff-dim-char ${cls}">${ch}</span>`;
      }
      return `<span class="m-coeff-dim-char">${ch}</span>`;
    }).join('');
    const valHtml = v === null
      ? `<span class="m-coeff-dim-val is-empty">—</span>`
      : `<span class="m-coeff-dim-val">${v}</span>`;
    return `<div class="m-coeff-dim" style="background:${DIM_BG[di]}"><span class="m-coeff-dim-name">${nameHtml}</span>${valHtml}</div>`;
  };
  const renderGroupCell = (label, val, bgVar) => {
    const valHtml = val === null
      ? `<span class="m-coeff-dim-val is-empty">—</span>`
      : `<span class="m-coeff-dim-val">${val}</span>`;
    return `<div class="m-coeff-dim" style="background:${bgVar}"><span class="m-coeff-dim-name">${label}</span>${valHtml}</div>`;
  };
  const renderTotal = (label, val) => {
    const display = val === null ? '—' : val;
    return `<div class="m-coeff-total"><span class="m-coeff-total-label">${label}</span><span class="m-coeff-total-val">${display}</span></div>`;
  };
  return `
    <div class="m-coeff-summary">
      <div class="m-coeff-row is-boss">
        ${renderDim(0)}${renderDim(1)}${renderDim(2)}
        ${renderTotal('老闆係數', boss)}
      </div>
      <div class="m-coeff-row is-mgr">
        ${renderDim(3)}${renderDim(4)}${renderDim(5)}
        ${renderTotal('主管係數', mgr)}
      </div>
      <div class="m-coeff-row is-luck">
        ${renderDim(6)}${renderDim(7)}${renderDim(8)}
        ${renderTotal('運氣係數', luck)}
      </div>
      <div class="m-coeff-row is-post">
        ${renderDim(9)}${renderDim(10)}${renderDim(11)}${renderDim(12)}
        ${renderTotal('後天係數', post)}
      </div>
      <div class="m-coeff-row is-total">
        ${renderGroupCell('先天', pre, 'var(--grp-pre)')}${renderGroupCell('運氣', luck, 'var(--grp-luck)')}${renderGroupCell('後天', post, 'var(--grp-post)')}
        ${renderTotal('總係數', total)}
      </div>
    </div>
  `;
}
function _renderCoeffSummary() {
  return renderCoeffSummary(_manualDraft);
}

// 手機手動報告：係數總表下方接 報告圖(radar2_m) + 總動靜（與自動報告共用 builder）
function _chartsHtml() {
  try {
    var m = _manualDraft;
    if (!Array.isArray(m) || m.length !== 13) return '';
    var all = [0,1,2,3,4,5,6,7,8,9,10,11,12];
    var dimSFrac = [], dimCoeffArr = [];
    for (var i = 0; i < 13; i++) {
      var s = 0, d = 0;
      for (var p = 0; p < 9; p++) { var vv = m[i] && m[i][p]; if (vv === 'A' || vv === 'B') { var t = (vv === 'A') ? DIMS[i].aT : DIMS[i].bT; if (t === '靜') s++; else d++; } }
      dimSFrac.push((s + d) > 0 ? s / (s + d) : 0.5);
      var rc = calcDim(m, i); dimCoeffArr.push(rc && typeof rc.coeff === 'number' ? rc.coeff : 0);
    }
    var radar2 = buildRadar2MSVG({
      dimSFrac: dimSFrac, dimCoeff: dimCoeffArr,
      luckV: avgCoeff(m,[6,7,8])||0, postV: avgCoeff(m,[9,10,11,12])||0,
      preV: avgCoeff(m,[0,1,2,3,4,5])||0, totV: avgCoeff(m,all)||0
    });
    var partD = [], partN = [];
    for (var pi = 0; pi < 9; pi++) { var pd = 0, pn = 0; for (var di = 0; di < 13; di++) { var v = m[di] && m[di][pi]; if (v === 'A' || v === 'B') { pn++; var tp = (v === 'A') ? DIMS[di].aT : DIMS[di].bT; if (tp !== '靜') pd++; } } partD.push(pd); partN.push(pn); }
    var sd = buildSDSVG({ partD: partD, partN: partN, barH: 20, nameFs: 16, numFs: 13 });
    return '<div style="padding:6px 12px 0">' + radar2 + '<div style="height:14px"></div>' + sd + '</div>';
  } catch (e) { return ''; }
}

function _renderManualPngRow() {
  return `
    <div class="m-report-link-wrap" style="padding:20px 16px 8px">
      <button class="m-report-link-btn" data-mpng="1">產生詳盡報告（手動版PNG）</button>
      <div class="m-report-link-tip">未填完維度／係數會顯示「未填完」</div>
    </div>
  `;
}

// v1.7 階段 11：詳盡報告 PNG 預覽縮圖（inline SVG mockup 模擬 PNG 結構）
export function renderPngPreview() {
  return `
    <div class="m-png-preview">
      <svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width="200" height="120" fill="#f7f4ef" rx="4"/>
        <rect x="6" y="5" width="40" height="5" fill="#3a3228"/>
        <rect x="6" y="14" width="88" height="6" fill="#8E4B50"/>
        <rect x="96" y="14" width="44" height="6" fill="#4C6E78"/>
        <rect x="142" y="14" width="52" height="6" fill="#7B7082"/>
        <g opacity="0.7">
          <rect x="6" y="22" width="14" height="74" fill="#D6E4CC"/>
          <rect x="22" y="22" width="14" height="74" fill="#C8DCD8"/>
          <rect x="38" y="22" width="14" height="74" fill="#E2DDD5"/>
          <rect x="54" y="22" width="14" height="74" fill="#F0DECA"/>
          <rect x="70" y="22" width="14" height="74" fill="#E8D2D8"/>
          <rect x="86" y="22" width="14" height="74" fill="#EDE4C8"/>
          <rect x="102" y="22" width="14" height="74" fill="#CEDDE8"/>
          <rect x="118" y="22" width="14" height="74" fill="#DDD4E4"/>
          <rect x="134" y="22" width="14" height="74" fill="#D2DDD6"/>
          <rect x="150" y="22" width="11" height="74" fill="#D4E2CF"/>
          <rect x="163" y="22" width="11" height="74" fill="#DED5DF"/>
          <rect x="176" y="22" width="11" height="74" fill="#CADDD8"/>
          <rect x="189" y="22" width="5" height="74" fill="#CDDAE6"/>
        </g>
        <rect x="6" y="100" width="44" height="6" fill="#8E4B50"/>
        <rect x="52" y="100" width="34" height="6" fill="#8C6B4A"/>
        <rect x="6" y="108" width="58" height="6" fill="#8E4B50" opacity="0.85"/>
        <rect x="66" y="108" width="40" height="6" fill="#4C6E78" opacity="0.85"/>
        <rect x="108" y="108" width="46" height="6" fill="#7B7082" opacity="0.85"/>
        <rect x="156" y="108" width="38" height="6" fill="#3C3C40"/>
      </svg>
    </div>
  `;
}

function _renderManualOverview() {
  // 9 列（部位）× 13 欄（維度）矩陣 — 沿用桌機兵法報告版型 + 跨維度分組 header
  let html = '';
  html += `<div class="m-manual-cell is-corner" style="grid-row:1;grid-column:1"></div>`;
  html += `<div class="m-manual-grp m-manual-grp-pre" style="grid-row:1;grid-column:2/span 6">先天指數</div>`;
  html += `<div class="m-manual-grp m-manual-grp-luck" style="grid-row:1;grid-column:8/span 3">運氣指數</div>`;
  html += `<div class="m-manual-grp m-manual-grp-post" style="grid-row:1;grid-column:11/span 4">後天指數</div>`;
  html += `<div class="m-manual-cell is-corner" style="grid-row:2;grid-column:1"></div>`;
  html += `<div class="m-manual-subgrp m-manual-subgrp-boss" style="grid-row:2;grid-column:2/span 3">老闆指數</div>`;
  html += `<div class="m-manual-subgrp m-manual-subgrp-mgr" style="grid-row:2;grid-column:5/span 3">主管指數</div>`;
  html += `<div class="m-manual-spacer" style="grid-row:2;grid-column:8/span 7"></div>`;
  html += `<div class="m-manual-cell is-corner" style="grid-row:3;grid-column:1"></div>`;
  for (let di = 0; di < 13; di++) {
    // 按群組染色：0-2 老闆、3-5 主管、6-8 運氣、9-12 後天
    let groupCls = '';
    if (di <= 2) groupCls = 'm-grp-col-boss';
    else if (di <= 5) groupCls = 'm-grp-col-mgr';
    else if (di <= 8) groupCls = 'm-grp-col-luck';
    else groupCls = 'm-grp-col-post';
    html += `<div class="m-manual-cell is-col-header ${groupCls}" style="grid-row:3;grid-column:${di + 2}">${DIMS[di].dn}</div>`;
  }
  for (let pi = 0; pi < 9; pi++) {
    const row = pi + 4;
    html += `<div class="m-manual-cell is-row-header" style="grid-row:${row};grid-column:1">${PART_LABELS[pi]}</div>`;
    for (let di = 0; di < 13; di++) {
      const v = _manualDraft[di][pi];
      let txt = '—', cls = 'is-empty';
      if (v === 'A') { txt = DIMS[di].a; cls = DIMS[di].aT === '靜' ? 'is-jing' : 'is-dong'; }
      else if (v === 'B') { txt = DIMS[di].b; cls = DIMS[di].bT === '靜' ? 'is-jing' : 'is-dong'; }
      // 群組 tint（強色 is-jing/is-dong CSS :not 自動排除）
      let grpCls = '';
      if (di <= 2) grpCls = 'm-grp-cell-boss';
      else if (di <= 5) grpCls = 'm-grp-cell-mgr';
      else if (di <= 8) grpCls = 'm-grp-cell-luck';
      else grpCls = 'm-grp-cell-post';
      html += `<div class="m-manual-cell ${grpCls} ${cls}" style="grid-row:${row};grid-column:${di + 2}">${txt}</div>`;
    }
  }
  return `
    <div class="m-manual-overview-wrap">
      <div class="m-manual-overview-grid">${html}</div>
    </div>
  `;
}

function _renderDimRow(dimIdxList, n) {
  const tiles = dimIdxList.map(di => {
    const answered = _countAnswered(di);
    const isOpen = di === _manualDimIdx;
    const todo = answered < 9;
    let cls = 'm-tile m-dim-tile';
    if (isOpen) cls += ' m-tile-open';
    if (todo) cls += ' m-dim-tile-todo';
    // 群組色（文字色）：0-2 老闆、3-5 主管、6-8 運氣、9-12 後天
    if (di <= 2) cls += ' m-grp-tile-boss';
    else if (di <= 5) cls += ' m-grp-tile-mgr';
    else if (di <= 8) cls += ' m-grp-tile-luck';
    else cls += ' m-grp-tile-post';
    return `
      <button class="${cls}" data-mdim="${di}">
        <span class="m-tile-label">${DIMS[di].dn}</span>
        <span class="m-tile-badge">${answered}/9</span>
      </button>
    `;
  }).join('');
  return `<div class="m-dim-row m-dim-row-${n}">${tiles}</div>`;
}

function _renderDimPanel(di) {
  const dim = DIMS[di];
  const answered = _countAnswered(di);
  let rows = '';
  for (let pi = 0; pi < 9; pi++) {
    rows += _renderManualRow(di, pi);
  }
  return `
    <div class="m-panel m-dim-panel">
      <div class="m-dim-panel-head">
        <span class="m-dim-title-name">${dim.dn}</span>
        <span class="m-dim-title-view">${dim.view}</span>
        <span class="m-dim-title-spacer"></span>
        <span class="m-dim-title-progress">${answered}/9</span>
      </div>
      <div class="m-manual-rows">${rows}</div>
    </div>
  `;
}

function _esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// ===== P1：條件式自動算動靜 =====
// _manualCond[`${di}_${pi}`] = { 敘述分組名: '是'|'否' }；獨立於部位觀察答案（記憶體，P2 再持久化）
let _manualCond = {};
let _condExpanded = {};  // `${di}_${pi}` -> bool（該格條件面板是否展開）

// ===== 本頁獨立條件（不動全站主規則）：目前僅「形勢」維度(di=0) 的 頭/中停/下停 =====
// 形=A(靜)、勢=B(動)；refs 由同維度既有答案推導（=A 計入「形」權重），items 由使用者勾符合/不符
// 部位索引：頭0 上停1 中停2 下停3 耳4 眉5 眼6 鼻7 口8
const LOCAL_COND = {
  0: {
    0: { items: [{ key: '頂骨', w: 2 }, { key: '枕骨', w: 1 }, { key: '華陽骨', w: 2 }], threshold: 3, total: 5 },
    2: { refNote: '參考眉眼鼻', refs: [{ label: '眉', part: 5, w: 2 }, { label: '眼', part: 6, w: 2 }, { label: '鼻', part: 7, w: 1 }], items: [{ key: '顴', w: 2 }], threshold: 4, total: 7 },
    3: { refNote: '參考口', refs: [{ label: '口', part: 8, w: 1 }], items: [{ key: '人中', w: 1 }, { key: '地閣', w: 1 }, { key: '頤', w: 2 }], threshold: 3, total: 5 },
  },
};
let _localCond = {};  // `${di}_${pi}` -> { itemKey: '符合'|'不符' }（記憶體，不持久化；算出的結果寫入 _manualDraft 才持久化）
function _localCondSpec(di, pi) { return (LOCAL_COND[di] && LOCAL_COND[di][pi]) || null; }
// 算出該格的形(A)/勢(B)；items 需全勾才回 'A'/'B'，否則 null；無此格本頁條件回 undefined
function _localCondResultOf(di, pi) {
  const spec = _localCondSpec(di, pi);
  if (!spec) return undefined;
  const ans = _localCond[`${di}_${pi}`] || {};
  for (let i = 0; i < spec.items.length; i++) { const a = ans[spec.items[i].key]; if (a !== '符合' && a !== '不符') return null; }
  let formW = 0;
  (spec.refs || []).forEach(r => { if (_manualDraft[di] && _manualDraft[di][r.part] === 'A') formW += r.w; });
  spec.items.forEach(it => { if (ans[it.key] === '符合') formW += it.w; });
  return (formW >= spec.threshold) ? 'A' : 'B';  // dim0：形=A
}
// 部位答案改變時，重算依賴它的衍生格（中停/下停 參考 眉眼鼻/口）
function _recomputeDerived(di) {
  if (!LOCAL_COND[di]) return;
  [2, 3].forEach(pi => {
    if (!_localCondSpec(di, pi)) return;
    const r = _localCondResultOf(di, pi);
    if (r === 'A' || r === 'B') _manualDraft[di][pi] = r;
  });
}

function _collectLeaves(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.ref !== undefined) { out.push({ ref: node.ref, match: node.match }); return; }
  ['items', 'item', 'each', 'rule'].forEach(k => {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => _collectLeaves(c, out));
    else if (v && typeof v === 'object') _collectLeaves(v, out);
  });
}
// 取某 (維度,部位) 的敘述分組（label + 該組所有 leaf 的 ref/match）
function _partGroups(di, pi) {
  const dr = DIM_RULES && DIM_RULES[di] && DIM_RULES[di].parts;
  const rule = dr && dr[PART_LABELS[pi]];
  if (!rule) return [];
  const groups = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.group) {
      const leaves = []; _collectLeaves(node, leaves);
      groups.push({ label: node.group, leaves });
      return;
    }
    ['items', 'item', 'each', 'rule'].forEach(k => {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    });
  })(rule);
  return groups;
}
// 從該格條件是/否 → 合成答案 → evaluatePart 算出 'A'/'B'；未填完回 null；無條件(容器)回 undefined
function _condResultOf(di, pi) {
  const groups = _partGroups(di, pi);
  if (!groups.length) return undefined;
  const ans = _manualCond[`${di}_${pi}`] || {};
  const obs = {};
  let allAnswered = true;
  groups.forEach(g => {
    const a = ans[g.label];
    if (a !== '是' && a !== '否') allAnswered = false;
    g.leaves.forEach(lf => {
      const mv = Array.isArray(lf.match) ? lf.match[0] : lf.match;
      obs[lf.ref] = (a === '是') ? mv : ' NO';  // 否：給不符合的哨兵值（leaf 為 false 但「已答」）
    });
  });
  if (!allAnswered) return null;
  const rule = DIM_RULES[di].parts[PART_LABELS[pi]];
  const res = evaluatePart(rule, obs, {});
  if (!res || res.result == null) return null;
  const posChar = DIM_RULES[di].positive;
  const posIsA = (posChar === DIMS[di].a);
  return (res.result === 'positive') ? (posIsA ? 'A' : 'B') : (posIsA ? 'B' : 'A');
}

function _renderManualRow(di, pi) {
  const dim = DIMS[di];
  const v = _manualDraft[di][pi];
  const aIsJing = dim.aT === '靜';
  const jingVal = aIsJing ? 'A' : 'B';
  const dongVal = aIsJing ? 'B' : 'A';
  const isJing = v === jingVal;
  const isDong = v === dongVal;
  const isEmpty = v === null;
  // v1.8：取消中間「形/勢色塊」，改放「條件」按鈕（點開向下展開、再點收回），靠下方靜/動切換鈕看結果
  // 條件來源：master 規則組(_partGroups) 或 本頁獨立條件(_localCondSpec)
  const groups = _partGroups(di, pi);
  const local = _localCondSpec(di, pi);
  const hasCond = groups.length > 0 || !!local;
  const expanded = !!_condExpanded[`${di}_${pi}`];
  const condBtn = hasCond
    ? `<button class="m-manual-cond-btn-mid ${expanded ? 'is-open' : ''}" data-mcond="${di}_${pi}">條件${expanded ? '▴' : '▾'}</button>`
    : `<span class="m-manual-row-midblank"></span>`;
  // 條件面板內容
  let panelInner = '';
  if (expanded && groups.length) {
    const ans = _manualCond[`${di}_${pi}`] || {};
    panelInner = groups.map(g => {
      const a = ans[g.label];
      return `<div class="m-manual-cond-row">
          <span class="m-manual-cond-label">${_esc(g.label)}</span>
          <span class="m-manual-cond-yn">
            <button class="m-manual-cond-yn-btn yes ${a === '是' ? 'is-active' : ''}" data-mcd="${di}" data-mcp="${pi}" data-mcg="${_esc(g.label)}" data-mcv="是">符合</button>
            <button class="m-manual-cond-yn-btn no ${a === '否' ? 'is-active' : ''}" data-mcd="${di}" data-mcp="${pi}" data-mcg="${_esc(g.label)}" data-mcv="否">不符</button>
          </span>
        </div>`;
    }).join('');
  } else if (expanded && local) {
    const lans = _localCond[`${di}_${pi}`] || {};
    const formula = [...(local.refs || []).map(r => r.label + r.w), ...local.items.map(it => it.key + it.w)].join(' ');
    panelInner =
      (local.refNote ? `<div class="m-manual-cond-ref">${_esc(local.refNote)}（依既有答案）</div>` : '')
      + local.items.map(it => {
        const a = lans[it.key];
        return `<div class="m-manual-cond-row">
          <span class="m-manual-cond-label">${_esc(it.key)}<span class="m-manual-cond-w">×${it.w}</span></span>
          <span class="m-manual-cond-yn">
            <button class="m-manual-cond-yn-btn yes ${a === '符合' ? 'is-active' : ''}" data-mlcd="${di}" data-mlcp="${pi}" data-mlck="${_esc(it.key)}" data-mlcv="符合">符合</button>
            <button class="m-manual-cond-yn-btn no ${a === '不符' ? 'is-active' : ''}" data-mlcd="${di}" data-mlcp="${pi}" data-mlck="${_esc(it.key)}" data-mlcv="不符">不符</button>
          </span>
        </div>`;
      }).join('')
      + `<div class="m-manual-cond-formula">${_esc(formula)}　${local.threshold}/${local.total} 符合即為${_esc(dim.a)}（否則${_esc(dim.b)}）</div>`;
  }
  const condPanel = (hasCond && expanded) ? `<div class="m-manual-cond-panel">${panelInner}</div>` : '';
  return `
    <div class="m-manual-row-wrap">
      <div class="m-manual-row">
        <div class="m-manual-row-part">${PART_LABELS[pi]}</div>
        ${condBtn}
        <div class="m-manual-row-switch">
          <button class="m-manual-sw m-manual-sw-jing ${isJing ? 'is-active' : ''}" data-msw="${di}_${pi}_${jingVal}">靜</button>
          <button class="m-manual-sw m-manual-sw-empty ${isEmpty ? 'is-active' : ''}" data-msw="${di}_${pi}_">—</button>
          <button class="m-manual-sw m-manual-sw-dong ${isDong ? 'is-active' : ''}" data-msw="${di}_${pi}_${dongVal}">動</button>
        </div>
      </div>
      ${condPanel}
    </div>
  `;
}

function _bindEvents() {
  _container.querySelectorAll('[data-mview]').forEach(btn => {
    btn.addEventListener('click', () => {
      _manualSubview = btn.dataset.mview;
      try { localStorage.setItem(LS_VIEW, _manualSubview); } catch (e) {}
      _render();
    });
  });
  _container.querySelectorAll('[data-mpng]').forEach(btn => {
    btn.addEventListener('click', () => exportManualPng(btn));
  });
  _container.querySelectorAll('[data-mclear-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('確定清除全部 13 維度 × 9 部位的填答嗎？')) return;
      _manualDraft = _newEmptyMatrix();
      _markDirty();
      _render();
    });
  });
  _container.querySelectorAll('[data-mdim]').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = parseInt(btn.dataset.mdim, 10);
      _manualDimIdx = (_manualDimIdx === di) ? null : di;
      try {
        localStorage.setItem(LS_DIM_IDX, _manualDimIdx === null ? 'null' : String(_manualDimIdx));
      } catch (e) {}
      _render();
    });
  });
  _container.querySelectorAll('[data-msw]').forEach(btn => {
    btn.addEventListener('click', () => {
      const parts = btn.dataset.msw.split('_'); // "di_pi_val" — val 可能為空字串
      const di = parseInt(parts[0], 10);
      const pi = parseInt(parts[1], 10);
      const val = parts[2] || null;
      _manualDraft[di][pi] = val === 'A' || val === 'B' ? val : null;
      _recomputeDerived(di); // 中停/下停 參考 眉眼鼻/口，部位改變時連動重算
      _markDirty();
      _render();
    });
  });
  _container.querySelectorAll('[data-mclear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = parseInt(btn.dataset.mclear, 10);
      if (!confirm(`確定清空維度「${DIMS[di].dn}」9 個部位的填答嗎？`)) return;
      _manualDraft[di] = Array(9).fill(null);
      _markDirty();
      _render();
    });
  });
  // P1：展開/收合條件面板
  _container.querySelectorAll('[data-mcond]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.mcond;
      _condExpanded[key] = !_condExpanded[key];
      _render();
    });
  });
  // P1：勾條件是/否 → 更新答案 → 自動算動靜填格（可被手動鈕覆蓋）
  _container.querySelectorAll('[data-mcg]').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = parseInt(btn.dataset.mcd, 10);
      const pi = parseInt(btn.dataset.mcp, 10);
      const gl = btn.dataset.mcg;
      const val = btn.dataset.mcv;
      const k = `${di}_${pi}`;
      if (!_manualCond[k]) _manualCond[k] = {};
      _manualCond[k][gl] = (_manualCond[k][gl] === val) ? null : val; // 再點同一個=取消
      const computed = _condResultOf(di, pi);
      if (computed === 'A' || computed === 'B') {
        _manualDraft[di][pi] = computed;
        _markDirty();
      }
      _render();
    });
  });
  // v1.8：本頁獨立條件 符合/不符 → 自動算形/勢填格（可被手動鈕覆蓋）
  _container.querySelectorAll('[data-mlck]').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = parseInt(btn.dataset.mlcd, 10);
      const pi = parseInt(btn.dataset.mlcp, 10);
      const key = btn.dataset.mlck;
      const val = btn.dataset.mlcv;
      const k = `${di}_${pi}`;
      if (!_localCond[k]) _localCond[k] = {};
      _localCond[k][key] = (_localCond[k][key] === val) ? null : val; // 再點同一個=取消
      const computed = _localCondResultOf(di, pi);
      if (computed === 'A' || computed === 'B') {
        _manualDraft[di][pi] = computed;
        _markDirty();
      }
      _render();
    });
  });
}

// v1.7 階段 8：拿掉 _enterSens / _exitSens / _renderSensView
// 重要參數分析改成 segmented 第三個 tab（_manualSubview === 'sens'）內部 render
