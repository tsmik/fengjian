// js/manual_sens_v2.js — 手動版重要參數分析 v2（老師邏輯診斷 + 格子翻轉 Top N）
import { DIMS, PARTS, PARTS_SHORT, manualData, setManualData, userName, _isTA, _currentCaseId, _currentCaseName,
         BETA_VISIBLE_DIMS, setNavActive, showPage, calcDim, avgCoeff } from './core.js';
import { initManualData, manualLoadData } from './manual.js';

// ===== 1. 常數與配置 =====

var BLOCK_DEFS = [
  { key: 'boss',    label: '老闆',   dims: [0,1,2],         topN: 2, color: '#8E4B50' },
  { key: 'mgr',     label: '主管',   dims: [3,4,5],         topN: 2, color: '#8C6B4A' },
  { key: 'innate',  label: '先天',   dims: [0,1,2,3,4,5],   topN: 3, color: '#8E4B50' },
  { key: 'luck',    label: '運氣',   dims: [6,7,8],         topN: 3, color: '#4C6E78' },
  { key: 'post',    label: '後天',   dims: [9,10,11,12],    topN: 3, color: '#7B7082' }
];

// 話術範本
var BOSS_DIR_TABLE = [
  { xingshi: '形', jingwei: '經', fangyuan: '方', text: '創業老闆方向 — 做事的人' },
  { xingshi: '形', jingwei: '經', fangyuan: '圓', text: '創業老闆方向 — 做老闆的人（看圓）' },
  { xingshi: '勢', jingwei: '緯', fangyuan: '圓', text: '做老闆辛苦（老師原話）' }
];

var MGR_DIR_TABLE = [
  { quzhi: '直', shoufang: '收', huanji: '緩', text: '典型穩當主管' },
  { quzhi: '曲', shoufang: null, huanji: null, text: '幕僚/幕僚長傾向（老師原話）' }
];

var BOSS_SHORTBOARD = [
  { dim: '形', text: '格局動能不足：方向有、核心有，但格局撐不開' },
  { dim: '經', text: '核心價值不穩：格局有、方向有，但初心飄移' },
  { dim: '方', text: '成就方向不明：格局有、核心有，但不知道要追尋什麼' }
];

var MGR_SHORTBOARD = [
  { dim: '直', text: '擔當不足：能耐和節奏到位但扛不起責任' },
  { dim: '收', text: '能耐不足：扛起責任有節奏但做不到' },
  { dim: '緩', text: '節奏太快：有擔當有能耐但衝太急容易出錯' }
];

// ===== 2. 計算層 =====

function getStaticCount(dataArr, dimIdx) {
  var d = DIMS[dimIdx];
  var row = dataArr[dimIdx];
  var count = 0;
  for (var i = 0; i < 9; i++) {
    if (row[i] === null) continue;
    var tp = row[i] === 'A' ? d.aT : d.bT;
    if (tp === '靜') count++;
  }
  return count;
}

function getDynamicCount(dataArr, dimIdx) {
  var d = DIMS[dimIdx];
  var row = dataArr[dimIdx];
  var count = 0;
  for (var i = 0; i < 9; i++) {
    if (row[i] === null) continue;
    var tp = row[i] === 'A' ? d.aT : d.bT;
    if (tp === '動') count++;
  }
  return count;
}

function calcBlockBalance(dataArr, dimIndices) {
  var pillars = [];
  dimIndices.forEach(function(di) {
    pillars.push({ dimIdx: di, staticCount: getStaticCount(dataArr, di) });
  });
  if (pillars.length === 0) return { pillars: pillars, max: 0, min: 0, gap: 0 };
  var vals = pillars.map(function(p) { return p.staticCount; });
  var mx = Math.max.apply(null, vals);
  var mn = Math.min.apply(null, vals);
  return { pillars: pillars, max: mx, min: mn, gap: mx - mn };
}

function getDimDirection(dataArr, dimIdx) {
  // Returns the dominant side label (static side attribute name)
  var r = calcDim(dataArr, dimIdx);
  if (!r) return null;
  var d = DIMS[dimIdx];
  // Return which side is dominant
  if (r.a > r.b) return d.a; // A side dominant
  if (r.b > r.a) return d.b; // B side dominant
  return null; // equal
}

function calcBossDirection(dataArr) {
  // 形勢: dim0, a=形(靜), b=勢(動). 形>勢 means static > dynamic
  var xs = getDimDirection(dataArr, 0); // 形 or 勢
  var jw = getDimDirection(dataArr, 1); // 經 or 緯
  var fy = getDimDirection(dataArr, 2); // 圓(a,動) or 方(b,靜). da=方,db=圓

  var xsDir = xs; // 形 or 勢
  var jwDir = jw; // 經 or 緯
  // 方圓: DIMS[2].a='圓',b='方', da='方',db='圓'
  var fyDir = fy; // 圓 or 方

  var checks = [
    { label: DIMS[0].da + '>' + DIMS[0].db, ok: false },
    { label: DIMS[1].da + '>' + DIMS[1].db, ok: false },
    { label: DIMS[2].da + '>' + DIMS[2].db, ok: false }
  ];

  // 形>勢 means 靜side dominant for dim0. a=形(靜), so 形>勢 = a > b
  var r0 = calcDim(dataArr, 0);
  var r1 = calcDim(dataArr, 1);
  var r2 = calcDim(dataArr, 2);

  // dim0: 形(a,靜)>勢(b,動) — "形>勢" display order is da>db = "形>勢"
  // da=形=a so check a>b
  checks[0].ok = r0 && r0.a > r0.b;
  // dim1: 經(a,靜)>緯(b,動) — da=經=a so check a>b
  checks[1].ok = r1 && r1.a > r1.b;
  // dim2: 方(b,靜)>圓(a,動) — da=方=b so check b>a
  checks[2].ok = r2 && r2.b > r2.a;

  var text = '';
  // Match against table
  if (checks[0].ok && checks[1].ok && checks[2].ok) {
    text = '創業老闆方向 — 做事的人';
  } else if (checks[0].ok && checks[1].ok && !checks[2].ok) {
    text = '創業老闆方向 — 做老闆的人（看圓）';
  } else if (!checks[0].ok && !checks[1].ok && !checks[2].ok) {
    text = '做老闆辛苦（老師原話）';
  } else {
    text = '方向不完全符合，看係數 0.80 是調整機會';
  }

  return { checks: checks, text: text };
}

function calcBossPremise(dataArr) {
  // 1+2=3: 形勢(dim0) + 經緯(dim1) = 方圓(dim2)
  var r0 = calcDim(dataArr, 0);
  var r1 = calcDim(dataArr, 1);

  var xsOk = r0 && r0.coeff >= 0.50;
  var jwOk = r1 && r1.coeff >= 0.50;

  var text = '';
  if (xsOk && jwOk) {
    text = '方圓可深論';
  } else if (!xsOk && !jwOk) {
    text = '形勢經緯都未到位，方圓的成就先不用論，先處理前提';
  } else if (!xsOk) {
    text = '形勢格局未到位，方圓的成就先不用論，先處理形勢';
  } else {
    text = '經緯的核心價值未到位，方圓的成就先不用論，先處理經緯';
  }

  return { xsOk: xsOk, jwOk: jwOk, text: text };
}

function calcMgrDirection(dataArr) {
  var r3 = calcDim(dataArr, 3);
  var r4 = calcDim(dataArr, 4);
  var r5 = calcDim(dataArr, 5);

  var checks = [
    { label: DIMS[3].da + '>' + DIMS[3].db, ok: false },
    { label: DIMS[4].da + '>' + DIMS[4].db, ok: false },
    { label: DIMS[5].da + '>' + DIMS[5].db, ok: false }
  ];

  // dim3: 曲直 a=直(靜), b=曲(動), da=曲, db=直
  // "直>曲" = a>b, but da=曲 so display is 曲>直 when b>a
  // Actually: da='曲', db='直'. We want 直>曲 (靜>動)
  // 直=a(靜), 曲=b(動). Check a>b for 直>曲
  // But display: da=曲, db=直. So "曲>直" label means b>a (曲dominant).
  // We need "直>曲" for 穩當主管: a>b
  // Let me re-check: checks label is da>db
  // dim3: da=曲, db=直. label = "曲>直". ok = b>a (曲=b dominant)? No, 曲=b(動).
  // Wait: DIMS[3] = {a:"直",b:"曲",aT:"靜",bT:"動",da:"曲",db:"直"}
  // So da="曲"=b, db="直"=a. "da>db" = "曲>直" means b>a.
  // For 穩當主管 we need 直>曲 = a>b.
  // So checks[0].ok should check if da side > db side...
  // Actually the spec says 直>曲, 靜>動, 緩>急 for 穩當主管
  // Let me just check static > dynamic for each dim

  // 直>曲: 靜(直=a) > 動(曲=b) => a > b
  var qzOk = r3 && r3.a > r3.b; // 直>曲
  // 收>放: 靜(收=a) > 動(放=b) => a > b
  var sfOk = r4 && r4.a > r4.b; // 收>放
  // 緩>急: 靜(緩=a) > 動(急=b) => a > b
  var hjOk = r5 && r5.a > r5.b; // 緩>急

  checks[0] = { label: '直>曲', ok: qzOk };
  checks[1] = { label: '收>放', ok: sfOk };
  checks[2] = { label: '緩>急', ok: hjOk };

  var text = '';
  // 曲>直 means b>a for dim3 => qzOk is false and b>a
  var quDominant = r3 && r3.b > r3.a; // 曲 dominant

  if (qzOk && sfOk && hjOk) {
    text = '典型穩當主管';
  } else if (quDominant) {
    text = '幕僚/幕僚長傾向（老師原話）';
  } else {
    text = '方向不完全符合，需細看各維度';
  }

  return { checks: checks, text: text };
}

function calcMgrPremise(dataArr) {
  // 4+5=6: 曲直(dim3) + 收放(dim4) = 緩急(dim5)
  var r3 = calcDim(dataArr, 3);
  var r4 = calcDim(dataArr, 4);

  var qzOk = r3 && r3.coeff >= 0.50;
  var sfOk = r4 && r4.coeff >= 0.50;

  var text = '';
  if (qzOk && sfOk) {
    text = '緩急可深論';
  } else if (!qzOk && !sfOk) {
    text = '擔當和能耐都不足，節奏先放一邊';
  } else if (!qzOk) {
    text = '擔當不足，扛不起責任，緩急帶過';
  } else {
    text = '能耐不足，做不到，緩急帶過';
  }

  return { qzOk: qzOk, sfOk: sfOk, text: text };
}

function calcRoleIdentity(dataArr) {
  var bossCoeff = parseFloat(avgCoeff(dataArr, [0,1,2]));
  var mgrCoeff = parseFloat(avgCoeff(dataArr, [3,4,5]));
  var innateCoeff = parseFloat(avgCoeff(dataArr, [0,1,2,3,4,5]));

  // 先天極低
  if (innateCoeff < 0.20) {
    return {
      boss: bossCoeff, mgr: mgrCoeff,
      role: '個人工作者',
      desc: '先天係數極低不適合老闆或主管，但要兼看後天和運氣才知道適合什麼'
    };
  }

  var bossDir = calcBossDirection(dataArr);
  var allDirOk = bossDir.checks.every(function(c) { return c.ok; });
  var mgrBal = calcBlockBalance(dataArr, [3,4,5]);

  var diff = Math.abs(bossCoeff - mgrCoeff);

  if (bossCoeff > mgrCoeff && allDirOk) {
    return { boss: bossCoeff, mgr: mgrCoeff, role: '創業老闆', desc: '老闆係數高且方向正確' };
  }
  if (mgrCoeff > bossCoeff && mgrBal.gap <= 2) {
    return { boss: bossCoeff, mgr: mgrCoeff, role: '高階夥計', desc: '主管係數高且三維均衡' };
  }
  if (diff <= 0.10) {
    var r1 = calcDim(dataArr, 1);
    var r3 = calcDim(dataArr, 3);
    var jwLow = r1 && r1.coeff < 0.50;
    var qzLow = r3 && r3.coeff < 0.50;
    if (jwLow || qzLow) {
      return { boss: bossCoeff, mgr: mgrCoeff, role: '高階幕僚', desc: '老闆≈主管且經緯或曲直偏低' };
    }
  }

  return { boss: bossCoeff, mgr: mgrCoeff, role: '老闆/主管皆可', desc: '看內部細節' };
}

function calcResistanceEffect(dataArr) {
  // 形勢阻力效應 (GS_14 §5 + AI評析跨維度 §8.5)
  var r0 = calcDim(dataArr, 0); // 形勢
  var r1 = calcDim(dataArr, 1); // 經緯
  var r2 = calcDim(dataArr, 2); // 方圓

  if (!r0 || !r1 || !r2) return false;

  // 1. 形>勢
  var c1 = r0.a > r0.b;
  // 2. 經>緯
  var c2 = r1.a > r1.b;
  // 3. 經緯係數 ≥ 0.50
  var c3 = r1.coeff >= 0.50;
  // 4. 方圓係數 ≥ 0.50
  var c4 = r2.coeff >= 0.50;
  // 5. 形勢係數偏低 (= 0.13 or 0.29)
  var xsCoeff = r0.coeff;
  var c5 = (Math.abs(xsCoeff - 0.125) < 0.02) || (Math.abs(xsCoeff - 0.29) < 0.02);
  // More precisely: coeff values from 1/8=0.125 or 2/7≈0.286
  // Check if ≤ 0.30
  c5 = xsCoeff <= 0.30;

  return c1 && c2 && c3 && c4 && c5;
}

function calcFlipCandidates(dataArr, block) {
  var dimIndices = block.dims;
  var bal = calcBlockBalance(dataArr, dimIndices);
  var D0 = bal.gap;
  var C0 = parseFloat(avgCoeff(dataArr, dimIndices));
  var isBalanced = D0 <= 2;

  var candidates = [];
  for (var di = 0; di < dimIndices.length; di++) {
    var dimIdx = dimIndices[di];
    for (var pi = 0; pi < 9; pi++) {
      var curVal = dataArr[dimIdx][pi];
      if (curVal === null) continue;
      var targetVal = curVal === 'A' ? 'B' : 'A';

      // Temporarily flip
      dataArr[dimIdx][pi] = targetVal;
      var bal1 = calcBlockBalance(dataArr, dimIndices);
      var D1 = bal1.gap;
      var C1 = parseFloat(avgCoeff(dataArr, dimIndices));
      dataArr[dimIdx][pi] = curVal; // restore

      var balImprove = D0 - D1; // positive = more balanced
      var coeffChange = C1 - C0; // positive = higher

      candidates.push({
        dimIdx: dimIdx,
        partIdx: pi,
        dimName: DIMS[dimIdx].dn,
        partName: PARTS_SHORT[pi],
        from: curVal,
        to: targetVal,
        balImprove: balImprove,
        coeffChange: coeffChange,
        balBefore: D0,
        balAfter: D1,
        coeffBefore: C0,
        coeffAfter: C1
      });
    }
  }

  // Sort
  if (isBalanced) {
    // Already balanced: sort by |coeffChange| desc, then balImprove desc
    candidates.sort(function(a, b) {
      var diffCoeff = Math.abs(b.coeffChange) - Math.abs(a.coeffChange);
      if (Math.abs(diffCoeff) > 0.0001) return diffCoeff;
      return b.balImprove - a.balImprove;
    });
  } else {
    // Not balanced: sort by balImprove desc, then coeffChange desc
    candidates.sort(function(a, b) {
      if (a.balImprove !== b.balImprove) return b.balImprove - a.balImprove;
      return b.coeffChange - a.coeffChange;
    });
  }

  return candidates.slice(0, block.topN);
}

// ===== 3. 渲染層 =====

function renderBarChart(pillars, blockLabel) {
  var maxVal = 9; // max possible static count
  var h = '';
  h += '<div style="display:flex;align-items:flex-end;gap:8px;height:80px;padding:8px 0">';
  pillars.forEach(function(p) {
    var d = DIMS[p.dimIdx];
    // Static side label: the 靜 side attribute name
    var staticLabel = d.aT === '靜' ? d.a : d.b;
    var pct = (p.staticCount / maxVal * 100);
    h += '<div style="display:flex;flex-direction:column;align-items:center;flex:1">';
    h += '<span style="font-size:11px;color:var(--text-3);margin-bottom:2px">' + p.staticCount + '</span>';
    h += '<div style="width:100%;max-width:32px;height:' + Math.max(pct, 5) + '%;background:#7A9E7E;border-radius:3px 3px 0 0"></div>';
    h += '<span style="font-size:10px;color:var(--text);margin-top:2px">' + staticLabel + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

function renderBossCard(dataArr) {
  var bossCoeff = avgCoeff(dataArr, [0,1,2]);
  var sc = getStaticCount(dataArr, 0) + getStaticCount(dataArr, 1) + getStaticCount(dataArr, 2);
  var dc = getDynamicCount(dataArr, 0) + getDynamicCount(dataArr, 1) + getDynamicCount(dataArr, 2);
  var dir = calcBossDirection(dataArr);
  var premise = calcBossPremise(dataArr);
  var bal = calcBlockBalance(dataArr, [0,1,2]);
  var resistance = calcResistanceEffect(dataArr);

  var h = '<div style="background:white;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:12px">';
  h += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">';
  h += '<span style="font-size:16px;font-weight:400;color:#8E4B50">老闆係數 1.2.3</span>';
  h += '<span style="font-size:14px;font-weight:400;color:white;background:#8E4B50;padding:2px 10px;border-radius:5px">' + bossCoeff + '</span>';
  h += '<span style="font-size:12px;color:var(--text-3)">（靜' + sc + ' 動' + dc + '）</span>';
  h += '</div>';

  // 方向判讀
  h += '<div style="margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:4px">方向判讀：</div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">';
  dir.checks.forEach(function(c) {
    h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:' + (c.ok ? '#e8f5e9' : '#fce4ec') + ';color:' + (c.ok ? '#2e7d32' : '#c62828') + '">' + c.label + ' ' + (c.ok ? '✓' : '✗') + '</span>';
  });
  h += '</div>';
  h += '<div style="font-size:13px;color:var(--text-2)">→ ' + dir.text + '</div>';
  h += '</div>';

  // 1+2=3 前提
  h += '<div style="margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:4px">1+2=3 因果前提：</div>';
  h += '<div style="display:flex;gap:8px;margin-bottom:4px">';
  h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:' + (premise.xsOk ? '#e8f5e9' : '#fce4ec') + ';color:' + (premise.xsOk ? '#2e7d32' : '#c62828') + '">形勢 ' + (premise.xsOk ? '✓' : '✗') + '</span>';
  h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:' + (premise.jwOk ? '#e8f5e9' : '#fce4ec') + ';color:' + (premise.jwOk ? '#2e7d32' : '#c62828') + '">經緯 ' + (premise.jwOk ? '✓' : '✗') + '</span>';
  h += '</div>';
  h += '<div style="font-size:13px;color:var(--text-2)">→ ' + premise.text + '</div>';
  h += '</div>';

  // 均衡度
  h += '<div style="margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:4px">均衡度（靜側柱子圖）：</div>';
  h += renderBarChart(bal.pillars, '老闆');
  h += '<div style="font-size:12px;color:var(--text-2);margin-top:4px">';
  h += '差距 ' + bal.gap + '  ';
  if (bal.gap <= 2) {
    h += '<span style="color:#7A9E7E">⚪ 均衡</span>';
  } else {
    h += '<span style="color:#E8B000">⚠ 需提醒短板</span>';
    // Find shortboard
    var minVal = bal.min;
    var shortboards = bal.pillars.filter(function(p) { return p.staticCount === minVal; });
    shortboards.forEach(function(sb) {
      var d = DIMS[sb.dimIdx];
      var staticLabel = d.aT === '靜' ? d.a : d.b;
      var found = BOSS_SHORTBOARD.find(function(s) { return s.dim === staticLabel; });
      if (found) {
        h += '<br><span style="font-size:12px;color:var(--text-2)">短板：' + staticLabel + ' — ' + found.text + '</span>';
      }
    });
  }
  h += '</div>';
  h += '</div>';

  // 形勢阻力效應
  if (resistance) {
    h += '<div style="padding:10px 12px;background:#fff8e1;border-radius:6px;border:1px solid #ffe082;margin-bottom:4px">';
    h += '<div style="font-size:13px;font-weight:400;color:#f57f17;margin-bottom:4px">⚠ 形勢阻力效應</div>';
    h += '<div style="font-size:12px;color:var(--text-2)">你有清楚的核心價值，也知道自己要追求什麼方向的成就，但在把格局做大這件事上動能不足。不是不想做，是目前的狀態太穩了，缺少一個推力讓你真正出手。</div>';
    h += '</div>';
  }

  h += '</div>';
  return h;
}

function renderManagerCard(dataArr) {
  var mgrCoeff = avgCoeff(dataArr, [3,4,5]);
  var sc = getStaticCount(dataArr, 3) + getStaticCount(dataArr, 4) + getStaticCount(dataArr, 5);
  var dc = getDynamicCount(dataArr, 3) + getDynamicCount(dataArr, 4) + getDynamicCount(dataArr, 5);
  var dir = calcMgrDirection(dataArr);
  var premise = calcMgrPremise(dataArr);
  var bal = calcBlockBalance(dataArr, [3,4,5]);

  var h = '<div style="background:white;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:12px">';
  h += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">';
  h += '<span style="font-size:16px;font-weight:400;color:#8C6B4A">主管係數 4.5.6</span>';
  h += '<span style="font-size:14px;font-weight:400;color:white;background:#8C6B4A;padding:2px 10px;border-radius:5px">' + mgrCoeff + '</span>';
  h += '<span style="font-size:12px;color:var(--text-3)">（靜' + sc + ' 動' + dc + '）</span>';
  h += '</div>';

  // 方向判讀
  h += '<div style="margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:4px">方向判讀：</div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">';
  dir.checks.forEach(function(c) {
    h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:' + (c.ok ? '#e8f5e9' : '#fce4ec') + ';color:' + (c.ok ? '#2e7d32' : '#c62828') + '">' + c.label + ' ' + (c.ok ? '✓' : '✗') + '</span>';
  });
  h += '</div>';
  h += '<div style="font-size:13px;color:var(--text-2)">→ ' + dir.text + '</div>';
  h += '</div>';

  // 4+5=6 前提
  h += '<div style="margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:4px">4+5=6 因果前提：</div>';
  h += '<div style="display:flex;gap:8px;margin-bottom:4px">';
  h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:' + (premise.qzOk ? '#e8f5e9' : '#fce4ec') + ';color:' + (premise.qzOk ? '#2e7d32' : '#c62828') + '">曲直 ' + (premise.qzOk ? '✓' : '✗') + '</span>';
  h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:' + (premise.sfOk ? '#e8f5e9' : '#fce4ec') + ';color:' + (premise.sfOk ? '#2e7d32' : '#c62828') + '">收放 ' + (premise.sfOk ? '✓' : '✗') + '</span>';
  h += '</div>';
  h += '<div style="font-size:13px;color:var(--text-2)">→ ' + premise.text + '</div>';
  h += '</div>';

  // 均衡度
  h += '<div style="margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:4px">均衡度（靜側柱子圖）：</div>';
  h += renderBarChart(bal.pillars, '主管');
  h += '<div style="font-size:12px;color:var(--text-2);margin-top:4px">';
  h += '差距 ' + bal.gap + '  ';
  if (bal.gap <= 2) {
    h += '<span style="color:#7A9E7E">⚪ 均衡</span>';
  } else {
    h += '<span style="color:#E8B000">⚠ 需提醒短板</span>';
    var minVal = bal.min;
    var shortboards = bal.pillars.filter(function(p) { return p.staticCount === minVal; });
    shortboards.forEach(function(sb) {
      var d = DIMS[sb.dimIdx];
      var staticLabel = d.aT === '靜' ? d.a : d.b;
      var found = MGR_SHORTBOARD.find(function(s) { return s.dim === staticLabel; });
      if (found) {
        h += '<br><span style="font-size:12px;color:var(--text-2)">短板：' + staticLabel + ' — ' + found.text + '</span>';
      }
    });
  }
  h += '</div>';
  h += '</div>';

  h += '</div>';
  return h;
}

function renderRoleIdentity(dataArr) {
  var role = calcRoleIdentity(dataArr);
  var h = '<div style="background:white;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:16px">';
  h += '<div style="font-size:15px;font-weight:400;color:var(--text);margin-bottom:8px">角色定位</div>';
  h += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:6px">';
  h += '<span style="font-size:14px;color:#8E4B50">老闆 ' + role.boss.toFixed(2) + '</span>';
  h += '<span style="font-size:13px;color:var(--text-3)">vs</span>';
  h += '<span style="font-size:14px;color:#8C6B4A">主管 ' + role.mgr.toFixed(2) + '</span>';
  h += '</div>';
  h += '<div style="font-size:16px;font-weight:400;color:var(--text);margin-bottom:4px">角色定位：' + role.role + '</div>';
  h += '<div style="font-size:12px;color:var(--text-3)">' + role.desc + '</div>';
  h += '</div>';
  return h;
}

function renderLuckBlock(dataArr) {
  var luckCoeff = avgCoeff(dataArr, [6,7,8]);
  var sc = getStaticCount(dataArr, 6) + getStaticCount(dataArr, 7) + getStaticCount(dataArr, 8);
  var dc = getDynamicCount(dataArr, 6) + getDynamicCount(dataArr, 7) + getDynamicCount(dataArr, 8);

  var h = '<div style="background:white;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:16px">';
  h += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">';
  h += '<span style="font-size:16px;font-weight:400;color:#4C6E78">運氣區塊</span>';
  h += '<span style="font-size:14px;font-weight:400;color:white;background:#4C6E78;padding:2px 10px;border-radius:5px">' + luckCoeff + '</span>';
  h += '<span style="font-size:12px;color:var(--text-3)">（靜' + sc + '：動' + dc + '）</span>';
  h += '</div>';

  [6,7,8].forEach(function(di) {
    var r = calcDim(dataArr, di);
    var coeff = r ? r.coeff.toFixed(2) : '—';
    var tp = r ? r.type : '—';
    var deepNote = '';
    if (di === 6) {
      // 順逆方向判讀（GS_07）
      if (r) {
        deepNote = r.type === '靜' ? '順勢而為' : '逆境奮鬥';
      }
    } else {
      deepNote = '深度分析待完成';
    }
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">';
    h += '<span style="font-weight:400;color:var(--text);min-width:40px">' + DIMS[di].dn + '：</span>';
    h += '<span style="font-size:13px;color:var(--text-2)">係數 ' + coeff + '，</span>';
    h += '<span style="font-size:13px;color:' + (tp === '靜' ? '#7A9E7E' : '#C17A5A') + '">' + tp + '</span>';
    if (deepNote) {
      h += '<span style="font-size:12px;color:var(--text-3);margin-left:8px">（' + deepNote + '）</span>';
    }
    h += '</div>';
  });

  h += '</div>';
  return h;
}

function renderPostBlock(dataArr) {
  var postCoeff = avgCoeff(dataArr, [9,10,11,12]);
  var sc = getStaticCount(dataArr, 9) + getStaticCount(dataArr, 10) + getStaticCount(dataArr, 11) + getStaticCount(dataArr, 12);
  var dc = getDynamicCount(dataArr, 9) + getDynamicCount(dataArr, 10) + getDynamicCount(dataArr, 11) + getDynamicCount(dataArr, 12);

  var h = '<div style="background:white;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:16px">';
  h += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">';
  h += '<span style="font-size:16px;font-weight:400;color:#7B7082">後天區塊</span>';
  h += '<span style="font-size:14px;font-weight:400;color:white;background:#7B7082;padding:2px 10px;border-radius:5px">' + postCoeff + '</span>';
  h += '<span style="font-size:12px;color:var(--text-3)">（靜' + sc + '：動' + dc + '）</span>';
  h += '</div>';

  [9,10,11,12].forEach(function(di) {
    var r = calcDim(dataArr, di);
    var coeff = r ? r.coeff.toFixed(2) : '—';
    var tp = r ? r.type : '—';
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">';
    h += '<span style="font-weight:400;color:var(--text);min-width:40px">' + DIMS[di].dn + '：</span>';
    h += '<span style="font-size:13px;color:var(--text-2)">係數 ' + coeff + '，</span>';
    h += '<span style="font-size:13px;color:' + (tp === '靜' ? '#7A9E7E' : '#C17A5A') + '">' + tp + '</span>';
    h += '</div>';
  });

  // 攻守×奇正連動（v1 只做這一對）
  var r9 = calcDim(dataArr, 9);  // 攻守
  var r10 = calcDim(dataArr, 10); // 奇正
  if (r9 && r10) {
    h += '<div style="margin-top:12px;padding:10px 12px;background:#f5f5f0;border-radius:6px">';
    h += '<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:6px">跨維度連動提示：</div>';
    // 攻(動) ↔ 奇(動) 同為動側 → 順暢
    // 攻(動) ↔ 正(靜) 動靜相反 → 有衝突
    // If both are same type → 順暢, otherwise → 有衝突
    if (r9.type === r10.type) {
      h += '<div style="font-size:12px;color:#7A9E7E">攻守 ↔ 奇正 方向一致（' + r9.type + '），順暢</div>';
    } else {
      h += '<div style="font-size:12px;color:#E8B000">攻守（' + r9.type + '）↔ 奇正（' + r10.type + '）方向不同，有衝突</div>';
    }
    h += '</div>';
  }

  h += '</div>';
  return h;
}

function renderTopNList(candidates, blockLabel, blockColor) {
  if (candidates.length === 0) {
    return '<div style="padding:8px 12px;font-size:13px;color:var(--text-3)">無有效翻轉建議</div>';
  }

  var h = '';
  candidates.forEach(function(c, idx) {
    h += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:white;border-radius:6px;border:1px solid var(--border);margin-bottom:4px;flex-wrap:wrap">';
    h += '<span style="font-size:14px;font-weight:400;color:' + blockColor + ';min-width:24px">[' + (idx + 1) + ']</span>';

    // 部位 × 維度 + 翻轉方向
    h += '<span style="padding:2px 8px;border-radius:4px;background:#f0ebe0;font-size:13px;color:var(--text)">' + c.partName + ' × ' + c.dimName + '</span>';
    h += '<span style="font-size:13px;font-weight:400;color:var(--text)">' + c.from + '→' + c.to + '</span>';

    // 均衡改善
    if (c.balImprove > 0) {
      h += '<span style="font-size:12px;color:#2e7d32">均衡 ' + c.balBefore + '→' + c.balAfter + ' (改善+' + c.balImprove + ')</span>';
    } else if (c.balImprove === 0) {
      h += '<span style="font-size:12px;color:var(--text-3)">均衡不變</span>';
    } else {
      h += '<span style="font-size:12px;color:var(--text-3)">均衡 ' + c.balBefore + '→' + c.balAfter + '</span>';
    }

    // 係數改變
    if (Math.abs(c.coeffChange) < 0.005) {
      h += '<span style="font-size:12px;color:var(--text-3)">係數不變</span>';
    } else {
      var coeffColor = c.coeffChange > 0 ? '#2e7d32' : '#999';
      h += '<span style="font-size:12px;color:' + coeffColor + '">' + blockLabel + '係數 ' + c.coeffBefore.toFixed(2) + '→' + c.coeffAfter.toFixed(2) + '</span>';
    }

    h += '</div>';
  });
  return h;
}

function renderTopHalf(dataArr) {
  var innateCoeff = avgCoeff(dataArr, [0,1,2,3,4,5]);
  var h = '';

  // 先天區塊
  h += '<div style="margin-bottom:24px;padding:16px;background:#f5f5f0;border-radius:10px;border:1px solid #d4d4c8">';
  h += '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px">';
  h += '<span style="font-size:18px;font-weight:400;color:#8E4B50">先天區塊</span>';
  h += '<span style="font-size:16px;font-weight:400;color:white;background:#8E4B50;padding:2px 12px;border-radius:6px">先天 ' + innateCoeff + '</span>';
  h += '</div>';

  h += renderBossCard(dataArr);
  h += renderManagerCard(dataArr);
  h += renderRoleIdentity(dataArr);
  h += '</div>';

  // 運氣區塊
  if (BETA_VISIBLE_DIMS >= 9) {
    h += renderLuckBlock(dataArr);
  } else {
    h += '<div style="margin-bottom:16px;padding:40px 16px;background:#f0f0ea;border-radius:10px;border:1px solid #d4d4c8;text-align:center">';
    h += '<div style="font-size:18px;font-weight:400;color:#bbb;letter-spacing:2px;margin-bottom:8px">運氣區塊</div>';
    h += '<div style="font-size:14px;color:#bbb">建置中</div>';
    h += '</div>';
  }

  // 後天區塊
  if (BETA_VISIBLE_DIMS >= 13) {
    h += renderPostBlock(dataArr);
  } else {
    h += '<div style="margin-bottom:16px;padding:40px 16px;background:#f0f0ea;border-radius:10px;border:1px solid #d4d4c8;text-align:center">';
    h += '<div style="font-size:18px;font-weight:400;color:#bbb;letter-spacing:2px;margin-bottom:8px">後天區塊</div>';
    h += '<div style="font-size:14px;color:#bbb">建置中</div>';
    h += '</div>';
  }

  return h;
}

function renderBottomHalf(dataArr) {
  var h = '';
  h += '<div style="border-top:2px solid var(--border);margin:8px 0 20px"></div>';
  h += '<div style="font-size:18px;font-weight:400;color:var(--text);margin-bottom:16px;letter-spacing:2px">格子翻轉建議</div>';

  BLOCK_DEFS.forEach(function(block) {
    // Check if dims are visible
    var maxDim = Math.max.apply(null, block.dims);
    if (maxDim >= BETA_VISIBLE_DIMS) return;

    var bal = calcBlockBalance(dataArr, block.dims);
    var coeff = avgCoeff(dataArr, block.dims);
    var candidates = calcFlipCandidates(dataArr, block);

    h += '<div style="margin-bottom:20px">';
    h += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">';
    h += '<span style="font-size:15px;font-weight:400;color:' + block.color + '">' + block.label + ' Top ' + block.topN + '</span>';
    h += '<span style="font-size:12px;color:var(--text-3)">係數 ' + coeff + '</span>';
    h += '<span style="font-size:12px;color:var(--text-3)">均衡度差距 ' + bal.gap + '</span>';
    if (bal.gap <= 2) {
      h += '<span style="font-size:11px;color:#7A9E7E">⚪ 均衡</span>';
    } else {
      h += '<span style="font-size:11px;color:#E8B000">⚠ 不均衡</span>';
    }
    h += '</div>';
    h += renderTopNList(candidates, block.label, block.color);
    h += '</div>';
  });

  return h;
}

// ===== 4. 頁面入口 =====

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

  var html = '';
  html += '<div style="font-size:18px;font-weight:400;color:var(--text);margin-bottom:4px;letter-spacing:2px">手動版重要參數分析</div>';
  html += '<div style="font-size:13px;color:var(--text-3);margin-bottom:16px">基於手動輸入的 9 部位 × ' + BETA_VISIBLE_DIMS + ' 維度矩陣，依老師邏輯做方向判讀、因果前提、均衡度診斷，並列出格子翻轉建議</div>';

  // 上半部：老師邏輯診斷
  html += renderTopHalf(manualData);

  // 下半部：格子翻轉建議 Top N
  html += renderBottomHalf(manualData);

  el.innerHTML = html;
}
