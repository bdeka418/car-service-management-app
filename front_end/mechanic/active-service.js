import { db, auth } from "../firebase.js";

import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  getStorage,
  ref,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";


let currentUser = null;
let serviceTimerInterval = null;
const storage = getStorage();



const params = new URLSearchParams(window.location.search);
const jobId = params.get("id");



//authentication

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  currentUser = user;

  if (!jobId) {
    return;
  }

  loadActiveService(jobId);
});

//media flow function
window.openMediaFlow = async function(jobId) {

  const jobRef = doc(db, "jobCards", jobId);

  await updateDoc(jobRef, {
    status: "in_progress",
    startedAt: serverTimestamp()
  });
  //history function for media flow start
  const jobSnap = await getDoc(jobRef);
const serviceId = jobSnap.data().serviceId;

await updateDoc(doc(db, "services", serviceId), {
  history: arrayUnion({
    action: "work_started",
    by: currentUser.uid,
    role: "mechanic",
    at: new Date()
  })
});
window.location.href =
`active-service.html?id=${jobId}`;
};

function startServiceTimer(startedAt) {

  if (!startedAt) return;

  clearInterval(serviceTimerInterval);

  serviceTimerInterval = setInterval(() => {

    const startTime = startedAt.toDate
      ? startedAt.toDate()
      : new Date(startedAt);

    const now = new Date();
    const diff = now - startTime;

    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    const timerEl =
      document.getElementById("serviceElapsedTime");

    if (timerEl) {
      timerEl.textContent =
        `${hrs}h ${mins}m ${secs}s`;
    }

  }, 1000);
}

//toggle live button

async function setupLiveToggle(jobData, serviceData) {

  const liveCard =
    document.querySelector(".live-tracking-card");

  if (!liveCard) return;

  const isLiveOn = !!serviceData.liveEnabled;

  liveCard.innerHTML = `
    <div class="live-box">
      <h3>Live Tracking</h3>
      <label class="switch">
        <input
          type="checkbox"
          id="liveToggle"
          ${isLiveOn ? "checked disabled" : ""}
        >
        <span>Enable Live</span>
      </label>
      ${isLiveOn ? `<p class="live-on-msg">🟢 Live is ON — will turn off automatically when service completes.</p>` : ""}
    </div>
  `;

  // Only attach listener if not yet enabled
  if (!isLiveOn) {
    const liveToggle = document.getElementById("liveToggle");

    liveToggle.addEventListener("change", async () => {
      const enabled = liveToggle.checked;
      try {
        await updateDoc(doc(db, "services", jobData.serviceId), {
          liveEnabled: enabled,
          liveStartedAt: enabled ? serverTimestamp() : null,
          liveStartedBy: enabled ? currentUser.uid : null
        });
        await updateDoc(doc(db, "jobCards", jobId), {
          "liveTracking.enabled": enabled,
          "liveTracking.startedAt": enabled ? serverTimestamp() : null,
          "liveTracking.startedBy": enabled ? currentUser.uid : null
        });
        // Once enabled, lock it immediately
        if (enabled) {
          liveToggle.disabled = true;
          loadActiveService(jobId);
        }
      } catch (error) {
        console.error("Live toggle failed:", error);
        liveToggle.checked = !enabled;
      }
    });
  }
}


//upload media function

window.uploadMedia = async function(jobId) {
  
const fileInput = document.getElementById("mediaFileInput");
const stageSelect = document.getElementById("stageSelect");

  const file = fileInput.files[0];
  const stage = stageSelect.value;

  if (!file || !stage) {
    alert("Select file and stage");
    return;
  }

  // ✅ LOOPHOLE FIX 2: Video size validation
  if (file.type.startsWith("video/") && file.size > 100 * 1024 * 1024) {
    alert("❌ Video must be under 100MB. Please compress and retry.");
    return;
  }

  // 🔥 GET SERVICE ID FROM JOBCARD
  const jobRef = doc(db, "jobCards", jobId);
  const jobSnap = await getDoc(jobRef);

  if (!jobSnap.exists()) return;

  const jobStatusCheck = jobSnap.data();

  // ✅ LOOPHOLE FIX: Block if cancel pending
  if (jobStatusCheck.cancelRequested) {
    alert("⏳ Cancel request pending. Uploads are locked.");
    return;
  }

// 🚫 BLOCK if not in progress
if (jobStatusCheck.status !== "in_progress") {
  alert("🔒 Work locked. Waiting for admin approval.");
  return;
}

  const jobData = jobSnap.data();
  const serviceId = jobData.serviceId;
  const assignedServiceCenterId = jobData.assignedServiceCenterId;
  
  const serviceRef = doc(db, "services", serviceId);
  const serviceSnap = await getDoc(serviceRef);
  const serviceData = serviceSnap.data();


  if (!serviceData.liveEnabled) {
  alert("Turn ON live tracking first");
  return;
}


  // STAGE LOCK (FROM SERVICE DOC)
  const mediaStageOrder = ["before", "during", "after"];

const selectedIndex =
  mediaStageOrder.indexOf(stage);

// no stage selected
if (!stage) {
  alert("Please select stage first");
  return;
}


  // LIMIT 3 IMAGES PER STAGE
  const mediaSnap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  let count = 0;
  mediaSnap.forEach(doc => {
    if (doc.data().stage === stage) count++;
  });

  if (count >= 3) {
    alert("Max 3 images per stage");
    return;
  }

  //  TEMP PREVIEW (UI ONLY)
  const preview = document.getElementById("mediaPreviewGrid");
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.style.width = "80px";
  img.style.margin = "5px";
  preview.appendChild(img);

  //  SAVE MEDIA IN SERVICE (NOT JOBCARD)
 //  STORAGE UPLOAD (SHIFTED FROM SERVICE DASHBOARD)

const fileRef = ref(
  storage,
  `services/${serviceId}/media/${Date.now()}_${file.name}`
);

const metadata = {
  customMetadata: {
    ownerId: currentUser.uid,
    assignedServiceCenterId: assignedServiceCenterId  // ✅ actual service center ID
  }
};

const uploadTask = uploadBytesResumable(fileRef, file, metadata);

const container = document.getElementById("progressContainer");
if (container) {
  container.style.display = "flex"; // show only during upload
}

uploadTask.on(
  "state_changed",

  (snapshot) => {
    const progress =
      (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
    console.log("Upload progress:", progress);

    const bar = document.getElementById("progressBar");
const text = document.getElementById("progressText");

if (bar) {
  bar.style.transition = "width 0.2s ease"; 
  bar.style.width = progress + "%";
}

if (text) text.innerText = Math.round(progress) + "%";
  },

  (error) => {
    console.error("Upload failed:", error);
  },

  async () => {

  try {

    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

    console.log("DEBUG:", {
  jobId,
  serviceId,
  uid: currentUser.uid
});

// ✅ LOOPHOLE FIX 1: Duplicate upload check (same fileName+stage+user)
const dupCheck = await getDocs(collection(db, "services", serviceId, "media"));
const alreadyExists = dupCheck.docs.some(d =>
  d.data().fileName === file.name &&
  d.data().stage    === stage &&
  d.data().uploadedBy === currentUser.uid
);
if (alreadyExists) {
  console.warn("Duplicate upload skipped:", file.name);
  loadMechanicMedia(jobId, serviceId);
  return;
}

// ✅ directly use jobId from function
await addDoc(
  collection(db, "services", serviceId, "media"),
  {
    url: downloadURL,
    filePath: fileRef.fullPath,
    stage: stage,
    uploadedBy: currentUser.uid,
    jobId: jobId,
    fileName: file.name,
    type: file.type.startsWith("video/") ? "video" : "photo",
    createdAt: serverTimestamp()
  }
);

// STEP UPDATE
// Get all media again
const mediaList = (
  await getDocs(
    collection(db, "services", serviceId, "media")
  )
).docs.map(doc => doc.data());

// Count images for this stage
const stageImages = mediaList.filter(m => m.stage === stage);

if (stage === "after" && stageImages.length >= 3) {
  await updateDoc(doc(db, "services", serviceId), {
    currentStep: "test_drive",
    updatedAt: serverTimestamp()
  });

  await updateDoc(doc(db, "jobCards", jobId), {
    progress: "test_drive",
    updatedAt: serverTimestamp()
  });
}

const container = document.getElementById("progressContainer");
if (container) {
  container.style.display = "none"; // hide after upload
}

    loadMechanicMedia(jobId, serviceId);
    loadActiveService(jobId);
   }
 catch (error) {
    console.error("Upload processing failed:", error);
  }

}
);
}



//load media for mechanic
async function loadMechanicMedia(jobId, serviceId) {

  const container = document.getElementById("mediaPreviewGrid");
  if (!container) return;

  container.innerHTML = "";

  const MIN = 2;
  const MAX = 3;

  try {

    const mediaSnap = await getDocs(
      collection(db, "services", serviceId, "media")
    );

    const grouped = { before: [], during: [], after: [], video: [] };
    let beforeCount = 0, duringCount = 0, afterCount = 0;

    mediaSnap.forEach(docSnap => {
      const data = docSnap.data();
      const s = data.stage;
      if (grouped[s]) grouped[s].push({ id: docSnap.id, ...data });
      if (data.type !== "video") {
        if (s === "before") beforeCount++;
        if (s === "during") duringCount++;
        if (s === "after")  afterCount++;
      }
    });

    // Refresh stage dropdown options
    const stageSelect = document.getElementById("stageSelect");
    if (stageSelect) {
      const newOpts = await getStageOptions(serviceId);
      stageSelect.innerHTML = `<option value="">Select Stage</option>${newOpts}`;
    }

    // Render preview grid
    ["before", "during", "after", "video"].forEach(stage => {
      if (grouped[stage].length === 0) return;

      const count = grouped[stage].length;
      const label = document.createElement("h5");
      label.innerText = stage.toUpperCase() +
  (stage !== "video" ? ` (${grouped[stage].length}/${MAX})` : ` (${count})`);
      label.style.margin = "8px 0 4px";
      container.appendChild(label);

      grouped[stage].forEach(data => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "display:inline-block;position:relative;margin:5px;";

        if (data.type === "video") {
          const vid = document.createElement("video");
          vid.src = data.url;
          vid.style.width = "80px";
          vid.controls = true;
          wrapper.appendChild(vid);
        } else {
          const img = document.createElement("img");
          img.src = data.url;
          img.style.width = "80px";
          wrapper.appendChild(img);
        }

        const del = document.createElement("button");
        del.innerText = "✖";
        del.style.cssText = "position:absolute;top:0;right:0;background:red;color:white;border:none;cursor:pointer;border-radius:3px;";
        del.onclick = () => deleteMechanicMedia(serviceId, data.id, data.filePath, jobId);
        wrapper.appendChild(del);
        container.appendChild(wrapper);
      });
    });

    // Show/hide complete stage button
    const btnContainer = document.getElementById("mediaCompleteBtn");
    const adviceText   = document.getElementById("mediaAdviceText");
    const allReady = beforeCount >= MIN && duringCount >= MIN && afterCount >= MIN;

    if (btnContainer) {
      if (allReady) {
        btnContainer.innerHTML = `
          <button class="stage-next-btn stage-next-btn--green" onclick="advanceStage('${jobId}')">
            ✅ All Photos Uploaded — Mark Stage Complete
          </button>`;
        if (adviceText) adviceText.style.display = "none";
      } else {
        btnContainer.innerHTML = "";
        if (adviceText) {
          adviceText.style.display = "block";
          adviceText.textContent =
            `⚠️ Before: ${beforeCount}/${MIN} | During: ${duringCount}/${MIN} | After: ${afterCount}/${MIN} — Upload minimum 2 photos per stage. photos per stage. Videos are optional and do not count towards the minimum, MAX 3 photos per stage.`;
        }
      }
    }

  } catch (err) {
    console.log("Media load failed:", err);
  }
}

//helper to get stage options with lock
async function getStageOptions(serviceId) {

  const MIN = 2; // minimum photos required per stage

  const mediaSnap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  let beforeCount = 0, duringCount = 0, afterCount = 0;

  mediaSnap.forEach(doc => {
    const d = doc.data();
    if (d.type === "photo" || !d.type) { // count only photos
      if (d.stage === "before") beforeCount++;
      if (d.stage === "during") duringCount++;
      if (d.stage === "after") afterCount++;
    }
  });

  // Forward lock: need MIN photos to unlock next stage
  const duringUnlocked = beforeCount >= MIN;
  const afterUnlocked  = duringCount >= MIN;
  const videoUnlocked  = afterCount  >= MIN;

  // Backward lock: once you start next stage, can't go back
  const beforeLocked = duringCount > 0;
  const duringLocked = afterCount  > 0;

  const buildOption = (value, label, disabled) =>
    `<option value="${value}" ${disabled ? "disabled" : ""}>
      ${label}${disabled ? " 🔒" : ""}
    </option>`;

  return [
    buildOption("before", `Before`,          beforeLocked),
buildOption("during", `During`,          !duringUnlocked || duringLocked),
buildOption("after",  `After`,           !afterUnlocked),
buildOption("video",  `Video (optional)`,!videoUnlocked)
  ].join("");
}

//delete media function
async function deleteMechanicMedia(serviceId, mediaId, filePath, jobId) {

const jobSnapCheck = await getDoc(doc(db, "jobCards", jobId));
if (!jobSnapCheck.exists()) return;
const jobStatusCheck = jobSnapCheck.data();

if (jobStatusCheck.status !== "in_progress") {
  alert("🔒 Cannot modify after submission");
  return;
}

  if (!confirm("Delete this image?")) return;

  try {

    // 🔥 delete storage
    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);

    // 🔥 delete firestore
    await deleteDoc(doc(db, "services", serviceId, "media", mediaId));

    // 🔥 FIX STAGE ROLLBACK
const mediaSnap = await getDocs(
  collection(db, "services", serviceId, "media")
);

let beforeCount = 0;
let duringCount = 0;
let afterCount = 0;

mediaSnap.forEach(doc => {
  const s = doc.data().stage;
  if (s === "before") beforeCount++;
  if (s === "during") duringCount++;
  if (s === "after") afterCount++;
});

// determine correct mediaStage after deletion
const MIN_DELETE = 2;
let newStep = "before";
if (beforeCount >= MIN_DELETE && duringCount < MIN_DELETE) newStep = "during";
if (beforeCount >= MIN_DELETE && duringCount >= MIN_DELETE) newStep = "after";

// update service doc
await updateDoc(doc(db, "services", serviceId), {
   mediaStage: newStep
});

    // 🔥 reload UI
    loadMechanicMedia(jobId, serviceId);

  } catch (err) {
    console.error("Delete failed:", err);
  }
  loadActiveService(jobId);
}
//save inspectiobn function

window.saveInspection = async function(jobId) {

  try {

    const checkedIssues = [
      ...document.querySelectorAll(
        ".inspection-options input:checked"
      )
    ].map(el => el.value);

    const severity =
      document.getElementById(
        "inspectionSeverity"
      ).value;

    const notes =
      document.getElementById(
        "inspectionNotes"
      ).value.trim();

    if (
      checkedIssues.length === 0 ||
      !severity ||
      !notes
    ) {
      alert("Complete inspection details first");
      return;
    }

    const jobSnap =
      await getDoc(doc(db, "jobCards", jobId));

    const jobData = jobSnap.data();

    await updateDoc(
      doc(db, "services", jobData.serviceId),
      {
        inspectionReport: {
          issues: checkedIssues,
          severity,
          notes,
          inspectedAt: serverTimestamp(),
          inspectedBy: currentUser.uid
        },

        updatedAt: serverTimestamp(),

        history: arrayUnion({
          action: "inspection_saved",
          by: currentUser.uid,
          role: "mechanic",
          at: new Date()
        })
      }
    );

    alert("✅ Inspection saved! You can now advance to the next stage.");
    loadActiveService(jobId); // re-render to show advance button

  } catch (error) {
    console.error(error);
  }
};

// save test drive function
window.saveTestDrive = async function(jobId) {
  try {
    const checkedItems = [...document.querySelectorAll("#testDriveContainer .inspection-options input:checked")].map(el => el.value);
    const distance  = document.getElementById("testDriveDistance")?.value.trim();
    const status    = document.getElementById("testDriveStatus")?.value;
    const notes     = document.getElementById("testDriveNotes")?.value.trim();
    const failNote  = document.getElementById("testDriveFailNote")?.value.trim();
    const jobSnap   = await getDoc(doc(db, "jobCards", jobId));
    const serviceId = jobSnap.data().serviceId;

    await updateDoc(doc(db, "services", serviceId), {
      testDriveReport: {
        checklist:  checkedItems,
        distanceKm: distance,
        result:     status,
        notes:      notes || "",
        failReason: status === "failed" ? failNote : null,
        savedAt:    serverTimestamp(),
        savedBy:    currentUser.uid
      },
      testDriveEndedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      history: arrayUnion({
        action: "test_drive_saved",
        result: status,
        by:     currentUser.uid,
        role:   "mechanic",
        at:     new Date()
      })
    });

    alert("Test drive report saved (" + (status === "passed" ? "Passed" : "Failed") + "). You can now advance.");
    loadActiveService(jobId);

  } catch (error) {
    console.error("Test drive save failed:", error);
  }
};

//stage progress function
window.advanceStage = async function(jobId) {

  try {

    const jobSnap = await getDoc(doc(db, "jobCards", jobId));
    if (!jobSnap.exists()) return;

    const jobData = jobSnap.data();

    // ✅ LOOPHOLE FIX: Block all actions if cancel pending
    if (jobData.cancelRequested) {
      alert("⏳ Cancel request is pending admin review. Actions are locked.");
      return;
    }

    const serviceId = jobData.serviceId;

    const serviceRef = doc(db, "services", serviceId);
    const serviceSnap = await getDoc(serviceRef);
    if (!serviceSnap.exists()) {        // ✅ add this
  alert("Service not found");
  return;
}

    const serviceData = serviceSnap.data();

    // BLOCK IF LIVE OFF
    if (!serviceData.liveEnabled) {
      alert("Turn ON live tracking first");
      return;
    }

    const stages = [
      "vehicle_received",
      "service_started",
      "inspection",
      "uploading_media",
      "test_drive",
      "service_complete"
    ];

    let current =
  serviceData.currentStep || "vehicle_received";

// fallback protection
if (!stages.includes(current)) {
  current = "vehicle_received";
}

const currentIndex = stages.indexOf(current);

    if (current === "uploading_media") {
  const mediaSnap = await getDocs(collection(db, "services", serviceId, "media"));
  let beforeCount = 0, duringCount = 0, afterCount = 0;
  mediaSnap.forEach(doc => {
    const d = doc.data();
    if (d.type !== "video") {
      if (d.stage === "before") beforeCount++;
      if (d.stage === "during") duringCount++;
      if (d.stage === "after")  afterCount++;
    }
  });
  if (beforeCount < 2 || duringCount < 2 || afterCount < 2) {
    alert(`Upload minimum 2 photos per stage.\nBefore: ${beforeCount} | During: ${duringCount} | After: ${afterCount}`);
    return;
  }
}
    if (current === "test_drive" && !serviceData.testDriveReport) {
      alert("Save the test drive report before advancing.");
      return;
    }

    if (current === "service_complete") {
      alert("All stages already completed");
      return;
    }

    // prevent undefined stage
if (currentIndex >= stages.length - 1) {
  alert("No more stages remaining");
  return;
}
    const nextStage = stages[currentIndex + 1];

   await updateDoc(serviceRef, {
  currentStep: nextStage,
  updatedAt: serverTimestamp(),
  ...(nextStage === "test_drive" ? { testDriveStartedAt: serverTimestamp() } : {}),

  history: arrayUnion({
    action: "stage_advanced",
    from: current,
    to: nextStage,
    by: currentUser.uid,
    role: "mechanic",
    at: new Date()
  })
});

// sync jobcard progress
await updateDoc(
  doc(db, "jobCards", jobId),
  {
    progress: nextStage,

    "liveTracking.currentStage":
      nextStage
        .replaceAll("_", " ")
        .replace(/\b\w/g, c => c.toUpperCase()),

    "liveTracking.currentStageIndex":
      currentIndex + 1,

    stageSummary: {
      totalStages: stages.length,

      completedStages: currentIndex + 1,

      currentStage:
        nextStage
          .replaceAll("_", " ")
          .replace(/\b\w/g, c => c.toUpperCase()),

      progressPercent:
        Math.floor(
          ((currentIndex + 1) / stages.length) * 100
        )
    },

    updatedAt: serverTimestamp()
  }
);

    loadActiveService(jobId);

  } catch (error) {
    console.error("Stage advance failed:", error);
  }
};
//complete job function
window.completeService = async function(jobId) {

const btn = document.getElementById("completeServiceBtn");
const jobSnap = await getDoc(doc(db, "jobCards", jobId));
if (!jobSnap.exists()) return;
const jobData = jobSnap.data();

const serviceSnap = await getDoc(
  doc(db, "services", jobData.serviceId)
);

const serviceData = serviceSnap.data();

if (!serviceData.liveEnabled) {
  alert("Turn ON live tracking first");
  return;
}


if (btn) {
  btn.disabled = true;
  btn.innerText = "Submitting...";
}

  try {

    const jobRef = doc(db, "jobCards", jobId);
    const jobSnap = await getDoc(jobRef);

    if (!jobSnap.exists()) return;

    const jobData = jobSnap.data();
    const serviceId = jobData.serviceId;
    const assignedServiceCenterId = jobData.assignedServiceCenterId;

    //  CHECK MEDIA FROM SERVICE
    const mediaSnap = await getDocs(
      collection(db, "services", serviceId, "media")
    );

    let hasBefore = false;
    let hasDuring = false;
    let hasAfter = false;

    mediaSnap.forEach(doc => {
      const stage = doc.data().stage;

      if (stage === "before") hasBefore = true;
      if (stage === "during") hasDuring = true;
      if (stage === "after") hasAfter = true;
    });

    if (!hasBefore || !hasDuring || !hasAfter) {
      alert("Complete all stages before finishing");
      return;
    }

    // ✅ SAFE COMPLETE (jobCard)
await updateDoc(jobRef, {
  status: "pending_approval",
  completedAt: serverTimestamp()
});

// 🔥 ADD THIS — update service status + auto-disable live
await updateDoc(doc(db, "services", serviceId), {
  serviceStatus: "pending_approval",
  liveEnabled: false,       // ✅ auto off
  liveEndedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  history: arrayUnion({
    action: "submitted_for_approval",
    by: currentUser.uid,
    role: "mechanic",
    at: new Date()
  })
});

// ✅ also disable in jobCard liveTracking
await updateDoc(jobRef, {
  "liveTracking.enabled": false,
  "liveTracking.endedAt": serverTimestamp()
});


  } catch (error) {
    console.error("Error completing job:", error);
  }
};

//cancel request job function — shows inline modal with media warning
window.requestCancel = async function(jobId) {
  const jobSnap = await getDoc(doc(db, "jobCards", jobId));
  if (!jobSnap.exists()) return;
  const jobData  = jobSnap.data();
  const serviceId = jobData.serviceId;

  // ✅ LOOPHOLE FIX 4: Warn if media already uploaded
  const mediaSnap = await getDocs(collection(db, "services", serviceId, "media"));
  const mediaCount = mediaSnap.size;

  const modal = document.getElementById("cancelModal");
  const warning = document.getElementById("cancelMediaWarning");
  if (mediaCount > 0) {
    warning.style.display = "block";
    warning.textContent = `⚠️ You have already uploaded ${mediaCount} file(s). If admin approves, all media and data will be permanently erased. This cannot be undone.`;
  } else {
    warning.style.display = "none";
  }
  modal.style.display = "flex";
};

window.submitCancelRequest = async function(jobId) {
  const reason = document.getElementById("cancelReasonInput").value.trim();
  if (!reason) { alert("Please write a reason."); return; }

  const jobSnap = await getDoc(doc(db, "jobCards", jobId));
  if (!jobSnap.exists()) return;
  const serviceId = jobSnap.data().serviceId;

  try {
    await updateDoc(doc(db, "jobCards", jobId), {
      cancelRequested: true,
      cancelReason: reason,
      cancelRequestedAt: serverTimestamp()
    });
    await updateDoc(doc(db, "services", serviceId), {
      cancelRequested: true,
      cancelReason: reason,
      cancelRequestedAt: serverTimestamp(),
      history: arrayUnion({
        action: "cancel_requested",
        reason,
        by: currentUser.uid,
        role: "mechanic",
        at: new Date()
      })
    });
    closeCancelModal();
    alert("✅ Cancel request sent to admin.");
    loadActiveService(jobId);
  } catch (err) {
    console.error("Cancel request error:", err);
  }
};

window.closeCancelModal = function() {
  const modal = document.getElementById("cancelModal");
  if (modal) modal.style.display = "none";
};

// =============================================
function renderCancelButtonHTML(jobId) {
  return `
    <button onclick="requestCancel('${jobId}')" class="cancel-request-btn">
      🚫 Request Job Cancellation
    </button>
    <div id="cancelModal" class="cancel-modal-overlay">
      <div class="cancel-modal-box">
        <h3 style="margin-bottom:12px;">Request Job Cancellation</h3>
        <div id="cancelMediaWarning" style="display:none;" class="cancel-approved-banner"></div>
        <p class="media-disclaimer">Write your reason clearly. Admin will review and respond.</p>
        <textarea id="cancelReasonInput" class="cancel-reason-input" placeholder="Reason for cancellation..."></textarea>
        <div class="cancel-modal-actions">
          <button onclick="submitCancelRequest('${jobId}')" class="cancel-submit-btn">Send Request</button>
          <button onclick="closeCancelModal()" class="cancel-back-btn">Go Back</button>
        </div>
      </div>
    </div>
  `;
}

// CANCEL BUTTON RENDERER
// =============================================
function renderCancelButton(jobData, serviceData, jobId) {
  const container = document.getElementById("cancelButtonContainer");
  if (!container) return;

  const cancelPending  = jobData.cancelRequested === true;
  const alreadyCancelled = jobData.status === "cancelled" || serviceData.serviceStatus === "cancelled";
  const completed      = jobData.status === "pending_approval" || jobData.status === "completed";

  if (alreadyCancelled) {
    container.innerHTML = `<div style="background:#fee2e2;padding:14px;border-radius:12px;margin-bottom:16px;">
      <b style="color:#dc2626;">❌ Service Cancelled</b>
      <p style="font-size:13px;margin-top:4px;">Reason: ${jobData.cancelReason || serviceData.cancelReason || "—"}</p>
      ${serviceData.adminCancelNote ? `<p style="font-size:13px;color:#7f1d1d;">Admin note: ${serviceData.adminCancelNote}</p>` : ""}
    </div>`;
    return;
  }

  // Show rejection note if admin rejected
  const wasRejected = serviceData.cancelRejectedAt && !serviceData.cancelRequested;
  if (wasRejected) {
    container.innerHTML = `<div class="cancel-reject-note">
      <b>❌ Cancel Request Rejected by Admin</b>
      <p style="margin-top:6px;">Reason: ${serviceData.cancelRejectionNote || "No reason given"}</p>
      <p style="margin-top:4px;font-size:12px;color:#047857;">Please continue with the service.</p>
    </div>`;
    // Clear after 10 seconds so mechanic can re-request if needed
    setTimeout(() => { container.innerHTML = renderCancelButtonHTML(jobId); }, 10000);
    return;
  }

  if (cancelPending) {
    container.innerHTML = `<div class="cancel-pending-banner">
      <b style="color:#b45309;">⏳ Cancel Request Pending Admin Review</b>
      <p style="font-size:13px;margin-top:4px;">Reason: ${jobData.cancelReason || "—"}</p>
      <p style="font-size:12px;color:#78350f;">All actions are locked until admin responds.</p>
    </div>`;
    return;
  }

  if (completed) { container.innerHTML = ""; return; }

  container.innerHTML = renderCancelButtonHTML(jobId);
}

// ===========================
// ACTIVE SERVICE PAGE RENDER
// ===========================

async function loadActiveService(jobId) {

  const jobSnap = await getDoc(doc(db, "jobCards", jobId));
  if (!jobSnap.exists()) return;

  const jobData = {
    id: jobSnap.id,
    ...jobSnap.data()
  };

  const serviceSnap = await getDoc(
    doc(db, "services", jobData.serviceId)
  );

  const serviceData = serviceSnap.exists()
    ? serviceSnap.data()
    : {};

  // CUSTOMER INFO
  let customerData = {};

  if (jobData.customerId) {
    const customerSnap = await getDoc(
      doc(db, "users", jobData.customerId)
    );

    if (customerSnap.exists()) {
      customerData = customerSnap.data();
    }
  }

renderServiceSummary(jobData, customerData, serviceData);
renderServiceStages(serviceData);
renderCurrentStage(serviceData, jobId, jobData.serviceId);
renderCancelButton(jobData, serviceData, jobId);

startServiceTimer(jobData.startedAt);
setupLiveToggle(jobData, serviceData);  

}

//summary render

function renderServiceSummary(jobData, customerData, serviceData) {

  const container = document.getElementById("serviceSummaryCard");

  container.innerHTML = `
    <div class="service-summary-grid">

      <div class="summary-car">
        <h3>${jobData.serviceId || "N/A"}</h3>
        <p>${jobData.brand || ""} ${jobData.model || ""}</p>
        <p>${jobData.carNumber || ""}</p>
       <p>${jobData.serviceNote || jobData.notes || "No issue note"}</p>
      </div>

      <div class="summary-owner">
        <h3>${customerData.name || "Customer"}</h3>
        <p>${customerData.phone || "No phone"}</p>
        <p>${customerData.email || ""}</p>
      </div>

      <div class="summary-time">
  <h3>Started At</h3>
  <p>${
    jobData.startedAt?.toDate
      ? jobData.startedAt.toDate().toLocaleString()
      : "Not started"
  }</p>

  <h3>Time Elapsed</h3>
  <p id="serviceElapsedTime">0h 0m 0s</p>
</div>

    </div>
  `;
}


//stage timeline render

function renderServiceStages(serviceData) {

  const stages = [
    "vehicle_received",
    "service_started",
    "inspection",
    "uploading_media",
    "test_drive",
    "service_complete"
  ];

  const labels = [
    "Vehicle Received",
    "Service Started",
    "Mechanic Inspecting",
    "Uploading Media",
    "Test Drive",
    "Service Complete"
  ];

  const current = serviceData.currentStep || "vehicle_received";

  const currentIndex = stages.indexOf(current);

  const container =
    document.getElementById("serviceStagesList");

  container.innerHTML = stages.map((stage, index) => {

    let status = "Pending";

    if (index < currentIndex) status = "Completed";
    if (index === currentIndex) status = "In Progress";

    return `
      <div class="stage-item">
        <h4>${index + 1}. ${labels[index]}</h4>
        <p>${status}</p>
      </div>
    `;
  }).join("");
}


//current stage render 

async function renderCurrentStage(serviceData, jobId, serviceId) {

  const stageMap = {
    vehicle_received: "Vehicle Received",
    service_started: "Service Started",
    inspection: "Mechanic Inspecting the Car",
    uploading_media: "Uploading Media",
    test_drive: "Test Drive",
    service_complete: "Service Complete"
  };

  const current =
  stageMap[serviceData.currentStep]
    ? serviceData.currentStep
    : "vehicle_received";

  const container =
    document.getElementById("currentStageCard");

  // Determine if advance button should show
  const inspectionSaved = !!serviceData.inspectionReport;
  const showAdvanceBtn =
    current !== "service_complete" &&
    current !== "uploading_media" &&
    !(current === "inspection" && !inspectionSaved);

  container.innerHTML = `
  <div class="current-stage-box">
    <h3>Current Stage</h3>
    <h2>${stageMap[current]}</h2>
    ${showAdvanceBtn ? `
      <button class="stage-next-btn" onclick="advanceStage('${jobId}')">
        Mark Current Stage Complete
      </button>` : ""}
    ${current === "inspection" && !inspectionSaved ? `
      <p class="stage-warning">⚠️ Save inspection findings before advancing.</p>` : ""}
    ${current === "uploading_media" ? `
      <p class="stage-warning" id="mediaAdviceText">
        ⚠️ Upload minimum 2 photos in each stage to advance.
      </p>` : ""}
  </div>
`;

if (current === "inspection") {

  const inspectionContainer =
    document.getElementById("inspectionContainer");

  if (inspectionContainer) {

    inspectionContainer.style.display = "block";

    inspectionContainer.innerHTML = `

      <div class="inspection-card">

        <h3>Inspection Findings</h3>

        <div class="inspection-options">

          <label>
            <input type="checkbox" value="Brake Issue">
            Brake Issue
          </label>

          <label>
            <input type="checkbox" value="Engine Vibration">
            Engine Vibration
          </label>

          <label>
            <input type="checkbox" value="Oil Leakage">
            Oil Leakage
          </label>

          <label>
            <input type="checkbox" value="Battery Weak">
            Battery Weak
          </label>

        </div>

        <select id="inspectionSeverity">
          <option value="">Select Severity</option>
          <option value="minor">Minor</option>
          <option value="medium">Medium</option>
          <option value="critical">Critical</option>
        </select>

        <textarea
          id="inspectionNotes"
          placeholder="Write inspection findings..."
        ></textarea>

        <button
          class="save-inspection-btn"
          id="saveInspectionBtn"
          onclick="saveInspection('${jobId}')"
          disabled
          style="opacity:0.5;cursor:not-allowed;"
        >
          Save Inspection
        </button>

        <p id="inspectionHint" class="stage-hint">
          ⚠️ Select at least one issue, severity, and write a note to enable.
        </p>

      </div>
    `;

    // Wire up live validation to enable/disable the save button
    const checkInspectionReady = () => {
      const anyChecked = document.querySelectorAll(".inspection-options input:checked").length > 0;
      const severityVal = document.getElementById("inspectionSeverity")?.value;
      const notesVal = document.getElementById("inspectionNotes")?.value.trim();
      const btn = document.getElementById("saveInspectionBtn");
      const hint = document.getElementById("inspectionHint");
      const ready = anyChecked && severityVal && notesVal;
      if (btn) {
        btn.disabled = !ready;
        btn.style.opacity = ready ? "1" : "0.5";
        btn.style.cursor = ready ? "pointer" : "not-allowed";
      }
      if (hint) hint.style.display = ready ? "none" : "block";
    };

    document.querySelectorAll(".inspection-options input").forEach(cb =>
      cb.addEventListener("change", checkInspectionReady)
    );
    document.getElementById("inspectionSeverity")?.addEventListener("change", checkInspectionReady);
    document.getElementById("inspectionNotes")?.addEventListener("input", checkInspectionReady);
  }

} else {

  const inspectionContainer =
    document.getElementById("inspectionContainer");

  if (inspectionContainer) {
    inspectionContainer.style.display = "none";
  }
}


// ================= MEDIA STAGE =================

if (current === "uploading_media") {

  const mediaContainer =
    document.getElementById("mediaUploadContainer");

  if (mediaContainer) {

    mediaContainer.style.display = "block";

    // Build stage options dynamically
    const stageOpts = await getStageOptions(serviceId);

    mediaContainer.innerHTML = `
      <div class="media-upload-card">
        <h3>Upload Service Media</h3>
        <p class="media-disclaimer">Min. 2 and Max. 3 photos per stage (Before → During → After).</p>

        <select id="stageSelect">
          <option value="">Select Stage</option>
          ${stageOpts}
        </select>

        <input type="file" id="mediaFileInput" accept="image/*,video/*">

        <button onclick="uploadMedia('${jobId}')">Upload</button>

        <div id="progressContainer" style="display:none;">
          <div id="progressBar"></div>
          <span id="progressText">0%</span>
        </div>

        <div id="mediaCompleteBtn"></div>

        <div id="mediaPreviewGrid"></div>
      </div>
    `;

    loadMechanicMedia(jobId, serviceId);
  }

} else {

  const mediaContainer =
    document.getElementById("mediaUploadContainer");

  if (mediaContainer) {
    mediaContainer.style.display = "none";
  }
}


// ================= TEST DRIVE STAGE =================

const testDriveContainer = document.getElementById("testDriveContainer");

if (current === "test_drive") {

  if (testDriveContainer) {

    testDriveContainer.style.display = "block";

    const alreadySaved = !!serviceData.testDriveReport;

    if (alreadySaved) {
      // ✅ LOOPHOLE FIX 3: Show read-only summary — not re-editable form
      const r = serviceData.testDriveReport;
      testDriveContainer.innerHTML = `
        <div class="inspection-card">
          <h3>Test Drive Report</h3>
          <p class="saved-msg">✅ Test drive already saved. You can advance to complete.</p>
          <p><b>Result:</b> ${r.result === "passed" ? "✅ Passed" : "❌ Failed"}</p>
          <p><b>Distance:</b> ${r.distanceKm} km</p>
          <p><b>Checklist:</b> ${(r.checklist || []).join(", ")}</p>
          <p><b>Notes:</b> ${r.notes || "—"}</p>
          ${r.failReason ? `<p><b>Fail Reason:</b> ${r.failReason}</p>` : ""}
        </div>
      `;
    } else {
      testDriveContainer.innerHTML = `
        <div class="inspection-card">
          <h3>Test Drive Report</h3>

        ${alreadySaved ? `<p class="saved-msg">✅ Test drive already saved. You can advance to complete.</p>` : ""}

        <p class="media-disclaimer">Complete the checklist and fill in all details before advancing.</p>

        <div class="inspection-options">
          <label><input type="checkbox" value="Brakes OK"> Brakes Responding Correctly</label>
          <label><input type="checkbox" value="Engine Smooth"> Engine Running Smooth</label>
          <label><input type="checkbox" value="No Unusual Sounds"> No Unusual Sounds</label>
          <label><input type="checkbox" value="AC Working"> AC / Heating Working</label>
          <label><input type="checkbox" value="Steering OK"> Steering Control Normal</label>
          <label><input type="checkbox" value="Gears OK"> Gear Shifting Smooth</label>
        </div>

        <input type="number" id="testDriveDistance" placeholder="Distance driven (km)" min="0">

        <select id="testDriveStatus">
          <option value="">Select Result</option>
          <option value="passed">✅ Passed — Car ready for delivery</option>
          <option value="failed">❌ Failed — Needs further work</option>
        </select>

        <textarea id="testDriveNotes" placeholder="Any observations during the test drive..."></textarea>

        <div id="testDriveFailReason" style="display:none;">
          <textarea id="testDriveFailNote" placeholder="Describe what failed and what further work is needed..."></textarea>
        </div>

        <label class="confirm-label">
          <input type="checkbox" id="testDriveConfirm">
          I confirm I completed the test drive
        </label>

        <button
          id="saveTestDriveBtn"
          class="save-inspection-btn"
          onclick="saveTestDrive('${jobId}')"
          disabled
          style="opacity:0.5;cursor:not-allowed;"
        >
          Save Test Drive Report
        </button>

        <p id="testDriveHint" class="stage-hint">
          ⚠️ Complete all 6 checklist items, distance, result and confirm to enable.
        </p>

      </div>
    `;

    const checkTestDriveReady = () => {
      const checkedCount = document.querySelectorAll("#testDriveContainer .inspection-options input:checked").length;
      const distance  = document.getElementById("testDriveDistance")?.value.trim();
      const status    = document.getElementById("testDriveStatus")?.value;
      const confirmed = document.getElementById("testDriveConfirm")?.checked;
      const failNote  = document.getElementById("testDriveFailNote")?.value.trim();
      const failDiv   = document.getElementById("testDriveFailReason");

      if (failDiv) failDiv.style.display = status === "failed" ? "block" : "none";

      const failOk = status !== "failed" || (failNote && failNote.length > 0);
      const ready  = checkedCount >= 6 && distance && status && confirmed && failOk;

      const btn  = document.getElementById("saveTestDriveBtn");
      const hint = document.getElementById("testDriveHint");
      if (btn) {
        btn.disabled = !ready;
        btn.style.opacity = ready ? "1" : "0.5";
        btn.style.cursor  = ready ? "pointer" : "not-allowed";
      }
      if (hint) hint.style.display = ready ? "none" : "block";
    };

    document.querySelectorAll("#testDriveContainer .inspection-options input")
      .forEach(cb => cb.addEventListener("change", checkTestDriveReady));
    document.getElementById("testDriveDistance")?.addEventListener("input",  checkTestDriveReady);
    document.getElementById("testDriveStatus")?.addEventListener("change",   checkTestDriveReady);
    document.getElementById("testDriveNotes")?.addEventListener("input",     checkTestDriveReady);
    document.getElementById("testDriveConfirm")?.addEventListener("change",  checkTestDriveReady);
    document.getElementById("testDriveFailNote")?.addEventListener("input",  checkTestDriveReady);
  }
  } // end else (not already saved)

} else {
  if (testDriveContainer) testDriveContainer.style.display = "none";
}

}