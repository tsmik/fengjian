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

import { setObsData, setUserName, setUserGender, setUserBirthday, setLiunianTable, data, avgCoeff, DIMS, calcDim, _escHtml, OBS_PARTS_DATA } from './core.js';
import { buildRadar2MSVG, buildRadar3SVG } from './report_chart.js';
import { renderCoeffSummary, renderPngPreview } from './m_manual.js';
import { persistProfile, updateHomeProgress } from './m_home.js';
import { db, debugLog, refreshUserData, getEffectiveUid, setActiveCase, listCases, createCase, updateCase, deleteCase, updateSelfCard, updateAnalysisBanner } from './m_main.js';
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

// 「我的」tab = 本人儀表板（基本資料＋編輯、流年、報告連結＋填寫進度、底部 個案新增/管理）
function _renderList() {
  if (!_container) return;
  _container.innerHTML = '<div class="m-home" style="padding:16px 14px"><div style="color:#a89e92;font-size:13px;padding:8px 2px">載入中…</div></div>';
  _renderSelfDashboard();
}
async function _renderSelfDashboard() {
  const uid = getEffectiveUid();
  let sd = {};
  try { const s = await getDoc(doc(db, 'users', uid)); if (s.exists()) sd = s.data(); }
  catch (e) { debugLog('[Case]', '讀本人失敗', e && e.message); }
  if (!_container || !_isListMode) return;
  _dashIsCase = false;
  _dashEdit = false;
  _dashPerson = { isCase: false, id: null, name: sd.displayName || '', gender: sd.gender || '', birthday: sd.birthday || '', color: sd.cardColor || CARD_DEFAULT_COLOR, group: '', note: '', obsJson: sd.obsJson || '', manualJson: sd.manualDataJson || '' };
  _dashTarget = _container;
  _paintDashboard();
}

// ===== 個案管理：本人儀表板 + 案例管理總畫面 + 新增表單 + 全螢幕細節 =====
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
function _esc(s) { return _escHtml(String(s == null ? '' : s)); }
// createdAt/updatedAt 可能是 ISO 字串(手機建)或 Firestore Timestamp 物件(桌機建)；統一成可排序字串
function _tsStr(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  try { if (typeof v.toDate === 'function') return v.toDate().toISOString(); } catch (e) {}
  if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return String(v);
}
let _knownGroups = [];      // 現有組別名（給表單 datalist）
let _existingCaseCount = 0;
let _caseSort = (function () { try { return localStorage.getItem('m_case_sort') || 'group'; } catch (e) { return 'group'; } })();
let _ncColor = '';          // 新增個案進入時派的顏色
// 儀表板共用狀態（本人 = 我的分頁 inline；個案 = 全螢幕細節）
let _dashPerson = null;     // {isCase,id,name,gender,birthday,color,group,note,obsJson,manualJson}
let _dashTarget = null;     // 渲染容器
let _dashIsCase = false;
let _dashEdit = false;
let _detailSelColor = '';   // 編輯時色卡暫選

// 進度（填寫百分比）
function _obsProgress(obsJson) {
  let obs = {};
  try { if (obsJson) obs = JSON.parse(obsJson) || {}; } catch (e) {}
  let answered = 0, total = 0;
  for (const pk of Object.keys(OBS_PARTS_DATA)) {
    const part = OBS_PARTS_DATA[pk];
    if (!part || !Array.isArray(part.sections)) continue;
    for (const sec of part.sections) {
      for (const q of (sec.qs || [])) {
        total++;
        if (q.paired) { if (obs[q.id] !== undefined || (obs[q.id + '_L'] !== undefined && obs[q.id + '_R'] !== undefined)) answered++; }
        else if (obs[q.id] !== undefined) answered++;
      }
    }
  }
  return { pct: total > 0 ? Math.round(answered / total * 100) : 0 };
}
function _manualProgress(manualJson) {
  let arr; try { arr = JSON.parse(manualJson); } catch (e) { return { pct: 0 }; }
  if (!Array.isArray(arr)) return { pct: 0 };
  let filled = 0, total = 0;
  for (let i = 0; i < arr.length; i++) { if (!Array.isArray(arr[i])) continue; for (let j = 0; j < arr[i].length; j++) { total++; if (arr[i][j] === 'A' || arr[i][j] === 'B') filled++; } }
  return { pct: total > 0 ? Math.round(filled / total * 100) : 0 };
}

// 流年參考（縮成兩行：七十五/九執/業務 ; 親族/子女/耳鼻/五官/三停）
async function _liunianCompactHtml(gender, birthday) {
  try { await _ensureLiunianLoaded(); } catch (e) {}
  let g = gender || ''; if (g === 'M') g = '男'; else if (g === 'F') g = '女';
  if (g) setUserGender(g);
  if (birthday) setUserBirthday(birthday);
  const info = _getLiunianInfo();
  if (!info) return '<div class="m-liunian-section"><div class="m-liunian-title">流年參考</div><div class="m-liunian-empty">填出生年月日＋性別後顯示</div></div>';
  const ln = info.ln;
  const cell = (l, v) => '<div class="m-liunian-cell"><span class="m-liunian-cell-label">' + l + '</span><span class="m-liunian-cell-value">' + (v || '—') + '</span></div>';
  const v75 = (ln.name75 || '') + (ln.area75 ? '／' + ln.area75 : '');
  return '<div class="m-liunian-section"><div class="m-liunian-title">流年參考' + buildLiunianTitleHtml(info) + '</div>'
    + '<div class="m-liunian-row" style="grid-template-columns:repeat(3,1fr)">' + cell('七十五', v75) + cell('九執', ln.jiuzhi) + cell('業務', ln.yewu) + '</div>'
    + '<div class="m-liunian-row" style="grid-template-columns:repeat(5,1fr)">' + cell('親族', ln.qinzu) + cell('子女', ln.zinv) + cell('耳鼻', ln.erbei) + cell('五官', ln.wuguan) + cell('三停', ln.santing) + '</div>'
    + '</div>';
}

// ---- 儀表板（本人 / 個案共用版型）----
function _paintDashboard() {
  const p = _dashPerson, t = _dashTarget;
  if (!p || !t) return;
  let g = p.gender || ''; if (g === 'M') g = '男'; else if (g === 'F') g = '女';
  const obs = _obsProgress(p.obsJson), man = _manualProgress(p.manualJson);
  // 外框：人物顏色「包住」標題＋基本資料＋流年＋報告連結，視覺上是同一張卡
  let inner = '<div class="m-dash-head"><span class="m-dash-head-name">' + _esc(p.name || (p.isCase ? '(未命名)' : '本人')) + '</span><span class="m-case-item-tag">' + (p.isCase ? '個案' : '本人') + '</span></div>';
  // 基本資料（檢視 or 編輯）
  if (_dashEdit) {
    const groupOpts = _knownGroups.map((gg) => '<option value="' + _esc(gg) + '">').join('');
    inner += '<div class="m-home-card m-home-profile">'
      + '<div class="m-home-card-title">編輯基本資料</div>'
      + '<div class="m-home-profile-row"><label>姓名</label><input type="text" id="m-dash-name" value="' + _esc(p.name) + '" maxlength="20"></div>'
      + '<div class="m-home-profile-row"><label>性別</label><select id="m-dash-gender"><option value="">未填寫</option><option value="男"' + (g === '男' ? ' selected' : '') + '>男</option><option value="女"' + (g === '女' ? ' selected' : '') + '>女</option></select></div>'
      + '<div class="m-home-profile-row"><label>生日</label><input type="date" id="m-dash-birthday" value="' + _esc(p.birthday) + '"></div>';
    if (p.isCase) {
      inner += '<div class="m-home-profile-row"><label>組別</label><input type="text" id="m-dash-group" list="m-dash-grouplist" value="' + _esc(p.group || '') + '"><datalist id="m-dash-grouplist">' + groupOpts + '</datalist></div>';
      inner += '<div class="m-home-profile-row"><label>備註</label><input type="text" id="m-dash-note" value="' + _esc(p.note || '') + '"></div>';
    }
    // 卡片顏色（本人＋個案皆可改）
    inner += '<div class="m-home-card-title" style="margin-top:8px">卡片顏色</div><div class="m-color-grid" id="m-dash-colors">'
      + CARD_COLORS.map((hex) => '<span class="m-color-dot' + (hex === _detailSelColor ? ' is-sel' : '') + '" data-color="' + hex + '" style="background:' + hex + '"></span>').join('')
      + '</div>';
    inner += '<div class="m-home-profile-status" id="m-dash-status"></div>'
      + '<div class="m-case-addform-btns"><button type="button" class="m-newcase-create" id="m-dash-save">存檔</button><button type="button" class="m-newcase-cancel" id="m-dash-cancel">取消</button></div>'
      + '</div>';
  } else {
    inner += '<div class="m-home-card">'
      + '<div style="display:flex;align-items:center;margin-bottom:6px"><div class="m-home-card-title" style="margin:0">基本資料</div><button type="button" class="m-detail-edit-btn" id="m-dash-edit">編輯</button></div>'
      + '<div class="m-detail-info-row"><span class="m-detail-info-label">姓名</span><span>' + _esc(p.name || '未填寫') + '</span></div>'
      + '<div class="m-detail-info-row"><span class="m-detail-info-label">性別</span><span>' + (g || '未填寫') + '</span></div>'
      + '<div class="m-detail-info-row"><span class="m-detail-info-label">生日</span><span>' + _esc(p.birthday || '未填寫') + '</span></div>'
      + (p.isCase ? '<div class="m-detail-info-row"><span class="m-detail-info-label">組別</span><span>' + _esc(p.group || '未分組') + '</span></div>' : '')
      + (p.isCase ? '<div class="m-detail-info-row"><span class="m-detail-info-label">備註</span><span>' + _esc(p.note || '—') + '</span></div>' : '')
      + '</div>';
  }
  // 流年（縮兩行）
  inner += '<div id="m-dash-liunian" class="m-liunian-placeholder">流年載入中…</div>';
  // 報告連結 + 進度
  inner += '<button class="m-home-bigbtn" data-dash-report="auto"><span class="m-home-bigbtn-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 0 1-2 2"/></svg></span><div class="m-home-bigbtn-meta"><div class="m-home-bigbtn-title">部位觀察評分報告</div></div><div class="m-detail-prog"><div class="m-detail-prog-pct">' + obs.pct + '%</div><div class="m-detail-prog-label">填寫進度</div></div></button>';
  inner += '<button class="m-home-bigbtn" data-dash-report="manual"><span class="m-home-bigbtn-icon">✎</span><div class="m-home-bigbtn-meta"><div class="m-home-bigbtn-title">手動輸入報告</div></div><div class="m-detail-prog"><div class="m-detail-prog-pct">' + man.pct + '%</div><div class="m-detail-prog-label">填寫進度</div></div></button>';

  let h = '<div class="m-dash-wrap" style="background:' + _cardTint(p.color) + '">' + inner + '</div>';
  // 底部（外框之外）
  if (p.isCase) h += '<button class="m-detail-delete" id="m-dash-delete" type="button">刪除此個案</button>';
  else h += '<button class="m-dash-mgmt-btn" id="m-dash-mgmt" type="button">個案新增 / 管理</button>';

  t.innerHTML = p.isCase ? h : '<div class="m-home" style="padding:16px 14px">' + h + '</div>';

  // 流年 async（render 後可能已換人 → 比對 p）
  _liunianCompactHtml(p.gender, p.birthday).then((html) => { if (_dashPerson !== p) return; const slot = t.querySelector('#m-dash-liunian'); if (slot) slot.outerHTML = html; });
  // wire
  const editBtn = t.querySelector('#m-dash-edit'); if (editBtn) editBtn.onclick = () => { _detailSelColor = p.color; _dashEdit = true; _paintDashboard(); };
  const cancelBtn = t.querySelector('#m-dash-cancel'); if (cancelBtn) cancelBtn.onclick = () => { _dashEdit = false; _paintDashboard(); };
  const saveBtn = t.querySelector('#m-dash-save'); if (saveBtn) saveBtn.onclick = _saveDashboardEdit;
  if (_dashEdit) {
    t.querySelectorAll('#m-dash-colors .m-color-dot').forEach((dot) => {
      dot.onclick = () => { _detailSelColor = dot.dataset.color; t.querySelectorAll('#m-dash-colors .m-color-dot').forEach((d) => d.classList.toggle('is-sel', d === dot)); };
    });
  }
  const aBtn = t.querySelector('[data-dash-report="auto"]'); if (aBtn) aBtn.onclick = () => _gotoReport('auto');
  const mBtn = t.querySelector('[data-dash-report="manual"]'); if (mBtn) mBtn.onclick = () => _gotoReport('manual');
  const delBtn = t.querySelector('#m-dash-delete'); if (delBtn) delBtn.onclick = _deleteCurrentCase;
  const mgmtBtn = t.querySelector('#m-dash-mgmt'); if (mgmtBtn) mgmtBtn.onclick = _openCaseMgmt;
}

async function _saveDashboardEdit() {
  const t = _dashTarget, p = _dashPerson;
  if (!t || !p) return;
  const statusEl = t.querySelector('#m-dash-status');
  const setS = (txt, cls) => { if (statusEl) { statusEl.textContent = txt; statusEl.className = 'm-home-profile-status ' + (cls || ''); } };
  const name = (t.querySelector('#m-dash-name').value || '').trim();
  const birthday = t.querySelector('#m-dash-birthday').value || '';
  const gender = t.querySelector('#m-dash-gender').value || '';
  setS('儲存中…', 'is-saving');
  try {
    if (p.isCase) {
      const group = (t.querySelector('#m-dash-group').value || '').trim();
      const note = (t.querySelector('#m-dash-note').value || '').trim();
      const color = _detailSelColor || p.color || '';
      await updateCase(p.id, { name: name, gender: gender, birthday: birthday, group: group, note: note, color: color });
      window.__userData = Object.assign(window.__userData || {}, { displayName: name, name: name, gender: gender, birthday: birthday, group: group, note: note, color: color });
      Object.assign(p, { name: name, gender: gender, birthday: birthday, group: group, note: note, color: color });
      const titleEl = document.getElementById('m-case-detail-title'); if (titleEl) titleEl.textContent = name || '個案';
      try { updateAnalysisBanner(); } catch (e) {}
    } else {
      const color = _detailSelColor || p.color || '';
      await persistProfile({ displayName: name, birthday: birthday, gender: gender });
      await updateSelfCard({ cardColor: color }); // 本人卡片顏色（帳號層 cardColor）
      Object.assign(p, { name: name, gender: gender, birthday: birthday, color: color });
      try { updateAnalysisBanner(); } catch (e) {}
    }
    _dashEdit = false;
    _paintDashboard();
    const mg = document.getElementById('m-case-mgmt'); if (mg && mg.classList.contains('is-open')) _renderMgmt();
  } catch (e) {
    debugLog('[Case]', '儀表板儲存失敗', e && e.message ? e.message : e);
    setS('儲存失敗', 'is-error');
  }
}

// 從儀表板報告連結進入：把這人設成目前分析 → 切到對應分頁
async function _gotoReport(kind) {
  setActiveCase(_dashIsCase ? (_dashPerson && _dashPerson.id) : null);
  await refreshUserData();
  try { updateHomeProgress(); } catch (e) {}
  try { updateAnalysisBanner(); } catch (e) {}
  _closeCaseDetail();
  _closeCaseMgmt();
  if (kind === 'auto') { try { localStorage.setItem('m_input_view_once', 'report'); } catch (e) {} const tb = document.querySelector('.m-tab[data-tab="input"]'); if (tb) tb.click(); }
  else { try { localStorage.setItem('m_manual_view_once', 'overview'); } catch (e) {} const tb = document.querySelector('.m-tab[data-tab="manual"]'); if (tb) tb.click(); }
}

// ---- 案例管理總畫面 ----
function _openCaseMgmt() {
  _renderMgmt();
  const ov = document.getElementById('m-case-mgmt');
  if (ov) requestAnimationFrame(() => ov.classList.add('is-open'));
  const back = document.getElementById('m-mgmt-back'); if (back) back.onclick = _closeCaseMgmt;
}
function _closeCaseMgmt() {
  const ov = document.getElementById('m-case-mgmt'); if (ov) ov.classList.remove('is-open');
}
// 由「個案管理」tab 進入：開啟案例管理 overlay（底下是已 mount 的「我的」儀表板）；
// 返回時關 overlay 並把 tab 高亮切回「我的」（report）。
export function openCaseMgmtView() {
  _openCaseMgmt();
  const back = document.getElementById('m-mgmt-back');
  if (back) back.onclick = () => {
    _closeCaseMgmt();
    const myTab = document.querySelector('.m-tab[data-tab="report"]');
    const caseTab = document.querySelector('.m-tab[data-tab="cases"]');
    if (caseTab) caseTab.classList.remove('active');
    if (myTab) myTab.classList.add('active');
  };
}
async function _renderMgmt() {
  const body = document.getElementById('m-mgmt-body');
  const barActions = document.getElementById('m-mgmt-bar-actions');
  if (!body) return;
  body.innerHTML = '<div style="color:#a89e92;font-size:13px;padding:8px 2px">載入中…</div>';
  if (barActions) barActions.innerHTML = '';
  const uid = getEffectiveUid();
  let groupOrder = [];
  try { const s = await getDoc(doc(db, 'users', uid)); if (s.exists() && Array.isArray(s.data().groupOrder)) groupOrder = s.data().groupOrder; } catch (e) {}
  let cases = [];
  try { cases = await listCases(); } catch (e) {}
  if (!document.getElementById('m-case-mgmt')) return;
  _existingCaseCount = cases.length;
  const caseColor = (c) => c.color || _autoColor(c.id);
  const gset = [];
  cases.forEach((c) => { const g = c.group || ''; if (g && gset.indexOf(g) < 0) gset.push(g); });
  const orderedGroups = [];
  groupOrder.forEach((g) => { if (gset.indexOf(g) >= 0) orderedGroups.push(g); });
  gset.forEach((g) => { if (orderedGroups.indexOf(g) < 0) orderedGroups.push(g); });
  _knownGroups = orderedGroups.slice();
  const rowHtml = (c, sub) => '<button class="m-case-item" data-open="' + _esc(c.id) + '"><span class="m-case-swatch" style="background:' + _cardTint(caseColor(c)) + '"></span><span class="m-case-item-col"><span class="m-case-item-name">' + _esc(c.name || '(未命名)') + '</span>' + (sub ? '<span class="m-case-item-sub">' + _esc(sub) + '</span>' : '') + '</span></button>';

  if (cases.length === 0) {
    body.innerHTML = '<button class="m-mgmt-bigbtn is-primary" id="m-mgmt-add" type="button">＋ 新增個案</button>'
      + '<button class="m-mgmt-bigbtn is-secondary" id="m-mgmt-groups" type="button">管理個案分組</button>';
  } else {
    if (barActions) barActions.innerHTML = '<button class="m-mgmt-bar-btn is-primary" id="m-mgmt-add" type="button">＋ 新增</button><button class="m-mgmt-bar-btn" id="m-mgmt-groups" type="button">管理分組</button>';
    let html = '<div class="m-case-sortbar"><span class="m-case-sortbar-label">排序</span><select class="m-case-sort" id="m-mgmt-sort">'
      + '<option value="group"' + (_caseSort === 'group' ? ' selected' : '') + '>分組</option>'
      + '<option value="created"' + (_caseSort === 'created' ? ' selected' : '') + '>建立時間</option>'
      + '<option value="updated"' + (_caseSort === 'updated' ? ' selected' : '') + '>修改時間</option>'
      + '</select></div>';
    if (_caseSort === 'group') {
      const grouped = {};
      cases.forEach((c) => { const g = c.group || ''; (grouped[g] = grouped[g] || []).push(c); });
      orderedGroups.forEach((g) => { html += '<div class="m-case-group-title">' + _esc(g) + '<span class="m-case-group-count">（' + grouped[g].length + '）</span></div><div class="m-case-list">' + grouped[g].map((c) => rowHtml(c, '')).join('') + '</div>'; });
      if (grouped[''] && grouped[''].length) html += '<div class="m-case-group-title ungrouped">未分組<span class="m-case-group-count">（' + grouped[''].length + '）</span></div><div class="m-case-list">' + grouped[''].map((c) => rowHtml(c, '')).join('') + '</div>';
    } else {
      const tsOf = (c) => _caseSort === 'updated' ? _tsStr(c.updatedAt || c.createdAt) : _tsStr(c.createdAt);
      const arr = cases.slice().sort((a, b) => String(tsOf(b)).localeCompare(String(tsOf(a))));
      const byDate = []; const idx = {};
      arr.forEach((c) => { const d = String(tsOf(c)).slice(0, 10) || '—'; if (!(d in idx)) { idx[d] = byDate.length; byDate.push({ d: d, items: [] }); } byDate[idx[d]].items.push(c); });
      byDate.forEach((grp) => { html += '<div class="m-case-group-title">' + _esc(grp.d || '—') + '</div><div class="m-case-list">' + grp.items.map((c) => rowHtml(c, c.group || '')).join('') + '</div>'; });
    }
    body.innerHTML = html;
  }
  body.querySelectorAll('.m-case-item').forEach((btn) => { btn.onclick = () => _openCaseDetail(btn.dataset.open || null); });
  const sortSel = body.querySelector('#m-mgmt-sort'); if (sortSel) sortSel.onchange = (e) => { _caseSort = e.target.value; try { localStorage.setItem('m_case_sort', _caseSort); } catch (_) {} _renderMgmt(); };
  const addBtn = document.getElementById('m-mgmt-add'); if (addBtn) addBtn.onclick = _openNewCaseForm;
  const grpBtn = document.getElementById('m-mgmt-groups'); if (grpBtn) grpBtn.onclick = _openManageGroups;
}

// ---- 新增個案表單（全螢幕）----
function _openNewCaseForm() {
  const body = document.getElementById('m-form-body');
  if (!body) return;
  _ncColor = CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]; // 進入建立畫面時隨機派色
  const groupOpts = _knownGroups.map((g) => '<option value="' + _esc(g) + '">').join('');
  body.innerHTML = '<div class="m-home-card m-home-profile">'
    + '<div class="m-home-profile-row"><label>姓名</label><input type="text" id="m-nc-name" placeholder="必填" maxlength="20"></div>'
    + '<div class="m-home-profile-row"><label>性別</label><select id="m-nc-gender"><option value="">未填寫</option><option value="男">男</option><option value="女">女</option></select></div>'
    + '<div class="m-home-profile-row"><label>生日</label><input type="date" id="m-nc-birthday"></div>'
    + '<div class="m-home-profile-row"><label>組別</label><input type="text" id="m-nc-group" list="m-nc-grouplist" placeholder="可不填"><datalist id="m-nc-grouplist">' + groupOpts + '</datalist></div>'
    + '<div class="m-home-profile-row"><label>備註</label><input type="text" id="m-nc-note" placeholder="可不填"></div>'
    + '<div class="m-home-card-title" style="margin-top:8px">卡片顏色</div><div class="m-color-grid" id="m-nc-colors">'
    + CARD_COLORS.map((hex) => '<span class="m-color-dot' + (hex === _ncColor ? ' is-sel' : '') + '" data-color="' + hex + '" style="background:' + hex + '"></span>').join('')
    + '</div>'
    + '<div class="m-home-profile-status" id="m-nc-status"></div>'
    + '<div class="m-case-addform-btns"><button type="button" class="m-newcase-create" id="m-nc-create">建立</button><button type="button" class="m-newcase-cancel" id="m-nc-cancel">取消</button></div>'
    + '</div>';
  const ov = document.getElementById('m-case-form'); if (ov) requestAnimationFrame(() => ov.classList.add('is-open'));
  const back = document.getElementById('m-form-back'); if (back) back.onclick = _closeNewCaseForm;
  const cancel = body.querySelector('#m-nc-cancel'); if (cancel) cancel.onclick = _closeNewCaseForm;
  const create = body.querySelector('#m-nc-create'); if (create) create.onclick = () => _submitNewCase(create);
  // 卡片顏色可點選挑色
  body.querySelectorAll('#m-nc-colors .m-color-dot').forEach((dot) => {
    dot.onclick = () => { _ncColor = dot.dataset.color; body.querySelectorAll('#m-nc-colors .m-color-dot').forEach((d) => d.classList.toggle('is-sel', d === dot)); };
  });
  const nameEl = body.querySelector('#m-nc-name'); if (nameEl) nameEl.focus();
}
function _closeNewCaseForm() {
  const ov = document.getElementById('m-case-form'); if (ov) ov.classList.remove('is-open');
}
async function _submitNewCase(createBtn) {
  const body = document.getElementById('m-form-body');
  if (!body) return;
  const statusEl = body.querySelector('#m-nc-status');
  const name = (body.querySelector('#m-nc-name').value || '').trim();
  if (!name) { if (statusEl) statusEl.textContent = '請填姓名'; return; }
  const gender = body.querySelector('#m-nc-gender').value || '';
  const birthday = body.querySelector('#m-nc-birthday').value || '';
  const group = (body.querySelector('#m-nc-group').value || '').trim();
  const note = (body.querySelector('#m-nc-note').value || '').trim();
  createBtn.disabled = true; const old = createBtn.textContent; createBtn.textContent = '建立中…';
  try {
    await createCase({ name: name, gender: gender, birthday: birthday, group: group, note: note, color: _ncColor });
    _closeNewCaseForm();
    _renderMgmt(); // 建立後回到案例管理畫面（不停在新個案資料頁）
  } catch (e) {
    debugLog('[Case]', '新增個案失敗', e && e.message ? e.message : e);
    if (statusEl) statusEl.textContent = '建立失敗，請重試';
    createBtn.disabled = false; createBtn.textContent = old;
  }
}

// ---- 全螢幕個案細節（= 個案儀表板）----
async function _openCaseDetail(idOrEmpty) {
  const caseId = idOrEmpty || null;
  setActiveCase(caseId);
  await refreshUserData();
  try { updateHomeProgress(); } catch (e) {}
  try { updateAnalysisBanner(); } catch (e) {}
  const ud = window.__userData || {};
  _dashIsCase = !!caseId;
  _dashEdit = false;
  _dashPerson = { isCase: !!caseId, id: caseId, name: ud.displayName || '', gender: ud.gender || '', birthday: ud.birthday || '', color: caseId ? (ud.color || _autoColor(caseId)) : (ud.cardColor || CARD_DEFAULT_COLOR), group: ud.group || '', note: ud.note || '', obsJson: ud.obsJson || '', manualJson: ud.manualDataJson || '' };
  _dashTarget = document.getElementById('m-case-detail-body');
  const titleEl = document.getElementById('m-case-detail-title'); if (titleEl) titleEl.textContent = _dashPerson.name || '個案';
  _paintDashboard();
  const ov = document.getElementById('m-case-detail'); if (ov) requestAnimationFrame(() => ov.classList.add('is-open'));
  const back = document.getElementById('m-case-detail-back'); if (back) back.onclick = _closeCaseDetail;
}
function _closeCaseDetail() {
  const ov = document.getElementById('m-case-detail'); if (ov) ov.classList.remove('is-open');
}

async function _deleteCurrentCase() {
  if (!_dashIsCase || !_dashPerson || !_dashPerson.id) return;
  if (!confirm('確定刪除此個案？此動作無法復原。')) return;
  try {
    await deleteCase(_dashPerson.id);
    setActiveCase(null);
    await refreshUserData();
    try { updateHomeProgress(); } catch (e) {}
    try { updateAnalysisBanner(); } catch (e) {}
    _closeCaseDetail();
    _renderMgmt();
  } catch (e) {
    debugLog('[Case]', '刪除失敗', e && e.message ? e.message : e);
    alert('刪除失敗，請重試');
  }
}

// 分組管理（新增/改名/拖拉排序/刪除）— Stage B 再做
function _openManageGroups() {
  alert('分組管理（新增/改名/拖拉排序/刪除）下一版推出。\n目前可在新增或編輯個案時直接打組別名稱來分組。');
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
export function isLiunianReady() { return _liunianLoaded; }
export async function ensureLiunianLoaded() { return _ensureLiunianLoaded(); }
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
// 兵法報告專用：4 張圖排 2×2（上排 係數圖｜動靜圖；下排 係數總覽｜動靜總覽）。
// 各圖標題已畫在 SVG 內，直接點陣化原圖。svgs={radar2,sd,coef,sdPair}
async function _buildFourChartsCanvas(svgs, totalW) {
  var gap = Math.round(totalW * 0.02);
  var colW = Math.floor((totalW - gap) / 2);
  var rowGap = Math.round(totalW * 0.015);
  var r2 = await _svgToCanvas(svgs.radar2, colW);
  var sd = await _svgToCanvas(svgs.sd, colW);
  var coef = await _svgToCanvas(svgs.coef, colW);
  var sdp = await _svgToCanvas(svgs.sdPair, colW);
  var topH = Math.max(r2.height, sd.height);
  var botH = Math.max(coef.height, sdp.height);
  var W = colW * 2 + gap, H = topH + rowGap + botH;
  var out = document.createElement('canvas'); out.width = W; out.height = H;
  var ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(r2, 0, 0); ctx.drawImage(sd, colW + gap, 0);
  ctx.drawImage(coef, 0, topH + rowGap); ctx.drawImage(sdp, colW + gap, topH + rowGap);
  return { canvas: out, titleFs: 14 * colW / 360 };
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
    // 兵法報告（手動）傳 chartSvgs → 4 張圖(係數圖/動靜圖/係數總覽/動靜總覽)2×2，跟畫面一致；
    // 自動報告(「我的」)不帶 → 維持原兩雷達
    var useFour = !!opts.chartSvgs;
    var out;
    if (mode === 'charts') {
      // 姓名（只要姓名，不要虛歲/流年）+ 圖
      var row = useFour ? await _buildFourChartsCanvas(opts.chartSvgs, 1600)
                        : await _buildChartsRow(buildMobileChartSvgs(matrix), 1600);
      var hdr = _nameHeaderCanvas(displayName, row.canvas.width, row.titleFs);
      out = _stackV([hdr, row.canvas], Math.round(row.titleFs * 0.6));
    } else {
      // 完整表格 + 圖（圖總寬＝表格寬）
      var tableCanvas = drawReportCanvas(srcData, { checkComplete: true, scale: SC });
      var row2 = useFour ? await _buildFourChartsCanvas(opts.chartSvgs, tableCanvas.width)
                         : await _buildChartsRow(buildMobileChartSvgs(matrix), tableCanvas.width);
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
