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

function tryFlip(workingData, dimIdx, partIdx, dimFlipCount, adjustments) {
  if ((dimFlipCount[dimIdx] || 0) >= 2) return false;

  var val = workingData[dimIdx][partIdx];
  if (val === null) return false;

  var sc = countStaticInDim(workingData, dimIdx);
  var dc = 9 - sc;
  if (isReached(sc, dc)) return false;

  var currentIsStatic = isStaticValue(dimIdx, val);
  // 只允許往均衡方向翻：部位必須在多數側
  if (sc > dc && !currentIsStatic) return false; // 靜多→需翻靜為動，但此格是動
  if (dc > sc && currentIsStatic) return false;   // 動多→需翻動為靜，但此格是靜

  var newVal = val === 'A' ? 'B' : 'A';
  workingData[dimIdx][partIdx] = newVal;
  dimFlipCount[dimIdx] = (dimFlipCount[dimIdx] || 0) + 1;
  adjustments.push({ dimIndex: dimIdx, partIndex: partIdx, from: val, to: newVal });
  return true;
}

function runBossRound(workingData, partIdx, adjustments, dimFlipCount) {
  var sc0 = countStaticInDim(workingData, 0), dc0 = 9 - sc0;
  var sc1 = countStaticInDim(workingData, 1), dc1 = 9 - sc1;
  // 特例：形勢 AND 經緯 都達標 → 整輪跳過
  if (isReached(sc0, dc0) && isReached(sc1, dc1)) return;

  // 形勢
  tryFlip(workingData, 0, partIdx, dimFlipCount, adjustments);
  // 經緯
  tryFlip(workingData, 1, partIdx, dimFlipCount, adjustments);
  // 方圓：8:1 或 9:0 才調
  var sc2 = countStaticInDim(workingData, 2), dc2 = 9 - sc2;
  if (Math.abs(sc2 - dc2) >= 7) {
    tryFlip(workingData, 2, partIdx, dimFlipCount, adjustments);
  }
}

function runMgrRound(workingData, partIdx, adjustments, dimFlipCount) {
  var sc3 = countStaticInDim(workingData, 3), dc3 = 9 - sc3;
  var sc4 = countStaticInDim(workingData, 4), dc4 = 9 - sc4;
  // 特例：曲直 AND 收放 都達標 → 整輪跳過
  if (isReached(sc3, dc3) && isReached(sc4, dc4)) return;

  // 曲直
  tryFlip(workingData, 3, partIdx, dimFlipCount, adjustments);
  // 收放
  tryFlip(workingData, 4, partIdx, dimFlipCount, adjustments);
  // 緩急：8:1 或 9:0 才調
  var sc5 = countStaticInDim(workingData, 5), dc5 = 9 - sc5;
  if (Math.abs(sc5 - dc5) >= 7) {
    tryFlip(workingData, 5, partIdx, dimFlipCount, adjustments);
  }
}

function runLuckRound(workingData, partIdx, adjustments, dimFlipCount) {
  // 順逆 → 真假 → 分合（三個一視同仁）
  DIMS_LUCK.forEach(function(di) {
    tryFlip(workingData, di, partIdx, dimFlipCount, adjustments);
  });
}

function runAcquiredRound(workingData, partIdx, adjustments, dimFlipCount) {
  // 攻守 → 奇正 → 虛實 → 進退（四個一視同仁）
  DIMS_ACQUIRED.forEach(function(di) {
    tryFlip(workingData, di, partIdx, dimFlipCount, adjustments);
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

// ===== 7. 統計層 =====

function countByPart(adjustments, filterFn) {
  var counts = {};
  adjustments.forEach(function(adj) {
    if (filterFn && !filterFn(adj)) return;
    var name = PART_LABELS[adj.partIndex];
    counts[name] = (counts[name] || 0) + 1;
  });
  return Object.entries(counts).sort(function(a, b) {
    if (b[1] !== a[1]) return b[1] - a[1];
    return PART_LABELS.indexOf(a[0]) - PART_LABELS.indexOf(b[0]);
  });
}

function countByDim(adjustments, filterFn) {
  var counts = {};
  adjustments.forEach(function(adj) {
    if (filterFn && !filterFn(adj)) return;
    var name = DIMS[adj.dimIndex].dn;
    counts[name] = (counts[name] || 0) + 1;
  });
  return Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });
}

// ===== 8. 渲染層 =====

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

function renderSummary(adjustments, blockType) {
  if (adjustments.length === 0) {
    return '<div style="font-size:13px;color:var(--text-3);padding:8px 0">目前狀態已達均衡，無調整建議</div>';
  }

  var h = '<div style="font-size:13px;color:var(--text);padding:8px 0;line-height:2">';
  var isBoss = function(adj) { return adj.dimIndex <= 2; };
  var isMgr = function(adj) { return adj.dimIndex >= 3 && adj.dimIndex <= 5; };

  if (blockType === 'innate') {
    var topAll = countByPart(adjustments);
    var topBoss = countByPart(adjustments, isBoss);
    var topMgr = countByPart(adjustments, isMgr);
    var dimBoss = countByDim(adjustments, isBoss);
    var dimMgr = countByDim(adjustments, isMgr);

    h += '<div style="font-size:12px;font-weight:400;color:var(--text-2);margin-bottom:4px">整體：</div><div style="padding-left:12px">';
    h += '\u2022 先天：' + (topAll[0] ? topAll[0][0] + ' 調整最多' : '無') + (topAll[1] ? '，其次 ' + topAll[1][0] : '') + '<br>';
    h += '\u2022 老闆：' + (topBoss[0] ? topBoss[0][0] + ' 調整最多' : '無') + (topBoss[1] ? '，其次 ' + topBoss[1][0] : '') + '<br>';
    h += '\u2022 主管：' + (topMgr[0] ? topMgr[0][0] + ' 調整最多' : '無') + (topMgr[1] ? '，其次 ' + topMgr[1][0] : '') + '</div>';
    h += '<div style="font-size:12px;font-weight:400;color:var(--text-2);margin-top:6px;margin-bottom:4px">維度：</div><div style="padding-left:12px">';
    h += '\u2022 老闆：' + (dimBoss[0] ? dimBoss[0][0] + ' 調整最多' : '無') + '<br>';
    h += '\u2022 主管：' + (dimMgr[0] ? dimMgr[0][0] + ' 調整最多' : '無') + '</div>';
  } else {
    var label = blockType === 'luck' ? '運氣' : '後天';
    var topP = countByPart(adjustments);
    var topD = countByDim(adjustments);
    h += '<div style="font-size:12px;font-weight:400;color:var(--text-2);margin-bottom:4px">整體：</div><div style="padding-left:12px">';
    h += '\u2022 ' + label + '：' + (topP[0] ? topP[0][0] + ' 調整最多' : '無') + (topP[1] ? '，其次 ' + topP[1][0] : '') + '</div>';
    h += '<div style="font-size:12px;font-weight:400;color:var(--text-2);margin-top:6px;margin-bottom:4px">維度：</div><div style="padding-left:12px">';
    h += '\u2022 ' + label + '：' + (topD[0] ? topD[0][0] + ' 調整最多' : '無') + '</div>';
  }

  h += '</div>';
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

  // 建立翻轉集合
  var flipSet = {};
  adjustments.forEach(function(adj) { flipSet[adj.dimIndex + '_' + adj.partIndex] = true; });

  // 係數
  var origCoeff = avgCoeff(dataArr, dimIndices);
  var newCoeff = avgCoeff(newData, dimIndices);
  var origSub = {}, newSub = {};
  subGroups.forEach(function(sg) {
    origSub[sg.key] = avgCoeff(dataArr, sg.dims);
    newSub[sg.key] = avgCoeff(newData, sg.dims);
  });

  var minW = blockType === 'innate' ? '280' : '180';
  var h = '';
  h += '<div style="margin-bottom:24px;padding:16px;background:#f5f5f0;border-radius:10px;border:1px solid #d4d4c8">';

  // 標題
  h += '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px">';
  h += '<span style="font-size:18px;font-weight:400;color:' + blockColor + '">' + blockLabel + '係數分析</span>';
  h += '<span style="font-size:16px;font-weight:400;color:white;background:' + blockColor + ';padding:2px 12px;border-radius:6px">' + origCoeff + '</span>';
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
  if (adjustments.length > 0) {
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
  h += renderLegend(adjustments.length > 0);
  h += renderSummary(adjustments, blockType);
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
