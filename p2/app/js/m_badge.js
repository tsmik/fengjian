// ============================================================
// 手機版紅點機制（共用桌機 updateLog / seenLog 邏輯，modular SDK 版）
// updateLog：firestore config/updateLog 內每個 key 的 updatedAt
//   （P2 改讀 config/updateLog；P1 是 settings/updateLog。發布端 scripts/promote-p2-to-prod.js
//     用 lib/ruleset-diff.js 比對新舊套裝、把變動處寫進 config/updateLog。）
//   - part_{部位}  → 部位整體
//   - q_{部位}_{obsId} → 個別題目（前台 q.id = observation 的 obsId）
//   - dim_{維度}  → 維度規則
// seenLog：LS rxbf_seen_{uid}（跟桌機共用同 key，互不干擾）
//   hasUpdate(key) = updateLog[key] > seenLog[key] → 顯示紅點
// 基準線：帳號首次接觸紅點系統時，把當下 updateLog 全部視為已讀（避免整頁爆紅點）；
//   之後只有比基準線更新的變動才冒紅點。旗標＝users/{uid}.badgeBaseline。
// 被用：m_main.js login 後 initBadges；m_input.js render 各 tile / question 時查 hasUpdate
// ============================================================

import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { auth, db, debugLog, getEffectiveUid } from './m_main.js';

const SEEN_KEY_PREFIX = 'rxbf_seen_';

let _updateLog = {};
let _seenLog = {};
let _refreshCallbacks = [];
let _saveCloudTimer = null;

// per key timestamp 比較，取較新的
function _mergeSeen(local, remote) {
  const result = { ...local };
  for (const key in remote) {
    if (!result[key] || new Date(remote[key]) > new Date(result[key])) {
      result[key] = remote[key];
    }
  }
  return result;
}

function _saveSeen() {
  // 立即寫 LS（快 cache）
  const uid = getEffectiveUid() || 'anon';
  try { localStorage.setItem(SEEN_KEY_PREFIX + uid, JSON.stringify(_seenLog)); } catch (e) {}
  // debounce 1 秒寫 firestore（跨裝置同步）
  clearTimeout(_saveCloudTimer);
  _saveCloudTimer = setTimeout(_flushSeenToCloud, 1000);
}

async function _flushSeenToCloud() {
  const uid = getEffectiveUid();
  if (!uid) return;
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { badgeSeen: _seenLog }, { merge: true });
    debugLog('[Badge]', 'badgeSeen 寫雲端 ✓');
  } catch (e) {
    debugLog('[Badge]', 'badgeSeen 寫雲端失敗', e && e.message);
  }
}

function _loadSeen() {
  const uid = getEffectiveUid() || 'anon';
  try {
    const raw = localStorage.getItem(SEEN_KEY_PREFIX + uid);
    _seenLog = raw ? JSON.parse(raw) : {};
  } catch (e) {
    _seenLog = {};
  }
}

// login 後呼叫一次（m_main.js showApp 內）：load seen + fetch updateLog
export async function initBadges() {
  _loadSeen(); // LS 先載（快）
  try {
    const ref = doc(db, 'config', 'updateLog');   // P2：config/updateLog（規則允許登入者讀）
    const snap = await getDoc(ref);
    _updateLog = snap.exists() ? snap.data() : {};
    const allKeys = Object.keys(_updateLog);
    const partKeys = allKeys.filter(k => k.indexOf('part_') === 0);
    const dimKeys = allKeys.filter(k => k.indexOf('dim_') === 0);
    const qKeys = allKeys.filter(k => k.indexOf('q_') === 0);
    debugLog('[Badge]', 'updateLog total:', allKeys.length,
             'part:', partKeys.length, 'dim:', dimKeys.length, 'q:', qKeys.length);
    if (qKeys.length > 0) debugLog('[Badge]', 'q keys sample:', qKeys.slice(0, 5).join(', '));
  } catch (e) {
    debugLog('[Badge]', 'updateLog 載入失敗', e && e.message);
    _updateLog = {};
  }
  // v1.7 階段 16+：load cloud badgeSeen 並 merge（跨裝置同步）
  const uid = getEffectiveUid();
  if (uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      const ud = userSnap.exists() ? userSnap.data() : {};
      if (ud.badgeSeen) {
        const cloudSeen = ud.badgeSeen || {};
        const before = Object.keys(_seenLog).length;
        _seenLog = _mergeSeen(_seenLog, cloudSeen);
        // 寫回 LS（cloud 較新的 entries cache 起來）
        try { localStorage.setItem(SEEN_KEY_PREFIX + uid, JSON.stringify(_seenLog)); } catch (e) {}
        debugLog('[Badge]', 'badgeSeen 雲端載入 ✓ LS:', before, '→ merged:', Object.keys(_seenLog).length);
      }
      // 基準線：此帳號從未接觸紅點系統 → 把當下 updateLog 全部標成已讀，之後只有新變動才冒紅點。
      if (!ud.badgeBaseline) {
        for (const k in _updateLog) { _seenLog[k] = _updateLog[k]; }
        try { localStorage.setItem(SEEN_KEY_PREFIX + uid, JSON.stringify(_seenLog)); } catch (e) {}
        try { await setDoc(userRef, { badgeSeen: _seenLog, badgeBaseline: new Date().toISOString() }, { merge: true }); } catch (e) {}
        debugLog('[Badge]', '建立紅點基準線 ✓（現況全標已讀，', Object.keys(_updateLog).length, '個記號）');
      }
    } catch (e) {
      debugLog('[Badge]', 'badgeSeen 載入失敗', e && e.message);
    }
  }
  _notifyRefresh();
}

// 註冊 callback：updateLog / seenLog 變動時 trigger（讓 UI 重新 render dot）
export function onBadgeRefresh(fn) {
  _refreshCallbacks.push(fn);
}

function _notifyRefresh() {
  _refreshCallbacks.forEach(fn => { try { fn(); } catch (e) {} });
}

// ===== 查詢 =====

export function hasUpdate(key) {
  if (!_updateLog[key]) return false;
  if (!_seenLog[key]) return true;
  return new Date(_updateLog[key]) > new Date(_seenLog[key]);
}

// 部位有更新 = part_X 本身有更新 OR 該 part 下任一 q_X_qid 有更新
export function hasPartUpdate(partName) {
  if (hasUpdate('part_' + partName)) return true;
  const prefix = 'q_' + partName + '_';
  for (const key in _updateLog) {
    if (key.indexOf(prefix) === 0 && hasUpdate(key)) return true;
  }
  return false;
}

export function hasDimUpdate(dimName) {
  return hasUpdate('dim_' + dimName);
}

// ===== mark seen =====

export function markPartSeen(partName) {
  // 同桌機 _markPartSeen：只 mark part_X，不 cascade 該 part 下的 q_X_*
  // q 要 user 點選項才 mark seen（讓題目紅點 user 必須答到才消）
  _seenLog['part_' + partName] = new Date().toISOString();
  _saveSeen();
  _notifyRefresh();
}

export function markQuestionSeen(partName, qid) {
  const now = new Date().toISOString();
  _seenLog['q_' + partName + '_' + qid] = now;
  // 該 part 下所有 q 都看過 → mark part 也算看過
  const prefix = 'q_' + partName + '_';
  let allSeen = true;
  for (const key in _updateLog) {
    if (key.indexOf(prefix) === 0 && hasUpdate(key)) { allSeen = false; break; }
  }
  if (allSeen && _updateLog['part_' + partName]) {
    _seenLog['part_' + partName] = now;
  }
  _saveSeen();
  _notifyRefresh();
}

export function markDimSeen(dimName) {
  _seenLog['dim_' + dimName] = new Date().toISOString();
  _saveSeen();
  _notifyRefresh();
}
