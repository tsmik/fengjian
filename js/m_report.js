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

import { setObsData, setUserName, setUserGender, setUserBirthday, setLiunianTable, data, avgCoeff, DIMS, calcDim, _escHtml } from './core.js';
import { buildRadar2MSVG, buildRadar3SVG } from './report_chart.js';
import { renderCoeffSummary, renderPngPreview } from './m_manual.js';
import { persistProfile, updateHomeProgress } from './m_home.js';
import { db, debugLog, refreshUserData, getEffectiveUid, getActiveCaseId, setActiveCase, listCases, createCase, updateAnalysisBanner } from './m_main.js';
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
      <div class="m-case-switch" id="m-case-switch-mount">
        <div class="m-case-switch-title">分析對象</div>
        <div class="m-case-list"><div style="color:#a89e92;font-size:13px;padding:4px 2px">載入中…</div></div>
      </div>
      <div class="m-home-card m-home-profile">
        <div class="m-home-card-title">基本資料</div>
        <div class="m-home-profile-row"><label>姓名</label><input type="text" id="m-my-profile-name" placeholder="未填寫"></div>
        <div class="m-home-profile-row"><label>出生年月日</label><input type="date" id="m-my-profile-birthday"></div>
        <div class="m-home-profile-row"><label>性別</label><select id="m-my-profile-gender"><option value="">未填寫</option><option value="男">男</option><option value="女">女</option></select></div>
        <div class="m-home-profile-status" id="m-my-profile-status"></div>
        <button class="m-home-profile-save-btn" id="m-my-profile-save" type="button">存檔</button>
      </div>
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
      <div id="m-liunian-mount" class="m-liunian-placeholder">流年載入中…</div>
    </div>
  `;
  // v1.7 階段 14：報告 tab 下方 async load 流年參考
  renderLiunianBlock().then(html => {
    if (!_container || !_isListMode) return;
    const slot = _container.querySelector('#m-liunian-mount');
    if (slot) slot.outerHTML = html;
  });
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
  _wireMyProfile();
  _renderCaseSwitcher();
}

// ===== 分析對象切換（個案管理 M1）=====
// 比照桌機：本人卡（置頂）＋依組別分區的彩色個案卡；點卡 = 切換分析對象，整塊重繪
// 14 色色盤 + 淡化底色（與桌機 case_mgmt.js 一致）
const CARD_DEFAULT_COLOR = '#D9CBA8';
const CARD_COLORS = ['#D9CBA8','#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50','#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
function _cardTint(hex) {
  hex = hex || CARD_DEFAULT_COLOR;
  if (hex.charAt(0) !== '#' || hex.length < 7) return '#ffffff';
  let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#ffffff';
  const f = 0.40;
  r = Math.round(r * f + 255 * (1 - f)); g = Math.round(g * f + 255 * (1 - f)); b = Math.round(b * f + 255 * (1 - f));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
// 沒設色的個案：依 id 雜湊穩定配一個色盤色（不同裝置同 id 同色）
function _autoColor(id) {
  let h = 0; const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CARD_COLORS[h % CARD_COLORS.length];
}
let _knownGroups = [];      // 現有組別名（給新增表單 datalist）
let _existingCaseCount = 0; // 給新個案配色用

async function _renderCaseSwitcher() {
  const mount = _container && _container.querySelector('#m-case-switch-mount');
  if (!mount) return;
  const uid = getEffectiveUid();
  const activeCaseId = getActiveCaseId();
  // 本人：從 users/{uid} 讀姓名 / 卡色 / 組別順序（目前 window.__userData 可能是個案，不能用）
  let selfName = '本人', selfColor = CARD_DEFAULT_COLOR, groupOrder = [];
  try {
    const selfSnap = await getDoc(doc(db, 'users', uid));
    if (selfSnap.exists()) {
      const sd = selfSnap.data();
      selfName = sd.displayName || '本人';
      selfColor = sd.cardColor || CARD_DEFAULT_COLOR;
      if (Array.isArray(sd.groupOrder)) groupOrder = sd.groupOrder;
    }
  } catch (e) { debugLog('[Case]', '讀本人資料失敗', e && e.message); }
  let cases = [];
  try { cases = await listCases(); } catch (e) {}
  // mount 期間可能已離開報告 tab → 不再寫
  if (!_container || !_isListMode) return;
  const m2 = _container.querySelector('#m-case-switch-mount');
  if (!m2) return;

  _existingCaseCount = cases.length;
  const esc = (s) => _escHtml(String(s == null ? '' : s));
  const caseColor = (c) => c.color || _autoColor(c.id);
  const caseMeta = (c) => [c.gender, c.birthday].filter(Boolean).join(' · ');
  const cardHtml = (c) => '<button class="m-case-item' + (activeCaseId === c.id ? ' is-active' : '')
    + '" data-case="' + esc(c.id) + '" style="background:' + _cardTint(caseColor(c)) + '">'
    + '<span class="m-case-item-name">' + esc(c.name || '(未命名)') + '</span>'
    + (caseMeta(c) ? '<span class="m-case-item-meta">' + esc(caseMeta(c)) + '</span>' : '')
    + '</button>';

  // 依組別分群
  const grouped = {};
  cases.forEach((c) => { const g = c.group || ''; (grouped[g] = grouped[g] || []).push(c); });
  const named = Object.keys(grouped).filter((g) => g !== '');
  const orderedNamed = [];
  groupOrder.forEach((g) => { if (grouped[g]) orderedNamed.push(g); });
  named.forEach((g) => { if (orderedNamed.indexOf(g) < 0) orderedNamed.push(g); });
  _knownGroups = orderedNamed.slice();

  let html = '<div class="m-case-switch-title">分析對象</div>';
  // 本人卡（自己一區，無組別標題）
  html += '<div class="m-case-list"><button class="m-case-item' + (activeCaseId ? '' : ' is-active')
    + '" data-case="" style="background:' + _cardTint(selfColor) + '">'
    + '<span class="m-case-item-name">' + esc(selfName) + '</span>'
    + '<span class="m-case-item-tag">本人</span></button></div>';
  // 各命名組別
  orderedNamed.forEach((g) => {
    html += '<div class="m-case-group-title">' + esc(g) + '<span class="m-case-group-count">（' + grouped[g].length + '）</span></div>';
    html += '<div class="m-case-list">' + grouped[g].map(cardHtml).join('') + '</div>';
  });
  // 未分組
  if (grouped[''] && grouped[''].length) {
    html += '<div class="m-case-group-title ungrouped">未分組<span class="m-case-group-count">（' + grouped[''].length + '）</span></div>';
    html += '<div class="m-case-list">' + grouped[''].map(cardHtml).join('') + '</div>';
  }
  html += '<button class="m-case-add" id="m-case-add-btn">＋ 新增個案</button><div id="m-case-add-formslot"></div>';
  m2.innerHTML = html;

  m2.querySelectorAll('.m-case-item').forEach((btn) => {
    btn.addEventListener('click', () => _switchCase(btn.dataset.case || null));
  });
  const addBtn = m2.querySelector('#m-case-add-btn');
  if (addBtn) addBtn.addEventListener('click', _showAddCaseForm);
}

async function _switchCase(caseId) {
  const cur = getActiveCaseId() || null;
  if ((caseId || null) === cur) return; // 點目前這人 = 無動作
  setActiveCase(caseId || null);
  await refreshUserData();
  try { updateHomeProgress(); } catch (e) {}
  try { updateAnalysisBanner(); } catch (e) {}
  _renderList(); // 整塊重繪：基本資料 / 報告入口 / 流年 / 清單 active 都跟著換
}

function _showAddCaseForm() {
  const slot = _container && _container.querySelector('#m-case-add-formslot');
  const addBtn = _container && _container.querySelector('#m-case-add-btn');
  if (!slot) return;
  if (addBtn) addBtn.style.display = 'none';
  const groupOpts = _knownGroups.map((g) => '<option value="' + _escHtml(String(g)) + '">').join('');
  slot.innerHTML = `
    <div class="m-case-addform">
      <input type="text" id="m-newcase-name" placeholder="個案姓名" maxlength="20">
      <select id="m-newcase-gender"><option value="">性別（可不填）</option><option value="男">男</option><option value="女">女</option></select>
      <input type="date" id="m-newcase-birthday">
      <input type="text" id="m-newcase-group" placeholder="組別（可不填，選現有或打新組名）" list="m-newcase-grouplist" maxlength="20">
      <datalist id="m-newcase-grouplist">${groupOpts}</datalist>
      <div class="m-case-addform-status" id="m-newcase-status"></div>
      <div class="m-case-addform-btns">
        <button type="button" class="m-newcase-create" id="m-newcase-create">建立並分析</button>
        <button type="button" class="m-newcase-cancel" id="m-newcase-cancel">取消</button>
      </div>
    </div>
  `;
  const nameEl = slot.querySelector('#m-newcase-name');
  if (nameEl) nameEl.focus();
  const cancelBtn = slot.querySelector('#m-newcase-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { slot.innerHTML = ''; if (addBtn) addBtn.style.display = ''; });
  const createBtn = slot.querySelector('#m-newcase-create');
  if (createBtn) createBtn.addEventListener('click', () => _createNewCase(slot, createBtn));
}

async function _createNewCase(slot, createBtn) {
  const statusEl = slot.querySelector('#m-newcase-status');
  const name = (slot.querySelector('#m-newcase-name').value || '').trim();
  if (!name) { if (statusEl) statusEl.textContent = '請填個案姓名'; return; }
  const gender = slot.querySelector('#m-newcase-gender').value || '';
  const birthday = slot.querySelector('#m-newcase-birthday').value || '';
  const group = (slot.querySelector('#m-newcase-group').value || '').trim();
  const color = CARD_COLORS[_existingCaseCount % CARD_COLORS.length]; // 自動配色，存進 doc
  createBtn.disabled = true;
  const old = createBtn.textContent;
  createBtn.textContent = '建立中…';
  try {
    const newId = await createCase({ name, gender, birthday, group, color });
    setActiveCase(newId);
    await refreshUserData();
    try { updateHomeProgress(); } catch (e) {}
    try { updateAnalysisBanner(); } catch (e) {}
    _renderList(); // 新個案建立後直接切成分析對象
  } catch (e) {
    debugLog('[Case]', '新增個案失敗', e && e.message ? e.message : e);
    if (statusEl) statusEl.textContent = '建立失敗，請重試';
    createBtn.disabled = false;
    createBtn.textContent = old;
  }
}

// 「我的」分頁基本資料：可編輯 + 按存檔才寫雲端；存檔後重繪以刷新流年
function _wireMyProfile() {
  if (!_container) return;
  const ud = window.__userData || {};
  const elName = _container.querySelector('#m-my-profile-name');
  const elBday = _container.querySelector('#m-my-profile-birthday');
  const elGender = _container.querySelector('#m-my-profile-gender');
  const elStatus = _container.querySelector('#m-my-profile-status');
  const elSave = _container.querySelector('#m-my-profile-save');
  if (!elName || !elSave) return;
  elName.value = ud.displayName || '';
  elBday.value = ud.birthday || '';
  let g = ud.gender || '';
  if (g === 'M') g = '男'; else if (g === 'F') g = '女';
  elGender.value = g;
  elSave.addEventListener('click', async () => {
    if (elStatus) { elStatus.textContent = '儲存中…'; elStatus.className = 'm-home-profile-status is-saving'; }
    try {
      await persistProfile({ displayName: elName.value, birthday: elBday.value, gender: elGender.value });
      _renderList(); // 重繪：更新流年（生日/性別可能改了）+ 重新填入
      const st = _container && _container.querySelector('#m-my-profile-status');
      if (st) { st.textContent = '已儲存'; st.className = 'm-home-profile-status is-saved'; setTimeout(() => { if (st.textContent === '已儲存') st.textContent = ''; }, 1500); }
    } catch (e) {
      debugLog('[Profile]', '儲存失敗', e && e.message ? e.message : e);
      if (elStatus) { elStatus.textContent = '儲存失敗'; elStatus.className = 'm-home-profile-status is-error'; }
    }
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

// v1.7 階段 14：流年參考 block（報告 tab 兩大按鈕下方使用）
// 排版：3 行 grid（2 + 3 + 3 cell），總寬跟按鈕一致
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
    return `<div class="m-liunian-section"><div class="m-liunian-title">流年參考</div><div class="m-liunian-empty">需在首頁填出生年月日 + 性別才能顯示</div></div>`;
  }
  const ln = info.ln;
  const cell = (label, value) => `<div class="m-liunian-cell"><span class="m-liunian-cell-label">${label}</span><span class="m-liunian-cell-value">${value || '—'}</span></div>`;
  const v75 = (ln.name75 || '') + (ln.area75 ? '／' + ln.area75 : '');
  return `
    <div class="m-liunian-section">
      <div class="m-liunian-title">流年參考${buildLiunianTitleHtml(info)}</div>
      <div class="m-liunian-row m-liunian-row-2">
        ${cell('七十五', v75)}
        ${cell('九執', ln.jiuzhi)}
      </div>
      <div class="m-liunian-row m-liunian-row-3">
        ${cell('業務', ln.yewu)}
        ${cell('親族', ln.qinzu)}
        ${cell('子女', ln.zinv)}
      </div>
      <div class="m-liunian-row m-liunian-row-3">
        ${cell('耳鼻', ln.erbei)}
        ${cell('五官', ln.wuguan)}
        ${cell('三停', ln.santing)}
      </div>
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

// 手機報告圖 SVG（radar2 報告圖 + radar3 動靜全圖）；自動/手動共用
export var R2_TITLE = '人相兵法係數圖', R3_TITLE = '人相兵法動靜分布圖', CHART_GAP = 14;
export function buildMobileChartSvgs(matrix) {
  var all = [0,1,2,3,4,5,6,7,8,9,10,11,12];
  var dimSFrac = [], dimCoeffArr = [], dimStatic = [], dimActive = [];
  for (var i = 0; i < 13; i++) {
    var s = 0, d = 0;
    for (var p = 0; p < 9; p++) { var vv = matrix[i] && matrix[i][p]; if (vv === 'A' || vv === 'B') { var t = (vv === 'A') ? DIMS[i].aT : DIMS[i].bT; if (t === '靜') s++; else d++; } }
    dimSFrac.push((s + d) > 0 ? s / (s + d) : 0.5); dimStatic.push(s); dimActive.push(d);
    var rc = calcDim(matrix, i); dimCoeffArr.push(rc && typeof rc.coeff === 'number' ? rc.coeff : 0);
  }
  var radar2 = buildRadar2MSVG({
    dimSFrac: dimSFrac, dimCoeff: dimCoeffArr,
    luckV: avgCoeff(matrix,[6,7,8])||0, postV: avgCoeff(matrix,[9,10,11,12])||0,
    preV: avgCoeff(matrix,[0,1,2,3,4,5])||0, totV: avgCoeff(matrix,all)||0
  });
  // radar3 手機版：字級放大；viewBox 與 radar2 同寬(360) → 13 邊形一樣大
  var sd = buildRadar3SVG({ dimStatic: dimStatic, dimActive: dimActive, dimCoeff: dimCoeffArr, fsName: 14, fsNum: 13.5, fsPole: 13.5, fsCore: 12.5, viewBox: '20 40 360 360' });
  return { radar2: radar2, sd: sd };
}
// 共用 HTML：標題 + 圖；bar↔radar2 與 radar2↔radar3 間隔同高(CHART_GAP)
export function chartsBlockHtml(matrix) {
  try {
    var c = buildMobileChartSvgs(matrix);
    return '<div style="padding:' + CHART_GAP + 'px 12px 0">'
      + '<div class="m-chart-title">' + R2_TITLE + '</div>' + c.radar2
      + '<div style="height:' + CHART_GAP + 'px"></div>'
      + '<div class="m-chart-title">' + R3_TITLE + '</div>' + c.sd
      + '</div>';
  } catch (e) { return ''; }
}
function _chartsHtml() { return chartsBlockHtml(data); }

// ===== 圖表輸出（手機）：SVG 字串點陣化後與表格/表頭合成；自動/手動共用 =====
function _svgToCanvas(svgStr, pxW) {
  return new Promise(function (resolve, reject) {
    var m = svgStr.match(/viewBox="([^"]+)"/);
    var vb = m ? m[1].trim().split(/\s+/).map(Number) : [0, 0, 400, 400];
    var aspect = vb[3] / vb[2];
    var pxH = Math.round(pxW * aspect);
    var sized = svgStr.replace('<svg ', '<svg width="' + pxW + '" height="' + pxH + '" ');
    var blob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () { var c = document.createElement('canvas'); c.width = pxW; c.height = pxH; var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pxW, pxH); ctx.drawImage(img, 0, 0, pxW, pxH); URL.revokeObjectURL(url); resolve(c); };
    img.onerror = function (e) { URL.revokeObjectURL(url); reject(new Error('SVG 點陣化失敗')); };
    img.src = url;
  });
}
// 標題 canvas（字級用像素值；置中）
function _titleCanvas(text, pxW, fontPx) { var h = Math.round(fontPx * 1.9); var c = document.createElement('canvas'); c.width = pxW; c.height = h; var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pxW, h); ctx.fillStyle = '#5a4f45'; ctx.font = '700 ' + Math.round(fontPx) + 'px "Noto Sans TC","PingFang TC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, pxW / 2, h * 0.55); return c; }
// 姓名表頭 canvas（左對齊；字級＝維度字大小）
function _nameHeaderCanvas(name, pxW, fontPx) { var h = Math.round(fontPx * 2.0); var pad = Math.round(fontPx * 0.6); var c = document.createElement('canvas'); c.width = pxW; c.height = h; var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pxW, h); ctx.fillStyle = '#3a3228'; ctx.font = '700 ' + Math.round(fontPx) + 'px "Noto Sans TC","PingFang TC",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(name, pad, h * 0.55); return c; }
function _stackV(cs, gap) { cs = cs.filter(Boolean); gap = gap || 0; var w = Math.max.apply(null, cs.map(function (c) { return c.width; })); var h = cs.reduce(function (a, c) { return a + c.height; }, 0) + gap * Math.max(0, cs.length - 1); var out = document.createElement('canvas'); out.width = w; out.height = h; var ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); var y = 0; cs.forEach(function (c) { ctx.drawImage(c, Math.round((w - c.width) / 2), y); y += c.height + gap; }); return out; }
// 兩張圖左右並列：總寬 totalW；各圖上方標題字級＝該圖維度字大小(14 / 360 viewBox)
async function _buildChartsRow(svgs, totalW) {
  var gap = Math.round(totalW * 0.02);
  var chartW = Math.floor((totalW - gap) / 2);
  var titleFs = 14 * chartW / 360;
  var r2c = await _svgToCanvas(svgs.radar2, chartW);
  var r3c = await _svgToCanvas(svgs.sd, chartW);
  var col2 = _stackV([_titleCanvas(R2_TITLE, chartW, titleFs), r2c], Math.round(titleFs * 0.3));
  var col3 = _stackV([_titleCanvas(R3_TITLE, chartW, titleFs), r3c], Math.round(titleFs * 0.3));
  var h = Math.max(col2.height, col3.height);
  var out = document.createElement('canvas'); out.width = chartW * 2 + gap; out.height = h;
  var ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, h);
  ctx.drawImage(col2, 0, 0); ctx.drawImage(col3, chartW + gap, 0);
  return { canvas: out, titleFs: titleFs };
}

export async function exportMobileCharts(opts) {
  opts = opts || {};
  var mode = opts.mode || 'charts'; // 'charts' | 'all'
  var srcData = opts.srcData, btn = opts.btn;
  if (btn && btn.disabled) return;
  var oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '產生中…'; }
  await new Promise(function (r) { setTimeout(r, 50); });
  try {
    await ensureDimRulesLoaded();
    await _ensureLiunianLoaded();
    if (!srcData) await refreshUserData();
    var ud = window.__userData || {};
    var displayName = ud.displayName || '報告';
    setUserName(displayName);
    var g = ud.gender || ''; if (g === 'M') g = '男'; else if (g === 'F') g = '女'; if (g) setUserGender(g);
    if (ud.birthday) setUserBirthday(ud.birthday);
    var matrix = srcData;
    if (!srcData) { if (ud.obsJson) { try { setObsData(JSON.parse(ud.obsJson)); } catch (e) {} } recalcFromObs(); matrix = data; }
    var SC = 3;
    var svgs = buildMobileChartSvgs(matrix);
    var out;
    if (mode === 'charts') {
      // 姓名（只要姓名，不要虛歲/流年）+ 兩圖左右並列
      var row = await _buildChartsRow(svgs, 1600);
      var hdr = _nameHeaderCanvas(displayName, row.canvas.width, row.titleFs);
      out = _stackV([hdr, row.canvas], Math.round(row.titleFs * 0.6));
    } else {
      // 完整表格 + 兩圖左右並列（兩圖總寬＝表格寬）
      var tableCanvas = drawReportCanvas(srcData, { checkComplete: true, scale: SC });
      var row2 = await _buildChartsRow(svgs, tableCanvas.width);
      out = _stackV([tableCanvas, row2.canvas], Math.round(CHART_GAP * SC));
    }
    var blob = await new Promise(function (r) { out.toBlob(r, 'image/png'); });
    if (!blob) throw new Error('toBlob 失敗');
    var fn = '人相兵法' + (mode === 'charts' ? '_圖表' : '_報告圖表') + '_' + displayName + '.png';
    _openPngOverlay(blob, fn);
  } catch (e) {
    debugLog('[m_report]', '圖表輸出失敗', e && e.message ? e.message : e);
    alert('產生失敗：' + (e && e.message ? e.message : e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

function _render() {
  if (!_container) return;
  if (_view === 'sens') { _renderSensView(); return; }
  // v1.7 階段 11：報告 view 比照手動輸入，加 5 段小結卡（用 obs 推算的 data 矩陣）
  // v1.7 階段 14：流年參考搬到報告 tab 兩大按鈕下方，這裡不再顯示
  _container.innerHTML = `
    ${renderCoeffSummary(data)}
    ${_chartsHtml()}
    <div class="m-report-link-wrap" style="padding:20px 16px 8px">
      <button id="m-report-png-btn" class="m-report-link-btn">產生詳盡報告（自動版PNG）</button>
      <button id="m-report-charts-btn" class="m-report-link-btn">產生圖表(PNG)</button>
      <button id="m-report-rc-btn" class="m-report-link-btn">產生報告＋圖表</button>
      <div class="m-report-link-tip">未填完維度／係數會顯示「未填完」</div>
    </div>
  `;
  const pngBtn = _container.querySelector('#m-report-png-btn');
  if (pngBtn) pngBtn.onclick = exportReportPng;
  const chartsBtn = _container.querySelector('#m-report-charts-btn');
  if (chartsBtn) chartsBtn.onclick = function () { exportMobileCharts({ mode: 'charts', btn: chartsBtn }); };
  const rcBtn = _container.querySelector('#m-report-rc-btn');
  if (rcBtn) rcBtn.onclick = function () { exportMobileCharts({ mode: 'all', btn: rcBtn }); };
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
