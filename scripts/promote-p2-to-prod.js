// scripts/promote-p2-to-prod.js — 把 rbf2app-staging 目前上線套裝(config/active 指到的 ruleSet)+ config
// 複製到 rbf2app(正式)。只搬「學員前台跑得動」需要的東西,不搬 admin2 專用的根層 observations 題庫、
// 也不搬 users/allowedUsers(正式站學員名單由 Mike 另外決定)。
// ＋紅點:發布前先比對「正式站現有內容」vs「即將發布的內容」,把變動處寫進 config/updateLog(學員端紅點來源)。
// 用法：node scripts/promote-p2-to-prod.js
const admin = require('firebase-admin');
const { diffRuleSets } = require('./lib/ruleset-diff.js');

const stagingApp = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'rbf2app-staging' }, 'staging');
const prodApp = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'rbf2app' }, 'prod');
const stagingDb = stagingApp.firestore();
const prodDb = prodApp.firestore();

async function copyDoc(srcRef, dstRef) {
  const snap = await srcRef.get();
  if (!snap.exists) { console.log(`  ⚠️ ${srcRef.path} 不存在,略過`); return; }
  await dstRef.set(snap.data());
  console.log(`  ✅ ${srcRef.path} → ${dstRef.path}`);
}

async function copyCollection(srcColRef, dstColRef) {
  const snap = await srcColRef.get();
  for (const doc of snap.docs) {
    await dstColRef.doc(doc.id).set(doc.data());
  }
  console.log(`  ✅ ${srcColRef.path} (${snap.docs.length} 筆) → ${dstColRef.path}`);
}

// 讀某專案某套裝的內容 → { obs:{obsId:doc}, dims:{dimName:doc}, partObs:{part:[obsId...]} }
async function loadSetContent(db, setId) {
  const [obsSnap, dimSnap] = await Promise.all([
    db.collection(`ruleSets/${setId}/observations`).get(),
    db.collection(`ruleSets/${setId}/dims`).get(),
  ]);
  const obs = {}, partObs = {};
  obsSnap.forEach(d => { const o = d.data(); const id = o.obsId || d.id; obs[id] = o; (partObs[o.part || ''] = partObs[o.part || ''] || []).push(id); });
  const dims = {};
  dimSnap.forEach(d => { const x = d.data(); dims[x.dimName || d.id] = x; });
  return { obs, dims, partObs };
}

async function main() {
  console.log('📋 讀 staging config/active...');
  const activeSnap = await stagingDb.doc('config/active').get();
  if (!activeSnap.exists) throw new Error('staging config/active 不存在,無法判斷要搬哪個套裝');
  const activeId = activeSnap.data().activeRuleSetId;
  if (!activeId) throw new Error('config/active 沒有 activeRuleSetId');
  console.log(`  上線套裝 id = ${activeId}`);

  // ── 紅點:先抓「正式站目前學員看到的內容」當作 OLD（覆蓋前),稍後跟 NEW 比對 ──
  let oldContent = null;
  const prodActiveSnap = await prodDb.doc('config/active').get();
  if (prodActiveSnap.exists && prodActiveSnap.data().activeRuleSetId) {
    const prodOldId = prodActiveSnap.data().activeRuleSetId;
    try { oldContent = await loadSetContent(prodDb, prodOldId); console.log(`  紅點:正式站現有內容 = ${prodOldId}（${Object.keys(oldContent.obs).length} 題）`); }
    catch (e) { console.log('  紅點:讀正式站現有內容失敗,本次不產生紅點', e.message); }
  } else {
    console.log('  紅點:正式站首次發布(無舊內容),本次不產生紅點');
  }

  console.log('📋 複製 config/*...');
  for (const docId of ['active', 'board', 'liunian']) {
    if (docId === 'active') {
      // ⚠️ config/active.updatedAt 一律換成「發布當下」：前台規則快取鎖＝套裝id+updatedAt,
      // 在原上線套裝內改規則(id不變)若沿用舊 updatedAt,學員瀏覽器會繼續用舊快取規則算,報告不更新。
      // 每次發布都 bump → 保證學員重抓新規則。(2026-08-08 修)
      const snap = await stagingDb.doc('config/active').get();
      if (!snap.exists) { console.log('  ⚠️ staging config/active 不存在,略過'); continue; }
      const now = new Date().toISOString();
      await prodDb.doc('config/active').set({ ...snap.data(), updatedAt: now });
      console.log(`  ✅ config/active (updatedAt→${now}) → prod`);
    } else {
      await copyDoc(stagingDb.doc(`config/${docId}`), prodDb.doc(`config/${docId}`));
    }
  }

  console.log(`📋 複製 ruleSets/${activeId} 主文件...`);
  await copyDoc(stagingDb.doc(`ruleSets/${activeId}`), prodDb.doc(`ruleSets/${activeId}`));

  console.log(`📋 複製 ruleSets/${activeId} 子集合(dims/observations/obsmeta)...`);
  for (const sub of ['dims', 'observations', 'obsmeta']) {
    await copyCollection(
      stagingDb.collection(`ruleSets/${activeId}/${sub}`),
      prodDb.collection(`ruleSets/${activeId}/${sub}`)
    );
  }

  // ── 紅點:比對 OLD(正式站原內容) vs NEW(剛發布的內容) → 寫 config/updateLog ──
  if (oldContent) {
    const newContent = await loadSetContent(stagingDb, activeId);
    const { updateLog, changed } = diffRuleSets(oldContent, newContent);
    const nKeys = Object.keys(updateLog).length;
    if (nKeys > 0) {
      await prodDb.doc('config/updateLog').set(updateLog, { merge: true });
      console.log(`\n🔴 紅點:偵測到變動 → 部位 ${changed.parts.length}、題目 ${changed.qs.length}、維度 ${changed.dims.length}(共 ${nKeys} 個記號寫入 config/updateLog）`);
      if (changed.parts.length) console.log('   變動部位:', changed.parts.join('、'));
      if (changed.dims.length) console.log('   變動維度:', changed.dims.join('、'));
    } else {
      console.log('\n🔴 紅點:內容無變動,不寫記號。');
    }
  }

  console.log('\n🎉 P2 正式站(rbf2app)資料搬遷完成！');
  console.log('   未搬：根層 observations(admin2 題庫,正式站前台不讀)、users、allowedUsers(名單由 Mike 決定)。');
  process.exit(0);
}

main().catch(err => { console.error('❌ 失敗：', err); process.exit(1); });
