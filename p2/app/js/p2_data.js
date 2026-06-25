// p2/app/js/p2_data.js — P2 學員前台資料層（接線用）
// 讀「上線套裝」一次並快取（dims / obsParts / isPaired / 部位名 / 預設辣度），
// 供 m_input.js（題庫+規則）與 obs_recalc.js（逐側引擎轉接器）取用。
// 與 P1 完全分開：此檔只在 p2/app/ 副本內，原 P1 不受影響。
import { loadActiveRuleSet } from './load_ruleset.js';

let _bundle = null;       // loadActiveRuleSet 回傳：{ activeRuleSetId, defaultSpice, dims, obsParts, isPaired, partNames }
let _spice = null;        // 目前辣度（學員可切；F3 接選擇器，預設＝套裝 defaultSpice＝大辣）
let _loading = null;

// 載入上線套裝（只載一次；併發呼叫共用同一 promise）
export async function loadP2(db) {
  if (_bundle) return _bundle;
  if (_loading) return _loading;
  _loading = (async () => {
    _bundle = await loadActiveRuleSet(db);
    if (!_spice) _spice = _bundle.defaultSpice || '大辣';
    return _bundle;
  })();
  return _loading;
}

export function getP2() { return _bundle; }
export function getSpice() { return _spice || (_bundle && _bundle.defaultSpice) || '大辣'; }
export function setSpice(lv) { _spice = lv; }
