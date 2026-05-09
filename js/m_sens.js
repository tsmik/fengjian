// ============================================================
// 手機版重要參數分析（patch 2 範圍：手動版三區塊摘要 + 自動版 placeholder）
// 職責：摘要式渲染（大係數 + Top 3 部位 + 一行建議）
//       完整矩陣展開留待 patch 5 實作
// 依賴：
//   - js/core.js (DIMS, avgCoeff, BETA_VISIBLE_DIMS)
//   - js/manual_sens_v2.js (calcAdjustments / findPriorityParts / checkBlockComplete)
// 被用：m_report.js（renderManualSens / renderAutoSens）
// retest 範圍：
//   - 三區塊（先天/運氣/後天）大係數值正確（跟桌機 manual-sens-v2-page 對得上）
//   - Top 3 部位排序正確（依翻轉次數 desc，同分依 partIdx asc）
//   - 未填完顯示「尚未填完 X/N」提示
//   - 均衡狀態（actualFlips=0）顯示「已均衡」訊息
//   - 顴建議（hasGuan）顯示警告
//   - 自動版顯示 placeholder（建置中）
// ============================================================

import {
  DIMS, avgCoeff, BETA_VISIBLE_DIMS,
  obsData, data, obsOverride,
  setObsData, setData, setObsOverride,
  calcDim, OBS_PART_NAMES, OBS_PARTS_DATA
} from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { calcAdjustments, checkBlockComplete, buildMatrix } from './manual_sens_v2.js';

const PART_LABELS = ['頭', '上停', '中停', '下停', '耳', '眉', '眼', '鼻', '口'];

const BLOCKS = [
  { type: 'innate',   label: '先天', dims: [0,1,2,3,4,5], color: '#8E4B50', visible: true },
  { type: 'luck',     label: '運氣', dims: [6,7,8],       color: '#4C6E78', visible: BETA_VISIBLE_DIMS >= 9 },
  { type: 'acquired', label: '後天', dims: [9,10,11,12],  color: '#7B7082', visible: BETA_VISIBLE_DIMS >= 13 }
];

// ===== 自動版（精簡 simulate，不 reuse 桌機 sens_analysis.js）=====
//
// 邏輯：對每題試翻轉 → 看「先天/運氣/後天」三 block 的大係數 delta → 取最大
//       依部位加總 sensitivity → 排序得 Top 部位
// 跟桌機差異：桌機有多輪累積 simulate 算「→ 預估值」，手機精簡版不算。
//             所以手機自動版只顯示「目前係數」，沒有「→ 變化」。

const AUTO_BLOCKS = [
  { key: 'innate', label: '先天', color: '#8E4B50', dims: [0,1,2,3,4,5], visible: true },
  { key: 'luck',   label: '運氣', color: '#4C6E78', dims: [6,7,8],       visible: BETA_VISIBLE_DIMS >= 9 },
  { key: 'post',   label: '後天', color: '#7B7082', dims: [9,10,11,12],  visible: BETA_VISIBLE_DIMS >= 13 }
];

function _calcBlockCoeffRaw(dataArr, dims) {
  // 跟桌機 sens_analysis.js line 99 的 _sMin/_sMax 邏輯一致（ratio 法）
  let mn = 0, mx = 0;
  dims.forEach(di => {
    const r = calcDim(dataArr, di);
    if (r) { mn += Math.min(r.a, r.b); mx += Math.max(r.a, r.b); }
  });
  return mx > 0 ? mn / mx : 0;
}

function _runAutoSensCalc() {
  // obsData 為空時，先從 window.__userData.obsJson 載 baseline 再 recalc
  // （首次進分析頁、還沒點過「產生詳盡報告」時 obsData 是空；跟 PNG 生成同一邏輯）
  if (!obsData || Object.keys(obsData).length === 0) {
    const ud = (typeof window !== 'undefined') ? (window.__userData || {}) : {};
    if (ud.obsJson) {
      try { setObsData(JSON.parse(ud.obsJson)); }
      catch (e) {}
      recalcFromObs();
    }
  }
  // 載完仍為空 → 真的沒填觀察題
  if (!obsData || Object.keys(obsData).length === 0) return null;

  // 暫存原始 state
  const origObs = JSON.parse(JSON.stringify(obsData));
  const origData = JSON.parse(JSON.stringify(data));
  const origOverride = JSON.parse(JSON.stringify(obsOverride));

  // 收集所有題目
  const allQs = [];
  OBS_PART_NAMES.forEach(pn => {
    const pd = OBS_PARTS_DATA[pn];
    if (!pd) return;
    pd.sections.forEach(sec => {
      sec.qs.forEach(q => {
        allQs.push({ id: q.id, paired: !!q.paired, opts: q.opts, part: pn });
      });
    });
  });
  if (allQs.length === 0) return null;

  // 基準大係數（per block，ratio 法）
  const baseBlockCoeff = {};
  AUTO_BLOCKS.forEach(b => {
    baseBlockCoeff[b.key] = _calcBlockCoeffRaw(data, b.dims);
  });

  // 對每題試翻轉 → 收集 per-block sensitivity
  const sensResults = []; // { id, part, sens: {innate, luck, post} }
  allQs.forEach(q => {
    const curVal = origObs[q.id] || '';
    const maxSens = { innate: 0, luck: 0, post: 0 };

    q.opts.forEach(opt => {
      const v = typeof opt === 'string' ? opt : opt.v;
      if (v === curVal) return;

      // 套翻轉版 obsData（直接 mutate live binding 的 obj prop）
      setObsData(JSON.parse(JSON.stringify(origObs)));
      obsData[q.id] = v;
      if (q.paired) { obsData[q.id + '_L'] = v; obsData[q.id + '_R'] = v; }
      recalcFromObs();

      AUTO_BLOCKS.forEach(b => {
        const newC = _calcBlockCoeffRaw(data, b.dims);
        const d = Math.abs(newC - baseBlockCoeff[b.key]);
        if (d > maxSens[b.key]) maxSens[b.key] = d;
      });
    });

    // 每題後立即還原 obsData/data
    setObsData(JSON.parse(JSON.stringify(origObs)));
    setData(JSON.parse(JSON.stringify(origData)));

    sensResults.push({ id: q.id, part: q.part, sens: maxSens });
  });

  // 最終還原：caller 看到的 state 跟進來時一樣
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  function rankParts(blockKey) {
    const partTotal = {};
    sensResults.forEach(r => {
      partTotal[r.part] = (partTotal[r.part] || 0) + r.sens[blockKey];
    });
    return Object.entries(partTotal)
      .map(([part, total]) => ({ part, total }))
      .filter(x => x.total > 0.0001)
      .sort((a, b) => b.total - a.total);
  }

  return {
    coeffs: {
      innate: avgCoeff(data, [0,1,2,3,4,5]),
      luck:   avgCoeff(data, [6,7,8]),
      post:   avgCoeff(data, [9,10,11,12])
    },
    subCoeffs: {
      boss: avgCoeff(data, [0,1,2]),
      mgr:  avgCoeff(data, [3,4,5])
    },
    partRanks: {
      innate: rankParts('innate'),
      luck:   rankParts('luck'),
      post:   rankParts('post')
    }
  };
}

function _renderAutoBlock(result, block) {
  if (!block.visible) {
    return `
      <div class="m-sens-block m-sens-block-disabled">
        <div class="m-sens-block-title" style="color:#bbb">${block.label}係數分析</div>
        <div class="m-sens-incomplete">建置中</div>
      </div>
    `;
  }

  const coeff = result.coeffs[block.key];
  const top3 = result.partRanks[block.key].slice(0, 3);

  let subInfo = '';
  if (block.key === 'innate') {
    subInfo = `
      <div class="m-sens-sub">
        <span class="m-sens-sub-item"><b>老闆</b> ${result.subCoeffs.boss}</span>
        <span class="m-sens-sub-item"><b>主管</b> ${result.subCoeffs.mgr}</span>
      </div>
    `;
  }

  let topListHtml = '';
  if (top3.length > 0) {
    topListHtml = '<div class="m-sens-top-label">重要部位</div><div class="m-sens-top-list">';
    top3.forEach((p, idx) => {
      topListHtml += `
        <div class="m-sens-top-item">
          <span class="m-sens-top-rank">${idx + 1}</span>
          <span class="m-sens-top-part">${p.part}</span>
          <span class="m-sens-top-count">敏感度 ${p.total.toFixed(3)}</span>
        </div>
      `;
    });
    topListHtml += '</div>';
  }

  let advice;
  if (top3.length === 0) {
    advice = `<div class="m-sens-advice">${block.label}係數對觀察答題不敏感（無關鍵調整建議）</div>`;
  } else {
    const partsToFix = top3.map(p => p.part).join('、');
    advice = `<div class="m-sens-advice">${block.label}係數最敏感的部位：<b>${partsToFix}</b><br><span class="m-sens-advice-dim">調整這些部位的觀察答題會最影響${block.label}係數</span></div>`;
  }

  return `
    <div class="m-sens-block">
      <div class="m-sens-block-header">
        <span class="m-sens-block-title" style="color:${block.color}">${block.label}係數</span>
        <span class="m-sens-coeff" style="background:${block.color}">${coeff}</span>
      </div>
      ${subInfo}
      ${topListHtml}
      ${advice}
    </div>
  `;
}

export function renderAutoSens() {
  const result = _runAutoSensCalc();
  if (!result) {
    return `<div class="m-sens-empty">請先在「輸入」分頁填寫觀察題</div>`;
  }

  let html = '';
  html += `<div class="m-sens-subtitle">基於觀察答題逐題模擬翻轉，找出最影響各區係數的部位<br><span style="color:#a89e92;font-size:11px">註：精簡版不顯示「調整後預估值」</span></div>`;
  AUTO_BLOCKS.forEach(b => {
    html += _renderAutoBlock(result, b);
  });
  return html;
}

// ===== 手動版 =====

export function renderManualSens(manualMatrix) {
  if (!manualMatrix) {
    return `<div class="m-sens-empty">請先在「手動報告」中填入資料</div>`;
  }

  let html = '';
  html += `<div class="m-sens-subtitle">基於手動輸入的 9 部位 × 13 維度矩陣，找出調整方向建議</div>`;

  BLOCKS.forEach(b => {
    if (!b.visible) {
      html += `
        <div class="m-sens-block m-sens-block-disabled">
          <div class="m-sens-block-title" style="color:#bbb">${b.label}係數分析</div>
          <div class="m-sens-incomplete">建置中</div>
        </div>
      `;
      return;
    }
    html += _renderManualBlock(manualMatrix, b);
  });

  return html;
}

function _renderManualBlock(matrix, block) {
  const chk = checkBlockComplete(matrix, block.dims);

  // 未填完
  if (!chk.complete) {
    return `
      <div class="m-sens-block m-sens-block-incomplete">
        <div class="m-sens-block-header">
          <span class="m-sens-block-title" style="color:${block.color}">${block.label}係數</span>
        </div>
        <div class="m-sens-incomplete">⚠ ${block.label}尚未填完（已填 ${chk.filled}/${chk.total} 格）</div>
      </div>
    `;
  }

  // 計算調整建議
  const result = calcAdjustments(matrix, block.type);
  const adjustments = result.adjustments;
  const actualFlips = adjustments.filter(a => a.type !== 'guan_suggestion');
  const hasGuan = adjustments.some(a => a.type === 'guan_suggestion');

  // 大係數
  const origCoeff = avgCoeff(matrix, block.dims);
  const newCoeff = avgCoeff(result.newData, block.dims);
  const hasChange = actualFlips.length > 0 && origCoeff !== newCoeff;

  // 子係數（先天才有：老闆 / 主管）
  let subInfo = '';
  if (block.type === 'innate') {
    const bossOld = avgCoeff(matrix, [0,1,2]);
    const bossNew = avgCoeff(result.newData, [0,1,2]);
    const mgrOld  = avgCoeff(matrix, [3,4,5]);
    const mgrNew  = avgCoeff(result.newData, [3,4,5]);
    subInfo = `
      <div class="m-sens-sub">
        <span class="m-sens-sub-item"><b>老闆</b> ${bossOld}${bossNew !== bossOld ? ' → <b>' + bossNew + '</b>' : ''}</span>
        <span class="m-sens-sub-item"><b>主管</b> ${mgrOld}${mgrNew !== mgrOld ? ' → <b>' + mgrNew + '</b>' : ''}</span>
      </div>
    `;
  }

  // Top 3 部位（依翻轉次數 desc，同分依 partIdx asc）
  const partFlips = {};
  actualFlips.forEach(a => {
    partFlips[a.partIndex] = (partFlips[a.partIndex] || 0) + 1;
  });
  const top3 = Object.entries(partFlips)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return parseInt(a[0]) - parseInt(b[0]);
    })
    .slice(0, 3);

  // Top 3 list
  let topListHtml = '';
  if (top3.length > 0) {
    topListHtml = '<div class="m-sens-top-label">重要部位</div><div class="m-sens-top-list">';
    top3.forEach(([piStr, count], idx) => {
      const pi = parseInt(piStr);
      topListHtml += `
        <div class="m-sens-top-item">
          <span class="m-sens-top-rank">${idx + 1}</span>
          <span class="m-sens-top-part">${PART_LABELS[pi]}</span>
          <span class="m-sens-top-count">${count} 處調整</span>
        </div>
      `;
    });
    topListHtml += '</div>';
  }

  // 一行建議文字
  let advice = '';
  if (actualFlips.length === 0) {
    advice = `<div class="m-sens-advice">${block.label}係數已接近均衡，無顯著調整建議。</div>`;
  } else {
    // 取維度（依出現順序去重，最多 3 個）
    const dimSeen = {};
    const dimsToFix = [];
    actualFlips.forEach(a => {
      if (!dimSeen[a.dimIndex]) { dimSeen[a.dimIndex] = true; dimsToFix.push(DIMS[a.dimIndex].dn); }
    });
    const partsToFix = top3.map(([pi]) => PART_LABELS[parseInt(pi)]);
    const dimText = dimsToFix.slice(0, 3).join('、') + (dimsToFix.length > 3 ? ' 等' : '');
    advice = `<div class="m-sens-advice">建議從 <b>${partsToFix.join('、')}</b> 開始思考${block.label}係數調整<br><span class="m-sens-advice-dim">涉及維度：${dimText}</span></div>`;
  }

  // 顴建議（眉眼鼻靜多，無連動對象）
  let guanWarn = '';
  if (hasGuan) {
    guanWarn = `<div class="m-sens-guan">⚠ 建議調顴（眉眼鼻靜多，無連動對象）</div>`;
  }

  // 翻轉集合（給 buildMatrix 標金框用）
  const flipSet = {};
  actualFlips.forEach(adj => {
    flipSet[adj.dimIndex + '_' + adj.partIndex] = true;
  });

  // 完整矩陣（reuse 桌機 buildMatrix）— 預設收合，點開展開
  const matrixOrig = buildMatrix(matrix, block.dims, false, null, null);
  const matrixAdj = hasChange ? buildMatrix(result.newData, block.dims, true, flipSet, null) : '';
  const detailsHtml = `
    <details class="m-sens-details">
      <summary class="m-sens-details-summary">看完整矩陣</summary>
      <div class="m-sens-matrix-wrap">
        <div class="m-sens-matrix-label">目前狀態</div>
        <div class="m-sens-matrix-scroll">${matrixOrig}</div>
        ${hasChange ? `
          <div class="m-sens-matrix-label">調整後預估</div>
          <div class="m-sens-matrix-scroll">${matrixAdj}</div>
        ` : ''}
      </div>
    </details>
  `;

  // 組合
  return `
    <div class="m-sens-block">
      <div class="m-sens-block-header">
        <span class="m-sens-block-title" style="color:${block.color}">${block.label}係數</span>
        <span class="m-sens-coeff" style="background:${block.color}">${origCoeff}</span>
        ${hasChange ? `<span class="m-sens-arrow">→</span><span class="m-sens-coeff" style="background:${block.color}">${newCoeff}</span>` : ''}
      </div>
      ${subInfo}
      ${topListHtml}
      ${advice}
      ${guanWarn}
      ${detailsHtml}
    </div>
  `;
}
