// ============================================================
// 手機版重要參數分析
// 自動版：reuse 桌機 sens_analysis.js 8 個演算法 export function（patch 6-10 抽出）
//         產出 Top 5 題目 list + → 預估值（跟桌機完全一致）
// 手動版：reuse manual_sens_v2.js calcAdjustments / checkBlockComplete / buildMatrix
//         產出三區塊摘要 + 「看完整矩陣」展開
// 被用：m_report.js（renderManualSens / renderAutoSens）
// ============================================================

import {
  DIMS, avgCoeff, BETA_VISIBLE_DIMS,
  obsData, setObsData
} from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { calcAdjustments, checkBlockComplete, buildMatrix } from './manual_sens_v2.js';
import {
  runFirstRoundSensitivity, runBossMgrBaseline,
  runInnateAccumulate, runLuckAccumulate, runPostAccumulate,
  runInnateVerify, runLuckVerify, runPostVerify,
  LUCK_DIMS, POST_DIMS
} from './sens_analysis.js';

const PART_LABELS = ['頭', '上停', '中停', '下停', '耳', '眉', '眼', '鼻', '口'];

const BLOCKS = [
  { type: 'innate',   label: '先天', dims: [0,1,2,3,4,5], color: '#8E4B50', visible: true },
  { type: 'luck',     label: '運氣', dims: [6,7,8],       color: '#4C6E78', visible: BETA_VISIBLE_DIMS >= 9 },
  { type: 'acquired', label: '後天', dims: [9,10,11,12],  color: '#7B7082', visible: BETA_VISIBLE_DIMS >= 13 }
];

// ===== 自動版（reuse 桌機 sens_analysis.js 演算法，跟桌機完全一致）=====

const AUTO_BLOCKS_INFO = [
  { key: 'innate', label: '先天', color: '#8E4B50', dims: [0,1,2,3,4,5], visible: true },
  { key: 'luck',   label: '運氣', color: '#4C6E78', dims: LUCK_DIMS,     visible: BETA_VISIBLE_DIMS >= 9 },
  { key: 'post',   label: '後天', color: '#7B7082', dims: POST_DIMS,     visible: BETA_VISIBLE_DIMS >= 13 }
];

// 跑桌機完整 simulate pipeline（跟桌機 renderSensPage 同一條路）
function _runFullSensSim() {
  // obsData 為空時補載 baseline（防禦；通常 m_report.js _enterSens 已處理）
  if (!obsData || Object.keys(obsData).length === 0) {
    const ud = (typeof window !== 'undefined') ? (window.__userData || {}) : {};
    if (ud.obsJson) {
      try { setObsData(JSON.parse(ud.obsJson)); }
      catch (e) {}
      recalcFromObs();
    }
  }
  if (!obsData || Object.keys(obsData).length === 0) return null;

  const r1 = runFirstRoundSensitivity();
  if (!r1.allQs || r1.allQs.length === 0) return null;
  runBossMgrBaseline(r1.baseCoeffs);

  const innateTop5 = runInnateAccumulate(r1.allQs, r1.origObs, r1.origData, r1.origOverride);
  const iv = runInnateVerify(innateTop5, r1.origObs, r1.origData, r1.origOverride);

  const luckTop5 = runLuckAccumulate(r1.allQs, r1.origObs, r1.origData, r1.origOverride);
  const lv = runLuckVerify(luckTop5, r1.origObs, r1.origData, r1.origOverride);

  const postTop5 = runPostAccumulate(r1.allQs, r1.origObs, r1.origData, r1.origOverride);
  const pv = runPostVerify(postTop5, r1.origObs, r1.origData, r1.origOverride);

  return {
    bossCoeff:   avgCoeff(r1.origData, [0,1,2]),
    mgrCoeff:    avgCoeff(r1.origData, [3,4,5]),
    innateCoeff: avgCoeff(r1.origData, [0,1,2,3,4,5]),
    luckCoeff:   avgCoeff(r1.origData, LUCK_DIMS),
    postCoeff:   avgCoeff(r1.origData, POST_DIMS),
    innateTop5: innateTop5,
    luckTop5:   luckTop5,
    postTop5:   postTop5,
    simBossCoeffVal:   iv.simBossCoeffVal,
    simMgrCoeffVal:    iv.simMgrCoeffVal,
    simInnateCoeffVal: iv.simInnateCoeffVal,
    luckSimCoeffVal:   lv.luckSimCoeffVal,
    postSimCoeffVal:   pv.postSimCoeffVal
  };
}

// 仿桌機 _innateAdviceList 渲染單個題目 list item（先天才有老闆/主管 tag）
function _renderTop5Item(r, idx, maxScore, blockKey) {
  const pct = maxScore > 0 ? Math.min(r.score / maxScore * 100, 100) : 0;
  let tags = '';
  if (blockKey === 'innate') {
    if (r.bossScore > 0.001) tags += `<span class="m-sens-q-tag m-sens-q-tag-boss">老闆↑</span>`;
    if (r.mgrScore > 0.001) tags += `<span class="m-sens-q-tag m-sens-q-tag-mgr">主管↑</span>`;
  }
  return `
    <div class="m-sens-q-item">
      <div class="m-sens-q-row1">
        <span class="m-sens-q-rank">${idx + 1}</span>
        <span class="m-sens-q-part">${r.part}</span>
        <span class="m-sens-q-vals">${r.curVal} → ${r.bestOpt}</span>
        ${tags}
        <span class="m-sens-q-score">+${r.score.toFixed(3)}</span>
      </div>
      <div class="m-sens-q-text">${r.text}</div>
      <div class="m-sens-q-bar"><div class="m-sens-q-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

function _renderAutoBlock(blockInfo, top5, origCoeff, simCoeffVal, subInfo) {
  if (!blockInfo.visible) {
    return `
      <div class="m-sens-block m-sens-block-disabled">
        <div class="m-sens-block-title" style="color:#bbb">${blockInfo.label}係數分析</div>
        <div class="m-sens-incomplete">建置中</div>
      </div>
    `;
  }

  const hasSim = !!simCoeffVal;
  const maxScore = top5.length > 0 ? top5[0].score : 1;

  let listHtml;
  if (top5.length === 0) {
    listHtml = `<div class="m-sens-q-empty">目前配置下無有效調整建議</div>`;
  } else {
    listHtml = '<div class="m-sens-q-list">';
    top5.forEach((r, idx) => {
      listHtml += _renderTop5Item(r, idx, maxScore, blockInfo.key);
    });
    listHtml += '</div>';
  }

  return `
    <div class="m-sens-block">
      <div class="m-sens-block-header">
        <span class="m-sens-block-title" style="color:${blockInfo.color}">${blockInfo.label}係數</span>
        <span class="m-sens-coeff" style="background:${blockInfo.color}">${origCoeff}</span>
        ${hasSim ? `<span class="m-sens-arrow">→</span><span class="m-sens-coeff" style="background:${blockInfo.color}">${simCoeffVal}</span>` : ''}
      </div>
      ${subInfo || ''}
      <div class="m-sens-top-label">如果有變化，就會影響${blockInfo.label}係數的重要部位</div>
      ${listHtml}
    </div>
  `;
}

export function renderAutoSens() {
  const result = _runFullSensSim();
  if (!result) {
    return `<div class="m-sens-empty">請先在「輸入」分頁填寫觀察題</div>`;
  }

  let html = '';
  html += `<div class="m-sens-subtitle">基於觀察答題逐題模擬翻轉 + 5 輪貪婪累積，演算法跟桌機一致</div>`;

  // 先天區塊（含老闆/主管子係數）
  const innateSubInfo = `
    <div class="m-sens-sub">
      <span class="m-sens-sub-item"><b>老闆</b> ${result.bossCoeff}${result.simBossCoeffVal ? ' → <b>' + result.simBossCoeffVal + '</b>' : ''}</span>
      <span class="m-sens-sub-item"><b>主管</b> ${result.mgrCoeff}${result.simMgrCoeffVal ? ' → <b>' + result.simMgrCoeffVal + '</b>' : ''}</span>
    </div>
  `;
  html += _renderAutoBlock(AUTO_BLOCKS_INFO[0], result.innateTop5, result.innateCoeff, result.simInnateCoeffVal, innateSubInfo);
  html += _renderAutoBlock(AUTO_BLOCKS_INFO[1], result.luckTop5,   result.luckCoeff,   result.luckSimCoeffVal,   '');
  html += _renderAutoBlock(AUTO_BLOCKS_INFO[2], result.postTop5,   result.postCoeff,   result.postSimCoeffVal,   '');
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
    const dimSeen = {};
    const dimsToFix = [];
    actualFlips.forEach(a => {
      if (!dimSeen[a.dimIndex]) { dimSeen[a.dimIndex] = true; dimsToFix.push(DIMS[a.dimIndex].dn); }
    });
    const partsToFix = top3.map(([pi]) => PART_LABELS[parseInt(pi)]);
    const dimText = dimsToFix.slice(0, 3).join('、') + (dimsToFix.length > 3 ? ' 等' : '');
    advice = `<div class="m-sens-advice">建議從 <b>${partsToFix.join('、')}</b> 開始思考${block.label}係數調整<br><span class="m-sens-advice-dim">涉及維度:${dimText}</span></div>`;
  }

  // 顴建議
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
