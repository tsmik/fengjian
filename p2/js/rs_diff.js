// p2/js/rs_diff.js — 兩個套裝(版本)的差異比對。純函式、無 DOM，可 node 測試。
// 一條「條件」＝一張卡片(敘述分組)。另提供觀察題層級(把卡片拆成各觀察條件)。
// 載入後的套裝形狀：{ id, name, basedOn, dims: { di: {dimName, targetPoleName, parts:{pn:{cards:[{id,label,role,combos,?}], spice}}} } }
// 注意：combos 在 Firestore 是 [{leaves:[...]}]，這裡都會 unwrap。

function unwrapCombo(cb) { return Array.isArray(cb) ? cb : (cb && Array.isArray(cb.leaves)) ? cb.leaves : []; }
const roleZh = r => (r === 'main' ? '主' : '輔');
function leafText(l) { return Array.isArray(l.match) ? l.match.join('/') : String(l.match == null ? '' : l.match); }
function leafCanon(l) { const m = Array.isArray(l.match) ? [...l.match].sort() : [l.match]; return (l.ref || '') + '|' + m.join(','); }

// 一張卡片所有 combo 的人話：combo 內葉以「且」、combo 間以「或」
export function cardCombosText(card) {
  const t = (card.combos || []).map(cb => unwrapCombo(cb).map(leafText).join(' 且 ')).filter(Boolean);
  return t.join('　或　');
}
// 卡片條件正規化字串（順序無關）用來判斷有沒有變
export function comboCanon(card) {
  const combos = (card.combos || []).map(cb => unwrapCombo(cb).map(leafCanon).sort());
  combos.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  return JSON.stringify(combos);
}
// 一張卡片用到的觀察條件集合（拆到觀察題用），canon → 顯示字
function leafSet(card) {
  const m = {};
  (card.combos || []).forEach(cb => unwrapCombo(cb).forEach(l => { m[leafCanon(l)] = leafText(l); }));
  return m;
}

function matchCards(aCards, bCards) {
  const matched = [], onlyA = [], onlyB = [], usedB = new Set();
  const byId = new Map(), byLabel = new Map();
  bCards.forEach((c, i) => { if (c.id) byId.set(c.id, i); if (c.label && !byLabel.has(c.label)) byLabel.set(c.label, i); });
  aCards.forEach(a => {
    let j = -1;
    if (a.id != null && byId.has(a.id) && !usedB.has(byId.get(a.id))) j = byId.get(a.id);
    else if (a.label && byLabel.has(a.label) && !usedB.has(byLabel.get(a.label))) j = byLabel.get(a.label);
    if (j >= 0) { usedB.add(j); matched.push([a, bCards[j]]); } else onlyA.push(a);
  });
  bCards.forEach((b, i) => { if (!usedB.has(i)) onlyB.push(b); });
  return { matched, onlyA, onlyB };
}

export function relationship(A, B) {
  if (B.basedOn && B.basedOn === A.id) return 'B 是從 A 複製後修改的（同源）';
  if (A.basedOn && A.basedOn === B.id) return 'A 是從 B 複製後修改的（同源）';
  if (A.basedOn && B.basedOn && A.basedOn === B.basedOn) return '兩者複製自同一個母版（同源）';
  return '兩者各自獨立（無複製關係）';
}

export function diffSets(A, B) {
  const conditionDiffs = [], obsDiffs = [], spiceDiffs = [], poleDiffs = [];
  let aCount = 0, bCount = 0; const aParts = new Set(), bParts = new Set();
  for (let di = 0; di < 13; di++) {
    const ad = A.dims[di], bd = B.dims[di];
    const dimName = (bd && bd.dimName) || (ad && ad.dimName) || ('維度' + di);
    // 目標極
    const ap = ad && ad.targetPoleName, bp = bd && bd.targetPoleName;
    if ((ap || bp) && ap !== bp) poleDiffs.push({ dim: dimName, from: ap || '（未設）', to: bp || '（未設）' });
    // 部位
    const parts = new Set([...(ad ? Object.keys(ad.parts || {}) : []), ...(bd ? Object.keys(bd.parts || {}) : [])]);
    parts.forEach(pn => {
      const aP = ad && ad.parts && ad.parts[pn], bP = bd && bd.parts && bd.parts[pn];
      const aCards = (aP && aP.cards) || [], bCards = (bP && bP.cards) || [];
      aCount += aCards.length; bCount += bCards.length;
      if (aCards.length) aParts.add(di + pn); if (bCards.length) bParts.add(di + pn);
      // 辣度（部位層）
      const aSp = (aP && aP.spice) || {}, bSp = (bP && bP.spice) || {};
      ['完整', '大辣', '中辣', '小辣'].forEach(lv => {
        const av = aSp[lv], bv = bSp[lv];
        if ((av == null ? null : av) !== (bv == null ? null : bv)) spiceDiffs.push({ dim: dimName, part: pn, level: lv, from: av == null ? '（預設全中）' : av, to: bv == null ? '（預設全中）' : bv });
      });
      // 卡片配對
      const { matched, onlyA, onlyB } = matchCards(aCards, bCards);
      onlyA.forEach(c => {
        conditionDiffs.push({ type: 'remove', dim: dimName, part: pn, label: c.label || '（未命名）', role: roleZh(c.role), detail: cardCombosText(c) });
        Object.values(leafSet(c)).forEach(t => obsDiffs.push({ type: 'remove', dim: dimName, part: pn, card: c.label || '（未命名）', cond: t }));
      });
      onlyB.forEach(c => {
        conditionDiffs.push({ type: 'add', dim: dimName, part: pn, label: c.label || '（未命名）', role: roleZh(c.role), detail: cardCombosText(c) });
        Object.values(leafSet(c)).forEach(t => obsDiffs.push({ type: 'add', dim: dimName, part: pn, card: c.label || '（未命名）', cond: t }));
      });
      matched.forEach(([a, b]) => {
        const roleChg = (a.role || null) !== (b.role || null);
        const comboChg = comboCanon(a) !== comboCanon(b);
        if (roleChg || comboChg) {
          const detail = [];
          if (roleChg) detail.push('角色 ' + roleZh(a.role) + '→' + roleZh(b.role));
          if (comboChg) detail.push('條件 ' + (cardCombosText(a) || '（空）') + ' → ' + (cardCombosText(b) || '（空）'));
          conditionDiffs.push({ type: 'change', dim: dimName, part: pn, label: b.label || a.label || '（未命名）', detail: detail.join('；') });
        }
        // 觀察題層級：比較兩卡的觀察條件集合
        const aL = leafSet(a), bL = leafSet(b);
        Object.keys(aL).forEach(k => { if (!(k in bL)) obsDiffs.push({ type: 'remove', dim: dimName, part: pn, card: b.label || a.label, cond: aL[k] }); });
        Object.keys(bL).forEach(k => { if (!(k in aL)) obsDiffs.push({ type: 'add', dim: dimName, part: pn, card: b.label || a.label, cond: bL[k] }); });
      });
    });
  }
  const order = { add: 0, remove: 1, change: 2 };
  conditionDiffs.sort((x, y) => order[x.type] - order[y.type]);
  const summary = {
    cardsAdded: conditionDiffs.filter(d => d.type === 'add').length,
    cardsRemoved: conditionDiffs.filter(d => d.type === 'remove').length,
    cardsChanged: conditionDiffs.filter(d => d.type === 'change').length,
    spiceDiffs: spiceDiffs.length, poleDiffs: poleDiffs.length,
    aCount, bCount, aParts: aParts.size, bParts: bParts.size
  };
  return { relationship: relationship(A, B), summary, conditionDiffs, obsDiffs, spiceDiffs, poleDiffs };
}

// 題庫（觀察題）層級差異：兩套裝各自的 observations 比對（新增/刪除/改題目或選項）
export function diffObsLib(aObs, bObs) {
  aObs = aObs || {}; bObs = bObs || {};
  const added = [], removed = [], changed = [];
  const optStr = o => ((o && o.options) || []).join('／');
  const ids = new Set([...Object.keys(aObs), ...Object.keys(bObs)]);
  ids.forEach(id => {
    const a = aObs[id], b = bObs[id];
    if (a && !b) { removed.push({ id, label: a.label || '', part: a.part || '' }); return; }
    if (!a && b) { added.push({ id, label: b.label || '', part: b.part || '' }); return; }
    if (a.label !== b.label || optStr(a) !== optStr(b)) {
      changed.push({ id, part: b.part || a.part || '', aLabel: a.label || '', bLabel: b.label || '', aOpts: optStr(a), bOpts: optStr(b) });
    }
  });
  return { added, removed, changed };
}
