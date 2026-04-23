// js/manual_sens_v2.js — 手動版重要參數分析 v2（調整方向建議 + 雙矩陣）
import { DIMS, manualData, userName, _isTA, _currentCaseId, _currentCaseName,
         BETA_VISIBLE_DIMS, setNavActive, showPage, calcDim, avgCoeff } from './core.js';
import { initManualData, manualLoadData } from './manual.js';

// ===== 1. 常數 =====

var DIMS_BOSS = [0, 1, 2];
var DIMS_MGR = [3, 4, 5];
var DIMS_INNATE = [0, 1, 2, 3, 4, 5];
var DIMS_LUCK = [6, 7, 8];
var DIMS_ACQUIRED = [9, 10, 11, 12];

var PART_LABELS = ['頭', '上停', '中停', '下停', '耳', '眉', '眼', '鼻', '口'];
var SANTING_PRIORITY_ORDER = [3, 2, 1];   // 下停 > 中停 > 上停
var WUGUAN_PRIORITY_ORDER = [7, 8, 6, 5, 4]; // 鼻 > 口 > 眼 > 眉 > 耳

var BLOCK_COLORS = {
  innate: '#8E4B50', boss: '#8E4B50', mgr: '#8C6B4A',
  luck: '#4C6E78', acquired: '#7B7082'
};

var _dimBg = ['#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
              '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'];
var _dimDeep = ['#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50',
                '#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
var _colLIsS = DIMS.map(function(d) { var dt = (d.da === d.a) ? d.aT : d.bT; return dt === '靜'; });

// ===== 2. 完整度檢查（沿用 v1） =====

function checkBlockComplete(data, dimIndices) {
  var total = dimIndices.length * 9;
  var filled = 0;
  dimIndices.forEach(function(di) {
    for (var pi = 0; pi < 9; pi++) {
      if (data[di][pi] === 'A' || data[di][pi] === 'B') filled++;
    }
  });
  return { complete: filled === total, filled: filled, total: total };
}

function renderIncompleteMsg(blockLabel, chk) {
  return '<div style="background:white;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:12px">' +
    '<div style="font-size:14px;color:#E8B000;margin-bottom:6px">\u26A0 ' + blockLabel + ' 尚未填完（已填 ' + chk.filled + '/' + chk.total + ' 格）</div>' +
    '<div style="font-size:13px;color:var(--text-3)">請先到「手動輸入兵法報告」填完整所有維度和部位，再回來此頁查看分析。</div>' +
    '</div>';
}

// ===== 3. 核心工具函式 =====

function isStaticValue(dimIdx, value) {
  if (value === null) return null;
  return (value === 'A' ? DIMS[dimIdx].aT : DIMS[dimIdx].bT) === '靜';
}

function countStaticInDim(dataArr, dimIdx) {
  var count = 0;
  for (var pi = 0; pi < 9; pi++) {
    if (dataArr[dimIdx][pi] !== null && isStaticValue(dimIdx, dataArr[dimIdx][pi])) count++;
  }
  return count;
}

function isReached(staticCount, dynamicCount) {
  return Math.abs(staticCount - dynamicCount) <= 1;
}

function isSanting(pi) { return pi >= 1 && pi <= 3; }
function isWuguan(pi) { return pi >= 4 && pi <= 8; }

// ===== 4. 找優先部位 =====

function sortByPriority(parts) {
  var orderMap = {};
  SANTING_PRIORITY_ORDER.forEach(function(p, i) { orderMap[p] = i; });
  WUGUAN_PRIORITY_ORDER.forEach(function(p, i) { orderMap[p] = i; });
  parts.sort(function(a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    var oA = orderMap[a.partIdx] !== undefined ? orderMap[a.partIdx] : 99;
    var oB = orderMap[b.partIdx] !== undefined ? orderMap[b.partIdx] : 99;
    return oA - oB;
  });
  return parts;
}

function findPriorityParts(dataArr, blockType) {
  var dimIndices, totalDims;
  if (blockType === 'innate') { dimIndices = DIMS_INNATE; totalDims = 6; }
  else if (blockType === 'luck') { dimIndices = DIMS_LUCK; totalDims = 3; }
  else { dimIndices = DIMS_ACQUIRED; totalDims = 4; }

  var parts = [];
  for (var pi = 1; pi < 9; pi++) { // 跳過頭
    var statics = 0;
    dimIndices.forEach(function(di) {
      if (dataArr[di][pi] !== null && isStaticValue(di, dataArr[di][pi])) statics++;
    });
    var dynamics = totalDims - statics;

    if (blockType === 'innate') {
      if (statics === 3 && dynamics === 3) continue; // 3:3 跳過
      var gap = Math.abs(statics - dynamics);
      if (isSanting(pi) && (statics === 6 || dynamics === 6))
        parts.push({ partIdx: pi, priority: 1 });
      else if (isWuguan(pi) && (statics === 6 || dynamics === 6))
        parts.push({ partIdx: pi, priority: 2 });
      else if (isSanting(pi) && gap >= 2) // 5:1 或 4:2
        parts.push({ partIdx: pi, priority: 3 });
      else if (isWuguan(pi) && gap >= 4) // 5:1
        parts.push({ partIdx: pi, priority: 4 });
    }
    else if (blockType === 'luck') {
      // 特例：靜3動0 也要調
      if (statics === 3) {
        parts.push({ partIdx: pi, priority: isSanting(pi) ? 1 : 2 });
        continue;
      }
      // 只調動多
      if (dynamics > statics) {
        if (isSanting(pi) && dynamics === 3) parts.push({ partIdx: pi, priority: 1 });
        else if (isWuguan(pi) && dynamics === 3) parts.push({ partIdx: pi, priority: 2 });
        else if (isSanting(pi) && dynamics === 2) parts.push({ partIdx: pi, priority: 3 });
        else if (isWuguan(pi) && dynamics === 2) parts.push({ partIdx: pi, priority: 4 });
      }
    }
    else { // acquired
      if (statics === 2 && dynamics === 2) continue; // 2:2 跳過
      if (isSanting(pi) && (statics === 4 || dynamics === 4))
        parts.push({ partIdx: pi, priority: 1 });
      else if (isWuguan(pi) && (statics === 4 || dynamics === 4))
        parts.push({ partIdx: pi, priority: 2 });
      else if (isSanting(pi) && Math.abs(statics - dynamics) === 2) // 3:1
        parts.push({ partIdx: pi, priority: 3 });
      else if (isWuguan(pi) && Math.abs(statics - dynamics) === 2) // 3:1
        parts.push({ partIdx: pi, priority: 4 });
    }
  }

  return sortByPriority(parts).map(function(p) { return p.partIdx; });
}

// ===== 5. 維度調整演算法 =====

// 依部位在該區塊所有維度的動靜總和，決定翻轉需求方向
function getPartNeedDirection(dataArr, partIdx, blockType) {
  var blockDims;
  if (blockType === 'innate') blockDims = DIMS_INNATE;
  else if (blockType === 'luck') blockDims = DIMS_LUCK;
  else blockDims = DIMS_ACQUIRED;

  var sc = 0, dc = 0;
  blockDims.forEach(function(di) {
    var val = dataArr[di][partIdx];
    if (val === 'A' || val === 'B') {
      if (isStaticValue(di, val)) sc++;
      else dc++;
    }
  });
  if (dc > sc) return 'toStatic';
  if (sc > dc) return 'toDynamic';
  return null; // 均衡，不應被 P1-P4 選中
}

// 統一翻轉邏輯（三個區塊共用）
// 回傳調整物件或 null（不推入 adjustments，由呼叫端處理）
function tryFlip(workingData, dimIdx, partIdx, dimFlipCount, blockType, partNeedDirection) {
  // 1. dimFlipCount 上限
  if ((dimFlipCount[dimIdx] || 0) >= 2) return null;

  var val = workingData[dimIdx][partIdx];
  if (val === null) return null;

  // 2. 維度已均衡 → 不翻
  var sc = countStaticInDim(workingData, dimIdx);
  var dc = 9 - sc;
  if (Math.abs(sc - dc) <= 1) return null;

  // 3. 該格已是需求方向 → 不翻
  var currentIsStatic = isStaticValue(dimIdx, val);
  if (partNeedDirection === 'toStatic' && currentIsStatic) return null;
  if (partNeedDirection === 'toDynamic' && !currentIsStatic) return null;

  // 4. 翻轉後維度會更失衡 → 不翻
  var newSc = currentIsStatic ? sc - 1 : sc + 1;
  var newDc = 9 - newSc;
  if (Math.abs(newSc - newDc) > Math.abs(sc - dc)) return null;

  // 5. 翻
  var newVal = val === 'A' ? 'B' : 'A';
  workingData[dimIdx][partIdx] = newVal;
  dimFlipCount[dimIdx] = (dimFlipCount[dimIdx] || 0) + 1;
  return { dimIndex: dimIdx, partIndex: partIdx, from: val, to: newVal };
}

// 中停連動規則：中停被翻轉時，連帶調整眉(5)/眼(6)/鼻(7) 之一
function handleZhongtingTrigger(workingData, blockType, dimIndex, adjustments, dimFlipCount) {
  var blockDims;
  if (blockType === 'innate') blockDims = DIMS_INNATE;
  else if (blockType === 'luck') blockDims = DIMS_LUCK;
  else blockDims = DIMS_ACQUIRED;

  // Step A：計算眉(5)、眼(6)、鼻(7) 在此指數所有維度的動靜總和
  var stats = {};
  [5, 6, 7].forEach(function(pi) {
    var sc = 0, dc = 0;
    blockDims.forEach(function(di) {
      var val = workingData[di][pi];
      if (val === 'A' || val === 'B') {
        if (isStaticValue(di, val)) sc++;
        else dc++;
      }
    });
    stats[pi] = { static: sc, dynamic: dc };
  });

  // Step B：三個全部「靜 >= 動」→ 建議調顴
  var allStaticDominant = [5, 6, 7].every(function(pi) {
    return stats[pi].static >= stats[pi].dynamic;
  });
  if (allStaticDominant) {
    adjustments.push({ type: 'guan_suggestion', blockType: blockType, dimIndex: dimIndex });
    return;
  }

  // Step C：找差距最大的，平手依 鼻(7) > 眼(6) > 眉(5)
  var candidates = [5, 6, 7].map(function(pi) {
    return { partIndex: pi, diff: Math.abs(stats[pi].static - stats[pi].dynamic) };
  });
  candidates.sort(function(a, b) {
    if (a.diff !== b.diff) return b.diff - a.diff;
    return b.partIndex - a.partIndex;
  });

  // Step D：在中停被觸發的維度翻轉這個部位（用該部位自身的需求方向）
  var targetPart = candidates[0].partIndex;
  var targetDir = getPartNeedDirection(workingData, targetPart, blockType);
  if (!targetDir) return;
  var result = tryFlip(workingData, dimIndex, targetPart, dimFlipCount, blockType, targetDir);
  if (result) adjustments.push(result);
}

// 輔助：tryFlip + push + 中停連動
function flipAndLink(workingData, dimIdx, partIdx, dimFlipCount, adjustments, blockType, direction) {
  var result = tryFlip(workingData, dimIdx, partIdx, dimFlipCount, blockType, direction);
  if (result) {
    adjustments.push(result);
    if (partIdx === 2) handleZhongtingTrigger(workingData, blockType, dimIdx, adjustments, dimFlipCount);
  }
  return !!result;
}

function runBossRound(workingData, partIdx, adjustments, dimFlipCount) {
  var dir = getPartNeedDirection(workingData, partIdx, 'innate');
  if (!dir) return;
  // 形勢
  flipAndLink(workingData, 0, partIdx, dimFlipCount, adjustments, 'innate', dir);
  // 經緯
  flipAndLink(workingData, 1, partIdx, dimFlipCount, adjustments, 'innate', dir);
  // 方圓：8:1 或 9:0 才調
  var sc2 = countStaticInDim(workingData, 2), dc2 = 9 - sc2;
  if (Math.abs(sc2 - dc2) >= 7) {
    flipAndLink(workingData, 2, partIdx, dimFlipCount, adjustments, 'innate', dir);
  }
}

function runMgrRound(workingData, partIdx, adjustments, dimFlipCount) {
  var dir = getPartNeedDirection(workingData, partIdx, 'innate');
  if (!dir) return;
  // 曲直
  flipAndLink(workingData, 3, partIdx, dimFlipCount, adjustments, 'innate', dir);
  // 收放
  flipAndLink(workingData, 4, partIdx, dimFlipCount, adjustments, 'innate', dir);
  // 緩急：8:1 或 9:0 才調
  var sc5 = countStaticInDim(workingData, 5), dc5 = 9 - sc5;
  if (Math.abs(sc5 - dc5) >= 7) {
    flipAndLink(workingData, 5, partIdx, dimFlipCount, adjustments, 'innate', dir);
  }
}

function runLuckRound(workingData, partIdx, adjustments, dimFlipCount) {
  var dir = getPartNeedDirection(workingData, partIdx, 'luck');
  if (!dir) return;
  DIMS_LUCK.forEach(function(di) {
    flipAndLink(workingData, di, partIdx, dimFlipCount, adjustments, 'luck', dir);
  });
}

function runAcquiredRound(workingData, partIdx, adjustments, dimFlipCount) {
  var dir = getPartNeedDirection(workingData, partIdx, 'acquired');
  if (!dir) return;
  DIMS_ACQUIRED.forEach(function(di) {
    flipAndLink(workingData, di, partIdx, dimFlipCount, adjustments, 'acquired', dir);
  });
}

// ===== 6. 主流程 =====

function calcAdjustments(dataArr, blockType) {
  var workingData = [];
  for (var i = 0; i < dataArr.length; i++) workingData.push(dataArr[i].slice());

  var adjustments = [];
  var dimFlipCount = {};
  var priorityParts = findPriorityParts(workingData, blockType);

  priorityParts.forEach(function(partIdx) {
    if (blockType === 'innate') {
      runBossRound(workingData, partIdx, adjustments, dimFlipCount);
      runMgrRound(workingData, partIdx, adjustments, dimFlipCount);
    } else if (blockType === 'luck') {
      runLuckRound(workingData, partIdx, adjustments, dimFlipCount);
    } else {
      runAcquiredRound(workingData, partIdx, adjustments, dimFlipCount);
    }
  });

  return { adjustments: adjustments, newData: workingData };
}

// ===== 7. 渲染層 =====

function _checkMark(di) {
  return '<span style="display:inline-block;width:16px;height:16px;background:' + _dimDeep[di] + ';border-radius:3px;line-height:16px;text-align:center;color:#fff;font-size:11px;font-weight:400">\u2713</span>';
}
function _checkMarkGold(di) {
  return '<span style="display:inline-block;width:16px;height:16px;background:' + _dimDeep[di] + ';border-radius:3px;line-height:16px;text-align:center;color:#fff;font-size:11px;font-weight:400;outline:3px solid #E8B000;outline-offset:-1px">\u2713</span>';
}

function buildMatrix(useData, dimIndices, isAdjusted, flipSet, headerHtml) {
  var rc = 'border-radius:3px';
  var mt = '<table style="border-collapse:separate;border-spacing:1px;width:100%;font-size:11px">';

  if (headerHtml) mt += headerHtml;

  // 維度名 da/db
  mt += '<tr><td></td>';
  dimIndices.forEach(function(di) {
    mt += '<td style="background:' + _dimDeep[di] + ';padding:2px 3px;' + rc + ';text-align:center;color:#fff;font-size:10px">' + DIMS[di].da + '</td>';
    mt += '<td style="background:' + _dimDeep[di] + ';padding:2px 3px;' + rc + ';text-align:center;color:#fff;font-size:10px">' + DIMS[di].db + '</td>';
  });
  mt += '</tr>';

  // 靜/動 標頭
  mt += '<tr><td></td>';
  dimIndices.forEach(function(di) {
    var lIsS = _colLIsS[di];
    mt += '<td style="background:' + _dimBg[di] + ';padding:2px 3px;' + rc + ';text-align:center;color:' + (lIsS ? '#000' : '#980000') + ';font-size:9px">' + (lIsS ? '靜' : '動') + '</td>';
    mt += '<td style="background:' + _dimBg[di] + ';padding:2px 3px;' + rc + ';text-align:center;color:' + (lIsS ? '#980000' : '#000') + ';font-size:9px">' + (lIsS ? '動' : '靜') + '</td>';
  });
  mt += '</tr>';

  // 9 部位行
  var colSpan = dimIndices.length * 2 + 1;
  PART_LABELS.forEach(function(pn, pi) {
    if (pi === 4) mt += '<tr><td colspan="' + colSpan + '" style="height:3px"></td></tr>';
    mt += '<tr><td style="padding:3px 4px;font-size:12px;font-weight:400;color:#4A4540;white-space:nowrap">' + pn + '</td>';
    dimIndices.forEach(function(di) {
      var val = useData[di][pi];
      var isFlip = isAdjusted && flipSet && flipSet[di + '_' + pi];
      if (val === null) {
        mt += '<td style="background:' + _dimBg[di] + ';padding:2px;' + rc + '"></td>';
        mt += '<td style="background:' + _dimBg[di] + ';padding:2px;' + rc + '"></td>';
      } else {
        var tp = val === 'A' ? DIMS[di].aT : DIMS[di].bT;
        var isS = (tp === '靜');
        var goLeft = (isS && _colLIsS[di]) || (!isS && !_colLIsS[di]);
        var mark = isFlip ? _checkMarkGold(di) : _checkMark(di);
        if (goLeft) {
          mt += '<td style="background:' + _dimBg[di] + ';padding:2px;' + rc + ';text-align:center">' + mark + '</td>';
          mt += '<td style="background:' + _dimBg[di] + ';padding:2px;' + rc + '"></td>';
        } else {
          mt += '<td style="background:' + _dimBg[di] + ';padding:2px;' + rc + '"></td>';
          mt += '<td style="background:' + _dimBg[di] + ';padding:2px;' + rc + ';text-align:center">' + mark + '</td>';
        }
      }
    });
    mt += '</tr>';
  });

  // 係數行
  mt += '<tr><td style="padding:3px 4px;font-size:11px;font-weight:400;color:#4A4540">係數</td>';
  dimIndices.forEach(function(di) {
    var aCount = useData[di].filter(function(v) { return v === 'A'; }).length;
    var bCount = useData[di].filter(function(v) { return v === 'B'; }).length;
    var c = (aCount + bCount > 0) ? Math.min(aCount, bCount) / Math.max(aCount, bCount) : 0;
    mt += '<td colspan="2" style="text-align:center;padding:2px"><div style="font-size:10px;font-weight:400;color:white;background:' + _dimDeep[di] + ';' + rc + ';padding:1px 3px">' + c.toFixed(2) + '</div></td>';
  });
  mt += '</tr></table>';
  return mt;
}

function coeffArrow(oldVal, newVal) {
  var o = parseFloat(oldVal), n = parseFloat(newVal);
  if (n > o + 0.001) return ' \u2191';
  if (n < o - 0.001) return ' \u2193';
  return '';
}

function renderLegend(hasAdj) {
  var h = '<div style="display:flex;gap:16px;align-items:center;margin:8px 0 12px;font-size:12px;color:var(--text-3)">';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>有值</span>';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#E8E4DF"></span>無資料</span>';
  if (hasAdj) {
    h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;outline:3px solid #E8B000;outline-offset:-1px;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>調整格</span>';
  }
  h += '</div>';
  return h;
}

function renderSummary(adjustments, blockType, origSub, newSub) {
  var actualFlips = adjustments.filter(function(adj) { return adj.type !== 'guan_suggestion'; });
  var hasGuan = adjustments.some(function(adj) { return adj.type === 'guan_suggestion'; });
  var label = blockType === 'innate' ? '先天' : (blockType === 'luck' ? '運氣' : '後天');

  // 均衡狀態
  if (actualFlips.length === 0) {
    var html = '<div style="font-size:13px;color:var(--text);padding:8px 0;line-height:1.8">';
    html += label + '係數接近均衡，若想進一步調整，可以往部位的細節思考。</div>';
    if (hasGuan) {
      html += '<div style="margin-top:6px;padding:6px 10px;background:#fff8e1;border-radius:5px;border:1px solid #ffe082;font-size:12px;color:#f57f17">';
      html += '\u26A0 建議調顴（眉眼鼻靜多，無連動對象）</div>';
    }
    return html;
  }

  // 用「和」/「、」連接
  function joinWithHe(arr) {
    if (arr.length <= 1) return arr[0] || '';
    if (arr.length === 2) return arr[0] + '和' + arr[1];
    return arr.slice(0, -1).join('\u3001') + '和' + arr[arr.length - 1];
  }

  // Step 1：維度列表
  var dimsToList = [];
  if (blockType === 'innate') {
    var bossCounts = {}, mgrCounts = {};
    actualFlips.forEach(function(adj) {
      if (adj.dimIndex <= 2) bossCounts[adj.dimIndex] = (bossCounts[adj.dimIndex] || 0) + 1;
      else if (adj.dimIndex <= 5) mgrCounts[adj.dimIndex] = (mgrCounts[adj.dimIndex] || 0) + 1;
    });
    function topDim(counts) {
      var entries = Object.entries(counts);
      if (entries.length === 0) return null;
      entries.sort(function(a, b) {
        if (b[1] !== a[1]) return b[1] - a[1];
        return parseInt(a[0]) - parseInt(b[0]);
      });
      return parseInt(entries[0][0]);
    }
    var bt = topDim(bossCounts), mt = topDim(mgrCounts);
    if (bt !== null) dimsToList.push(DIMS[bt].dn);
    if (mt !== null) dimsToList.push(DIMS[mt].dn);
  } else {
    var seen = {};
    actualFlips.forEach(function(adj) {
      if (!seen[adj.dimIndex]) { seen[adj.dimIndex] = true; dimsToList.push(DIMS[adj.dimIndex].dn); }
    });
  }

  // Step 2：部位列表（依出現順序去重）
  var partSeen = {};
  var partsToList = [];
  actualFlips.forEach(function(adj) {
    if (!partSeen[adj.partIndex]) {
      partSeen[adj.partIndex] = true;
      partsToList.push(adj.partIndex);
    }
  });

  // Step 3：每個部位的方向描述
  function partDir(pi) {
    var flips = actualFlips.filter(function(a) { return a.partIndex === pi; });
    flips.sort(function(a, b) { return a.dimIndex - b.dimIndex; });
    var dirs = flips.map(function(a) {
      var fromL = a.from === 'A' ? DIMS[a.dimIndex].da : DIMS[a.dimIndex].db;
      var toL = a.to === 'A' ? DIMS[a.dimIndex].da : DIMS[a.dimIndex].db;
      return fromL + '往' + toL;
    });
    return PART_LABELS[pi] + '的' + dirs.join('\u3001');
  }

  // Step 4：子係數變動（僅先天）
  function subChangeText() {
    if (blockType !== 'innate' || !origSub || !newSub) return '';
    var bO = parseFloat(origSub.boss), bN = parseFloat(newSub.boss);
    var mO = parseFloat(origSub.mgr), mN = parseFloat(newSub.mgr);
    var parts = [];
    if (bN > bO + 0.001) parts.push('老闆指數提高，領導能量更均衡完整');
    else if (bN < bO - 0.001) parts.push('老闆指數降低，領導能量略為收斂');
    if (mN > mO + 0.001) parts.push('主管係數提高，管理更穩定完整');
    else if (mN < mO - 0.001) parts.push('主管係數降低，管理張力略為收斂');
    if (parts.length === 0) return '';
    return parts.join('\uFF1B') + '\u3002';
  }

  // 組合
  var partNames = partsToList.map(function(pi) { return PART_LABELS[pi]; });
  var partDescs = partsToList.map(function(pi) { return partDir(pi); });

  var text = '從' + joinWithHe(dimsToList) + '優先調整整體的' + label + '係數。';
  text += '建議從' + joinWithHe(partNames) + '開始思考：';
  text += partDescs.join('\uFF0C') + '\uFF0C這樣整體係數比較平衡。';
  var sub = subChangeText();
  if (sub) text += sub;

  var h = '<div style="font-size:13px;color:var(--text);padding:8px 0;line-height:1.8">' + text + '</div>';
  if (hasGuan) {
    h += '<div style="margin-top:6px;padding:6px 10px;background:#fff8e1;border-radius:5px;border:1px solid #ffe082;font-size:12px;color:#f57f17">';
    h += '\u26A0 建議調顴（眉眼鼻靜多，無連動對象）</div>';
  }
  return h;
}

function renderBlock(dataArr, blockType) {
  var dimIndices, blockLabel, blockColor, subGroups;
  if (blockType === 'innate') {
    dimIndices = DIMS_INNATE; blockLabel = '先天'; blockColor = BLOCK_COLORS.innate;
    subGroups = [
      { key: 'boss', label: '老闆', dims: DIMS_BOSS, color: BLOCK_COLORS.boss },
      { key: 'mgr', label: '主管', dims: DIMS_MGR, color: BLOCK_COLORS.mgr }
    ];
  } else if (blockType === 'luck') {
    dimIndices = DIMS_LUCK; blockLabel = '運氣'; blockColor = BLOCK_COLORS.luck;
    subGroups = [{ key: 'luck', label: '運氣', dims: DIMS_LUCK, color: BLOCK_COLORS.luck }];
  } else {
    dimIndices = DIMS_ACQUIRED; blockLabel = '後天'; blockColor = BLOCK_COLORS.acquired;
    subGroups = [{ key: 'acquired', label: '後天', dims: DIMS_ACQUIRED, color: BLOCK_COLORS.acquired }];
  }

  // 完整度檢查
  var chk = checkBlockComplete(dataArr, dimIndices);
  if (!chk.complete) return renderIncompleteMsg(blockLabel, chk);

  // 計算調整
  var result = calcAdjustments(dataArr, blockType);
  var adjustments = result.adjustments;
  var newData = result.newData;

  // 建立翻轉集合（排除 guan_suggestion）
  var flipSet = {};
  adjustments.forEach(function(adj) {
    if (adj.type === 'guan_suggestion') return;
    flipSet[adj.dimIndex + '_' + adj.partIndex] = true;
  });

  // 係數
  var origCoeff = avgCoeff(dataArr, dimIndices);
  var newCoeff = avgCoeff(newData, dimIndices);
  var origSub = {}, newSub = {};
  subGroups.forEach(function(sg) {
    origSub[sg.key] = avgCoeff(dataArr, sg.dims);
    newSub[sg.key] = avgCoeff(newData, sg.dims);
  });

  var actualFlipCount = adjustments.filter(function(adj) { return adj.type !== 'guan_suggestion'; }).length;

  var minW = blockType === 'innate' ? '280' : '180';
  var h = '';
  h += '<div style="margin-bottom:24px;padding:16px;background:#f5f5f0;border-radius:10px;border:1px solid #d4d4c8">';

  // 標題
  h += '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  h += '<span style="font-size:18px;font-weight:400;color:' + blockColor + '">' + blockLabel + '係數分析</span>';
  h += '<span style="font-size:16px;font-weight:400;color:white;background:' + blockColor + ';padding:2px 12px;border-radius:6px">' + origCoeff + '</span>';
  if (actualFlipCount > 0) {
    h += '<span style="font-size:16px;color:var(--text-3)">\u2192</span>';
    h += '<span style="font-size:16px;font-weight:400;color:white;background:' + blockColor + ';padding:2px 12px;border-radius:6px">' + newCoeff + '</span>';
  }
  h += '</div>';

  // 雙矩陣容器
  h += '<div style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">';

  // 左矩陣標頭
  var leftHdr = '<tr><td></td>';
  if (blockType === 'innate') {
    leftHdr += '<td colspan="6" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:' + BLOCK_COLORS.boss + ';border-radius:3px">老闆 ' + origSub.boss + '</td>';
    leftHdr += '<td colspan="6" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:' + BLOCK_COLORS.mgr + ';border-radius:3px">主管 ' + origSub.mgr + '</td>';
  } else {
    var sg0 = subGroups[0];
    leftHdr += '<td colspan="' + (sg0.dims.length * 2) + '" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:' + sg0.color + ';border-radius:3px">' + sg0.label + ' ' + origSub[sg0.key] + '</td>';
  }
  leftHdr += '</tr>';

  h += '<div style="flex:1;min-width:' + minW + 'px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border)">';
  h += '<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">目前狀態</div>';
  h += '<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">' + blockLabel + ' ' + origCoeff + '</div>';
  h += buildMatrix(dataArr, dimIndices, false, null, leftHdr);
  h += '</div>';

  // 右矩陣
  if (actualFlipCount > 0) {
    var rightHdr = '<tr><td></td>';
    if (blockType === 'innate') {
      rightHdr += '<td colspan="6" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:' + BLOCK_COLORS.boss + ';border-radius:3px">老闆 ' + origSub.boss + '\u2192' + newSub.boss + coeffArrow(origSub.boss, newSub.boss) + '</td>';
      rightHdr += '<td colspan="6" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:' + BLOCK_COLORS.mgr + ';border-radius:3px">主管 ' + origSub.mgr + '\u2192' + newSub.mgr + coeffArrow(origSub.mgr, newSub.mgr) + '</td>';
    } else {
      var sg0 = subGroups[0];
      rightHdr += '<td colspan="' + (sg0.dims.length * 2) + '" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:' + sg0.color + ';border-radius:3px">' + sg0.label + ' ' + origSub[sg0.key] + '\u2192' + newSub[sg0.key] + coeffArrow(origSub[sg0.key], newSub[sg0.key]) + '</td>';
    }
    rightHdr += '</tr>';

    h += '<div style="flex:1;min-width:' + minW + 'px;padding:16px;background:#f8faf8;border-radius:8px;border:1px solid #7A9E7E">';
    h += '<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">調整後預估</div>';
    h += '<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">' + blockLabel + ' ' + origCoeff + ' \u2192 <span style="color:var(--text);font-weight:400">' + newCoeff + '</span></div>';
    h += buildMatrix(newData, dimIndices, true, flipSet, rightHdr);
    h += '</div>';
  } else {
    h += '<div style="flex:1;min-width:' + minW + 'px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center">';
    h += '<span style="font-size:13px;color:var(--text-3)">目前狀態已達均衡，無調整建議</span>';
    h += '</div>';
  }

  h += '</div>'; // 關閉雙矩陣容器
  h += renderLegend(actualFlipCount > 0);
  h += renderSummary(adjustments, blockType, origSub, newSub);
  h += '</div>'; // 關閉區塊容器
  return h;
}

// ===== 9. 頁面入口（沿用 v1） =====

export function showManualSensV2Page() {
  showPage('manual-sens-v2-page');
  document.getElementById('nav-name').innerText = (_isTA && _currentCaseId ? _currentCaseName : userName) || '';
  setNavActive('nav-manual-sens-v2');
  if (!window._suppressPushState) history.pushState({ page: 'manual-sens-v2' }, '');
  initManualData();
  manualLoadData();
  setTimeout(renderManualSensV2Page, 300);
}

export function renderManualSensV2Page() {
  var el = document.getElementById('manual-sens-v2-content');
  if (!el) return;
  if (!manualData) {
    el.innerHTML = '<div style="color:#aaa;padding:20px">請先在「手動輸入報告」中填入資料</div>';
    return;
  }

  // 全空檢查
  var allNull = true;
  for (var di = 0; di < manualData.length; di++) {
    for (var pi = 0; pi < 9; pi++) {
      if (manualData[di][pi] === 'A' || manualData[di][pi] === 'B') { allNull = false; break; }
    }
    if (!allNull) break;
  }
  if (allNull) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center">' +
      '<div style="font-size:16px;color:#E8B000;margin-bottom:12px">\u26A0 手動輸入報告尚未填寫</div>' +
      '<button onclick="showManualPage()" style="padding:8px 20px;border-radius:6px;border:1px solid var(--border);background:white;color:var(--text);font-size:14px;cursor:pointer">前往手動輸入報告</button>' +
      '</div>';
    return;
  }

  var html = '';
  html += '<div style="font-size:18px;font-weight:400;color:var(--text);margin-bottom:4px;letter-spacing:2px">手動版重要參數分析</div>';
  html += '<div style="font-size:13px;color:var(--text-3);margin-bottom:16px">基於手動輸入的 9 部位 \u00D7 13 維度矩陣，找出調整方向建議</div>';

  // 先天區塊
  html += renderBlock(manualData, 'innate');

  // 運氣區塊
  if (BETA_VISIBLE_DIMS >= 9) {
    html += renderBlock(manualData, 'luck');
  } else {
    html += '<div style="margin-bottom:24px;padding:40px 16px;background:#f0f0ea;border-radius:10px;border:1px solid #d4d4c8;text-align:center">';
    html += '<div style="font-size:18px;font-weight:400;color:#bbb;letter-spacing:2px;margin-bottom:8px">運氣係數分析</div>';
    html += '<div style="font-size:14px;color:#bbb">建置中</div></div>';
  }

  // 後天區塊
  if (BETA_VISIBLE_DIMS >= 13) {
    html += renderBlock(manualData, 'acquired');
  } else {
    html += '<div style="margin-bottom:24px;padding:40px 16px;background:#f0f0ea;border-radius:10px;border:1px solid #d4d4c8;text-align:center">';
    html += '<div style="font-size:18px;font-weight:400;color:#bbb;letter-spacing:2px;margin-bottom:8px">後天係數分析</div>';
    html += '<div style="font-size:14px;color:#bbb">建置中</div></div>';
  }

  el.innerHTML = html;
}
