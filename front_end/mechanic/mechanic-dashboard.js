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

const jobList = document.getElementById("jobList");
let selectedStageMap = {};
let currentUser = null;
const storage = getStorage();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
 

  currentUser = user;

  listenToJobs();
});

//logout function
// 🔓 LOGOUT FUNCTION
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    alert("Logged out successfully");
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    alert("Failed to logout");
  }
});

//load jobs assigned to the mechanic
function listenToJobs() {

  const q = query(
    collection(db, "jobCards"),
    where("mechanicId", "==", currentUser.uid)
  );

  onSnapshot(q, (snapshot) => {

    jobList.innerHTML = "";

    if (snapshot.empty) {
      jobList.innerHTML = "<li>No jobs assigned</li>";
      return;
    }

    snapshot.forEach(docSnap => {

      const data = docSnap.data();
// 🚫 REMOVE COMPLETED FROM DASHBOARD
if (data.status === "completed") return;

      const li = document.createElement("li");

      let buttons = "";

// 👇 STATUS BASED BUTTONS
if (data.status === "assigned") {
  buttons = `<button onclick="acceptJob('${docSnap.id}')">Accept Job</button>`;
}

else if (data.status === "accepted") {
  buttons = `<button onclick="openMediaFlow('${docSnap.id}')">Start Work</button>`;
}

else if (data.status === "in_progress") {
  buttons = `
    <div class="media-section" id="media-${docSnap.id}">

     <select id="stage-${docSnap.id}">
  <option value="">Loading...</option>
</select>

      <input type="file" id="file-${docSnap.id}" />

      <div style="display:flex; align-items:center; gap:10px;">

  <button onclick="uploadMedia('${docSnap.id}')"
   style="
    background: green;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 5px;
    cursor: pointer;
  ">
    Upload
  </button>

  <div id="progress-container-${docSnap.id}" 
     style="display:none; align-items:center; gap:5px;">

  <div style="width:80px; height:5px; background:#ddd; border-radius:3px;">
    <div id="progress-bar-${docSnap.id}" 
         style="width:0%; height:100%; background:green; border-radius:3px;">
    </div>
  </div>

  <span id="progress-text-${docSnap.id}" 
        style="font-size:10px; color:#555;">0%</span>

</div>

</div>

<div id="preview-${docSnap.id}"></div>

    </div>
  `;
}

else if (data.status === "pending_approval") {
  buttons = `
    <p style="color:orange; font-weight:bold;">
      ⏳ Waiting for Admin Approval
    </p>
  `;
}

else {
  buttons = `<p>✅ Work Completed</p>`;
}

li.innerHTML = `
  <div class="service-tile" style="position:relative;">

    ${data.status === "in_progress" ? `
      <button 
        onclick="requestCancel('${docSnap.id}')"
        style="
          position:absolute;
          top:10px;
          right:10px;
          background:red;
          color:white;
          border:none;
          padding:5px 8px;
          border-radius:5px;
          cursor:pointer;
        ">
        Cancel
      </button>
    ` : ""}

   <h3>
     ${data.carNumber} | ${data.brand} (${data.model})
   </h3>

   <p><strong>Note:</strong> ${data.notes || "No additional notes"}</p>

   <p>Status: <b>${data.status}</b></p>

  ${data.status === "in_progress" && data.rejectionReason ? `
  <p style="color:red; font-weight:bold;">
    ❌ Rejected: ${data.rejectionReason}
  </p>
` : ""}

   ${buttons}

  </div>
`;

      jobList.appendChild(li);
// LOAD STAGE OPTIONS IF IN PROGRESS
  if (data.status === "in_progress") {
  (async () => {

    const serviceSnap = await getDoc(doc(db, "services", data.serviceId));
    const serviceData = serviceSnap.data();

    const selectedStage =
      selectedStageMap[docSnap.id] ||
      serviceData.currentStep ||
      "before";

    const options = await getStageOptions(data.serviceId, selectedStage);

    const stageEl = document.getElementById(`stage-${docSnap.id}`);

    if (!stageEl) return; //  safety check

    stageEl.innerHTML =
      `<option value="" disabled>Select Stage</option>` + options;

    stageEl.value = selectedStage;

    stageEl.addEventListener("change", () => {
      selectedStageMap[docSnap.id] = stageEl.value;
    });

  })();
}   

      if (data.status === "in_progress") {
  loadMechanicMedia(docSnap.id, data.serviceId);

  (async () => {

  const mediaSnap = await getDocs(
    collection(db, "services", data.serviceId, "media")
  );

  let before = 0, during = 0, after = 0;

  mediaSnap.forEach(doc => {
    const s = doc.data().stage;
    if (s === "before") before++;
    if (s === "during") during++;
    if (s === "after") after++;
  });

  const isComplete = (before >= 1 && during >= 1 && after >= 1);

  const container = document.getElementById(`media-${docSnap.id}`);

  // remove old button if exists
  const oldBtn = document.getElementById(`complete-${docSnap.id}`);
  if (oldBtn) oldBtn.remove();

  if (isComplete) {
    const btn = document.createElement("button");
    btn.id = `complete-${docSnap.id}`;
    btn.innerText = "Complete Work";

btn.style.background = "green";
btn.style.color = "white";
btn.style.border = "none";
btn.style.padding = "6px 10px";
btn.style.borderRadius = "5px";
btn.style.cursor = "pointer";

    btn.onclick = () => completeJob(docSnap.id);

    container.appendChild(btn);
  }

})();
}

    });

  });
}

//helper to get stage options with lock
async function getStageOptions(serviceId, selectedStep) {

  const mediaSnap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  let beforeCount = 0;
  let duringCount = 0;
  let afterCount = 0;

  mediaSnap.forEach(doc => {
    const stage = doc.data().stage;

    if (stage === "before") beforeCount++;
    if (stage === "during") duringCount++;
    if (stage === "after") afterCount++;
  });

  const stages = ["before", "during", "after"];

  return stages.map(stage => {

    let disabled = false;

    // ✅ forward lock
    if (stage === "during" && beforeCount === 0) {
      disabled = true;
    }

    if (stage === "after" && duringCount === 0) {
      disabled = true;
    }

    // ✅ backward lock
    if (duringCount > 0 && stage === "before") {
      disabled = true;
    }

    if (afterCount > 0 && (stage === "before" || stage === "during")) {
      disabled = true;
    }

    return `<option value="${stage}" 
      ${disabled ? "disabled" : ""}
      ${stage === selectedStep ? "selected" : ""}>
      ${stage.toUpperCase()}
    </option>`;

  }).join("");  // IMPORTANT
}


//start job function
window.startJob = async function(jobId) {

  const jobRef = doc(db, "jobCards", jobId);

  // 1️⃣ update jobCard
  await updateDoc(jobRef, {
  status: "work_done",
  updatedAt: serverTimestamp()
});

  // 2️⃣ get serviceId
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) return;

};

//complete job function
window.completeJob = async function(jobId) {

const btn = document.getElementById(`complete-${jobId}`);
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

// 🔥 ADD THIS — update service status
await updateDoc(doc(db, "services", serviceId), {
  serviceStatus: "pending_approval",
  updatedAt: serverTimestamp(),

  // 🔥 HISTORY
  history: arrayUnion({
    action: "submitted_for_approval",
    by: currentUser.uid,
    role: "mechanic",
    at: new Date()
  })
});


  } catch (error) {
    console.error("Error completing job:", error);
  }
};


//cancel request job function

window.requestCancel = async function(jobId) {

  try {
    const reason = prompt("Enter reason for cancellation:");

    if (!reason || reason.trim() === "") {
      alert("Cancellation reason is required");
      return;
    }

    const jobRef = doc(db, "jobCards", jobId);
    const jobSnap = await getDoc(jobRef);

    if (!jobSnap.exists()) return;

    const jobData = jobSnap.data();
    const serviceId = jobData.serviceId;

    // 1️⃣ update jobCard
    await updateDoc(jobRef, {
      cancelRequested: true,
      cancelReason: reason,
      cancelRequestedAt: serverTimestamp()
    });

    // 🔥 2️⃣ ALSO update service
   await updateDoc(doc(db, "services", serviceId), {
  cancelRequested: true,
  cancelReason: reason,
  cancelRequestedAt: serverTimestamp(),

  // 🔥 HISTORY
  history: arrayUnion({
    action: "cancel_requested",
    reason: reason,
    by: currentUser.uid,
    role: "mechanic",
    at: new Date()
  })
});

    alert("Cancellation request sent to admin");

  } catch (error) {
    console.error("Cancel request error:", error);
  }
};



//ACCEPTT JOB FUNCTION
window.acceptJob = async function(jobId) {

  await updateDoc(doc(db, "jobCards", jobId), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp() 
  });

//history function fro accepted job
const jobSnap = await getDoc(doc(db, "jobCards", jobId));
const serviceId = jobSnap.data().serviceId;

try {
  await updateDoc(doc(db, "services", serviceId), {
    history: arrayUnion({
      action: "job_accepted",
      by: currentUser.uid,
      role: "mechanic",
      at: new Date()
    })
  });
} catch (err) {
  console.error("History update failed:", err);
}
};



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

};

//upload media function

window.uploadMedia = async function(jobId) {
  
  const fileInput = document.getElementById(`file-${jobId}`);
  const stageSelect = document.getElementById(`stage-${jobId}`);

  const file = fileInput.files[0];
  const stage = stageSelect.value;

  if (!file || !stage) {
    alert("Select file and stage");
    return;
  }

  // 🔥 GET SERVICE ID FROM JOBCARD
  const jobRef = doc(db, "jobCards", jobId);
  const jobSnap = await getDoc(jobRef);
 const jobStatusCheck = jobSnap.data();

// 🚫 BLOCK if not in progress
if (jobStatusCheck.status !== "in_progress") {
  alert("🔒 Work locked. Waiting for admin approval.");
  return;
}

  if (!jobSnap.exists()) return;

  const jobData = jobSnap.data();
  const serviceId = jobData.serviceId;
  const assignedServiceCenterId = jobData.assignedServiceCenterId;
  
  const serviceRef = doc(db, "services", serviceId);
  const serviceSnap = await getDoc(serviceRef);
  const serviceData = serviceSnap.data();

  // STAGE LOCK (FROM SERVICE DOC)
  const currentStep = serviceData.currentStep || "before";
const stageOrder = ["before", "during", "after"];

const currentIndex = stageOrder.indexOf(currentStep);
const selectedIndex = stageOrder.indexOf(stage);

// no stage selected
if (!stage) {
  alert("Please select stage first");
  return;
}

// prevent skipping forward
if (selectedIndex > currentIndex + 1) {
  alert("You cannot skip stages");
  return;
}

//  prevent going backward
if (selectedIndex < currentIndex) {
  alert("You cannot upload previous stage images");
  return;
}

// 🔥 HARD LOCK BACKWARD (safety)
if (stage === "before" && serviceData.currentStep !== "before") {
  alert("Cannot go back to previous stage");
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
  const preview = document.getElementById(`preview-${jobId}`);
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

const container = document.getElementById(`progress-container-${jobId}`);
if (container) {
  container.style.display = "flex"; // show only during upload
}

uploadTask.on(
  "state_changed",

  (snapshot) => {
    const progress =
      (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
    console.log("Upload progress:", progress);

    const bar = document.getElementById(`progress-bar-${jobId}`);
const text = document.getElementById(`progress-text-${jobId}`);

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

    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

    console.log("DEBUG:", {
  jobId,
  serviceId,
  uid: currentUser.uid
});

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
    createdAt: serverTimestamp()
  }
);

// STEP UPDATE
// Get all media again
const mediaSnap = await getDocs(collection(db, "services", serviceId, "media"));
const mediaList = mediaSnap.docs.map(doc => doc.data());

// Count images for this stage
const stageImages = mediaList.filter(m => m.stage === stage);

// Move to next stage only if at least 1 image uploaded
if (stageImages.length >= 3) {

  const nextStep = stageOrder[selectedIndex + 1];

  // ✅ update service stage
 await updateDoc(doc(db, "services", serviceId), {
  currentStep: nextStep || stage,
  updatedAt: serverTimestamp(),

  // 🔥 HISTORY
  history: arrayUnion({
    action: "stage_updated",
    stage: nextStep || stage,
    by: currentUser.uid,
    role: "mechanic",
    at: new Date()
  })
});

  // ✅ sync job card progress
  await updateDoc(doc(db, "jobCards", jobId), {
    progress: nextStep || stage,
    updatedAt: serverTimestamp()
  });
}
const container = document.getElementById(`progress-container-${jobId}`);
if (container) {
  container.style.display = "none"; // hide after upload
}

    loadMechanicMedia(jobId, serviceId);
    listenToJobs(); //re-render UI with updated stage
   }
 );
}

//load media for mechanic
async function loadMechanicMedia(jobId, serviceId) {

  const container = document.getElementById(`preview-${jobId}`);
  if (!container) return;

  container.innerHTML = "";

  try {

    const mediaSnap = await getDocs(
      collection(db, "services", serviceId, "media")
    );

   const grouped = {
  before: [],
  during: [],
  after: []
};

mediaSnap.forEach(docSnap => {
  const data = docSnap.data();
  grouped[data.stage].push({ id: docSnap.id, ...data });
});

["before", "during", "after"].forEach(stage => {

  if (grouped[stage].length === 0) return;

 const label = document.createElement("h5");
label.innerText = stage.toUpperCase() + " (" + grouped[stage].length + "/3)";
label.style.margin = "5px 0";
  container.appendChild(label);

  grouped[stage].forEach(data => {

    const wrapper = document.createElement("div");
    wrapper.style.display = "inline-block";
    wrapper.style.position = "relative";
    wrapper.style.margin = "5px";

    const img = document.createElement("img");
    img.src = data.url;
    img.style.width = "80px";

   const del = document.createElement("button");
del.innerText = "✖";
del.style.position = "absolute";
del.style.top = "0";
del.style.right = "0";
del.style.background = "red";
del.style.color = "white";
del.style.border = "none";
del.style.cursor = "pointer";
del.style.borderRadius = "3px";

    del.onclick = () =>
      deleteMechanicMedia(serviceId, data.id, data.filePath, jobId);

    wrapper.appendChild(img);
    wrapper.appendChild(del);

    container.appendChild(wrapper);
  });
});

  } catch (err) {
    console.log("Media load failed:", err);
  }
}

//delete media function
async function deleteMechanicMedia(serviceId, mediaId, filePath, jobId) {

const jobSnapCheck = await getDoc(doc(db, "jobCards", jobId));
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

// determine correct stage
let newStep = "before";

if (beforeCount >= 3 && duringCount < 3) newStep = "during";
if (beforeCount >= 3 && duringCount >= 3) newStep = "after";

// update service doc
await updateDoc(doc(db, "services", serviceId), {
  currentStep: newStep
});

    // 🔥 reload UI
    loadMechanicMedia(jobId, serviceId);

  } catch (err) {
    console.error("Delete failed:", err);
  }
  listenToJobs();
}