import { db } from "../firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// BACK BUTTON
window.goBack = function() {
  window.history.back();
};

const container = document.getElementById("detailsContainer");

// GET ID
const params = new URLSearchParams(window.location.search);
const serviceId = params.get("serviceId");

if (!serviceId) {
  container.innerHTML = "Invalid service";
}

// =======================
// LOAD DETAILS
// =======================
async function loadDetails() {

  const serviceSnap = await getDoc(doc(db, "services", serviceId));

  if (!serviceSnap.exists()) {
    container.innerHTML = "Service not found";
    return;
  }

  const data = serviceSnap.data();

  // =====================
  // HEADER
  // =====================
  let html = `
    <div class="service-card">
      <h3>
        ${data.carSnapshot?.carNumber} - 
        ${data.carSnapshot?.brand} (${data.carSnapshot?.model})
      </h3>

      <p><b>Status:</b> ${data.serviceStatus}</p>
    </div>
  `;

  // =====================
  // 🔥 TIMELINE (IMPORTANT)
  // =====================
  let timelineHTML = "";

  if (data.history && data.history.length > 0) {

    const sorted = [...data.history].sort((a, b) => {
      return (a.at?.seconds || 0) - (b.at?.seconds || 0);
    });

    sorted.forEach(item => {

      const time = item.at?.seconds
        ? new Date(item.at.seconds * 1000).toLocaleString()
        : "";

      timelineHTML += `
        <div class="timeline-item">
          ${formatAction(item.action)} — ${time}
        </div>
      `;
    });
  }

  html += `
    <div class="section-card">
      <h3>Activity Timeline</h3>
      <div class="timeline">
        ${timelineHTML || "No history available"}
      </div>
    </div>
  `;

  // =====================
  // 🔥 MEDIA
  // =====================
  const mediaSnap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  let before = [], during = [], after = [];

  mediaSnap.forEach(doc => {
    const m = doc.data();

    const item = `
      <div style="display:inline-block; margin:8px;">
        <img src="${m.url}" width="120"><br>
        <small>${m.createdAt?.seconds 
          ? new Date(m.createdAt.seconds * 1000).toLocaleString() 
          : ""}</small>
      </div>
    `;

    if (m.stage === "before") before.push(item);
    if (m.stage === "during") during.push(item);
    if (m.stage === "after") after.push(item);
  });

  html += renderStage("Before", before);
  html += renderStage("During", during);
  html += renderStage("After", after);

  container.innerHTML = html;
}

// =======================
// FORMAT ACTION
// =======================
function formatAction(action) {

  const map = {
  service_created: "Service Created",
  service_center_assigned: "Assigned to Service Center",
  mechanic_assigned: "Mechanic Assigned",
  job_accepted: "Job Accepted",
  work_started: "Work Started",
  stage_updated: "Stage Updated",
  submitted_for_approval: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  work_done: "Work Done",
  completed: "Completed",
  cancelled: "Cancelled",
  cancel_requested: "Cancel Requested"
};

  return map[action] || action;
}

// =======================
// MEDIA SECTION
// =======================
function renderStage(title, items) {

  if (items.length === 0) return "";

  return `
    <div class="section-card">
      <h3>${title}</h3>
      ${items.join("")}
    </div>
  `;
}

loadDetails();