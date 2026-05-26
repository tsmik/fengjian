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
import { auth, db, debugLog, refreshUserData, getEffectiveUid } from './app_main.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { recalcFromObs } from './obs_recalc.js';
import { updateHomeProgress } from './app_home.js';
import { mountAutoView, unmountAutoView } from './app_report.js';
import { hasPartUpdate, hasDimUpdate, hasUpdate, markPartSeen, markDimSeen, markQuestionSeen, onBadgeRefresh } from './app_badge.js';

// v1.7 階段 8：上層 segmented [部位 | 報告 | 參數分析]；部位內部 part/dim 視角切換
const SUBMODES = [
  { key: 'quiz',   label: '部位' },
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
const DIM_PART_ORDER  = [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 2, 3];
const DIM_PART_LABELS = ['頭','上停','耳','眉','眼','鼻','口','顴','人中','地閣','頤','中停','下停'];

// LS key 帶 UID 後綴：每個 google 帳號在同一裝置上各有獨立草稿
function getLsKey() {
  const uid = getEffectiveUid() || 'anon';
  return 'm_input_obs_draft_' + uid;
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

    // 寫 Firestore
    const userRef = doc(db, 'users', uid);
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
  if (_view === 'report' || _view === 'sens') {
    renderAutoView(_view);
  } else {
    renderQuizView();
  }
}

function renderQuizView() {
  const seg = renderSegmented();
  const viewBar = renderQuizViewBar();
  let content = '';
  if (_quizMode === 'part') content = renderPartMode();
  else if (_quizMode === 'dim') content = renderDimMode();
  _root.innerHTML = `
    <div class="m-page-hint">輸入11部位觀察特徵，自動計算動/靜</div>
    <div class="m-segmented">${seg}</div>
    ${viewBar}
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
    <div class="m-segmented">${seg}</div>
    <div class="m-submode-content"><div id="m-input-report-mount"></div></div>
  `;
  bindEvents();
  const container = _root.querySelector('#m-input-report-mount');
  if (container) mountAutoView(container, initView);
}

function renderSegmented() {
  return SUBMODES.map(m => `
    <button class="m-seg-btn ${_view === m.key ? 'm-seg-active' : ''}" data-submode="${m.key}">
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
    delete _dimPartExpanded[di];
  } else {
    _dimPartExpanded[di] = pi;
    // 首次展開時 init：所有 group 預設全部收合（已有狀態則保留）
    const key = _groupKey(di, pi);
    if (!_dimGroupCollapsed[key]) {
      const groups = _collectDimPartGroups(di, pi);
      const labels = groups.map(g => g.label).filter(Boolean);
      _dimGroupCollapsed[key] = new Set(labels);
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
  const dimPartName = (() => {
    const idx = DIM_PART_ORDER.indexOf(pi);
    return idx >= 0 ? DIM_PART_LABELS[idx] : null;
  })();
  if (!dim || !dim.parts || !dimPartName || !dim.parts[dimPartName]) return { done: 0, total: 0 };
  const refs = new Set();
  _collectRefsFromNode(dim.parts[dimPartName], refs);
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

function renderDimMode() {
  const row1 = DIM_ROW_1_IDX.map(di => renderDimTile(di)).join('');
  const row2 = DIM_ROW_2_IDX.map(di => renderDimTile(di)).join('');
  const panel = (_dimExpanded != null) ? renderDimPanel(_dimExpanded) : '';
  return `
    <div class="m-input-row m-dim-row m-dim-row-6">${row1}</div>
    <div class="m-input-row m-dim-row m-dim-row-7">${row2}</div>
    ${panel}
  `;
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
      <div class="m-input-row m-dim-part-row m-dim-part-row-6">${partTilesRow1}</div>
      <div class="m-input-row m-dim-part-row m-dim-part-row-7">${partTilesRow2}</div>
      ${partContent}
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
function renderDimPartBody(di, pi, dimPartName) {
  const groups = _collectDimPartGroups(di, pi);
  if (groups.length === 0) {
    return `<div class="m-dim-part-body m-dim-empty">（無條件項）</div>`;
  }
  return `<div class="m-dim-part-body">${groups.map(g => {
    const collapsed = g.label ? isGroupCollapsed(di, pi, g.label) : false;
    const chevron = g.label ? (collapsed ? '▶' : '▼') : '';
    let bodyHtml = '';
    if (!collapsed) {
      // 一般題目（refs 還原）
      const qsHtml = g.qids.map(qid => {
        const q = _findQById(qid);
        return q ? renderQuestion(q) : '';
      }).filter(Boolean).join('');
      // partResult 結論行（中停/下停常見：「左頭達標」之類，純展示不可答）
      const prHtml = g.partResults.map(it => {
        const okCls = it.ok ? 'ok' : 'ng';
        const mark = it.ok ? '✓' : '✗';
        return `
          <div class="m-dim-result-item ${okCls}">
            <span class="m-dim-result-mark ${okCls}">${mark}</span>
            <span class="m-dim-result-label">${escapeHtml(it.label || '(空)')}</span>
          </div>
        `;
      }).join('');
      bodyHtml = qsHtml + prHtml;
    }
    return `
      <div class="m-dim-group">
        ${g.label ? `
          <div class="m-dim-group-header" data-dim="${di}" data-pi="${pi}" data-group-label="${escapeHtml(g.label)}">
            <span class="m-dim-group-chevron">${chevron}</span>
            <span class="m-dim-group-label">${escapeHtml(g.label)}</span>
          </div>
        ` : ''}
        <div class="m-dim-group-body" ${collapsed ? 'style="display:none"' : ''}>${bodyHtml}</div>
      </div>
    `;
  }).join('')}</div>`;
}

function renderPartMode() {
  const row1 = PART_ROW_1.map(k => renderPartTile(k)).join('');
  const row2 = PART_ROW_2.map(k => renderPartTile(k)).join('');
  const eraser = `<div class="m-eraser-slot"><button class="m-eraser-btn" data-action="erase-all" aria-label="清空所有觀察資料" title="清空所有觀察資料"><svg class="m-eraser-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg><span class="m-eraser-text">清空</span></button></div>`;
  const panel = _expandedKey ? `
    <div class="m-panel" data-panel="${escapeHtml(_expandedKey)}">
      ${renderSections(_expandedKey)}
    </div>
  ` : '';
  return `
    <div class="m-input-row m-input-row-6">${row1}</div>
    <div class="m-input-row m-input-row-5">${row2}${eraser}</div>
    ${panel}
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
  return secs.map(s => `
    <div class="m-section">
      ${s.label ? `<div class="m-section-label">${escapeHtml(s.label)}</div>` : ''}
      ${(s.qs || []).map(q => renderQuestion(q, key)).join('')}
    </div>
  `).join('');
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
  return (opts || []).map(o => {
    const v = o.v;
    const hint = o.hint || '';
    const sel = curVal === v ? 'm-opt-selected' : '';
    return `
      <button class="m-opt ${sel}" data-qid="${escapeHtml(qid)}" data-val="${escapeHtml(v)}">
        <span class="m-opt-row">
          <span class="m-opt-v">${escapeHtml(v)}</span>
          ${hint ? `<span class="m-opt-hint-icon" data-hint-toggle="1" aria-label="說明">ⓘ</span>` : ''}
        </span>
        ${hint ? `<span class="m-opt-hint is-hidden">${escapeHtml(hint)}</span>` : ''}
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

  // 上層 segmented：答題 / 報告 切換
  _root.querySelectorAll('.m-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.submode;
      if (_view === key) return;
      // 從 auto view（report/sens）切到 quiz 時，主動 unmount m_report
      if ((_view === 'report' || _view === 'sens') && key === 'quiz') unmountAutoView();
      _view = key;
      try { localStorage.setItem('m_input_view', _view); } catch (e) {}
      render();
    });
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
      _expandedKey = wasOpen ? null : key;
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
  _root.querySelectorAll('.m-dim-tile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.dim, 10);
      const wasOpen = _dimExpanded === di;
      _dimExpanded = wasOpen ? null : di;
      saveDimExpanded();
      // v1.7 階段 16：點開維度 → mark seen
      if (!wasOpen && DIMS[di]) markDimSeen(DIMS[di].dn);
      render();
    });
  });

  // 維度視角部位 tile：點切換展開（互斥單選；同 pi 再點收合，點別的部位切換）
  _root.querySelectorAll('.m-dim-part-tile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.dim, 10);
      const pi = parseInt(btn.dataset.pi, 10);
      togglePartExpanded(di, pi);
      render();
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
      const groups = _collectDimPartGroups(di, pi);
      const labels = groups.map(g => g.label).filter(Boolean);
      setAllGroupsCollapsed(di, pi, labels, action === 'group-collapse-all');
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
