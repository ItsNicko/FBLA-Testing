/*
  Backfill publicProfiles/{uid} from existing `accounts/{uid}` documents.

  Usage:
    1. Place a service account JSON at `./serviceAccountKey.json` (from Firebase Console -> Project Settings -> Service accounts).
    2. Install dependencies: `npm install firebase-admin`
    3. Run: `node scripts/backfill_public_profiles.js`

  This script copies safe public fields (username, avatarUrl, achievements summary, tests summary)
  into a `publicProfiles/{uid}` document for each user. Run this from a trusted environment.
*/

const admin = require('firebase-admin');
const fs = require('fs');

if (!fs.existsSync('./serviceAccountKey.json')) {
  console.error('serviceAccountKey.json not found. Place your service account key at ./serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function backfill() {
  console.log('Starting backfill of publicProfiles...');
  const accountsSnap = await db.collection('accounts').get();
  console.log(`Found ${accountsSnap.size} accounts`);
  let count = 0;
  for (const doc of accountsSnap.docs) {
    const uid = doc.id;
    const acc = doc.data() || {};
    const publicData = {};
    if (acc.username) publicData.username = acc.username;
    if (acc.avatarUrl) publicData.avatarUrl = acc.avatarUrl;
    // include lightweight summaries only
    if (acc.achievements) publicData.achievements = acc.achievements;
    if (acc.tests) publicData.tests = acc.tests;
    publicData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    if (Object.keys(publicData).length > 0) {
      await db.collection('publicProfiles').doc(uid).set(publicData, { merge: true });
      console.log('Backfilled', uid);
      count++;
    }
  }
  console.log(`Backfill finished. Updated ${count} publicProfiles.`);
}

backfill().catch((err) => { console.error('Backfill error', err); process.exit(1); });
