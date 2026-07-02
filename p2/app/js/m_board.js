// ============================================================
// js/m_board.js — 手機/RWD 版「課程（板書與筆記）」
// 職責：上課 tab 內「課程」sub-tab 的內容；對應桌機 notes_page.js（板書頁）。
//   選維度 → 板書講義(唯讀) + 我的板書筆記；下面 13 部位、每個 = 老師條件分組(唯讀) + 我的筆記。
// 資料層與桌機共用（core.js）：boardText(settings/board)、boardNotes(boardNotesJson)、condResults(groupLabel)。
//   → 手機寫的筆記桌機看得到、反之亦然（同一 Firestore 欄位）。
// 筆記存到 getCurrentDocRef()（本人/個案各自），debounce 寫 boardNotesJson。
// 不碰桌機 index_desktop.html / notes_page.js。
// 版型沿用 A1/A2 兩欄（.m-dim-layout）：手機單欄、桌機左維度清單＋右內容。
// ============================================================

import { DIMS, condResults, boardText, boardNotes, setBoardText, setBoardNotes } from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { db, debugLog, getCurrentDocRef } from './m_main.js';
import { ensureDimRulesLoaded } from './m_input.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// 13 部位（label 顯示名 / idx 對應 obs_recalc 的 PART_NAME_TO_IDX；同桌機 BOARD_PARTS）
const BOARD_PARTS = [
  { label: '頂骨', idx: 13 }, { label: '枕骨', idx: 14 }, { label: '華陽骨', idx: 15 },
  { label: '上停', idx: 1 }, { label: '耳', idx: 4 }, { label: '眉', idx: 5 },
  { label: '眼', idx: 6 }, { label: '鼻', idx: 7 }, { label: '口', idx: 8 },
  { label: '顴', idx: 9 }, { label: '人中', idx: 10 }, { label: '地閣', idx: 11 }, { label: '頤', idx: 12 }
];
const DIM_ROW_1 = [0, 1, 2, 3, 4, 5];
const DIM_ROW_2 = [6, 7, 8, 9, 10, 11, 12];

let _el = null;
let _boardLoaded = false;   // settings/board 講義只載一次
let _notesDirty = false;    // 編輯中 → _ensureData 不要用雲端蓋掉
let _dim = null;            // 目前選的維度 idx（跨 re-render 保留）
let _saveTimer = null;
let studentBoard = {};      // 學員自編板書（{維度名:文字}），per 對象；該維度無 key＝沿用老師版
let _boardEditing = false;  // 目前維度的板書是否在編輯中
let _noteW = 340;           // 桌機板書筆記欄寬（可拖曳，存 LS）
try { const _w = parseInt(localStorage.getItem('m_board_note_w'), 10); if (_w >= 160 && _w <= 760) _noteW = _w; } catch (e) {}

function _isDesktop() { try { return window.matchMedia('(min-width:1024px)').matches; } catch (e) { return false; } }
function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export async function mountBoard(container) {
  _el = container;
  if (!container.querySelector('.m-dim-layout')) {
    container.innerHTML = '<div class="m-panel-empty" style="padding:24px;text-align:center">載入板書…</div>';
  }
  await _ensureData();
  if (!_el) return;
  if (_dim == null) _dim = 0;  // 進課程預設顯示第一個維度（形勢）— 手機桌機皆是
  _render();
}

export function unmountBoard() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; _flushSave(); }
  _el = null;
}

async function _ensureData() {
  // 1. 板書講義（P2：admin2 講義編輯器存 config/board.board，是 map {維度名: 講義文字}）— 只載一次
  //    ⚠ 舊 P1 是 settings/board.boardJson（JSON 字串）；P2 改 config/board.board（map，免 parse）。
  if (!_boardLoaded) {
    try {
      const s = await getDoc(doc(db, 'config', 'board'));
      if (s.exists() && s.data().board) setBoardText(s.data().board);
    } catch (e) { debugLog('[board]', '載入板書講義失敗', e && e.message); }
    _boardLoaded = true;
  }
  // 2. 我的筆記 + 我自編板書（目前對象）— 編輯中不覆蓋
  if (!_notesDirty) {
    const ud = window.__userData || {};
    try { setBoardNotes(ud.boardNotesJson ? JSON.parse(ud.boardNotesJson) : {}); }
    catch (e) { setBoardNotes({}); }
    try { studentBoard = ud.studentBoardJson ? JSON.parse(ud.studentBoardJson) : {}; }
    catch (e) { studentBoard = {}; }
  }
  // 3. 條件分組（recalc condResults 取 groupLabel）
  try { await ensureDimRulesLoaded(); recalcFromObs(); }
  catch (e) { debugLog('[board]', 'recalc 失敗', e && e.message); }
}

// ---------- 渲染 ----------
function _render() {
  if (!_el) return;
  const tiles1 = DIM_ROW_1.map(_dimTile).join('');
  const tiles2 = DIM_ROW_2.map(_dimTile).join('');
  const content = (_dim != null) ? _dimContent(_dim)
    : '<div class="m-part-panel-hint">← 點選維度看板書</div>';
  _el.innerHTML = `
    <div class="m-score-view">
      <div class="m-sv-layout">
        <div class="m-sv-dimlist">
          <div class="m-sv-dimrow">${tiles1}</div>
          <div class="m-sv-dimrow">${tiles2}</div>
        </div>
        <div class="m-sv-main">${content}</div>
      </div>
    </div>`;
  _bind();
}

function _dimTile(i) {
  const dm = DIMS[i]; if (!dm) return '';
  // 對齊手動評分：.m-sv-dim 群組左色條＋選取淡米底
  const grp = i <= 2 ? 'm-sv-grp-boss' : (i <= 5 ? 'm-sv-grp-mgr' : (i <= 8 ? 'm-sv-grp-luck' : 'm-sv-grp-post'));
  const cur = _dim === i ? 'is-cur' : '';
  return `<button class="m-sv-dim ${grp} ${cur}" data-bdim="${i}">${_esc(dm.dn)}</button>`;
}

function _noteEditor(dn, slot) {
  const v = (boardNotes[dn] && boardNotes[dn][slot] != null) ? boardNotes[dn][slot] : '';
  return `<textarea class="m-board-note" data-bn-dim="${_esc(dn)}" data-bn-slot="${_esc(String(slot))}" placeholder="寫下你的筆記…">${_esc(v)}</textarea>`;
}

function _dimContent(i) {
  const dm = DIMS[i]; if (!dm) return '';
  const dn = dm.dn;
  const admin = boardText[dn] || '';
  const hasMine = (studentBoard[dn] != null);        // 有 key＝學員已自編
  const shown = hasMine ? studentBoard[dn] : admin;
  const badge = hasMine
    ? '<span class="m-board-ver m-board-ver-mine">我的版本</span>'
    : '<span class="m-board-ver m-board-ver-admin">老師版</span>';
  // 板書本體：唯讀(可按編輯) / 編輯中(textarea 自動長高)
  const body = _boardEditing
    ? `<textarea class="m-board-edit" data-board-edit="${_esc(dn)}" placeholder="輸入板書內容…">${_esc(shown)}</textarea>`
    : `<div class="m-board-lecture">${shown ? _esc(shown) : '（尚未設定板書文字）'}</div>`;
  const editBtn = _boardEditing
    ? '<button class="m-board-btn m-board-btn-edit" data-board-done="1">完成</button>'
    : '<button class="m-board-btn m-board-btn-edit" data-board-editbtn="1">編輯</button>';
  const resetBtn = (hasMine && !_boardEditing)
    ? `<button class="m-board-btn" data-board-reset="${_esc(dn)}">還原成老師版</button>` : '';
  // 置頂維度 pill：形勢 看 格局（格局比照形勢同樣大字）
  const view = dm.view || '';
  const pill = `<div class="m-board-pill"><span class="m-board-pill-name">${_esc(dn)}</span>${view ? `<span class="m-board-pill-see">看</span><span class="m-board-pill-name">${_esc(view)}</span>` : ''}</div>`;
  return `
    ${pill}
    <div class="m-board-lecture-block">
      <div class="m-board-head"><span class="m-board-sec-title">板書</span>${badge}<span class="m-board-head-sp"></span>${resetBtn}${editBtn}</div>
      ${body}
    </div>
    <div class="m-board-note-block">
      <div class="m-board-head"><span class="m-board-sec-title">我的心得筆記</span></div>
      ${_noteEditor(dn, 'board')}
    </div>`;
}

// ---------- 事件 ----------
function _bind() {
  if (!_el) return;
  _el.querySelectorAll('[data-bdim]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.bdim, 10);
      _dim = (_dim === i && !_isDesktop()) ? null : i;  // 桌機不收合
      _boardEditing = false;                            // 換維度 → 退出板書編輯
      _render();
    });
  });
  // 我的心得筆記
  _el.querySelectorAll('.m-board-note').forEach(ta => {
    _autoGrow(ta);
    ta.addEventListener('input', () => {
      const dn = ta.getAttribute('data-bn-dim');
      const slot = ta.getAttribute('data-bn-slot');
      if (!dn) return;
      if (!boardNotes[dn]) boardNotes[dn] = {};
      boardNotes[dn][slot] = ta.value;
      _notesDirty = true;
      _autoGrow(ta);
      _scheduleSave();
    });
  });
  // 板書：編輯 / 完成 / 還原成老師版 / 內容輸入
  const eb = _el.querySelector('[data-board-editbtn]');
  if (eb) eb.addEventListener('click', () => { _boardEditing = true; _render(); });
  const done = _el.querySelector('[data-board-done]');
  if (done) done.addEventListener('click', () => { _boardEditing = false; _render(); });
  const rb = _el.querySelector('[data-board-reset]');
  if (rb) rb.addEventListener('click', () => {
    const dn = rb.dataset.boardReset;
    _bConfirm('確定要還原成老師的板書嗎？', '你自己編輯的這份板書會被清掉，無法復原。', () => {
      delete studentBoard[dn]; _boardEditing = false; _notesDirty = true; _scheduleSave(); _render();
    });
  });
  const ed = _el.querySelector('[data-board-edit]');
  if (ed) {
    _autoGrow(ed);
    ed.addEventListener('input', () => {
      const dn = ed.getAttribute('data-board-edit');
      studentBoard[dn] = ed.value;          // 一旦編輯即 fork 成個人版（不動老師版）
      _notesDirty = true;
      _autoGrow(ed);
      _scheduleSave();
    });
    try { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); } catch (e) {}
  }
}
// 還原確認框（沿用 m.html/app.html 既有的 .m-sv-confirm-* 樣式）
function _bConfirm(text, detail, onYes) {
  const ov = document.createElement('div');
  ov.className = 'm-sv-confirm-ov';
  ov.innerHTML = `<div class="m-sv-confirm"><div class="m-sv-confirm-msg">${_esc(text)}</div>${detail ? `<div class="m-sv-confirm-detail">${_esc(detail)}</div>` : ''}<div class="m-sv-confirm-btns"><button class="m-sv-confirm-cancel" type="button">取消</button><button class="m-sv-confirm-ok" type="button">確定</button></div></div>`;
  document.body.appendChild(ov);
  const close = () => { try { document.body.removeChild(ov); } catch (e) {} };
  ov.querySelector('.m-sv-confirm-cancel').onclick = close;
  ov.querySelector('.m-sv-confirm-ok').onclick = () => { close(); if (onYes) onYes(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
}

// 桌機：拖曳板書/筆記中間的把手調整筆記欄寬（支援滑鼠 + 觸控；存 LS）
function _bindDrag(handle) {
  const noteCol = handle.parentElement && handle.parentElement.querySelector('.m-board-note-col');
  if (!noteCol) return;
  let startX = 0, startW = 0, dragging = false;
  const px = (e) => (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
  const onMove = (e) => {
    if (!dragging) return;
    let w = startW - (px(e) - startX);   // 筆記在右：把手往左拖 → 筆記變寬
    w = Math.max(160, Math.min(760, w));
    noteCol.style.flexBasis = w + 'px';
    _noteW = w;
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    try { localStorage.setItem('m_board_note_w', String(_noteW)); } catch (e) {}
    window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
  };
  const onDown = (e) => {
    dragging = true;
    startX = px(e);
    startW = noteCol.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onUp);
    if (e.cancelable) e.preventDefault();
  };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
}

function _autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }

// ---------- 儲存（debounce → boardNotesJson 寫目前對象）----------
function _scheduleSave() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(_flushSave, 700); }
async function _flushSave() {
  _saveTimer = null;
  try {
    const ref = getCurrentDocRef();
    const json = JSON.stringify(boardNotes);
    const sbJson = JSON.stringify(studentBoard);
    await setDoc(ref, { boardNotesJson: json, studentBoardJson: sbJson, updatedAt: new Date().toISOString() }, { merge: true });
    if (window.__userData) { window.__userData.boardNotesJson = json; window.__userData.studentBoardJson = sbJson; }
    _notesDirty = false;
  } catch (e) { debugLog('[board]', '筆記儲存失敗', e && e.message); }
}
