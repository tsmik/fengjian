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
 * @param {object} obsData
 * @returns {string} 答案值，無則回空字串
 */
function getAnswer(ref, side, obsData) {
  if (side) {
    var k = ref + '_' + side;
    if (k in obsData) return obsData[k];
    // fallback to non-sided answer
    return obsData[ref] || '';
  }
  return obsData[ref] || '';
}

/**
 * 求值核心 — 遞迴處理所有運算元
 * @param {object} node - 規則節點
 * @param {object} obsData
 * @param {string|null} side - LR 模式下自動帶入的 side
 * @param {object} partResults - 已計算部位結果 { "頭": {result, L, R}, ... }
 * @returns {boolean}
 */
function evaluate(node, obsData, side, partResults) {
  if (!node) return false;

  // 1. 葉節點：比對觀察答案
  if (node.ref !== undefined) {
    var effectiveSide = ('side' in node) ? node.side : side;
    var answer = getAnswer(node.ref, effectiveSide, obsData);
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
    return evaluate(node.rule, obsData, side, partResults);
  }

  // 4. VETO + rule
  if (node.veto !== undefined) {
    for (var vi = 0; vi < node.veto.length; vi++) {
      if (evaluate(node.veto[vi].condition, obsData, side, partResults)) {
        return node.veto[vi].result === 'positive';
      }
    }
    if (node.rule) {
      return evaluate(node.rule, obsData, side, partResults);
    }
    return false;
  }

  // 5. AND
  if (node.op === 'AND') {
    for (var ai = 0; ai < node.items.length; ai++) {
      if (!evaluate(node.items[ai], obsData, side, partResults)) return false;
    }
    return true;
  }

  // 6. OR
  if (node.op === 'OR') {
    for (var oi = 0; oi < node.items.length; oi++) {
      if (evaluate(node.items[oi], obsData, side, partResults)) return true;
    }
    return false;
  }

  // 7. COUNT (supports weight per item, default 1)
  if (node.op === 'COUNT') {
    var count = 0;
    for (var ci = 0; ci < node.items.length; ci++) {
      if (evaluate(node.items[ci], obsData, side, partResults)) {
        count += (node.items[ci].weight || 1);
      }
    }
    return count >= node.min;
  }

  // 8. NOT
  if (node.op === 'NOT') {
    return !evaluate(node.item, obsData, side, partResults);
  }

  // 9. LR
  if (node.op === 'LR') {
    var leftResult = evaluate(node.each, obsData, 'L', partResults);
    var rightResult = evaluate(node.each, obsData, 'R', partResults);
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
 * 計算單一部位
 * @param {object} partDef - { veto?, rule }
 * @param {object} obsData
 * @param {object} partResults
 * @returns {{ result: "positive"|"negative", L?: boolean, R?: boolean }}
 */
function evaluatePart(partDef, obsData, partResults) {
  if (!partDef) return { result: 'negative' };

  // Determine the rule node: either partDef.rule or partDef itself (flat format)
  var ruleNode = partDef.rule || partDef;
  var hasRule = partDef.rule || partDef.op || partDef.items || partDef.ref;
  if (!hasRule) return { result: 'negative' };

  // 1. 檢查 VETO（部位層級）
  if (partDef.veto) {
    for (var vi = 0; vi < partDef.veto.length; vi++) {
      if (evaluate(partDef.veto[vi].condition, obsData, null, partResults)) {
        return { result: partDef.veto[vi].result };
      }
    }
  }

  // 2. 正常計算
  evaluate._lastLR = null;
  var result = evaluate(ruleNode, obsData, null, partResults);
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
 * @param {object} obsData
 * @returns {{ results: object, positiveCount: number, negativeCount: number, attribute: string, coefficient: number }}
 */
function evaluateDimension(dimDef, obsData) {
  var partOrder = ['頭', '上停', '耳', '眉', '眼', '鼻', '口', '中停', '下停'];
  var partResults = {};

  for (var pi = 0; pi < partOrder.length; pi++) {
    var partName = partOrder[pi];
    var partDef = dimDef.parts[partName];
    if (!partDef) {
      partResults[partName] = { result: 'negative' };
      continue;
    }
    partResults[partName] = evaluatePart(partDef, obsData, partResults);
  }

  var positiveCount = 0, negativeCount = 0;
  for (var ri = 0; ri < partOrder.length; ri++) {
    if (partResults[partOrder[ri]].result === 'positive') positiveCount++;
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

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { evaluate, evaluatePart, evaluateDimension, getAnswer };
}
