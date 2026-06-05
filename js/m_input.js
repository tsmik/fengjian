// ============================================================
// js/m_input.js
// 職責：手機版輸入 tab — 三子模式切換（部位/維度/產生報告）+ 部位視角答題
// 依賴：js/core.js (OBS_PARTS_DATA, setObsData, setObsPartsData, setObsPartNames)、js/m_main.js (auth — 用於 LS key 加 UID 後綴)
// 被誰用：js/m_main.js（tab 切換到 input 時呼叫 mountInput）
// 4b 第一段：segmented control + 部位視角答題（沿用 4a）
// 4b 第二段 Phase 1：mountInput 用 window.__userData.obsJson（登入時 m_main.js 已抓的）當 baseline，比對 LS 草稿決定狀態色塊
// 4b 第二段 Phase 1.5：LS key 加 UID 後綴，避免不同帳號在同台裝置共用草稿
// 4b 第二段 Phase 2：答題事件即時 setSaveStatus('dirty')，不需切 tab 才看到黃
// 4b 第二段 Phase 3（本段）：儲存按鈕完整邏輯（寫 Firestore obsJson + dataJson、呼叫 recalcFromObs、同步 window.__userData、清 LS、首頁進度條更新）
// 4b 第二段 Phase 3.5：lazy 載 DIM_RULES（settings/rules）給 recalcFromObs 用；錯誤訊息改用 debugLog（手機 debug 面板可見）
// 4b 第二段 Phase 4：dirty 狀態下攔截離開（tab 切由 m_main.js confirm、登出由 m_main.js confirm、重整/關 app/關 tab 由 beforeunload 原生對話框）
// 4b 第二段 Phase 4.5：「確定離開」後捨棄 LS 草稿，下次回 input 看到 Firestore baseline；提供 discardDraft() export
// 4b 第二段 Phase 3.6（本段）：lazy 載 questions（settings/questions），讓手機題目跟桌機同步（admin 改題目兩邊都看到）；mountInput 改 async + 第一次載入顯示 placeholder
// 4b 第二段：完成
// Retest 範圍：
//   - 手機 m.html input tab：子模式切換、部位答題沿用 4a；切到 input tab 時應立即顯示 Firestore 既有資料
//   - 兩個 google 帳號交替登入同一台裝置：應各自看到自己的資料（不互相污染）
//   - 桌機 staging / production：完全不該被影響
// ============================================================

import { OBS_PARTS_DATA, setObsData, setObsPartsData, setObsPartNames, setDimRules, data as coreData, DIMS, DIM_RULES, condResults, calcDim } from './core.js';
import { auth, db, debugLog, refreshUserData, getEffectiveUid, getActiveCaseId, getCurrentDocRef } from './m_main.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { recalcFromObs } from './obs_recalc.js';
import { updateHomeProgress } from './m_home.js';
import { mountAutoView, unmountAutoView, generatePng, exportMobileCharts, isLiunianReady, ensureLiunianLoaded } from './m_report.js';
import { buildManualReportParts } from './manual_report.js';
import { getLiunianInfoFor, buildLiunianTitleHtml } from './report.js';
import { hasPartUpdate, hasDimUpdate, hasUpdate, markPartSeen, markDimSeen, markQuestionSeen, onBadgeRefresh } from './m_badge.js';

// 重整（比照上課過程）：部位視角 / 維度視角 / 報告 / 參數分析 四個子 tab。
// part/dim 升級成正式子 tab（內部仍走 _view='quiz' + _quizMode，降風險不動 renderPartMode/renderDimMode）。
const SUBMODES = [
  { key: 'part',   label: '部位視角' },
  { key: 'dim',    label: '維度視角' },
  { key: 'report', label: '報告' },
  { key: 'sens',   label: '參數分析' },
];

// 6+5 異形排列
const PART_ROW_1 = ['頭', '額', '耳', '眉', '眼', '鼻'];
const PART_ROW_2 = ['口', '顴', '人中', '地閣', '頤'];

// 維度視角：13 維度排兩排 6+7（DIMS 順序）
const DIM_ROW_1_IDX = [0, 1, 2, 3, 4, 5];        // 形勢 經緯 方圓 曲直 收放 緩急
const DIM_ROW_2_IDX = [6, 7, 8, 9, 10, 11, 12];  // 順逆 分合 真假 攻守 奇正 虛實 進退
// 維度視角的 13 部位順序（Mike 自訂排版：row1 頭/上停/耳/眉/眼/鼻；row2 口/顴/人中/地閣/頤/中停/下停）
// 維度視角部位順序＝自然序（頭/上停/中停/下停/耳/眉/眼/鼻/口/顴/人中/地閣/頤）
const DIM_PART_ORDER  = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DIM_PART_LABELS = ['頭','上停','中停','下停','耳','眉','眼','鼻','口','顴','人中','地閣','頤'];

// LS key 帶 UID 後綴：每個 google 帳號在同一裝置上各有獨立草稿
function getLsKey() {
  const uid = getEffectiveUid() || 'anon';
  const caseId = getActiveCaseId();
  return 'm_input_obs_draft_' + uid + (caseId ? '_' + caseId : '');
}

let _root = null;
let _view = 'quiz';      // 'quiz' | 'report' — 上層 segmented
let _quizMode = 'part';  // 'part' | 'dim'   — 答題 view 內部視角切換
let _draft = {};
let _draftInitialized = false;          // 本次 app 載入是否已初始化 _draft（從 firestore 設過）
let _baselineFingerprintAtMount = '';   // mount 時 firestore baseline 的 JSON fingerprint，用於判斷 firestore 是否變過
let _firestoreBaseline = {};
let _expandedKey = null;
let _splitOpen = {};
let _pairedSide = {};
let _dimExpanded = null;  // 維度視角當前展開的維度 idx（null = 未展開）
let _dimPartExpanded = {};  // {di: pi} 各維度當前展開的部位 tile（互斥單選；缺 key 表示沒展開）
let _dimGroupCollapsed = {};  // {`${di}_${pi}`: Set<groupLabel>} 各 (維度,部位) 下被收合的群組

// ---------- localStorage ----------
function loadDraft() {
  try {
    const raw = localStorage.getItem(getLsKey());
    _draft = raw ? JSON.parse(raw) : {};
  } catch (e) { _draft = {}; }
}
function saveDraft() {
  try { localStorage.setItem(getLsKey(), JSON.stringify(_draft)); } catch (e) {}
}

// ---------- 狀態色塊（共用 m.html 的 #m-save-status）----------
let _currentSaveStatus = 'saved';
function setSaveStatus(state) {
  _currentSaveStatus = state;
  const el = document.getElementById('m-save-status');
  if (!el) return;
  el.classList.remove('m-save-status-saved', 'm-save-status-dirty', 'm-save-status-saving', 'm-save-status-error');
  if (state === 'saved')       { el.classList.add('m-save-status-saved');   el.textContent = '已儲存'; }
  else if (state === 'dirty')  { el.classList.add('m-save-status-dirty');   el.textContent = '未儲存'; }
  else if (state === 'saving') { el.classList.add('m-save-status-saving');  el.textContent = '儲存中…'; }
  else if (state === 'error')  { el.classList.add('m-save-status-error');   el.textContent = '失敗'; }
}

// 給 m_main.js 查詢目前狀態（攔截離開時用）
export function getSaveStatus() { return _currentSaveStatus; }

// 給 m_report.js 共用 dirty UI（同個 m-save-status element）+ DIM_RULES lazy load
export { setSaveStatus, ensureDimRulesLoaded };

// 捨棄 dirty 草稿、回到 Firestore baseline（m_main.js 在「確定離開」/登出 時呼叫）
export function discardDraft() {
  try { localStorage.removeItem(getLsKey()); } catch (e) {}
  _draft = JSON.parse(JSON.stringify(_firestoreBaseline));
  setSaveStatus('saved');
}

// 重整 / 關 app / 關 tab：dirty 時觸發瀏覽器原生確認對話框
window.addEventListener('beforeunload', function(e) {
  if (_currentSaveStatus === 'dirty') {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

// ---------- 規則載入（lazy，第一次儲存才載；recalcFromObs 依賴 DIM_RULES）----------
const RULES_CACHE_KEY = 'rxbf_rules_cache';
let _dimRulesLoaded = false;
async function ensureDimRulesLoaded() {
  if (_dimRulesLoaded) return;
  // 先試 Firestore
  try {
    const rulesRef = doc(db, 'settings', 'rules');
    const rulesSnap = await getDoc(rulesRef);
    if (rulesSnap.exists() && rulesSnap.data().rulesJson) {
      const parsed = JSON.parse(rulesSnap.data().rulesJson);
      if (Array.isArray(parsed) && parsed.length === 13 && parsed[0] && parsed[0].parts) {
        setDimRules(parsed);
        try { localStorage.setItem(RULES_CACHE_KEY, rulesSnap.data().rulesJson); } catch (e) {}
        _dimRulesLoaded = true;
        debugLog('[m_input]', '規則從 Firestore 載入');
        return;
      }
    }
    debugLog('[m_input]', 'Firestore 規則格式異常或不存在');
  } catch (e) {
    debugLog('[m_input]', 'Firestore 規則讀取失敗', e && e.message);
  }
  // fallback LS 快取
  try {
    const cached = localStorage.getItem(RULES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length === 13 && parsed[0] && parsed[0].parts) {
        setDimRules(parsed);
        _dimRulesLoaded = true;
        debugLog('[m_input]', '規則從 LS 快取載入');
        return;
      }
    }
  } catch (e) {
    debugLog('[m_input]', 'LS 快取讀取失敗', e && e.message);
  }
  throw new Error('rules load failed');
}

// ---------- 題目載入（lazy，第一次 mountInput 才載；render 依賴 OBS_PARTS_DATA）----------
const QUESTIONS_CACHE_KEY = 'rxbf_questions_cache';
let _questionsLoaded = false;
let _questionsPromise = null;
export async function ensureQuestionsLoaded() {
  if (_questionsLoaded) return;
  if (_questionsPromise) return _questionsPromise;
  _questionsPromise = (async () => {
    // 先試 Firestore
    try {
      const ref = doc(db, 'settings', 'questions');
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().questionsJson) {
        const parsed = JSON.parse(snap.data().questionsJson);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          setObsPartsData(parsed);
          setObsPartNames(Object.keys(parsed));
          try { localStorage.setItem(QUESTIONS_CACHE_KEY, snap.data().questionsJson); } catch (e) {}
          _questionsLoaded = true;
          debugLog('[m_input]', '題目從 Firestore 載入');
          return;
        }
      }
      debugLog('[m_input]', 'Firestore 題目格式異常或不存在');
    } catch (e) {
      debugLog('[m_input]', 'Firestore 題目讀取失敗', e && e.message);
    }
    // fallback LS 快取
    try {
      const cached = localStorage.getItem(QUESTIONS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          setObsPartsData(parsed);
          setObsPartNames(Object.keys(parsed));
          _questionsLoaded = true;
          debugLog('[m_input]', '題目從 LS 快取載入');
          return;
        }
      }
    } catch (e) {
      debugLog('[m_input]', 'LS 題目快取讀取失敗', e && e.message);
    }
    // fallback：用 core.js 內建（OBS_PARTS_DATA 預設已是 OBS_PARTS_DATA_DEFAULT 的深拷貝）
    _questionsLoaded = true;
    debugLog('[m_input]', '題目使用內建（無 Firestore + 無 LS 快取）');
  })();
  return _questionsPromise;
}

// ---------- 儲存（Phase 3）----------
let _isSaving = false;
async function handleSaveClick() {
  if (_isSaving) return;  // 並發 lock：防雙擊
  _isSaving = true;
  setSaveStatus('saving');
  try {
    const uid = getEffectiveUid();
    if (!uid) throw new Error('no auth user');

    // 確保 DIM_RULES 載入（recalcFromObs 依賴）
    await ensureDimRulesLoaded();

    // 把草稿同步進 core.js obsData，再呼叫 recalcFromObs 算出 9×13 矩陣
    const draftCopy = JSON.parse(JSON.stringify(_draft));
    // Sanitize：只刪「同時有 _L/_R + 主值」的 paired 題（手機格式 + 殘留主值）。
    // 桌機選「不分左右」只寫主值不寫 _L/_R → 保留主值（cross-device 兼容）。
    Object.keys(OBS_PARTS_DATA).forEach(pn => {
      const pd = OBS_PARTS_DATA[pn];
      if (!pd || !Array.isArray(pd.sections)) return;
      pd.sections.forEach(s => {
        (s.qs || []).forEach(q => {
          if (!q.paired) return;
          const hasLR = draftCopy[q.id + '_L'] != null || draftCopy[q.id + '_R'] != null;
          if (hasLR) delete draftCopy[q.id];
        });
      });
    });
    setObsData(draftCopy);
    recalcFromObs();
    const obsJsonStr = JSON.stringify(draftCopy);
    const dataJsonStr = JSON.stringify(coreData);

    // 寫 Firestore（目前分析對象：本人 users/{uid} 或個案 cases/{caseId}）
    const userRef = getCurrentDocRef();
    await setDoc(userRef, {
      obsJson: obsJsonStr,
      dataJson: dataJsonStr,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // 同步 window.__userData（避免下次 mountInput 看到舊 baseline）
    if (!window.__userData) window.__userData = {};
    window.__userData.obsJson = obsJsonStr;
    window.__userData.dataJson = dataJsonStr;

    // 清 LS 草稿、更新內部 baseline、狀態回綠、首頁進度條
    try { localStorage.removeItem(getLsKey()); } catch (e) {}
    _firestoreBaseline = JSON.parse(JSON.stringify(draftCopy));
    setSaveStatus('saved');
    updateHomeProgress();
  } catch (e) {
    // 失敗：紅色「失敗」，不清 LS、不更新 __userData，使用者可重試
    debugLog('[m_input]', '儲存失敗', e && e.message ? e.message : e);
    setSaveStatus('error');
  } finally {
    _isSaving = false;
  }
}

// ---------- 取題目（讀 OBS_PARTS_DATA：被 ensureQuestionsLoaded 載入後的版本，內建為 fallback）----------
function getSections(key) {
  const data = OBS_PARTS_DATA[key];
  if (!data || !Array.isArray(data.sections)) return [];
  return data.sections;
}
function getAllQuestions(key) {
  return getSections(key).flatMap(s => s.qs || []);
}
function isAnswered(q) {
  if (q.paired) {
    // paired 題兩種已答模式（兼容桌機 + 手機）：
    //   桌機選「不分左右」→ 寫主值 q.id，刪 _L/_R
    //   手機改 paired toggle → 寫 _L/_R，刪主值
    // 兼容：主值有值 OR _L+_R 都有值 都算已答
    return _draft[q.id] != null || (_draft[q.id + '_L'] != null && _draft[q.id + '_R'] != null);
  }
  return _draft[q.id] != null;
}
function pairedDiffStatus(qid) {
  const l = _draft[qid + '_L'];
  const r = _draft[qid + '_R'];
  if (l != null && r != null && l !== r) return 'diff';
  if ((l != null) !== (r != null)) return 'half';
  return 'none';
}
function partProgress(key) {
  const qs = getAllQuestions(key);
  if (qs.length === 0) return { done: 0, total: 0, status: 'empty' };
  const done = qs.filter(isAnswered).length;
  let status = 'none';
  if (done === 0) status = 'none';
  else if (done < qs.length) status = 'partial';
  else status = 'full';
  return { done, total: qs.length, status };
}

// ---------- 渲染 ----------
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render() {
  if (!_root) return;
  if (_view === 'report') {
    renderObsReport();          // 比照兵法報告（唯讀大表＋4 圖＋虛歲流年），餵觀察算出的矩陣
  } else if (_view === 'sens') {
    renderAutoView('sens');     // 參數分析維持原 m_report 掛載
  } else {
    renderQuizView();
  }
}

// 維度視角桌機：選部位後把 .m-main 捲回頂端，條件欄頂端的部位名＋條件就直接看得到
function _scrollDimvTop() {
  if (!_isDesktop()) return;
  const sc = (_root && _root.closest && _root.closest('.m-main')) || document.querySelector('.m-main');
  if (sc) sc.scrollTop = 0;
}

// 目前子 tab key（部位視角/維度視角 同屬 quiz，用 _quizMode 區分）
export function getInputView() { return (_view === 'quiz') ? _quizMode : _view; }
// 設定子 tab：part/dim → quiz+_quizMode；report/sens → _view（給桌機側欄 subnav + 手機 segmented 共用）
export function setInputView(key) {
  const isQuiz = (key === 'part' || key === 'dim');
  const cur = (_view === 'quiz') ? _quizMode : _view;
  if (cur === key) return;
  if ((_view === 'report' || _view === 'sens') && isQuiz) unmountAutoView();
  if (isQuiz) {
    _view = 'quiz';
    _quizMode = key;
    try { localStorage.setItem('m_input_submode', _quizMode); } catch (e) {}
  } else {
    _view = key;
  }
  try { localStorage.setItem('m_input_view', _view); } catch (e) {}
  render();
}

function renderQuizView() {
  const seg = renderSegmented();
  let content = '';
  if (_quizMode === 'part') content = renderPartMode();
  else if (_quizMode === 'dim') content = renderDimMode();
  // 維度視角版面上提（不顯示 page-hint，比照自我評分）；部位視角暫保留 hint
  const hint = (_quizMode === 'dim') ? '' : '<div class="m-page-hint">輸入11部位觀察特徵，自動計算動/靜</div>';
  _root.innerHTML = `
    ${hint}
    <div class="m-segmented m-segmented-sub">${seg}</div>
    <div class="m-submode-content">${content}</div>
  `;
  bindEvents();
}

function renderAutoView(initView) {
  // 報告 / 參數分析 view：保留上層 segmented，下方 mount m_report.js（auto report or sens）
  const seg = renderSegmented();
  unmountAutoView();
  _root.innerHTML = `
    <div class="m-page-hint">輸入11部位觀察特徵，自動計算動/靜</div>
    <div class="m-segmented m-segmented-sub">${seg}</div>
    <div class="m-submode-content"><div id="m-input-report-mount"></div></div>
  `;
  bindEvents();
  const container = _root.querySelector('#m-input-report-mount');
  if (container) mountAutoView(container, initView);
}

// ---------- 報告子 tab：比照兵法報告（唯讀），餵觀察算出的矩陣 ----------
// 把當前觀察草稿 _draft 同步進 core 並重算，回傳 13×9 'A'/'B'/null 矩陣（= core.js data）
function _obsReportMatrix() {
  try {
    setObsData(JSON.parse(JSON.stringify(_draft)));
    recalcFromObs();
  } catch (e) { debugLog('[m_input]', '報告 recalc 失敗', e && e.message); }
  return coreData;
}
// 流年八格（固定一塊，順序同兵法報告：三停 五官 九執 七十五 ／ 耳鼻 親族 子女 業務）
function _buildObsLiunianRow(ln) {
  if (!ln) return '';
  const cell = (l, v) => '<div class="m-rep-ln-cell"><span class="m-rep-ln-l">' + l + '</span><span class="m-rep-ln-v">' + (v || '—') + '</span></div>';
  const v75 = (ln.name75 || '') + (ln.area75 ? '／' + ln.area75 : '');
  return '<div class="m-rep-liunian">'
    + cell('三停', ln.santing) + cell('五官', ln.wuguan) + cell('九執', ln.jiuzhi) + cell('七十五', v75)
    + cell('耳鼻', ln.erbei) + cell('親族', ln.qinzu) + cell('子女', ln.zinv) + cell('業務', ln.yewu)
    + '</div>';
}
function _renderObsReportShareRow() {
  return `
    <div class="m-report-link-wrap" style="padding:20px 16px 8px">
      <div class="m-report-link-row">
        <button class="m-report-link-btn" data-obspng="1">分享表格報告</button>
        <button class="m-report-link-btn" data-obscharts="1">分享圖表</button>
        <button class="m-report-link-btn" data-obsrc="1">分享表格報告＋圖表</button>
      </div>
      <div class="m-report-link-tip">未填完維度／係數會顯示「未填完」</div>
    </div>`;
}
function renderObsReport() {
  const seg = renderSegmented();
  unmountAutoView();                       // 清掉前一個 sens 掛載
  const matrix = _obsReportMatrix();
  const ud = window.__userData || {};
  const meta = { name: ud.displayName || '' };
  let lnBlock = '';
  if (ud.gender && ud.birthday) {
    if (isLiunianReady()) {
      const lnInfo = getLiunianInfoFor(ud.gender, ud.birthday);
      if (lnInfo) { meta.liunianTitleHtml = buildLiunianTitleHtml(lnInfo); lnBlock = _buildObsLiunianRow(lnInfo.ln); }
    } else {
      ensureLiunianLoaded().then(() => { if (_view === 'report') render(); }).catch(() => {});
    }
  }
  const p = buildManualReportParts(matrix, meta);
  _root.innerHTML = `
    <div class="m-segmented m-segmented-sub">${seg}</div>
    <div class="m-submode-content">
      <div class="m-manual-report m-obs-report">
        ${p.titleHtml}
        ${lnBlock}
        <div class="m-manual-fullreport">${p.tableHtml}</div>
        <div class="m-rep-seg-title">分析圖</div>
        <div class="m-rep-figs">
          <div class="m-rep-chart m-rep-chart-radar2">${p.radar2Html}</div>
          <div class="m-rep-chart m-rep-chart-sd">${p.sdHtml}</div>
        </div>
        <div class="m-rep-overview">
          <div class="m-rep-chart m-rep-chart-coef">${p.coefHtml}</div>
          <div class="m-rep-chart m-rep-chart-sd2">${p.sdPairHtml}</div>
        </div>
      </div>
      ${_renderObsReportShareRow()}
    </div>
  `;
  bindEvents();
  // 分享鈕：餵觀察矩陣；4 張圖跟畫面同份 SVG（與兵法報告一致）
  _root.querySelectorAll('[data-obspng]').forEach(b => b.addEventListener('click', () =>
    generatePng({ srcData: _obsReportMatrix(), drawOpts: { checkComplete: true }, filenameSuffix: '_觀察', btn: b })));
  const _obsSvgs = () => { const q = buildManualReportParts(_obsReportMatrix(), {}); return { radar2: q.radar2Html, sd: q.sdHtml, coef: q.coefHtml, sdPair: q.sdPairHtml }; };
  _root.querySelectorAll('[data-obscharts]').forEach(b => b.addEventListener('click', () =>
    exportMobileCharts({ mode: 'charts', srcData: _obsReportMatrix(), chartSvgs: _obsSvgs(), btn: b })));
  _root.querySelectorAll('[data-obsrc]').forEach(b => b.addEventListener('click', () =>
    exportMobileCharts({ mode: 'all', srcData: _obsReportMatrix(), chartSvgs: _obsSvgs(), btn: b })));
}

function renderSegmented() {
  // 部位視角/維度視角 同屬 quiz，用 _quizMode 判斷哪個 active；報告/參數分析直接看 _view
  const cur = (_view === 'quiz') ? _quizMode : _view;
  return SUBMODES.map(m => `
    <button class="m-seg-btn ${cur === m.key ? 'm-seg-active' : ''}" data-submode="${m.key}">
      ${escapeHtml(m.label)}
    </button>
  `).join('');
}

function renderQuizViewBar() {
  const currentLabel = _quizMode === 'part' ? '部位視角' : '維度視角';
  const otherLabel = _quizMode === 'part' ? '維度視角' : '部位視角';
  return `
    <div class="m-quiz-view-bar">
      <span class="m-quiz-view-current">${escapeHtml(currentLabel)}</span>
      <button class="m-quiz-view-switch" data-quiz-switch>⇄ 切換${escapeHtml(otherLabel)}</button>
    </div>
  `;
}

function renderPlaceholder(name) {
  return `<div class="m-placeholder">${escapeHtml(name)}：即將推出</div>`;
}

// ---------- 維度視角狀態 LS persist ----------
function loadDimState() {
  try {
    const e = localStorage.getItem('m_input_dim_expanded');
    if (e != null && e !== 'null') {
      const di = parseInt(e, 10);
      if (di >= 0 && di < 13) _dimExpanded = di;
    }
  } catch (e) {}
  _dimPartExpanded = {};
  try {
    const p = localStorage.getItem('m_input_dim_part_expanded');
    if (p) {
      const parsed = JSON.parse(p);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(k => {
          const v = parsed[k];
          if (typeof v === 'number') _dimPartExpanded[k] = v;
        });
      }
    }
  } catch (e) {}
  _dimGroupCollapsed = {};
  try {
    const g = localStorage.getItem('m_input_dim_group_collapsed');
    if (g) {
      const parsed = JSON.parse(g);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(k => {
          const arr = parsed[k];
          if (Array.isArray(arr)) _dimGroupCollapsed[k] = new Set(arr);
        });
      }
    }
  } catch (e) {}
}
function saveDimExpanded() {
  try { localStorage.setItem('m_input_dim_expanded', _dimExpanded == null ? 'null' : String(_dimExpanded)); } catch (e) {}
}
function saveDimPartExpanded() {
  try { localStorage.setItem('m_input_dim_part_expanded', JSON.stringify(_dimPartExpanded)); } catch (e) {}
}
function saveDimGroupCollapsed() {
  try {
    const obj = {};
    Object.keys(_dimGroupCollapsed).forEach(k => {
      obj[k] = Array.from(_dimGroupCollapsed[k] || []);
    });
    localStorage.setItem('m_input_dim_group_collapsed', JSON.stringify(obj));
  } catch (e) {}
}
function isPartExpanded(di, pi) {
  return _dimPartExpanded[di] === pi;
}
function togglePartExpanded(di, pi) {
  // 互斥單選：點同 pi 收合（清掉 key），點別的部位切換
  if (_dimPartExpanded[di] === pi) {
    if (_isDesktop()) return; // 桌機三欄維持選取、不收合（永遠有內容）
    delete _dimPartExpanded[di];
  } else {
    _dimPartExpanded[di] = pi;
    // 手機：首次展開時所有 group 預設全部收合（避免一長串）；桌機留展開直接看條件
    if (!_isDesktop()) {
      // 頭(pi=0) 改 init 其三個子部位 13/14/15 的群組
      const _initIdxs = (pi === 0) ? [13, 14, 15] : [pi];
      _initIdxs.forEach(idx => {
        const key = _groupKey(di, idx);
        if (!_dimGroupCollapsed[key]) {
          const groups = _collectDimPartGroups(di, idx);
          const labels = groups.map(g => g.label).filter(Boolean);
          _dimGroupCollapsed[key] = new Set(labels);
        }
      });
      saveDimGroupCollapsed();
    }
  }
  saveDimPartExpanded();
}
function _groupKey(di, pi) { return di + '_' + pi; }
function isGroupCollapsed(di, pi, groupLabel) {
  const key = _groupKey(di, pi);
  const s = _dimGroupCollapsed[key];
  return !!(s && s.has(groupLabel));
}
function toggleGroupCollapsed(di, pi, groupLabel) {
  const key = _groupKey(di, pi);
  let s = _dimGroupCollapsed[key];
  if (!s) { s = new Set(); _dimGroupCollapsed[key] = s; }
  if (s.has(groupLabel)) s.delete(groupLabel); else s.add(groupLabel);
  saveDimGroupCollapsed();
}
function setAllGroupsCollapsed(di, pi, groupLabels, collapsed) {
  const key = _groupKey(di, pi);
  _dimGroupCollapsed[key] = collapsed ? new Set(groupLabels.filter(Boolean)) : new Set();
  saveDimGroupCollapsed();
}

// ---------- 維度視角（C1-C3：tile + panel + 部位群組可收合 + condItems body）----------
function _collectRefsFromNode(node, out) {
  if (!node) return;
  if (node.ref !== undefined) { out.add(node.ref); return; }
  if (node.partResult !== undefined) return;
  if (node.items) node.items.forEach(it => _collectRefsFromNode(it, out));
  if (node.item) _collectRefsFromNode(node.item, out);
  if (node.each) _collectRefsFromNode(node.each, out);
  if (node.rule) _collectRefsFromNode(node.rule, out);
}
function collectDimRefs(di) {
  const refs = new Set();
  const dim = DIM_RULES && DIM_RULES[di];
  if (!dim || !dim.parts) return refs;
  Object.keys(dim.parts).forEach(pn => _collectRefsFromNode(dim.parts[pn], refs));
  return refs;
}
function isQidAnswered(qid) {
  // single：_draft[qid] 有值；paired：_L 或 _R 有值（即視為涉及到該題）
  if (_draft[qid] != null) return true;
  if (_draft[qid + '_L'] != null || _draft[qid + '_R'] != null) return true;
  return false;
}
function dimProgress(di) {
  const refs = collectDimRefs(di);
  let done = 0;
  refs.forEach(qid => { if (isQidAnswered(qid)) done++; });
  return { done, total: refs.size };
}
// 部位 tile 進度：該維度下該部位涉及的 ref qid 已答數
function dimPartProgress(di, pi) {
  const dim = DIM_RULES && DIM_RULES[di];
  if (!dim || !dim.parts) return { done: 0, total: 0 };
  const refs = new Set();
  if (pi === 0) {
    // 頭：進度 = 頂骨/枕骨/華陽骨 三個子部位的題目
    ['頂骨', '枕骨', '華陽骨'].forEach(pn => {
      if (dim.parts[pn]) _collectRefsFromNode(dim.parts[pn], refs);
    });
  } else {
    const idx = DIM_PART_ORDER.indexOf(pi);
    const dimPartName = idx >= 0 ? DIM_PART_LABELS[idx] : null;
    if (!dimPartName || !dim.parts[dimPartName]) return { done: 0, total: 0 };
    _collectRefsFromNode(dim.parts[dimPartName], refs);
  }
  let done = 0;
  refs.forEach(qid => { if (isQidAnswered(qid)) done++; });
  return { done, total: refs.size };
}

// 從 OBS_PARTS_DATA 找題目定義（給維度視角還原 condItem 為整題用）
function _findQById(qid) {
  const parts = Object.keys(OBS_PARTS_DATA);
  for (const pn of parts) {
    const pd = OBS_PARTS_DATA[pn];
    if (!pd || !Array.isArray(pd.sections)) continue;
    for (const s of pd.sections) {
      for (const q of (s.qs || [])) {
        if (q.id === qid) return q;
      }
    }
  }
  return null;
}

// v1.7 階段 16：找 qid 對應的 part name（給紅點 mark seen 用）
function _findPartByQid(qid) {
  const parts = Object.keys(OBS_PARTS_DATA);
  for (const pn of parts) {
    const pd = OBS_PARTS_DATA[pn];
    if (!pd || !Array.isArray(pd.sections)) continue;
    for (const s of pd.sections) {
      for (const q of (s.qs || [])) {
        if (q.id === qid) return pn;
      }
    }
  }
  return null;
}

// _draft 變化後立即 sync 進 obsData + recalc，讓 condResults 反映最新狀態
// 失敗 graceful（DIM_RULES 可能未載；condResults 將維持上次計算）
function _syncRecalc() {
  try {
    setObsData(JSON.parse(JSON.stringify(_draft)));
    recalcFromObs();
  } catch (e) {}
}

// 維度視角左欄群組色（比照自我評分 _scoreGrpClass）
function _dimGrpClass(i) { return i <= 2 ? 'm-sv-grp-boss' : (i <= 5 ? 'm-sv-grp-mgr' : (i <= 8 ? 'm-sv-grp-luck' : 'm-sv-grp-post')); }
// 極字 → A/B + tone（比照自我評分 _poleOf）
function _dimPoleOf(dim, ch) {
  if (ch === dim.a) return { val: 'A', tone: dim.aT === '靜' ? 'jing' : 'dong' };
  return { val: 'B', tone: dim.bT === '靜' ? 'jing' : 'dong' };
}
// 部位門檻敘述（如「7 個部位，4 個（含）以上即為形（不形則勢）」）
function _dimPartThreshDesc(cr, dim) {
  if (!cr || cr.threshold === '無規則') return '';
  // COUNT 型用「X 個部位，Y 個（含）以上即為形（不形則勢）」；其他用引擎門檻字串
  if (cr.op === 'COUNT' && typeof cr.min === 'number' && cr.max > 0) {
    return `${cr.max} 個部位，${cr.min} 個（含）以上即為${dim.a}（不${dim.a}則${dim.b}）`;
  }
  return (typeof cr.threshold === 'string') ? cr.threshold : '';
}

// 維度視角：4 欄（維度｜部位導覽｜條件欄｜整體動靜預覽）。比照自我評分 .m-sv-* 風格
function renderDimMode() {
  if (_dimExpanded == null) _dimExpanded = DIM_ROW_1_IDX[0];
  let di = _dimExpanded; if (di == null || di < 0 || di > 12) di = 0;
  const dim = DIMS[di];
  const pa = _dimPoleOf(dim, dim.da), pb = _dimPoleOf(dim, dim.db);

  // ── 第1欄：13 維度（群組左色線、is-cur）
  const dtile = (i) => {
    const dm = DIMS[i]; if (!dm) return '';
    const dot = hasDimUpdate(dm.dn) ? '<span class="m-update-dot"></span>' : '';
    return `<button class="m-sv-dim ${_dimGrpClass(i)} ${i === di ? 'is-cur' : ''}" data-dim="${i}">${dot}${escapeHtml(dm.dn)}</button>`;
  };
  const dimList = `<div class="m-sv-dimlist"><div class="m-sv-dimrow">${DIM_ROW_1_IDX.map(dtile).join('')}</div><div class="m-sv-dimrow">${DIM_ROW_2_IDX.map(dtile).join('')}</div></div>`;
  // 維度大標題（跨欄、sticky）：維度名 + 動作說明 + 最右紅點圖例（比照部位視角）
  const dimbar = `<div class="m-sv-dimhead"><div class="m-sv-dimbar"><span class="m-sv-dimname">${escapeHtml(dim.dn)}</span><span class="m-sv-dimexp">選擇部位觀察特徵，自動計算係數</span><span class="m-dimv-legend"><span class="m-update-dot-inline"></span>新題目/內容更新</span></div></div>`;

  // 桌機預設選第一個有規則的部位
  if (_dimPartExpanded[di] == null && _isDesktop()) {
    const firstValid = DIM_PART_ORDER.find(pi => { const cr = condResults[di] && condResults[di][pi]; return cr && cr.threshold !== '無規則' && (cr.max || 0) > 0; });
    if (firstValid != null) _dimPartExpanded[di] = firstValid;
  }
  const selPi = _dimPartExpanded[di];

  // ── 第2欄：部位導覽（高 tile：名左/進度右）+ 底部已填 + 清空所有選擇
  const navTiles = DIM_PART_ORDER.map((pi, i) => {
    const label = DIM_PART_LABELS[i];
    const cr = condResults[di] && condResults[di][pi];
    const noRule = !cr || cr.threshold === '無規則' || (cr.max || 0) === 0;
    const ppr = dimPartProgress(di, pi);
    const badge = ppr.total > 0 ? `${ppr.done}/${ppr.total}` : '';
    const doneCls = (ppr.total > 0 && ppr.done === ppr.total) ? 'is-done' : (ppr.done > 0 ? 'is-partial' : '');
    const dot = hasPartUpdate(label) ? '<span class="m-update-dot-inline"></span>' : '';
    return `<button class="m-dimv-part ${pi === selPi ? 'is-cur' : ''} ${doneCls} ${noRule ? 'is-norule' : ''}" data-dim="${di}" data-pi="${pi}"><span class="m-dimv-part-name">${dot}${escapeHtml(label)}</span>${badge ? `<span class="m-dimv-part-prog">${badge}</span>` : ''}</button>`;
  }).join('');
  const dprog = dimProgress(di);
  const partNav = `<div class="m-dimv-partnav">${navTiles}<div class="m-dimv-partfoot">已填 ${dprog.done}／${dprog.total} 題</div><button class="m-eraser-btn m-dimv-clear" data-action="erase-all">清空所有觀察</button></div>`;

  // ── 第3欄：條件欄（sticky 部位名 + 門檻 + 觀察題）
  let condCol;
  if (selPi == null) {
    condCol = `<div class="m-dimv-condcol"><div class="m-sv-empty">← 點選左側部位看條件</div></div>`;
  } else {
    const selLabel = DIM_PART_LABELS[DIM_PART_ORDER.indexOf(selPi)];
    const selCr = condResults[di] && condResults[di][selPi];
    const desc = _dimPartThreshDesc(selCr, dim);
    const head = `<div class="m-dimv-parthead"><span class="m-dimv-partname">${escapeHtml(selLabel)}</span>${desc ? `<span class="m-dimv-partexp">${escapeHtml(desc)}</span>` : ''}</div>`;
    let body;
    if (!selCr || selCr.threshold === '無規則') body = `<div class="m-dim-part-content m-dim-empty">（此部位對該維度無規則）</div>`;
    else body = renderDimPartBody(di, selPi, selLabel);
    condCol = `<div class="m-dimv-condcol">${head}${body}</div>`;
  }

  // ── 第4欄：整體動靜預覽（9 主部位形/勢 + 加總 + 係數，唯讀，白底）
  const PREV_LABELS = ['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  let pvA = 0, pvB = 0;
  const pvRows = PREV_LABELS.map((label, pi) => {
    const v = coreData[di] && coreData[di][pi];
    const aOn = v === pa.val, bOn = v === pb.val, wait = (v !== 'A' && v !== 'B');
    if (aOn) pvA++; else if (bOn) pvB++;
    let poles;
    if (wait) {
      // 未填完：整條淡灰「請填答」，跟有算出形勢的列一樣高
      poles = `<span class="m-dimv-pv-poles"><span class="m-dimv-pv-wait">請填答</span></span>`;
    } else {
      const ba = `<span class="m-dimv-pv-pole ${aOn ? 'is-' + pa.tone : ''}">${aOn ? escapeHtml(dim.da) : '&nbsp;'}</span>`;
      const bb = `<span class="m-dimv-pv-pole ${bOn ? 'is-' + pb.tone : ''}">${bOn ? escapeHtml(dim.db) : '&nbsp;'}</span>`;
      poles = `<span class="m-dimv-pv-poles">${ba}${bb}</span>`;
    }
    return `<div class="m-dimv-pv-row"><span class="m-dimv-pv-name">${escapeHtml(label)}</span>${poles}</div>`;
  }).join('');
  // 加總（形X/勢Y，9 主部位）放在係數上方
  const pvSum = `<div class="m-dimv-pv-row m-dimv-pv-sumrow"><span class="m-dimv-pv-name">加總</span><span class="m-dimv-pv-poles"><span class="m-dimv-pv-num">${pvA}</span><span class="m-dimv-pv-num">${pvB}</span></span></div>`;
  // 未填完（9 主部位有任一未算出）→ 係數框改灰底「未填完」，不顯示動 係數=
  const dimComplete = PREV_LABELS.every((_, pi) => { const v = coreData[di] && coreData[di][pi]; return v === 'A' || v === 'B'; });
  let pvCoeff;
  if (!dimComplete) {
    pvCoeff = `<div class="m-dimv-pv-coeff is-wait">未填完</div>`;
  } else {
    const r = calcDim(coreData, di);
    let cWord = '—', cVal = '', cTone = 'even';
    if (r) { cVal = r.coeff.toFixed(2); if (r.a > r.b) { cWord = dim.aT; cTone = dim.aT === '靜' ? 'jing' : 'dong'; } else if (r.b > r.a) { cWord = dim.bT; cTone = dim.bT === '靜' ? 'jing' : 'dong'; } else cWord = '平'; }
    pvCoeff = `<div class="m-dimv-pv-coeff is-${cTone}"><span>${escapeHtml(cWord)}</span><span class="r">係數 ${cVal || '—'}</span></div>`;
  }
  const pvHead = `<div class="m-dimv-pv-colhead"><span class="h-${pa.tone}">${escapeHtml(dim.da)}</span><span class="h-${pb.tone}">${escapeHtml(dim.db)}</span></div>`;
  const preview = `<div class="m-dimv-prevcol"><div class="m-dimv-pv-card">${pvHead}${pvRows}${pvSum}${pvCoeff}</div></div>`;

  return `<div class="m-score-view m-dim-scoreview m-dimv"><div class="m-dimv-row1">${dimList}<div class="m-dimv-main">${dimbar}<div class="m-dimv-body">${partNav}${condCol}${preview}</div></div></div></div>`;
}

function renderDimTile(di) {
  const dm = DIMS[di];
  if (!dm) return '';
  const isOpen = _dimExpanded === di;
  const prog = dimProgress(di);
  // 顏色表示答題狀態（取代進度數字）：未答完 → 淡黃 m-dim-tile-todo；答完 → 白底
  const todoCls = (prog.total > 0 && prog.done < prog.total) ? 'm-dim-tile-todo' : '';
  // 群組色（文字色）：0-2 老闆、3-5 主管、6-8 運氣、9-12 後天
  let grpCls = '';
  if (di <= 2) grpCls = 'm-grp-tile-boss';
  else if (di <= 5) grpCls = 'm-grp-tile-mgr';
  else if (di <= 8) grpCls = 'm-grp-tile-luck';
  else grpCls = 'm-grp-tile-post';
  // v1.7 階段 16：admin 改規則 → 紅點
  const dot = hasDimUpdate(dm.dn) ? '<span class="m-update-dot"></span>' : '';
  return `
    <button class="m-tile m-dim-tile ${grpCls} ${todoCls} ${isOpen ? 'm-tile-open' : ''}" data-dim="${di}">
      ${dot}
      <span class="m-tile-label">${escapeHtml(dm.dn)}</span>
    </button>
  `;
}

function renderDimPanel(di) {
  const dm = DIMS[di];
  if (!dm) return '';
  // A2（§11）桌機三欄：預設展開第一個「有規則」的部位，右側一進來就看到老師條件
  if (_dimPartExpanded[di] == null && _isDesktop()) {
    const firstValid = DIM_PART_ORDER.find(pi => {
      const cr = condResults[di] && condResults[di][pi];
      return cr && cr.threshold !== '無規則' && (cr.max || 0) > 0;
    });
    if (firstValid != null) _dimPartExpanded[di] = firstValid;
  }
  // 維度大標題（左：維度名 + 觀點；右：進度 N/M 或結果字）
  const prog = dimProgress(di);
  const completed = prog.total > 0 && prog.done === prog.total;
  let progDisplay = '';
  if (completed) {
    const r = calcDim(coreData, di);
    if (r) {
      let resultChar = '';
      if (r.a > r.b) resultChar = dm.a;
      else if (r.b > r.a) resultChar = dm.b;
      else resultChar = '－';
      progDisplay = `<span class="m-dim-title-result">${escapeHtml(resultChar)}</span>`;
    } else {
      progDisplay = `<span class="m-dim-title-progress">${prog.done}/${prog.total}</span>`;
    }
  } else if (prog.total > 0) {
    progDisplay = `<span class="m-dim-title-progress">${prog.done}/${prog.total}</span>`;
  }
  const head = `
    <div class="m-dim-panel-head">
      <span class="m-dim-title-name">${escapeHtml(dm.dn)}</span>
      <span class="m-dim-title-view">${escapeHtml(dm.view || '')}</span>
      <span class="m-dim-title-spacer"></span>
      ${progDisplay}
    </div>
  `;
  // 部位 tile 兩排 6+7（13 個，沿用維度規則部位順序）
  const PART_ROW1_COUNT = 6;
  const partTilesRow1 = DIM_PART_ORDER.slice(0, PART_ROW1_COUNT)
    .map((pi, i) => renderDimPartTile(di, pi, DIM_PART_LABELS[i])).join('');
  const partTilesRow2 = DIM_PART_ORDER.slice(PART_ROW1_COUNT)
    .map((pi, i) => renderDimPartTile(di, pi, DIM_PART_LABELS[PART_ROW1_COUNT + i])).join('');
  // 當前展開的部位 tile body（互斥單選）
  const expandedPi = _dimPartExpanded[di];
  const partContent = (expandedPi != null)
    ? renderDimPartContent(di, expandedPi, DIM_PART_LABELS[DIM_PART_ORDER.indexOf(expandedPi)])
    : '';
  return `
    <div class="m-panel m-dim-panel" data-dim="${di}">
      ${head}
      <div class="m-dim-sublayout">
        <div class="m-dim-part-list">
          <div class="m-input-row m-dim-part-row m-dim-part-row-6">${partTilesRow1}</div>
          <div class="m-input-row m-dim-part-row m-dim-part-row-7">${partTilesRow2}</div>
        </div>
        <div class="m-dim-partcontent-wrap">${partContent || '<div class="m-part-panel-hint">← 點選部位看老師條件</div>'}</div>
      </div>
    </div>
  `;
}

function renderDimPartTile(di, pi, label) {
  const cr = (condResults[di] && condResults[di][pi]) || null;
  const noRule = !cr || cr.threshold === '無規則' || (cr.max || 0) === 0;
  const isOpen = isPartExpanded(di, pi);
  const prog = dimPartProgress(di, pi);
  const badge = prog.total > 0 ? (prog.done + '/' + prog.total) : '';
  const statusClass = prog.total > 0 && prog.done === prog.total
    ? 'm-tile-full'
    : (prog.done > 0 ? 'm-tile-partial' : '');
  return `
    <button class="m-tile m-dim-part-tile ${statusClass} ${isOpen ? 'm-tile-open' : ''} ${noRule ? 'm-dim-part-tile-norule' : ''}" data-dim="${di}" data-pi="${pi}">
      <span class="m-tile-label">${escapeHtml(label)}</span>
      ${badge ? `<span class="m-tile-badge">${escapeHtml(badge)}</span>` : ''}
    </button>
  `;
}

// 部位 tile 展開後的內容：頂部「全部展開/全部收合」按鈕 + groupLabel sections（每 section 可獨立收合）
function renderDimPartContent(di, pi, label) {
  const cr = condResults[di] && condResults[di][pi];
  if (!cr || cr.threshold === '無規則') {
    return `<div class="m-dim-part-content m-dim-empty">（此部位對該維度無規則）</div>`;
  }
  const items = Array.isArray(cr.items) ? cr.items : [];
  if (items.length === 0) {
    return `<div class="m-dim-part-content m-dim-empty">（無條件項）</div>`;
  }
  return `
    <div class="m-dim-part-content" data-dim="${di}" data-pi="${pi}">
      <div class="m-dim-part-content-head">
        <span class="m-dim-part-content-title">${escapeHtml(label)}</span>
        <span class="m-dim-actions">
          <button class="m-dim-action-btn" data-dim-action="group-expand-all" data-dim="${di}" data-pi="${pi}">全部展開</button>
          <button class="m-dim-action-btn" data-dim-action="group-collapse-all" data-dim="${di}" data-pi="${pi}">全部收合</button>
        </span>
      </div>
      ${renderDimPartBody(di, pi, label)}
    </div>
  `;
}

// dim_part 的 body：按 condItem.groupLabel 分組，每 group 可獨立收合
//   Lv2 = groupLabel（admin 規則群組名，例「頂骨龜背/圓」）+ ▼/▶ chevron
//   Lv3 = renderQuestion（該 group 涉及題目去重後渲染，paired 用整題 sync/split toggle）
function _collectDimPartGroups(di, pi) {
  const cr = condResults[di] && condResults[di][pi];
  const items = (cr && Array.isArray(cr.items)) ? cr.items : [];
  const groups = [];
  let cur = null;
  items.forEach(it => {
    const gl = it.groupLabel || null;
    if (!cur || cur.label !== gl) {
      cur = { label: gl, qids: [], qidSet: new Set(), partResults: [] };
      groups.push(cur);
    }
    const hasIds = Array.isArray(it.ids) && it.ids.length > 0;
    if (hasIds) {
      it.ids.forEach(qid => {
        if (!cur.qidSet.has(qid)) { cur.qidSet.add(qid); cur.qids.push(qid); }
      });
    } else {
      // partResult 引用（中停/下停常見）— ids 為空，純結論列示
      cur.partResults.push(it);
    }
  });
  return groups;
}
// 頭的 3 個子部位（題庫中是頭底下的 section，規則引擎中是獨立 part 13/14/15）
const HEAD_SUBPARTS = [[13, '頂骨'], [14, '枕骨'], [15, '華陽骨']];

// 關聯部位（中停/下停常見）：列 眉/眼/鼻/顴 等引用部位的 L/R 唯讀動靜 bar + 「→X部觀察」快速鍵
// 未填完該部位 → 整條淡灰「請填答」；顴等只顯示動靜、不放觀察選項（選項在該部位填）
function _renderRelatedParts(di, partResults) {
  if (!partResults || !partResults.length) return '';
  const dim = DIMS[di];
  const pa = _dimPoleOf(dim, dim.da), pb = _dimPoleOf(dim, dim.db);
  const order = [], byPart = {};
  partResults.forEach(it => {
    const pn = it.partN || it.label || '';
    if (!byPart[pn]) { byPart[pn] = { L: null, R: null, single: null }; order.push(pn); }
    if (it.side === 'L') byPart[pn].L = it;
    else if (it.side === 'R') byPart[pn].R = it;
    else byPart[pn].single = it;
  });
  return order.map(pn => {
    const g = byPart[pn];
    const refPi = DIM_PART_LABELS.indexOf(pn);
    let refDone = false;
    if (refPi >= 0) { const p = dimPartProgress(di, refPi); refDone = p.total > 0 && p.done === p.total; }
    const unit = (it, sideLabel) => {
      const name = (sideLabel || '') + pn;
      let bar;
      if (!refDone) {
        bar = `<span class="m-dimv-refbar is-wait">請填答</span>`;
      } else {
        const resultVal = it && it.ok ? 'A' : 'B';   // 符合條件＝形＝dim.a 側
        const ba = `<span class="m-sv-pole ${resultVal === pa.val ? 'is-' + pa.tone : ''}">${escapeHtml(dim.da)}</span>`;
        const bb = `<span class="m-sv-pole ${resultVal === pb.val ? 'is-' + pb.tone : ''}">${escapeHtml(dim.db)}</span>`;
        bar = `<span class="m-sv-poles">${ba}${bb}</span>`;
      }
      return `<span class="m-dimv-refunit"><span class="m-dimv-refname">${escapeHtml(name)}</span>${bar}</span>`;
    };
    let units;
    if (g.L || g.R) units = (g.L ? unit(g.L, '左') : '') + (g.R ? unit(g.R, '右') : '');
    else units = unit(g.single, '');
    // 左右並列在第一行；快速鍵放第二行
    const linkRow = refPi >= 0 ? `<div class="m-dimv-reflinkrow"><button class="m-dimv-reflink" data-dim-jump="${refPi}" data-dim="${di}">→ ${escapeHtml(pn)}部觀察</button></div>` : '';
    return `<div class="m-dimv-refrow"><div class="m-dimv-refgrp">${units}</div>${linkRow}</div>`;
  }).join('');
}

// 渲染某 (維度,部位idx) 的所有群組（可填題目 + partResult 關聯部位）
function _renderDimGroupsHtml(di, partIdx) {
  const groups = _collectDimPartGroups(di, partIdx);
  if (groups.length === 0) return '';
  return groups.map(g => {
    const collapsed = g.label ? isGroupCollapsed(di, partIdx, g.label) : false;
    const chevron = g.label ? (collapsed ? '▶' : '▼') : '';
    let bodyHtml = '';
    if (!collapsed) {
      // 一般題目（refs 還原，可填）
      const qsHtml = g.qids.map(qid => {
        const q = _findQById(qid);
        return q ? renderQuestion(q) : '';
      }).filter(Boolean).join('');
      // partResult → 關聯部位（L/R 唯讀動靜 bar + 快速鍵）
      const prHtml = _renderRelatedParts(di, g.partResults);
      bodyHtml = qsHtml + prHtml;
    }
    return `
      <div class="m-dim-group">
        ${g.label ? `
          <div class="m-dim-group-header" data-dim="${di}" data-pi="${partIdx}" data-group-label="${escapeHtml(g.label)}">
            <span class="m-dim-group-chevron">${chevron}</span>
            <span class="m-dim-group-label">${escapeHtml(g.label)}</span>
          </div>
        ` : ''}
        <div class="m-dim-group-body" ${collapsed ? 'style="display:none"' : ''}>${bodyHtml}</div>
      </div>
    `;
  }).join('');
}

function renderDimPartBody(di, pi, dimPartName) {
  // 頭：展開頂骨/枕骨/華陽骨 三個子部位的可填條件（取代原本的達標摘要）
  if (pi === 0) {
    const inner = HEAD_SUBPARTS.map(([sidx, slabel]) => {
      const cr = condResults[di] && condResults[di][sidx];
      if (!cr || cr.threshold === '無規則') return '';
      const gh = _renderDimGroupsHtml(di, sidx);
      if (!gh) return '';
      return `<div class="m-dim-subpart"><div class="m-dim-subpart-title">${escapeHtml(slabel)}</div>${gh}</div>`;
    }).filter(Boolean).join('');
    return `<div class="m-dim-part-body">${inner || '<div class="m-dim-empty">（無條件項）</div>'}</div>`;
  }
  const gh = _renderDimGroupsHtml(di, pi);
  return `<div class="m-dim-part-body">${gh || '<div class="m-dim-empty">（無條件項）</div>'}</div>`;
}

// A1（§10）：部位視角頂端總計 — 加總 11 部位 done/total（純前台）
function partGrandTotal() {
  let done = 0, total = 0;
  [...PART_ROW_1, ...PART_ROW_2].forEach(k => {
    const p = partProgress(k);
    done += p.done; total += p.total;
  });
  return { done, total };
}
function renderPartSummary() {
  const { done, total } = partGrandTotal();
  const pct = total ? Math.round(done / total * 100) : 0;
  return `
    <div class="m-part-summary">
      <div class="m-part-summary-bar"><div class="m-part-summary-fill" style="width:${pct}%"></div></div>
      <div class="m-part-summary-text">已填 <b>${done}</b>／共 ${total} 題</div>
    </div>
  `;
}
// A1（§10）：圖例常駐。目前僅 🔴 新題（需作答）；🟡「內容更新 vs 新題」區分需先動 admin computeUpdateLog
// 記變更類型（§10.3），未經指示先不做 → 暫不顯示 🟡 圖例（避免出現永不亮的記號）。
function renderPartLegend() {
  return `<div class="m-part-legend"><span class="m-update-dot-inline"></span>新題目（需作答）</div>`;
}

// A1（§10）桌機兩欄式判斷（與 app.html @media 斷點一致）
function _isDesktop() {
  try { return window.matchMedia('(min-width:1024px)').matches; } catch (e) { return false; }
}

function renderPartMode() {
  // A1（§10）桌機兩欄：預設展開第一個部位，右側面板一進來就有內容（手機維持收合）
  if (!_expandedKey && _isDesktop()) _expandedKey = PART_ROW_1[0];
  const row1 = PART_ROW_1.map(k => renderPartTile(k)).join('');
  const row2 = PART_ROW_2.map(k => renderPartTile(k)).join('');
  const eraser = `<div class="m-eraser-slot"><button class="m-eraser-btn" data-action="erase-all" aria-label="清空所有觀察資料" title="清空所有觀察資料"><svg class="m-eraser-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg><span class="m-eraser-text">清空</span></button></div>`;
  const panel = _expandedKey ? `
    <div class="m-panel" data-panel="${escapeHtml(_expandedKey)}">
      ${renderSections(_expandedKey)}
    </div>
  ` : `<div class="m-part-panel-hint">← 點選左側部位開始觀察</div>`;
  return `
    ${renderPartSummary()}
    ${renderPartLegend()}
    <div class="m-part-layout">
      <div class="m-part-list">
        <div class="m-input-row m-input-row-6">${row1}</div>
        <div class="m-input-row m-input-row-5">${row2}${eraser}</div>
      </div>
      <div class="m-part-panel-wrap">${panel}</div>
    </div>
  `;
}

function renderPartTile(key) {
  const prog = partProgress(key);
  const isOpen = _expandedKey === key;
  const statusClass = `m-tile-${prog.status}`;
  const badge = prog.status === 'full' ? '✓'
              : prog.status === 'partial' ? `${prog.done}/${prog.total}` : '';
  // v1.7 階段 16：admin 更新題目 → 顯示紅點（user 點開部位 mark seen 後消失）
  const dot = hasPartUpdate(key) ? '<span class="m-update-dot"></span>' : '';
  return `
    <button class="m-tile ${statusClass} ${isOpen ? 'm-tile-open' : ''}" data-key="${escapeHtml(key)}">
      ${dot}
      <span class="m-tile-label">${escapeHtml(key)}</span>
      ${badge ? `<span class="m-tile-badge">${escapeHtml(badge)}</span>` : ''}
    </button>
  `;
}

function renderSections(key) {
  const secs = getSections(key);
  if (secs.length === 0) return `<div class="m-panel-empty">（此部位無題目）</div>`;
  // A1（§10）：每個 section 小標帶 done/total ＋ section 紅點（聚合該段題目層級更新）。
  // 對「頭」即為三骨（頂骨/枕骨/華陽骨）各自進度；其餘部位同樣受惠。
  return secs.map(s => {
    const qs = s.qs || [];
    const secDone = qs.filter(isAnswered).length;
    const secDot = qs.some(q => hasUpdate('q_' + key + '_' + q.id)) ? '<span class="m-update-dot-inline"></span>' : '';
    const secProg = qs.length ? `<span class="m-section-prog">${secDone}/${qs.length}</span>` : '';
    return `
    <div class="m-section">
      ${s.label ? `<div class="m-section-label">${secDot}<span class="m-section-label-text">${escapeHtml(s.label)}</span>${secProg}</div>` : ''}
      ${qs.map(q => renderQuestion(q, key)).join('')}
    </div>
  `;
  }).join('');
}

function renderQuestion(q, partName) {
  // v1.7 階段 16+：partName 可選；維度視角等 caller 不傳 → 反推
  partName = partName || _findPartByQid(q.id);
  return q.paired ? renderPairedQuestion(q, partName) : renderSingleQuestion(q, partName);
}

// 題目層級紅點（admin 改某題 → 該題顯示紅點）
function _questionDot(partName, qid) {
  if (!partName) return '';
  return hasUpdate('q_' + partName + '_' + qid) ? '<span class="m-update-dot-inline"></span>' : '';
}

function renderOptions(qid, curVal, opts) {
  // 說明(hint)常駐顯示在選項下方（上課筆記款），ⓘ 當 icon、不再點開收合（避免與選取誤觸衝突）
  return (opts || []).map(o => {
    const v = o.v;
    const hint = o.hint || '';
    const sel = curVal === v ? 'm-opt-selected' : '';
    return `
      <button class="m-opt ${sel}" data-qid="${escapeHtml(qid)}" data-val="${escapeHtml(v)}">
        <span class="m-opt-v">${escapeHtml(v)}</span>
        ${hint ? `<span class="m-opt-hint"><span class="m-opt-hint-i">ⓘ</span>${escapeHtml(hint)}</span>` : ''}
      </button>
    `;
  }).join('');
}

function renderSingleQuestion(q, partName) {
  const todoCls = isAnswered(q) ? '' : ' m-q-todo';
  const dot = _questionDot(partName, q.id);
  return `
    <div class="m-q${todoCls}">
      <div class="m-q-text">${dot}${escapeHtml(q.text || q.id)}</div>
      <div class="m-q-opts">${renderOptions(q.id, _draft[q.id], q.opts)}</div>
    </div>
  `;
}

// 結論 chip：兩邊都答 + 一致 → 「左右一致」綠 chip；不同 → 「左X 右Y」chip
//                         一邊答另邊未答 → 「左X」或「右X」+「未答」灰 chip；都未答 → 不顯示
function _pairedConclusionChip(qid) {
  const vL = _draft[qid + '_L'];
  const vR = _draft[qid + '_R'];
  if (vL == null && vR == null) return '';
  if (vL != null && vR != null) {
    if (vL === vR) return `<span class="m-q-tag">左右一致</span>`;
    return `<span class="m-q-tag m-q-tag-diff">左${escapeHtml(vL)}　右${escapeHtml(vR)}</span>`;
  }
  if (vL != null) return `<span class="m-q-tag m-q-tag-warn">左${escapeHtml(vL)}　右未答</span>`;
  return `<span class="m-q-tag m-q-tag-warn">左未答　右${escapeHtml(vR)}</span>`;
}
// 兩欄選項按鈕（每欄上下列出，無 hint）
function _renderPairedColumnOpts(qid, side, opts) {
  const draftKey = qid + '_' + side;
  const curVal = _draft[draftKey];
  return (opts || []).map(o => {
    const v = typeof o === 'string' ? o : o.v;
    const sel = curVal === v ? 'm-opt-selected' : '';
    return `
      <button class="m-opt m-opt-col ${sel}" data-qid="${escapeHtml(draftKey)}" data-val="${escapeHtml(v)}">
        <span class="m-opt-v">${escapeHtml(v)}</span>
      </button>
    `;
  }).join('');
}
function renderPairedQuestion(q, partName) {
  const isOpen = !!_splitOpen[q.id];
  const _todoCls = isAnswered(q) ? '' : ' m-q-todo';
  const chip = _pairedConclusionChip(q.id);
  const dot = _questionDot(partName, q.id);
  if (!isOpen) {
    // closed：sync 單排選項保留快速答題（直接點同步答 _L _R）+ 結論 chip
    return `
      <div class="m-q m-q-paired${_todoCls}">
        <div class="m-q-head">
          <span class="m-q-text">${dot}${escapeHtml(q.text || q.id)}</span>
          <button class="m-paired-toggle" data-pair-id="${escapeHtml(q.id)}" data-action="open">左/右</button>
          ${chip}
        </div>
        <div class="m-q-opts">${renderOptions(q.id + '__sync', _draft[q.id + '_L'] != null ? _draft[q.id + '_L'] : _draft[q.id], q.opts)}</div>
      </div>
    `;
  }
  // open：兩欄並排，每欄選項上下列出（無 hint）
  return `
    <div class="m-q m-q-paired m-q-paired-open${_todoCls}">
      <div class="m-q-head">
        <span class="m-q-text">${dot}${escapeHtml(q.text || q.id)}</span>
        <button class="m-paired-toggle m-paired-toggle-active" data-pair-id="${escapeHtml(q.id)}" data-action="close">左/右</button>
        ${chip}
      </div>
      <div class="m-q-paired-cols">
        <div class="m-q-paired-col">
          <div class="m-q-paired-col-head">左</div>
          <div class="m-q-paired-col-opts">${_renderPairedColumnOpts(q.id, 'L', q.opts)}</div>
        </div>
        <div class="m-q-paired-col">
          <div class="m-q-paired-col-head">右</div>
          <div class="m-q-paired-col-opts">${_renderPairedColumnOpts(q.id, 'R', q.opts)}</div>
        </div>
      </div>
    </div>
  `;
}

// ---------- 事件 ----------
function bindEvents() {
  if (!_root) return;

  // 上層 segmented（手機顯示；桌機改用左側欄 subnav，同 setInputView 邏輯）
  _root.querySelectorAll('.m-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setInputView(btn.dataset.submode));
  });

  // 答題 view 內：視角切換（部位 ↔ 維度）
  _root.querySelectorAll('[data-quiz-switch]').forEach(btn => {
    btn.addEventListener('click', () => {
      _quizMode = (_quizMode === 'part') ? 'dim' : 'part';
      try { localStorage.setItem('m_input_submode', _quizMode); } catch (e) {}
      render();
    });
  });

  // 部位 tile
  _root.querySelectorAll('.m-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (!key) return; // dim tile 由下方 .m-dim-tile handler 處理
      const wasOpen = _expandedKey === key;
      // 桌機兩欄維持「永遠有面板」：點已開的部位不收合（只有手機收合）
      _expandedKey = wasOpen ? (_isDesktop() ? key : null) : key;
      // v1.7 階段 16：點開部位 → mark seen
      if (!wasOpen) markPartSeen(key);
      render();
    });
  });

  // hint ⓘ 圖示：點開/收合該選項的 hint 文字（不觸發答題）
  _root.querySelectorAll('.m-opt-hint-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const btn = icon.closest('.m-opt');
      if (!btn) return;
      const hint = btn.querySelector('.m-opt-hint');
      if (hint) hint.classList.toggle('is-hidden');
    });
  });

  // 答題（toggle：點已選的選項再點一次 → 取消選取）
  _root.querySelectorAll('.m-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // 點 ⓘ 圖示不算答題（hint icon 自己 stopPropagation 已擋；雙重保險）
      if (e.target.closest('[data-hint-toggle]')) return;
      e.stopPropagation();
      const qid = btn.dataset.qid;
      const val = btn.dataset.val;
      if (qid.endsWith('__sync')) {
        const realId = qid.slice(0, -6);
        // 判「目前是否選中」：手機格式 _L=_R=val OR 桌機格式 主值=val
        const lEq = _draft[realId + '_L'] === val;
        const rEq = _draft[realId + '_R'] === val;
        const mainEq = _draft[realId] === val;
        const isSelected = (lEq && rEq) || (mainEq && _draft[realId + '_L'] == null && _draft[realId + '_R'] == null);
        if (isSelected) {
          // 取消：三個都清（兼容桌機主值殘留）
          delete _draft[realId + '_L'];
          delete _draft[realId + '_R'];
          delete _draft[realId];
        } else {
          // 選新答案：寫 _L/_R，清主值（避免桌機主值 stale）
          _draft[realId + '_L'] = val;
          _draft[realId + '_R'] = val;
          delete _draft[realId];
        }
      } else {
        if (_draft[qid] === val) {
          delete _draft[qid];
        } else {
          _draft[qid] = val;
        }
      }
      // v1.7 階段 16：答題 → mark question seen（從 qid 反推 partName）
      const baseId = qid.endsWith('__sync') ? qid.slice(0, -6) : qid.replace(/_(L|R)$/, '');
      const partName = _findPartByQid(baseId);
      if (partName) markQuestionSeen(partName, baseId);
      saveDraft();
      setSaveStatus('dirty');
      _syncRecalc();
      render();
    });
  });

  // 配對題切換鈕
  _root.querySelectorAll('.m-paired-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.pairId;
      _splitOpen[pid] = !_splitOpen[pid];
      render();
    });
  });

  // L/R tab
  _root.querySelectorAll('.m-side').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.pairId;
      _pairedSide[pid] = btn.dataset.side;
      render();
    });
  });

  // 橡皮擦：清空全部觀察資料（只動 _draft + LS + 轉黃，按儲存才寫 Firestore）
  _root.querySelectorAll('.m-eraser-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('清空所有觀察資料？\n部位和維度的答題會全部清除\n按下上方儲存按鈕後才會清除')) return;
      _draft = {};
      saveDraft();
      setSaveStatus('dirty');
      _syncRecalc();
      render();
    });
  });

  // 維度 tile：點切換展開（同 idx 再點收合，互斥單選）
  // 維度視角左欄：點維度切換（比照自我評分，一律選一個、不收合）
  _root.querySelectorAll('.m-sv-dim').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.dim, 10);
      const wasCur = _dimExpanded === di;
      _dimExpanded = di;
      saveDimExpanded();
      if (!wasCur && DIMS[di]) markDimSeen(DIMS[di].dn);
      render();
    });
  });

  // 維度視角部位導覽：點部位 → 右側顯示該部位條件（桌機一律選取不收合；手機切換）
  _root.querySelectorAll('.m-dimv-part').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.dim, 10);
      const pi = parseInt(btn.dataset.pi, 10);
      if (_isDesktop()) { _dimPartExpanded[di] = pi; saveDimPartExpanded && saveDimPartExpanded(); }
      else { togglePartExpanded(di, pi); }
      render();
      _scrollDimvTop();   // 選部位後捲回頂端 → 條件欄頂端的部位名＋條件直接看得到
    });
  });

  // 關聯部位快速鍵：「→X部觀察」→ 維度視角內切到該部位
  _root.querySelectorAll('[data-dim-jump]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.dim, 10);
      const pi = parseInt(btn.dataset.dimJump, 10);
      if (isNaN(di) || isNaN(pi)) return;
      _dimPartExpanded[di] = pi;
      saveDimPartExpanded();
      render();
      _scrollDimvTop();
    });
  });

  // 群組 header：點切換該群組收合
  _root.querySelectorAll('.m-dim-group-header').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(el.dataset.dim, 10);
      const pi = parseInt(el.dataset.pi, 10);
      const gl = el.dataset.groupLabel;
      if (!gl) return;
      toggleGroupCollapsed(di, pi, gl);
      render();
    });
  });

  // 「全部展開 / 全部收合」：作用於當前展開部位的所有 groups
  _root.querySelectorAll('.m-dim-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.dim, 10);
      const pi = parseInt(btn.dataset.pi, 10);
      const action = btn.dataset.dimAction;
      // 頭(pi=0) 的群組分散在 13/14/15 三個子部位
      const _idxs = (pi === 0) ? [13, 14, 15] : [pi];
      _idxs.forEach(idx => {
        const groups = _collectDimPartGroups(di, idx);
        const labels = groups.map(g => g.label).filter(Boolean);
        setAllGroupsCollapsed(di, idx, labels, action === 'group-collapse-all');
      });
      render();
    });
  });

  // 維度視角的題目跟選項共用部位視角的 .m-opt / .m-paired-toggle handler
  // paired open 兩欄並排不用 .m-side（每欄直接點選項，handler reuse .m-opt）
}

// ---------- 對外 ----------
export async function mountInput(rootEl) {
  _root = rootEl;

  // 第一次載入題目時顯示 placeholder（後續 mount 已快取，瞬間出現）
  if (!_questionsLoaded) {
    _root.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#888;">載入題目中…</div>';
  }
  await ensureQuestionsLoaded();

  // v1.7 階段 8：每次進部位觀察 tab 強制回到「答題 + 部位視角」（不讀 LS）
  // v1.7 階段 12+：唯一例外是「once LS」（報告 tab 卡片點擊時 set），mount 讀後立刻清
  _view = 'quiz';
  _quizMode = 'part';
  try {
    const once = localStorage.getItem('m_input_view_once');
    if (once === 'quiz' || once === 'report' || once === 'sens') {
      _view = once;
      localStorage.removeItem('m_input_view_once');
    }
  } catch (e) {}

  // 維度視角的展開狀態（哪維度展開、各部位群組收合）
  loadDimState();

  // v1.7 階段 A 簡化：mount 時不讀 LS，永遠用 firestore baseline 當 _draft（last-write-wins by Firestore）
  // same-session 切 tab 用既有 _draft（保留 user 答題編輯，不 reset）
  // cross-session（重整）→ module reload → _draftInitialized=false → 重新從 firestore 初始化
  _loadBaselineFromUserData();
  _baselineFingerprintAtMount = JSON.stringify(_firestoreBaseline);
  debugLog('[Sync]', 'mount: baseline keys=', Object.keys(_firestoreBaseline).length,
           'baseline len=', _baselineFingerprintAtMount.length,
           'draft initialized=', _draftInitialized);

  // 維度視角需要 condResults：載 DIM_RULES + 用當前 _draft（含草稿）算一次
  // 失敗不影響部位視角；DIM panel 顯示「無規則」/「0/0」是可接受退化
  try {
    await ensureDimRulesLoaded();
    setObsData(JSON.parse(JSON.stringify(_draft)));
    recalcFromObs();
  } catch (e) {
    debugLog('[m_input]', '維度視角初始化失敗（可忽略）', e && e.message);
  }

  // _draft 永遠 = firestoreBaseline（剛 mount 時），mount 時必為 saved 狀態
  // user 開始答題後 _markDirty 才轉 dirty
  setSaveStatus('saved');

  // 綁儲存按鈕（每次 mount 用 .onclick 覆寫，避免累積 listener）
  const saveBtn = document.getElementById('m-save-btn');
  if (saveBtn) saveBtn.onclick = handleSaveClick;

  render();

  // v1.7 階段 A：背景 refresh firestore user doc（cross-device sync）
  // 改用 saveStatus 判斷：user 沒在編輯（不是 dirty/saving）→ 無條件用 firestore 覆蓋
  // 不再依賴 fingerprint 比對（JSON.stringify round-trip 對 obsJson 有失真風險）
  refreshUserData().then((ok) => {
    if (!_root || !ok) return;
    const status = getSaveStatus();
    if (status === 'dirty' || status === 'saving') {
      debugLog('[Sync]', 'm_input：skip override (user editing)');
      return;
    }
    const ud = window.__userData || {};
    let newBaseline = {};
    if (ud.obsJson) {
      try { newBaseline = JSON.parse(ud.obsJson) || {}; } catch (e) {}
    }
    // 強制以 firestore 為主
    _firestoreBaseline = newBaseline;
    _draft = JSON.parse(JSON.stringify(newBaseline));
    _baselineFingerprintAtMount = JSON.stringify(newBaseline);
    try { localStorage.removeItem(getLsKey()); } catch (e) {}
    try {
      setObsData(JSON.parse(JSON.stringify(_draft)));
      recalcFromObs();
    } catch (e) {}
    setSaveStatus('saved');
    debugLog('[Sync]', 'm_input：force override with firestore, baseline keys=',
             Object.keys(newBaseline).length);
    render();
  });
}

// 從 window.__userData 載入 baseline；first mount of session 也初始化 _draft = baseline
// 不再讀 LS draft（避免 cross-device sync 衝突，以 firestore 為唯一 source of truth）
function _loadBaselineFromUserData() {
  const ud = window.__userData || {};
  let firestoreObs = {};
  if (ud.obsJson) {
    try { firestoreObs = JSON.parse(ud.obsJson) || {}; } catch (e) { firestoreObs = {}; }
  }
  _firestoreBaseline = firestoreObs;
  setObsData(JSON.parse(JSON.stringify(firestoreObs)));
  if (!_draftInitialized) {
    _draft = JSON.parse(JSON.stringify(firestoreObs));
    _draftInitialized = true;
    // 順便清 LS 殘留（避免 user 看 dev tools 看到舊資料困惑）
    try { localStorage.removeItem(getLsKey()); } catch (e) {}
  }
}

export function unmountInput() {
  // 若 input tab 內 mount 了 m_report（報告 view），切走時連帶 unmount，避免 _container 殘留
  unmountAutoView();
  _root = null;
}
