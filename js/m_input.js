// ============================================================
// js/m_input.js
// 職責：手機版輸入 tab — 三子模式切換（部位/維度/手動）+ 部位視角答題
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

import { OBS_PARTS_DATA, setObsData, setObsPartsData, setObsPartNames, setDimRules, data as coreData, DIMS, DIM_RULES, condResults } from './core.js';
import { auth, db, debugLog } from './m_main.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { recalcFromObs } from './obs_recalc.js';
import { updateHomeProgress } from './m_home.js';

const SUBMODES = [
  { key: 'part', label: '部位' },
  { key: 'dim',  label: '維度' },
  { key: 'manual', label: '手動' },
];

// 6+5 異形排列
const PART_ROW_1 = ['頭', '額', '耳', '眉', '眼', '鼻'];
const PART_ROW_2 = ['口', '顴', '人中', '地閣', '頤'];

// 維度視角：13 維度排兩排 6+7（DIMS 順序）
const DIM_ROW_1_IDX = [0, 1, 2, 3, 4, 5];        // 形勢 經緯 方圓 曲直 收放 緩急
const DIM_ROW_2_IDX = [6, 7, 8, 9, 10, 11, 12];  // 順逆 分合 真假 攻守 奇正 虛實 進退
// 維度視角的 13 部位順序（沿用桌機 cond_page CP_PART_ORDER / CP_PART_LABELS）
const DIM_PART_ORDER  = [0, 1, 4, 5, 6, 7, 8, 2, 9, 3, 10, 11, 12];
const DIM_PART_LABELS = ['頭','上停','耳','眉','眼','鼻','口','中停','顴','下停','人中','地閣','頤'];

// LS key 帶 UID 後綴：每個 google 帳號在同一裝置上各有獨立草稿
function getLsKey() {
  const uid = (auth.currentUser && auth.currentUser.uid) || 'anon';
  return 'm_input_obs_draft_' + uid;
}

let _root = null;
let _submode = 'part';
let _draft = {};
let _firestoreBaseline = {};
let _expandedKey = null;
let _splitOpen = {};
let _pairedSide = {};
let _dimExpanded = null;  // 維度視角當前展開的維度 idx（null = 未展開）

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
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) throw new Error('no auth user');

    // 確保 DIM_RULES 載入（recalcFromObs 依賴）
    await ensureDimRulesLoaded();

    // 把草稿同步進 core.js obsData，再呼叫 recalcFromObs 算出 9×13 矩陣
    const draftCopy = JSON.parse(JSON.stringify(_draft));
    // Sanitize：清掉所有 paired 題的主值 q.id，讓 recalcFromObs 根據 _L/_R 重新填。
    // 防止 toggle 取消 _L/_R 後主值殘留（桌機讀 obsData[q.id] 會誤顯為 selected）。
    Object.keys(OBS_PARTS_DATA).forEach(pn => {
      const pd = OBS_PARTS_DATA[pn];
      if (!pd || !Array.isArray(pd.sections)) return;
      pd.sections.forEach(s => {
        (s.qs || []).forEach(q => { if (q.paired) delete draftCopy[q.id]; });
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
  if (q.paired) return _draft[q.id + '_L'] != null && _draft[q.id + '_R'] != null;
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
  const seg = renderSegmented();
  let content = '';
  if (_submode === 'part') content = renderPartMode();
  else if (_submode === 'dim') content = renderDimMode();
  else if (_submode === 'manual') content = renderPlaceholder('手動輸入');
  _root.innerHTML = `
    <div class="m-segmented">${seg}</div>
    <div class="m-submode-content">${content}</div>
  `;
  bindEvents();
}

function renderSegmented() {
  return SUBMODES.map(m => `
    <button class="m-seg-btn ${_submode === m.key ? 'm-seg-active' : ''}" data-submode="${m.key}">
      ${escapeHtml(m.label)}
    </button>
  `).join('');
}

function renderPlaceholder(name) {
  return `<div class="m-placeholder">${escapeHtml(name)}：即將推出</div>`;
}

// ---------- 維度視角（C1：tile + panel 殼 + 部位 header）----------
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
  const badge = prog.total > 0 ? (prog.done + '/' + prog.total) : '';
  const statusClass = prog.total > 0 && prog.done === prog.total
    ? 'm-tile-full'
    : (prog.done > 0 ? 'm-tile-partial' : '');
  return `
    <button class="m-tile m-dim-tile ${statusClass} ${isOpen ? 'm-tile-open' : ''}" data-dim="${di}">
      <span class="m-tile-label">${escapeHtml(dm.dn)}</span>
      ${badge ? `<span class="m-tile-badge">${escapeHtml(badge)}</span>` : ''}
    </button>
  `;
}

function renderDimPanel(di) {
  const dm = DIMS[di];
  if (!dm) return '';
  const head = `
    <div class="m-dim-panel-head">
      <span class="m-dim-title">${escapeHtml(dm.dn)}<span class="m-dim-view"> · ${escapeHtml(dm.view || '')}</span></span>
    </div>
  `;
  const groups = DIM_PART_ORDER.map((pi, i) => renderDimPartHeader(di, pi, DIM_PART_LABELS[i])).join('');
  return `<div class="m-panel m-dim-panel" data-dim="${di}">${head}${groups}</div>`;
}

function renderDimPartHeader(di, pi, label) {
  const cr = (condResults[di] && condResults[di][pi]) || null;
  const score = cr ? (cr.score || 0) : 0;
  const max = cr ? (cr.max || 0) : 0;
  const threshold = cr ? (cr.threshold || '') : '無規則';
  const noRule = !cr || cr.threshold === '無規則' || max === 0;
  return `
    <div class="m-dim-part-block ${noRule ? 'm-dim-part-norule' : ''}" data-part-idx="${pi}">
      <div class="m-dim-part-header">
        <span class="m-dim-part-name">${escapeHtml(label)}</span>
        <span class="m-dim-part-meta">
          ${noRule ? '' : `<span class="m-dim-part-score">${score}/${max}</span>`}
          <span class="m-dim-part-threshold">${escapeHtml(threshold)}</span>
        </span>
      </div>
    </div>
  `;
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
  return `
    <button class="m-tile ${statusClass} ${isOpen ? 'm-tile-open' : ''}" data-key="${escapeHtml(key)}">
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
      ${(s.qs || []).map(q => renderQuestion(q)).join('')}
    </div>
  `).join('');
}

function renderQuestion(q) {
  return q.paired ? renderPairedQuestion(q) : renderSingleQuestion(q);
}

function renderOptions(qid, curVal, opts) {
  return (opts || []).map(o => {
    const v = o.v;
    const hint = o.hint || '';
    const sel = curVal === v ? 'm-opt-selected' : '';
    return `
      <button class="m-opt ${sel}" data-qid="${escapeHtml(qid)}" data-val="${escapeHtml(v)}">
        <span class="m-opt-v">${escapeHtml(v)}</span>
        ${hint ? `<span class="m-opt-hint">${escapeHtml(hint)}</span>` : ''}
      </button>
    `;
  }).join('');
}

function renderSingleQuestion(q) {
  const todoCls = isAnswered(q) ? '' : ' m-q-todo';
  return `
    <div class="m-q${todoCls}">
      <div class="m-q-text">${escapeHtml(q.text || q.id)}</div>
      <div class="m-q-opts">${renderOptions(q.id, _draft[q.id], q.opts)}</div>
    </div>
  `;
}

function renderPairedQuestion(q) {
  const isOpen = !!_splitOpen[q.id];
  const diffStatus = pairedDiffStatus(q.id);
  let hintTag = '';
  if (diffStatus === 'half') hintTag = `<span class="m-q-tag m-q-tag-warn">左右不同 未填完</span>`;
  else if (diffStatus === 'diff') hintTag = `<span class="m-q-tag">左右不同</span>`;

  const _todoCls = isAnswered(q) ? '' : ' m-q-todo';
  if (!isOpen) {
    return `
      <div class="m-q m-q-paired${_todoCls}">
        <div class="m-q-head">
          <span class="m-q-text">${escapeHtml(q.text || q.id)}</span>
          <button class="m-paired-toggle" data-pair-id="${escapeHtml(q.id)}" data-action="open">左/右</button>
          ${hintTag}
        </div>
        <div class="m-q-opts">${renderOptions(q.id + '__sync', _draft[q.id + '_L'], q.opts)}</div>
      </div>
    `;
  }
  const side = _pairedSide[q.id] || 'L';
  const curId = q.id + '_' + side;
  const lDone = _draft[q.id + '_L'] != null ? '●' : '○';
  const rDone = _draft[q.id + '_R'] != null ? '●' : '○';
  return `
    <div class="m-q m-q-paired m-q-paired-open${_todoCls}">
      <div class="m-q-head">
        <span class="m-q-text">${escapeHtml(q.text || q.id)}</span>
        <button class="m-paired-toggle m-paired-toggle-active" data-pair-id="${escapeHtml(q.id)}" data-action="close">左/右</button>
        ${hintTag}
      </div>
      <div class="m-q-side-toggle">
        <button class="m-side ${side === 'L' ? 'm-side-active' : ''}" data-pair-id="${escapeHtml(q.id)}" data-side="L">${lDone} 左</button>
        <button class="m-side ${side === 'R' ? 'm-side-active' : ''}" data-pair-id="${escapeHtml(q.id)}" data-side="R">${rDone} 右</button>
      </div>
      <div class="m-q-opts">${renderOptions(curId, _draft[curId], q.opts)}</div>
    </div>
  `;
}

// ---------- 事件 ----------
function bindEvents() {
  if (!_root) return;

  // 子模式切換
  _root.querySelectorAll('.m-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _submode = btn.dataset.submode;
      try { localStorage.setItem('m_input_submode', _submode); } catch (e) {}
      render();
    });
  });

  // 部位 tile
  _root.querySelectorAll('.m-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      _expandedKey = (_expandedKey === key) ? null : key;
      render();
    });
  });

  // 答題（toggle：點已選的選項再點一次 → 取消選取）
  _root.querySelectorAll('.m-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const qid = btn.dataset.qid;
      const val = btn.dataset.val;
      if (qid.endsWith('__sync')) {
        const realId = qid.slice(0, -6);
        if (_draft[realId + '_L'] === val && _draft[realId + '_R'] === val) {
          delete _draft[realId + '_L'];
          delete _draft[realId + '_R'];
        } else {
          _draft[realId + '_L'] = val;
          _draft[realId + '_R'] = val;
        }
      } else {
        if (_draft[qid] === val) {
          delete _draft[qid];
        } else {
          _draft[qid] = val;
        }
      }
      saveDraft();
      setSaveStatus('dirty');
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
      render();
    });
  });

  // 維度 tile：點切換展開（同 idx 再點收合，互斥單選）
  _root.querySelectorAll('.m-dim-tile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.dim, 10);
      _dimExpanded = (_dimExpanded === di) ? null : di;
      render();
    });
  });
}

// ---------- 對外 ----------
export async function mountInput(rootEl) {
  _root = rootEl;

  // 第一次載入題目時顯示 placeholder（後續 mount 已快取，瞬間出現）
  if (!_questionsLoaded) {
    _root.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#888;">載入題目中…</div>';
  }
  await ensureQuestionsLoaded();

  // 恢復上次子模式（重整或重新進 input 時保留 部位/維度/手動 選擇）
  try {
    const savedSub = localStorage.getItem('m_input_submode');
    if (savedSub === 'part' || savedSub === 'dim' || savedSub === 'manual') {
      _submode = savedSub;
    }
  } catch (e) {}

  // Baseline 來自 m_main.js 在登入時已抓進 window.__userData 的資料，不重抓
  const ud = window.__userData || {};
  let firestoreObs = {};
  if (ud.obsJson) {
    try { firestoreObs = JSON.parse(ud.obsJson) || {}; } catch (e) { firestoreObs = {}; }
  }
  _firestoreBaseline = firestoreObs;
  setObsData(JSON.parse(JSON.stringify(firestoreObs)));

  // 比對 LS 草稿
  let hasLocalDraft = false;
  try {
    const raw = localStorage.getItem(getLsKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        _draft = parsed;
        hasLocalDraft = true;
      }
    }
  } catch (e) {}
  if (!hasLocalDraft) {
    _draft = JSON.parse(JSON.stringify(firestoreObs));
  }

  // 維度視角需要 condResults：載 DIM_RULES + 用當前 _draft（含草稿）算一次
  // 失敗不影響部位視角；DIM panel 顯示「無規則」/「0/0」是可接受退化
  try {
    await ensureDimRulesLoaded();
    setObsData(JSON.parse(JSON.stringify(_draft)));
    recalcFromObs();
  } catch (e) {
    debugLog('[m_input]', '維度視角初始化失敗（可忽略）', e && e.message);
  }

  setSaveStatus(hasLocalDraft ? 'dirty' : 'saved');

  // 綁儲存按鈕（每次 mount 用 .onclick 覆寫，避免累積 listener）
  const saveBtn = document.getElementById('m-save-btn');
  if (saveBtn) saveBtn.onclick = handleSaveClick;

  render();
}

export function unmountInput() {
  _root = null;
}
