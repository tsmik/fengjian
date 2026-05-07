// ============================================================
// 手機版報告 tab — sub-tab 切換（自動報告 / 手動報告）
// 職責：報告分頁 mount / unmount + sub-tab 切換 + 手動報告輸入視圖 + Firestore 同步
// 依賴：
//   - js/core.js (DIMS)
//   - js/m_main.js (auth, db, debugLog)
//   - js/m_input.js (setSaveStatus — 共用 m-save-status UI)
//   - firebase firestore SDK
// 被用：m_main.js（mountReport / unmountReport / getReportSaveStatus / discardReportDraft）
// retest 範圍：
//   - sub-tab 切換 + LS persist
//   - 手動報告 13 維度 tile + 9 部位三態 toggle
//   - 進度數字 N/9
//   - LS 草稿 per-uid（重整保留）
//   - Firestore baseline 讀取（從 window.__userData.manualDataJson）
//   - 答題 / 清空 / 維度互斥 → 即時 setSaveStatus('dirty')
//   - 點儲存 → 寫 Firestore manualDataJson + 清 LS + 狀態回綠
//   - 桌機 staging manualDataJson 互通（兩端資料同步）
// ============================================================

import { DIMS } from './core.js';
import { auth, db, debugLog } from './m_main.js';
import { setSaveStatus } from './m_input.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const LS_SUBTAB = 'm_report_subtab';
const LS_DIM_IDX = 'm_manual_dim_idx';
const LS_VIEW = 'm_manual_view';

let _container = null;
let _subtab = 'auto'; // 'auto' | 'manual'
let _manualView = 'input'; // 'input' | 'overview'
let _manualDraft = null; // 13×9 array, 每格 'A' | 'B' | null
let _firestoreBaseline = null; // Firestore 已存的 manualDataJson 解析結果（用於 discard 還原）
let _manualDimIdx = null; // 0~12 or null
let _isSavingManual = false;

const SUBTABS = [
  { key: 'auto',   label: '自動報告' },
  { key: 'manual', label: '手動報告' }
];

// 部位順序（沿用桌機 manual.js partLabels）
const PART_LABELS = ['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
const PART_ROW_1 = [0, 1, 2, 3, 4]; // 頭/上停/中停/下停/耳
const PART_ROW_2 = [5, 6, 7, 8];    // 眉/眼/鼻/口

// 13 維度兩排 6+7
const DIM_ROW_1_IDX = [0, 1, 2, 3, 4, 5];
const DIM_ROW_2_IDX = [6, 7, 8, 9, 10, 11, 12];

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

function _loadManualDraft() {
  _initBaseline();
  // 預設 _manualDraft = baseline 的 deep copy
  _manualDraft = JSON.parse(JSON.stringify(_firestoreBaseline));
  // LS 草稿覆蓋 baseline
  try {
    const s = localStorage.getItem(_getLsKey());
    if (s) {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length === 13) _manualDraft = arr;
    }
  } catch (e) {}
}

function _hasLocalDraft() {
  try {
    return !!localStorage.getItem(_getLsKey());
  } catch (e) { return false; }
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

export function mountReport(container) {
  _container = container;
  try {
    const saved = localStorage.getItem(LS_SUBTAB);
    if (saved === 'auto' || saved === 'manual') _subtab = saved;
  } catch (e) {}
  try {
    const savedDim = localStorage.getItem(LS_DIM_IDX);
    if (savedDim !== null && savedDim !== 'null') {
      const n = parseInt(savedDim, 10);
      if (!isNaN(n) && n >= 0 && n < 13) _manualDimIdx = n;
    }
  } catch (e) {}
  try {
    const savedView = localStorage.getItem(LS_VIEW);
    if (savedView === 'input' || savedView === 'overview') _manualView = savedView;
  } catch (e) {}
  _loadManualDraft();
  _render();
  // dirty 狀態：LS 跟 baseline 不同就是 dirty
  setSaveStatus(_hasLocalDraft() ? 'dirty' : 'saved');
  // 綁儲存按鈕（每次 mount 用 .onclick 覆寫，覆蓋 m_input.js 的綁定）
  const saveBtn = document.getElementById('m-save-btn');
  if (saveBtn) saveBtn.onclick = handleReportSave;
}

export function unmountReport() {
  if (_container) _container.innerHTML = '';
  _container = null;
  // saveBtn.onclick 不主動清；下次 mountInput 會自己覆蓋
}

export function getReportSaveStatus() {
  // 共用 m_input.js 的 _currentSaveStatus；此 function 只是相容介面
  // 攔截離開時 m_main.js 用 getSaveStatus（input 那邊）即可
  return _hasLocalDraft() ? 'dirty' : 'saved';
}

export function discardReportDraft() {
  try { localStorage.removeItem(_getLsKey()); } catch (e) {}
  if (_firestoreBaseline) {
    _manualDraft = JSON.parse(JSON.stringify(_firestoreBaseline));
  } else {
    _manualDraft = _newEmptyMatrix();
  }
  setSaveStatus('saved');
}

async function handleReportSave() {
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
    // 同步 window.__userData baseline（避免下次 mount 看到舊資料）
    if (!window.__userData) window.__userData = {};
    window.__userData.manualDataJson = manualJsonStr;
    // 清 LS 草稿、更新內部 baseline、狀態回綠
    try { localStorage.removeItem(_getLsKey()); } catch (e) {}
    _firestoreBaseline = JSON.parse(JSON.stringify(_manualDraft));
    setSaveStatus('saved');
  } catch (e) {
    debugLog('[m_report]', '手動報告儲存失敗', e && e.message ? e.message : e);
    setSaveStatus('error');
  } finally {
    _isSavingManual = false;
  }
}

function _render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="m-segmented" role="tablist">
      ${SUBTABS.map(t => `
        <button class="m-seg-btn ${t.key === _subtab ? 'm-seg-active' : ''}" data-subtab="${t.key}">${t.label}</button>
      `).join('')}
    </div>
    <div class="m-submode-content" id="m-report-content"></div>
  `;
  _container.querySelectorAll('[data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _subtab = btn.dataset.subtab;
      try { localStorage.setItem(LS_SUBTAB, _subtab); } catch (e) {}
      _render();
    });
  });
  _renderContent();
}

function _renderContent() {
  const el = _container.querySelector('#m-report-content');
  if (!el) return;
  if (_subtab === 'auto') {
    el.innerHTML = `
      <div class="m-placeholder">
        <div class="m-placeholder-title">自動報告</div>
        <div class="m-placeholder-desc">依據觀察資料生成<br>包含 13 維度結果 / 動靜分析 / 流年</div>
        <div class="m-placeholder-step">階段 2 實作</div>
      </div>
    `;
  } else {
    el.innerHTML = _renderManualInput();
    _bindManualEvents();
  }
}

function _renderManualInput() {
  const viewToggle = `
    <div class="m-manual-view-bar">
      <div class="m-segmented" role="tablist">
        <button class="m-seg-btn ${_manualView === 'input' ? 'm-seg-active' : ''}" data-mview="input">輸入</button>
        <button class="m-seg-btn ${_manualView === 'overview' ? 'm-seg-active' : ''}" data-mview="overview">總覽</button>
      </div>
    </div>
  `;
  if (_manualView === 'overview') {
    return `${viewToggle}${_renderManualOverview()}${_renderClearAllRow()}`;
  }
  return `
    ${viewToggle}
    ${_renderDimRow(DIM_ROW_1_IDX, 6)}
    ${_renderDimRow(DIM_ROW_2_IDX, 7)}
    ${_manualDimIdx !== null ? _renderDimPanel(_manualDimIdx) : ''}
    ${_renderClearAllRow()}
  `;
}

function _renderClearAllRow() {
  return `
    <div class="m-manual-clear-row">
      <button class="m-manual-clear-btn m-manual-clear-btn-all" data-mclear-all="1">清除全部填答</button>
    </div>
  `;
}

function _renderManualOverview() {
  // 13 列 × 9 欄矩陣（角落 + 9 部位 header + 13 維度名）
  let cells = `<div class="m-manual-cell is-corner"></div>`;
  PART_LABELS.forEach(p => {
    cells += `<div class="m-manual-cell is-col-header">${p}</div>`;
  });
  for (let di = 0; di < 13; di++) {
    cells += `<div class="m-manual-cell is-row-header">${DIMS[di].dn}</div>`;
    for (let pi = 0; pi < 9; pi++) {
      const v = _manualDraft[di][pi];
      let txt = '—', cls = 'is-empty';
      if (v === 'A') {
        txt = DIMS[di].aT;
        cls = DIMS[di].aT === '靜' ? 'is-jing' : 'is-dong';
      } else if (v === 'B') {
        txt = DIMS[di].bT;
        cls = DIMS[di].bT === '靜' ? 'is-jing' : 'is-dong';
      }
      cells += `<div class="m-manual-cell ${cls}">${txt}</div>`;
    }
  }
  return `
    <div class="m-manual-overview-wrap">
      <div class="m-manual-overview-grid">${cells}</div>
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
  return `
    <div class="m-panel m-dim-panel">
      <div class="m-dim-panel-head">
        <span class="m-dim-title-name">${dim.dn}</span>
        <span class="m-dim-title-view">${dim.view}</span>
        <span class="m-dim-title-spacer"></span>
        <span class="m-dim-title-progress">${answered}/9</span>
      </div>
      ${_renderPartRow(di, PART_ROW_1, 5)}
      ${_renderPartRow(di, PART_ROW_2, 4)}
      <div class="m-manual-clear-row">
        <button class="m-manual-clear-btn" data-mclear="${di}">清空本維度</button>
      </div>
    </div>
  `;
}

function _renderPartRow(di, partIdxList, n) {
  const dim = DIMS[di];
  const tiles = partIdxList.map(pi => {
    const v = _manualDraft[di][pi];
    let txt = '—';
    let cls = '';
    if (v === 'A') {
      txt = dim.aT;
      cls = dim.aT === '靜' ? 'is-jing' : 'is-dong';
    } else if (v === 'B') {
      txt = dim.bT;
      cls = dim.bT === '靜' ? 'is-jing' : 'is-dong';
    }
    return `
      <button class="m-manual-part-tile ${cls}" data-mdi="${di}" data-mpi="${pi}">
        <span class="m-manual-part-name">${PART_LABELS[pi]}</span>
        <span class="m-manual-part-val">${txt}</span>
      </button>
    `;
  }).join('');
  return `<div class="m-manual-part-row m-manual-part-row-${n}">${tiles}</div>`;
}

function _bindManualEvents() {
  // 視圖切換 toggle
  _container.querySelectorAll('[data-mview]').forEach(btn => {
    btn.addEventListener('click', () => {
      _manualView = btn.dataset.mview;
      try { localStorage.setItem(LS_VIEW, _manualView); } catch (e) {}
      _renderContent();
    });
  });
  // 清除全部填答
  _container.querySelectorAll('[data-mclear-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('確定清除全部 13 維度 × 9 部位的填答嗎？')) return;
      _manualDraft = _newEmptyMatrix();
      _markDirty();
      _render();
    });
  });
  // 維度 tile 點擊（互斥展開）
  _container.querySelectorAll('[data-mdim]').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = parseInt(btn.dataset.mdim, 10);
      _manualDimIdx = (_manualDimIdx === di) ? null : di;
      try {
        localStorage.setItem(LS_DIM_IDX, _manualDimIdx === null ? 'null' : String(_manualDimIdx));
      } catch (e) {}
      _renderContent();
    });
  });
  // 部位 tile 三態 toggle
  _container.querySelectorAll('[data-mdi][data-mpi]').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = parseInt(btn.dataset.mdi, 10);
      const pi = parseInt(btn.dataset.mpi, 10);
      const cur = _manualDraft[di][pi];
      let next;
      if (cur === null) next = 'A';
      else if (cur === 'A') next = 'B';
      else next = null;
      _manualDraft[di][pi] = next;
      _markDirty();
      _renderContent();
    });
  });
  // 清空本維度
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
