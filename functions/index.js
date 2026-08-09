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

// 5. Rate Limiter (Anti-Abuse)
exports.checkRateLimit = functions.https.onCall(async (data, context) => {
  const { action, identifier } = data;
  if (!action || !identifier) {
    throw new functions.https.HttpsError("invalid-argument", "Missing action or identifier.");
  }

  const ip = context.rawRequest.ip || "unknown_ip";
  // We hash the IP to avoid storing raw IPs if privacy is a concern, but for simplicity here we just use it.
  // Rate limit key combines action, identifier, and IP.
  const limitKey = crypto.createHash("sha256").update(`${action}_${identifier}_${ip}`).digest("hex");

  const db = admin.firestore();
  const rateLimitRef = db.collection("rate_limits").doc(limitKey);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(rateLimitRef);
    const now = admin.firestore.Timestamp.now();
    const tenMinutesAgo = new Date(now.toDate().getTime() - 10 * 60000);

    let attempts = 1;

    if (doc.exists) {
      const data = doc.data();
      // If the last attempt was within 10 minutes, increment the counter
      if (data.lastAttempt && data.lastAttempt.toDate() > tenMinutesAgo) {
        attempts = (data.attempts || 0) + 1;
      } else {
        // Reset counter if outside the 10-minute window
        attempts = 1;
      }
    }

    if (attempts > 5) {
      const waitMinutes = Math.pow(2, attempts - 5); // Exponential backoff messaging (informational)
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Too many attempts. Please try again in ${waitMinutes} minutes.`
      );
    }

    transaction.set(rateLimitRef, {
      attempts: attempts,
      lastAttempt: now,
      action: action,
      ip_hash: crypto.createHash("sha256").update(ip).digest("hex") // Store hashed IP instead of raw
    }, { merge: true });

    return { success: true, attemptsRemaining: 5 - attempts };
  });
});

// 6. Create Staff Account (Admin Only)
exports.createStaffAccount = functions.https.onCall(async (data, context) => {
  // Ensure the caller is an authenticated admin
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in to perform this action.");
  }
  
  // Basic security check to see if caller is an admin (super or dept)
  const db = admin.firestore();
  const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
  
  // Note: hardcoded fallback in UI for specific emails; here we just check if they are in 'admins'
  // For maximum security in production, you might also pass the caller's email and check it against ADMIN_EMAILS
  if (!adminDoc.exists) {
    // Check if caller's email is one of the hardcoded super admins
    const callerEmail = context.auth.token.email || "";
    const adminEmails = ['admin@dsu.edu','loganathan@dsu.edu','mloganathan082008@gmail.com','exampro.loganathanm.in@gmail.com'];
    if (!adminEmails.includes(callerEmail.toLowerCase())) {
        throw new functions.https.HttpsError("permission-denied", "You must be an admin to create staff accounts.");
    }
  }

  const { email, password, displayName, uid } = data;
  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "Email is required.");
  }

  try {
    let userRecord;
    try {
        // Always try to fetch existing user by email first
        userRecord = await admin.auth().getUserByEmail(email);
        if (password) {
            userRecord = await admin.auth().updateUser(userRecord.uid, { password: password });
        }
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            // User doesn't exist, create them
            const createParams = {
                email: email,
                displayName: displayName || "Staff Member"
            };
            if (password) createParams.password = password;
            if (uid) createParams.uid = uid; // Only force UID if creating new
            
            userRecord = await admin.auth().createUser(createParams);
        } else {
            throw err;
        }
    }

    return { success: true, uid: userRecord.uid };
  } catch (error) {
    console.error("Error creating/updating staff account:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
