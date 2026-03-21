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
admin.initializeApp();

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

/**
 * when media is uploaded → mark service hasMedia = true
 */
exports.onMediaUpload = onDocumentCreated(
  "services/{serviceId}/media/{mediaId}",
  async (event) => {
    const serviceId = event.params.serviceId;

    await db.doc(`services/${serviceId}`).update({
      hasMedia: true,
      mediaUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);


//delete trigger
// COMMON FUNCTION (REUSABLE)
async function recalculateStep(serviceId) {

  const mediaSnap = await db
    .collection("services")
    .doc(serviceId)
    .collection("media")
    .get();

  let hasBefore = false;
  let hasDuring = false;
  let hasAfter = false;

  mediaSnap.forEach(doc => {
    const stage = doc.data().stage;

    if (stage === "before") hasBefore = true;
    if (stage === "during") hasDuring = true;
    if (stage === "after") hasAfter = true;
  });

  let newStep = "before";
  let hasMedia = false;

  if (hasBefore) {
    hasMedia = true;
    newStep = "before";

    if (hasDuring) {
      newStep = "during";

      if (hasAfter) {
        newStep = "after";
      }
    }
  }

  // no media at all
  if (!hasBefore && !hasDuring && !hasAfter) {
    newStep = "before";
    hasMedia = false;
  }

  await db.doc(`services/${serviceId}`).update({
    currentStep: newStep,
    hasMedia: hasMedia,
    mediaUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("STEP RECALCULATED:", newStep);
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