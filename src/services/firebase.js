const admin = require("firebase-admin");
const dotenv = require("dotenv");

dotenv.config();
if (!process.env.FIREBASE_SERVICE_KEY)
  throw new Error("FIREBASE_SERVICE_KEY missing");

if (!process.env.FIREBASE_STORAGE_BUCKET)
  throw new Error("FIREBASE_STORAGE_BUCKET missing");

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
} catch (err) {
  throw new Error("Invalid FIREBASE_SERVICE_KEY JSON");
}
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  console.log("Firebase Admin Initialized");
}
const db = admin.firestore();          
const bucket = admin.storage().bucket();
console.log("Bucket:", process.env.FIREBASE_STORAGE_BUCKET);
console.log("Bucket Object:", bucket.name);
   
module.exports = { admin, db, bucket };
