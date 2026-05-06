// ============================================================
// js/m_input.js
// 職責：手機版輸入 tab — 三子模式切換（部位/維度/手動）+ 部位視角答題
// 依賴：js/core.js (OBS_PARTS_DATA_DEFAULT, setObsData)、js/m_main.js (auth — 用於 LS key 加 UID 後綴)
// 被誰用：js/m_main.js（tab 切換到 input 時呼叫 mountInput）
// 4b 第一段：segmented control + 部位視角答題（沿用 4a）
// 4b 第二段 Phase 1：mountInput 用 window.__userData.obsJson（登入時 m_main.js 已抓的）當 baseline，比對 LS 草稿決定狀態色塊
// 4b 第二段 Phase 1.5（本段修補）：LS key 加 UID 後綴，避免不同帳號在同台裝置共用草稿
// 4b 第二段待辦：Phase 2 答題轉黃、Phase 3 儲存按鈕（含 Firestore 寫入 / recalcFromObs / 同步 __userData）、Phase 4 攔截離開
// Retest 範圍：
//   - 手機 m.html input tab：子模式切換、部位答題沿用 4a；切到 input tab 時應立即顯示 Firestore 既有資料
//   - 兩個 google 帳號交替登入同一台裝置：應各自看到自己的資料（不互相污染）
//   - 桌機 staging / production：完全不該被影響
// ============================================================

import { OBS_PARTS_DATA_DEFAULT, setObsData } from './core.js';
import { auth } from './m_main.js';

const SUBMODES = [
  { key: 'part', label: '部位' },
  { key: 'dim',  label: '維度' },
  { key: 'manual', label: '手動' },
];

// 6+5 異形排列
const PART_ROW_1 = ['頭', '額', '耳', '眉', '眼', '鼻'];
const PART_ROW_2 = ['口', '顴', '人中', '地閣', '頤'];

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
// Phase 1 只用到 saved / dirty。saving / error 留到 Phase 3 儲存流程加。
function setSaveStatus(state) {
  const el = document.getElementById('m-save-status');
  if (!el) return;
  el.classList.remove('m-save-status-saved', 'm-save-status-dirty', 'm-save-status-saving', 'm-save-status-error');
  if (state === 'saved')      { el.classList.add('m-save-status-saved'); el.textContent = '已儲存'; }
  else if (state === 'dirty') { el.classList.add('m-save-status-dirty'); el.textContent = '未儲存'; }
}

// ---------- 取題目 ----------
function getSections(key) {
  const data = OBS_PARTS_DATA_DEFAULT[key];
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
  else if (_submode === 'dim') content = renderPlaceholder('維度視角');
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

function renderPartMode() {
  const row1 = PART_ROW_1.map(k => renderPartTile(k)).join('');
  const row2 = PART_ROW_2.map(k => renderPartTile(k)).join('');
  const panel = _expandedKey ? `
    <div class="m-panel" data-panel="${escapeHtml(_expandedKey)}">
      ${renderSections(_expandedKey)}
    </div>
  ` : '';
  return `
    <div class="m-input-row m-input-row-6">${row1}</div>
    <div class="m-input-row m-input-row-5">${row2}</div>
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
  return `
    <div class="m-q">
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

  if (!isOpen) {
    return `
      <div class="m-q m-q-paired">
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
    <div class="m-q m-q-paired m-q-paired-open">
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

  // 答題
  _root.querySelectorAll('.m-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const qid = btn.dataset.qid;
      const val = btn.dataset.val;
      if (qid.endsWith('__sync')) {
        const realId = qid.slice(0, -6);
        _draft[realId + '_L'] = val;
        _draft[realId + '_R'] = val;
      } else {
        _draft[qid] = val;
      }
      saveDraft();
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
}

// ---------- 對外 ----------
export function mountInput(rootEl) {
  _root = rootEl;

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

  setSaveStatus(hasLocalDraft ? 'dirty' : 'saved');
  render();
}

export function unmountInput() {
  _root = null;
}
