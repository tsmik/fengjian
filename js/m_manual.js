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

import { DIMS, avgCoeff } from './core.js';
import { auth, db, debugLog, refreshUserData } from './m_main.js';
import { setSaveStatus, getSaveStatus } from './m_input.js';
import { updateHomeProgress } from './m_home.js';
import { generatePng } from './m_report.js';
import { renderManualSens } from './m_sens.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const LS_DIM_IDX = 'm_manual_dim_idx';
const LS_VIEW = 'm_manual_view';

let _container = null;
let _view = 'main';            // 'main' | 'sens' — 內部 view（sens 覆蓋整頁）
let _manualSubview = 'input';  // 'input' | 'overview' — 內部 segmented
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
  const uid = (auth && auth.currentUser && auth.currentUser.uid) || 'anon';
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
  // 讀 LS state
  try {
    const savedDim = localStorage.getItem(LS_DIM_IDX);
    if (savedDim !== null && savedDim !== 'null') {
      const n = parseInt(savedDim, 10);
      if (!isNaN(n) && n >= 0 && n < 13) _manualDimIdx = n;
    }
  } catch (e) {}
  try {
    const savedView = localStorage.getItem(LS_VIEW);
    if (savedView === 'input' || savedView === 'overview') _manualSubview = savedView;
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
  // 重設 sens view 狀態：下次進手動 tab 從 main view 開始
  _view = 'main';
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
    const uid = auth.currentUser && auth.currentUser.uid;
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
  if (_view === 'sens') { _renderSensView(); return; }
  // 回 main view：恢復 saveZone（若 sens view 隱藏過）
  const saveZone = document.getElementById('m-save-zone');
  if (saveZone) saveZone.classList.remove('is-hidden');
  _container.innerHTML = _renderManualInput();
  _bindEvents();
}

function _renderManualInput() {
  const viewToggle = `
    <div class="m-manual-view-bar">
      <div class="m-segmented" role="tablist">
        <button class="m-seg-btn ${_manualSubview === 'input' ? 'm-seg-active' : ''}" data-mview="input">輸入</button>
        <button class="m-seg-btn ${_manualSubview === 'overview' ? 'm-seg-active' : ''}" data-mview="overview">手動兵法報告</button>
      </div>
    </div>
  `;
  let body;
  if (_manualSubview === 'overview') {
    body = `${_renderManualOverview()}${_renderCoeffSummary()}${_renderManualPngRow()}${_renderClearAllRow()}`;
  } else {
    body = `
      ${_renderDimRow(DIM_ROW_1_IDX, 6)}
      ${_renderDimRow(DIM_ROW_2_IDX, 7)}
      ${_manualDimIdx !== null ? _renderDimPanel(_manualDimIdx) : ''}
      ${_renderClearAllRow()}
    `;
  }
  // v1.7 階段 6+：拿掉 m-manual-card 白框（跟部位觀察視覺一致）
  return `${viewToggle}${body}`;
}

function _renderClearAllRow() {
  return `
    <div class="m-manual-clear-row">
      <button class="m-manual-clear-btn m-manual-clear-btn-all" data-mclear-all="1">清除全部填答</button>
    </div>
  `;
}

// v1.7 階段 6：手動報告小結卡（總係數 / 先天 / 老闆 / 主管 / 運氣 / 後天）
// 計算方式仿桌機：avgCoeff(manualData, [di...]) 取群組維度平均
function _renderCoeffSummary() {
  const BOSS_IDS = [0,1,2];          // 老闆 = 形勢/經緯/方圓
  const MGR_IDS = [3,4,5];           // 主管 = 曲直/收放/緩急
  const PRE_IDS = [0,1,2,3,4,5];     // 先天 = 老闆 + 主管
  const LUCK_IDS = [6,7,8];          // 運氣 = 順逆/分合/真假
  const POST_IDS = [9,10,11,12];     // 後天 = 攻守/奇正/虛實/進退
  const ALL_IDS = [0,1,2,3,4,5,6,7,8,9,10,11,12];

  const boss = avgCoeff(_manualDraft, BOSS_IDS);
  const mgr = avgCoeff(_manualDraft, MGR_IDS);
  const pre = avgCoeff(_manualDraft, PRE_IDS);
  const luck = avgCoeff(_manualDraft, LUCK_IDS);
  const post = avgCoeff(_manualDraft, POST_IDS);
  const total = avgCoeff(_manualDraft, ALL_IDS);

  return `
    <div class="m-manual-coeff-summary">
      <div class="m-manual-coeff-sub">
        <div class="m-manual-coeff-row is-boss"><span class="m-manual-coeff-label">老闆係數</span><span class="m-manual-coeff-val">${boss}</span></div>
        <div class="m-manual-coeff-row is-mgr"><span class="m-manual-coeff-label">主管係數</span><span class="m-manual-coeff-val">${mgr}</span></div>
      </div>
      <div class="m-manual-coeff-row is-pre"><span class="m-manual-coeff-label">先天係數</span><span class="m-manual-coeff-val">${pre}</span></div>
      <div class="m-manual-coeff-row is-luck"><span class="m-manual-coeff-label">運氣係數</span><span class="m-manual-coeff-val">${luck}</span></div>
      <div class="m-manual-coeff-row is-post"><span class="m-manual-coeff-label">後天係數</span><span class="m-manual-coeff-val">${post}</span></div>
      <div class="m-manual-coeff-row is-total"><span class="m-manual-coeff-label">總係數</span><span class="m-manual-coeff-val">${total}</span></div>
    </div>
  `;
}

function _renderManualPngRow() {
  return `
    <div class="m-report-link-wrap" style="padding:20px 16px 8px">
      <button class="m-report-link-btn" data-mpng="1">產生詳盡報告（手動版 PNG）</button>
      <div class="m-report-link-tip">未填完維度／係數會顯示「未填完」</div>
      <button class="m-sens-entry-btn" data-msens-entry="manual" type="button">📊 看重要參數分析</button>
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
      <div class="m-manual-clear-row">
        <button class="m-manual-clear-btn" data-mclear="${di}">清空本維度</button>
      </div>
    </div>
  `;
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
  let resultText = '—';
  let resultCls = '';
  if (v === 'A') { resultText = dim.a; resultCls = dim.aT === '靜' ? 'is-jing' : 'is-dong'; }
  else if (v === 'B') { resultText = dim.b; resultCls = dim.bT === '靜' ? 'is-jing' : 'is-dong'; }
  return `
    <div class="m-manual-row">
      <div class="m-manual-row-part">${PART_LABELS[pi]}</div>
      <div class="m-manual-row-switch">
        <button class="m-manual-sw m-manual-sw-jing ${isJing ? 'is-active' : ''}" data-msw="${di}_${pi}_${jingVal}">靜</button>
        <button class="m-manual-sw m-manual-sw-empty ${isEmpty ? 'is-active' : ''}" data-msw="${di}_${pi}_">—</button>
        <button class="m-manual-sw m-manual-sw-dong ${isDong ? 'is-active' : ''}" data-msw="${di}_${pi}_${dongVal}">動</button>
      </div>
      <div class="m-manual-row-result ${resultCls}">${resultText}</div>
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
  _container.querySelectorAll('[data-msens-entry="manual"]').forEach(btn => {
    btn.addEventListener('click', () => _enterSens());
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
}

// ===== 重要參數分析 view（手動版）=====

function _enterSens() {
  _view = 'sens';
  _render();
  const main = document.querySelector('.m-main');
  if (main) main.scrollTop = 0;
}

function _exitSens() {
  _view = 'main';
  _render();
}

function _renderSensView() {
  _container.innerHTML = `
    <div class="m-sens-header">
      <button class="m-sens-back" type="button">← 返回</button>
      <span class="m-sens-header-title">手動 重要參數分析</span>
    </div>
    <div class="m-sens-body">${renderManualSens(_manualDraft)}</div>
  `;
  const backBtn = _container.querySelector('.m-sens-back');
  if (backBtn) backBtn.addEventListener('click', _exitSens);
  // 分析頁純檢視，隱藏儲存按鈕
  const saveZone = document.getElementById('m-save-zone');
  if (saveZone) saveZone.classList.add('is-hidden');
}
