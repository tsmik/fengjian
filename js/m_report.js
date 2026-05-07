// ============================================================
// 手機版報告 tab — sub-tab 切換（自動報告 / 手動報告）
// 職責：報告分頁 mount / unmount + sub-tab 切換 + 手動報告輸入視圖
// 依賴：js/core.js (DIMS)、js/m_main.js (auth — LS key 加 UID 後綴)
// 被用：m_main.js（mountReport / unmountReport）
// retest 範圍：
//   - sub-tab 切換 + LS persist
//   - 手動報告 13 維度 tile 兩排 6+7 + 互斥展開
//   - 9 部位 tile 三態 toggle（null → 動/靜 → 反向 → null）
//   - 進度數字 N/9
//   - LS 草稿 per-uid（重整保留）
// 注意：P2 未整合 Firestore 寫入；儲存按鈕、清除全部留 P3
// ============================================================

import { DIMS } from './core.js';
import { auth } from './m_main.js';

const LS_SUBTAB = 'm_report_subtab';
const LS_DIM_IDX = 'm_manual_dim_idx';

let _container = null;
let _subtab = 'auto'; // 'auto' | 'manual'
let _manualDraft = null; // 13×9 array, 每格 'A' | 'B' | null
let _manualDimIdx = null; // 0~12 or null

const SUBTABS = [
  { key: 'auto',   label: '自動報告' },
  { key: 'manual', label: '手動報告' }
];

// 部位順序（沿用桌機 manual.js partLabels）
const PART_LABELS = ['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
const PART_ROW_1 = [0, 1, 2, 3, 4]; // 頭/上停/中停/下停/耳
const PART_ROW_2 = [5, 6, 7, 8];    // 眉/眼/鼻/口

// 13 維度兩排 6+7（沿用 m_input.js 維度視角順序）
const DIM_ROW_1_IDX = [0, 1, 2, 3, 4, 5];
const DIM_ROW_2_IDX = [6, 7, 8, 9, 10, 11, 12];

function _getLsKey() {
  const uid = (auth && auth.currentUser && auth.currentUser.uid) || 'anon';
  return 'm_manual_draft_' + uid;
}

function _initManualDraft() {
  if (_manualDraft) return;
  _manualDraft = Array(13).fill(null).map(() => Array(9).fill(null));
}

function _loadManualDraft() {
  _initManualDraft();
  try {
    const s = localStorage.getItem(_getLsKey());
    if (s) {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length === 13) _manualDraft = arr;
    }
  } catch (e) {}
}

function _saveManualDraft() {
  try { localStorage.setItem(_getLsKey(), JSON.stringify(_manualDraft)); } catch (e) {}
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
  _loadManualDraft();
  _render();
}

export function unmountReport() {
  if (_container) _container.innerHTML = '';
  _container = null;
}

export function getReportSaveStatus() {
  return 'saved'; // P3 才實作 dirty 偵測
}

export function discardReportDraft() {
  // P3 才實作
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
  return `
    ${_renderDimRow(DIM_ROW_1_IDX, 6)}
    ${_renderDimRow(DIM_ROW_2_IDX, 7)}
    ${_manualDimIdx !== null ? _renderDimPanel(_manualDimIdx) : ''}
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
      _saveManualDraft();
      _renderContent();
    });
  });
  // 清空本維度
  _container.querySelectorAll('[data-mclear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = parseInt(btn.dataset.mclear, 10);
      if (!confirm(`確定清空維度「${DIMS[di].dn}」9 個部位的填答嗎？`)) return;
      _manualDraft[di] = Array(9).fill(null);
      _saveManualDraft();
      _render(); // 整個 report panel 重 paint（保險，避免 stale render）
    });
  });
}
