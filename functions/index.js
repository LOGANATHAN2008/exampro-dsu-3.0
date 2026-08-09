const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

// 1. Exchange QR Session for a Custom Auth Token
exports.exchangeQrSession = functions.https.onCall(async (data, context) => {
  const { sessionId, localSecret } = data;
  if (!sessionId || !localSecret) {
    throw new functions.https.HttpsError("invalid-argument", "Missing session ID or secret.");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("qrSessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(sessionRef);
    if (!doc.exists) {
      throw new functions.https.HttpsError("not-found", "Session not found.");
    }

    const sessionData = doc.data();

    // Check expiration
    if (sessionData.expiresAt && sessionData.expiresAt.toDate() < new Date()) {
      transaction.update(sessionRef, { status: "expired" });
      throw new functions.https.HttpsError("failed-precondition", "Session expired.");
    }

    // Must be approved by the mobile app first
    if (sessionData.status !== "approved") {
      throw new functions.https.HttpsError("failed-precondition", "Session is not approved.");
    }

    // Verify local secret hash to ensure this is the exact browser that requested it
    const expectedHash = crypto.createHash("sha256").update(localSecret).digest("hex");
    if (sessionData.secretHash !== expectedHash) {
      throw new functions.https.HttpsError("permission-denied", "Secret mismatch.");
    }

    // Mint custom token
    const customToken = await admin.auth().createCustomToken(sessionData.uid);

    // Invalidate session to prevent reuse
    transaction.update(sessionRef, { status: "exchanged" });

    return { token: customToken };
  });
});

// 2. Approve QR Session (Called from Mobile App)
exports.approveQrSession = functions.https.onCall(async (data, context) => {
  // Must be authenticated on the mobile app
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in to approve a session.");
  }

  const { sessionId } = data;
  if (!sessionId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing session ID.");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("qrSessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(sessionRef);
    if (!doc.exists) {
      throw new functions.https.HttpsError("not-found", "Session not found.");
    }

    const sessionData = doc.data();

    if (sessionData.status !== "pending") {
      throw new functions.https.HttpsError("failed-precondition", `Cannot approve session in state: ${sessionData.status}`);
    }

    if (sessionData.expiresAt && sessionData.expiresAt.toDate() < new Date()) {
      transaction.update(sessionRef, { status: "expired" });
      throw new functions.https.HttpsError("failed-precondition", "Session expired.");
    }

    transaction.update(sessionRef, {
      status: "approved",
      uid: context.auth.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  });
});

// 3. Deny QR Session (Called from Mobile App)
exports.denyQrSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
  }

  const { sessionId } = data;
  if (!sessionId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing session ID.");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("qrSessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(sessionRef);
    if (!doc.exists) {
      throw new functions.https.HttpsError("not-found", "Session not found.");
    }

    const sessionData = doc.data();
    if (sessionData.status !== "pending") {
      throw new functions.https.HttpsError("failed-precondition", `Cannot deny session in state: ${sessionData.status}`);
    }

    transaction.update(sessionRef, { status: "denied" });

    return { success: true };
  });
});

// 4. Securely lookup email for login via Reg No / Phone
exports.getLoginEmail = functions.https.onCall(async (data, context) => {
  const { identifier } = data;
  if (!identifier) {
    throw new functions.https.HttpsError("invalid-argument", "Missing identifier.");
  }
  
  const raw = identifier.trim().toLowerCase();
  const cleanDigits = raw.replace(/\D/g, '');
  const db = admin.firestore();
  
  const queries = [];
  const regCandidates = [raw, raw.toUpperCase()];
  const regFields = ['registerNumber', 'usn', 'regNo', 'regno', 'studentId'];
  
  for (const field of regFields) {
      for (const candidate of regCandidates) {
          queries.push(db.collection('students').where(field, '==', candidate).get());
      }
  }
  
  if (cleanDigits.length >= 8) {
      const phoneVariations = [
          cleanDigits,
          `+91${cleanDigits.slice(-10)}`,
          cleanDigits.slice(-10)
      ];
      for (const phone of phoneVariations) {
          queries.push(db.collection('students').where('phone', '==', phone).get());
      }
  }
  
  const results = await Promise.all(queries);
  const emails = new Set();
  
  results.forEach(snap => {
      snap.forEach(doc => {
          const docData = doc.data();
          if (docData.email) {
              emails.add(docData.email.toLowerCase());
          }
      });
  });
  
  return { emails: Array.from(emails) };
});
