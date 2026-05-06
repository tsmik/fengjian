// ============================================================
// js/m_input.js
// 職責：手機版輸入 tab — 11 部位 6+5 異形排列 + 答題（4a 不串 Firestore）
// 依賴：js/core.js (OBS_PARTS_DATA_DEFAULT)
// 被誰用：js/m_main.js（tab 切換到 input 時呼叫 mountInput）
// 4a 範圍：靜態 UI、答題、L/R 同步/分離、localStorage 草稿
// 4b 待辦：串 Firestore obsJson、呼叫 recalcFromObs、進度同步首頁
// Retest 範圍：
//   - 手機 m.html input tab：6+5 異形排列、L/R 切換鈕、左右不同提示、重整保留
//   - 手機 home tab：不該被影響
//   - 桌機 staging / production：完全不該被影響
// ============================================================

import { OBS_PARTS_DATA_DEFAULT } from './core.js';

// 6+5 異形排列：第一排 頭額耳眉眼鼻、第二排 口顴人中地閣頤
const PART_ROW_1 = ['頭', '額', '耳', '眉', '眼', '鼻'];
const PART_ROW_2 = ['口', '顴', '人中', '地閣', '頤'];

const LS_KEY = 'm_input_obs_draft';

let _root = null;
let _draft = {};            // { qid: v, qid_L: v, qid_R: v }
let _expandedKey = null;    // 同時只展開一個部位
let _splitOpen = {};        // { qid: true }，配對題左右選項區是否展開
let _pairedSide = {};       // { qid: 'L' | 'R' }，分離模式下當前 tab

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

// 配對題已答 = 兩邊都填
function isAnswered(q) {
  if (q.paired) {
    return _draft[q.id + '_L'] != null && _draft[q.id + '_R'] != null;
  }
  return _draft[q.id] != null;
}

// 配對題「左右不同」狀態判斷
function pairedDiffStatus(qid) {
  const l = _draft[qid + '_L'];
  const r = _draft[qid + '_R'];
  if (l != null && r != null && l !== r) return 'diff';      // 兩邊都填且不同
  if ((l != null) !== (r != null)) return 'half';            // 只填一邊
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
  const row1 = PART_ROW_1.map(k => renderPartTile(k)).join('');
  const row2 = PART_ROW_2.map(k => renderPartTile(k)).join('');
  // 展開部位的 panel 放在兩排下方
  const panel = _expandedKey ? `
    <div class="m-panel" data-panel="${escapeHtml(_expandedKey)}">
      ${renderSections(_expandedKey)}
    </div>
  ` : '';
  _root.innerHTML = `
    <div class="m-input-row m-input-row-6">${row1}</div>
    <div class="m-input-row m-input-row-5">${row2}</div>
    ${panel}
  `;
  bindEvents();
}

function renderPartTile(key) {
  const prog = partProgress(key);
  const isOpen = _expandedKey === key;
  const statusClass = `m-tile-${prog.status}`;
  const badge = prog.status === 'full' ? '✓'
              : prog.status === 'partial' ? `${prog.done}/${prog.total}`
              : '';
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
    // 同步模式：選項同時寫入 _L 和 _R；顯示取 _L 值
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
  // 分離模式：左右 tab
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

  _root.querySelectorAll('.m-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      _expandedKey = (_expandedKey === key) ? null : key;
      render();
    });
  });

  // 答題（sync 模式同時寫 _L 和 _R）
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

  // 切換鈕：開/收分離模式
  _root.querySelectorAll('.m-paired-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.pairId;
      _splitOpen[pid] = !_splitOpen[pid];
      render();
    });
  });

  // L/R tab 切換
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
