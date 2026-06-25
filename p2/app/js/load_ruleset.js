// p2/js/load_ruleset.js — 讀「上線套裝」並轉成學員前台結構（P2，連 rbf2app）
// 讀 config/active → ruleSets/{id}/{dims, observations, obsmeta/layout}，
// 用 ruleset_convert.js 的純函式轉成 OBS_PARTS_DATA / dimDef[] / isPaired。
// firebase 依賴只在此檔；純轉換邏輯在 ruleset_convert.js（node 可單測）。
import { doc, getDoc, getDocs, collection } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { convertObservations, collectDims, buildIsPaired } from './ruleset_convert.js';

// 預設辣度＝大辣（Mike 2026-06-25 定）；config/active 未設時退回此值
const DEFAULT_SPICE = '大辣';

// 讀指定套裝 id → 轉成前台結構（dev/測試可直接指定，不經 config/active）
// db：已 init 的 rbf2app firestore 實例
// 回傳：{ activeRuleSetId, defaultSpice, dims, obsParts, isPaired, partNames }
export async function loadRuleSetById(db, id, defaultSpice) {
  if (!id) throw new Error('未指定套裝 id');
  // 並行抓 dims / observations / layout
  const [dimsSnap, obsSnap, laySnap] = await Promise.all([
    getDocs(collection(db, 'ruleSets', id, 'dims')),
    getDocs(collection(db, 'ruleSets', id, 'observations')),
    getDoc(doc(db, 'ruleSets', id, 'obsmeta', 'layout')),
  ]);

  const dimEntries = [];
  dimsSnap.forEach(d => dimEntries.push({ id: d.id, data: d.data() }));
  const dims = collectDims(dimEntries);

  const obsDocs = [];
  obsSnap.forEach(d => obsDocs.push(d.data()));
  const layout = (laySnap.exists() && laySnap.data().layout) ? laySnap.data().layout : {};
  const obsParts = convertObservations(obsDocs, layout);
  const isPaired = buildIsPaired(obsParts);
  const partNames = Object.keys(obsParts);

  return { activeRuleSetId: id, defaultSpice: defaultSpice || DEFAULT_SPICE, dims, obsParts, isPaired, partNames };
}

// 讀「上線套裝」(config/active) → 轉成前台結構
// 失敗（無 config/active 或無上線套裝）→ throw，由前台決定如何提示
export async function loadActiveRuleSet(db) {
  const activeSnap = await getDoc(doc(db, 'config', 'active'));
  if (!activeSnap.exists()) throw new Error('config/active 不存在（尚未設定上線套裝）');
  const active = activeSnap.data() || {};
  const id = active.activeRuleSetId;
  if (!id) throw new Error('config/active 無 activeRuleSetId');
  return loadRuleSetById(db, id, active.defaultSpice);
}
