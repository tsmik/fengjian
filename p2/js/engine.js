// p2/js/engine.js — P2 計分引擎（逐側 主/輔；辣度＝輔門檻%）
// 依 Mike 定案的左右計分模型（2026-06）：
//  - 每張卡片（＝敘述分組）＝ 1 個計分單位，標 主(main) 或 輔(aux)。
//  - 卡片引用「左右題」→ 左答案符合給左+1、右答案符合給右+1（各自獨立）。
//    卡片引用「非左右題」→ 符合就左右各+1（同一個答案餵兩側）。
//    一張卡片每一側是否得分＝該側所有 combo 任一成立（combo＝該側所有葉 AND）。
//  - 過關判定：主＝必須全中；輔＝(輔得分 ÷ 輔滿分) ≥ 辣度比例(ratio)。
//  - 兩種範圍：① 部位當計分部位＝左右合起來算；② 部位當聚合子部位＝左右各自獨立判，過關的側才算一個。
//  - 聚合部位：過關子側數 ÷ 子側總數 ≥ 辣度比例（同一個 ratio，universal）。
//  - 目標極＝維度的 positiveType（部位過關＝positiveType）。左右由觀察題 paired 屬性自動決定（不再每部位手設）。
//
// 純函式、無 window 依賴，方便 node 測試。
//   isPaired(obsId) -> bool（該觀察題是否左右題）
//   obs：左右題答案存 {ref_L, ref_R}（fallback ref）；非左右題存 {ref}
//   ratio：0..1（辣度比例＝輔門檻%）

function leafAnswer(leaf, obs, side, isPaired) {
  const ref = leaf.ref;
  if (isPaired(ref)) { const k = ref + '_' + side; return (k in obs ? obs[k] : (obs[ref] != null ? obs[ref] : '')); }
  return obs[ref] != null ? obs[ref] : '';
}
function leafMatch(leaf, obs, side, isPaired) {
  const ans = leafAnswer(leaf, obs, side, isPaired);
  if (ans === '' || ans == null) return false;
  return Array.isArray(leaf.match) ? leaf.match.indexOf(ans) >= 0 : ans === leaf.match;
}
// 一張卡片在某側是否得分：任一 combo 成立（combo＝其葉在該側全中 AND）
function cardFiresSide(card, obs, side, isPaired) {
  return (card.combos || []).some(combo => combo.length > 0 && combo.every(leaf => leafMatch(leaf, obs, side, isPaired)));
}

function refsOfLeaf(leafDef) {
  const s = new Set();
  (leafDef.cards || []).forEach(c => (c.combos || []).forEach(cb => cb.forEach(l => s.add(l.ref))));
  return [...s];
}
// 該部位引用的觀察題是否都已填（左右題要左右都填）；否則部位回 null（不計分）
function partFilled(leafDef, obs, isPaired) {
  for (const ref of refsOfLeaf(leafDef)) {
    if (isPaired(ref)) {
      const l = (ref + '_L') in obs ? obs[ref + '_L'] : obs[ref];
      const r = (ref + '_R') in obs ? obs[ref + '_R'] : obs[ref];
      if (l === '' || l == null || r === '' || r == null) return false;
    } else if (obs[ref] === '' || obs[ref] == null) return false;
  }
  return true;
}

function sideScore(leafDef, obs, side, isPaired) {
  let main = 0, mainMax = 0, aux = 0, auxMax = 0;
  (leafDef.cards || []).forEach(card => {
    const isMain = card.role === 'main';
    if (isMain) mainMax++; else auxMax++;        // 非 main（含 aux / 未標）一律當輔
    if (cardFiresSide(card, obs, side, isPaired)) { if (isMain) main++; else aux++; }
  });
  return { main, mainMax, aux, auxMax };
}
// 某側是否過關：主全中 ＋ 輔達辣度%
function sidePass(sc, ratio) {
  return sc.main === sc.mainMax && (sc.auxMax === 0 || sc.aux / sc.auxMax >= ratio);
}

export function scoreLeafPart(leafDef, obs, isPaired, ratio) {
  if (!partFilled(leafDef, obs, isPaired)) return { result: null };
  const L = sideScore(leafDef, obs, 'L', isPaired);
  const R = sideScore(leafDef, obs, 'R', isPaired);
  const Lpass = sidePass(L, ratio), Rpass = sidePass(R, ratio);
  // 部位當計分部位：左右合起來算
  const mainC = L.main + R.main, mainMaxC = L.mainMax + R.mainMax;
  const auxC = L.aux + R.aux, auxMaxC = L.auxMax + R.auxMax;
  const standalonePass = (mainC === mainMaxC) && (auxMaxC === 0 || auxC / auxMaxC >= ratio);
  return { result: 'leaf', L, R, Lpass, Rpass, standalonePass, combined: { main: mainC, mainMax: mainMaxC, aux: auxC, auxMax: auxMaxC } };
}

// 聚合部位：children=[{part, side?}]。過關子側數 ÷ 子側總數 ≥ ratio。
export function scoreAggregate(aggDef, partResults, ratio) {
  let total = 0, passed = 0;
  for (const ch of (aggDef.children || [])) {
    const pr = partResults[ch.part];
    if (!pr || pr.result === null || pr.result === undefined) return { result: null }; // 子部位未算/未填 → 聚合 null（同舊引擎）
    total++;
    const p = ch.side ? (ch.side === 'L' ? pr.Lpass : pr.Rpass) : pr.standalonePass;
    if (p) passed++;
  }
  const pass = total > 0 && (passed / total >= ratio);
  return { result: 'agg', pass, passed, total };
}

const SCORE_PARTS = ['頭', '上停', '耳', '眉', '眼', '鼻', '口', '中停', '下停'];
const PART_IDX = { '頭': 0, '上停': 1, '中停': 2, '下停': 3, '耳': 4, '眉': 5, '眼': 6, '鼻': 7, '口': 8 };

export function evaluateDimension(dimDef, obs, isPaired, ratio) {
  const partResults = {};
  // 1) 葉部位
  Object.keys(dimDef.parts).forEach(pn => { const pd = dimDef.parts[pn]; if (pd.kind !== 'aggregate') partResults[pn] = scoreLeafPart(pd, obs, isPaired, ratio); });
  // 2) 聚合部位
  Object.keys(dimDef.parts).forEach(pn => { const pd = dimDef.parts[pn]; if (pd.kind === 'aggregate') partResults[pn] = scoreAggregate(pd, partResults, ratio); });
  // 3) 計分（9 個計分部位）
  const dataVec = [null, null, null, null, null, null, null, null, null];
  let pos = 0, neg = 0;
  SCORE_PARTS.forEach(sp => {
    const pr = partResults[sp]; const idx = PART_IDX[sp];
    if (!pr || pr.result == null) { dataVec[idx] = null; return; }
    const pass = pr.result === 'agg' ? pr.pass : pr.standalonePass;
    if (pass) { pos++; dataVec[idx] = 'A'; } else { neg++; dataVec[idx] = 'B'; }
  });
  const attribute = pos > neg ? dimDef.positiveType : dimDef.negativeType;
  const coefficient = (pos + neg > 0 && Math.max(pos, neg) > 0) ? Math.min(pos, neg) / Math.max(pos, neg) : 0;
  return { parts: partResults, dataVec, positiveCount: pos, negativeCount: neg, attribute, coefficient };
}
