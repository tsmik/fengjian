const admin = require('firebase-admin');

// 初始化兩個 Firebase admin app
const prodApp = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'renxiangbingfa'
}, 'prod');

const stagingApp = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'renxiangbingfa-staging'
}, 'staging');

const prodDb = prodApp.firestore();
const stagingDb = stagingApp.firestore();

const STAGING_ADMIN_UID = 'ARGLfFp3HqbWMtN7CAoAxR4rHhm1';

async function copySettings() {
  console.log('📋 複製 settings collection...');
  const docs = ['rules', 'questions', 'liunian', 'analysis_prompt'];
  for (const docId of docs) {
    const doc = await prodDb.collection('settings').doc(docId).get();
    if (doc.exists) {
      await stagingDb.collection('settings').doc(docId).set(doc.data());
      console.log(`  ✅ settings/${docId}`);
    } else {
      console.log(`  ⚠️ settings/${docId} 在 production 不存在，跳過`);
    }
  }
}

async function copyAllowedUsers() {
  console.log('📋 複製 allowedUsers collection...');
  const snap = await prodDb.collection('allowedUsers').get();
  let count = 0;
  for (const doc of snap.docs) {
    await stagingDb.collection('allowedUsers').doc(doc.id).set(doc.data());
    count++;
  }
  console.log(`  ✅ ${count} 筆白名單已複製`);
}

async function createStagingAdminUser() {
  console.log('📋 建立 staging admin user doc...');
  await stagingDb.collection('users').doc(STAGING_ADMIN_UID).set({
    role: 'admin',
    displayName: 'Mike (staging admin)',
    email: 'chaojentseng@gmail.com',
    createdAt: new Date().toISOString(),
    note: 'staging 環境的 admin user，用於通過 firestore rules 的 role 檢查'
  }, { merge: true });
  console.log(`  ✅ users/${STAGING_ADMIN_UID} 已建立 + role:admin`);
}

async function main() {
  try {
    await copySettings();
    await copyAllowedUsers();
    await createStagingAdminUser();
    console.log('\n🎉 staging 初始化完成！');
    process.exit(0);
  } catch (err) {
    console.error('❌ 失敗：', err);
    process.exit(1);
  }
}

main();
