// scripts/lib/ruleset-diff.js — 純函式:比對兩份套裝內容(舊/新)→ 產生 updateLog(紅點記號)。
// 供 promote-p2-to-prod.js 在「發布到正式」時算出哪些部位/題目/維度變了。
// key 形狀比照前台查詢(p2/app/js/m_badge.js + m_input.js):
//   part_{部位}         部位層
//   q_{部位}_{obsId}    題目層（前台 q.id = observation 的 obsId）
//   dim_{維度名}        維度規則層
// node 可單測（無 firebase 依賴）。

// 題目「內容簽章」:這些欄位任一改了 → 算「這題變了」
function qSig(o) {
  o = o || {};
  return JSON.stringify({
    label: o.label || '',
    section: o.section || '',
    paired: !!o.paired,
    options: o.options || [],
    optionHints: o.optionHints || {},
    note: o.note || ''
  });
}

// 維度「內容簽章」:除身分欄位(index/name),其餘(規則 parts、極性設定…)有變就算變
function dimSig(d) {
  const c = Object.assign({}, d || {});
  delete c.dimIndex; delete c.dimName;
  return JSON.stringify(c);
}

// oldC / newC 皆為 { obs:{obsId:doc}, dims:{dimName:doc}, partObs:{part:[obsId...]} }
// 回傳 { updateLog:{key:nowISO}, changed:{parts:[],qs:[],dims:[]} }
function diffRuleSets(oldC, newC, nowISO) {
  const now = nowISO || new Date().toISOString();
  const updateLog = {};
  const changedParts = new Set();

  const oldObs = (oldC && oldC.obs) || {}, newObs = (newC && newC.obs) || {};
  // 題目層:新套裝每題 vs 舊套裝同 id（新增或內容改 → 標記）
  for (const id in newObs) {
    const no = newObs[id], oo = oldObs[id];
    if (!oo || qSig(no) !== qSig(oo)) {
      const part = no.part || '';
      updateLog['q_' + part + '_' + id] = now;
      if (part) changedParts.add(part);
    }
  }
  // 部位層:題目組成(哪些 obsId)有增減 → 該部位也算變
  const oldPO = (oldC && oldC.partObs) || {}, newPO = (newC && newC.partObs) || {};
  const allParts = new Set([].concat(Object.keys(oldPO), Object.keys(newPO)));
  allParts.forEach(p => {
    const a = JSON.stringify((oldPO[p] || []).slice().sort());
    const b = JSON.stringify((newPO[p] || []).slice().sort());
    if (a !== b && p) changedParts.add(p);
  });
  changedParts.forEach(p => { updateLog['part_' + p] = now; });

  // 維度層
  const oldD = (oldC && oldC.dims) || {}, newD = (newC && newC.dims) || {};
  const changedDims = [];
  for (const name in newD) {
    if (!oldD[name] || dimSig(newD[name]) !== dimSig(oldD[name])) {
      updateLog['dim_' + name] = now;
      changedDims.push(name);
    }
  }

  return {
    updateLog,
    changed: {
      parts: Array.from(changedParts),
      qs: Object.keys(updateLog).filter(k => k.indexOf('q_') === 0),
      dims: changedDims
    }
  };
}

module.exports = { diffRuleSets, qSig, dimSig };
