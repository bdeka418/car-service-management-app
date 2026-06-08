import { auth, db } from "../firebase.js";
import { 
    doc, getDoc, collection, getDocs, onSnapshot, 
    updateDoc, serverTimestamp, arrayUnion, writeBatch
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";

let currentUser = null;
let currentService = null;
let currentServiceId = new URLSearchParams(window.location.search).get("serviceId");

// Firebase Functions — region must match Cloud Function setGlobalOptions
const functions = getFunctions(undefined, "asia-south1");
const callApproveWork            = httpsCallable(functions, "approveWork");
const callCompleteServiceFinal   = httpsCallable(functions, "completeServiceFinal");
const callApproveServiceCompletion = httpsCallable(functions, "approveServiceCompletion"); // legacy

if (!currentServiceId) {
    alert("Service ID missing");
    window.location.href = "manage-services.html";
}

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "../index.html"; return; }
    currentUser = user;
    
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists() || userSnap.data().role !== "service_center") {
        window.location.href = "../index.html"; return;
    }

    listenToService();
});

// UI Listeners
document.getElementById("backBtn")?.addEventListener("click", () => {
    window.location.href = "manage-services.html";
});

// Main Listener
function listenToService() {
    const serviceRef = doc(db, "services", currentServiceId);
    onSnapshot(serviceRef, async (snapshot) => {
        if (!snapshot.exists()) return;
        currentService = snapshot.data();

        renderOverview();
        renderTimelineAndFeed();
        renderInspection();
        renderTestDrive();
        renderAnalytics();
        await loadMedia();
    });
}

// 1. Overview Card & Timer
let durationInterval;
function renderOverview() {
    const s = currentService;
    const car = s.carSnapshot || {};
    const owner = s.ownerSnapshot || {};
    const center = s.serviceCenterSnapshot || {};

    document.getElementById("vehicleTitle").textContent = `${car.brand || ""} ${car.model || ""} (${car.carNumber || "No Reg"})`;
    document.getElementById("serviceType").textContent = s.selectedServiceType || s.serviceType || "Regular Service";
    
    document.getElementById("customerName").textContent = owner.name || "-";
    document.getElementById("customerPhone").textContent = owner.phone || "-";
    document.getElementById("vehicleImage").src = car.imageUrl || "./broken-car.png";

    // Robust Mechanic Name Extraction
    let displayMechanicName = s.mechanicName || 'Unassigned';

    // 1. Check history array if root name is missing
    if (displayMechanicName === 'Unassigned' && s.history && Array.isArray(s.history)) {
        const mechanicData = s.history.find(h => h.mechanicName);
        if (mechanicData) displayMechanicName = mechanicData.mechanicName;
    }

    // 2. If still unassigned but an ID exists, mark as "Assigned"
    if (displayMechanicName === 'Unassigned' && s.mechanicId) {
        displayMechanicName = 'Assigned';
    }

    document.getElementById("mechanicName").textContent = displayMechanicName;
    document.getElementById("mechanicPhone").textContent = "-"; // If available in your DB, map it
  
    document.getElementById("mechanicImage").src = "./default-avatar.png";
    
    document.getElementById("centerName").textContent = center.serviceCenterName || center.name || "-";
    document.getElementById("centerLocation").textContent = center.city ? `${center.city}, Assam` : "-";

    const statusDisplay = (s.serviceStatus || "Pending").toUpperCase().replace(/_/g, ' ');
    const badge = document.getElementById("statusBadge");
    badge.textContent = statusDisplay;
    badge.className = statusDisplay.includes("COMPLETE") ? "badge-blue" : "badge-warning";
    document.getElementById("analyticsStage").textContent = (s.currentStep || "-").replace(/_/g, ' ').toUpperCase();

    // Duration Timer Logic
    clearInterval(durationInterval);
    const parseDate = (val) => val && typeof val.toDate === 'function' ? val.toDate() : new Date(val);
    const startTime = parseDate(s.requestedAt || s.createdAt);
    
    if (startTime && !isNaN(startTime)) {
        const updateTimer = () => {
            let endTime = Date.now();
            if(s.serviceStatus === "completed" || s.serviceStatus === "work_done") {
                const lastHistory = s.history && s.history.length > 0 ? s.history[s.history.length-1] : null;
                if(lastHistory) endTime = parseDate(lastHistory.at || lastHistory.timestamp).getTime();
            }
            const diff = endTime - startTime.getTime();
            if(diff > 0) {
                const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                const sec = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                document.getElementById("serviceDuration").textContent = `${h}h ${m}m ${sec}s`;
            }
        };
        updateTimer();
        if(s.serviceStatus !== "completed" && s.serviceStatus !== "work_done") {
            durationInterval = setInterval(updateTimer, 1000);
        }
    }

    evaluateAdminActions(s);

    // Populate top cancel card if cancel is pending
    const topCancelCard = document.getElementById("mechanicCancelTopCard");
    if (topCancelCard && s.cancelRequested) {
        const mechName = s.mechanicName || displayMechanicName || "Mechanic";
        let reqTime = "—";
        if (s.cancelRequestedAt) {
            const d = typeof s.cancelRequestedAt.toDate === 'function' ? s.cancelRequestedAt.toDate() : new Date(s.cancelRequestedAt);
            if (!isNaN(d)) reqTime = d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
        }
        document.getElementById("topCancelMechName").textContent  = mechName;
        document.getElementById("topCancelReason").textContent    = s.cancelReason || "No reason provided";
        document.getElementById("topCancelTime").textContent      = reqTime;
    }
}

// 2. Timeline & Activity Feed
function renderTimelineAndFeed() {
    const history = currentService.history || [];
    const timelineEl = document.getElementById("progressTimeline");
    const feedEl = document.getElementById("activityFeed");
    timelineEl.innerHTML = ""; feedEl.innerHTML = "";

    // Parse History for Feed
    const sortedHistory = [...history].reverse(); // Newest first
    sortedHistory.forEach(item => {
        // Support both 'at' (Firestore Timestamp) and 'timestamp' (legacy)
        let dateObj = null;
        if (item.at && typeof item.at.toDate === 'function') dateObj = item.at.toDate();
        else if (item.timestamp && typeof item.timestamp.toDate === 'function') dateObj = item.timestamp.toDate();
        else if (item.at) dateObj = new Date(item.at);
        else if (item.timestamp) dateObj = new Date(item.timestamp);

        const isValid = dateObj && !isNaN(dateObj);
        // Always show full date+time — never just time
        const timeStr = isValid
            ? dateObj.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}) + ', ' + dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
            : "--:--";
        
        let icon = '<i class="fa-solid fa-clipboard-check"></i>';
        let color = 'blue';
        let title = (item.action || item.type || "Update").replace(/_/g, ' ').toUpperCase();
        
        if(title.includes("MEDIA")) { icon = '<i class="fa-regular fa-images"></i>'; color = 'blue'; }
        else if(title.includes("INSPECT")) { icon = '<i class="fa-solid fa-magnifying-glass"></i>'; color = 'orange'; }
        else if(title.includes("COMPLETE")) { icon = '<i class="fa-solid fa-check"></i>'; color = 'green'; }

        feedEl.innerHTML += `
            <div class="activity-item">
                <div class="act-time">${timeStr}</div>
                <div class="act-icon ${color}">${icon}</div>
                <div class="act-details">
                    <h4>${title}</h4>
                    <p>${item.message || item.note || item.to || "System updated"}</p>
                </div>
            </div>
        `;
    });

    if(sortedHistory.length === 0) feedEl.innerHTML = '<p class="loading-text">No activity yet.</p>';

    // Parse Stages for Timeline — inject re_inspection if it appears in history
    const stages = [
        { key: "vehicle_received",  label: "Vehicle Received" },
        { key: "service_started",   label: "Service Started" },
        { key: "inspection",        label: "Inspection" },
        { key: "uploading_media",   label: "Media Uploaded" },
        { key: "test_drive",        label: "Test Drive" },
        { key: "service_complete",  label: "Service Complete" }
    ];

    // Inject re_inspection stage if it appears in history
    const hasReInspection = history.some(h => h.action === "re_inspection_requested" || h.action === "re_submitted_for_approval");
    if (hasReInspection) {
        stages.push({ key: "re_inspection", label: "Re-Inspection" });
    }

    let currentStageIndex = stages.findIndex(s => s.key === currentService.currentStep);
    
    if (currentService.serviceStatus === "pending_approval" || currentService.currentStep === "pending_approval" || currentService.serviceStatus === "work_done" || currentService.serviceStatus === "completed") {
        currentStageIndex = stages.length; 
    } else if (currentService.currentStep === "re_inspection") {
        currentStageIndex = stages.findIndex(s => s.key === "re_inspection");
    } else if (currentStageIndex === -1 && currentService.serviceStatus === 'assigned') {
        currentStageIndex = 0;
    }

    stages.forEach((stage, index) => {
        let dotClass = "tl-dot";
        let dateText = "Pending";

        if (index < currentStageIndex) { dotClass += " completed"; dateText = "Completed"; }
        else if (index === currentStageIndex) { dotClass += " active"; dateText = "In Progress"; }

        let hit = history.find(h => h.to === stage.key || h.action === stage.key + "_saved");

        if (stage.key === "vehicle_received") {
            hit = history.find(h => h.type === "job_accepted" || h.type === "job_started" || h.action === "work_started");
            if (!hit && currentService.createdAt) hit = { at: currentService.createdAt };
        }

        if (stage.key === "service_complete" && !hit) {
            hit = history.find(h => h.action === "submitted_for_approval" || h.action === "re_submitted_for_approval" || h.action === "completion_approved");
        }

        if (stage.key === "re_inspection") {
            hit = history.find(h => h.action === "re_inspection_requested");
        }

        if (hit) {
            let d = null;
            if (hit.at && typeof hit.at.toDate === 'function') d = hit.at.toDate();
            else if (hit.timestamp && typeof hit.timestamp.toDate === 'function') d = hit.timestamp.toDate();
            else if (hit.at) d = new Date(hit.at);
            else if (hit.timestamp) d = new Date(hit.timestamp);

            if (d && !isNaN(d)) {
                // STRICT RULE: Only overwrite "Pending" / "In Progress" with the date if the stage is fully completed
                if (index < currentStageIndex) {
                    dateText = d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}) + ', ' + d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
                }
            }
        }

        timelineEl.innerHTML += `
            <div class="timeline-item">
                <div class="${dotClass}"></div>
                <h4>${stage.label}</h4>
                <p>${dateText}</p>
            </div>
        `;
    });
}

// 3. Inspection Summary
function renderInspection() {
    const el = document.getElementById("inspectionSummary");
    const rep = currentService.inspectionReport;
    if (!rep || !rep.issues) { el.innerHTML = '<p class="loading-text">No inspection data found.</p>'; return; }

    let html = '';
    rep.issues.forEach(issue => {
        html += `<div class="summary-row">
            <span class="label"><i class="fa-regular fa-circle-check"></i> ${issue}</span>
            <span class="status-bad">Identified</span>
        </div>`;
    });
    html += `<div class="summary-row mt-20">
        <span class="label">Overall Severity</span>
        <span class="severity-badge">${rep.severity || "Unknown"}</span>
    </div>`;
    el.innerHTML = html;
}

// 4. Test Drive Summary
function renderTestDrive() {
    const el = document.getElementById("testDriveSummary");
    const rep = currentService.testDriveReport;
    if (!rep || !rep.checklist) { el.innerHTML = '<p class="loading-text">No test drive data found.</p>'; return; }

    let html = '';
    rep.checklist.forEach(item => {
        html += `<div class="summary-row">
            <span class="label"><i class="fa-regular fa-circle-check"></i> ${item}</span>
            <span class="status-good">Passed</span>
        </div>`;
    });
    html += `<div class="summary-row mt-20">
        <span class="label">Distance</span>
        <span><strong>${rep.distanceKm || "0"} KM</strong></span>
    </div>`;
    el.innerHTML = html;
    document.getElementById("distanceMetric").textContent = `${rep.distanceKm || "0"} KM`;
}

// 5. Analytics (Photos/Videos)
function renderAnalytics() {
    const media = currentService.mediaSummary || {};
    document.getElementById("photoCount").textContent = media.photoCount || "0";
    document.getElementById("videoCount").textContent = media.videoCount || "0";
}

// 6. Media Review Center
async function loadMedia() {
    const gallery = document.getElementById("mediaGallery");
    const tabs = document.querySelectorAll(".media-tab");
    
    // Fetch all media
    const mediaRef = collection(db, "services", currentServiceId, "media");
    const snap = await getDocs(mediaRef);
    let allMedia = [];
    snap.forEach(doc => allMedia.push(doc.data()));

    // --- NEW: HANDLE RE-INSPECTION MEDIA ---
    const currentRound = currentService.reInspectionRound || 1;
const rsPhotos = allMedia.filter(m => m.stage === 're_inspection' && m.type !== 'video' && (m.reInspectionRound || 1) === currentRound);
const rsVideos = allMedia.filter(m => m.stage === 're_inspection' && m.type === 'video' && (m.reInspectionRound || 1) === currentRound);
const prevRsMedia = allMedia.filter(m => m.stage === 're_inspection' && (m.reInspectionRound || 1) < currentRound);
    const rsCard = document.getElementById("reInspectionMediaCard");
    
    if (rsCard) {
        if (rsPhotos.length > 0 || rsVideos.length > 0) {
            rsCard.style.display = "block";
            document.getElementById("rsPhotoCount").textContent = rsPhotos.length;
            document.getElementById("rsVideoCount").textContent = rsVideos.length;
            
            const pGal = document.getElementById("rsPhotoGallery");
            const vGal = document.getElementById("rsVideoGallery");
            pGal.innerHTML = ""; vGal.innerHTML = "";
            
            // Render RS Photos
            rsPhotos.forEach(m => {
                const img = document.createElement("img");
                img.src = m.url || m.imageUrl;
                img.addEventListener("click", () => openImageModal(img.src));
                pGal.appendChild(img);
            });
            if(rsPhotos.length === 0) pGal.innerHTML = '<p class="loading-text" style="color:#fca5a5;">No fix photos uploaded.</p>';

            // Render RS Videos
            rsVideos.forEach(m => {
                const vid = document.createElement("video");
                vid.src = m.url || m.imageUrl;
                vid.controls = true;
                vid.className = "gallery-video";
                vGal.appendChild(vid);
            });
            if(rsVideos.length === 0) vGal.innerHTML = '<p class="loading-text" style="color:#fca5a5;">No fix videos uploaded.</p>';
        } else {
            rsCard.style.display = "none";
        }
    }
    // ---------------------------------------

    // Show previous round media if any
        if (prevRsMedia.length > 0 && rsCard) {
            const prevHtml = prevRsMedia.map(m =>
                m.type === 'video'
                ? `<video src="${m.url}" controls class="gallery-video" title="Round ${m.reInspectionRound || 1}"></video>`
                : `<img src="${m.url}" title="Round ${m.reInspectionRound || 1}" style="width:120px;height:90px;object-fit:contain;border-radius:8px;cursor:pointer;border:1px solid #fca5a5;" onclick="document.getElementById('modalImage').src=this.src;document.getElementById('imageModal').style.display='block'">`
            ).join("");
            rsCard.innerHTML += `
                <div style="margin-top:16px;border-top:1px dashed #fca5a5;padding-top:12px;">
                    <p style="font-size:12px;color:#7f1d1d;font-weight:600;margin-bottom:8px;">📁 Previous Re-Inspection Rounds</p>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">${prevHtml}</div>
                </div>`;
        }

    // Tab Logic for Regular Media (Excluding Re-Inspection)
    const renderGallery = (targetStage) => {
        gallery.innerHTML = "";
        
        // Filter out re_inspection media from normal tabs
        let filtered = allMedia.filter(m => {
            if (m.stage === 're_inspection') return false; 
            if (targetStage === 'video') return m.type === 'video';
            return m.stage === targetStage && m.type !== 'video';
        });
        
        // Update counts (ignoring re_inspection media)
        document.getElementById("countBefore").textContent = allMedia.filter(m => m.stage === 'before' && m.type !== 'video').length;
        document.getElementById("countDuring").textContent = allMedia.filter(m => m.stage === 'during' && m.type !== 'video').length;
        document.getElementById("countAfter").textContent = allMedia.filter(m => m.stage === 'after' && m.type !== 'video').length;
        document.getElementById("countVideo").textContent = allMedia.filter(m => m.type === 'video' && m.stage !== 're_inspection').length;

        if(filtered.length === 0) {
            gallery.innerHTML = '<p class="loading-text">No media uploaded for this stage.</p>';
            return;
        }

        filtered.forEach(m => {
            if (m.type === 'video') {
                const vid = document.createElement("video");
                vid.src = m.url || m.imageUrl;
                vid.controls = true;
                vid.className = "gallery-video";
                gallery.appendChild(vid);
            } else {
                const img = document.createElement("img");
                img.src = m.url || m.imageUrl; 
                img.addEventListener("click", () => openImageModal(img.src));
                gallery.appendChild(img);
            }
        });
    };

    tabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            tabs.forEach(t => t.classList.remove("active"));
            e.currentTarget.classList.add("active");
            renderGallery(e.currentTarget.dataset.stage);
        });
    });

    // Initial load
    renderGallery("before");
}

// ==========================================
// IMAGE MODAL LOGIC
// ==========================================
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeModalBtn = document.querySelector(".close-modal");

function openImageModal(imgSrc) {
    if (!imageModal || !modalImage) return;
    imageModal.style.display = "block";
    modalImage.src = imgSrc;
}

if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
        imageModal.style.display = "none";
    });
}

// Close if user clicks anywhere outside the image
if (imageModal) {
    imageModal.addEventListener("click", (e) => {
        if (e.target === imageModal) {
            imageModal.style.display = "none";
        }
    });
}


// =========================================================================
// ADMIN ACTIONS VISIBILITY ENGINE
// =========================================================================
function evaluateAdminActions(s) {
    const status = s.serviceStatus || "";
    const cancelPending = s.cancelRequested === true;

    // Grab individual container elements
    const cancelBox      = document.getElementById("cancelActionContainer");
    const mechCancelBox  = document.getElementById("mechanicCancelContainer");
    const reviewBox      = document.getElementById("reviewActionsContainer");
    const completeBox    = document.getElementById("completeActionContainer");
    // Top-of-page cancel card (near re-inspection media)
    const topCancelCard  = document.getElementById("mechanicCancelTopCard");

    // Hide all by default
    if (cancelBox)     cancelBox.style.display     = "none";
    if (mechCancelBox) mechCancelBox.style.display  = "none";
    if (reviewBox)     reviewBox.style.display      = "none";
    if (completeBox)   completeBox.style.display    = "none";
    if (topCancelCard) topCancelCard.style.display  = "none";

    // Scenario A: Mechanic has an active cancel request — show BOTH top card + admin action box
    if (cancelPending) {
        if (mechCancelBox)  mechCancelBox.style.display  = "flex";
        if (topCancelCard)  topCancelCard.style.display  = "block";
        return; // Don't show other actions while cancel is pending
    }

    // Scenario B: Service is actively in progress
    if (["assigned", "job_assigned", "in_service", "in_progress"].includes(status)) {
        if (cancelBox) cancelBox.style.display = "flex";
    }
    // Scenario C: Mechanic submitted work → Review Board
    else if (status === "pending_approval") {
        if (reviewBox) reviewBox.style.display = "flex";
    }
    // Scenario D: Admin approved work → finalize
    else if (status === "work_done") {
        if (completeBox) completeBox.style.display = "flex";
    }
    // Scenario E: Completed
    else if (status === "completed") {
        // no action buttons
    }
    }


// =========================================================================
// ACTION FUNCTIONALITIES (Batch Updating Services & Job Cards)
// =========================================================================

// 1. APPROVE WORK → sets work_done + sends mechanic email
document.getElementById("approveBtn")?.addEventListener("click", async () => {
    const { isConfirmed } = await Swal.fire({
        title: "Approve Work?",
        text: "This will approve the mechanic's work and notify them by email. You can then mark the service as fully completed.",
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#16a34a",
        confirmButtonText: "Yes, Approve Work"
    });
    if (!isConfirmed) return;

    const btn = document.getElementById("approveBtn");
    btn.innerText = "Approving...";
    btn.disabled = true;

    try {
        let jobId = currentService?.jobCardId;
        if (!jobId) {
            const snap = await getDocs(collection(db, "jobCards"));
            snap.forEach(d => { if (d.data().serviceId === currentServiceId) jobId = d.id; });
        }
        if (!jobId) throw new Error("Could not resolve jobCardId for this service.");

        await callApproveWork({ jobId });

        Swal.fire({
            icon: "success",
            title: "Work Approved!",
            text: "The mechanic has been notified by email. Click 'Mark as Completed' to finalize the service.",
            confirmButtonColor: "#16a34a"
        });
    } catch (err) {
        console.error("Approve work failed:", err);
        Swal.fire("Error", err.message || "Failed to approve work.", "error");
    } finally {
        btn.innerText = "Approve Work";
        btn.disabled = false;
    }
});

// 2. REQUEST RE-INSPECTION
document.getElementById("reinspectBtn")?.addEventListener("click", async () => {
    const { value: reason } = await Swal.fire({
        title: "Request Re-Inspection",
        input: "textarea",
        inputLabel: "Explicit reason/instructions for re-submission:",
        inputPlaceholder: "Type your reasons here...",
        showCancelButton: true,
        confirmButtonColor: "#ea580c",
        confirmButtonText: "Send to Mechanic",
        inputValidator: (value) => {
            if (!value || value.trim() === "") return "A valid description is mandatory!";
        }
    });
    if (!reason) return;

    try {
        const batch = writeBatch(db);
        const serviceRef = doc(db, "services", currentServiceId);
        
        // 1. Update Service
        batch.update(serviceRef, {
            serviceStatus: "in_progress",
            currentStep: "re_inspection",
            lastRejectionReason: reason,
            history: arrayUnion({
                action: "re_inspection_requested",
                note: `Admin requested a fix: ${reason}`,
                at: new Date(),
                by: currentUser.uid
            })
        });

       // 2. Update Job Card
        if (currentService?.jobCardId) {
            batch.update(doc(db, "jobCards", currentService.jobCardId), {
                status: "in_progress",
                progress: "re_inspection",
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    action: "re_inspection_requested",
                    note: `Admin requested a fix: ${reason}`,
                    at: new Date(),
                    by: currentUser.uid
                })
            });
        }

        await batch.commit();
        Swal.fire("Sent!", "Service sent back for re-inspection.", "success");
    } catch (err) {
        console.error("Re-inspection update failed:", err);
        Swal.fire("Error", "Failed to send back.", "error");
    }
});

// 3. MARK AS COMPLETED → sets completed + sends customer email + redirects
document.getElementById("completeBtn")?.addEventListener("click", async () => {
    const { isConfirmed } = await Swal.fire({
        title: "Finalize Service?",
        text: "This will mark the service as 100% complete and send a completion email to the customer.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        confirmButtonText: "Yes, Finalize"
    });
    if (!isConfirmed) return;

    const btn = document.getElementById("completeBtn");
    btn.innerText = "Finalizing...";
    btn.disabled = true;

    try {
        let jobId = currentService?.jobCardId;
        if (!jobId) {
            const snap = await getDocs(collection(db, "jobCards"));
            snap.forEach(d => { if (d.data().serviceId === currentServiceId) jobId = d.id; });
        }
        if (!jobId) throw new Error("Could not resolve jobCardId for this service.");

        await callCompleteServiceFinal({ jobId });

        // Show success overlay and redirect — stops the onSnapshot freeze
        await Swal.fire({
            icon: "success",
            title: "Service Completed! ✅",
            html: `
                <p>The service has been finalized and the customer has been notified by email.</p>
                <p style="color:#6b7280;font-size:13px;margin-top:8px;">Redirecting to dashboard...</p>
            `,
            showConfirmButton: true,
            confirmButtonText: "Go to Dashboard",
            confirmButtonColor: "#2563eb",
            timer: 4000,
            timerProgressBar: true,
            allowOutsideClick: false
        });

        window.location.href = "service-dashboard.html";

    } catch (err) {
        console.error("Finalize service failed:", err);
        Swal.fire("Error", err.message || "Failed to finalize service.", "error");
        btn.innerText = "Mark as Completed";
        btn.disabled = false;
    }
});

// 4. CANCEL SERVICE
document.getElementById("cancelBtn")?.addEventListener("click", async () => {
    const { value: reason } = await Swal.fire({
        title: "Cancel Service",
        input: "text",
        inputLabel: "Enter a valid reason for cancellation:",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        confirmButtonText: "Force Cancel",
        inputValidator: (value) => {
            if (!value || value.trim() === "") return "You must provide a reason.";
        }
    });
    if (!reason) return;
    
    try {
        const batch = writeBatch(db);
        const serviceRef = doc(db, "services", currentServiceId);
        
        // 1. Update Service
        batch.update(serviceRef, {
            serviceStatus: "cancelled",
            cancelReason: reason,
            cancelledAt: new Date(),
            history: arrayUnion({
                action: "cancelled",
                note: `Service cancelled by Admin. Reason: ${reason}`,
                at: new Date(),
                by: currentUser.uid
            })
        });

      // 2. Update Job Card
        if (currentService?.jobCardId) {
            batch.update(doc(db, "jobCards", currentService.jobCardId), {
                status: "cancelled",
                cancelReason: reason,
                cancelRequested: false,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    action: "cancelled",
                    note: `Service cancelled by Admin. Reason: ${reason}`,
                    at: new Date(),
                    by: currentUser.uid
                })
            });
        }

        await batch.commit();
        await Swal.fire({
            icon: "success",
            title: "Cancelled",
            text: "Service has been successfully cancelled.",
            timer: 3000,
            timerProgressBar: true,
            showConfirmButton: true,
            confirmButtonText: "Go to Dashboard"
        });
        window.location.href = "manage-services.html";
    } catch (err) {
        console.error("Cancellation failed:", err);
        Swal.fire("Error", "Cancellation failed.", "error");
    }
});

// 5. APPROVE MECHANIC CANCEL REQUEST
document.getElementById("approveCancelBtn")?.addEventListener("click", async () => {
    const { isConfirmed } = await Swal.fire({
        title: "Approve Cancellation?",
        text: "Approve the mechanic's request to abort this service?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        confirmButtonText: "Yes, Approve Cancel"
    });
    if (!isConfirmed) return;
    
    try {
        // Read mechanic's cancel reason from history
        const mechCancelEntry = (currentService?.history || [])
            .slice().reverse()
            .find(h => h.action === "cancel_requested");
        const mechCancelReason = mechCancelEntry?.reason || mechCancelEntry?.note || "Mechanic requested cancellation";

        const batch = writeBatch(db);
        const serviceRef = doc(db, "services", currentServiceId);
        
        // Service update — must match CASE 4 rule exactly:
        // needs cancelReason (string) + cancelledAt (serverTimestamp)
        // no extra fields outside what CASE 4 checks
        batch.update(serviceRef, {
            serviceStatus: "cancelled",
            cancelReason: mechCancelReason,    // CASE 4: cancelReason is string ✅
            cancelledAt: serverTimestamp(),    // CASE 4: cancelledAt is timestamp ✅
            history: arrayUnion({
                action: "cancellation_approved",
                note: "Admin approved the mechanic's cancellation request.",
                at: new Date(),
                by: currentUser.uid
            })
        });

        // JobCard update — only fields in the service_center update rule
        if (currentService?.jobCardId) {
            batch.update(doc(db, "jobCards", currentService.jobCardId), {
                status: "cancelled",
                cancelRequested: false,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    action: "cancellation_approved",
                    note: "Admin approved the mechanic's cancellation request.",
                    at: new Date(),
                    by: currentUser.uid
                })
            });
        }

        await batch.commit();
        await Swal.fire({
            icon: "success",
            title: "Approved",
            text: "Cancellation request approved.",
            timer: 3000,
            timerProgressBar: true,
            showConfirmButton: true,
            confirmButtonText: "Go to Dashboard"
        });
        window.location.href = "manage-services.html";
    } catch (err) {
        console.error("Error approving cancellation:", err);
        Swal.fire("Error", "Failed to approve cancellation.", "error");
    }
});

// 6. REJECT MECHANIC CANCEL REQUEST
document.getElementById("rejectCancelBtn")?.addEventListener("click", async () => {
    const { value: reason } = await Swal.fire({
        title: "Reject Cancellation",
        input: "text",
        inputLabel: "Reason for rejecting the request:",
        showCancelButton: true,
        confirmButtonColor: "#475569",
        confirmButtonText: "Reject Request",
        inputValidator: (value) => {
            if (!value || value.trim() === "") return "A reason is required.";
        }
    });
    if (!reason) return;
    
    try {
        const batch = writeBatch(db);
        const serviceRef = doc(db, "services", currentServiceId);
        
        // Service update — CASE 9 rule only allows: serviceStatus + history
        // Extra fields (cancelRequested, cancelRejectionNote) must go in jobCard only
        batch.update(serviceRef, {
            serviceStatus: "in_progress",
            cancelRequested: false,
            cancelRejectedAt: serverTimestamp(),
            cancelRejectionNote: reason,
            history: arrayUnion({
                action: "cancellation_rejected",
                note: `Admin denied cancellation. Reason: ${reason}`,
                at: new Date(),
                by: currentUser.uid
            })
        });

        // JobCard — service center has broad update permission on assigned jobs
        if (currentService?.jobCardId) {
            batch.update(doc(db, "jobCards", currentService.jobCardId), {
                status: "in_progress",
                cancelRequested: false,
                cancelRejectionNote: reason,
                cancelRejectedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    action: "cancellation_rejected",
                    note: `Admin denied cancellation. Reason: ${reason}`,
                    at: new Date(),
                    by: currentUser.uid
                })
            });
        }

        await batch.commit();
        Swal.fire("Rejected", "The service is back in progress.", "success");
    } catch (err) {
        console.error("Error rejecting cancellation:", err);
        Swal.fire("Error", "Failed to reject cancellation.", "error");
    }
});

// Top cancel card buttons — delegate to the same bottom buttons
document.getElementById("topApproveCancelBtn")?.addEventListener("click", () => {
    document.getElementById("approveCancelBtn")?.click();
});
document.getElementById("topRejectCancelBtn")?.addEventListener("click", () => {
    document.getElementById("rejectCancelBtn")?.click();
});