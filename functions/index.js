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

// Helper: creates transporter at call-time so secrets are injected
function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_EMAIL,
      pass: process.env.GMAIL_PASSWORD
    }
  });
}


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
await createTransporter().sendMail({
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

    await createTransporter().sendMail({

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

    await createTransporter().sendMail({

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

    await createTransporter().sendMail({

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

// ✅ Admin rejects mechanic work — sends back to re-inspection
exports.rejectWork = onCall(async (request) => {
  if (!request.auth) throw new Error("Unauthorized");

  const { serviceId, jobId, rejectionNote } = request.data;

  // Get current job data to read rejection count
  const jobRef = db.doc(`jobCards/${jobId}`);
  const jobSnap = await jobRef.get();
  const currentRejectionCount = (jobSnap.data()?.rejectionCount || 0) + 1;

  const currentRound = (jobSnap.data()?.reInspectionRound || 0) + 1;

await db.doc(`services/${serviceId}`).update({
    serviceStatus: "in_progress",
    currentStep: "re_inspection",
    reInspectionPhotoUploaded: false,
    reInspectionRound: currentRound,
    rejectionHistory: admin.firestore.FieldValue.arrayUnion({
      reason: rejectionNote || "",
      rejectedBy: request.auth.uid,
      rejectedAt: new Date()
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion({
      action: "work_rejected",
      reason: rejectionNote,
      by: request.auth.uid,
      at: new Date()
    })
  });

  await jobRef.update({
    status: "in_progress",
    progress: "re_inspection",
    reInspectionRound: currentRound,   //**
    lastRejectionTime: admin.firestore.FieldValue.serverTimestamp(),
    rejectionCount: currentRejectionCount,
    lastRejectionReason: rejectionNote || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion({
      action: "work_rejected",
      reason: rejectionNote,
      by: request.auth.uid,
      at: new Date()
    })
  });

  return { success: true };
});

// ─── Shared helper to build job/email detail strings ─────────────────────────
async function buildJobDetails(jobId) {
  const jobRef = db.doc(`jobCards/${jobId}`);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) throw new Error("Job not found");
  const jobData = jobSnap.data();
  const serviceId = jobData.serviceId;

  const serviceSnap = await db.doc(`services/${serviceId}`).get();
  const serviceData = serviceSnap.exists ? serviceSnap.data() : {};

  const car = jobData.carSnapshot || {};
  const carInfo = car.brand ? `${car.brand} ${car.model} (${car.carNumber})` : "the vehicle";
  const serviceType   = jobData.serviceType || jobData.reason || serviceData.selectedServiceType || "General Service";
  const serviceCenter = jobData.serviceCenterSnapshot?.name || serviceData.serviceCenterSnapshot?.name || "our service center";
  const serviceLoc    = jobData.serviceCenterSnapshot?.location || serviceData.serviceCenterSnapshot?.city || "";
  const servicePhone  = jobData.serviceCenterSnapshot?.phone || "";
  const startedAt = jobData.createdAt?.toDate
    ? jobData.createdAt.toDate().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "—";

  // Derive approvedAt: prefer top-level field, fallback to history entry
  let approvedAtFromDoc = null;
  if (jobData.approvedAt?.toDate) approvedAtFromDoc = jobData.approvedAt.toDate();
  else if (serviceData.approvedAt?.toDate) approvedAtFromDoc = serviceData.approvedAt.toDate();
  if (!approvedAtFromDoc) {
    const hit = (serviceData.history || []).find(h => h.action === "work_approved" || h.action === "completion_approved");
    if (hit?.at?.toDate) approvedAtFromDoc = hit.at.toDate();
    else if (hit?.at) approvedAtFromDoc = new Date(hit.at);
  }
  const approvedAtStr = approvedAtFromDoc
    ? approvedAtFromDoc.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return { jobRef, jobData, serviceId, serviceData, carInfo, serviceType, serviceCenter, serviceLoc, servicePhone, startedAt, approvedAtStr };
}

// ✅ STEP 1: Admin approves work → status: work_done + mechanic email
exports.approveWork = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {
    if (!request.auth) throw new Error("Unauthorized");
    const { jobId } = request.data;
    if (!jobId) throw new Error("Missing jobId");

    const { jobRef, jobData, serviceId, serviceData, carInfo, serviceType, serviceCenter, startedAt, approvedAtStr } = await buildJobDetails(jobId);

    if (jobData.status !== "pending_approval") throw new Error("Job is not pending approval");

    const approvedAtTs = admin.firestore.FieldValue.serverTimestamp();
    const approvedAtDate = new Date();

    // Update jobCard → work_done + write approvedAt
    await jobRef.update({
    status: "work_done",
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: request.auth.uid,
    history: admin.firestore.FieldValue.arrayUnion({
      action: "completion_approved",
      by: request.auth.uid,
      at: new Date()
    })
  });

    // Update service → work_done + write approvedAt to both top-level and history
    await db.doc(`services/${serviceId}`).update({
      serviceStatus: "work_done",
      approvedAt: approvedAtTs,
      approvedBy: request.auth.uid,
      updatedAt: approvedAtTs,
      history: admin.firestore.FieldValue.arrayUnion({
        action: "work_approved",
        by: request.auth.uid,
        at: approvedAtDate
      })
    });

    // Send mechanic email
    try {
      const mailer = createTransporter();
      let mechEmail = null;
      let mechName = serviceData.mechanicName || "Mechanic";
      if (jobData.mechanicId) {
        const mechSnap = await db.doc(`users/${jobData.mechanicId}`).get();
        if (mechSnap.exists && mechSnap.data().email) { mechEmail = mechSnap.data().email; mechName = mechSnap.data().name || mechName; }
      }
      if (!mechEmail && serviceData.mechanicSnapshot?.email) mechEmail = serviceData.mechanicSnapshot.email;
      console.log("approveWork — mechanic email:", mechEmail);

      if (mechEmail) {
        await mailer.sendMail({
          from: `"AutoCare247 Admin" <autocare247.app@gmail.com>`,
          to: mechEmail,
          subject: `✅ Work Approved — ${carInfo}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:10px;">
              <h2 style="color:#16a34a;">Work Approved! 🎉</h2>
              <p>Hello ${mechName},</p>
              <p>Your service work for <strong>${carInfo}</strong> has been reviewed and approved by the admin.</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
                <tr><td style="padding:8px 0;color:#6b7280;width:150px;">Vehicle</td><td style="font-weight:600;">${carInfo}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">Service Type</td><td style="font-weight:600;">${serviceType}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Service Center</td><td>${serviceCenter}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">Started At</td><td>${startedAt}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Approved At</td><td>${approvedAtStr}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">Status</td><td><span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">Work Done</span></td></tr>
              </table>
              <p style="margin-top:16px;color:#374151;">The job has been moved to your completed history. Great work!</p>
              <p style="color:#9ca3af;font-size:13px;">AutoCare247 Team</p>
            </div>`
        });
        console.log("Mechanic work_done email sent to:", mechEmail);
      }
    } catch (emailErr) {
      console.error("Mechanic email failed:", emailErr);
    }

    return { success: true };
  }
);

// ✅ STEP 2: Admin finalizes → status: completed + customer email
exports.completeServiceFinal = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {
    if (!request.auth) throw new Error("Unauthorized");
    const { jobId } = request.data;
    if (!jobId) throw new Error("Missing jobId");

    const { jobRef, jobData, serviceId, serviceData, carInfo, serviceType, serviceCenter, serviceLoc, servicePhone, startedAt, approvedAtStr: completedAtStr } = await buildJobDetails(jobId);

    if (jobData.status !== "work_done") throw new Error("Job must be in work_done state to finalize");

    const completedAtTs = admin.firestore.FieldValue.serverTimestamp();
    const completedAtDate = new Date();

    // Update jobCard → completed + write completedAt
    await jobRef.update({
      status: "completed",
      progress: "service_complete",
      completedAt: completedAtTs,
      updatedAt: completedAtTs
    });

    // Update service → completed + write completedAt to both top-level and history
    await db.doc(`services/${serviceId}`).update({
      serviceStatus: "completed",
      currentStep: "service_complete",
      completedAt: completedAtTs,
      updatedAt: completedAtTs,
      history: admin.firestore.FieldValue.arrayUnion({
        action: "completion_approved",
        by: request.auth.uid,
        at: completedAtDate
      })
    });

    // Send customer email
    try {
      const mailer = createTransporter();
      let custEmail = null;
      let custName = "Customer";
      if (jobData.ownerId) {
        const custSnap = await db.doc(`users/${jobData.ownerId}`).get();
        if (custSnap.exists && custSnap.data().email) { custEmail = custSnap.data().email; custName = custSnap.data().name || custName; }
      }
      if (!custEmail && serviceData.ownerSnapshot?.email) { custEmail = serviceData.ownerSnapshot.email; custName = serviceData.ownerSnapshot.name || custName; }
      console.log("completeServiceFinal — customer email:", custEmail);

      if (custEmail) {
        await mailer.sendMail({
          from: `"AutoCare247" <autocare247.app@gmail.com>`,
          to: custEmail,
          subject: `🚗 Your Vehicle Service is Complete — ${carInfo}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:10px;">
              <h2 style="color:#16a34a;">Service Completed! ✅</h2>
              <p>Hello ${custName},</p>
              <p>Your vehicle <strong>${carInfo}</strong> has been fully serviced and quality-checked.</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
                <tr><td style="padding:8px 0;color:#6b7280;width:150px;">Vehicle</td><td style="font-weight:600;">${carInfo}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">Service Type</td><td style="font-weight:600;">${serviceType}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Service Center</td><td>${serviceCenter}${serviceLoc ? ` — ${serviceLoc}` : ""}</td></tr>
                ${servicePhone ? `<tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">Contact</td><td>${servicePhone}</td></tr>` : ""}
                <tr><td style="padding:8px 0;color:#6b7280;">Service Started</td><td>${startedAt}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">Completed At</td><td>${completedAtStr}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td><span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">Completed</span></td></tr>
              </table>
              <p style="margin-top:16px;color:#374151;">Your vehicle is ready for pickup. Contact the service center to arrange delivery if needed.</p>
              <p style="color:#374151;">Thank you for choosing <strong>AutoCare247</strong>! 🙏</p>
              <p style="color:#9ca3af;font-size:13px;">AutoCare247 Customer Support</p>
            </div>`
        });
        console.log("Customer completed email sent to:", custEmail);
      }
    } catch (emailErr) {
      console.error("Customer email failed:", emailErr);
    }

    return { success: true };
  }
);

// ✅ kept for backward compatibility — now just an alias for approveWork
exports.approveServiceCompletion = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {
    if (!request.auth) throw new Error("Unauthorized");
    const { jobId } = request.data;
    if (!jobId) throw new Error("Missing jobId");
    const { jobRef, jobData, serviceId, serviceData, carInfo, serviceType, serviceCenter, startedAt } = await buildJobDetails(jobId);
    if (!["pending_approval", "work_done"].includes(jobData.status)) throw new Error("Invalid job state");

    const approvedAt = new Date();
    const approvedAtStr = approvedAt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

    // Just return success — kept for backward compat; use approveWork + completeServiceFinal instead
    return { success: true, message: "Use approveWork and completeServiceFinal instead." };
  }
);

// ============================================================================
// NOTIFY MECHANIC ON JOB ASSIGNMENT
// ============================================================================
exports.notifyMechanicAssignment = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {
    // 1. Verify Authentication
    if (!request.auth) {
      throw new Error("Unauthorized");
    }

    const { mechanicId, jobId, carNumber, serviceType, date, time } = request.data;
    
    if (!mechanicId || !jobId) {
      throw new Error("Missing required assignment data");
    }

    try {
      // 2. Fetch the Mechanic's Profile to get their Email
      const mechanicSnap = await admin.firestore().collection("users").doc(mechanicId).get();
      if (!mechanicSnap.exists) {
        throw new Error("Mechanic profile not found");
      }

      const mechanicData = mechanicSnap.data();
      const mechanicEmail = mechanicData.email;
      const mechanicName = mechanicData.name || "Mechanic";

      if (!mechanicEmail) {
        console.log(`No email found for mechanic ID: ${mechanicId}. Skipping email notification.`);
        return { success: false, reason: "Mechanic has no email address." };
      }

      // 3. Configure Nodemailer
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_EMAIL,
          pass: process.env.GMAIL_PASSWORD,
        },
      });

      // 4. Build the HTML Email Template
      const mailOptions = {
        from: `"AutoCare247" <${process.env.GMAIL_EMAIL}>`,
        to: mechanicEmail,
        subject: `🔧 New Job Assigned: ${carNumber} (${serviceType})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #2563eb; padding: 24px; text-align: center;">
              <h2 style="margin: 0; color: #ffffff; font-size: 24px;">New Job Assigned</h2>
            </div>
            
            <div style="padding: 32px; color: #334155; background-color: #ffffff;">
              <p style="font-size: 16px; margin-top: 0;">Hello <strong>${mechanicName}</strong>,</p>
              <p style="font-size: 15px; line-height: 1.5;">You have been assigned a new service job by the service center. Please check your dashboard for full vehicle details and customer notes.</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 24px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px; width: 40%;"><strong>Job ID:</strong></td>
                    <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 600;">${jobId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;"><strong>Vehicle:</strong></td>
                    <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 600;">${carNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;"><strong>Service Type:</strong></td>
                    <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 600;">${serviceType}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;"><strong>Scheduled:</strong></td>
                    <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 600;">${date} at ${time || "Anytime"}</td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin-top: 32px;">
                <a href="https://yourdomain.com/mechanic-dashboard.html" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Open Mechanic Panel</a>
              </div>
            </div>
            
            <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
              &copy; ${new Date().getFullYear()} AutoCare247. All rights reserved.
            </div>
          </div>
        `
      };

      // 5. Send the Email
      await transporter.sendMail(mailOptions);
      console.log(`Assignment notification email successfully sent to ${mechanicEmail}`);
      
      return { success: true };

    } catch (error) {
      console.error("Failed to process mechanic assignment email:", error);
      throw new Error("Internal error while sending notification");
    }
  }
);