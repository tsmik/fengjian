// ============================================================
// 手機版主邏輯
// 負責：Firebase 初始化、auth 流程、白名單、tab 切換、登出
// 依賴：firebase modular SDK v10.12.0、js/core.js（之後 import）、
//       js/m_home.js（initHome）
// 被用：m.html 直接 import
// retest 範圍：登入、登出、白名單拒絕、tab 切換、staging banner
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  setPersistence, browserLocalPersistence, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, collection, getDocs, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { initHome, refreshHomeSelf } from "./m_home.js";
import { mountInput, unmountInput, getSaveStatus, discardDraft, ensureQuestionsLoaded, setInputView, getInputView } from "./m_input.js";
import { mountReport, unmountReport, discardReportDraft, openCaseMgmtView, stashCasesView } from "./m_report.js";
import { mountManual, unmountManual, getManualDirty, discardManualDraft, setManualView, getManualView } from "./m_manual.js";
// 轉出口給 m_report.js（個案專屬頁「手動輸入報告/系統計算報告」tab 掛頁用；沿用既有 m_main↔m_report 依賴邊）
export { mountManual, unmountManual, getManualDirty, discardManualDraft };
export { mountInput, unmountInput, getSaveStatus, discardDraft, setInputView, getInputView };

// 桌機側欄各區「獨立展開」狀態:上課、部位觀察兩區可同時展開、互不收合;點區標題 toggle。
let _subExpanded = { manual: false, input: false };
function _refreshSubnavs() { renderManualSubnav(); renderInputSubnav(); }

// 桌機側欄：「上課」展開的子膠囊（課程/自我評分/兵法報告）
function renderManualSubnav() {
  const host = document.getElementById('m-tabsub-manual');
  if (!host) return;
  if (!_subExpanded.manual) { host.innerHTML = ''; return; }
  const items = [{ key: 'board', label: '課程' }, { key: 'input', label: '自我評分' }, { key: 'overview', label: '兵法報告' }, { key: 'condmap', label: '條件總覽' }];
  let cur = 'board';
  try { cur = getManualView() || 'board'; } catch (e) {}
  host.innerHTML = items.map(it => `<button class="m-tabsub-item ${it.key === cur ? 'active' : ''}" data-msub="${it.key}">${it.label}</button>`).join('');
  host.querySelectorAll('[data-msub]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.msub;
    const mtab = document.querySelector('.m-tab[data-tab="manual"]');
    const onManual = mtab && mtab.classList.contains('active');
    if (onManual) { try { setManualView(key); } catch (e) {} renderManualSubnav(); }
    else { try { localStorage.setItem('m_manual_view_once', key); } catch (e) {} _subExpanded.manual = true; if (mtab) mtab.click(); }
  }));
}
function clearManualSubnav() { _subExpanded.manual = false; const h = document.getElementById('m-tabsub-manual'); if (h) h.innerHTML = ''; }

// 桌機側欄：「部位觀察」展開的子膠囊（部位視角/維度視角/報告/參數分析）— 比照上課
function renderInputSubnav() {
  const host = document.getElementById('m-tabsub-input');
  if (!host) return;
  if (!_subExpanded.input) { host.innerHTML = ''; return; }
  const items = [{ key: 'part', label: '部位觀察' }, { key: 'dim', label: '依維度填寫' }, { key: 'report', label: '兵法報告' }, { key: 'sens', label: '參數分析' }];  // 依部位填寫→部位觀察(與手機一致 Mike 2026-07-20);辣度總覽已移到兵法報告頁底部滑出,側欄不再列
  let cur = 'part';
  try { cur = getInputView() || 'part'; } catch (e) {}
  host.innerHTML = items.map(it => `<button class="m-tabsub-item ${it.key === cur ? 'active' : ''}" data-isub="${it.key}">${it.label}</button>`).join('');
  host.querySelectorAll('[data-isub]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.isub;
    const itab = document.querySelector('.m-tab[data-tab="input"]');
    const onInput = itab && itab.classList.contains('active');
    if (onInput) { try { setInputView(key); } catch (e) {} renderInputSubnav(); }
    else {
      try {
        if (key === 'report' || key === 'sens' || key === 'spiceov') localStorage.setItem('m_input_view_once', key);
        else localStorage.setItem('m_input_submode_once', key);   // part/dim
      } catch (e) {}
      _subExpanded.input = true; if (itab) itab.click();
    }
  }));
}
function clearInputSubnav() { _subExpanded.input = false; const h = document.getElementById('m-tabsub-input'); if (h) h.innerHTML = ''; }
import { initBadges } from "./m_badge.js";

// ===== Firebase config =====
const PROD_FIREBASE_CONFIG={apiKey:"AIzaSyCZUzTOaCtbzXuX_mz5VoFvZ2Sva1Obza8",authDomain:"renxiangbingfa.firebaseapp.com",projectId:"renxiangbingfa",storageBucket:"renxiangbingfa.firebasestorage.app",messagingSenderId:"912262878667",appId:"1:912262878667:web:cd7a74f1378221dbe3524e"};
const STAGING_FIREBASE_CONFIG={apiKey:"AIzaSyDSEQuEZ_5JhzcJ9olK6bk-t2UdsYU09dU",authDomain:"renxiangbingfa-staging.firebaseapp.com",projectId:"renxiangbingfa-staging",storageBucket:"renxiangbingfa-staging.firebasestorage.app",messagingSenderId:"8463681855",appId:"1:8463681855:web:069ca7428c4015eaa0eb8a"};

// ===== P2 config — Firebase 專案 rbf2app（正式）/ rbf2app-staging（測試）=====
// 由 firebase apps:sdkconfig 取得的真實值（第 0 階段建立）。
// Cloudflare Pages 網址：rbf2app.pages.dev（正式）/ rbf2app-staging.pages.dev（測試）。
// 註：Cloudflare Pages 專案名稱建立後若與下方網址不同，告知工程調整 hostname 判斷。
const RBF2_PROD_CONFIG={apiKey:"AIzaSyB2n1wCVVETwyS9eCldAzowwWue5HXxNbs",authDomain:"rbf2app.firebaseapp.com",projectId:"rbf2app",storageBucket:"rbf2app.firebasestorage.app",messagingSenderId:"93651965615",appId:"1:93651965615:web:813fab08c6d6e70650665a"};
const RBF2_STAGING_CONFIG={apiKey:"AIzaSyDZ3z9LV1g3rnhO0QjmYOfipUGMtD1cq7g",authDomain:"rbf2app-staging.firebaseapp.com",projectId:"rbf2app-staging",storageBucket:"rbf2app-staging.firebasestorage.app",messagingSenderId:"565853308902",appId:"1:565853308902:web:8a7a3e63df1291124df827"};

function getFirebaseConfig(){
  const host=window.location.hostname;
  // ★ 此資料夾＝P2 學員前台副本：只連 rbf2app，絕不連 P1（renxiangbingfa）。
  // 正式 rbf2app 網域 → 正式；其餘（rbf2app-staging.web.app / .pages.dev / localhost 預覽）→ staging。
  if(host==='rbf2app.web.app'||host==='rbf2app.pages.dev'||/\.rbf2app\.(web\.app|pages\.dev)$/.test(host)){
    debugLog('[Firebase]','Using RBF2-PROD config');
    return RBF2_PROD_CONFIG;
  }
  debugLog('[Firebase]','Using RBF2-STAGING config');
  return RBF2_STAGING_CONFIG;
}

// ===== debug log =====
function debugLog(...args){
  console.log(...args);
  const panel=document.getElementById('m-debug-panel');
  if(panel){
    const time=new Date().toTimeString().slice(0,8);
    const line=document.createElement('div');
    line.textContent=time+' '+args.join(' ');
    panel.appendChild(line);
    panel.scrollTop=panel.scrollHeight;
  }
}

// ===== 初始化 Firebase =====
const app=initializeApp(getFirebaseConfig());
const auth=getAuth(app);
const db=getFirestore(app);

// 暴露給其他 module 用
export { auth, db, debugLog };

// ===== Teacher 模式（?role=teacher，老師 / 師母共用帳號）=====
// v1.7 階段 17：跟桌機 ?role=teacher 邏輯一致，密碼驗證 → fake user → 跳過 Firebase Auth
const TEACHER_PASSWORDS = {
  'fj2026':   { uid: 'teacher-shared',  name: '老師' },
  'fj202602': { uid: 'teacher2-shared', name: '師母' }
};
const TEACHER_LS_KEY = 'm_teacher_session';
let _fakeTeacher = null; // { uid, displayName } 設好後 getEffectiveUid 回傳這個 uid
const isTeacherMode = new URLSearchParams(window.location.search).get('role') === 'teacher';

// 給其他 module 取 uid 用（teacher 模式回 fake uid，否則回 firebase auth uid）
export function getEffectiveUid() {
  if (_fakeTeacher) return _fakeTeacher.uid;
  return (auth.currentUser && auth.currentUser.uid) || null;
}
export function getEffectiveDisplayName() {
  if (_fakeTeacher) return _fakeTeacher.displayName;
  return (auth.currentUser && auth.currentUser.displayName) || null;
}
// 本人姓名快取（橫幅「回到本人」按鈕用；登入時 + 本人改名時更新）
let _selfName = '';
export function setSelfName(n) { _selfName = n || ''; }
export function getSelfName() { return _selfName; }

// ===== 個案管理 M1：目前分析對象（本人 = null / 個案 = caseId）=====
// 狀態存 localStorage，per-uid（同帳號跨裝置不同步「正在看誰」是刻意的：各裝置各自選）
// 本人模式（caseId = null）時 getCurrentDocRef 回 users/{uid}，與 M1 之前行為完全一致（向後相容）
function _activeCaseLsKey() {
  return 'm_active_case_' + (getEffectiveUid() || 'anon');
}
export function getActiveCaseId() {
  try { return localStorage.getItem(_activeCaseLsKey()) || null; } catch (e) { return null; }
}
export function setActiveCase(caseId) {
  try {
    if (caseId) localStorage.setItem(_activeCaseLsKey(), caseId);
    else localStorage.removeItem(_activeCaseLsKey());
  } catch (e) {}
}
// 目前分析對象的 doc ref：本人 → users/{uid}；個案 → users/{uid}/cases/{caseId}
export function getCurrentDocRef() {
  const uid = getEffectiveUid();
  if (!uid) return null;
  const caseId = getActiveCaseId();
  if (caseId) return doc(db, 'users', uid, 'cases', caseId);
  return doc(db, 'users', uid);
}
// 列出本帳號所有個案（依 createdAt 由舊到新）；回傳 [{id, ...data}]
export async function listCases() {
  const uid = getEffectiveUid();
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'cases'));
    const arr = [];
    snap.forEach(function (d) { arr.push(Object.assign({ id: d.id }, d.data())); });
    arr.sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
    return arr;
  } catch (e) {
    debugLog('[Case]', 'listCases 失敗', e && e.message ? e.message : e);
    return [];
  }
}
// 新增個案（M1：手機簡單表單用）；回傳新個案 id
export async function createCase(fields) {
  const uid = getEffectiveUid();
  if (!uid) throw new Error('未登入');
  const payload = {
    name: (fields.name || '').trim(),
    gender: fields.gender || '',
    birthday: fields.birthday || '',
    group: fields.group || '',
    color: fields.color || '',
    note: fields.note || '',
    createDate: fields.createDate || new Date().toISOString().slice(0, 10), // 建立日期（可編輯，預設今天）
    createdAt: new Date().toISOString()
  };
  const ref = await addDoc(collection(db, 'users', uid, 'cases'), payload);
  return ref.id;
}
// 更新個案欄位（name/gender/birthday/group/color 等）；merge 寫入 + updatedAt
export async function updateCase(caseId, fields) {
  const uid = getEffectiveUid();
  if (!uid || !caseId) throw new Error('參數不足');
  const payload = Object.assign({}, fields, { updatedAt: new Date().toISOString() });
  await setDoc(doc(db, 'users', uid, 'cases', caseId), payload, { merge: true });
}
// 刪除個案
export async function deleteCase(caseId) {
  const uid = getEffectiveUid();
  if (!uid || !caseId) throw new Error('參數不足');
  await deleteDoc(doc(db, 'users', uid, 'cases', caseId));
}
// 更新本人帳號層欄位（如 cardColor）；merge 寫 users/{uid}
export async function updateSelfCard(fields) {
  const uid = getEffectiveUid();
  if (!uid) throw new Error('未登入');
  await setDoc(doc(db, 'users', uid), Object.assign({}, fields, { profileUpdatedAt: new Date().toISOString() }), { merge: true });
  window.__userData = Object.assign(window.__userData || {}, fields);
}
// 儲存分組設定（順序＋說明）到 users/{uid}
export async function saveGroups(groupOrder, groupDescs) {
  const uid = getEffectiveUid();
  if (!uid) throw new Error('未登入');
  await setDoc(doc(db, 'users', uid), { groupOrder: groupOrder || [], groupDescs: groupDescs || {}, updatedAt: new Date().toISOString() }, { merge: true });
}

// ===== 桌機浮動筆記（上課兵法報告 / 部位觀察報告 / 個案工作區報告 共用；存目前對象的 reportNote）=====
let _noteWired = false;
let _noteSaveTimer = null;
function _wireReportNote() {
  if (_noteWired) return;
  const fab = document.getElementById('m-note-fab');
  const panel = document.getElementById('m-note-panel');
  const closeB = document.getElementById('m-note-close');
  const ta = document.getElementById('m-note-text');
  if (!fab || !panel || !ta) return;
  _noteWired = true;
  fab.addEventListener('click', function () {
    const open = panel.classList.toggle('is-open');
    fab.classList.toggle('is-open', open);
    if (open) { ta.value = (window.__userData && window.__userData.reportNote) || ''; ta.focus(); }
  });
  if (closeB) closeB.addEventListener('click', function () { panel.classList.remove('is-open'); fab.classList.remove('is-open'); });
  ta.addEventListener('input', function () {
    const st = document.getElementById('m-note-status'); if (st) st.textContent = '輸入中…';
    if (_noteSaveTimer) clearTimeout(_noteSaveTimer);
    const val = ta.value;
    _noteSaveTimer = setTimeout(async function () {
      try {
        const ref = getCurrentDocRef(); if (!ref) return;
        await setDoc(ref, { reportNote: val }, { merge: true });
        window.__userData = Object.assign(window.__userData || {}, { reportNote: val });
        const s = document.getElementById('m-note-status'); if (s) s.textContent = '已儲存 ✓';
      } catch (e) {
        const s = document.getElementById('m-note-status'); if (s) s.textContent = '儲存失敗';
      }
    }, 700);
  });
}
export function showReportNote() {
  if (!isDesktopSidebar()) { hideReportNote(); return; }   // 桌機限定
  _wireReportNote();
  const fab = document.getElementById('m-note-fab'); if (fab) fab.style.display = 'inline-flex';
  // 載入目前對象的筆記（使用者沒在打字才覆寫，避免蓋掉輸入中內容）
  const ta = document.getElementById('m-note-text');
  if (ta && document.activeElement !== ta) ta.value = (window.__userData && window.__userData.reportNote) || '';
}
export function hideReportNote() {
  const fab = document.getElementById('m-note-fab'); if (fab) fab.style.display = 'none';
  const panel = document.getElementById('m-note-panel'); if (panel) panel.classList.remove('is-open');
}
// 分析分頁頂部橫幅：「{姓名} 的 人相兵法」＋整列底色＝該對象顏色
const _BANNER_DEFAULT_COLOR = '#D9CBA8';
function _bannerTint(hex) {
  if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return '#fbf7f0';
  let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#fbf7f0';
  const f = 0.40;
  r = Math.round(r * f + 255 * (1 - f)); g = Math.round(g * f + 255 * (1 - f)); b = Math.round(b * f + 255 * (1 - f));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
export function updateAnalysisBanner() {
  const banner = document.getElementById('m-analysis-banner');
  const el = document.getElementById('m-analysis-banner-name');
  if (!el) return;
  const ud = window.__userData || {};
  const name = ud.displayName || '本人';
  el.textContent = name + ' 的 人相兵法';
  const color = ud.color || ud.cardColor || _BANNER_DEFAULT_COLOR;
  if (banner) banner.style.background = _bannerTint(color);
  // 分析個案時，姓名列右邊出現「回到本人」按鈕
  const backBtn = document.getElementById('m-analysis-back-self');
  if (backBtn) {
    if (getActiveCaseId()) {
      backBtn.textContent = '回到' + (_selfName || '本人') + ' ›';
      backBtn.style.display = 'inline-flex';
      backBtn.onclick = _backToSelf;
    } else {
      backBtn.style.display = 'none';
    }
  }
  // 橫幅顯示條件：在填寫/報告分頁(input/manual) 且 正在分析某個案 才顯示（本人不顯示，保持乾淨）
  if (banner) {
    const at = document.querySelector('.m-tab.active');
    const k = at && at.dataset.tab;
    banner.style.display = ((k === 'input' || k === 'manual') && getActiveCaseId()) ? 'flex' : 'none';
  }
}
// 從個案分析切回本人，並重掛目前分析分頁
async function _backToSelf() {
  setActiveCase(null);
  try { await refreshUserData(); } catch (e) {}
  updateAnalysisBanner();
  const activeTab = document.querySelector('.m-tab.active');
  const key = activeTab && activeTab.dataset.tab;
  if (key === 'input') { try { unmountInput(); } catch (e) {} mountInput(document.getElementById('m-page-input')); renderInputSubnav(); }
  else if (key === 'manual') { try { unmountManual(); } catch (e) {} mountManual(document.getElementById('m-page-manual')); renderManualSubnav(); }
}

// ============================================================
// 桌機個案工作區（側欄「個案管理」下方展開：被分析者名稱 ＋ ✕ ＋ 四分頁）
//   - 一次一個個案；上方「上課/部位觀察/我的/首頁」永遠是本人
//   - 進入某分頁 → active=該個案 + 整頁染個案卡片色淡版
//   - 桌機限定（手機無側欄，沿用既有「個案管理→細節→報告連結」流程）
// ============================================================
export function isDesktopSidebar() {
  try { return window.matchMedia('(min-width:1024px)').matches; } catch (e) { return false; }
}
let _wsCase = null;     // {id,name,color}
let _wsSub = null;      // 'obs' | 'obs-report' | 'manual' | 'manual-report'
// 桌機工作區側欄：兩組（系統計算 / 手動輸入）。手動輸入點了直接出現可填寫的兵法報告（manual overview）
// 桌機工作區「基本資料」的內容渲染在 m_report.js（緊耦合 _paintDashboard 狀態）。
// m_report 已單向依賴本檔，為避免循環 import，改用回呼註冊：m_report 載入時把 renderer 登記進來。
let _caseBasicRenderer = null;
export function setCaseBasicRenderer(fn) { _caseBasicRenderer = fn; }
// 手機工作區頂部列：兩組（系統計算 / 手動建立），比照個案儀表板的兩個報告家族
const MWS_GROUPS = [
  { title: '快速報告', subs: [
    { key: 'obs', label: '部位觀察' },
    { key: 'obs-dim', label: '依維度填寫' },
    { key: 'obs-report', label: '兵法報告' }
  ] },
  { title: '手動評分', subs: [
    { key: 'manual', label: '自我評分' },
    { key: 'manual-report', label: '兵法報告' }
  ] }
];
function _wsEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
// 把個案色淡淡混進某個底色。f 越大越濃。
function _wsBlend(base, hex, f) {
  let r = 154, g = 138, b = 110;
  if (hex && hex.charAt(0) === '#' && hex.length >= 7) {
    const rr = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), bb = parseInt(hex.slice(5, 7), 16);
    if (!isNaN(rr) && !isNaN(gg) && !isNaN(bb)) { r = rr; g = gg; b = bb; }
  }
  return 'rgb(' + Math.round(base[0] * (1 - f) + r * f) + ',' + Math.round(base[1] * (1 - f) + g * f) + ',' + Math.round(base[2] * (1 - f) + b * f) + ')';
}
// 整頁淡染（在內容底下）：個案色混進頁底色 #f7f4ef，f=0.12（要調改這數字）
function _wsWash(hex) { return _wsBlend([247, 244, 239], hex, 0.12); }
function _renderWorkspace() {
  const host = document.getElementById('m-ws');
  if (!host) return;
  if (!_wsCase) { host.innerHTML = ''; host.style.display = 'none'; host.style.background = ''; return; }
  host.style.display = '';
  host.style.background = '';  // 這一區不放底色
  // 三個並列項：基本資料 / 手動評分 / 快速報告（快速報告選中時展開子項），比照手機三 tab（Mike 2026-07-20）
  const cur = _wsSub;
  const isFast = (cur === 'obs' || cur === 'obs-dim' || cur === 'obs-report');
  const item = function (key, label, extraCls) {
    return '<button class="m-ws-item' + (cur === key ? ' active' : '') + (extraCls || '') + '" data-ws="' + key + '">' + _wsEsc(label) + '</button>';
  };
  const fastSubs = isFast
    ? '<div class="m-ws-subwrap">' + item('obs', '部位觀察') + item('obs-dim', '依維度填寫') + item('obs-report', '兵法報告') + '</div>'
    : '';
  const items = item('basic', '基本資料')
    + item('manual-report', '手動評分')
    + '<button class="m-ws-item m-ws-fast' + (isFast ? ' active' : '') + '" data-ws="obs">快速報告</button>'
    + fastSubs;
  host.innerHTML =
    '<div class="m-ws-head"><span class="m-ws-name">' + _wsEsc(_wsCase.name) + '</span>' +
    '<span class="m-ws-close-wrap"><button class="m-ws-close" id="m-ws-close">✕</button>' +
    '<span class="m-ws-close-tip">退出 ' + _wsEsc(_wsCase.name) + '</span></span></div>' +
    '<div class="m-ws-bar" style="background:' + (_wsCase.color || '#c9b98e') + '"></div>' +
    '<div class="m-ws-items">' + items + '</div>';
  const cl = host.querySelector('#m-ws-close'); if (cl) cl.onclick = closeCaseWorkspace;
  host.querySelectorAll('[data-ws]').forEach(function (b) { b.addEventListener('click', function () { selectWorkspaceSub(b.dataset.ws); }); });
}
// 手機工作區頂部列：個案名 ＋ 返回清單 ＋ 兩組子頁鈕（系統計算／手動建立）
function _renderMobileWs() {
  const host = document.getElementById('m-mws');
  if (!host) return;
  if (!_wsCase) { host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = '';
  const groups = MWS_GROUPS.map(function (g) {
    const items = g.subs.map(function (s) {
      return '<button class="m-mws-item' + (s.key === _wsSub ? ' active' : '') + '" data-mws="' + s.key + '">' + _wsEsc(s.label) + '</button>';
    }).join('');
    return '<div class="m-mws-group"><span class="m-mws-gtitle">' + _wsEsc(g.title) + '</span><div class="m-mws-items">' + items + '</div></div>';
  }).join('');
  host.innerHTML =
    '<div class="m-mws-top">' +
      '<button class="m-mws-back" id="m-mws-back">‹ 個案清單</button>' +
      '<span class="m-mws-bar" style="background:' + (_wsCase.color || '#c9b98e') + '"></span>' +
      '<span class="m-mws-name">' + _wsEsc(_wsCase.name) + '</span>' +
    '</div>' + groups;
  const bk = host.querySelector('#m-mws-back'); if (bk) bk.onclick = closeCaseWorkspace;
  host.querySelectorAll('[data-mws]').forEach(function (b) { b.addEventListener('click', function () { selectWorkspaceSub(b.dataset.mws); }); });
}
function _hideMobileWs() { const h = document.getElementById('m-mws'); if (h) { h.style.display = 'none'; h.innerHTML = ''; } }

// 開啟某個案的工作區（取代既有的；一次一個），預設停在 subKey（不給 → 部位觀察分析）
export function openCaseWorkspace(caseObj, subKey) {
  if (!caseObj || !caseObj.id) return;
  _wsCase = { id: caseObj.id, name: caseObj.name || '個案', color: caseObj.color || '' };
  _wsSub = null;
  _renderWorkspace();
  selectWorkspaceSub(subKey || 'obs');
}
// 切到工作區某分頁：設 active=個案、「直接」掛對應分析頁（不透過上方分頁 click，
// 避免上方 部位觀察/上課 被高亮、也不顯示它們的子膠囊）。個案分析完全走側欄工作區。
export function selectWorkspaceSub(key) {
  if (!_wsCase) return;
  const isBasic = (key === 'basic');
  const isManual = (key === 'manual' || key === 'manual-report');
  const subTab = isBasic ? 'basic' : (isManual ? 'manual' : 'input');
  // 離開目前內容的未存提示（目前可能在某個分析頁）
  const pInput = document.getElementById('m-page-input');
  const pManual = document.getElementById('m-page-manual');
  const pReport = document.getElementById('m-page-report');
  const pHome = document.getElementById('m-page-home');
  const curInputActive = pInput && pInput.classList.contains('active');
  const curManualActive = pManual && pManual.classList.contains('active');
  if (curInputActive && getSaveStatus() === 'dirty') { if (!confirm('你還有未儲存的答題，確定要離開嗎？')) return; discardDraft(); discardReportDraft(); }
  if (curManualActive && getManualDirty()) { if (!confirm('你還有未儲存的手動填答，確定要離開嗎？')) return; discardManualDraft(); }

  setActiveCase(_wsCase.id);
  // 上方分頁全部取消高亮、清掉上方子膠囊（個案分析不碰上方選項）
  document.querySelectorAll('.m-tab').forEach(function (b) { b.classList.remove('active'); });
  clearInputSubnav(); clearManualSubnav();
  [pInput, pManual, pReport, pHome].forEach(function (p) { if (p) p.classList.remove('active'); });

  if (subTab === 'basic') {
    // 基本資料：渲染進個案管理容器（m-page-report）；退出工作區時 mountFinderDesktop 會重繪
    if (pReport) pReport.classList.add('active');
    unmountInput(); unmountManual(); unmountReport();
    if (_caseBasicRenderer) _caseBasicRenderer(_wsCase, pReport);
  } else if (subTab === 'input') {
    if (pInput) pInput.classList.add('active');
    unmountReport(); unmountManual();
    const _wsView = key === 'obs-report' ? 'report' : (key === 'obs-dim' ? 'dim' : 'part');
    if (key === 'obs-report') { try { localStorage.setItem('m_input_view_once', 'report'); } catch (e) {} }
    mountInput(pInput);
    try { setInputView(_wsView); } catch (e) {}
  } else {
    if (pManual) pManual.classList.add('active');
    unmountInput(); unmountReport();
    try { localStorage.setItem('m_manual_view_once', key === 'manual-report' ? 'overview' : 'input'); } catch (e) {}
    mountManual(pManual);
    try { setManualView(key === 'manual-report' ? 'overview' : 'input'); } catch (e) {}
  }
  // 基本資料自帶存檔鈕 → 隱藏底部整頁儲存區；其餘子頁顯示
  const sz = document.getElementById('m-save-zone'); if (sz) sz.classList.toggle('is-hidden', isBasic);
  try { localStorage.setItem('m_active_tab', 'cases'); } catch (e) {}
  _wsSub = key;
  document.body.classList.add('m-ws-active');
  document.body.style.setProperty('--ws-tint', _wsWash(_wsCase.color));
  if (isDesktopSidebar()) {
    _renderWorkspace();
  } else {
    // 手機：保留「個案管理」tab 高亮（工作區在個案管理 tab 內完成）＋ 顯示手機頂部列（取代側欄）
    const cb = document.querySelector('.m-tab[data-tab="cases"]'); if (cb) cb.classList.add('active');
    document.body.classList.add('m-mws-active');
    _renderMobileWs();
  }
  try { localStorage.removeItem('m_input_view_once'); localStorage.removeItem('m_manual_view_once'); } catch (e) {}
}
// ✕：關閉工作區、回到「個案管理」清單（工作區消失）
export function closeCaseWorkspace() {
  if (getSaveStatus() === 'dirty') { if (!confirm('你還有未儲存的答題，確定要離開嗎？')) return; discardDraft(); discardReportDraft(); }
  if (getManualDirty()) { if (!confirm('你還有未儲存的手動填答，確定要離開嗎？')) return; discardManualDraft(); }
  _wsCase = null; _wsSub = null;
  document.body.classList.remove('m-ws-active');
  document.body.classList.remove('m-mws-active');
  _hideMobileWs();
  setActiveCase(null);
  _renderWorkspace();
  const tb = document.querySelector('.m-tab[data-tab="cases"]'); if (tb) tb.click();
}
// 點上方分頁時：取消工作區的染色/高亮，但側欄工作區仍保留（個案還釘在那）
function _exitWorkspaceActive() {
  _wsSub = null;
  document.body.classList.remove('m-ws-active');
  _renderWorkspace();
}

// ===== Cross-device sync：抓最新 firestore user doc 更新 window.__userData =====
// v1.7 階段 A：mountInput / mountManual / mountReport 進來時呼叫，桌機改的資料手機看得到
// 用 getDocFromServer 強制從 server 拿（避免 firebase SDK 預設 cache 拿到舊資料）
// 失敗回 false（呼叫方自行 fallback 用既有 window.__userData）
export async function refreshUserData() {
  try {
    const uid = getEffectiveUid();
    if (!uid) return false;
    const userRef = getCurrentDocRef();
    const userSnap = await getDocFromServer(userRef);
    if (!userSnap.exists()) return false;
    const ud = userSnap.data();
    // 個案 doc 用 name 欄位 → 正規化成 displayName，讓既有讀 displayName 的碼通用
    if (getActiveCaseId() && ud.name != null && ud.displayName == null) ud.displayName = ud.name;
    window.__userData = ud;
    debugLog('[Sync]', 'refreshed ✓ obsJson:', (ud.obsJson || '').length,
             'manualDataJson:', (ud.manualDataJson || '').length,
             'updatedAt:', ud.updatedAt || 'none');
    return true;
  } catch (e) {
    debugLog('[Sync]', 'refreshUserData 失敗', e && e.message ? e.message : e);
    return false;
  }
}

// ===== STAGING 識別：banner 取消，改用 nav title 橘色 =====
(function(){
  const host=window.location.hostname;
  if(host==='staging.fengjian.pages.dev'||/^[a-z0-9-]+\.fengjian\.pages\.dev$/.test(host)){
    document.body.classList.add('m-staging-mode');
  }
})();

// ===== DOM 引用 =====
const elLogin=document.getElementById('m-login');
const elDenied=document.getElementById('m-denied');
const elLoading=document.getElementById('m-loading');
const elMain=document.querySelector('.m-main');
const elNav=document.querySelector('.m-nav');
const elNavUser=document.getElementById('m-nav-user');
const elTabbar=document.getElementById('m-tabbar');

function showLoading(){elLoading.style.display='flex';elLogin.style.display='none';elDenied.style.display='none';elMain.style.display='none';elNav.style.display='none';elTabbar.style.display='none';}
function showLogin(){elLoading.style.display='none';elLogin.style.display='flex';elDenied.style.display='none';elMain.style.display='none';elNav.style.display='none';elTabbar.style.display='none';}
function showDenied(){elLoading.style.display='none';elLogin.style.display='none';elDenied.style.display='flex';elMain.style.display='none';elNav.style.display='none';elTabbar.style.display='none';}
function showApp(displayName){
  elLoading.style.display='none';elLogin.style.display='none';elDenied.style.display='none';
  elMain.style.display='block';elNav.style.display='flex';elTabbar.style.display='flex';
  // v1.7 階段 13：頂部右上不再顯示 user name，改顯示「登出」（功能不變，點擊登出）
  elNavUser.textContent='登出';
  elNavUser.classList.remove('is-guest');
  setSelfName(displayName);
  initHome(displayName);
  // 恢復上次 tab（重整後留在原頁，而非預設首頁）
  try {
    let lastTab = localStorage.getItem('m_active_tab');
    // 「我的」(report) tab 已移除：手機導向「個案」(cases)；桌機導向「首頁」(home＝本人儀表板)
    if (lastTab === 'report') lastTab = isDesktopSidebar() ? 'home' : 'cases';
    if (lastTab && lastTab !== 'home') {
      // 部位觀察子頁還原:只在「重整還原」時把上次子頁塞進一次性信號,
      // 正常手動點 tab 不受影響(mountInput 仍預設回部位視角)。
      // 報告/參數分析→m_input_view_once;維度視角→m_input_submode_once(部位視角為預設,免設)。
      if (lastTab === 'input') {
        const v = localStorage.getItem('m_input_view');
        const sub = localStorage.getItem('m_input_submode');
        if (v === 'report' || v === 'sens' || v === 'spiceov') localStorage.setItem('m_input_view_once', v);
        else if (sub === 'dim') localStorage.setItem('m_input_submode_once', 'dim');
      }
      const restoreBtn = document.querySelector('.m-tab[data-tab="' + lastTab + '"]');
      if (restoreBtn) restoreBtn.click();
    } else if (isDesktopSidebar()) {
      // 桌機首頁＝本人儀表板：HTML 預設 active 的是 m-page-home（手機我的資料），
      // 桌機需主動觸發一次 home click → 走 mountReport 顯示儀表板
      const hb = document.querySelector('.m-tab[data-tab="home"]');
      if (hb) hb.click();
    }
  } catch (e) {}
}

// 初始顯示 loading（防 race）
showLoading();

// ===== 白名單檢查 =====
async function checkWhitelist(user){
  const ADMIN_UID_PROD='XT1Err9cmnNokgMQKUrGUj3ishG2';
  const ADMIN_UID_STAGING='ARGLfFp3HqbWMtN7CAoAxR4rHhm1';
  if(user.uid===ADMIN_UID_PROD||user.uid===ADMIN_UID_STAGING) return true;
  try{
    const email=(user.email||'').toLowerCase();
    if(!email) return false;
    const allowedRef=doc(db,'allowedUsers',email);
    const allowedSnap=await getDoc(allowedRef);
    return allowedSnap.exists();
  }catch(e){
    debugLog('[Auth] 白名單查詢失敗',e&&e.message?e.message:e);
    return false;
  }
}

// ===== 登入按鈕 =====
document.getElementById('m-login-btn').addEventListener('click',async function(){
  elLogin.classList.add('is-loading');
  try{
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // 每次登入都跳帳號選擇(登出後可換帳號)
    debugLog('[Auth]','開始 signInWithPopup');
    const result=await signInWithPopup(auth,provider);
    debugLog('[Auth]','signInWithPopup 成功，user =',result.user.email||result.user.uid);
  }catch(e){
    debugLog('[Auth]','signInWithPopup 失敗',e&&e.code,e&&e.message?e.message:e);
    elLogin.classList.remove('is-loading');
    alert('登入失敗：'+(e.message||e));
  }
});

// ===== auth 流程 =====
async function initAuth(){
  debugLog('[Auth]','initAuth 開始');
  try{
    await setPersistence(auth,browserLocalPersistence);
    debugLog('[Auth]','setPersistence(LOCAL) 完成');
  }catch(e){
    debugLog('[Auth]','setPersistence 失敗',e&&e.message?e.message:e);
  }

  debugLog('[Auth]','啟動 onAuthStateChanged');
  onAuthStateChanged(auth,async function(user){
    debugLog('[Auth]','onAuthStateChanged 觸發，user =',user?(user.email||user.uid):'null');
    if(user){
      showLoading();
      try{
        const allowed=await checkWhitelist(user);
        debugLog('[Auth]','白名單檢查結果：',allowed);
        if(!allowed){
          await signOut(auth);
          showDenied();
          return;
        }
        // 記錄本次登入時間到白名單(本人可只更新自己的 lastLoginAt,供 admin2 使用者分頁顯示);非致命,失敗不擋登入
        try { const _le=(user.email||'').toLowerCase(); if(_le) await setDoc(doc(db,'allowedUsers',_le),{lastLoginAt:new Date().toISOString()},{merge:true}); }
        catch(e){ debugLog('[Auth]','寫 lastLoginAt 失敗',e&&e.message?e.message:e); }
        let displayName=user.displayName||(user.email||'').split('@')[0];
        try{
          const userRef=doc(db,'users',user.uid);
          const userSnap=await getDoc(userRef);
          if(userSnap.exists()){
            const ud=userSnap.data();
            displayName=ud.displayName||displayName;
            window.__userData=ud;
            debugLog('[Auth]','讀到既有 user document，displayName =',displayName);
          }else{
            await setDoc(userRef,{
              displayName:user.displayName||'',
              email:user.email||'',
              role:'student',
              createdAt:new Date().toISOString()
            });
            window.__userData={displayName:user.displayName||'',email:user.email||'',role:'student'};
            debugLog('[Auth]','user document 建立完成');
          }
        }catch(e){
          debugLog('[Auth]','讀取/建立 user document 失敗',e&&e.message?e.message:e);
        }
        // 先載 questions（讓首頁進度條可以用實際題目總數）
        try { await ensureQuestionsLoaded(); }
        catch(e){ debugLog('[Auth]','ensureQuestionsLoaded 失敗',e&&e.message?e.message:e); }
        // 載入紅點 updateLog + seenLog（v1.7 階段 16）
        try { await initBadges(); }
        catch(e){ debugLog('[Auth]','initBadges 失敗',e&&e.message?e.message:e); }
        debugLog('[Auth]','呼叫 showApp，displayName =',displayName);
        showApp(displayName);
      }catch(e){
        debugLog('[Auth]','登入後處理失敗',e&&e.message?e.message:e);
        showDenied();
      }
    }else{
      showLogin();
      const btn=document.getElementById('m-login-btn');
      if(btn) btn.disabled=false;
    }
  });
}
// ===== Teacher 模式入口（v1.7 階段 17）=====
function showTeacherLogin() {
  elLoading.style.display='none';
  elLogin.style.display='none';
  elDenied.style.display='none';
  elMain.style.display='none';
  elNav.style.display='none';
  elTabbar.style.display='none';
  const elTeacher = document.getElementById('m-teacher-login');
  if (elTeacher) elTeacher.style.display='flex';
  const pwdInput = document.getElementById('m-teacher-pwd');
  const submitBtn = document.getElementById('m-teacher-submit');
  const errEl = document.getElementById('m-teacher-error');
  if (submitBtn) submitBtn.onclick = function(){ _checkTeacherPwd(); };
  if (pwdInput) pwdInput.onkeydown = function(e){ if (e.key === 'Enter') _checkTeacherPwd(); };
  // 自動 restore 上次驗證過的 session
  try {
    const saved = localStorage.getItem(TEACHER_LS_KEY);
    if (saved && TEACHER_PASSWORDS[saved]) {
      const elInput = document.getElementById('m-teacher-pwd');
      if (elInput) elInput.value = '';
      _acceptTeacher(TEACHER_PASSWORDS[saved]);
      return;
    }
  } catch (e) {}
  if (pwdInput) setTimeout(function(){ pwdInput.focus(); }, 100);
}
function _checkTeacherPwd() {
  const pwdInput = document.getElementById('m-teacher-pwd');
  const errEl = document.getElementById('m-teacher-error');
  const pwd = pwdInput ? pwdInput.value.trim() : '';
  const acct = TEACHER_PASSWORDS[pwd];
  if (acct) {
    try { localStorage.setItem(TEACHER_LS_KEY, pwd); } catch (e) {}
    if (errEl) errEl.style.display='none';
    _acceptTeacher(acct);
  } else {
    if (errEl) errEl.style.display='block';
    if (pwdInput) pwdInput.value='';
  }
}
async function _acceptTeacher(acct) {
  _fakeTeacher = { uid: acct.uid, displayName: acct.name };
  debugLog('[Teacher]', 'login', acct.name, 'uid=', acct.uid);
  const elTeacher = document.getElementById('m-teacher-login');
  if (elTeacher) elTeacher.style.display='none';
  showLoading();
  // 讀 / 建 user doc（rules 已開後門允許 teacher-shared / teacher2-shared）
  try {
    const userRef = doc(db, 'users', acct.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      window.__userData = userSnap.data();
    } else {
      const initData = { displayName: acct.name, role: 'student', createdAt: new Date().toISOString() };
      await setDoc(userRef, initData);
      window.__userData = initData;
    }
  } catch (e) {
    debugLog('[Teacher]', 'user doc 讀取失敗', e && e.message);
  }
  try { await ensureQuestionsLoaded(); } catch (e) {}
  try { await initBadges(); } catch (e) {}
  showApp(acct.name);
}

if (isTeacherMode) {
  showTeacherLogin();
} else {
  initAuth();
}

// ===== Tab 切換 =====
(function(){
  const tabs=document.querySelectorAll('.m-tab');
  const pages={
    home:document.getElementById('m-page-home'),
    input:document.getElementById('m-page-input'),
    manual:document.getElementById('m-page-manual'),
    report:document.getElementById('m-page-report')
  };
  tabs.forEach(function(btn){
    btn.addEventListener('click',async function(){
      const key=btn.dataset.tab;
      // 兩個工作區獨立 confirm：
      //   觀察工作區 = input ↔ report（內部切換不 confirm）
      //   手動工作區 = manual（獨立）
      // 從觀察工作區離開（input/report → manual/home）→ if input dirty 才 confirm
      // 從手動工作區離開（manual → input/report/home）→ if manual dirty 才 confirm
      const inputTabBtn = document.querySelector('.m-tab[data-tab="input"]');
      const reportTabBtn = document.querySelector('.m-tab[data-tab="report"]');
      const manualTabBtn = document.querySelector('.m-tab[data-tab="manual"]');
      const isOnInput = inputTabBtn && inputTabBtn.classList.contains('active');
      const isOnReport = reportTabBtn && reportTabBtn.classList.contains('active');
      const isOnManual = manualTabBtn && manualTabBtn.classList.contains('active');

      // 觀察工作區離開判斷
      const isOnObsWork = isOnInput || isOnReport;
      const isTargetObsWork = key === 'input' || key === 'report';
      if (isOnObsWork && !isTargetObsWork && getSaveStatus() === 'dirty') {
        if (!confirm('你還有未儲存的答題，確定要離開嗎？')) return;
        if (isOnInput) discardDraft();
        else if (isOnReport) discardReportDraft();
      }
      // 手動工作區離開判斷
      if (isOnManual && key !== 'manual' && getManualDirty()) {
        if (!confirm('你還有未儲存的手動填答，確定要離開嗎？')) return;
        discardManualDraft();
      }
      // 從個案工作區（側欄）點上方分頁離開 → 未存提示（工作區的 active 不在上方 .m-tab，上面兩個判斷抓不到）
      if (document.body.classList.contains('m-ws-active')) {
        if (getSaveStatus() === 'dirty') { if (!confirm('你還有未儲存的答題，確定要離開嗎？')) return; discardDraft(); discardReportDraft(); }
        if (getManualDirty()) { if (!confirm('你還有未儲存的手動填答，確定要離開嗎？')) return; discardManualDraft(); }
      }
      // 從個案管理（手機個案專屬頁的手動/系統 tab）離開 → 未存提示（cases tab active，上面判斷抓不到）
      const casesTabBtn = document.querySelector('.m-tab[data-tab="cases"]');
      const isOnCases = casesTabBtn && casesTabBtn.classList.contains('active');
      if (isOnCases && key !== 'cases') {
        if (getSaveStatus() === 'dirty') { if (!confirm('你還有未儲存的答題，確定要離開嗎？')) return; discardDraft(); discardReportDraft(); }
        if (getManualDirty()) { if (!confirm('你還有未儲存的手動填答，確定要離開嗎？')) return; discardManualDraft(); }
      }
      // 點底部 tab 一律離開個案工作區、切回本人（桌機側欄工作區仍釘著僅取消染色；手機頂部列直接收起）。
      let _forcedSelf = false;
      const _wasMobileWs = document.body.classList.contains('m-mws-active');
      // 先即時清掉工作區的染色/高亮（不要等下面的網路 refresh，否則點底部 tab 會殘留個案染色）
      if (document.body.classList.contains('m-ws-active')) _exitWorkspaceActive();
      if (_wasMobileWs) { document.body.classList.remove('m-mws-active'); _hideMobileWs(); }
      // 主帳號與個案完全分割（Mike 2026-07-10）：切到任何非個案管理分頁一律回本人
      // → 部位觀察/上課等主分頁永遠是本人資料，不再出現「目前分析個案+回本人」橫幅
      if (key !== 'cases' && getActiveCaseId()) {
        setActiveCase(null);
        try { await refreshUserData(); } catch (e) {}
        _forcedSelf = true;  // 已換人 → 即使「已在該分頁」也要強制重掛，才會換成本人資料
      }
      tabs.forEach(function(b){b.classList.toggle('active',b===btn)});
      // 個案管理不再是「困住的蓋版」：底部 tab 一直露出，切到別的分頁時收起任何開著的個案 overlay
      // 收起前先暫存目前畫面（主頁/清單/專屬頁+tab），回到個案管理時還原
      if (key !== 'cases') {
        try { stashCasesView(); } catch (e) {}
        ['m-case-mgmt','m-case-list','m-case-page','m-case-detail','m-case-form'].forEach(function(id){ var o=document.getElementById(id); if(o) o.classList.remove('is-open'); });
      }
      // 個案管理 tab 沒有自己的 page section，底下沿用「我的」(report) 頁，overlay 蓋在上面。
      // 桌機「首頁」改顯示本人儀表板（＝我的），也用 report 頁；手機首頁維持 m-page-home（我的資料）
      const _isDesk = isDesktopSidebar();
      const pageKey = (key === 'cases' || (key === 'home' && _isDesk)) ? 'report' : key;
      Object.keys(pages).forEach(function(k){
        pages[k].classList.toggle('active',k===pageKey);
      });
      elMain.scrollTop=0;
      // 切換時顯示/隱藏儲存區
      // - input / manual：有輸入有儲存 → 顯示
      // - home / report：無儲存（report 變純看自動報告）→ 隱藏
      const saveZone = document.getElementById('m-save-zone');
      if(saveZone){
        saveZone.classList.toggle('is-hidden', key === 'home' || key === 'report' || key === 'cases');
      }
      // 「目前分析：XXX」橫幅：只在分析分頁（部位觀察 / 手動輸入）顯示
      // 個案分析橫幅（回本人入口）：顯示與否由 updateAnalysisBanner 依「目前分頁＋是否在分析個案」決定
      updateAnalysisBanner();
      // 記住目前 tab，重整時恢復
      try { localStorage.setItem('m_active_tab', key); } catch (e) {}
      // 浮動筆記預設收起；若接著掛到「報告」子畫面，m_input/m_manual 的 render 會再叫出來
      hideReportNote();
      // v1.7 階段 3：先 unmount 對方再 mount 自己
      // （m_input 內部會在報告 view mount m_report；mount 順序錯了會被外層 unmount 蓋掉）
      if(key==='input'){
        unmountReport();
        unmountManual();
        mountInput(pages.input);
      } else if(key==='report' || (key==='home' && _isDesk)){
        // 桌機首頁＝本人儀表板（複用 mountReport）；手機首頁走下方 else（我的資料表單）
        unmountInput();
        unmountManual();
        mountReport(pages.report);
      } else if(key==='cases'){
        unmountInput();
        unmountManual();
        unmountReport();
        // 桌機：渲染三欄 Finder 進 report 容器；手機：合併主頁 overlay（底下 report 頁留空，不再掛本人儀表板）
        openCaseMgmtView();
      } else if(key==='manual'){
        if (!isOnManual || _forcedSelf) {   // 已在上課又點上課 → 不重 mount；但「強制切回本人」要重掛換資料
          unmountInput();
          unmountReport();
          mountManual(pages.manual);
        }
      } else {
        unmountInput();
        unmountReport();
        unmountManual();
        // 首頁固定顯示本人（不受目前分析個案影響）
        if (key === 'home') { try { refreshHomeSelf(); } catch (e) {} }
      }
      // 側欄各區獨立展開:進某區→展開該區(已在該區再點=toggle收合);切到別區「不」收合其他區(D1/D2)
      if (key === 'manual') _subExpanded.manual = isOnManual ? !_subExpanded.manual : true;
      else if (key === 'input') _subExpanded.input = isOnInput ? !_subExpanded.input : true;
      _refreshSubnavs();
    });
  });
})();

// ===== 頂部姓名點擊登出 =====
elNavUser.addEventListener('click',async function(){
  if(elNavUser.classList.contains('is-guest')) return;
  const isDirty = getSaveStatus() === 'dirty';
  const msg = isDirty ? '你還有未儲存的答題，仍要登出嗎？' : '要登出嗎？';
  if(confirm(msg)){
    // 確定登出 → 兩邊草稿都捨棄（內部各自判斷有無 LS）
    if (isDirty) {
      try { discardDraft(); } catch (e) {}
      try { discardReportDraft(); } catch (e) {}
      try { discardManualDraft(); } catch (e) {}
    }
    // v1.7 階段 17：teacher 模式登出 = 清 teacher LS + reload（不 call firebase signOut）
    if (_fakeTeacher) {
      try { localStorage.removeItem(TEACHER_LS_KEY); } catch (e) {}
      location.reload();
      return;
    }
    await signOut(auth);
    location.reload();
  }
});

// ===== Debug 面板：toggle / clear 按鈕 =====
const _debugToggle = document.getElementById('m-debug-toggle');
const _debugPanel = document.getElementById('m-debug-panel');
const _debugClear = document.getElementById('m-debug-clear');
if (_debugToggle && _debugPanel) {
  _debugToggle.addEventListener('click', function(){
    _debugPanel.classList.toggle('active');
    document.body.classList.toggle('m-debug-on');
  });
}
if (_debugClear && _debugPanel) {
  _debugClear.addEventListener('click', function(){
    _debugPanel.innerHTML = '';
  });
}

// ===== Debug 面板：開機初始 log =====
debugLog('[Debug]','面板就緒');
debugLog('[Debug]','hostname =',window.location.hostname);
debugLog('[Debug]','href =',window.location.href);
