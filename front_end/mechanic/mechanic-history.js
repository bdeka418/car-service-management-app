import { db, auth } from "../firebase.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc, getDoc 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";


const historyList = document.getElementById("historyList");

onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.log("No user logged in");
    return;
  }

  // ✅ DEFINE currentUser HERE
  const currentUser = user;

  // 🔥 NOW SAFE TO USE
  const q = query(
    collection(db, "services"),
    where("mechanicId", "==", currentUser.uid)
  );

  onSnapshot(q, (snapshot) => {
    const list = document.getElementById("historyList");
    list.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      

      // ✅ FILTER ONLY COMPLETED / REJECTED
   
      if (!["work_done", "cancelled"].includes(data.serviceStatus)) return;

      const li = document.createElement("li");

      // ✅ CAR TEXT
      const carText = data.carSnapshot
        ? `${data.carSnapshot.carNumber} | ${data.carSnapshot.brand} (${data.carSnapshot.model})`
        : data.carId;

      const history = data.history || [];

let timelineHTML = "";

// 🔥 BUILD TIMELINE
history
  .sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0))
  .forEach(item => {
    timelineHTML += `
      <div style="
        margin:6px 0;
        padding-left:10px;
        border-left:3px solid #3b82f6;
      ">
        <p style="margin:0; font-weight:600;">
          ${item.action.replaceAll("_", " ").toUpperCase()}
        </p>

        ${item.stage ? `<p style="margin:0;">Stage: ${item.stage}</p>` : ""}
        ${item.reason ? `<p style="margin:0;">Reason: ${item.reason}</p>` : ""}

        <p style="font-size:12px; color:#666;">
          ${
            item.at
              ? (item.at.seconds
                  ? new Date(item.at.seconds * 1000).toLocaleString()
                  : new Date(item.at).toLocaleString()
                )
              : "No time"
          }
        </p>
      </div>
    `;
  });

// CARD
li.innerHTML = `
  <div class="service-tile">
    <h3>${carText}</h3>

    <p><b>Status:</b> ${data.serviceStatus}</p>

    <div style="margin-top:10px;">
      ${timelineHTML || "<p style='color:gray;'>No history</p>"}
    </div>
  </div>
`;

      list.appendChild(li);
    });
  });
});