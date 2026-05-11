// ============================================================
// 手機版報告 tab — 自動報告（觀察結果生成）+ 自動版重要參數分析
// 職責：報告分頁 mount / unmount + 詳盡報告 PNG（自動版）+ 自動版重要參數分析
// 說明：v1.7 階段 2 之後，手動報告搬到獨立 tab（m_manual.js）。本檔只剩 auto 流程。
// 依賴：
//   - js/core.js
//   - js/m_main.js (auth, db, debugLog)
//   - js/m_input.js (ensureDimRulesLoaded)
//   - js/obs_recalc.js (recalcFromObs)
//   - js/report.js (drawReportCanvas)
//   - js/m_sens.js (renderAutoSens)
//   - firebase firestore SDK
// 被用：m_main.js（mountReport / unmountReport / discardReportDraft）
//       m_manual.js（generatePng — 共用 PNG 生成 helper）
// retest 範圍：
//   - 自動報告 view 顯示（產生詳盡報告按鈕 + 看重要參數分析入口）
//   - 詳盡報告 PNG（自動版）：產生 → overlay 顯示 → 縮放/拖曳/分享
//   - 自動版重要參數分析：進入時 ensureDimRulesLoaded + obsData baseline；返回 OK
// ============================================================

import { setObsData, setUserName, setUserGender, setUserBirthday, setLiunianTable, data } from './core.js';
import { renderCoeffSummary, renderPngPreview } from './m_manual.js';
import { db, debugLog, refreshUserData } from './m_main.js';
import { ensureDimRulesLoaded } from './m_input.js';
import { recalcFromObs } from './obs_recalc.js';
import { drawReportCanvas, _getLiunianInfo, buildLiunianTitleHtml, buildLiunianTableHtml } from './report.js';
import { renderAutoSens } from './m_sens.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let _container = null;
let _isListMode = false;     // mountReport 進「報告 tab」是 list 模式；mountAutoView 進「input 報告 view」是 auto 模式

// 重要參數分析 view（覆蓋 report content；不持久化，每次進報告分頁從 'report' 開始）
let _view = 'report';      // 'report' | 'sens'
let _isLoadingSens = false; // 自動版需先載 DIM_RULES + obsData baseline 才能跑 simulate

// ===== mount / unmount =====

// 報告 tab（純看，兩份報告卡片）— v1.7 階段 4
export function mountReport(container) {
  _container = container;
  _isListMode = true;
  _renderList();
}

export function unmountReport() {
  if (_container) _container.innerHTML = '';
  _container = null;
  _isListMode = false;
  _view = 'report';
  _isLoadingSens = false;
}

// 自動報告 view（給 m_input.js 內部報告 view mount 用）
// initView: 'report'（預設）顯示 PNG/sens 入口；'sens' 直接進重要參數分析
export function mountAutoView(container, initView = 'report') {
  _container = container;
  _isListMode = false;
  _isLoadingSens = false;
  if (initView === 'sens') {
    _enterSens();
  } else {
    _view = 'report';
    _render();
  }
}

export function unmountAutoView() {
  if (_container && !_isListMode) {
    _container.innerHTML = '';
    _container = null;
  }
  _view = 'report';
  _isLoadingSens = false;
}

// 自動報告無 draft，保留介面相容（m_main.js confirm 流程仍會呼叫）
export function discardReportDraft() {}

// 報告 tab list mode：兩份報告卡片（v1.7 階段 12+：沿用首頁 bigbtn 樣式 + once LS 機制）
function _renderList() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="m-home" style="padding:16px 14px">
      <button class="m-home-bigbtn" data-report-card="auto">
        <span class="m-home-bigbtn-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 0 1-2 2"/></svg>
        </span>
        <div class="m-home-bigbtn-meta">
          <div class="m-home-bigbtn-title">部位觀察評分報告</div>
          <div class="m-home-bigbtn-sub">輸入11部位 頭、額、耳、眉…觀察特徵，自動計算動/靜，產生報告</div>
        </div>
      </button>
      <button class="m-home-bigbtn" data-report-card="manual">
        <span class="m-home-bigbtn-icon">✎</span>
        <div class="m-home-bigbtn-meta">
          <div class="m-home-bigbtn-title">手動輸入報告</div>
          <div class="m-home-bigbtn-sub">直接輸入形勢、經緯、方圓…的動/靜，產生報告</div>
        </div>
      </button>
    </div>
  `;
  const autoCard = _container.querySelector('[data-report-card="auto"]');
  if (autoCard) autoCard.addEventListener('click', () => {
    // 跳到「部位觀察」tab 的「報告」view（once LS：mount 讀後立刻清，不破壞「點 tab bar 強制 reset 部位」邏輯）
    try { localStorage.setItem('m_input_view_once', 'report'); } catch (e) {}
    const btn = document.querySelector('.m-tab[data-tab="input"]');
    if (btn) btn.click();
  });
  const manualCard = _container.querySelector('[data-report-card="manual"]');
  if (manualCard) manualCard.addEventListener('click', () => {
    try { localStorage.setItem('m_manual_view_once', 'overview'); } catch (e) {}
    const btn = document.querySelector('.m-tab[data-tab="manual"]');
    if (btn) btn.click();
  });
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
        lastTapTime = 0;
      } else {
        lastTapTime = now;
      }
    } else {
      lastTapTime = 0;
    }
  });

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

// 流年表 lazy load（從 settings/liunian Firestore doc）
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

// ===== 共用 PNG 生成 helper（自動報告 + 手動報告共用）=====
// export 給 m_manual.js 用，避免 duplicate 邏輯

export async function generatePng({ srcData, drawOpts, filenameSuffix, btn }) {
  if (btn && btn.disabled) return;
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '產生中…'; }
  await new Promise(r => setTimeout(r, 50));
  try {
    await ensureDimRulesLoaded();
    await _ensureLiunianLoaded();
    // v1.7 階段 A：auto PNG 用最新 obsJson（cross-device sync）
    if (!srcData) await refreshUserData();
    const ud = window.__userData || {};
    const displayName = ud.displayName || '報告';
    setUserName(displayName);
    // 既有 user 可能有 'M'/'F' 舊資料 → 轉成桌機流年表 key '男'/'女'
    let _gender = ud.gender || '';
    if (_gender === 'M') _gender = '男';
    else if (_gender === 'F') _gender = '女';
    if (_gender) setUserGender(_gender);
    if (ud.birthday) setUserBirthday(ud.birthday);
    // 自動報告需要 recalc 出 data；手動報告直接傳 srcData 不需 recalc
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

// v1.7 階段 13：流年參考 block（部位觀察報告 + 手動輸入報告共用）
// 需 await ensureLiunianLoaded + setUserGender / setUserBirthday
export async function renderLiunianBlock() {
  try { await _ensureLiunianLoaded(); }
  catch (e) { debugLog('[m_report]', 'ensureLiunian 失敗', e && e.message); }
  const ud = window.__userData || {};
  let _gender = ud.gender || '';
  if (_gender === 'M') _gender = '男';
  else if (_gender === 'F') _gender = '女';
  if (_gender) setUserGender(_gender);
  if (ud.birthday) setUserBirthday(ud.birthday);
  const info = _getLiunianInfo();
  if (!info) {
    return `<div class="m-liunian-section"><div class="m-liunian-title">流年參考</div><div class="m-liunian-empty">需填出生年月日 + 性別才能顯示</div></div>`;
  }
  return `
    <div class="m-liunian-section">
      <div class="m-liunian-title">流年參考${buildLiunianTitleHtml(info)}</div>
      <div class="m-liunian-body">${buildLiunianTableHtml(info)}</div>
    </div>
  `;
}

async function exportReportPng() {
  await generatePng({
    srcData: undefined,
    drawOpts: undefined,
    filenameSuffix: '_自動',
    btn: document.getElementById('m-report-png-btn')
  });
}

// ===== render =====

function _render() {
  if (!_container) return;
  if (_view === 'sens') { _renderSensView(); return; }
  // v1.7 階段 11：報告 view 比照手動輸入，加 5 段小結卡（用 obs 推算的 data 矩陣）
  _container.innerHTML = `
    ${renderCoeffSummary(data)}
    <div class="m-report-link-wrap" style="padding:20px 16px 8px">
      <button id="m-report-png-btn" class="m-report-link-btn">產生詳盡報告（自動版PNG）</button>
      <div class="m-report-link-tip">未填完維度／係數會顯示「未填完」</div>
    </div>
    <div id="m-liunian-mount" class="m-liunian-placeholder">流年載入中…</div>
  `;
  const pngBtn = _container.querySelector('#m-report-png-btn');
  if (pngBtn) pngBtn.onclick = exportReportPng;
  // v1.7 階段 13：async load 流年參考
  renderLiunianBlock().then(html => {
    if (!_container) return;
    const slot = _container.querySelector('#m-liunian-mount');
    if (slot) slot.outerHTML = html;
  });
}

// ===== 重要參數分析 view（自動版）=====

async function _enterSens() {
  _view = 'sens';
  _isLoadingSens = true;
  _render();
  const main = document.querySelector('.m-main');
  if (main) main.scrollTop = 0;

  try { await ensureDimRulesLoaded(); }
  catch (e) { debugLog('[m_report]', 'ensureDimRulesLoaded 失敗', e && e.message); }
  // v1.7 階段 A：sens 計算用最新 obsJson（cross-device sync）
  await refreshUserData();
  // 載 obsData baseline（從 Firestore document）+ recalc 出 data
  const ud = window.__userData || {};
  if (ud.obsJson) {
    try { setObsData(JSON.parse(ud.obsJson)); }
    catch (e) { debugLog('[m_report]', 'obsJson parse 失敗', e && e.message); }
  }
  recalcFromObs();
  _isLoadingSens = false;
  // 期間 user 可能已切離 sens view → 不再重 render
  if (_view === 'sens') _render();
}

function _exitSens() {
  _view = 'report';
  _isLoadingSens = false;
  _render();
}

function _renderSensView() {
  let body;
  if (_isLoadingSens) {
    body = '<div class="m-sens-empty">計算中…<br><span style="font-size:11px;color:#a89e92">首次進入需載入規則並逐題模擬翻轉，約需 2-5 秒</span></div>';
  } else {
    body = renderAutoSens();
  }
  // 拿掉 sens header（含返回按鈕）：sens 已是 segmented 第三 tab，user 用 segmented 切回去
  _container.innerHTML = `<div class="m-sens-body">${body}</div>`;
}
