import { db, auth } from "./firebase.js";

import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const jobList = document.getElementById("jobList");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
 

  currentUser = user;

  listenToJobs();
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

      const li = document.createElement("li");

      li.innerHTML = `
        <div class="service-tile">

          <h4>${data.carNumber}</h4>

          <p>${data.notes}</p>

          <p>Status: <b>${data.status}</b></p>

          <button onclick="startJob('${docSnap.id}')">
            Start Work
          </button>

          <button onclick="completeJob('${docSnap.id}')">
            Complete Job
          </button>

        </div>
      `;

      jobList.appendChild(li);
    });

  });
}
//start job function
window.startJob = async function(jobId) {

  await updateDoc(doc(db, "jobCards", jobId), {
    status: "in_progress",
    updatedAt: serverTimestamp()
  });

};

//complete job function
window.completeJob = async function(jobId) {

  await updateDoc(doc(db, "jobCards", jobId), {
    status: "completed",
    updatedAt: serverTimestamp()
  });

};