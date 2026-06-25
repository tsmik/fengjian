// p2/js/student/app.js — P2 學員前台外殼（B1）
// 職責：Google 登入、讀上線套裝清單、載入套裝、分頁(部位觀察/兵法報告)、辣度、存檔。
// 計算引擎 engine.js、資料層 load_ruleset.js、答題 answer.js、報告 report.js 皆沿用，不重做。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, getDocs, collection } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { loadRuleSetById } from '../load_ruleset.js';
import { renderAnswer, checkRefIntegrity } from './answer.js';
import { renderReport } from './report.js';

const P2_CFG = { apiKey: 'AIzaSyDZ3z9LV1g3rnhO0QjmYOfipUGMtD1cq7g', authDomain: 'rbf2app-staging.firebaseapp.com', projectId: 'rbf2app-staging', storageBucket: 'rbf2app-staging.firebasestorage.app', messagingSenderId: '565853308902', appId: '1:565853308902:web:8a7a3e63df1291124df827' };
const app = initializeApp(P2_CFG);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const $ = id => document.getElementById(id);
const STATE = { user: null, rs: null, obs: {}, spice: '大辣', activeId: null, dirty: false, tab: 'answer' };

function setStatus(m) { $('status').textContent = m || ''; }
function setSaveState() { $('btn-save').textContent = STATE.dirty ? '存檔 ●' : '存檔'; }

// ---------- auth ----------
$('btn-login').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => alert('登入失敗：' + (e.code || e.message)));
$('btn-logout').onclick = () => signOut(auth);

onAuthStateChanged(auth, async (u) => {
  STATE.user = u;
  $('btn-login').style.display = u ? 'none' : '';
  $('btn-logout').style.display = u ? '' : 'none';
  $('app').style.display = u ? '' : 'none';
  $('signin-hint').style.display = u ? 'none' : '';
  $('who').textContent = u ? u.email : '未登入';
  if (u) await onLogin();
});

async function onLogin() {
  setStatus('讀取套裝清單…');
  let activeId = null, defaultSpice = '大辣';
  try { const a = await getDoc(doc(db, 'config', 'active')); if (a.exists()) { activeId = a.data().activeRuleSetId || null; defaultSpice = a.data().defaultSpice || '大辣'; } } catch (e) {}
  STATE.activeId = activeId; STATE.spice = defaultSpice;
  const sel = $('sel-rs'); sel.innerHTML = '';
  try {
    const snap = await getDocs(collection(db, 'ruleSets'));
    const rows = []; snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    if (!rows.length) { sel.innerHTML = '<option value="">（無套裝）</option>'; }
    rows.forEach(r => {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = (r.name || r.id) + (r.id === activeId ? '　← 上線中' : '');
      if (r.id === activeId) o.selected = true;
      sel.appendChild(o);
    });
    setStatus(activeId ? '上線套裝已預選，按「載入」開始' : 'config/active 尚未設定，請手動選一個套裝載入');
  } catch (e) { sel.innerHTML = '<option value="">讀取失敗</option>'; setStatus('讀套裝清單失敗：' + (e.code || e.message)); }
}

// ---------- load ruleset ----------
$('btn-load').onclick = async () => {
  const id = $('sel-rs').value;
  if (!id) { alert('請先選一個套裝'); return; }
  setStatus('載入套裝 ' + id + ' …');
  try {
    STATE.rs = await loadRuleSetById(db, id, STATE.spice);
    STATE.spice = STATE.rs.defaultSpice;
    await restoreAnswers(id);
    const sp = document.querySelector(`input[name=spice][value="${STATE.spice}"]`); if (sp) sp.checked = true;
    $('spice-bar').style.display = '';
    $('tabs').style.display = '';
    showIntegrity();
    rerenderAnswer();
    rerenderReport();
    STATE.dirty = false; setSaveState();
    const nQ = STATE.rs.partNames.reduce((n, p) => n + STATE.rs.obsParts[p].total, 0);
    const nDim = STATE.rs.dims.filter(Boolean).length;
    setStatus(`已載入：${STATE.rs.partNames.length} 部位 / ${nQ} 題 / ${nDim} 維有規則`);
    setTab('answer');
  } catch (e) { setStatus('載入失敗：' + (e.code || e.message)); alert('載入失敗：' + (e.message || e.code)); }
};

async function restoreAnswers(id) {
  STATE.obs = {};
  try {
    const s = await getDoc(doc(db, 'users', STATE.user.uid));
    if (s.exists() && s.data().ruleSetId === id && s.data().obsJson) { STATE.obs = JSON.parse(s.data().obsJson) || {}; }
  } catch (e) {}
}

$('btn-save').onclick = async () => {
  if (!STATE.rs) { alert('先載入套裝'); return; }
  setStatus('存檔中…');
  try {
    await setDoc(doc(db, 'users', STATE.user.uid), { obsJson: JSON.stringify(STATE.obs), spice: STATE.spice, ruleSetId: STATE.rs.activeRuleSetId, updatedAt: new Date().toISOString() }, { merge: true });
    STATE.dirty = false; setSaveState();
    setStatus('已存檔 ✓');
  } catch (e) { setStatus('存檔失敗：' + (e.code || e.message)); }
};

// ---------- spice ----------
document.querySelectorAll('input[name=spice]').forEach(r => r.addEventListener('change', e => { STATE.spice = e.target.value; rerenderReport(); }));

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
function setTab(name) {
  STATE.tab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
  $('page-answer').style.display = name === 'answer' ? '' : 'none';
  $('page-report').style.display = name === 'report' ? '' : 'none';
}

// ---------- render glue ----------
function onAnswerChange() { STATE.dirty = true; setSaveState(); rerenderReport(); }
function rerenderAnswer() { renderAnswer($('page-answer'), STATE.rs, STATE.obs, onAnswerChange); }
function rerenderReport() { if (STATE.rs) renderReport($('page-report'), STATE.rs, STATE.obs, STATE.spice); }

function showIntegrity() {
  const w = $('warn'); const res = checkRefIntegrity(STATE.rs);
  w.style.display = '';
  if (res.ok) {
    w.className = 'warn ok';
    w.textContent = '✓ 題庫完整性檢查通過：所有維度條件引用的觀察題都存在。';
  } else {
    w.className = 'warn bad';
    w.innerHTML = '⚠️ 斷鏈：' + res.missing.length + ' 個條件引用到本套裝沒有的觀察題（這些部位會算不出 → 動靜不準）：<br>'
      + res.missing.map(r => `<b>${r}</b>（${[...res.refDims[r]].join('、')}）`).join('；');
  }
}
