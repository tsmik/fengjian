// p2/js/ruleset_diff.js — 瀏覽器 ES 版:比對兩份套裝內容(舊/新)→ 產生 updateLog(紅點記號)。
// ⚠️ 與 scripts/lib/ruleset-diff.js(node CommonJS 版)邏輯必須一致,兩處都改。
// 供 admin2「發布到正式站」按鈕在瀏覽器內算紅點;key 形狀比照前台 m_badge.js/m_input.js:
//   part_{部位} / q_{部位}_{obsId}(前台 q.id=obsId) / dim_{維度名}

// ⚠️ Firestore 讀回的物件 key 順序不保證(兩專案可不同)。簽章前先深度排序,
// 否則值相同、順序不同會誤判「變了」→ 發布時滿版假紅點(2026-08-08 實測:69 鍵只有 1 個真變動)。
function sortDeep(x) {
  if (Array.isArray(x)) return x.map(sortDeep);
  if (x && typeof x === 'object') { const o = {}; Object.keys(x).sort().forEach(k => { o[k] = sortDeep(x[k]); }); return o; }
  return x;
}
function qSig(o) {
  o = o || {};
  return JSON.stringify(sortDeep({
    label: o.label || '', section: o.section || '', paired: !!o.paired,
    options: o.options || [], optionHints: o.optionHints || {}, note: o.note || ''
  }));
}
function dimSig(d) {
  const c = Object.assign({}, d || {});
  delete c.dimIndex; delete c.dimName;
  return JSON.stringify(sortDeep(c));
}

// oldC / newC = { obs:{obsId:doc}, dims:{dimName:doc}, partObs:{part:[obsId...]} }
export function diffRuleSets(oldC, newC, nowISO) {
  const now = nowISO || new Date().toISOString();
  const updateLog = {};
  const changedParts = new Set();

  const oldObs = (oldC && oldC.obs) || {}, newObs = (newC && newC.obs) || {};
  for (const id in newObs) {
    const no = newObs[id], oo = oldObs[id];
    if (!oo || qSig(no) !== qSig(oo)) {
      const part = no.part || '';
      updateLog['q_' + part + '_' + id] = now;
      if (part) changedParts.add(part);
    }
  }
  const oldPO = (oldC && oldC.partObs) || {}, newPO = (newC && newC.partObs) || {};
  const allParts = new Set([].concat(Object.keys(oldPO), Object.keys(newPO)));
  allParts.forEach(p => {
    const a = JSON.stringify((oldPO[p] || []).slice().sort());
    const b = JSON.stringify((newPO[p] || []).slice().sort());
    if (a !== b && p) changedParts.add(p);
  });
  changedParts.forEach(p => { updateLog['part_' + p] = now; });

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
