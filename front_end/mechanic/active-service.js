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
  arrayUnion,
  writeBatch
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

const DEMO_ROOM_URL = "https://autocare247.daily.co/bay-1"; 
let callFrame = null;
let wakeLock = null;

// =======================================
// STAGE 1 HELPERS — Vehicle Received
// =======================================
window.vrPreviewImage = function(inputId, previewId, nameId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const placeholder = inputId === 'vrPlateInput' ? document.getElementById('vrPlatePlaceholder') : document.getElementById('vrCarPlaceholder');
  const nameEl = document.getElementById(nameId);
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.style.display = 'flex';
    preview.innerHTML = `<img src="${e.target.result}" alt="preview">`;
    if (placeholder) placeholder.style.display = 'none';
    if (nameEl) nameEl.textContent = file.name;
  };
  reader.readAsDataURL(file);
};

window.onMediaFileSelected = function() {
  // no-op placeholder — file gets picked up by uploadMedia
};

window.markVehicleReceived = async function(jobId) {
  // Validate both images are selected
  const plateInput = document.getElementById('vrPlateInput');
  const carInput   = document.getElementById('vrCarInput');

  if (!plateInput?.files?.[0]) {
    Swal.fire({ icon:'warning', title:'Number Plate Photo Required', text:'Please upload the vehicle number plate photo.', confirmButtonColor:'#2563eb' });
    return;
  }
  if (!carInput?.files?.[0]) {
    Swal.fire({ icon:'warning', title:'Car Bay Photo Required', text:'Please upload the full car photo at the service bay.', confirmButtonColor:'#2563eb' });
    return;
  }
  if (await guardCancelPending(jobId)) return;

  const btn = document.getElementById('vrMarkReceivedBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; }

  try {
    const jobRef  = doc(db, "jobCards", jobId);
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists()) return;
    const jobData2   = jobSnap.data();
    const serviceId = jobData2.serviceId;
    const assignedServiceCenterId = jobData2.assignedServiceCenterId;

    const metadata = { customMetadata: { ownerId: currentUser.uid, assignedServiceCenterId } };
    const uploadFile = async (file, label) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      // FIX: Added /media/ to the path so it is approved by your Firebase Storage Rules
      const storageRef = ref(storage, `services/${serviceId}/media/vehicle_received/${label}_${Date.now()}.${ext}`);
      const task = uploadBytesResumable(storageRef, file, metadata);
      return new Promise((res, rej) => {
        task.on('state_changed', null, rej, async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, 'services', serviceId, 'media'), {
            serviceId, jobId,
            uploadedBy: currentUser.uid,
            url,
            filePath: storageRef.fullPath,
            fileName: file.name,
            type: 'photo',
            label,
            stage: 'vehicle_received',
            createdAt: serverTimestamp()
          });
          res(url);
        });
      });
    };

    await uploadFile(plateInput.files[0], 'vehicle_received_number_plate');
    await uploadFile(carInput.files[0],   'vehicle_received_full_car');

    // Advance stage
    const historyPayload = [
        { action: 'vehicle_received', message: "Vehicle condition and photos recorded", by: currentUser.uid, role: 'mechanic', at: new Date() },
        { action: 'stage_advanced', from: 'vehicle_received', to: 'service_started', by: currentUser.uid, role: 'mechanic', at: new Date() }
    ];

    await updateDoc(doc(db, 'services', serviceId), {
      currentStep: 'service_started',
      updatedAt: serverTimestamp(),
      history: arrayUnion(...historyPayload)
    });
    await updateDoc(jobRef, {
      progress: 'service_started',
      'liveTracking.currentStage': 'Service Started',
      'liveTracking.currentStageIndex': 1,
      stageSummary: { totalStages: 6, completedStages: 1, currentStage: 'Service Started', progressPercent: 16 },
      updatedAt: serverTimestamp(),
      history: arrayUnion(...historyPayload)
    });

    Swal.fire({ icon:'success', title:'Vehicle Received!', text:'Photos uploaded and stage advanced successfully.', confirmButtonColor:'#2563eb', timer:2000, showConfirmButton:false });
    setTimeout(() => loadActiveService(jobId), 2100);

  } catch (err) {
    console.error('Vehicle received upload failed:', err);
    Swal.fire({ icon:'error', title:'Upload Failed', text: err.message });
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mark Vehicle Received'; }
  }
};



// Guard: blocks all mechanic actions if cancel request is pending
async function guardCancelPending(jobId) {
  const snap = await getDoc(doc(db, "jobCards", jobId));
  if (!snap.exists()) return false;
  const d = snap.data();
  if (d.cancelRequested === true) {
    Swal.fire({
      icon: "warning",
      title: "Actions Locked",
      html: `<p>Your <strong>cancellation request</strong> is pending admin review.</p><p style="color:#64748b;margin-top:8px;font-size:13px;">All actions are locked until the admin responds.</p>`,
      confirmButtonColor: "#ea580c",
      confirmButtonText: "OK"
    });
    return true; // blocked
  }
  return false; // not blocked
}
// logout
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);

      alert("Logged out successfully");

      window.location.href = "../index.html";

    } catch (error) {
      console.error("Logout failed:", error);
      alert("Logout failed");
    }
  });
}

const params = new URLSearchParams(window.location.search);
let jobId = params.get("id");



//authentication

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../index.html";
    return;
  }
  
  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists() || userSnap.data().role !== "mechanic") {
    window.location.href = "../index.html";
    return;
  }

 // 🔴 NEW LOGIC: Check for ID, if missing, auto-fetch the active job
  if (jobId) {
    setupRealtimeJobListener(jobId); // 🔥 NEW: Attach real-time listener
    loadActiveService(jobId);
  } else {
    await autoFetchActiveJob(user.uid);
  }
});

// ==========================================
// REAL-TIME ADMIN APPROVAL/REJECTION LISTENER
// ==========================================
let jobListenerUnsubscribe = null;

function setupRealtimeJobListener(activeJobId) {
    if (jobListenerUnsubscribe) return;
    
    let prevCancelRequested = null; // track state changes

    jobListenerUnsubscribe = onSnapshot(doc(db, "jobCards", activeJobId), async (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        // 1. Work approved → redirect
        if (data.status === "work_done" || data.status === "completed") {
            Swal.fire({
                icon: "success",
                title: "Work Approved! ✅",
                text: "Your work has been approved by the Admin. This job has been moved to your History.",
                confirmButtonColor: "#16a34a",
                confirmButtonText: "Go to Dashboard",
                allowOutsideClick: false
            }).then(() => { window.location.href = "mechanic-dashboard.html"; });
            return;
        }
        
        // 2. Service Cancelled (Admin approved cancellation or cancelled outright)
        if (data.status === "cancelled") {
             Swal.fire({
                icon: "error",
                title: "Service Cancelled",
                text: "This service has been cancelled and is no longer active.",
                confirmButtonColor: "#dc2626",
                confirmButtonText: "Go to Dashboard",
                allowOutsideClick: false
            }).then(() => { window.location.href = "mechanic-dashboard.html"; });
            return;
        }

        // 3. Re-inspection requested
        if (data.status === "in_progress" && data.progress === "re_inspection") {
            // FIX: Check for the specific Re-Inspection UI so it correctly triggers even from the Pending screen
            const isOnReInspectionUI = document.querySelector(".rs-dashboard-wrapper");
            
            if (!isOnReInspectionUI) {
                Swal.fire({
                    icon: "warning",
                    title: "Re-Inspection Requested",
                    text: "Admin has requested a Re-Inspection. Please check the new instructions.",
                    confirmButtonColor: "#ea580c"
                });
                loadActiveService(activeJobId);
            }
        }

        // 4. Cancel request REJECTED by admin (Ensures it ignores if status is cancelled)
        if (prevCancelRequested === true && data.cancelRequested === false && data.cancelRejectionNote && data.status !== "cancelled") {
            Swal.fire({
                icon: "info",
                title: "Cancel Request Rejected",
                html: `
                    <p style="color:#374151;margin-bottom:8px;">Your cancellation request was <strong>rejected</strong> by the admin.</p>
                    <div style="background:#f1f5f9;border-radius:8px;padding:12px;text-align:left;">
                        <span style="font-size:12px;color:#64748b;font-weight:600;">Reason from Admin:</span>
                        <p style="color:#0f172a;margin-top:4px;font-size:14px;">${data.cancelRejectionNote}</p>
                    </div>
                    <p style="color:#16a34a;margin-top:12px;font-size:13px;">Please continue working on the service.</p>
                `,
                confirmButtonColor: "#2563eb",
                confirmButtonText: "Continue Working",
                allowOutsideClick: false
            });
            loadActiveService(activeJobId);
        }

        prevCancelRequested = data.cancelRequested ?? false;
    });
}

// ==========================================
// AUTO-FETCH ACTIVE JOB (For Sidebar Clicks)
// ==========================================
async function autoFetchActiveJob(uid) {
    try {
        const q = query(
            collection(db, "jobCards"),
            where("mechanicId", "==", uid),
            // FIX: Removed "assigned" and "job_assigned" so new jobs don't appear here until started
            where("status", "in", ["in_progress", "pending_approval", "re_inspection"])
        );
        
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            // Found an active job! Grab the ID, update the URL silently, and load it.
            jobId = snap.docs[0].id;
            window.history.replaceState(null, null, `?id=${jobId}`); 
            setupRealtimeJobListener(jobId); // Attach real-time listener
            loadActiveService(jobId);
        } else {
            // No active jobs found. Show the empty state.
            showEmptyState();
        }
    } catch (error) {
        console.error("Error fetching active job:", error);
        showEmptyState();
    }
}

// Shows a friendly message if the mechanic has no active jobs
function showEmptyState() {
    const summaryCard = document.getElementById("serviceSummaryCard");
    const layoutCard = document.querySelector(".active-service-layout");
    const liveTrackingCard = document.querySelector(".live-tracking-card");
    
    // Hide the empty, broken panels
    if (layoutCard) layoutCard.style.display = "none"; 
    if (liveTrackingCard) liveTrackingCard.style.display = "none";
    
    // Show a clean "No Active Jobs" message
    if (summaryCard) {
        summaryCard.innerHTML = `
            <div style="text-align:center; padding: 80px 20px; background:#fff; border-radius:16px; border: 1px solid #f1f5f9; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                <div style="font-size: 64px; margin-bottom: 16px;">🛌</div>
                <h2 style="color: #0f172a; margin-bottom: 8px;">No Active Service</h2>
                <p style="color: #64748b; max-width: 400px; margin: 0 auto;">You don't have any vehicles in progress right now. Head over to your dashboard to accept and start a new job.</p>
                <a href="mechanic-dashboard.html" style="display:inline-block; margin-top:24px; padding:12px 24px; background:#2563eb; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold; box-shadow: 0 4px 12px rgba(37,99,235,0.2);">Go to Dashboard</a>
            </div>
        `;
    }
}
//media flow function
window.openMediaFlow = async function(jobId) {
  try {
    // 🛑 1. CHECK FOR EXISTING ACTIVE JOBS FIRST 🛑
    const activeCheckQuery = query(
      collection(db, "jobCards"),
      where("mechanicId", "==", currentUser.uid),
      where("status", "in", ["in_progress", "pending_approval", "re_inspection"])
    );
    const activeCheckSnap = await getDocs(activeCheckQuery);
    
    if (!activeCheckSnap.empty) {
        alert("⚠️ You already have an active job in progress! Please complete your current vehicle or wait for admin approval before starting a new one.");
        return; // Stop them from starting another job
    }

    const jobRef = doc(db, "jobCards", jobId);

    // 1️⃣ get job first
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists()) {
        alert("Error: Job not found in database.");
        return;
    }

    const jobData = jobSnap.data();
    
    // SAFETY CHECK: Ensure data and serviceId exist before trying to read them
    if (!jobData || !jobData.serviceId) {
        alert("Error: Missing Service ID on this job card.");
        return;
    }
    const serviceId = jobData.serviceId;

    // 🔒 USE FIRESTORE BATCH TO PREVENT DESYNC
    const batch = writeBatch(db);

    // 2️⃣ update ONLY job card
    batch.update(jobRef, {
      status: "in_progress",
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      history: arrayUnion({
        action: "job_started", 
        message: "Mechanic started working on the vehicle",
        by: currentUser.uid,
        role: "mechanic",
        at: new Date(), 
        jobId: jobId
      })
    });

    // 3️⃣ update service doc status ONLY
    batch.update(doc(db, "services", serviceId), {
      serviceStatus: "in_progress",
      updatedAt: serverTimestamp(),
      history: arrayUnion({
        action: "job_started", // Standardized to action
        message: "Mechanic started working on the vehicle",
        by: currentUser.uid,
        role: "mechanic",
        at: new Date(), // Standardized to at
        jobId: jobId
      })
    });

    // 🔥 COMMIT BOTH SIMULTANEOUSLY
    await batch.commit();

    // 4️⃣ redirect
    window.location.href = `active-service.html?id=${jobId}`;

  } catch (err) {
    console.error("Start work failed:", err);
    alert("Failed to start job: " + err.message);
  }
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
  const liveCard = document.querySelector(".live-tracking-card");
  if (!liveCard) return;

  const isLiveOn           = !!serviceData.liveEnabled;
  const isCameraOn         = !!serviceData.cameraActive; // NEW STATE
  const status             = serviceData.serviceStatus || jobData.status || "";
  const cancelPending      = jobData.cancelRequested === true || serviceData.cancelRequested === true;
  const isPendingApproval  = status === "pending_approval";
  const isWorkDone         = status === "work_done";
  const isCompleted        = ["completed", "cancelled"].includes(status);
  const isReInspection     = serviceData.currentStep === "re_inspection";

  // Auto-enable for re-inspection
  if (isReInspection && !isLiveOn && !isPendingApproval && !isCompleted && !cancelPending) {
    try {
      await updateDoc(doc(db, "services", jobData.serviceId), { liveEnabled: true, liveStartedAt: serverTimestamp(), liveStartedBy: currentUser.uid, cameraActive: false });
      await updateDoc(doc(db, "jobCards", jobId), { "liveTracking.enabled": true, "liveTracking.startedAt": serverTimestamp(), "liveTracking.startedBy": currentUser.uid, "liveTracking.cameraActive": false });
      loadActiveService(jobId); return;
    } catch (e) { console.error(e); }
  }

  // Auto-disable if cancel pending
  if (cancelPending && isLiveOn) {
    try {
      await updateDoc(doc(db, "services", jobData.serviceId), { liveEnabled: false, liveEndedAt: serverTimestamp(), cameraActive: false });
      await updateDoc(doc(db, "jobCards", jobId), { "liveTracking.enabled": false, "liveTracking.endedAt": serverTimestamp(), "liveTracking.cameraActive": false });
      if(callFrame) { callFrame.leave(); callFrame.destroy(); callFrame = null; }
      document.getElementById("mechanicLiveWrapper").style.display = "none";
      loadActiveService(jobId); return;
    } catch (e) { console.error(e); }
  }

  const wasEverOn = isLiveOn || !!serviceData.liveStartedAt;
  const toggleLocked = wasEverOn || isReInspection || isPendingApproval || isWorkDone || isCompleted || cancelPending;

  let titleText = "Live Tracking Master", subText = "Enable tracking to unlock the camera broadcast switch.", extraMsg = "";
  if (cancelPending) { titleText = "🔴 Live Tracking — Disabled"; subText = "Live tracking is disabled while cancellation is pending."; }
  else if (isLiveOn) { titleText = "🟢 Live Tracking is ON"; subText = "Feature unlocked. You can now toggle your camera on and off as needed."; }
  else if (isPendingApproval || isWorkDone || isCompleted) { subText = "Live tracking is no longer available at this stage."; }

  // Inject UI
  liveCard.innerHTML = `
    <div class="live-toggle-row">
      <div class="live-toggle-left">
        <div class="live-toggle-title">${titleText}</div>
        <div class="live-toggle-sub">${subText}</div>
        ${extraMsg}
      </div>
      <div class="live-toggle-right">
        <span class="live-toggle-label">${isLiveOn ? "LIVE ON" : "START LIVE"}</span>
        <label class="toggle-switch">
          <input type="checkbox" id="liveToggle" ${isLiveOn ? "checked" : ""} ${toggleLocked ? "disabled" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    ${isLiveOn && !cancelPending && !isPendingApproval && !isCompleted && !isWorkDone ? `
    <div class="camera-broadcast-row" style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
        <div>
            <div style="font-size: 15px; font-weight: 700; color: ${isCameraOn ? '#dc2626' : '#0f172a'}; display: flex; align-items: center; gap: 8px;">
                ${isCameraOn ? '<div style="width: 10px; height: 10px; background: red; border-radius: 50%; animation: pulse 1.5s infinite;"></div>' : '<i class="fa-solid fa-video-slash"></i>'}
                Camera Broadcast
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Turn ON ONLY when showing the vehicle to save credits.</div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 12px; font-weight: 700; color: ${isCameraOn ? '#dc2626' : '#64748b'};">${isCameraOn ? "BROADCASTING" : "OFF"}</span>
            <label class="toggle-switch">
                <input type="checkbox" id="cameraToggle" ${isCameraOn ? "checked" : ""}>
                <span class="toggle-slider" style="${isCameraOn ? 'background: #dc2626;' : ''}"></span>
            </label>
        </div>
    </div>
    ` : ""}
  `;

  // --- PiP UI Logic ---
  const wrapper = document.getElementById("mechanicLiveWrapper");
  const toggleBtn = document.getElementById("toggleSizeBtn");
  let isMinimized = false;

  const setFullScreen = () => {
      wrapper.style.position = "fixed"; wrapper.style.inset = "0";
      wrapper.style.width = "100%"; wrapper.style.height = "100%";
      wrapper.style.zIndex = "9999"; wrapper.style.borderRadius = "0";
      if(toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-compress"></i> Minimize';
      isMinimized = false;
  };
  const setPiP = () => {
      wrapper.style.position = "fixed"; wrapper.style.inset = "auto 20px 20px auto";
      wrapper.style.width = "130px"; wrapper.style.height = "180px";
      wrapper.style.zIndex = "9999"; wrapper.style.borderRadius = "12px";
      wrapper.style.overflow = "hidden";
      if(toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
      isMinimized = true;
  };
  if(toggleBtn) toggleBtn.onclick = () => { isMinimized ? setFullScreen() : setPiP(); };

  // Restore camera state if mechanic refreshes the browser
  if (isCameraOn && !callFrame && !toggleLocked) {
      wrapper.style.display = "flex";
      setFullScreen();
      callFrame = window.DailyIframe.createFrame(document.getElementById("mechanicVideoContainer"), {
          iframeStyle: { width: '100%', height: '100%', border: '0' }, showLeaveButton: false, showFullscreenButton: false
      });
      callFrame.join({ url: DEMO_ROOM_URL });
  }

  // --- Master Live Toggle Logic (No longer joins Daily) ---
  if (!toggleLocked) {
    const liveToggle = document.getElementById("liveToggle");
    if (liveToggle) {
      liveToggle.addEventListener("change", async () => {
        const enabled = liveToggle.checked;
        try {
          await updateDoc(doc(db, "services", jobData.serviceId), { liveEnabled: enabled, liveStartedAt: enabled ? serverTimestamp() : null, liveStartedBy: enabled ? currentUser.uid : null, cameraActive: false });
          await updateDoc(doc(db, "jobCards", jobId), { "liveTracking.enabled": enabled, "liveTracking.startedAt": enabled ? serverTimestamp() : null, "liveTracking.startedBy": enabled ? currentUser.uid : null, "liveTracking.cameraActive": false });
          if (enabled) { liveToggle.disabled = true; loadActiveService(jobId); }
        } catch (error) {
          console.error("Live toggle failed:", error); liveToggle.checked = false; alert("Setup failed.");
        }
      });
    }
  }

  // --- NEW Camera Power Logic ---
  const cameraToggle = document.getElementById("cameraToggle");
  if (cameraToggle) {
      cameraToggle.addEventListener("change", async (e) => {
          const enabled = e.target.checked;
          try {
              // 1. UPDATE DATABASE FIRST (Guarantees the switch never gets stuck)
              await updateDoc(doc(db, "services", jobData.serviceId), { cameraActive: enabled });
              await updateDoc(doc(db, "jobCards", jobId), { "liveTracking.cameraActive": enabled });
              
              // 2. THEN HANDLE CAMERA
              if (enabled) {
                  if ('wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {} }
                  wrapper.style.display = "flex";
                  setFullScreen();
                  if (!callFrame) {
                      callFrame = window.DailyIframe.createFrame(document.getElementById("mechanicVideoContainer"), {
                          iframeStyle: { width: '100%', height: '100%', border: '0' }, showLeaveButton: false, showFullscreenButton: false
                      });
                  }
                  await callFrame.join({ url: DEMO_ROOM_URL });
              } else {
                  if (callFrame) {
                      await callFrame.leave();
                      callFrame.destroy();
                      callFrame = null;
                  }
                  wrapper.style.display = "none";
                  if (wakeLock !== null) { await wakeLock.release(); wakeLock = null; }
              }
              
              loadActiveService(jobId); 
          } catch (error) {
              console.error("Camera toggle failed:", error); 
              // Only revert if the DB fails
              cameraToggle.checked = !enabled; 
              alert("Camera error. Please try again.");
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
if (jobStatusCheck.status !== "in_progress" || jobStatusCheck.progress === "re_inspection") {
  alert("🔒 Work locked. You are in re-inspection. Please upload a fix photo using the re-inspection section.");
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

// 🗑️ DELETED the auto-advance logic! 
// It was skipping the history/stageSummary updates and breaking the timeline.
// The mechanic must explicitly click "Mark Stage Complete" now to trigger the correct tracking updates.

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

    // ─── Pills ───────────────────────────────────────────
    const pillsRow = document.getElementById("mediaPillsRow");
    if (pillsRow) {
      const stagePills = [
        { key:"before", label:"Before Service", count: beforeCount },
        { key:"during", label:"During Service", count: duringCount },
        { key:"after",  label:"After Service",  count: afterCount  }
      ];
      pillsRow.innerHTML = stagePills.map((sp, i) => {
        const done = sp.count >= MIN;
        const active = i === 0 ? (beforeCount < MIN) : i === 1 ? (duringCount < MIN && beforeCount >= MIN) : (afterCount < MIN && duringCount >= MIN);
        const locked = (i === 1 && beforeCount < MIN) || (i === 2 && duringCount < MIN);
        const cls = done ? "pill-done" : locked ? "pill-locked" : "pill-active";
        return `<div class="media-pill ${cls}">
          ${locked ? `<i class="fa-solid fa-lock"></i>` : done ? `<i class="fa-solid fa-circle-check"></i>` : `<i class="fa-solid fa-circle-dot"></i>`}
          <div>
            <span class="pill-label">${sp.label}</span>
            <span class="pill-count">${sp.count} / 3</span>
          </div>
          <span class="pill-status">${done ? "Completed" : locked ? "Locked" : "In Progress"}</span>
        </div>`;
      }).join('<div class="pill-connector"></div>');
    }

    // ─── Uploaded Media Grid ──────────────────────────────
    const previewGrid = document.getElementById("mediaPreviewGrid");
    if (previewGrid) {
      const allPhotos = [...grouped.before, ...grouped.during, ...grouped.after];
      const allVideos = grouped.video;

      let html = "";
      const stageLabels = { before:"Before Service", during:"During Service", after:"After Service" };

      ["before","during","after"].forEach(stageKey => {
        const items = grouped[stageKey];
        const cnt = stageKey === "before" ? beforeCount : stageKey === "during" ? duringCount : afterCount;
        const needed = Math.max(0, MIN - cnt);
        html += `
        <div class="media-uploaded-section">
          <div class="media-uploaded-section-header">
            <h5>Photos <span class="media-cnt-badge">${cnt}/3</span></h5>
            <span class="media-min-badge">Min. 2 photos required</span>
          </div>
          <p class="media-section-label">${stageLabels[stageKey]}</p>
          <div class="media-thumbs-grid">
            ${items.filter(d=>d.type!=="video").map(data => {
              const safeFilePath = (data.filePath||"").replace(/'/g,"\\'");
              return `<div class="media-thumb-item">
                <img src="${data.url}" onclick="openMediaModal('${data.url}','image')" alt="photo">
                <button class="media-thumb-del" onclick="deleteMechanicMedia_global('${serviceId}','${data.id}','${safeFilePath}','${jobId}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                <span class="media-thumb-name">${data.fileName||''}</span>
              </div>`;
            }).join("")}
            ${needed > 0 ? `<div class="media-thumb-add"><i class="fa-solid fa-plus"></i><span>Add Photo</span><small>${needed} more required</small></div>` : ""}
          </div>
        </div>`;
      });

      // Videos section
      html += `
      <div class="media-uploaded-section">
        <div class="media-uploaded-section-header">
          <h5>Videos <span class="media-cnt-badge">${allVideos.length}/3</span></h5>
          <span class="media-optional-badge">Optional</span>
        </div>
        <div class="media-thumbs-grid">
          ${allVideos.length === 0
            ? `<div class="media-no-video"><i class="fa-regular fa-circle-play"></i><p>No videos uploaded</p><small>Upload a video (optional)</small></div>`
            : allVideos.map(data => {
                const safeFilePath = (data.filePath||"").replace(/'/g,"\\'");
                return `<div class="media-thumb-item">
                  <video src="${data.url}" onclick="openMediaModal('${data.url}','video')" preload="metadata"></video>
                  <button class="media-thumb-del" onclick="deleteMechanicMedia_global('${serviceId}','${data.id}','${safeFilePath}','${jobId}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>`;
              }).join("")
          }
        </div>
      </div>`;

      previewGrid.innerHTML = html;
    }

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
const serviceData = (await getDoc(doc(db, "services", serviceId))).data();

// Block deletion if cancel is pending
if (jobStatusCheck.cancelRequested) {
  alert("⏳ Cancel request pending. Deletions are locked.");
  return;
}

// Allow deletion during standard progress OR during re_inspection
if (jobStatusCheck.status !== "in_progress" && serviceData.currentStep !== "re_inspection") {
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

// Global wrapper for inline onclick calls in media grid
window.deleteMechanicMedia_global = function(serviceId, mediaId, filePath, jobId) {
  deleteMechanicMedia(serviceId, mediaId, filePath, jobId);
};

//save inspection function

window.saveInspection = async function(jobId) {
  if (await guardCancelPending(jobId)) return;
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

   const historyItem = {
      action: "inspection_saved",
      by: currentUser.uid,
      role: "mechanic",
      at: new Date()
    };

    // 🔒 USE FIRESTORE BATCH TO PREVENT DESYNC
    const batch = writeBatch(db);

    batch.update(doc(db, "services", jobData.serviceId), {
        inspectionReport: {
          issues: checkedIssues,
          severity,
          notes,
          inspectedAt: serverTimestamp(),
          inspectedBy: currentUser.uid
        },
        updatedAt: serverTimestamp(),
        history: arrayUnion(historyItem)
    });

    // ✅ FIX: Synchronize Job Card History
    batch.update(doc(db, "jobCards", jobId), {
        updatedAt: serverTimestamp(),
        history: arrayUnion(historyItem)
    });

    // 🔥 COMMIT BOTH SIMULTANEOUSLY
    await batch.commit();

    alert("✅ Inspection saved! You can now advance to the next stage.");
    loadActiveService(jobId); // re-render to show advance button

  } catch (error) {
    console.error(error);
  }
};

// save test drive function
window.saveTestDrive = async function(jobId) {
  if (await guardCancelPending(jobId)) return;
  try {
    const checkedItems = [...document.querySelectorAll("#testDriveContainer .inspection-options input:checked")].map(el => el.value);
    const distance  = document.getElementById("testDriveDistance")?.value.trim();
    const status    = document.getElementById("testDriveStatus")?.value;
    const notes     = document.getElementById("testDriveNotes")?.value.trim();
    const failNote  = document.getElementById("testDriveFailNote")?.value.trim();
    const jobSnap   = await getDoc(doc(db, "jobCards", jobId));
    const serviceId = jobSnap.data().serviceId;

   const historyItem = {
      action: "test_drive_saved",
      result: status,
      by: currentUser.uid,
      role: "mechanic",
      at: new Date()
    };

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
      history: arrayUnion(historyItem)
    });

    // ✅ FIX: Synchronize Job Card History
    await updateDoc(doc(db, "jobCards", jobId), {
      updatedAt: serverTimestamp(),
      history: arrayUnion(historyItem)
    });

    alert("Test drive report saved (" + (status === "passed" ? "Passed" : "Failed") + "). You can now advance.");
    loadActiveService(jobId);

  } catch (error) {
    console.error("Test drive save failed:", error);
  }
};

//stage progress function
window.advanceStage = async function(jobId) {
  if (await guardCancelPending(jobId)) return;
  try {

    const jobSnap = await getDoc(doc(db, "jobCards", jobId));
    if (!jobSnap.exists()) return;

    const jobData = jobSnap.data();
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
    // re_inspection is handled separately — not in normal advance flow

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

  // 🔒 USE FIRESTORE BATCH TO PREVENT DESYNC
    const batch = writeBatch(db);

    batch.update(serviceRef, {
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

    // sync jobcard progress dynamically
    const hasReInspection = serviceData.history && serviceData.history.some(h => h.action === "re_inspection_requested");
    const totalStagesCount = hasReInspection ? 7 : 6;

    batch.update(doc(db, "jobCards", jobId), {
      progress: nextStage,
      "liveTracking.currentStage": nextStage.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()),
      "liveTracking.currentStageIndex": currentIndex + 1,
      stageSummary: {
        totalStages: totalStagesCount,
        completedStages: currentIndex + 1,
        currentStage: nextStage.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()),
        progressPercent: Math.floor(((currentIndex + 1) / totalStagesCount) * 100)
      },
      history: arrayUnion({
        action: "stage_advanced",
        from: current,
        to: nextStage,
        by: currentUser.uid,
        role: "mechanic",
        at: new Date()
      }),
      updatedAt: serverTimestamp()
    });

    // 🔥 COMMIT BOTH SIMULTANEOUSLY
    await batch.commit();

    loadActiveService(jobId);

  } catch (error) {
    console.error("Stage advance failed:", error);
  }
};
//complete job function
// ==========================================
// RE-INSPECTION UPLOAD & SUBMISSION LOGIC
// ==========================================
window.uploadReInspectionPhoto = async function(jobId) {
    const fileInput = document.getElementById("reInspectionFile");
    
    // 1. Safely check if the input and file exist
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Please select a fix photo first!");
        return;
    }

    const file = fileInput.files[0];

    // 2. Prevent the 'split' error by ensuring the file has a valid name
    if (!file || !file.name) {
        alert("Invalid file structure. Please try selecting the image again.");
        return;
    }

    try {
        // Update button UI to show progress
        const btn = document.querySelector(".save-inspection-btn");
        if (btn) {
            btn.innerText = "Uploading... Please wait";
            btn.disabled = true;
        }

        // Get the parent service ID from the jobCard
        const jobRef = doc(db, "jobCards", jobId);
        const jobSnap = await getDoc(jobRef);
        if (!jobSnap.exists()) throw new Error("Job card not found in database.");
        
        const serviceId = jobSnap.data().serviceId;
        const serviceRef = doc(db, "services", serviceId);

        // 3. Safely split the name and upload to Firebase Storage
        const ext = file.name.split('.').pop();
        const fileName = `re_inspection_${Date.now()}.${ext}`;
        const storageRef = ref(storage, `services/${serviceId}/re_inspection/${fileName}`);
        
        const snapshot = await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        // 4. Update the Service Document (Sends it back to Admin)
        await updateDoc(serviceRef, {
            serviceStatus: "pending_approval",
            currentStep: "pending_approval",
            reInspectionPhotoUploaded: true,
            updatedAt: serverTimestamp(),
            history: arrayUnion({
                action: "re_inspection_submitted",
                note: "Mechanic uploaded the re-inspection fix photo and submitted for approval.",
                at: new Date(),
                by: currentUser.uid
            })
        });

      // 5. Update the Job Card Document (Full tracking sync)
        await updateDoc(jobRef, {
            status: "pending_approval",
            progress: "pending_approval",
            "liveTracking.currentStage": "Pending Approval",
            "liveTracking.enabled": false,
            "liveTracking.endedAt": serverTimestamp(),
            stageSummary: {
                totalStages: 7,
                completedStages: 7,
                currentStage: "Pending Approval",
                progressPercent: 100
            },
            updatedAt: serverTimestamp(),
            history: arrayUnion({
                action: "stage_advanced",
                from: "re_inspection",
                to: "pending_approval",
                by: currentUser.uid,
                role: "mechanic",
                at: new Date()
            })
        });

        // 6. Log the media upload
        await addDoc(collection(db, "media"), {
            serviceId: serviceId,
            jobId: jobId,
            mechanicId: currentUser.uid,
            url: downloadURL,
            type: "image",
            stage: "re_inspection",
            uploadedAt: serverTimestamp()
        });

        alert("Fix uploaded successfully! The service is back under Admin review.");
        window.location.reload(); // Reloads to trigger the pending approval UI

    } catch (error) {
        console.error("Re-inspection upload error:", error);
        alert("Upload failed: " + error.message);
        
        // Reset button if it fails
        const btn = document.querySelector(".save-inspection-btn");
        if (btn) {
            btn.innerText = "Upload Fix Photo";
            btn.disabled = false;
        }
    }
};

window.completeService = async function(jobId) {
  if (await guardCancelPending(jobId)) return;

const btn = document.getElementById("completeServiceBtn");
const jobSnap = await getDoc(doc(db, "jobCards", jobId));
if (!jobSnap.exists()) return;
const jobData = jobSnap.data();

const serviceSnap = await getDoc(
  doc(db, "services", jobData.serviceId)
);

const serviceData = serviceSnap.data();

  // 🚫 5-minute lock after rejection
  if (jobData.lastRejectionTime) {
    const lastRejection = jobData.lastRejectionTime.toDate();
    const minutesDiff = (new Date() - lastRejection) / 60000;
    if (minutesDiff < 5) {
      alert(`⏳ Please wait ${Math.ceil(5 - minutesDiff)} minutes before resubmitting.`);
      if (btn) btn.disabled = false;
      return;
    }
  }

    // 🔁 Re-inspection rule: MUST have 1-2 Photos and exactly 1 Video
  if (serviceData.currentStep === "re_inspection") {
    const mediaSnapRe = await getDocs(collection(db, "services", jobData.serviceId, "media"));
    let rPhotos = 0;
    let rVideos = 0;
    
    mediaSnapRe.forEach(doc => {
      const docData = doc.data();
      if (docData.stage === "re_inspection") {
        if (docData.type === "video") rVideos++;
        else rPhotos++;
      }
    });
    
    if (rPhotos < 1 || rPhotos > 2 || rVideos !== 1) {
      alert(`❌ Requirements not met! You have ${rPhotos}/2 Photos and ${rVideos}/1 Videos. Please upload 1-2 photos and exactly 1 video.`);
      if (btn) btn.disabled = false;
      return;
    }
  }
  
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

   const isReSubmit = serviceData.currentStep === "re_inspection";
    const totalStagesCount = (serviceData.rejectionHistory?.length > 0 || isReSubmit) ? 7 : 6;

    // 🔒 USE FIRESTORE BATCH TO PREVENT DESYNC
    const batch = writeBatch(db);

    // ✅ SAFE COMPLETE (jobCard) - Now updates full tracking history
    batch.update(jobRef, {
      status: "pending_approval",
      progress: "pending_approval",
      completedAt: serverTimestamp(),
      "liveTracking.currentStage": "Pending Approval",
      "liveTracking.enabled": false,
      "liveTracking.endedAt": serverTimestamp(),
      stageSummary: {
        totalStages: totalStagesCount,
        completedStages: totalStagesCount,
        currentStage: "Pending Approval",
        progressPercent: 100
      },
      history: arrayUnion({
        action: "stage_advanced",
        from: serviceData.currentStep,
        to: "pending_approval",
        by: currentUser.uid,
        role: "mechanic",
        at: new Date()
      })
    });

    // update service status + auto-disable live
    batch.update(doc(db, "services", serviceId), {
      serviceStatus: "pending_approval",
      currentStep: "pending_approval",
      liveEnabled: false,
      liveEndedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      history: arrayUnion({
        action: isReSubmit ? "re_submitted_for_approval" : "submitted_for_approval",
        by: currentUser.uid,
        role: "mechanic",
        at: new Date()
      })
    });

    // 🔥 COMMIT BOTH SIMULTANEOUSLY
    await batch.commit();

    // ✅ FIX: Trigger UI update so it doesn't freeze on "Submitting..."
    Swal.fire({
      icon: "success",
      title: "Submitted!",
      text: "Work submitted successfully for admin review.",
      confirmButtonColor: "#2563eb",
      timer: 2000,
      showConfirmButton: false
    });
    
    setTimeout(() => {
        window.location.reload(); // Hard reload perfectly initializes the Pending Approval dashboard
    }, 2000);

  } catch (error) {
    console.error("Error completing job:", error);
    alert("Failed to submit: " + error.message);
    if (btn) {
      btn.disabled = false;
      btn.innerText = "✅ Submit for Admin Verification";
    }
  }
}


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
      cancelRequestedAt: serverTimestamp(),
      cancelRejectionNote: null, // Wipe old data
      cancelRejectedAt: null,    // Wipe old data
      "liveTracking.currentStage": "Cancellation Requested",
      "liveTracking.enabled": false,
      "liveTracking.endedAt": serverTimestamp(),
      "stageSummary.currentStage": "Cancellation Requested",
      history: arrayUnion({
        action: "cancel_requested",
        reason,
        by: currentUser.uid,
        role: "mechanic",
        at: new Date()
      })
    });
    await updateDoc(doc(db, "services", serviceId), {
      cancelRequested: true,
      cancelReason: reason,
      cancelRequestedAt: serverTimestamp(),
      cancelRejectionNote: null, // Wipe old data
      cancelRejectedAt: null,    // Wipe old data
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
};;

window.closeCancelModal = function() {
  const modal = document.getElementById("cancelModal");
  if (modal) modal.style.display = "none";
};

// =============================================
function renderCancelButtonHTML(jobId) {
  return `
    <button onclick="requestCancel('${jobId}')" class="header-cancel-btn">
  Cancel Service
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
  const container = document.getElementById("headerCancelBtn");
  if (!container) return;

  const cancelPending  = jobData.cancelRequested === true;
  const alreadyCancelled = jobData.status === "cancelled" || serviceData.serviceStatus === "cancelled";
  const completed = jobData.status === "pending_approval" || serviceData.serviceStatus === "pending_approval" || jobData.status === "completed";

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
  // Smooth fade transition
  const workPanel = document.querySelector('.service-work-panel');
  if (workPanel) { workPanel.style.opacity = '0.5'; workPanel.style.transition = 'opacity 0.25s ease'; }

  const jobSnap = await getDoc(doc(db, "jobCards", jobId));
  if (!jobSnap.exists()) return;

  const jobData = {
    id: jobSnap.id,
    ...jobSnap.data()
  };

  const serviceSnap = await getDoc(doc(db, "services", jobData.serviceId));
  const serviceData = serviceSnap.exists() ? serviceSnap.data() : {};

  // 🔴 AUTO-REDIRECT LOGIC: If work is approved or completed, kick them to dashboard/history
  if (
      serviceData.serviceStatus === "work_done" || 
      serviceData.serviceStatus === "completed" ||
      jobData.status === "work_done" || 
      jobData.status === "completed"
  ) {
      alert("✅ Your work has been approved by the Admin! This job has been moved to your History.");
      window.location.href = "mechanic-dashboard.html";
      return; 
  }

  // CUSTOMER INFO
  let customerData = {};
  if (jobData.customerId) {
    const customerSnap = await getDoc(doc(db, "users", jobData.customerId));
    if (customerSnap.exists()) {
      customerData = customerSnap.data();
    }
  }

  // GET MECHANIC NAME
  const mechanicSnap = await getDoc(doc(db, "users", currentUser.uid));
  const currentMechanicName = mechanicSnap.exists() ? mechanicSnap.data().name : "Mechanic";

  renderServiceSummary(jobData, customerData, serviceData);
  renderServiceStages(serviceData);
  // Pass the mechanic name to the render function
  await renderCurrentStage(serviceData, jobId, jobData, customerData, currentMechanicName);
  renderCancelButton(jobData, serviceData, jobId);

  startServiceTimer(jobData.startedAt);
  setupLiveToggle(jobData, serviceData);

  // Restore opacity after render
  setTimeout(() => {
    const wp = document.querySelector('.service-work-panel');
    if (wp) { wp.style.opacity = '1'; }
  }, 50);
}

//summary render

function renderServiceSummary(jobData, customerData, serviceData) {
  const card = document.getElementById("serviceSummaryCard");
  if (!card) return;

  // Format startedAt
  const startedAt = jobData.startedAt?.toDate?.() || null;
  const startedStr = startedAt
    ? startedAt.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : "—";

  // Status badge
  const statusMap = {
    in_progress: "In Progress", assigned: "Assigned",
    job_assigned: "Job Assigned", pending_approval: "Pending Approval",
    completed: "Completed", cancelled: "Cancelled"
  };
  const statusLabel = statusMap[jobData.status] || jobData.status || "—";

  // Car info from snapshot
  const car = jobData.carSnapshot || {};
  const svc = jobData.serviceSnapshot || {};
  const cust = jobData.customerSnapshot || {};
  const sc = jobData.serviceCenterSnapshot || {};
  const estTime = serviceData?.estimatedTime || "—";

  card.innerHTML = `
    <div class="service-summary-card">

      <!-- LEFT: Car + Service Info -->
      <div class="summary-car-block">
        ${car.imageUrl
          ? `<img class="summary-car-img" src="${car.imageUrl}" alt="car">`
          : `<div class="summary-car-img-placeholder">🚗</div>`}
        <div>
          <div class="summary-service-id">Service ID</div>
          <div class="summary-service-id-val">${jobData.jobId || jobData.id || "—"}</div>
          <span class="summary-status-badge">${statusLabel}</span>
          <div class="summary-car-name">${car.brand || ""} ${car.model || ""} (${car.carNumber || ""})</div>
          <div class="summary-car-meta">${svc.serviceType || svc.issueDescription || jobData.notes || "—"}</div>
          <div class="summary-location">
            <i class="fa-solid fa-location-dot"></i>
            ${sc.name || "—"}
          </div>
        </div>
      </div>

      <!-- MIDDLE: Customer -->
      <div class="summary-customer-block">
        ${cust.profileImage
          ? `<img class="summary-customer-img" src="${cust.profileImage}" alt="customer">`
          : `<div class="summary-customer-img" style="background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:22px;">👤</div>`}
        <div>
          <div class="summary-customer-label">Customer</div>
          <div class="summary-customer-name">${cust.name || customerData?.name || "—"}</div>
          <div class="summary-customer-phone">
            <i class="fa-solid fa-phone" style="font-size:12px;color:#2563eb;"></i>
            ${cust.phone || customerData?.phone || "—"}
          </div>
        </div>
      </div>

      <!-- RIGHT: Time Info -->
      <div class="summary-time-block">
        <div>
          <div class="summary-time-label">Started At</div>
          <div class="summary-time-val">${startedStr}</div>
        </div>
        <div>
          <div class="summary-time-label">Est. Time</div>
          <div class="summary-time-val">${estTime}</div>
        </div>
        <div>
          <div class="summary-time-label">Time Elapsed</div>
          <div class="summary-elapsed-val">
            <i class="fa-regular fa-clock"></i>
            <span id="elapsedTimer">—</span>
          </div>
        </div>
      </div>

    </div>
  `;

  // Start elapsed timer
  if (startedAt) {
    const update = () => {
      const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      const el = document.getElementById("elapsedTimer");
      if (el) el.textContent = `${h}h ${m}m ${s}s`;
    };
    update();
    setInterval(update, 1000);
  }
}


//stage timeline render

function renderServiceStages(serviceData) {
  
  // NEW: Check the main history array for the rejection event
  const hasReInspectionEvent = serviceData.history && serviceData.history.some(h => 
      h.action === "re_inspection_requested" || h.action === "re_submitted_for_approval"
  );
  const showReInspection = serviceData.currentStep === "re_inspection" || !!serviceData.rejectionHistory?.length || hasReInspectionEvent;

  const stages = [
    "vehicle_received",
    "service_started",
    "inspection",
    "uploading_media",
    "test_drive",
    ...(showReInspection ? ["re_inspection"] : []),
    "service_complete"
  ];

  const labels = [
    "Vehicle Received",
    "Service Started",
    "Mechanic Inspecting",
    "Uploading Media",
    "Test Drive",
    ...(showReInspection ? ["Re-Inspection"] : []),
    "Service Complete"
  ];

 const current = serviceData.currentStep || "vehicle_received";

let currentIndex = stages.indexOf(current);

// Mechanic submitted work for admin approval
if (
  serviceData.serviceStatus === "pending_approval" ||
  current === "pending_approval"
) {
  currentIndex = stages.length;
}

// Fully completed
if (
  serviceData.serviceStatus === "completed" ||
  current === "service_complete"
) {
  currentIndex = stages.length;
}

  const container =
    document.getElementById("serviceStagesList");

 const stageDescriptions = {
    vehicle_received: "Vehicle received from customer and initial check done.",
    service_started:  "Service has been started.",
    inspection:       "Inspecting vehicle and identifying issues.",
    uploading_media:  "Upload photos/videos of the service.",
    test_drive:       "Test drive and performance check.",
    re_inspection:    "Re-inspection after admin rejection.",
    service_complete: "Service completed and ready for review."
  };

  // Build timestamp map from history array
  const history = serviceData.history || [];
  const stageTimeMap = {};

  history.forEach(h => {
      // 1. Fetch directly from h.action (the exact stage name) OR h.to (legacy fallback)
      const stageKey = h.to || h.action; 

      // 2. Extract timestamp safely regardless of 'at' or 'timestamp' keys
      let t = null;
      if (h.at && typeof h.at.toDate === 'function') t = h.at.toDate();
      else if (h.timestamp && typeof h.timestamp.toDate === 'function') t = h.timestamp.toDate();
      else if (h.at || h.timestamp) t = new Date(h.at || h.timestamp);

      if (t && !isNaN(t)) {
          stageTimeMap[stageKey] = t.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
          stageTimeMap[stageKey + '_date'] = t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      }

      // 3. Force-map Re-Inspection & Submissions
      if (h.action === "re_submitted_for_approval" || h.action === "re_inspection_submitted") {
          if (t && !isNaN(t)) {
              stageTimeMap["re_inspection"] = t.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
              stageTimeMap["re_inspection_date"] = t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
              stageTimeMap["service_complete"] = stageTimeMap["re_inspection"];
              stageTimeMap["service_complete_date"] = stageTimeMap["re_inspection_date"];
          }
      } else if (h.action === "submitted_for_approval") {
          if (t && !isNaN(t)) {
              stageTimeMap["service_complete"] = t.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
              stageTimeMap["service_complete_date"] = t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          }
      }
  });

  // 4. Force map 'vehicle_received' to job_accepted and 'service_started' to job_started
  const acceptedEvent = history.find(h => h.action === "job_accepted" || h.type === "job_accepted");
  const startedEvent = history.find(h => h.action === "job_started" || h.type === "job_started" || h.action === "work_started");

  // Vehicle Received Execution
  if (acceptedEvent) {
      let t = null;
      if (acceptedEvent.at && typeof acceptedEvent.at.toDate === 'function') t = acceptedEvent.at.toDate();
      else if (acceptedEvent.timestamp && typeof acceptedEvent.timestamp.toDate === 'function') t = acceptedEvent.timestamp.toDate();
      else if (acceptedEvent.at || acceptedEvent.timestamp) t = new Date(acceptedEvent.at || acceptedEvent.timestamp);

      if (t && !isNaN(t)) {
          stageTimeMap["vehicle_received"] = t.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
          stageTimeMap["vehicle_received_date"] = t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      }
  } 
  // FIX: Completely removed the serviceData.createdAt fallback so fake dates don't populate early

  // Service Started Execution
  if (startedEvent) {
      let t = null;
      if (startedEvent.at && typeof startedEvent.at.toDate === 'function') t = startedEvent.at.toDate();
      else if (startedEvent.timestamp && typeof startedEvent.timestamp.toDate === 'function') t = startedEvent.timestamp.toDate();
      else if (startedEvent.at || startedEvent.timestamp) t = new Date(startedEvent.at || startedEvent.timestamp);

      if (t && !isNaN(t)) {
          stageTimeMap["service_started"] = t.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
          stageTimeMap["service_started_date"] = t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      }
  }

  container.innerHTML = stages.map((stage, index) => {
    let statusClass = "pending";
    let statusLabel = "Pending";
    if (index < currentIndex) { statusClass = "completed"; statusLabel = "Completed"; }
    if (index === currentIndex) { statusClass = "in-progress"; statusLabel = "In Progress"; }

    // STRICT RULE: Only extract the time string if the stage is 100% completed
    const timeStr = (statusClass === "completed") ? (stageTimeMap[stage] || "") : "";

    return `
      <div class="stage-item ${statusClass}">
        <div class="stage-dot">${statusClass === "completed" ? "✓" : index + 1}</div>
        <div class="stage-content">
          <div class="stage-title">${labels[index]}</div>
          <div class="stage-desc">${stageDescriptions[stage] || ""}</div>
          <div class="stage-footer">
           ${timeStr ? `<span class="stage-time">${stageTimeMap[stage + '_date'] || ""} &nbsp; ${timeStr}</span>` : ""}
            ${statusLabel !== "Pending" ? `<span class="stage-status-badge ${statusClass}">${statusLabel}</span>` : `<span class="stage-status-text">Pending</span>`}
          </div>
        </div>
      </div>
    `;
  }).join("");
  // Add hint at bottom
  const showHint =
  serviceData.serviceStatus !== "pending_approval" &&
  serviceData.serviceStatus !== "completed";

if (showHint) {
  container.innerHTML += `
    <div class="stages-hint">
      <i class="fa-solid fa-circle-info"
         style="color:#2563eb;font-size:14px;"></i>
      Complete all stages and upload required media to finish the service.
    </div>
  `;
}
}


//current stage render 

// Update the parameters to catch currentMechanicName
async function renderCurrentStage(serviceData, jobId, jobData, customerData, currentMechanicName) {

  const stageMap = {
    vehicle_received: "Vehicle Received",
    service_started: "Service Started",
    inspection: "Mechanic Inspecting the Car",
    uploading_media: "Uploading Media",
    test_drive: "Test Drive",
    re_inspection: "Re-Inspection",
    pending_approval: "Pending Admin Verification",
    service_complete: "Service Complete"
  };

  const current = stageMap[serviceData.currentStep] ? serviceData.currentStep : "vehicle_received";
  const container = document.getElementById("currentStageCard");

  const inspectionSaved    = !!serviceData.inspectionReport;
  const isPendingApproval  = serviceData.serviceStatus === "pending_approval";
  const isReInspection     = current === "re_inspection";
  
 // FIX: Accurately pull the Admin's rejection reason
  const rejectionNote      = serviceData.lastRejectionReason || serviceData.rejectionHistory?.slice(-1)[0]?.reason || "";
  
  // NEW: Check history array to trigger the horizontal bubble
  const hasRejectionInHistory = serviceData.history && serviceData.history.some(h => h.action === "re_inspection_requested");
  const showReInspectBubble = (serviceData.rejectionHistory?.length > 0) || hasRejectionInHistory || isReInspection;

  // Fetch Re-Inspection Media — build separate photo/video arrays
  let reInspPhotos = 0;
  let reInspVideos = 0;
  let reInspPhotoHtml = "";
  let reInspVideoHtml = "";

  if (isReInspection) {
    const currentRound = serviceData.reInspectionRound || 1;
    const mediaSnapRe = await getDocs(collection(db, "services", jobData.serviceId, "media"));
    mediaSnapRe.forEach(mdoc => {
        const d = mdoc.data();
        if (d.stage !== "re_inspection") return;
        const isCurrentRound = (d.reInspectionRound || 1) === currentRound;
        const isVid = d.type === "video";
        const safeFilePath = (d.filePath || "").replace(/'/g, "\\'");
        const thumbHtml = `
          <div class="rs-thumb-item" data-type="${isVid ? 'video' : 'photo'}" data-current-round="${isCurrentRound}">
            ${isVid
              ? `<video src="${d.url}" preload="metadata" onclick="openMediaModal('${d.url}','video')"></video>`
              : `<img src="${d.url}" alt="fix photo" onclick="openMediaModal('${d.url}','image')">`}
            <button class="rs-remove-btn" title="Delete" onclick="event.stopPropagation(); deleteReInspMedia('${jobData.serviceId}','${mdoc.id}','${safeFilePath}','${jobId}')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>`;
        if (isVid) { reInspVideos++; reInspVideoHtml += thumbHtml; }
        else { reInspPhotos++; reInspPhotoHtml += thumbHtml; }
    });
}

  const reInspectionReady = reInspPhotos >= 1 && reInspPhotos <= 2 && reInspVideos === 1;

  // 🔴 EXACT PENDING APPROVAL UI 
  if (isPendingApproval) {
      let submittedDate = "Pending";
      if (serviceData.updatedAt) {
          const d = serviceData.updatedAt.toDate ? serviceData.updatedAt.toDate() : new Date(serviceData.updatedAt);
          submittedDate = d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
      }
      
      let carImage = jobData.carSnapshot?.imageUrl || '../assets/broken-car.png';
      let carName = `${jobData.carSnapshot?.brand || ''} ${jobData.carSnapshot?.model || ''} (${jobData.carSnapshot?.carNumber || ''})`;
      let serviceType = serviceData.selectedServiceType || serviceData.serviceType || 'General Service';
      let cName = customerData?.name || jobData.customerSnapshot?.name || '-';
      let location = jobData.serviceCenterSnapshot?.city ? jobData.serviceCenterSnapshot.city + ', Assam' : (jobData.serviceCenterSnapshot?.name || 'Service Center');
      
      // Use the fetched mechanic name
      let mechNameDisplay = currentMechanicName || serviceData.mechanicName || 'Mechanic';

      container.innerHTML = `
      <div class="pending-dashboard-wrapper">
          
          <h3 class="panel-section-title">Current Stage</h3>
          <h2 class="panel-main-title">Pending Admin Verification</h2>

          <div class="pending-blue-banner">
              <div class="banner-icon"><i class="fa-solid fa-hourglass-half"></i></div>
              <div class="banner-text">
                  <h4>Awaiting admin verification. No actions available until admin responds.</h4>
                  <p>We've received your work. The service center is reviewing all details.</p>
              </div>
          </div>

          <div class="pending-top-grid">
              <div class="pending-card">
                  <h4>Service Summary</h4>
                  <div class="summary-steps-row">
                      <div class="step-item"><div class="icon green"><i class="fa-solid fa-wrench"></i><div class="check-badge"><i class="fa-solid fa-check"></i></div></div><p>Inspection</p><span>Completed</span></div>
                      <div class="step-dash"></div>
                      <div class="step-item"><div class="icon green"><i class="fa-solid fa-camera"></i><div class="check-badge"><i class="fa-solid fa-check"></i></div></div><p>Media</p><span>Uploaded</span></div>
                      <div class="step-dash"></div>
                      <div class="step-item"><div class="icon green"><i class="fa-solid fa-gauge-high"></i><div class="check-badge"><i class="fa-solid fa-check"></i></div></div><p>Test Drive</p><span>Passed</span></div>
                      <div class="step-dash"></div>
                      
                      ${showReInspectBubble ? `
                      <div class="step-item"><div class="icon green"><i class="fa-solid fa-screwdriver-wrench"></i><div class="check-badge"><i class="fa-solid fa-check"></i></div></div><p>Re-Inspect</p><span>Fixed</span></div>
                      <div class="step-dash"></div>
                      ` : ''}

                      <div class="step-item"><div class="icon flag"><i class="fa-regular fa-flag"></i></div><p>Status</p><span>Pending</span></div>
                  </div>
              </div>
              <div class="pending-card car-card-layout">
                  <img src="${carImage}" alt="Car">
                  <div class="car-info-side">
                      <h3>${carName}</h3>
                      <span class="service-badge">${serviceType}</span>
                      <div class="meta-list">
                          <div><i class="fa-regular fa-user"></i> <span>Customer</span> <strong>${cName}</strong></div>
                          <div><i class="fa-solid fa-location-dot"></i> <span>Location</span> <strong>${location}</strong></div>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Bottom Grid: Details, Next Steps, Important -->
          <div class="pending-bottom-grid">
              <div class="pending-card submission-card">
                  <h4>Submission Details</h4>
                  <div class="details-list">
                      <div class="detail-row"><div class="icon" style="color:#2563eb; background:#eff6ff;"><i class="fa-regular fa-calendar"></i></div><div><p>Submitted At</p><strong>${submittedDate}</strong></div></div>
                      <div class="detail-row"><div class="icon" style="color:#7c3aed; background:#f3e8ff;"><i class="fa-regular fa-user"></i></div><div><p>Submitted By</p><strong>${mechNameDisplay}</strong></div></div>
                      <!-- Dedicated ID for Live Timer -->
                      <div class="detail-row"><div class="icon" style="color:#16a34a; background:#dcfce7;"><i class="fa-regular fa-clock"></i></div><div><p>Service Duration</p><strong id="pendingDurationTimer">Loading...</strong></div></div>
                  </div>
              </div>
              <div class="pending-card">
                  <h4>What happens next?</h4>
                  <div class="next-steps-list">
                      <div class="step-row"><div class="icon dot-green"><i class="fa-solid fa-check"></i></div><div><p>Service Center Review</p><span>Your work is under review by the admin.</span></div></div>
                      <div class="step-line"></div>
                      <div class="step-row"><div class="icon dot-orange"><i class="fa-solid fa-hourglass"></i></div><div><p>Get Notified</p><span>You'll be notified once the review is complete.</span></div></div>
                      <div class="step-line"></div>
                      <div class="step-row"><div class="icon dot-blue"><i class="fa-solid fa-bell"></i></div><div><p>Approval / Re-Inspection</p><span>Service will be approved or re-inspection requested.</span></div></div>
                  </div>
              </div>
              <div class="pending-card important-card">
                  <div class="important-header"><i class="fa-solid fa-circle-info"></i> <h4>Important</h4></div>
                  <p>You will be notified when:</p>
                  <ul>
                      <li><i class="fa-regular fa-circle-check" style="color:#16a34a; font-size:16px;"></i> Service Center approves your work</li>
                      <li><i class="fa-solid fa-triangle-exclamation" style="color:#d97706; font-size:16px;"></i> Re-inspection is required</li>
                  </ul>
                  <div class="important-footer">Please wait. You will get a notification once there is an update.</div>
              </div>
          </div>
      </div>`;
      
      // Live Clock Implementation
      if (jobData.startedAt) {
          const sTime = jobData.startedAt.toDate ? jobData.startedAt.toDate().getTime() : new Date(jobData.startedAt).getTime();
          const updatePendingTimer = () => {
              const timerEl = document.getElementById("pendingDurationTimer");
              if (!timerEl) return;
              const diff = Math.floor((Date.now() - sTime) / 1000);
              const h = Math.floor(diff / 3600);
              const m = Math.floor((diff % 3600) / 60);
              const s = diff % 60;
              timerEl.textContent = `${h}h ${m}m ${s}s`;
          };
          updatePendingTimer(); // run immediately
          setInterval(updatePendingTimer, 1000);
      }

      // Hide other panels
      if (document.getElementById("inspectionContainer")) document.getElementById("inspectionContainer").style.display = "none";
      if (document.getElementById("mediaUploadContainer")) document.getElementById("mediaUploadContainer").style.display = "none";
      if (document.getElementById("testDriveContainer")) document.getElementById("testDriveContainer").style.display = "none";
      if (document.getElementById("reInspectionContainer")) document.getElementById("reInspectionContainer").style.display = "none";
      if (document.getElementById("serviceSummaryCard")) document.getElementById("serviceSummaryCard").style.display = "none";
      return; 
  }
  // Ensure top summary is visible if NOT pending
  if (document.getElementById("serviceSummaryCard")) document.getElementById("serviceSummaryCard").style.display = "grid";

// FIX: Added vehicle_received and service_started so the generic button doesn't show up and cause errors
  const showAdvanceBtn =
    current !== "vehicle_received" &&
    current !== "service_started" &&
    current !== "service_complete" &&
    current !== "uploading_media" &&
    current !== "re_inspection" &&
    !isPendingApproval &&
    !(current === "inspection" && !inspectionSaved) &&
    !(current === "test_drive" && !serviceData.testDriveReport);

  // ─── STAGE 1: Vehicle Received ─────────────────────────────────────────
  if (current === "vehicle_received") {
    const isLiveOn = !!serviceData.liveEnabled;
    const car  = jobData.carSnapshot  || {};
    const cust = jobData.customerSnapshot || {};
    const svc  = jobData.serviceSnapshot  || {};

    // Format received date
    let receivedStr = "—";
    if (jobData.acceptedAt) {
      const d = jobData.acceptedAt.toDate ? jobData.acceptedAt.toDate() : new Date(jobData.acceptedAt);
      receivedStr = d.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });
    }

    container.innerHTML = `
    <div class="vr-stage-card">

      <!-- Blue info banner -->
      <div class="vr-info-banner">
        <i class="fa-solid fa-circle-info"></i>
        <span>Confirm that you have received the vehicle from the customer.</span>
      </div>

      <div class="vr-details-grid">

        <!-- Customer Details -->
        <div class="vr-section">
          <h4 class="vr-section-title"><i class="fa-regular fa-user"></i> Customer Details</h4>
          <div class="vr-field-list">
            <div class="vr-field"><span class="vr-label"><i class="fa-regular fa-user"></i> Name</span><span class="vr-value">${cust.name || "—"}</span></div>
            <div class="vr-field"><span class="vr-label"><i class="fa-solid fa-phone"></i> Phone</span><span class="vr-value">${cust.phone || "—"}</span></div>
            <div class="vr-field"><span class="vr-label"><i class="fa-solid fa-location-dot"></i> Address</span><span class="vr-value">${cust.city ? cust.city + ', ' + (cust.state || '') : "—"}</span></div>
          </div>
        </div>

        <!-- Vehicle Details -->
        <div class="vr-section">
          <h4 class="vr-section-title"><i class="fa-solid fa-car"></i> Vehicle Details</h4>
          <div class="vr-field-list">
            <div class="vr-field"><span class="vr-label"><i class="fa-solid fa-car-side"></i> Vehicle</span><span class="vr-value">${car.brand || ""} ${car.model || ""} (${car.carNumber || ""})</span></div>
            <div class="vr-field"><span class="vr-label"><i class="fa-solid fa-palette"></i> Color</span><span class="vr-value">${car.colour || car.color || "—"}</span></div>
            <div class="vr-field"><span class="vr-label"><i class="fa-solid fa-gauge"></i> KM Reading</span><span class="vr-value">${car.mileage ? car.mileage + ' KM' : "—"}</span></div>
            <div class="vr-field"><span class="vr-label"><i class="fa-solid fa-gas-pump"></i> Fuel Type</span><span class="vr-value">${car.fuelType || "—"}</span></div>
          </div>
        </div>

      </div>

      <!-- Handover Information -->
      <div class="vr-section vr-handover">
        <h4 class="vr-section-title"><i class="fa-regular fa-calendar"></i> Handover Information</h4>
        <div class="vr-field-list">
          <div class="vr-field"><span class="vr-label"><i class="fa-regular fa-calendar"></i> Received At</span><span class="vr-value">${receivedStr}</span></div>
          <div class="vr-field"><span class="vr-label"><i class="fa-regular fa-user"></i> Received From</span><span class="vr-value">${cust.name || "—"}</span></div>
        </div>
        <div class="vr-condition-box">
          <p class="vr-condition-label">Vehicle Condition at Received</p>
          <p class="vr-condition-text">${svc.issueDescription || jobData.notes || "No notes provided."}</p>
        </div>
      </div>

      <!-- Vehicle Received Photos (mandatory, locked until live ON) -->
      <div class="vr-photos-section">
        <div class="vr-photos-header">
          <h4 class="vr-section-title"><i class="fa-solid fa-camera"></i> Vehicle Received Images <span class="vr-required-badge">Required</span></h4>
          ${!isLiveOn ? `<div class="vr-lock-notice"><i class="fa-solid fa-lock"></i> Enable Live Tracking to unlock image upload</div>` : ""}
        </div>

        <div class="vr-upload-grid">

          <!-- Upload 1: Number Plate -->
          <div class="vr-upload-slot ${!isLiveOn ? 'vr-upload-locked' : ''}">
            <div class="vr-upload-slot-header">
              <i class="fa-solid fa-hashtag"></i>
              <span>Number Plate Photo</span>
            </div>
            <label class="vr-upload-area ${!isLiveOn ? 'disabled' : ''}" id="vrPlateLabel">
              <input type="file" id="vrPlateInput" accept="image/*" ${!isLiveOn ? 'disabled' : ''} onchange="vrPreviewImage('vrPlateInput','vrPlatePreview','vrPlateName')">
              <div class="vr-upload-icon-wrap" id="vrPlatePlaceholder">
                <i class="fa-solid fa-camera"></i>
                <span>Upload Number Plate</span>
                <small>JPG, PNG, JPEG (Max 10MB)</small>
              </div>
              <div id="vrPlatePreview" class="vr-img-preview" style="display:none;"></div>
            </label>
            <div class="vr-file-name" id="vrPlateName"></div>
          </div>

          <!-- Upload 2: Whole Car at Service Bay -->
          <div class="vr-upload-slot ${!isLiveOn ? 'vr-upload-locked' : ''}">
            <div class="vr-upload-slot-header">
              <i class="fa-solid fa-car"></i>
              <span>Whole Car at Service Bay</span>
            </div>
            <label class="vr-upload-area ${!isLiveOn ? 'disabled' : ''}" id="vrCarLabel">
              <input type="file" id="vrCarInput" accept="image/*" ${!isLiveOn ? 'disabled' : ''} onchange="vrPreviewImage('vrCarInput','vrCarPreview','vrCarName')">
              <div class="vr-upload-icon-wrap" id="vrCarPlaceholder">
                <i class="fa-solid fa-camera"></i>
                <span>Upload Full Car Photo</span>
                <small>Taken at the service bay</small>
              </div>
              <div id="vrCarPreview" class="vr-img-preview" style="display:none;"></div>
            </label>
            <div class="vr-file-name" id="vrCarName"></div>
          </div>

        </div>

        ${isLiveOn ? `<p class="vr-upload-hint"><i class="fa-solid fa-circle-info"></i> Both images are required. Label: <strong>vehicle_received</strong> — used for identification records.</p>` : ""}
      </div>

      <!-- Confirm line -->
      <div class="vr-confirm-line">
        <i class="fa-regular fa-circle-check" style="color:#2563eb;"></i>
        <span>Please confirm that the vehicle has been received in this condition.</span>
      </div>

      <!-- Mark received button -->
      <div class="vr-action-row">
        <button
          class="vr-mark-btn ${!isLiveOn ? 'vr-btn-disabled' : ''}"
          id="vrMarkReceivedBtn"
          ${!isLiveOn ? 'disabled title="Enable live tracking first"' : ''}
          onclick="markVehicleReceived('${jobId}')"
        >
          <i class="fa-solid fa-circle-check"></i>
          Mark Vehicle Received
        </button>
      </div>

    </div>`;

    // Hide other panels
    ['inspectionContainer','mediaUploadContainer','testDriveContainer','reInspectionContainer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }

  // ─── STAGE 2: Service Started (timer only, no live toggle here) ──────────
  if (current === "service_started") {
    const startedAt = jobData.startedAt || serviceData.startedAt;
    let hrs = "00", mins = "00", secs = "00";
    if (startedAt) {
      const st = startedAt.toDate ? startedAt.toDate() : new Date(startedAt);
      const diff = Math.max(0, Date.now() - st.getTime());
      hrs  = String(Math.floor(diff / 3600000)).padStart(2, "0");
      mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    }

    container.innerHTML = `
    <div class="ss-stage-card">

      <div class="ss-info-banner">
        <i class="fa-solid fa-circle-info"></i>
        <span>Start the service and begin working on the vehicle.</span>
      </div>

      <div class="ss-timer-block">
        <div class="ss-timer-header">
          <i class="fa-regular fa-clock"></i>
          <span>Service Timer</span>
        </div>
        <p class="ss-timer-sub">Auto tracking time since service started</p>
        <div class="ss-timer-display">
          <div class="ss-timer-unit"><span id="ssHrs">${hrs}</span><label>HRS</label></div>
          <div class="ss-timer-sep">:</div>
          <div class="ss-timer-unit"><span id="ssMins">${mins}</span><label>MINS</label></div>
          <div class="ss-timer-sep">:</div>
          <div class="ss-timer-unit"><span id="ssSecs">${secs}</span><label>SECS</label></div>
        </div>
        <p class="ss-timer-note">Timer will run automatically while the service is in progress.</p>
      </div>

      <button class="ss-start-btn" onclick="advanceStage('${jobId}')">
        <i class="fa-solid fa-play"></i>
        Submit the Work
      </button>
      <p class="ss-start-hint"><i class="fa-solid fa-circle-info" style="color:#2563eb;"></i> Once started, the timer will run automatically.</p>

    </div>`;

    // Start live timer for service_started stage display
    if (startedAt) {
      const st = (startedAt.toDate ? startedAt.toDate() : new Date(startedAt)).getTime();
      if (window._ssTimerInterval) clearInterval(window._ssTimerInterval);
      window._ssTimerInterval = setInterval(() => {
        const diff = Math.max(0, Date.now() - st);
        const hEl = document.getElementById("ssHrs");
        const mEl = document.getElementById("ssMins");
        const sEl = document.getElementById("ssSecs");
        if (!hEl) { clearInterval(window._ssTimerInterval); return; }
        hEl.textContent  = String(Math.floor(diff / 3600000)).padStart(2,"0");
        mEl.textContent  = String(Math.floor((diff % 3600000) / 60000)).padStart(2,"0");
        sEl.textContent  = String(Math.floor((diff % 60000) / 1000)).padStart(2,"0");
      }, 1000);
    }

    ['inspectionContainer','mediaUploadContainer','testDriveContainer','reInspectionContainer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }

  // ─── ALL OTHER STAGES ────────────────────────────────────────────────────
  container.innerHTML = `
  <div class="current-stage-box">
    <h3>Current Stage</h3>
    <h2>${stageMap[current] || current}</h2>

    ${isPendingApproval ? `
      <div class="pending-approval-banner">
        ⏳ Awaiting admin verification. No actions available until admin responds.
      </div>` : ""}

  
    ${showAdvanceBtn ? `
      <button class="stage-next-btn" onclick="advanceStage('${jobId}')">
        Mark Current Stage Complete
      </button>` : ""}

    ${current === "service_complete" ? `
      <button class="stage-next-btn stage-next-btn--green" onclick="completeService('${jobId}')" id="completeServiceBtn">
        ✅ Submit for Admin Verification
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

    const alreadySaved = !!serviceData.inspectionReport;

    if (alreadySaved) {
        // ✅ FIX: Display Read-Only summary to prevent the UI freeze loop
        const r = serviceData.inspectionReport;
        inspectionContainer.innerHTML = `
          <div class="inspection-card">
            <h3>Inspection Findings</h3>
            <p class="saved-msg">✅ Inspection already saved. You can advance to the next stage.</p>
            <p><b>Severity:</b> <span style="text-transform:capitalize;">${r.severity}</span></p>
            <p><b>Issues Found:</b> ${(r.issues || []).join(", ")}</p>
            <p><b>Notes:</b> ${r.notes || "—"}</p>
          </div>
        `;
    } else {
        inspectionContainer.innerHTML = `
          <div class="inspection-card">
            <h3>Inspection Findings</h3>
            <div class="inspection-options">
              <label><input type="checkbox" value="Brake Issue"> Brake Issue</label>
              <label><input type="checkbox" value="Engine Vibration"> Engine Vibration</label>
              <label><input type="checkbox" value="Oil Leakage"> Oil Leakage</label>
              <label><input type="checkbox" value="Battery Weak"> Battery Weak</label>
            </div>
            <select id="inspectionSeverity">
              <option value="">Select Severity</option>
              <option value="minor">Minor</option>
              <option value="medium">Medium</option>
              <option value="critical">Critical</option>
            </select>
            <textarea id="inspectionNotes" placeholder="Write inspection findings..."></textarea>
            <button class="save-inspection-btn" id="saveInspectionBtn" onclick="saveInspection('${jobId}')" disabled style="opacity:0.5;cursor:not-allowed;">Save Inspection</button>
            <p id="inspectionHint" class="stage-hint">⚠️ Select at least one issue, severity, and write a note to enable.</p>
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
  }

} else {

  const inspectionContainer =
    document.getElementById("inspectionContainer");

  if (inspectionContainer) {
    inspectionContainer.style.display = "none";
  }
}


// // ================= MEDIA STAGE =================

if (current === "uploading_media") {

  const mediaContainer =
    document.getElementById("mediaUploadContainer");

  if (mediaContainer) {

    mediaContainer.style.display = "block";

    // FIX: Pull serviceId from the jobData object
    const currentServiceId = jobData.serviceId;

    // Build stage options dynamically
    const stageOpts = await getStageOptions(currentServiceId);

    mediaContainer.innerHTML = `
      <div class="media-stage-wrapper">

        <!-- Top header with stage progress pills -->
        <div class="media-stage-header">
          <div class="media-stage-title-row">
            <div class="media-stage-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
            <div>
              <p class="media-stage-label">CURRENT STAGE</p>
              <h3 class="media-stage-name">Uploading Media</h3>
              <p class="media-stage-hint"><i class="fa-solid fa-triangle-exclamation" style="color:#d97706;"></i> Minimum 2 photos required for each stage. Videos are optional and do not count towards the minimum.</p>
            </div>
          </div>
          <div class="media-pills-row" id="mediaPillsRow">
            <!-- pills injected by JS -->
          </div>
        </div>

        <div class="media-body-grid">

          <!-- LEFT: Upload Panel -->
          <div class="media-upload-panel">
            <div class="media-panel-header">
              <i class="fa-solid fa-cloud-arrow-up" style="color:#2563eb;"></i>
              <h4>Upload Media</h4>
            </div>

            <label class="media-stage-select-label">Select Stage</label>
            <select id="stageSelect" class="media-stage-select">
              <option value="">Select Stage</option>
              ${stageOpts}
            </select>

            <div class="media-uploading-for" id="mediaUploadingForBanner" style="display:none;">
              <i class="fa-solid fa-circle-info"></i>
              <span>You are uploading media for <strong id="uploadingForLabel"></strong></span>
            </div>

            <div class="media-upload-btns">
              <label class="media-upload-btn-item" for="mediaFileInput">
                <i class="fa-solid fa-camera" style="color:#2563eb;"></i>
                <div>
                  <strong>Upload Photos</strong>
                  <small>JPG, PNG, JPEG (Max 20MB)</small>
                </div>
                <input type="file" id="mediaFileInput" accept="image/*,video/*" style="display:none;" onchange="onMediaFileSelected()">
              </label>
            </div>

            <p class="media-formats-note">
              <i class="fa-solid fa-circle-info" style="color:#2563eb;"></i>
              Accepted formats: <strong>JPG, JPEG, PNG, MP4</strong><br>
              Max file size: 20MB (Photos) / 50MB (Video)
            </p>

            <div id="progressContainer" style="display:none;" class="media-progress-wrap">
              <div class="media-progress-bar-track"><div id="progressBar" class="media-progress-bar-fill"></div></div>
              <span id="progressText" class="media-progress-text">0%</span>
            </div>

            <button class="media-upload-action-btn" onclick="uploadMedia('${jobId}')">
              <i class="fa-solid fa-cloud-arrow-up"></i> Upload
            </button>
          </div>

          <!-- RIGHT: Uploaded Media Panel -->
          <div class="media-uploaded-panel">
            <div class="media-panel-header">
              <i class="fa-regular fa-image" style="color:#2563eb;"></i>
              <h4>Uploaded Media</h4>
            </div>
            <div id="mediaPreviewGrid"></div>
            <div id="mediaCompleteBtn"></div>
          </div>

        </div>

      </div>
    `;

    // Update uploading-for banner when stage changes
    const stageSelectEl = document.getElementById("stageSelect");
    const banner = document.getElementById("mediaUploadingForBanner");
    const forLabel = document.getElementById("uploadingForLabel");
    const stageNames = { before:"Before Service", during:"During Service", after:"After Service", video:"Video (optional)" };
    stageSelectEl?.addEventListener("change", () => {
      const v = stageSelectEl.value;
      if (v && stageNames[v]) {
        banner.style.display = "flex";
        forLabel.textContent = stageNames[v];
      } else {
        banner.style.display = "none";
      }
    });

    loadMechanicMedia(jobId, currentServiceId);
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

// ==========================================
// RE-INSPECTION UI: FINAL DASHBOARD VERSION
// ==========================================
const reInspectionContainer = document.getElementById("reInspectionContainer");

if (current === "re_inspection") {
    if (reInspectionContainer) {
        reInspectionContainer.style.display = "block";
        
        // 1. CLEAR previous renders to prevent double-banner issue
        reInspectionContainer.innerHTML = ''; 

        // 2. BUILD the new template
        const reInspDashboard = document.createElement('div');
        reInspDashboard.innerHTML = `
          <div class="rs-dashboard-wrapper">
            <div class="rs-alert-box">
              <div class="rs-alert-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
              <div class="rs-alert-text">
                <h4>Re-Inspection Required</h4>
                <p>The service center has requested additional work before approval. Please address the issues and upload new evidence.</p>
              </div>
            </div>

            <div class="rs-info-grid">
              <div class="rs-info-card">
                <h5 class="rs-card-title"><i class="fa-regular fa-file-lines"></i> Reason For Re-Inspection</h5>
                <p class="rs-reason-text">${rejectionNote || "No reason provided."}</p>
              </div>
              <div class="rs-info-card">
                <h5 class="rs-card-title"><i class="fa-regular fa-user"></i> Requested By</h5>
                <div class="rs-meta-list">
                  <div><i class="fa-solid fa-building"></i> <span>${jobData.serviceCenterSnapshot?.name || "Service Center"}</span></div>
                  <div><i class="fa-regular fa-calendar"></i> <span>${new Date().toLocaleDateString()}</span></div>
                </div>
              </div>
            </div>

            <div class="rs-media-dashboard">
              <div class="rs-media-card">
                <h5 class="rs-card-title">Upload Fix Verification Media</h5>
                ${reInspPhotos < 2 ? `
                <button class="rs-btn-outline" onclick="document.getElementById('reInspectionPhotoInput').click()">
                  <i class="fa-regular fa-image"></i> Upload Photo (${reInspPhotos}/2)
                </button>
                <input type="file" id="reInspectionPhotoInput" accept="image/*" style="display:none;" onchange="uploadReInspectionMedia('${jobId}')">` : `<p style="color:#15803d;font-size:13px;font-weight:600;">✅ Photos complete (${reInspPhotos}/2)</p>`}
                ${reInspVideos < 1 ? `
                <button class="rs-btn-outline" style="margin-top:8px;" onclick="document.getElementById('reInspectionVideoInput').click()">
                  <i class="fa-regular fa-video"></i> Upload Video (${reInspVideos}/1)
                </button>
                <input type="file" id="reInspectionVideoInput" accept="video/*" style="display:none;" onchange="uploadReInspectionMedia('${jobId}')">` : `<p style="color:#15803d;font-size:13px;font-weight:600;margin-top:8px;">✅ Video complete (${reInspVideos}/1)</p>`}
                <p style="font-size:11px;color:#94a3b8;margin-top:8px;">Max 2 photos + 1 video required</p>

                <div id="rsProgressContainer" style="display:none; margin-top:12px; background:#f1f5f9; border-radius:8px; padding:10px;">
                  <div style="width: 100%; background: #e2e8f0; border-radius: 4px; height: 6px; overflow: hidden;">
                    <div id="rsProgressBar" style="width: 0%; background: #2563eb; height: 100%; transition: width 0.2s;"></div>
                  </div>
                  <p id="rsProgressText" style="font-size:11px; font-weight:600; color:#475569; margin-top:6px; text-align:center;">0% Uploading...</p>
                </div>
              </div>

              <div class="rs-media-card">
                <h5 class="rs-card-title">Fix Photos (${reInspPhotos}/2)</h5>
                <div class="rs-thumb-grid">
                  ${reInspPhotoHtml || '<span style="font-size:13px;color:#94a3b8;">No photos yet.</span>'}
                </div>
              </div>

              <div class="rs-media-card">
                <h5 class="rs-card-title">Fix Video (${reInspVideos}/1)</h5>
                <div class="rs-thumb-grid">
                  ${reInspVideoHtml || '<span style="font-size:13px;color:#94a3b8;">No video yet.</span>'}
                </div>
              </div>
            </div>

            <div class="rs-confirmation-box">
              <label class="rs-checkbox-label"><input type="checkbox" id="rsCheck1" onchange="validateRsSubmit()"> I confirm the issue has been fixed.</label>
              <label class="rs-checkbox-label"><input type="checkbox" id="rsCheck2" onchange="validateRsSubmit()"> Uploaded media clearly shows the repair.</label>
              <button class="rs-btn-submit" id="rsSubmitBtn" disabled onclick="completeService('${jobId}')">
                  <i class="fa-regular fa-paper-plane"></i> Re-Submit For Review
              </button>
            </div>
          </div>
        `;
        reInspectionContainer.appendChild(reInspDashboard);
        
        // Trigger validation once rendered
        window.validateRsSubmit();
    }
} else {
    if (reInspectionContainer) reInspectionContainer.style.display = "none";
}

// =======================================
// SIDEBAR TOGGLE & MOBILE OVERLAY LOGIC
// =======================================
const mechanicLayout = document.querySelector(".mechanic-layout");
const menuToggle = document.getElementById("menuToggle");

// 1. Dynamically inject the mobile dark overlay
if (mechanicLayout && !document.querySelector(".mobile-sidebar-overlay")) {
    const overlay = document.createElement("div");
    overlay.className = "mobile-sidebar-overlay";
    mechanicLayout.appendChild(overlay);

    // 2. Close sidebar when clicking the dark overlay
    overlay.addEventListener("click", () => {
        mechanicLayout.classList.remove("mobile-sidebar-open");
    });
}

// 3. Handle the Menu Button Clicks
if (menuToggle && mechanicLayout) {
    menuToggle.addEventListener("click", () => {
        if (window.innerWidth > 768) {
            // Desktop: Slide out of view and expand main content
            mechanicLayout.classList.toggle("sidebar-collapsed");
        } else {
            // Mobile: Slide into view over the content
            mechanicLayout.classList.toggle("mobile-sidebar-open");
        }
    });
}

// ==========================================
// RE-INSPECTION MEDIA UPLOAD LOGIC
// ==========================================
window.uploadReInspectionMedia = async function(jobId) {
    // Support both photo and video input elements
    const photoInput = document.getElementById("reInspectionPhotoInput");
    const videoInput = document.getElementById("reInspectionVideoInput");
    const fileInput = (photoInput && photoInput.files && photoInput.files.length > 0) ? photoInput
                    : (videoInput && videoInput.files && videoInput.files.length > 0) ? videoInput
                    : null;
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Please select a photo or video first!");
        return;
    }

    const file = fileInput.files[0];
    if (!file || !file.name) {
        alert("Invalid file structure. Please try again.");
        return;
    }

    // Enforce limits before upload
    const jobRefPre = doc(db, "jobCards", jobId);
    const jobSnapPre = await getDoc(jobRefPre);
    const serviceIdPre = jobSnapPre.data().serviceId;
    const preMediaSnap = await getDocs(collection(db, "services", serviceIdPre, "media"));
    let prePhotos = 0, preVideos = 0;
    preMediaSnap.forEach(d => {
        if (d.data().stage === "re_inspection") {
            if (d.data().type === "video") preVideos++;
            else prePhotos++;
        }
    });
    const isNewVideo = file.type.startsWith("video/");
    if (!isNewVideo && prePhotos >= 2) {
        alert("❌ Maximum 2 photos already uploaded for re-inspection.");
        fileInput.value = "";
        return;
    }
    if (isNewVideo && preVideos >= 1) {
        alert("❌ Maximum 1 video already uploaded for re-inspection.");
        fileInput.value = "";
        return;
    }

    if (isNewVideo && file.size > 100 * 1024 * 1024) {
        alert("❌ Video must be under 100MB. Please compress and retry.");
        return;
    }

    try {
        const jobRef = doc(db, "jobCards", jobId);
        const jobSnap = await getDoc(jobRef);
        const jobData = jobSnap.data();
        const serviceId = jobData.serviceId;

        const ext = file.name.includes('.') ? file.name.split('.').pop() : "jpg";
        const isVideo = file.type.startsWith("video/");
        const fileName = `re_inspection_${Date.now()}.${ext}`;

        // FIX 1: Change Storage Label/Path -> Groups re-inspection files separately in a dedicated sub-folder
        const storageRef = ref(storage, `services/${serviceId}/media/re_inspection/${fileName}`);
        
        // Attach authorized metadata for storage rules
        const metadata = {
            customMetadata: {
                ownerId: currentUser.uid,
                assignedServiceCenterId: jobData.assignedServiceCenterId
            }
        };
        
        // FIX 2: Attach Progress Bar Listener
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);
        
        const progressContainer = document.getElementById("rsProgressContainer");
        const progressBar = document.getElementById("rsProgressBar");
        const progressText = document.getElementById("rsProgressText");
        
        if (progressContainer) progressContainer.style.display = "block"; // Show bar

        uploadTask.on("state_changed", 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (progressBar) progressBar.style.width = progress + "%";
                if (progressText) progressText.innerText = Math.round(progress) + "% Uploading...";
            }, 
            (error) => {
                console.error("Upload error:", error);
                alert("Upload failed: " + error.message);
                if (progressContainer) progressContainer.style.display = "none";
                if (fileInput) fileInput.value = "";
            }, 
            async () => {
                // SUCCESS: Get URL and save to Firestore
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

                // Save to Firestore Media Collection
                const roundSnap = await getDoc(doc(db, "services", serviceId));
const currentRound = roundSnap.data()?.reInspectionRound || 1;

await addDoc(collection(db, "services", serviceId, "media"), {
    serviceId: serviceId,
    jobId: jobId,
    uploadedBy: currentUser.uid,
    url: downloadURL,
    filePath: storageRef.fullPath,
    fileName: file.name,
    type: isVideo ? "video" : "photo",
    stage: "re_inspection",
    reInspectionRound: currentRound,
    createdAt: serverTimestamp()
});

                // Sync currentStep on both docs so re-inspection stage stays consistent
                await updateDoc(doc(db, "services", serviceId), {
                    currentStep: "re_inspection",
                    updatedAt: serverTimestamp()
                });
                await updateDoc(doc(db, "jobCards", jobId), {
                    progress: "re_inspection",
                    updatedAt: serverTimestamp()
                });

                if (progressContainer) progressContainer.style.display = "none"; // Hide bar
                
                // Reload the active service to update the grid and count
                loadActiveService(jobId); 
            }
        );

    } catch (error) {
        console.error("Re-inspection upload error:", error);
        alert("Upload failed: " + error.message);
        if (fileInput) fileInput.value = "";
    }
};



// =======================================
// MEDIA MODAL (ZOOM) LOGIC
// =======================================
window.openMediaModal = function(url, type) {
    const modal = document.getElementById("mediaModal");
    const img = document.getElementById("modalImage");
    const vid = document.getElementById("modalVideo");
    if (!modal) return;

    modal.style.display = "block";
    if (type === 'video') {
        img.style.display = "none";
        vid.style.display = "block";
        vid.src = url;
        vid.play();
    } else {
        vid.style.display = "none";
        vid.pause();
        img.style.display = "block";
        img.src = url;
    }
};

window.closeMediaModal = function() {
    const modal = document.getElementById("mediaModal");
    const vid = document.getElementById("modalVideo");
    if(modal) modal.style.display = "none";
    if(vid) {
        vid.pause();
        vid.currentTime = 0;
    }
};

// Close listeners
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("close-modal") || e.target.classList.contains("image-modal") || e.target.classList.contains("modal-content-wrapper")) {
        window.closeMediaModal();
    }
});
}

// ==========================================
// DELETE RE-INSPECTION MEDIA (global, called from inline onclick)
// ==========================================
window.deleteReInspMedia = async function(serviceId, mediaId, filePath, jobId) {
    if (!confirm("Delete this file from re-inspection?")) return;
    try {
        // Delete from Firebase Storage
        if (filePath) {
            try {
                const fileRef = ref(storage, filePath);
                await deleteObject(fileRef);
            } catch (storageErr) {
                console.warn("Storage delete failed (may already be gone):", storageErr.message);
            }
        }
        // Delete from Firestore
        await deleteDoc(doc(db, "services", serviceId, "media", mediaId));
        // Reload to reflect updated state
        loadActiveService(jobId);
    } catch (err) {
        console.error("Re-inspection media delete failed:", err);
        alert("Delete failed: " + err.message);
    }
};

//media count
window.validateRsSubmit = function() {
    // Count by data-type attribute to correctly separate photos from videos
    const photoCount = document.querySelectorAll('.rs-thumb-item[data-type="photo"][data-current-round="true"]').length;
const videoCount = document.querySelectorAll('.rs-thumb-item[data-type="video"][data-current-round="true"]').length;
    
    // Check box status
    const check1 = document.getElementById('rsCheck1')?.checked;
    const check2 = document.getElementById('rsCheck2')?.checked;
    
    // Validation: 1-2 photos AND exactly 1 video
    const isMediaValid = (photoCount >= 1 && photoCount <= 2) && (videoCount === 1);
    const areBoxesChecked = check1 && check2;
    
    const submitBtn = document.getElementById('rsSubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = !(isMediaValid && areBoxesChecked);
    }
};