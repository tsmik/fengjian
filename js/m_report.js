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

import { DIMS, setObsData, setUserName, setUserGender, setUserBirthday, setLiunianTable } from './core.js';
import { auth, db, debugLog } from './m_main.js';
import { setSaveStatus, ensureDimRulesLoaded } from './m_input.js';
import { recalcFromObs } from './obs_recalc.js';
import { drawReportCanvas, _getLiunianInfo } from './report.js';
import { renderManualSens, renderAutoSens } from './m_sens.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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

// 重要參數分析 view（覆蓋 report content；不持久化，每次進報告分頁從 'report' 開始）
let _view = 'report';     // 'report' | 'sens'
let _sensType = null;     // 'auto' | 'manual'（_view === 'sens' 時有效）
let _isLoadingSens = false; // 自動版需先載 DIM_RULES + obsData baseline 才能跑 simulate

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
  // 重設分析 view 狀態：下次再進報告分頁從 report view 開始
  _view = 'report';
  _sensType = null;
  _isLoadingSens = false;
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

// ===== PNG 全螢幕 overlay：點按鈕後直接顯示 PNG，可 pinch zoom + drag + 分享 =====
let _currentPngBlob = null;
let _currentPngFilename = '';
let _pngOverlayInitialized = false;

function _initPngOverlay() {
  if (_pngOverlayInitialized) return;
  _pngOverlayInitialized = true;
  const overlay = document.getElementById('m-png-overlay');
  const img = document.getElementById('m-png-img');
  const closeBtn = document.getElementById('m-png-close');
  const shareBtn = document.getElementById('m-png-share');
  if (!overlay || !img || !closeBtn || !shareBtn) return;

  // pinch zoom + drag state
  // 縮放用 inline width（瀏覽器從原始 PNG 重採樣，不糊）；位移用 transform translate（不 rasterize）
  let tx = 0, ty = 0;
  let startDist = 0, startWidth = 0;
  let startTouchX = 0, startTouchY = 0, startTX = 0, startTY = 0;
  // 雙擊偵測：只認「單指短按 tap」，避免 pinch / drag 鬆手被誤判
  let touchStartTime = 0;
  let touchStartCount = 0;
  let didMove = false;
  let lastTapTime = 0;

  function apply() { img.style.transform = `translate(${tx}px, ${ty}px)`; }
  function reset() {
    tx = 0; ty = 0;
    img.style.maxWidth = '';
    img.style.maxHeight = '';
    img.style.width = '';
    img.style.height = '';
    img.style.transform = '';
  }

  img.addEventListener('touchstart', e => {
    touchStartTime = Date.now();
    touchStartCount = e.touches.length;
    didMove = false;
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      startWidth = img.getBoundingClientRect().width;
    } else if (e.touches.length === 1) {
      startTouchX = e.touches[0].clientX;
      startTouchY = e.touches[0].clientY;
      startTX = tx; startTY = ty;
    }
  }, { passive: false });

  img.addEventListener('touchmove', e => {
    e.preventDefault();
    didMove = true;
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / startDist;
      const naturalW = img.naturalWidth || 4000;
      const newWidth = Math.max(60, Math.min(naturalW * 2, startWidth * ratio));
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.width = newWidth + 'px';
      img.style.height = 'auto';
    } else if (e.touches.length === 1) {
      const canvasW = img.parentElement ? img.parentElement.clientWidth : 0;
      const imgW = img.getBoundingClientRect().width;
      if (imgW > canvasW + 5) {
        tx = startTX + (e.touches[0].clientX - startTouchX);
        ty = startTY + (e.touches[0].clientY - startTouchY);
        apply();
      }
    }
  }, { passive: false });

  img.addEventListener('touchend', e => {
    // 雙擊重置條件：本次操作必須是「單指 + 短按 + 沒移動」才算 tap
    const isQuickTap = touchStartCount === 1 && e.touches.length === 0 && !didMove && (Date.now() - touchStartTime < 200);
    if (isQuickTap) {
      const now = Date.now();
      if (lastTapTime > 0 && now - lastTapTime < 300) {
        reset();
        lastTapTime = 0; // 雙擊完成清 state
      } else {
        lastTapTime = now;
      }
    } else {
      lastTapTime = 0; // 非 tap（pinch / drag 鬆手）→ 清雙擊 state
    }
  });

  // 將 reset 綁到 overlay open 時呼叫
  overlay._reset = reset;

  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('is-open');
    if (img.src && img.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(img.src); } catch (e) {}
    }
    img.src = '';
    _currentPngBlob = null;
    _currentPngFilename = '';
    reset();
  });

  shareBtn.addEventListener('click', async () => {
    if (!_currentPngBlob) return;
    const file = new File([_currentPngBlob], _currentPngFilename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '人相兵法報告' });
      } catch (e) {
        if (e.name !== 'AbortError') {
          debugLog('[m_report]', 'share 失敗，fallback 下載', e && e.message);
          _fallbackDownloadBlob(_currentPngBlob, _currentPngFilename);
        }
      }
    } else {
      _fallbackDownloadBlob(_currentPngBlob, _currentPngFilename);
    }
  });
}

// 流年表 lazy load（從 settings/liunian Firestore doc）— 沿用桌機 app.js step 1.8 邏輯
let _liunianLoaded = false;
async function _ensureLiunianLoaded() {
  if (_liunianLoaded) return;
  try {
    const ref = doc(db, 'settings', 'liunian');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      debugLog('[m_report]', '流年表 doc 不存在 (settings/liunian)');
      return;
    }
    if (!snap.data().liunianJson) {
      debugLog('[m_report]', '流年表 doc 存在但 liunianJson 欄位為空');
      return;
    }
    const parsed = JSON.parse(snap.data().liunianJson);
    if (!parsed || !parsed['男'] || !parsed['女']) {
      debugLog('[m_report]', '流年表格式異常（缺男/女）');
      return;
    }
    setLiunianTable(parsed);
    _liunianLoaded = true;
    debugLog('[m_report]', '流年表載入 ✓');
  } catch (e) {
    debugLog('[m_report]', '流年表載入失敗', e && e.message);
  }
}

function _fallbackDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function _openPngOverlay(blob, filename) {
  _initPngOverlay();
  const overlay = document.getElementById('m-png-overlay');
  const img = document.getElementById('m-png-img');
  if (!overlay || !img) return;
  if (overlay._reset) overlay._reset();
  if (img.src && img.src.startsWith('blob:')) {
    try { URL.revokeObjectURL(img.src); } catch (e) {}
  }
  _currentPngBlob = blob;
  _currentPngFilename = filename;
  img.src = URL.createObjectURL(blob);
  overlay.classList.add('is-open');
}

// 共用 PNG 生成 helper：自動報告 + 手動報告共用
async function _generatePng({ srcData, drawOpts, filenameSuffix, btn }) {
  if (btn && btn.disabled) return;
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '產生中…'; }
  await new Promise(r => setTimeout(r, 50));
  try {
    await ensureDimRulesLoaded();
    await _ensureLiunianLoaded();
    const ud = window.__userData || {};
    const displayName = ud.displayName || '報告';
    setUserName(displayName);
    // 既有 user 可能有 'M'/'F' 舊資料 → 轉成桌機流年表 key '男'/'女'
    let _gender = ud.gender || '';
    if (_gender === 'M') _gender = '男';
    else if (_gender === 'F') _gender = '女';
    if (_gender) setUserGender(_gender);
    if (ud.birthday) setUserBirthday(ud.birthday);
    // 自動報告需要 recalc 出 data；手動報告直接傳 _manualDraft 不需 recalc
    if (!srcData) {
      if (ud.obsJson) {
        try { setObsData(JSON.parse(ud.obsJson)); }
        catch (e) { debugLog('[m_report]', 'obsJson parse 失敗', e && e.message); }
      }
      recalcFromObs();
    }
    // scale=3 提高解析度（手機投影到大螢幕用）；自動分支也加 checkComplete 跟桌機 exportPNG 一致
    const finalOpts = Object.assign({ scale: 3 }, drawOpts || {});
    if (!srcData && finalOpts.checkComplete === undefined) finalOpts.checkComplete = true;
    const canvas = drawReportCanvas(srcData, finalOpts);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob 失敗');
    const filename = '人相兵法' + (filenameSuffix || '') + '_' + displayName + '.png';
    _openPngOverlay(blob, filename);
  } catch (e) {
    debugLog('[m_report]', 'PNG 產生失敗', e && e.message ? e.message : e);
    alert('產生失敗：' + (e && e.message ? e.message : e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

async function exportReportPng() {
  await _generatePng({
    srcData: undefined,
    drawOpts: undefined,
    filenameSuffix: '_自動',
    btn: document.getElementById('m-report-png-btn')
  });
}

async function exportManualReportPng(btn) {
  await _generatePng({
    srcData: _manualDraft,
    drawOpts: { checkComplete: true },
    filenameSuffix: '_手動',
    btn: btn
  });
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
  if (_view === 'sens') { _renderSensView(); return; }
  // 回 report view：恢復 saveZone（若被 sens view 隱藏過）
  const saveZone = document.getElementById('m-save-zone');
  if (saveZone) saveZone.classList.remove('is-hidden');
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

// ===== 重要參數分析 view =====

async function _enterSens(type) {
  _view = 'sens';
  _sensType = type;
  _isLoadingSens = (type === 'auto'); // 自動版要先載 DIM_RULES + obsData
  _render();
  const main = document.querySelector('.m-main');
  if (main) main.scrollTop = 0;

  if (type === 'auto') {
    try { await ensureDimRulesLoaded(); }
    catch (e) { debugLog('[m_report]', 'ensureDimRulesLoaded 失敗', e && e.message); }
    // 載 obsData baseline（從 Firestore document）+ recalc 出 data
    const ud = window.__userData || {};
    if (ud.obsJson) {
      try { setObsData(JSON.parse(ud.obsJson)); }
      catch (e) { debugLog('[m_report]', 'obsJson parse 失敗', e && e.message); }
    }
    recalcFromObs();
    _isLoadingSens = false;
    // 期間 user 可能已切離 sens view → 不再重 render
    if (_view === 'sens' && _sensType === 'auto') _render();
  }
}

function _exitSens() {
  _view = 'report';
  _sensType = null;
  _isLoadingSens = false;
  _render();
}

function _renderSensView() {
  const title = _sensType === 'auto' ? '自動 重要參數分析' : '手動 重要參數分析';
  let body;
  if (_isLoadingSens) {
    body = '<div class="m-sens-empty">計算中…<br><span style="font-size:11px;color:#a89e92">首次進入需載入規則並逐題模擬翻轉，約需 2-5 秒</span></div>';
  } else {
    body = _sensType === 'auto' ? renderAutoSens() : renderManualSens(_manualDraft);
  }
  _container.innerHTML = `
    <div class="m-sens-header">
      <button class="m-sens-back" type="button">← 返回</button>
      <span class="m-sens-header-title">${title}</span>
    </div>
    <div class="m-sens-body">${body}</div>
  `;
  const backBtn = _container.querySelector('.m-sens-back');
  if (backBtn) backBtn.addEventListener('click', _exitSens);
  // 分析頁純檢視，隱藏儲存按鈕
  const saveZone = document.getElementById('m-save-zone');
  if (saveZone) saveZone.classList.add('is-hidden');
}

function _renderContent() {
  const el = _container.querySelector('#m-report-content');
  if (!el) return;
  if (_subtab === 'auto') {
    el.innerHTML = `
      <div class="m-report-link-wrap">
        <div class="m-report-link-title">詳盡兵法報告</div>
        <div class="m-report-link-desc">完整版報告（依觀察資料生成）<br>包含 9×13 矩陣 / 動靜分析 / 流年</div>
        <button id="m-report-png-btn" class="m-report-link-btn">產生詳盡報告（PNG）</button>
        <div class="m-report-link-tip">產生後在新分頁開啟，可拖曳放大縮小</div>
        <button class="m-sens-entry-btn" data-msens-entry="auto" type="button">📊 看重要參數分析</button>
      </div>
    `;
    const pngBtn = el.querySelector('#m-report-png-btn');
    if (pngBtn) pngBtn.onclick = exportReportPng;
    const sensBtn = el.querySelector('[data-msens-entry="auto"]');
    if (sensBtn) sensBtn.addEventListener('click', () => _enterSens('auto'));
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
        <button class="m-seg-btn ${_manualView === 'overview' ? 'm-seg-active' : ''}" data-mview="overview">手動兵法報告</button>
      </div>
    </div>
  `;
  let body;
  if (_manualView === 'overview') {
    body = `${_renderManualOverview()}${_renderManualPngRow()}${_renderClearAllRow()}`;
  } else {
    body = `
      ${_renderDimRow(DIM_ROW_1_IDX, 6)}
      ${_renderDimRow(DIM_ROW_2_IDX, 7)}
      ${_manualDimIdx !== null ? _renderDimPanel(_manualDimIdx) : ''}
      ${_renderClearAllRow()}
    `;
  }
  return `<div class="m-manual-card">${viewToggle}${body}</div>`;
}

function _renderClearAllRow() {
  return `
    <div class="m-manual-clear-row">
      <button class="m-manual-clear-btn m-manual-clear-btn-all" data-mclear-all="1">清除全部填答</button>
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
  //   先天指數 = 形勢 經緯 方圓 曲直 收放 緩急 (di 0~5)
  //     ├ 老闆指數 = 形勢 經緯 方圓 (di 0~2)
  //     └ 主管指數 = 曲直 收放 緩急 (di 3~5)
  //   運氣指數 = 順逆 分合 真假 (di 6~8)
  //   後天指數 = 攻守 奇正 虛實 進退 (di 9~12)
  // grid: 14 欄（部位欄 + 13 維度）× 12 列（3 header + 9 部位）
  let html = '';
  // R1: 角落 + 大分組
  html += `<div class="m-manual-cell is-corner" style="grid-row:1;grid-column:1"></div>`;
  html += `<div class="m-manual-grp m-manual-grp-pre" style="grid-row:1;grid-column:2/span 6">先天指數</div>`;
  html += `<div class="m-manual-grp m-manual-grp-luck" style="grid-row:1;grid-column:8/span 3">運氣指數</div>`;
  html += `<div class="m-manual-grp m-manual-grp-post" style="grid-row:1;grid-column:11/span 4">後天指數</div>`;
  // R2: 角落 + 子分組（老闆/主管），運氣/後天區留空
  html += `<div class="m-manual-cell is-corner" style="grid-row:2;grid-column:1"></div>`;
  html += `<div class="m-manual-subgrp m-manual-subgrp-boss" style="grid-row:2;grid-column:2/span 3">老闆指數</div>`;
  html += `<div class="m-manual-subgrp m-manual-subgrp-mgr" style="grid-row:2;grid-column:5/span 3">主管指數</div>`;
  html += `<div class="m-manual-spacer" style="grid-row:2;grid-column:8/span 7"></div>`;
  // R3: 角落 + 13 維度名
  html += `<div class="m-manual-cell is-corner" style="grid-row:3;grid-column:1"></div>`;
  for (let di = 0; di < 13; di++) {
    html += `<div class="m-manual-cell is-col-header" style="grid-row:3;grid-column:${di + 2}">${DIMS[di].dn}</div>`;
  }
  // R4~R12: 9 部位 × 13 cell
  for (let pi = 0; pi < 9; pi++) {
    const row = pi + 4;
    html += `<div class="m-manual-cell is-row-header" style="grid-row:${row};grid-column:1">${PART_LABELS[pi]}</div>`;
    for (let di = 0; di < 13; di++) {
      const v = _manualDraft[di][pi];
      let txt = '—', cls = 'is-empty';
      if (v === 'A') { txt = DIMS[di].a; cls = DIMS[di].aT === '靜' ? 'is-jing' : 'is-dong'; }
      else if (v === 'B') { txt = DIMS[di].b; cls = DIMS[di].bT === '靜' ? 'is-jing' : 'is-dong'; }
      html += `<div class="m-manual-cell ${cls}" style="grid-row:${row};grid-column:${di + 2}">${txt}</div>`;
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
  // 推算每個按鈕對應的 raw value（A/B 跟動/靜的 mapping 依維度而異）
  const aIsJing = dim.aT === '靜';
  const jingVal = aIsJing ? 'A' : 'B';
  const dongVal = aIsJing ? 'B' : 'A';
  const isJing = v === jingVal;
  const isDong = v === dongVal;
  const isEmpty = v === null;
  // 結果欄：只顯示字 + 底色色塊（靜=綠底 / 動=橘紅底 / 未答=灰底「—」）
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

function _bindManualEvents() {
  // 視圖切換 toggle
  _container.querySelectorAll('[data-mview]').forEach(btn => {
    btn.addEventListener('click', () => {
      _manualView = btn.dataset.mview;
      try { localStorage.setItem(LS_VIEW, _manualView); } catch (e) {}
      _renderContent();
    });
  });
  // 產生手動版詳盡報告 PNG
  _container.querySelectorAll('[data-mpng]').forEach(btn => {
    btn.addEventListener('click', () => {
      exportManualReportPng(btn);
    });
  });
  // 進入手動版重要參數分析
  _container.querySelectorAll('[data-msens-entry="manual"]').forEach(btn => {
    btn.addEventListener('click', () => _enterSens('manual'));
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
  // 部位 switch 三段（靜 / — / 動）
  _container.querySelectorAll('[data-msw]').forEach(btn => {
    btn.addEventListener('click', () => {
      const parts = btn.dataset.msw.split('_'); // "di_pi_val" — val 可能空字串
      const di = parseInt(parts[0], 10);
      const pi = parseInt(parts[1], 10);
      const val = parts[2] || null; // '' → null（清空）；'A'/'B' → 該值
      _manualDraft[di][pi] = val === 'A' || val === 'B' ? val : null;
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
