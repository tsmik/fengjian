// ============================================================
// deploy-retrigger: 2026-06-03 (重新觸發 Cloudflare Pages staging build)
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
import { chartsBlockHtml, exportMobileCharts } from './m_report.js';
import { buildManualReportHtml } from './manual_report.js';
import { evaluatePart } from './rule_engine.js';
import { auth, db, debugLog, refreshUserData, getEffectiveUid, getActiveCaseId, getCurrentDocRef } from './m_main.js';
import { setSaveStatus, getSaveStatus, ensureDimRulesLoaded } from './m_input.js';
import { updateHomeProgress } from './m_home.js';
import { generatePng } from './m_report.js';
import { renderManualSens } from './m_sens.js';
import { mountBoard, unmountBoard } from './m_board.js';
import { setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const LS_DIM_IDX = 'm_manual_dim_idx';
const LS_VIEW = 'm_manual_view';

let _container = null;
// v1.7 階段 8：拿掉 _view，純用 _manualSubview，segmented 三個 tab
let _manualSubview = 'board';  // 'board'(課程) | 'input'(手動評分) | 'overview'(報告) | 'sens'(參數分析,暫不在 segmented)

// 上課 tab 上方 segmented：課程(板書) / 手動評分 / 報告。
// 參數分析(sens) 暫不列入（之後搬到「我的」），但 renderManualSens / 'sens' view 邏輯保留。
const SUBMODES = [
  { key: 'board',    label: '課程' },
  { key: 'input',    label: '自我評分' },
  { key: 'overview', label: '兵法報告' },
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
  const caseId = getActiveCaseId();
  return 'm_manual_draft_' + uid + (caseId ? '_' + caseId : '');
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
  // 每次進上課 tab 預設回到「課程」(板書)；once LS 例外（報告卡片點擊等指定 view）
  _manualSubview = 'board';
  try {
    const once = localStorage.getItem('m_manual_view_once');
    if (once === 'board' || once === 'input' || once === 'overview' || once === 'sens') {
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
  _loadScaffold();  // A3#2 Stage3：載入鷹架（符合不符/筆記/新增移除/說明）
  _baselineFingerprintAtMount = JSON.stringify(_firestoreBaseline);
  _render();
  // v1.8：mount 即載入主規則，讓 master 條件（上停/耳/眉/眼/鼻/口…）不必先儲存就顯示
  ensureDimRulesLoaded().then(() => { if (_container) _render(); }).catch(() => {});
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
    try { _loadScaffold(); } catch (e) {}  // 跨裝置：一併刷新鷹架
    _render();
  });
}

export function unmountManual() {
  try { unmountBoard(); } catch (e) {}
  if (_container) _container.innerHTML = '';
  _container = null;
}

export function getManualDirty() {
  return _hasLocalDraft();
}

// 給桌機側欄子膠囊用：切換子畫面（課程/自我評分/兵法報告），不重新 mount
export function setManualView(key) {
  if (!key || !_container) return;
  const prev = _manualSubview;
  _manualSubview = key;
  if (prev === 'board' && key !== 'board') { try { unmountBoard(); } catch (e) {} }
  try { localStorage.setItem(LS_VIEW, key); } catch (e) {}
  _render();
}
export function getManualView() { return _manualSubview; }

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
    const userRef = getCurrentDocRef();
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
  // sens / board view 隱藏手動儲存按鈕（board 自己 debounce 存筆記）；其他 view 顯示
  const saveZone = document.getElementById('m-save-zone');
  if (saveZone) saveZone.classList.toggle('is-hidden', _manualSubview === 'sens' || _manualSubview === 'board');
  // #1：重畫前後保留捲動位置 → 點任何鈕（形/勢、符合/不符…）畫面都不會跳動
  const _scroller = (_container.closest && _container.closest('.m-main')) || document.querySelector('.m-main');
  const _keepTop = _scroller ? _scroller.scrollTop : 0;
  _container.innerHTML = _renderManualInput();
  _bindEvents();
  if (_scroller) _scroller.scrollTop = _keepTop;
  if (_manualSubview === 'board') {
    const mount = _container.querySelector('#m-board-mount');
    if (mount) mountBoard(mount);
  }
}

function _renderManualInput() {
  // v1.7 階段 8：上方 segmented 三個 tab（輸入 / 報告 / 參數分析）
  const seg = SUBMODES.map(t =>
    `<button class="m-seg-btn ${_manualSubview === t.key ? 'm-seg-active' : ''}" data-mview="${t.key}">${t.label}</button>`
  ).join('');
  // v1.7 階段 11：頁面頂端 hint + segmented（拿掉 m-manual-view-bar wrapper，跟部位觀察 segmented 寬度一致）
  const hint = '';
  const viewToggle = `${hint ? `<div class="m-page-hint">${hint}</div>` : ''}<div class="m-segmented m-segmented-sub" role="tablist">${seg}</div>`;
  let body;
  if (_manualSubview === 'board') {
    body = `<div id="m-board-mount"></div>`;
  } else if (_manualSubview === 'sens') {
    body = `<div class="m-sens-body">${renderManualSens(_manualDraft)}</div>`;
  } else if (_manualSubview === 'overview') {
    // 兵法報告：完整版（移植自舊桌機 manual.js → manual_report.js）：三大係數表 + 圖表；餵自我評分 _manualDraft
    const _rname = (window.__userData && window.__userData.displayName) || '';
    body = `<div class="m-manual-fullreport">${buildManualReportHtml(_manualDraft, { name: _rname })}</div>${_renderManualPngRow()}`;
  } else {
    body = _renderScoreView();
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
  if (!Array.isArray(_manualDraft) || _manualDraft.length !== 13) return '';
  return chartsBlockHtml(_manualDraft);
}

function _renderManualPngRow() {
  return `
    <div class="m-report-link-wrap" style="padding:20px 16px 8px">
      <button class="m-report-link-btn" data-mpng="1">產生詳盡報告（手動版PNG）</button>
      <button class="m-report-link-btn" data-mcharts="1">產生圖表(PNG)</button>
      <button class="m-report-link-btn" data-mrc="1">產生報告＋圖表</button>
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

// ===== 本頁獨立條件（不動全站主規則）：13 維度的 頭/中停/下停，動態從 admin 規則(DIM_RULES) 產生 =====
// 規則結構＝COUNT{min, items}；每項目可能是：(a) partResult 引用本頁有答案的部位(眉/眼/鼻/口…)→參考、
//   (b) partResult 引用子部位(頂骨/枕骨/華陽骨/顴/人中/地閣/頤)→查該子部位規則的敘述分組、(c) 內嵌 match 條件。
// 權重＝該子部位被引用次數(.L/.R 兩次＝2)；門檻＝COUNT.min；敘述分組＝子部位規則內的 group 標題。
// 計分：該小部位底下敘述分組全符合→計入權重；參考部位＝同維度該部位答案為正極→計入；總和≥門檻→正極(符合)，否則反極。
let _localCond = {};  // `${di}_${pi}` -> { 敘述分組名: '符合'|'不符' }（記憶體，不持久化；算出的結果寫入 _manualDraft 才持久化）
const _LOCAL_PARTS = { 0: '頭', 2: '中停', 3: '下停' };
const _PR_PARTIDX = { '頭': 0, '上停': 1, '中停': 2, '下停': 3, '耳': 4, '眉': 5, '眼': 6, '鼻': 7, '口': 8 };
function _refSubpart(ref) {
  if (!ref) return null;
  const m = String(ref).match(/^([a-z]+)(\d+)/i);
  if (!m) return null;
  const pre = m[1], n = parseInt(m[2], 10);
  if (pre === 'h') { if (n <= 4) return '頂骨'; if (n <= 10) return '枕骨'; if (n <= 13) return '華陽骨'; return '頭骨整體'; }
  return ({ q: '顴', p: '人中', c: '地閣', y: '頤', n: '鼻', m: '口', br: '眉', ey: '眼', er: '耳', e: '上停' })[pre] || null;
}
// 子部位（頂骨/枕骨/華陽骨/顴/人中/地閣/頤）→ 取該部位規則裡的「敘述分組」(group) 標題清單。
// 這些子部位在 admin 規則中是獨立的 part，頭/中停/下停 用 partResult 引用它們；敘述分組存在其 group 節點。
function _subpartCrits(di, subpart) {
  const dr = DIM_RULES && DIM_RULES[di];
  const rule = dr && dr.parts && dr.parts[subpart];
  if (!rule) return [];
  const labels = [], seen = {};
  (function walk(nd) {
    if (!nd || typeof nd !== 'object') return;
    if (nd.group) { if (!seen[nd.group]) { seen[nd.group] = 1; labels.push(nd.group); } return; }
    ['items', 'item', 'each', 'rule'].forEach(k => { const v = nd[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); });
  })(rule);
  if (!labels.length) {  // 無 group 標題時退而取 match 描述
    const lv = []; _collectLeaves(rule, lv);
    lv.forEach(l => { const mv = Array.isArray(l.match) ? l.match.join('或') : l.match; if (mv != null && !seen[mv]) { seen[mv] = 1; labels.push(mv); } });
  }
  return labels;
}
// 一個條件項目 → { subpart, crits[] }（crits 取項目內所有 leaf 的 match 描述；陣列 match 以「或」連）
function _itemCrits(node) {
  const leaves = [];
  (function walk(nd) {
    if (!nd || typeof nd !== 'object') return;
    if (nd.ref !== undefined && nd.match !== undefined) { leaves.push(nd); return; }
    ['items', 'item', 'each', 'rule'].forEach(k => { const v = nd[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); });
  })(node);
  if (!leaves.length) return null;
  const seen = {}, crits = [];
  leaves.forEach(lf => { const mv = Array.isArray(lf.match) ? lf.match.join('或') : lf.match; if (mv != null && !seen[mv]) { seen[mv] = 1; crits.push(mv); } });
  return { subpart: _refSubpart(leaves[0].ref), crits };
}
// 動態產生某 (維度,部位) 的條件規格
function _localCondSpec(di, pi) {
  const partLabel = _LOCAL_PARTS[pi];
  if (!partLabel) return null;
  const dim = DIMS[di] || {};
  const dr = DIM_RULES && DIM_RULES[di];
  const posChar = (dr && dr.positive) || dim.a, negChar = (dr && dr.negative) || dim.b;
  // 解開外層包裝(rule/each/LR)，找到 COUNT 或 AND 節點
  let node = dr && dr.parts && dr.parts[partLabel];
  let guard = 0;
  while (node && guard++ < 6 && node.op !== 'COUNT' && node.op !== 'AND') { node = node.rule || node.each || null; }
  if (!node || !node.items || !node.items.length) {
    // 規則未定義（例如 曲直 中停沒有顴）：中停 仍顯示「顴」標題供之後 admin 補；其餘不顯示
    if (pi === 2) return { partLabel, threshold: 0, total: 0, refs: [], refNote: '', groups: [{ name: '顴', w: 0, crits: [] }], posChar, negChar, empty: true };
    return null;
  }
  const isAnd = (node.op === 'AND'); // AND→全部都要符合
  const refMap = {}, grpMap = {}, grpOrder = [];
  const _addGrp = (sp, crits, inc) => { if (!sp) return; if (!grpMap[sp]) { grpMap[sp] = { name: sp, w: 0, crits: [] }; grpOrder.push(sp); } grpMap[sp].w += inc; crits.forEach(c => { if (grpMap[sp].crits.indexOf(c) < 0) grpMap[sp].crits.push(c); }); };
  node.items.forEach(it => {
    if (it && it.partResult) {
      const base = String(it.partResult).split('.')[0];
      if (_PR_PARTIDX[base] != null) {
        // 引用本頁有獨立答案的部位（眉/眼/鼻/口…）→ 參考既有答案
        if (!refMap[base]) refMap[base] = { label: base, part: _PR_PARTIDX[base], w: 0 };
        refMap[base].w += 1;
      } else {
        // 引用子部位（頂骨/枕骨/華陽骨/顴/人中/地閣/頤）→ 查該子部位規則取敘述分組，當作一組（權重＝被引用次數，如 .L/.R 兩次＝2）
        _addGrp(base, _subpartCrits(di, base), 1);
      }
    } else if (isAnd) {
      // AND：把項目內的葉子再依小部位分組（每小部位最多算 1 權重，全中才達標）
      const lv = []; _collectLeaves(it, lv); const bySub = {};
      lv.forEach(l => { const sp = _refSubpart(l.ref); if (!sp) return; const mv = Array.isArray(l.match) ? l.match.join('或') : l.match; (bySub[sp] = bySub[sp] || []).push(mv); });
      Object.keys(bySub).forEach(sp => _addGrp(sp, bySub[sp], 0));
    } else {
      const ic = _itemCrits(it);
      if (ic && ic.subpart) _addGrp(ic.subpart, ic.crits, 1);
    }
  });
  if (isAnd) grpOrder.forEach(k => { grpMap[k].w = 1; });
  // 中停：即使規則沒有顴條件（例如曲直），也列出「顴」標題（待 admin 補）
  if (pi === 2 && !grpMap['顴']) { grpMap['顴'] = { name: '顴', w: 0, crits: [] }; grpOrder.push('顴'); }
  const refs = Object.keys(refMap).map(k => refMap[k]).filter(r => r.part != null);
  const groups = grpOrder.map(k => grpMap[k]);
  const total = groups.reduce((a, g) => a + g.w, 0) + refs.reduce((a, r) => a + r.w, 0);
  const threshold = (node.op === 'COUNT' && typeof node.min === 'number') ? node.min : total;
  return { partLabel, threshold, total, refs, refNote: refs.length ? '參考' + refs.map(r => r.label).join('') : '', groups, posChar, negChar };
}
// 算出該格的正極/反極（回 'A'/'B'）；所有敘述分組需全勾才回，否則 null；無規則回 undefined
function _localCondResultOf(di, pi) {
  const spec = _localCondSpec(di, pi);
  if (!spec || spec.empty) return undefined;
  const dim = DIMS[di] || {};
  const posVal = (spec.posChar === dim.a) ? 'A' : 'B';   // 正極(符合達標)對應的答案值
  const ans = _localCond[`${di}_${pi}`] || {};
  for (const g of spec.groups) for (const c of g.crits) { const a = ans[c]; if (a !== '符合' && a !== '不符') return null; }
  let posW = 0;
  (spec.refs || []).forEach(r => { if (r.part != null && _manualDraft[di] && _manualDraft[di][r.part] === posVal) posW += r.w; });
  spec.groups.forEach(g => { if (g.crits.length && g.crits.every(c => ans[c] === '符合')) posW += g.w; });
  return (posW >= spec.threshold) ? posVal : (posVal === 'A' ? 'B' : 'A');
}
// 部位答案改變時，重算依賴它的衍生格（中停/下停 參考 眉眼鼻/口）
function _recomputeDerived(di) {
  [2, 3].forEach(pi => {
    const spec = _localCondSpec(di, pi);
    if (!spec || spec.empty) return;
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
    const formula = [...(local.refs || []).map(r => r.label + r.w), ...local.groups.filter(g => g.w).map(g => g.name + g.w)].join(' ');
    panelInner =
      (local.refNote ? `<div class="m-manual-cond-ref">${_esc(local.refNote)}（依既有答案）</div>` : '')
      + local.groups.map(g => {
        const head = `<div class="m-manual-cond-grouphd">${_esc(g.name)}${g.w ? `<span class="m-manual-cond-w">×${g.w}</span>` : ''}</div>`;
        if (!g.crits.length) return head + `<div class="m-manual-cond-row"><span class="m-manual-cond-label" style="color:#a89e92">（此維度規則尚未定義，待 admin 補上）</span></div>`;
        const rows = g.crits.map(c => {
          const a = lans[c];
          return `<div class="m-manual-cond-row">
            <span class="m-manual-cond-label">${_esc(c)}</span>
            <span class="m-manual-cond-yn">
              <button class="m-manual-cond-yn-btn yes ${a === '符合' ? 'is-active' : ''}" data-mlcd="${di}" data-mlcp="${pi}" data-mlck="${_esc(c)}" data-mlcv="符合">符合</button>
              <button class="m-manual-cond-yn-btn no ${a === '不符' ? 'is-active' : ''}" data-mlcd="${di}" data-mlcp="${pi}" data-mlck="${_esc(c)}" data-mlcv="不符">不符</button>
            </span>
          </div>`;
        }).join('');
        return head + rows;
      }).join('')
      + (local.total ? `<div class="m-manual-cond-formula">${_esc(formula)}　${local.threshold}/${local.total} 符合即為${_esc(local.posChar)}（否則${_esc(local.negChar)}）</div>` : '');
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

// ============================================================
// A3 #2 Stage2：v7 手動評分版面（評分在部位欄、條件欄純參考；不自動算動靜）
//   重用 _partGroups（master 規則組）/ _localCondSpec（頭0/中停2/下停3 子部位＋參考）
//   形/勢＝該維度兩極（dim.da/db，跟著維度名走）；存 _manualDraft[di][pi]='A'/'B'，再按取消
// ============================================================
let _scorePartIdx = 0;
let _scoreCondOpen = null;  // 手機版：目前在部位列下方展開條件的部位 idx（手風琴）；null＝全收合
let _svJustOpened = false;  // 只在「展開那一下」播放滑開動畫；面板內後續互動重畫不重播（否則畫面會跳）
function _svIsDesktop() { try { return window.matchMedia('(min-width:1024px)').matches; } catch (e) { return false; } }
// 跨越桌機/手機斷點時，手動評分頁 DOM 結構不同（桌機右側條件欄 vs 手機列內手風琴）→ reflow
let _svLastDesktop = null;
function _svOnResize() {
  if (!_container || _manualSubview !== 'input') return;
  const d = _svIsDesktop();
  if (_svLastDesktop === null) { _svLastDesktop = d; return; }
  if (d !== _svLastDesktop) { _svLastDesktop = d; _render(); }
}
try { window.addEventListener('resize', _svOnResize); } catch (e) {}
let _svFocusKey = null;  // 開筆記/新增框後要自動聚焦的目標（data-noteblur 值 或 'add:'+akey）
function _scoreGrpClass(i) { return i <= 2 ? 'm-sv-grp-boss' : (i <= 5 ? 'm-sv-grp-mgr' : (i <= 8 ? 'm-sv-grp-luck' : 'm-sv-grp-post')); }
function _poleOf(dim, ch) {
  if (ch === dim.a) return { val: 'A', tone: dim.aT === '靜' ? 'jing' : 'dong' };
  return { val: 'B', tone: dim.bT === '靜' ? 'jing' : 'dong' };
}
// 把 local 規格展開成「子部位欄位」清單：權重2＝左右成對(左X/右X)、權重1＝單一(X)。
// 只給中停/下停用（其子部位 眉眼顴頤 才是左右成對；頭的頂骨/華陽骨非左右，不展開）。
// 頭/中停/下停 子部位皆左右成對：權重2＝左右(左X/右X)同一橫列、權重1＝單一(X)一列。
// 回傳「每橫列」陣列：頭=[[左頂骨,右頂骨],[枕骨],[左華陽骨,右華陽骨]]；中停=[[左眉,右眉],[左眼,右眼],[鼻],[左顴,右顴]]；下停=[[口],[人中],[地閣],[左頤,右頤]]
function _expandRows(local) {
  const rows = [];
  const push = (name, w) => { if (w >= 2) rows.push(['左' + name, '右' + name]); else if (w === 1) rows.push([name]); };
  (local.refs || []).forEach(r => push(r.label, r.w));
  local.groups.forEach(g => { if (g.w) push(g.name, g.w); });
  return rows;
}
// 某 (維度,部位) 的條件模型：local（頭/中停/下停 子部位分組＋formula）或 master（規則 groupLabel）
function _scoreCondModel(di, pi) {
  const local = _localCondSpec(di, pi);
  if (local) {
    let crit = '', subRows = [];
    if (local.total) {
      subRows = _expandRows(local);  // 形/勢 bar 仍需左右展開
      // 文字精簡：不再列舉子部位名稱（太長），門檻統一用「符合 N 個（含）以上」
      crit = `${local.total} 個部位，${local.threshold} 個（含）以上即為${local.posChar}（不${local.posChar}則${local.negChar}）`;
    }
    return { kind: 'local', crit, refNote: local.refNote, subRows, groups: local.groups.map(g => ({ title: g.name, w: g.w, crits: g.crits, src: 'local' })) };
  }
  const mg = _partGroups(di, pi);
  if (mg.length) return { kind: 'master', crit: '', refNote: '', groups: [{ title: PART_LABELS[pi], w: 0, crits: mg.map(g => g.label), src: 'master' }] };
  return { kind: 'none', crit: '', refNote: '', groups: [] };
}
function _renderScoreView() {
  let di = _manualDimIdx; if (di == null || di < 0 || di > 12) di = 0;
  const dim = DIMS[di];
  // col1：13 維度（先天/運氣/後天 群組色條）
  const dtile = (i) => `<button class="m-sv-dim ${_scoreGrpClass(i)} ${i === di ? 'is-cur' : ''}" data-mdim="${i}">${DIMS[i].dn}</button>`;
  const dimList = `<div class="m-sv-dimlist"><div class="m-sv-dimrow">${[0,1,2,3,4,5].map(dtile).join('')}</div><div class="m-sv-dimrow">${[6,7,8,9,10,11,12].map(dtile).join('')}</div></div>`;
  // col2：9 部位 + 形/勢評分鈕（跟著維度名 da/db）
  const pa = _poleOf(dim, dim.da), pb = _poleOf(dim, dim.db);
  const desktop = _svIsDesktop();
  const pitem = (pi) => {
    const v = _manualDraft[di][pi];
    const ba = `<button class="m-sv-pole ${v === pa.val ? 'is-' + pa.tone : ''}" data-mpole="${di}_${pi}_${pa.val}">${dim.da}</button>`;
    const bb = `<button class="m-sv-pole ${v === pb.val ? 'is-' + pb.tone : ''}" data-mpole="${di}_${pi}_${pb.val}">${dim.db}</button>`;
    const open = (!desktop && pi === _scoreCondOpen);
    // 手機版：每個部位列帶「條件」鈕，點開在該列下方展開該部位條件（手風琴），再點收起；桌機用右側條件欄不需此鈕
    const condBtn = desktop ? '' : `<button class="m-sv-condbtn ${open ? 'is-open' : ''}" data-msvcond="${pi}" type="button">條件<span class="m-sv-caret">${open ? '▴' : '▾'}</span></button>`;
    const row = `<div class="m-sv-pitem ${(desktop && pi === _scorePartIdx) ? 'is-cur' : ''} ${open ? 'is-open' : ''}" data-mspart="${pi}"><span class="m-sv-pname">${PART_LABELS[pi]}</span>${condBtn}<span class="m-sv-poles">${ba}${bb}</span></div>`;
    const inline = open ? `<div class="m-sv-condinline${_svJustOpened ? ' is-anim' : ''}">${_renderScoreCond(di, pi)}</div>` : '';
    return row + inline;
  };
  const parts = [0,1,2,3,4,5,6,7,8].map(pitem).join('');
  // 加總（cntA=da 欄、cntB=db 欄）+ 係數
  let cntA = 0, cntB = 0, complete = true;
  for (let pi = 0; pi < 9; pi++) { const v = _manualDraft[di][pi]; if (v === pa.val) cntA++; else if (v === pb.val) cntB++; if (v !== 'A' && v !== 'B') complete = false; }
  let coeffRow = `<div class="m-sv-trow m-sv-coeff is-even"><span class="m-sv-tlab">係數</span><span class="m-sv-tcell">—</span><span class="m-sv-tcell"></span></div>`;
  if (complete) {
    const r = calcDim(_manualDraft, di);
    if (r) {
      const coeff = r.coeff.toFixed(2);
      let word = '平', tone = 'even';
      if (r.a > r.b) { word = dim.aT; tone = dim.aT === '靜' ? 'jing' : 'dong'; }
      else if (r.b > r.a) { word = dim.bT; tone = dim.bT === '靜' ? 'jing' : 'dong'; }
      coeffRow = `<div class="m-sv-trow m-sv-coeff is-${tone}"><span class="m-sv-tlab">係數</span><span class="m-sv-tcell">${word}</span><span class="m-sv-tcell">${coeff}</span></div>`;
    }
  }
  const totals = `<div class="m-sv-trow m-sv-sum"><span class="m-sv-tlab">加總</span><span class="m-sv-tcell">${cntA}</span><span class="m-sv-tcell">${cntB}</span></div>${coeffRow}`;
  const partCol = `<div class="m-sv-plist">${parts}${totals}</div>`;
  const condCol = desktop ? _renderScoreCond(di, _scorePartIdx) : '';   // 手機版條件改在部位列內手風琴展開
  const defExp = `符合條件為${dim.a}`;
  const expNote = _scaffold.exp[di] || '';
  const expOpen = _noteOpen['exp' + di];
  const expBtn = `<button class="m-sv-ico" data-expedit="${di}" data-tip="加說明">✎</button>`;
  const expEraseBtn = (expOpen || expNote) ? _eraserBtn('exp' + di) : '';
  const expBox = (expOpen || expNote) ? `<div class="m-sv-expnote">${_noteEl('data-expinput="' + di + '"', expNote, '', 'exp' + di)}</div>` : '';
  // 維度名置頂(sticky)只包名稱列；維度筆記(expBox)移到 sticky 外，避免打字長高造成游標上下跳
  const dimbar = `<div class="m-sv-dimhead"><div class="m-sv-dimbar"><span class="m-sv-dimname">${dim.dn}</span><span class="m-sv-dimexp">${_esc(defExp)}</span>${expBtn}${expEraseBtn}</div></div>${expBox}`;
  _svLastDesktop = desktop;
  return `<div class="m-score-view"><div class="m-sv-layout">${dimList}<div class="m-sv-main">${dimbar}<div class="m-sv-sub">${partCol}${condCol}</div></div></div></div>`;
}
// ===== A3 #2 Stage3：鷹架持久化（manualScaffoldJson，per 對象）＋筆記/新增/移除/說明 =====
let _scaffold = { cond:{}, cnote:{}, pnote:{}, added:{}, removed:{}, exp:{}, ref:{}, snote:{} };
let _scaffoldTimer = null;
let _noteOpen = {};   // 筆記框展開（UI 暫態）
let _addOpen = {};    // （已停用：行內編輯取代舊輸入框）
let _idSeq = 0;
function _newId() { _idSeq++; return 'a' + Date.now().toString(36) + _idSeq.toString(36); }
// 移除一條「我的補充」：刪陣列項＋清掉它的 符合/不符、筆記（皆以 @id 當 key）
function _removeAdded(k, gi, id) {
  if (_scaffold.added[k] && _scaffold.added[k][gi]) _scaffold.added[k][gi] = _scaffold.added[k][gi].filter(x => x.id !== id);
  if (_scaffold.cond[k]) delete _scaffold.cond[k]['@' + id];
  if (_scaffold.cnote[k]) delete _scaffold.cnote[k]['@' + id];
  delete _noteOpen['c' + k + '|@' + id];
  _saveScaffold();
}
// 清掉所有空白的「我的補充」（換部位/維度時呼叫，避免殘留空框）
function _pruneEmptyAdded() {
  let changed = false;
  Object.keys(_scaffold.added).forEach(k => { const byGi = _scaffold.added[k] || {}; Object.keys(byGi).forEach(gi => { const before = (byGi[gi] || []).length; byGi[gi] = (byGi[gi] || []).filter(it => it && it.text && it.text.trim() !== ''); if (byGi[gi].length !== before) changed = true; }); });
  if (changed) _saveScaffold();
}
function _loadScaffold() {
  const ud = window.__userData || {};
  let s = {};
  try { s = ud.manualScaffoldJson ? JSON.parse(ud.manualScaffoldJson) : {}; } catch (e) { s = {}; }
  _scaffold = Object.assign({ cond:{}, cnote:{}, pnote:{}, added:{}, removed:{}, exp:{}, ref:{}, snote:{} }, s || {});
  ['cond','cnote','pnote','added','removed','exp','ref','snote'].forEach(k => { if (!_scaffold[k] || typeof _scaffold[k] !== 'object') _scaffold[k] = {}; });
  // added 舊格式 {k:[...]} → {k:{gi:[...]}}（per 子部位）
  Object.keys(_scaffold.added).forEach(k => { if (Array.isArray(_scaffold.added[k])) _scaffold.added[k] = { 0: _scaffold.added[k] }; });
  // added 項目：字串 → {id,text}（把該文字既有的 符合/不符、筆記搬到 @id key）；丟掉空白項
  Object.keys(_scaffold.added).forEach(k => {
    const byGi = _scaffold.added[k]; if (!byGi || typeof byGi !== 'object') { _scaffold.added[k] = {}; return; }
    Object.keys(byGi).forEach(gi => {
      let arr = Array.isArray(byGi[gi]) ? byGi[gi] : [];
      arr = arr.map(it => {
        if (it && typeof it === 'object' && it.id) return { id: String(it.id), text: String(it.text || '') };
        const text = String(it == null ? '' : it), id = _newId();
        if (_scaffold.cond[k] && _scaffold.cond[k][text] != null) _scaffold.cond[k]['@' + id] = _scaffold.cond[k][text];
        if (_scaffold.cnote[k] && _scaffold.cnote[k][text] != null) _scaffold.cnote[k]['@' + id] = _scaffold.cnote[k][text];
        return { id, text };
      }).filter(it => it.text.trim() !== '');
      byGi[gi] = arr;
    });
  });
}
function _saveScaffold() {
  if (_scaffoldTimer) clearTimeout(_scaffoldTimer);
  _scaffoldTimer = setTimeout(async () => {
    _scaffoldTimer = null;
    try {
      const ref = getCurrentDocRef();
      const json = JSON.stringify(_scaffold);
      await setDoc(ref, { manualScaffoldJson: json, updatedAt: new Date().toISOString() }, { merge: true });
      if (window.__userData) window.__userData.manualScaffoldJson = json;
    } catch (e) { debugLog('[scaffold]', '存失敗', e && e.message); }
  }, 600);
}
function _svGrow(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
// 收合條件面板的滑動動畫：先固定到實際高度→過渡到 0→結束後 callback（再重畫移除）
function _svCollapse(panel, done) {
  try {
    panel.style.maxHeight = panel.scrollHeight + 'px';
    panel.style.overflow = 'hidden';
    void panel.offsetHeight;  // 強制 reflow，讓起點高度生效
    panel.style.transition = 'max-height .24s ease, opacity .24s ease, padding .24s ease, margin .24s ease';
    panel.style.maxHeight = '0';
    panel.style.opacity = '0';
    panel.style.paddingTop = '0';
    panel.style.paddingBottom = '0';
    panel.style.marginTop = '0';
    panel.style.marginBottom = '0';
    let called = false;
    const finish = () => { if (called) return; called = true; done(); };
    panel.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 320);  // 後備：動畫沒觸發也要收尾
  } catch (e) { done(); }
}
// 自訂確認框（避免 native confirm 的網域列；可帶要刪除的內容）
function _svConfirm(text, detail, onYes) {
  const ov = document.createElement('div');
  ov.className = 'm-sv-confirm-ov';
  ov.innerHTML = `<div class="m-sv-confirm"><div class="m-sv-confirm-msg">${_esc(text)}</div>${detail ? `<div class="m-sv-confirm-detail">「${_esc(detail)}」</div>` : ''}<div class="m-sv-confirm-btns"><button class="m-sv-confirm-cancel" type="button">取消</button><button class="m-sv-confirm-ok" type="button">確定</button></div></div>`;
  document.body.appendChild(ov);
  const close = () => { try { document.body.removeChild(ov); } catch (e) {} };
  ov.querySelector('.m-sv-confirm-cancel').onclick = close;
  ov.querySelector('.m-sv-confirm-ok').onclick = () => { close(); if (onYes) onYes(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
}
// 筆記框：rows=1 寫多少顯多少、即打即存、原生 undo、可下拉拉高（刪除鈕已移到 ✎ 右邊，不在框內）
function _noteEl(dataAttr, value, placeholder, ndelKey) {
  return `<span class="m-sv-noteico" aria-hidden="true"></span><div class="m-sv-noteinner"><textarea class="m-sv-note" rows="1" ${dataAttr} data-noteblur="${_esc(ndelKey)}" placeholder="${placeholder}">${_esc(value)}</textarea></div>`;
}
// 刪除筆記橡皮擦鈕（放在 ✎ 右邊，筆記開啟/有內容時才出現）；key＝_noteOpen 的鍵
function _eraserBtn(key) {
  return `<button class="m-sv-ico" data-ndel="${_esc(key)}" type="button" data-tip="刪除筆記"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg></button>`;
}
// 條件列：官方條件＝唯讀文字；「我的補充」＝行內可編輯（便利貼左色條）＋✕刪除。
// 我的補充用穩定 @id 當 符合/不符與筆記的 key，改字不會跑掉。
function _condRow(k, c, opt) {
  opt = opt || {};
  const added = !!opt.added;
  const noRule = !added && c.indexOf('待 admin') >= 0;
  const sufKey = added ? '@' + opt.id : c;          // 狀態 key 後綴
  const ck = k + '|' + sufKey;
  const cond = _scaffold.cond[k] || {}, cnote = _scaffold.cnote[k] || {};
  const a = cond[sufKey], yes = a === '符合' ? 'is-yes' : '', no = a === '不符' ? 'is-no' : '';
  const yn = noRule ? '' : `<span class="m-sv-yn"><button class="${yes}" data-ynk="${_esc(ck)}" data-ynv="符合">符合</button><button class="${no}" data-ynk="${_esc(ck)}" data-ynv="不符">不符</button></span>`;
  const nv = cnote[sufKey] || '';
  const noteOpenNow = !noRule && (_noteOpen['c' + ck] || nv);
  const noteBtn = noRule ? '' : `<button class="m-sv-ico" data-cnt="${_esc(ck)}" data-tip="加筆記">✎</button>`;
  const eraseBtn = noteOpenNow ? _eraserBtn('c' + ck) : '';
  const noteBox = noteOpenNow ? `<div class="m-sv-notebox">${_noteEl('data-cna="' + _esc(ck) + '"', nv, '這條的筆記…', 'c' + ck)}</div>` : '';
  if (added) {
    const cek = `${_esc(k)}|${_esc(String(opt.gi))}|${_esc(opt.id)}`;
    const mineIcon = `<span class="m-sv-mineicon" title="我的補充"></span>`;
    const edit = `<textarea class="m-sv-condedit" rows="1" data-cedit="${cek}" placeholder="輸入條件…">${_esc(c)}</textarea>`;
    const delBtn = `<button class="m-sv-ico" data-cdel="${cek}" data-tip="移除這條">✕</button>`;
    return `<div class="m-sv-condgroup"><div class="m-sv-cond is-mine">${mineIcon}${edit}${yn}${noteBtn}${eraseBtn}${delBtn}</div>${noteBox}</div>`;
  }
  return `<div class="m-sv-condgroup"><div class="m-sv-cond"><span class="m-sv-cond-text">${_esc(c)}</span>${yn}${noteBtn}${eraseBtn}</div>${noteBox}</div>`;
}
function _renderScoreCond(di, pi) {
  const model = _scoreCondModel(di, pi);
  const dim = DIMS[di] || {};
  const k = `${di}_${pi}`;
  const bigPart = true;  // #6：9 個部位都可加部位筆記（原本只有頭/上停/中停/下停）
  const pNote = _scaffold.pnote[k] || '';
  const pNoteOpen = bigPart && (_noteOpen['p' + k] || pNote);
  const pnoteBtn = bigPart ? `<button class="m-sv-ico" data-pnt="${k}" data-tip="部位筆記">✎</button>` : '';
  const pEraseBtn = pNoteOpen ? _eraserBtn('p' + k) : '';
  // 部位名＋✎在第一行；評斷標準移到第二行、字體加深(.m-sv-crit2)
  const critHtml = model.crit ? `<div class="m-sv-crit2">${_esc(model.crit)}</div>` : '';
  // 單卡片部位(上停/耳/眉/眼/鼻/口)：＋條件放在部位列(筆記✎右邊)；多子部位部位(頭/中停/下停)的＋條件在各子部位標題上
  const isMaster = model.kind === 'master';
  const partAddBtn = isMaster ? `<button class="m-sv-addpill" data-addcond="${k}_0" type="button" data-tip="新增條件">＋條件</button>` : '';
  const header = `<div class="m-sv-parthdr"><span class="m-sv-pn">${PART_LABELS[pi]}</span>${pnoteBtn}${pEraseBtn}${partAddBtn}</div>${critHtml}`;
  const pNoteBox = pNoteOpen ? `<div class="m-sv-notebox m-sv-pnotebox">${_noteEl('data-pna="' + k + '"', pNote, '這個部位的筆記…', 'p' + k)}</div>` : '';
  if (!model.groups.length) return `<div class="m-sv-condwrap">${header}${pNoteBox}<div class="m-sv-empty">（此部位無判別條件）</div></div>`;
  // 頭/中停/下停：參考子部位「形/勢 左右 bar」——同部位左右並排同列；預設未填、手動點、再按取消、不計入計算、不回寫部位觀察
  const subRows = model.subRows || [];
  let refBars = '';
  if (subRows.length) {
    const pa = _poleOf(dim, dim.da), pb = _poleOf(dim, dim.db);
    const refMap = _scaffold.ref[k] || {};
    // 子部位名固定寬度（取該部位最長名）→ 各列形/勢 bar 對齊；用行內 width:em（避開 Safari flex+var bug）
    const maxLen = Math.max(1, ...subRows.reduce((a, r) => a.concat(r), []).map(n => n.length));
    const rnEm = (maxLen + 0.25).toFixed(2);
    const cell = (name) => {
      const v = refMap[name];
      const ba = `<button class="m-sv-pole ${v === pa.val ? 'is-' + pa.tone : ''}" data-mref="${k}|${_esc(name)}|${pa.val}">${_esc(dim.da)}</button>`;
      const bb = `<button class="m-sv-pole ${v === pb.val ? 'is-' + pb.tone : ''}" data-mref="${k}|${_esc(name)}|${pb.val}">${_esc(dim.db)}</button>`;
      return `<span class="m-sv-refcell"><span class="m-sv-refname" style="width:${rnEm}em">${_esc(name)}</span><span class="m-sv-poles">${ba}${bb}</span></span>`;
    };
    const rowHtml = subRows.map(r => `<div class="m-sv-refrow">${r.map(cell).join('')}</div>`).join('');
    refBars = `<div class="m-sv-refbars">${rowHtml}</div>`;
  }
  const addedAll = _scaffold.added[k] || {};
  const cards = model.groups.map((g, gi) => {
    const akey = `${k}_${gi}`;  // di_pi_gi（皆數字）
    let rows = (g.crits.length ? g.crits : ['（此維度規則尚未定義，待 admin 補上）']).map(c => _condRow(k, c)).join('');
    // 我的補充條件（依子部位 gi 各自掛）
    // 我的補充：行內可編輯（{id,text}）
    rows += (addedAll[gi] || []).map(it => _condRow(k, it.text, { added: true, gi, id: it.id })).join('');
    if (g.src === 'master') {
      // 單卡片(上停/耳/眉/眼/鼻/口)：標題與＋條件在部位列，這裡只放條件
      return `<div class="m-sv-subpart">${rows}</div>`;
    }
    // 子部位卡片(頂骨/枕骨/華陽骨/顴/人中/地閣/頤)：標題改名(權重2→（左右X）)＋右側 筆記✎ ＋條件；其下子部位筆記框
    const sk = akey;
    const sNote = _scaffold.snote[sk] || '';
    const sOpen = _noteOpen['s' + sk] || sNote;
    const titleName = (g.w >= 2) ? `${g.title}（左右${g.title}）` : g.title;
    const sNoteBtn = `<button class="m-sv-ico" data-snt="${sk}" data-tip="子部位筆記">✎</button>`;
    const sEraseBtn = sOpen ? _eraserBtn('s' + sk) : '';
    const sAddBtn = `<button class="m-sv-addpill" data-addcond="${akey}" type="button" data-tip="新增條件">＋條件</button>`;
    const subhead = `<div class="m-sv-subhead"><span class="m-sv-subtitle-name">${_esc(titleName)}</span>${sNoteBtn}${sEraseBtn}${sAddBtn}</div>`;
    const sNoteBox = sOpen ? `<div class="m-sv-notebox m-sv-snotebox">${_noteEl('data-sna="' + sk + '"', sNote, '這個子部位的筆記…', 's' + sk)}</div>` : '';
    // 子部位筆記＝與維度/部位筆記一致樣式（在標題色塊下、白底區、無底色）
    return `<div class="m-sv-subpart">${subhead}${sNoteBox}${rows}</div>`;
  }).join('');
  return `<div class="m-sv-condwrap">${header}${pNoteBox}${refBars}<div class="m-sv-subparts">${cards}</div></div>`;
}

function _bindEvents() {
  _container.querySelectorAll('[data-mview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prev = _manualSubview;
      _manualSubview = btn.dataset.mview;
      if (prev === 'board' && _manualSubview !== 'board') { try { unmountBoard(); } catch (e) {} }
      try { localStorage.setItem(LS_VIEW, _manualSubview); } catch (e) {}
      _render();
    });
  });
  _container.querySelectorAll('[data-mpng]').forEach(btn => {
    btn.addEventListener('click', () => exportManualPng(btn));
  });
  _container.querySelectorAll('[data-mcharts]').forEach(btn => {
    btn.addEventListener('click', () => exportMobileCharts({ mode: 'charts', srcData: _manualDraft, btn: btn }));
  });
  _container.querySelectorAll('[data-mrc]').forEach(btn => {
    btn.addEventListener('click', () => exportMobileCharts({ mode: 'all', srcData: _manualDraft, btn: btn }));
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
      _manualDimIdx = di;       // v7：永遠選一個維度（不收合）
      _scorePartIdx = 0;        // 換維度 → 條件欄回到第一個部位
      _scoreCondOpen = null;    // 換維度 → 手機版手風琴全收合
      _pruneEmptyAdded();       // 清掉沒打字的空條件
      try { localStorage.setItem(LS_DIM_IDX, String(di)); } catch (e) {}
      _render();
    });
  });
  // v7：點部位名 → 條件欄顯示該部位（評分鈕另有 data-mpole 處理，不選部位）
  _container.querySelectorAll('[data-mspart]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-mpole]')) return;       // 點到形/勢鈕不算選部位
      if (e.target.closest('[data-msvcond]')) return;     // 點到「條件」鈕由手風琴處理
      _scorePartIdx = parseInt(el.dataset.mspart, 10);
      _render();
    });
  });
  // 手機版手風琴：部位列的「條件」鈕 → 在該列下方展開/收起該部位條件
  _container.querySelectorAll('[data-msvcond]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _pruneEmptyAdded();       // 切換前清掉沒打字的空條件
      const pi = parseInt(btn.dataset.msvcond, 10);
      const row = btn.closest('.m-sv-pitem');
      // 收合（再按目前展開的部位）：先播收合動畫，動畫結束再重畫移除
      if (_scoreCondOpen === pi) {
        const panel = row ? row.nextElementSibling : null;
        if (panel && panel.classList && panel.classList.contains('m-sv-condinline')) {
          _svCollapse(panel, () => { _scoreCondOpen = null; _render(); });
        } else {
          _scoreCondOpen = null; _render();
        }
        return;
      }
      // 展開（含從別的部位切換過來）
      // #4：記住此列在捲動區的視覺位置，重畫後還原 → 點別的部位時畫面不會突然跳位
      const scroller = (_container.closest && _container.closest('.m-main')) || document.querySelector('.m-main');
      const beforeTop = row ? row.getBoundingClientRect().top : null;
      _scoreCondOpen = pi;
      _scorePartIdx = pi;                                    // 與桌機選取保持一致
      _svJustOpened = true;                                  // 只有展開這一下播動畫
      _render();
      _svJustOpened = false;
      if (scroller && beforeTop != null) {
        const newRow = _container.querySelector(`.m-sv-pitem[data-mspart="${pi}"]`);
        if (newRow) scroller.scrollTop += (newRow.getBoundingClientRect().top - beforeTop);
      }
    });
  });
  // v7：形/勢評分鈕（手動決定，再按取消；不自動算）
  _container.querySelectorAll('[data-mpole]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parts = btn.dataset.mpole.split('_');
      const di = parseInt(parts[0], 10), pi = parseInt(parts[1], 10), val = parts[2];
      _manualDraft[di][pi] = (_manualDraft[di][pi] === val) ? null : val;  // 再按同極＝取消
      _markDirty();
      _render();
    });
  });
  // 中停/下停 參考子部位 形/勢 bar（鷹架資料，思考用、不計入計算、再按取消）
  _container.querySelectorAll('[data-mref]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const seg = btn.dataset.mref.split('|'); // "di_pi|子部位名|A/B"
      const rk = seg[0], name = seg[1], val = seg[2];
      if (!_scaffold.ref[rk]) _scaffold.ref[rk] = {};
      if (_scaffold.ref[rk][name] === val) delete _scaffold.ref[rk][name]; // 再按同極＝取消（回未填）
      else _scaffold.ref[rk][name] = val;
      _saveScaffold();
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
  // Stage3：符合/不符 → _scaffold.cond（持久化；純鷹架不算動靜）
  _container.querySelectorAll('[data-ynk]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ck = btn.dataset.ynk, v = btn.dataset.ynv;
      const idx = ck.indexOf('|'), k = ck.slice(0, idx), c = ck.slice(idx + 1);
      if (!_scaffold.cond[k]) _scaffold.cond[k] = {};
      _scaffold.cond[k][c] = (_scaffold.cond[k][c] === v) ? null : v;
      _saveScaffold(); _render();
    });
  });
  // Stage3：條件/部位筆記展開
  _container.querySelectorAll('[data-cnt]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const ck = btn.dataset.cnt; const open = !_noteOpen['c' + ck]; _noteOpen['c' + ck] = open; if (open) _svFocusKey = 'c' + ck; _render(); }));
  _container.querySelectorAll('[data-pnt]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const k = btn.dataset.pnt; const open = !_noteOpen['p' + k]; _noteOpen['p' + k] = open; if (open) _svFocusKey = 'p' + k; _render(); }));
  _container.querySelectorAll('[data-snt]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const sk = btn.dataset.snt; const open = !_noteOpen['s' + sk]; _noteOpen['s' + sk] = open; if (open) _svFocusKey = 's' + sk; _render(); }));
  // Stage3：筆記 textarea（input 即存）
  _container.querySelectorAll('[data-cna]').forEach(ta => {
    _svGrow(ta);
    ta.addEventListener('input', () => { const ck = ta.dataset.cna, idx = ck.indexOf('|'), k = ck.slice(0, idx), c = ck.slice(idx + 1); if (!_scaffold.cnote[k]) _scaffold.cnote[k] = {}; _scaffold.cnote[k][c] = ta.value; _svGrow(ta); _saveScaffold(); });
  });
  _container.querySelectorAll('[data-pna]').forEach(ta => {
    _svGrow(ta);
    ta.addEventListener('input', () => { const k = ta.dataset.pna; _scaffold.pnote[k] = ta.value; _svGrow(ta); _saveScaffold(); });
  });
  _container.querySelectorAll('[data-sna]').forEach(ta => {
    _svGrow(ta);
    ta.addEventListener('input', () => { const sk = ta.dataset.sna; _scaffold.snote[sk] = ta.value; _svGrow(ta); _saveScaffold(); });
  });
  // 移除「我的補充」（✕，id-based）
  _container.querySelectorAll('[data-cdel]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const seg = btn.dataset.cdel.split('|'), k = seg[0], gi = seg[1], id = seg[2];
      const arr = (_scaffold.added[k] && _scaffold.added[k][gi]) || [];
      const it = arr.find(x => x.id === id);
      _svConfirm('確定要刪除這項條件嗎？', it ? it.text : '', () => { _removeAdded(k, gi, id); _render(); });
    });
  });
  // 新增條件：直接長出一列可編輯條件（{id,text:''}）並聚焦；不再用「加入」按鈕
  _container.querySelectorAll('[data-addcond]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const akey = btn.dataset.addcond, p = akey.split('_'), k = p[0] + '_' + p[1], gi = p[2];
    if (!_scaffold.added[k]) _scaffold.added[k] = {};
    if (!_scaffold.added[k][gi]) _scaffold.added[k][gi] = [];
    const id = _newId();
    _scaffold.added[k][gi].push({ id, text: '' });
    _svFocusKey = 'cedit:' + k + '|' + gi + '|' + id;
    _saveScaffold(); _render();
  }));
  // 條件行內編輯：打字即存；移開時若空白 → 自動移除該列
  _container.querySelectorAll('[data-cedit]').forEach(ta => {
    _svGrow(ta);
    ta.addEventListener('input', () => {
      const seg = ta.dataset.cedit.split('|'), k = seg[0], gi = seg[1], id = seg[2];
      const arr = (_scaffold.added[k] && _scaffold.added[k][gi]) || [];
      const it = arr.find(x => x.id === id);
      if (it) { it.text = ta.value; _svGrow(ta); _saveScaffold(); }
    });
    ta.addEventListener('blur', () => {
      if (ta.value.trim()) return;
      const seg = ta.dataset.cedit.split('|'), k = seg[0], gi = seg[1], id = seg[2];
      _removeAdded(k, gi, id); _render();
    });
  });
  // Stage3：維度說明筆記（✎ 開合 + textarea 即存）
  _container.querySelectorAll('[data-expedit]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const di = btn.dataset.expedit; const open = !_noteOpen['exp' + di]; _noteOpen['exp' + di] = open; if (open) _svFocusKey = 'exp' + di; _render(); }));
  _container.querySelectorAll('[data-expinput]').forEach(ta => {
    _svGrow(ta);
    ta.addEventListener('input', () => { const di = ta.dataset.expinput; _scaffold.exp[di] = ta.value; _svGrow(ta); _saveScaffold(); });
  });
  // Stage3：刪除筆記（清空對應 textarea → 觸發 input 存空 → 收起該筆記框）
  _container.querySelectorAll('[data-ndel]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.ndel;
      let ta = null;
      _container.querySelectorAll('[data-noteblur]').forEach(t => { if (!ta && t.getAttribute('data-noteblur') === key) ta = t; });
      const doDel = () => { if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); } _noteOpen[key] = false; _render(); };
      if (ta && ta.value.trim()) _svConfirm('確定要刪除筆記嗎？', '', doDel);
      else doDel();
    });
  });
  // 空筆記移出焦點 → 直接收起（不留空框）；焦點移到同框內(橡皮擦)不關
  _container.querySelectorAll('[data-noteblur]').forEach(ta => {
    ta.addEventListener('blur', (e) => {
      const ni = ta.closest('.m-sv-noteinner');
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.m-sv-noteinner') === ni) return;
      if (!ta.value.trim()) { _noteOpen[ta.dataset.noteblur] = false; _render(); }
    });
  });
  // 開筆記/新增框後自動聚焦（讓「沒打字就點外面→收起」生效）
  if (_svFocusKey) {
    const key = _svFocusKey; _svFocusKey = null;
    let el = null;
    if (key.indexOf('cedit:') === 0) { const t = key.slice(6); _container.querySelectorAll('[data-cedit]').forEach(ta => { if (!el && ta.getAttribute('data-cedit') === t) el = ta; }); }
    else { _container.querySelectorAll('[data-noteblur]').forEach(ta => { if (!el && ta.getAttribute('data-noteblur') === key) el = ta; }); }
    if (el) { try { el.focus(); } catch (e) {} }
  }
}

// v1.7 階段 8：拿掉 _enterSens / _exitSens / _renderSensView
// 重要參數分析改成 segmented 第三個 tab（_manualSubview === 'sens'）內部 render
