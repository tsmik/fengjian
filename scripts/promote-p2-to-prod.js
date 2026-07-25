// scripts/promote-p2-to-prod.js — 把 rbf2app-staging 目前上線套裝(config/active 指到的 ruleSet)+ config
// 複製到 rbf2app(正式)。只搬「學員前台跑得動」需要的東西,不搬 admin2 專用的根層 observations 題庫、
// 也不搬 users/allowedUsers(正式站學員名單由 Mike 另外決定)。
// 用法：node scripts/promote-p2-to-prod.js
const admin = require('firebase-admin');

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

async function main() {
  console.log('📋 讀 staging config/active...');
  const activeSnap = await stagingDb.doc('config/active').get();
  if (!activeSnap.exists) throw new Error('staging config/active 不存在,無法判斷要搬哪個套裝');
  const activeId = activeSnap.data().activeRuleSetId;
  if (!activeId) throw new Error('config/active 沒有 activeRuleSetId');
  console.log(`  上線套裝 id = ${activeId}`);

  console.log('📋 複製 config/*...');
  for (const docId of ['active', 'board', 'liunian']) {
    await copyDoc(stagingDb.doc(`config/${docId}`), prodDb.doc(`config/${docId}`));
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

  console.log('\n🎉 P2 正式站(rbf2app)資料搬遷完成！');
  console.log('   未搬：根層 observations(admin2 題庫,正式站前台不讀)、users、allowedUsers(名單由 Mike 決定)。');
  process.exit(0);
}

main().catch(err => { console.error('❌ 失敗：', err); process.exit(1); });
