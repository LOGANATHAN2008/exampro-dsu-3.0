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
    let code = "unknown";
    let msg = (error && error.message) ? error.message : "Unknown error";
    
    if (error && typeof error.code === 'string') {
        if (error.code.startsWith('auth/')) {
            code = "invalid-argument";
        } else {
            // HttpsError requires specific error code strings. Fallback to unknown if not valid.
            code = "unknown";
        }
    }
    
    throw new functions.https.HttpsError(code, msg);
  }
});

// 7. Push Notification for Incoming Calls
exports.onCallCreated = functions.firestore
    .document('calls/{callId}')
    .onCreate(async (snap, context) => {
        const callData = snap.data();
        if (!callData || !callData.calleeUID) return null;

        const calleeUID = callData.calleeUID;
        const callerName = callData.callerName || "Someone";
        const callType = callData.type || "video";

        const db = admin.firestore();
        const tokenDoc = await db.collection("fcmTokens").doc(calleeUID).get();
        if (!tokenDoc.exists) return null;

        const fcmToken = tokenDoc.data().token;
        if (!fcmToken) return null;

        const payload = {
            token: fcmToken,
            notification: {
                title: `Incoming ${callType} call...`,
                body: `${callerName} is calling you. Tap to open ExamPro DSU.`
            },
            data: {
                click_action: "FLUTTER_NOTIFICATION_CLICK", // for flutter compat if needed
                type: "call",
                callId: context.params.callId
            }
        };

        try {
            await admin.messaging().send(payload);
            console.log("Call push notification sent to", calleeUID);
        } catch (error) {
            console.error("Error sending call push notification:", error);
        }
    });

// 8. Push Notification for New Chat Messages
exports.onMessageSent = functions.firestore
    .document('chats/{chatId}')
    .onUpdate(async (change, context) => {
        const newValue = change.after.data();
        const previousValue = change.before.data();
        
        // Only trigger if lastMessage was updated
        if (newValue.lastMessage === previousValue.lastMessage) return null;
        
        const senderId = newValue.lastMessageSenderId;
        if (!senderId) return null;

        const senderName = newValue.lastMessageSenderName || "User";
        const messageText = newValue.lastMessage || "Sent a message";
        const participants = newValue.participants || [];

        const db = admin.firestore();
        
        // Get tokens for all participants EXCEPT the sender
        const tokensToNotify = [];
        
        for (const uid of participants) {
            if (uid === senderId) continue;
            
            const tokenDoc = await db.collection("fcmTokens").doc(uid).get();
            if (tokenDoc.exists && tokenDoc.data().token) {
                tokensToNotify.push(tokenDoc.data().token);
            }
        }

        if (tokensToNotify.length === 0) return null;

        const payload = {
            notification: {
                title: `ExamPro DSU: ${senderName}`,
                body: messageText
            },
            data: {
                type: "chat",
                chatId: context.params.chatId
            }
        };

        try {
            const response = await admin.messaging().sendEachForMulticast({
                tokens: tokensToNotify,
                ...payload
            });
            console.log("Chat push notification sent:", response.successCount, "successful");
        } catch (error) {
            console.error("Error sending chat push notification:", error);
        }
    });

