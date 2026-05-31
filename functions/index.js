// /**
//  * Import function triggers from their respective submodules:
//  *
//  * const {onCall} = require("firebase-functions/v2/https");
//  * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
//  *
//  * See a full list of supported triggers at https://firebase.google.com/docs/functions
//  */

// const {setGlobalOptions} = require("firebase-functions");
// const {onRequest} = require("firebase-functions/https");
// const logger = require("firebase-functions/logger");

// // For cost control, you can set the maximum number of containers that can be
// // running at the same time. This helps mitigate the impact of unexpected
// // traffic spikes by instead downgrading performance. This limit is a
// // per-function limit. You can override the limit for each function using the
// // `maxInstances` option in the function's options, e.g.
// // `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// // NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// // functions should each use functions.runWith({ maxInstances: 10 }) instead.
// // In the v1 API, each function can only serve one request per container, so
// // this will be the maximum concurrent request count.
// setGlobalOptions({ maxInstances: 10 });

// // Create and deploy your first functions
// // https://firebase.google.com/docs/functions/get-started

// // exports.helloWorld = onRequest((request, response) => {
// //   logger.info("Hello logs!", {structuredData: true});
// //   response.send("Hello from Firebase!");
// // });

//==========================
//CODE START
//==========================
// ===============================
// IMPORTS (ONLY ONCE)
// ===============================


const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { onCall } = require("firebase-functions/v2/https");
admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_PASSWORD
  }
});

const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted
} = require("firebase-functions/v2/firestore");

const { setGlobalOptions } = require("firebase-functions/v2");

// ===============================
// GLOBAL OPTIONS
// ===============================

// FORCE region (VERY IMPORTANT)
setGlobalOptions({ region: "asia-south1" });

// ===============================
// FIRESTORE INSTANCE
// ===============================

const db = admin.firestore();



//delete trigger
// COMMON FUNCTION (REUSABLE)
async function recalculateStep(serviceId) {

  const mediaSnap = await db
  
    .collection("services")
    .doc(serviceId)
    .collection("media")
    .get();

  let hasBefore = false, hasDuring = false, hasAfter = false;
  let photoCount = 0, videoCount = 0;  // ✅ ADD counters

  mediaSnap.forEach(doc => {
    const data = doc.data();
    const stage = data.stage;
    const type = data.type; // "photo" or "video"

    if (stage === "before") hasBefore = true;
    if (stage === "during") hasDuring = true;
    if (stage === "after") hasAfter = true;

    // ✅ count by type
    if (type === "photo") photoCount++;
    if (type === "video") videoCount++;
  });

  let newStep = "before";
  let hasMedia = mediaSnap.size > 0;

  if (hasBefore) {
    newStep = "before";
    if (hasDuring) {
      newStep = "during";
      if (hasAfter) newStep = "after";
    }
  }

  const mediaSummary = {
    photoCount,
    videoCount,
    lastUploadAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // ✅ Update service doc
  await db.doc(`services/${serviceId}`).update({
    mediaStage: newStep,
    hasMedia,
    mediaUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    mediaSummary  // ✅ ADD to service doc too
  });

  // ✅ Update jobCard — find it by serviceId
  const jobSnap = await db
    .collection("jobCards")
    .where("serviceId", "==", serviceId)
    .limit(1)
    .get();

  if (!jobSnap.empty) {
    await jobSnap.docs[0].ref.update({ mediaSummary });
  }

  console.log("STEP RECALCULATED:", newStep, mediaSummary);
}

// 🔥 ON UPLOAD
exports.onMediaCreate = onDocumentCreated(
  "services/{serviceId}/media/{mediaId}",
  async (event) => {
    const { serviceId } = event.params;

    console.log("MEDIA CREATED:", serviceId);

    await recalculateStep(serviceId);
  }
);

// 🔥 ON DELETE
exports.onMediaDelete = onDocumentDeleted(
  "services/{serviceId}/media/{mediaId}",
  async (event) => {
    const { serviceId } = event.params;

    console.log("MEDIA DELETED:", serviceId);

    await recalculateStep(serviceId);
  }
);

/**
 * ✅ Prevent completion without media
 */
exports.guardServiceCompletion = onDocumentUpdated(
  "services/{serviceId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Only react when status becomes completed
    if (
      before.serviceStatus !== "completed" &&
      after.serviceStatus === "completed"
    ) {
      if (!before.hasMedia) {
        // ❌ Revert completion if no media
        await event.data.after.ref.update({
          serviceStatus: "assigned",
          completedAt: null,
        });
      }
    }
  }
);

exports.createMechanicAndSendEmail = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {

  const { name, email, serviceCenterId } = request.data;

   if (!name || !email || !serviceCenterId) {
    throw new Error("Missing required fields");
  }

  let userRecord;

try {
  userRecord = await admin.auth().createUser({
    email,
    password: "Temp@1234"
  });

  console.log("New user created");

} catch (error) {

  if (error.code === "auth/email-already-exists") {

    console.log("User already exists, fetching existing user...");
    userRecord = await admin.auth().getUserByEmail(email);

  } else {
    throw error;
  }
}

// 🔥 IMPORTANT: THIS RUNS FOR BOTH CASES

// 2️⃣ SAVE IN FIRESTORE
await db.collection("users").doc(userRecord.uid).set({
  name,
  email,
  role: "mechanic",
  serviceCenterId,
   mechanicJoinStatus: request.data.mechanicJoinStatus || "pending",
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  mustResetPassword: true
});

// 3️⃣ LOCK EMAIL
await db.collection("unique_emails").doc(email).set({
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  serviceCenterId
});

// 4️⃣ GENERATE RESET LINK
const resetLink = await admin.auth().generatePasswordResetLink(email);

// DEBUG
console.log("EMAIL USED:", process.env.GMAIL_EMAIL);
console.log("PASSWORD EXISTS:", !!process.env.GMAIL_PASSWORD);

// 5️⃣ SEND EMAIL
await transporter.sendMail({
  from: `"Car Service App" <autocare247.app@gmail.com>`,
  to: email,
  subject: "You have been added as a Mechanic",
  html: `
    <h2>Welcome to AutoCare247 Car Service System</h2>
    <p>Hello ${name},</p>
    <p>You have been added as a <b>Mechanic</b>.</p>

    <p>Please set your password using the link below:</p>
    <a href="${resetLink}">Set Password</a>

    <p>This link may expire soon. Use 'Forgot Password' if needed.</p>

    <br>
    <p>Regards,<br>AutoCare247 Car Service Team</p>
  `
});

return { success: true };
});

//password changed alert function

exports.sendPasswordChangedEmail = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {

    if (!request.auth) {
      throw new Error("Unauthorized");
    }

    const user =
    await admin.auth().getUser(
      request.auth.uid
    );

    await transporter.sendMail({

      from:
      `"AutoCare247 Security" <autocare247.app@gmail.com>`,

      to: user.email,

      subject: "Your Password Was Changed",

      html: `
        <div style="font-family:Arial;padding:20px;">

          <h2 style="color:#6d5dfc;">
            Password Updated Successfully
          </h2>

          <p>Hello,</p>

          <p>
            Your AutoCare247 account password
            has been changed successfully.
          </p>

          <p>
            If this action was not performed by you,
            reset your password immediately.
          </p>

          <br>

          <p>
            Regards,<br>
            AutoCare247 Security Team
          </p>

        </div>
      `
    });

    return {
      success: true
    };

  }
);

//email verification mail send trigger function

exports.sendVerificationEmail = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {

    if (!request.auth) {
      throw new Error("Unauthorized");
    }

    const uid = request.auth.uid;

    const user =
    await admin.auth().getUser(uid);

    if (user.emailVerified) {

      return {
        success: false,
        message: "Email already verified"
      };

    }

    const verificationLink =
    await admin
    .auth()
    .generateEmailVerificationLink(
      user.email
    );

    await transporter.sendMail({

      from:
      `"AutoCare247" <autocare247.app@gmail.com>`,

      to: user.email,

      subject:
      "Verify Your Email",

      html: `
        <h2>Email Verification</h2>

        <p>Hello ${user.displayName || "User"},</p>

        <p>Please verify your email:</p>

        <a href="${verificationLink}">
          Verify Email
        </a>

        <br><br>

        <p>
          AutoCare247 Team
        </p>
      `
    });

    return {
      success: true
    };

  }
);

//email verfication alert function

exports.sendEmailVerifiedSuccessEmail = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {

    if (!request.auth) {
      throw new Error("Unauthorized");
    }

    const user =
    await admin.auth().getUser(
      request.auth.uid
    );

    if (!user.emailVerified) {
      throw new Error("Email not verified yet");
    }

    await transporter.sendMail({

      from:
      `"AutoCare247 Security" <autocare247.app@gmail.com>`,

      to: user.email,

      subject: "Email Verified Successfully",

      html: `
        <div style="font-family:Arial;padding:20px;">

          <h2 style="color:#22c55e;">
            Email Verified Successfully
          </h2>

          <p>Hello,</p>

          <p>
            Your email address has been verified successfully.
          </p>

          <p>
            Your AutoCare247 account now has
            full verification enabled.
          </p>

          <br>

          <p>
            Regards,<br>
            AutoCare247 Security Team
          </p>

        </div>
      `
    });

    return {
      success: true
    };

  }
);

//logout all devices function

exports.logoutAllDevices = onCall(
  async (request) => {

    if (!request.auth) {
      throw new Error("Unauthorized");
    }

    const uid =
    request.auth.uid;

    // revoke all refresh tokens
    await admin
    .auth()
    .revokeRefreshTokens(uid);

    return {
      success: true
    };

  }
);

// ✅ Approve cancel request — deletes all media + marks cancelled
exports.approveCancelRequest = onCall(async (request) => {
  if (!request.auth) throw new Error("Unauthorized");

  const { serviceId, jobId, adminNote } = request.data;
  const storage = admin.storage();

  // 1. Delete all files from Storage
  const [files] = await storage.bucket()
    .getFiles({ prefix: `services/${serviceId}/media/` });
  await Promise.all(files.map(f => f.delete().catch(() => {})));

  // 2. Delete media docs from Firestore
  const mediaDocs = await db
    .collection("services").doc(serviceId)
    .collection("media").get();
  await Promise.all(mediaDocs.docs.map(d => d.ref.delete()));

  // 3. Mark service as cancelled
  await db.doc(`services/${serviceId}`).update({
    serviceStatus: "cancelled",
    cancelApproved: true,
    cancelledBy: request.auth.uid,
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    adminCancelNote: adminNote || "",
    cancelRequested: false,
    liveEnabled: false
  });

  // 4. Mark jobCard as cancelled
  await db.doc(`jobCards/${jobId}`).update({
    status: "cancelled",
    cancelApproved: true,
    cancelledAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

// ✅ Reject cancel request — repair continues, note sent to mechanic
exports.rejectCancelRequest = onCall(async (request) => {
  if (!request.auth) throw new Error("Unauthorized");

  const { serviceId, jobId, rejectionNote } = request.data;

  await db.doc(`services/${serviceId}`).update({
    cancelRequested: false,
    cancelRejectedAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelRejectedBy: request.auth.uid,
    cancelRejectionNote: rejectionNote || "",
    history: admin.firestore.FieldValue.arrayUnion({
      action: "cancel_rejected",
      note: rejectionNote,
      by: request.auth.uid,
      at: new Date()
    })
  });

  await db.doc(`jobCards/${jobId}`).update({
    cancelRequested: false,
    cancelRejectedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});