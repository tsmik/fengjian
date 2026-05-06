// ============================================================
// js/m_input.js
// 職責：手機版輸入 tab — 11 部位手風琴 UI + 答題（4a 不串 Firestore）
// 依賴：js/core.js (OBS_PARTS_DATA_DEFAULT)
// 被誰用：js/m_main.js（tab 切換到 input 時呼叫 mountInput）
// 4a 範圍：靜態 UI、答題、L/R 切換、localStorage 草稿（key: m_input_obs_draft）
// 4b 待辦：串 Firestore obsJson、呼叫 recalcFromObs、進度同步首頁
// Retest 範圍：
//   - 手機 m.html input tab：11 部位點擊展開、L/R 切換、答題、重整保留
//   - 手機 home tab：不該被影響
//   - 桌機 staging / production：完全不該被影響
// ============================================================

import { OBS_PARTS_DATA_DEFAULT } from './core.js';

// 顯示順序：6+5 異形排列
const PART_DISPLAY = [
  '頭', '額', '耳', '眉', '眼', '鼻',
  '口', '顴', '人中', '地閣', '頤',
];

const LS_KEY = 'm_input_obs_draft';

let _root = null;
let _draft = {};            // { qid: v, qid_L: v, qid_R: v }
let _expandedKey = null;    // 同時只展開一個部位
let _pairedSide = {};       // { qid: 'L' | 'R' }，配對題目前顯示哪邊

// ---------- localStorage ----------
function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    _draft = raw ? JSON.parse(raw) : {};
  } catch (e) {
    _draft = {};
  }
}
function saveDraft() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_draft));
  } catch (e) {}
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
  if (q.paired) {
    return _draft[q.id + '_L'] != null && _draft[q.id + '_R'] != null;
  }
  return _draft[q.id] != null;
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
  const tiles = PART_DISPLAY.map(k => renderPartTile(k)).join('');
  _root.innerHTML = `<div class="m-input-grid">${tiles}</div>`;
  bindEvents();
}

function renderPartTile(key) {
  const prog = partProgress(key);
  const isOpen = _expandedKey === key;
  const statusClass = `m-tile-${prog.status}`;
  const badge = prog.status === 'full' ? '✓'
              : prog.status === 'partial' ? `${prog.done}/${prog.total}`
              : '';
  const tile = `
    <button class="m-tile ${statusClass} ${isOpen ? 'm-tile-open' : ''}" data-key="${escapeHtml(key)}">
      <span class="m-tile-label">${escapeHtml(key)}</span>
      <span class="m-tile-badge">${escapeHtml(badge)}</span>
    </button>
  `;
  const panel = isOpen ? `
    <div class="m-panel" data-panel="${escapeHtml(key)}">
      ${renderSections(key)}
    </div>
  ` : '';
  return tile + panel;
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
  const side = _pairedSide[q.id] || 'L';
  const curId = q.id + '_' + side;
  const lDone = _draft[q.id + '_L'] != null ? '●' : '○';
  const rDone = _draft[q.id + '_R'] != null ? '●' : '○';
  return `
    <div class="m-q m-q-paired">
      <div class="m-q-text">${escapeHtml(q.text || q.id)}</div>
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

  _root.querySelectorAll('.m-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      _expandedKey = (_expandedKey === key) ? null : key;
      render();
    });
  });

  _root.querySelectorAll('.m-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const qid = btn.dataset.qid;
      const val = btn.dataset.val;
      _draft[qid] = val;
      saveDraft();
      render();
    });
  });

  _root.querySelectorAll('.m-side').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.pairId;
      const side = btn.dataset.side;
      _pairedSide[pid] = side;
      render();
    });
  });
}

// ---------- 對外 ----------
export function mountInput(rootEl) {
  _root = rootEl;
  loadDraft();
  render();
}

export function unmountInput() {
  _root = null;
}
