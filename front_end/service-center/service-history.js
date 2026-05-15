import { db, auth } from "../firebase.js";

import {
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

let currentUser = null;

onAuthStateChanged(auth, (user) => {

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  loadHistory(user);
});

// =======================
// LOAD HISTORY
// =======================
function loadHistory(user) {

  const container = document.getElementById("historyContainer");

  const q = query(
    collection(db, "services"),
    where("assignedServiceCenterId", "==", user.uid),
    where("serviceStatus", "in", ["completed", "cancelled"])
  );

  onSnapshot(q, (snapshot) => {

    container.innerHTML = "";

    if (snapshot.empty) {
      container.innerHTML = "<p>No history available</p>";
      return;
    }

    snapshot.forEach((docSnap) => {

      const data = docSnap.data();

      const div = document.createElement("div");
      div.className = "service-card";

      // 🔹 Car Info
      let carInfo = "Unknown";
      if (data.carSnapshot) {
        carInfo = `${data.carSnapshot.carNumber} - ${data.carSnapshot.brand} (${data.carSnapshot.model})`;
      }

      // 🔹 Status
      const statusClass = data.serviceStatus === "completed" ? "completed" : "cancelled";

      // 🔹 Timeline
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

     div.innerHTML = `
  <div class="card-header">
    <div class="car-title">${carInfo}</div>
    <div class="${statusClass}">
      ${data.serviceStatus.toUpperCase()}
    </div>
  </div>

  <div class="timeline">
    ${timelineHTML || "No history available"}
  </div>

  <button 
    style="margin-top:10px;"
    onclick="openDetails('${docSnap.id}')"
  >
    View Details
  </button>
`;

      container.appendChild(div);
    });
  });
}

// =======================
// FORMAT ACTION
// =======================
function formatAction(action) {

  const map = {
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

// OPEN DETAILS
window.openDetails = function(serviceId) {
  window.location.href = `service-details.html?serviceId=${serviceId}`;
};