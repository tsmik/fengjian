// js/rule_engine_v2.js — 規則引擎 v2（讀「新格式 DNF」）
//
// 第 1 階段：並排新增，**不改 js/rule_engine.js（舊引擎）本體**。
// 讀新文法（部位→卡片→combo→葉、主/輔、目標極、聚合部位、輔門檻/辣度），
// 維度層輸出契約與舊引擎一致（數 positive/negative 部位 → 動靜＋係數 min/max）。
// 依設計規格 v0.6 §B。
//
// === 新格式（fixture / 日後 admin2 產出）===
// dimDef = {
//   dimIndex, dimName, positiveType, negativeType,
//   parts: {
//     "<部位名>": 葉部位 | 聚合部位
//   }
// }
// 葉部位 = {
//   kind: "leaf",
//   lrMode: "none" | "both" | "either",     // 舊 LR merge: all→both, any→either, 無 LR→none
//   passPole: "positive" | "negative",        // 卡片達標時判到哪一極（rule1 一律 positive）
//   auxThreshold: <int>,                       // 中辣門檻 = 舊 COUNT.min（要中幾張輔卡）
//   cards: [ { id, role:"main"|"aux", combos: [ [ {ref,match,side?}, ... ], ... ], note? } ]
// }
//   - 一張卡多 combos = 「或」（任一 combo 全中即卡片成立）
//   - 一個 combo 多葉 = 「而且」（全中）
//   - 葉 {ref, match}: match 為字串或字串陣列；答案 ∈ match 即符合
// 聚合部位 = {
//   kind: "aggregate",
//   passPole: "positive" | "negative",
//   threshold: <int>,                          // 固定門檻（不受辣度影響）
//   children: [ {part:"<子部位>", side?:"L"|"R"}, ... ]   // 數幾個子部位判到目標極
// }
//
// === 辣度（§E）===
// 中辣 → 輔門檻 = part.auxThreshold（= rbf1 現有 COUNT.min）。
// 大/小辣 → round(ratio × 輔卡數)，ratio 由 spiceRatios 提供（admin2 階段才接；本階段只驗中辣）。

/* ---------- 取值：與舊引擎 getAnswer 完全一致 ---------- */
export function getAnswerV2(ref, side, obs) {
  if (side) {
    var k = ref + '_' + side;
    if (k in obs) return obs[k];
    return obs[ref] || '';        // fallback 到非分側答案
  }
  return obs[ref] || '';
}

function leafMatch(leaf, obs, side) {
  var effSide = ('side' in leaf) ? leaf.side : side;
  var ans = getAnswerV2(leaf.ref, effSide, obs);
  if (Array.isArray(leaf.match)) return leaf.match.indexOf(ans) >= 0;
  return ans === leaf.match;
}

// combo 全中？
function comboMatch(combo, obs, side) {
  for (var i = 0; i < combo.length; i++) {
    if (!leafMatch(combo[i], obs, side)) return false;
  }
  return true;
}

// 卡片成立？（任一 combo 全中）— 回傳成立的 combo（給理由字串），否則 null
function cardFire(card, obs, side) {
  for (var i = 0; i < card.combos.length; i++) {
    if (comboMatch(card.combos[i], obs, side)) return card.combos[i];
  }
  return null;
}

/* ---------- 中辣門檻解析（§E）---------- */
function resolveAuxThreshold(part, spiceLevel, spiceRatios) {
  if (spiceLevel === undefined || spiceLevel === '中辣' || !spiceRatios) {
    return part.auxThreshold;     // 中辣 = rbf1 現有 min
  }
  // 大/小辣：round(ratio × 輔卡數)，下限 0（取整機制 B，§E）
  var M = (part.cards || []).filter(function (c) { return c.role !== 'main'; }).length;
  var ratio = spiceRatios[spiceLevel];
  if (ratio == null) return part.auxThreshold;
  var t = Math.round(ratio * M);
  if (t < 0) t = 0;
  return t;
}

/* ---------- 收集葉部位引用的觀察題（null 前置檢查用）---------- */
function leafRefsOfPart(part) {
  var out = [];
  (part.cards || []).forEach(function (card) {
    card.combos.forEach(function (combo) {
      combo.forEach(function (leaf) { out.push(leaf); });
    });
  });
  return out;
}

/* ---------- 葉部位求值 ---------- */
// 回傳 { result:"positive"|"negative"|null, firedCards:[{role,combo}], L?, R? }
// L/R：lrMode both/either 時，各側是否達標（給聚合部位的 .L/.R 引用）
export function evaluateLeafPart(part, obs, spiceLevel, spiceRatios) {
  var lrMode = part.lrMode || 'none';
  var sides = (lrMode === 'none') ? [null] : ['L', 'R'];
  var passPole = part.passPole || 'positive';
  var failPole = (passPole === 'positive') ? 'negative' : 'positive';

  // === 前置：觀察題是否都已填寫（任一側任一葉空 → null，與舊引擎一致）===
  var leaves = leafRefsOfPart(part);
  for (var si = 0; si < sides.length; si++) {
    for (var li = 0; li < leaves.length; li++) {
      var v = getAnswerV2(leaves[li].ref, ('side' in leaves[li]) ? leaves[li].side : sides[si], obs);
      if (v === '' || v === undefined || v === null) return { result: null, firedCards: [] };
    }
  }

  var threshold = resolveAuxThreshold(part, spiceLevel, spiceRatios);
  var firedCards = [];

  function passOnSide(side) {
    var auxHit = 0, mainHit = false, localFired = [];
    (part.cards || []).forEach(function (card) {
      var combo = cardFire(card, obs, side);
      if (combo) {
        localFired.push({ role: card.role || 'aux', combo: combo.map(function (l) { return l.label || l.ref; }) });
        if (card.role === 'main') mainHit = true; else auxHit++;
      }
    });
    // §E 解讀（rule1 無 main，等價於 auxHit>=threshold = 舊 COUNT min）：
    //   主卡中（充分）或 輔達門檻 → 成立
    var pass = mainHit || (auxHit >= threshold);
    return { pass: pass, fired: localFired };
  }

  var out = { firedCards: firedCards };
  if (lrMode === 'none') {
    var r = passOnSide(null);
    firedCards.push.apply(firedCards, r.fired);
    out.result = r.pass ? passPole : failPole;
  } else {
    var rL = passOnSide('L'), rR = passOnSide('R');
    out.L = rL.pass; out.R = rR.pass;
    if (rL.pass) firedCards.push.apply(firedCards, rL.fired.map(function (f) { return Object.assign({ side: 'L' }, f); }));
    if (rR.pass) firedCards.push.apply(firedCards, rR.fired.map(function (f) { return Object.assign({ side: 'R' }, f); }));
    var merged = (lrMode === 'either') ? (rL.pass || rR.pass) : (rL.pass && rR.pass);
    out.result = merged ? passPole : failPole;
  }
  return out;
}

/* ---------- 聚合部位求值 ---------- */
// 回傳 { result, hitChildren:[...] }
export function evaluateAggregate(part, partResults) {
  var passPole = part.passPole || 'positive';
  var failPole = (passPole === 'positive') ? 'negative' : 'positive';
  var hitChildren = [];
  var count = 0;
  for (var i = 0; i < part.children.length; i++) {
    var ch = part.children[i];
    var cr = partResults[ch.part];
    // 子部位未算或為 null → 整個聚合 null（與舊引擎一致）
    if (!cr || cr.result === null || cr.result === undefined) return { result: null, hitChildren: [] };
    var hit;
    if (ch.side) hit = (cr[ch.side] === true);
    else hit = (cr.result === 'positive');
    if (hit) { count++; hitChildren.push(ch.part + (ch.side ? '.' + ch.side : '')); }
  }
  var pass = count >= part.threshold;
  return { result: pass ? passPole : failPole, hitChildren: hitChildren };
}

/* ---------- 維度求值（輸出契約與舊引擎一致）---------- */
var SCORE_PARTS = ['頭', '上停', '耳', '眉', '眼', '鼻', '口', '中停', '下停'];
var PART_IDX = { '頭': 0, '上停': 1, '中停': 2, '下停': 3, '耳': 4, '眉': 5, '眼': 6, '鼻': 7, '口': 8 };

export function evaluateDimensionV2(dimDef, obs, spiceLevel, spiceRatios) {
  var partResults = {};
  var names = Object.keys(dimDef.parts);

  // 1) 先算所有葉部位（聚合部位依賴它們）
  names.forEach(function (pn) {
    var pd = dimDef.parts[pn];
    if (pd.kind !== 'aggregate') partResults[pn] = evaluateLeafPart(pd, obs, spiceLevel, spiceRatios);
  });
  // 2) 再算聚合部位
  names.forEach(function (pn) {
    var pd = dimDef.parts[pn];
    if (pd.kind === 'aggregate') partResults[pn] = evaluateAggregate(pd, partResults);
  });

  // 3) 計分（只數 9 個計分部位）→ 動靜＋係數，並產 data 向量
  var dataVec = [null, null, null, null, null, null, null, null, null];
  var pos = 0, neg = 0;
  SCORE_PARTS.forEach(function (sp) {
    var pr = partResults[sp];
    var r = pr ? pr.result : null;
    var idx = PART_IDX[sp];
    if (r === null || r === undefined) { dataVec[idx] = null; return; }
    if (r === 'positive') { pos++; dataVec[idx] = 'A'; }
    else { neg++; dataVec[idx] = 'B'; }
  });

  var attribute = (pos > neg) ? dimDef.positiveType : dimDef.negativeType;  // 平手歸 negative（與舊引擎一致）
  var coefficient = (pos + neg > 0 && Math.max(pos, neg) > 0)
    ? Math.min(pos, neg) / Math.max(pos, neg) : 0;

  return {
    parts: partResults,
    dataVec: dataVec,
    positiveCount: pos,
    negativeCount: neg,
    attribute: attribute,
    coefficient: coefficient
  };
}
