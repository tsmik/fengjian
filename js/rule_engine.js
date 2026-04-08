// js/rule_engine.js — 規則引擎模組
import { obsData, data, DIM_RULES } from './core.js';

/* ===== 規則引擎 v1.1 ===== */
/**
 * 人相兵法 — 規則引擎核心
 * 根據「規則引擎規格 v1」實作
 *
 * evaluate(node, obsData, side, partResults) → boolean
 * evaluatePart(partDef, obsData, partResults) → "positive" | "negative"
 * evaluateDimension(dimDef, obsData) → { results, attribute, coefficient }
 */

/**
 * 從 obsData 取值
 * @param {string} ref - 觀察問題 ID
 * @param {string|null} side - "L"/"R"/null
 * @param {object} obsDataIn
 * @returns {string} 答案值，無則回空字串
 */
export function getAnswer(ref, side, obsDataIn) {
  if (side) {
    var k = ref + '_' + side;
    if (k in obsDataIn) return obsDataIn[k];
    // fallback to non-sided answer
    return obsDataIn[ref] || '';
  }
  return obsDataIn[ref] || '';
}

/**
 * 求值核心 — 遞迴處理所有運算元
 * @param {object} node - 規則節點
 * @param {object} obsDataIn
 * @param {string|null} side - LR 模式下自動帶入的 side
 * @param {object} partResults - 已計算部位結果 { "頭": {result, L, R}, ... }
 * @returns {boolean}
 */
export function evaluate(node, obsDataIn, side, partResults) {
  if (!node) return false;

  // 1. 葉節點：比對觀察答案
  if (node.ref !== undefined) {
    var effectiveSide = ('side' in node) ? node.side : side;
    var answer = getAnswer(node.ref, effectiveSide, obsDataIn);
    if (Array.isArray(node.match)) {
      return node.match.indexOf(answer) >= 0;
    }
    return answer === node.match;
  }

  // 2. partResult：引用其他部位結果
  if (node.partResult !== undefined) {
    var pr = node.partResult;
    var dotIdx = pr.indexOf('.');
    if (dotIdx >= 0) {
      // "眉.L" or "眉.R"
      var partName = pr.substring(0, dotIdx);
      var subSide = pr.substring(dotIdx + 1);
      var partData = partResults[partName];
      if (!partData) return false;
      return partData[subSide] === true;
    }
    var partData2 = partResults[pr];
    if (!partData2) return false;
    return partData2.result === 'positive';
  }

  // 3. 內嵌 rule（用於 COUNT items 中的匿名規則）
  if (node.rule !== undefined && !node.veto) {
    return evaluate(node.rule, obsDataIn, side, partResults);
  }

  // 4. VETO + rule
  if (node.veto !== undefined) {
    for (var vi = 0; vi < node.veto.length; vi++) {
      if (evaluate(node.veto[vi].condition, obsDataIn, side, partResults)) {
        return node.veto[vi].result === 'positive';
      }
    }
    if (node.rule) {
      return evaluate(node.rule, obsDataIn, side, partResults);
    }
    return false;
  }

  // 5. AND
  if (node.op === 'AND') {
    for (var ai = 0; ai < node.items.length; ai++) {
      if (!node.items[ai]) continue;
      if (!evaluate(node.items[ai], obsDataIn, side, partResults)) return false;
    }
    return true;
  }

  // 6. OR
  if (node.op === 'OR') {
    for (var oi = 0; oi < node.items.length; oi++) {
      if (!node.items[oi]) continue;
      if (evaluate(node.items[oi], obsDataIn, side, partResults)) return true;
    }
    return false;
  }

  // 7. COUNT (supports weight per item, default 1; supports group nodes)
  if (node.op === 'COUNT') {
    var count = 0;
    for (var ci = 0; ci < node.items.length; ci++) {
      var cItem = node.items[ci];
      if (!cItem) continue;
      if (cItem.group !== undefined && cItem.items) {
        for (var gi = 0; gi < cItem.items.length; gi++) {
          if (evaluate(cItem.items[gi], obsDataIn, side, partResults)) {
            count += (cItem.items[gi].weight || 1);
          }
        }
      } else {
        if (evaluate(cItem, obsDataIn, side, partResults)) {
          count += (cItem.weight || 1);
        }
      }
    }
    return count >= node.min;
  }

  // 8. NOT
  if (node.op === 'NOT') {
    return !evaluate(node.item, obsDataIn, side, partResults);
  }

  // 9. LR
  if (node.op === 'LR') {
    var leftResult = evaluate(node.each, obsDataIn, 'L', partResults);
    var rightResult = evaluate(node.each, obsDataIn, 'R', partResults);
    // 回傳物件讓呼叫端可以取得子結果
    var merged = node.merge === 'all' ? (leftResult && rightResult) : (leftResult || rightResult);
    // 把 LR 結果附在回傳值上（透過 _lrResult 暫存）
    evaluate._lastLR = { L: leftResult, R: rightResult };
    return merged;
  }

  return false;
}

// 暫存最後一次 LR 結果
evaluate._lastLR = null;

/**
 * 遞迴收集規則樹中所有 ref 及其 effective side
 * 用於判斷該部位規則所需的觀察題是否都已填寫
 */
export function collectRefs(node, side, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) collectRefs(node[i], side, out);
    return;
  }
  if (typeof node !== 'object') return;
  if (node.ref !== undefined) {
    out.push({ ref: node.ref, side: ('side' in node) ? node.side : side });
    return;
  }
  if (node.partResult !== undefined) return;
  // LR：分別以 L/R 收集 each，然後 return（不再走 generic each）
  if (node.op === 'LR' && node.each) {
    collectRefs(node.each, 'L', out);
    collectRefs(node.each, 'R', out);
    return;
  }
  if (node.items) collectRefs(node.items, side, out);
  if (node.each) collectRefs(node.each, side, out);
  if (node.rule) collectRefs(node.rule, side, out);
  if (node.item) collectRefs(node.item, side, out);
  if (node.veto && Array.isArray(node.veto)) {
    for (var vi = 0; vi < node.veto.length; vi++) {
      if (node.veto[vi].condition) collectRefs(node.veto[vi].condition, side, out);
    }
  }
  if (node.condition && typeof node.condition === 'object') collectRefs(node.condition, side, out);
}

/**
 * 遞迴收集規則樹中所有 partResult 依賴的部位名稱
 * 用於判斷中停/下停依賴的子部位是否已完成
 */
export function collectPartResultDeps(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) collectPartResultDeps(node[i], out);
    return;
  }
  if (typeof node !== 'object') return;
  if (node.partResult !== undefined) {
    out.push(node.partResult);
    return;
  }
  if (node.items) collectPartResultDeps(node.items, out);
  if (node.each) collectPartResultDeps(node.each, out);
  if (node.rule) collectPartResultDeps(node.rule, out);
  if (node.item) collectPartResultDeps(node.item, out);
}

export function evaluatePart(partDef, obsDataIn, partResults) {
  if (!partDef) return { result: 'negative' };

  // === 前置檢查：觀察題是否都已填寫 ===
  var _refs = [];
  collectRefs(partDef.rule || partDef, null, _refs);
  if (partDef.veto) collectRefs(partDef.veto, null, _refs);
  for (var _ri = 0; _ri < _refs.length; _ri++) {
    var _val = getAnswer(_refs[_ri].ref, _refs[_ri].side, obsDataIn);
    if (_val === '' || _val === undefined || _val === null) {
      return { result: null };
    }
  }
  // === 前置檢查：partResult 依賴的部位是否已完成 ===
  var _deps = [];
  collectPartResultDeps(partDef.rule || partDef, _deps);
  for (var _di2 = 0; _di2 < _deps.length; _di2++) {
    var _depName = _deps[_di2];
    var _dotIdx = _depName.indexOf('.');
    var _depPart = _dotIdx >= 0 ? _depName.substring(0, _dotIdx) : _depName;
    if (partResults[_depPart] && partResults[_depPart].result === null) {
      return { result: null };
    }
  }

  // Determine the rule node: either partDef.rule or partDef itself (flat format)
  var ruleNode = partDef.rule || partDef;
  var hasRule = partDef.rule || partDef.op || partDef.items || partDef.ref;
  if (!hasRule) return { result: 'negative' };

  // 1. 檢查 VETO（部位層級）
  if (partDef.veto) {
    for (var vi = 0; vi < partDef.veto.length; vi++) {
      if (evaluate(partDef.veto[vi].condition, obsDataIn, null, partResults)) {
        return { result: partDef.veto[vi].result };
      }
    }
  }

  // 2. 正常計算
  evaluate._lastLR = null;
  var result = evaluate(ruleNode, obsDataIn, null, partResults);
  var out = { result: result ? 'positive' : 'negative' };

  // 如果規則是 LR 型，保存子結果
  if (evaluate._lastLR) {
    out.L = evaluate._lastLR.L;
    out.R = evaluate._lastLR.R;
  }

  return out;
}

/**
 * 計算整個維度
 * @param {object} dimDef - 維度定義 JSON
 * @param {object} obsDataIn
 * @returns {{ results: object, positiveCount: number, negativeCount: number, attribute: string, coefficient: number }}
 */
export function evaluateDimension(dimDef, obsDataIn) {
  var partOrder = ['頭', '上停', '耳', '眉', '眼', '鼻', '口', '顴', '人中', '地閣', '頤', '中停', '下停'];
  var partResults = {};

  for (var pi = 0; pi < partOrder.length; pi++) {
    var partName = partOrder[pi];
    var partDef = dimDef.parts[partName];
    if (!partDef) {
      partResults[partName] = { result: 'negative' };
      continue;
    }
    partResults[partName] = evaluatePart(partDef, obsDataIn, partResults);
  }

  var _scoreParts = ['頭', '上停', '耳', '眉', '眼', '鼻', '口', '中停', '下停'];
  var positiveCount = 0, negativeCount = 0;
  for (var ri = 0; ri < _scoreParts.length; ri++) {
    var _pr = partResults[_scoreParts[ri]].result;
    if (_pr === null) continue;
    if (_pr === 'positive') positiveCount++;
    else negativeCount++;
  }

  var attribute;
  if (positiveCount > negativeCount) {
    attribute = dimDef.positiveType;
  } else {
    attribute = dimDef.negativeType;
  }

  var coefficient = (positiveCount + negativeCount > 0 && Math.max(positiveCount, negativeCount) > 0)
    ? Math.min(positiveCount, negativeCount) / Math.max(positiveCount, negativeCount)
    : 0;

  return {
    results: partResults,
    positiveCount: positiveCount,
    negativeCount: negativeCount,
    attribute: attribute,
    coefficient: coefficient
  };
}

/* 規則引擎入口：計算所有 13 維度，寫入 data[][] */
export function evaluateAll(obsDataIn){
  var partIdxMap={'頭':0,'上停':1,'中停':2,'下停':3,'耳':4,'眉':5,'眼':6,'鼻':7,'口':8};
  var allResults=[];
  for(var di=0;di<13;di++){
    var dimResult=evaluateDimension(DIM_RULES[di],obsDataIn);
    allResults.push(dimResult);
    // 寫入 data[di][partIdx]: positive→A, negative→B
    var partOrder=['頭','上停','耳','眉','眼','鼻','口','中停','下停'];
    for(var pi=0;pi<partOrder.length;pi++){
      var pn=partOrder[pi];
      var pidx=partIdxMap[pn];
      var _pResult=dimResult.results[pn].result;
      data[di][pidx]=_pResult===null?null:(_pResult==='positive'?'A':'B');
    }
  }
  return allResults;
}
