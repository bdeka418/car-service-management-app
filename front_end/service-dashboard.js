import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBf_wiFJv5K-wHZdPKGjx48dAIwYCE36rw",
  authDomain: "car-service-app-c369c.firebaseapp.com",
  projectId: "car-service-app-c369c",
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
//welcome note
const welcomeText = document.getElementById("welcomeText");


const serviceList = document.getElementById("serviceList");
const completedServiceList = document.getElementById("completedServiceList");


//can only access by the service-center
let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  const userData = userSnap.data();
  welcomeText.innerText = `Welcome, ${userData.name}`;

//role protection
  if (userSnap.data().role !== "service_center") {
    alert("Access denied");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  loadActiveServices();
  loadCompletedServices();

});
//=======================================
//fetching the car service details
//=======================================

async function loadActiveServices() {
  serviceList.innerHTML = "";

  const q = query(
    collection(db, "services"),
    where("serviceStatus", "in", ["in_progress", "assigned"])
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    serviceList.innerHTML = "<li>No active services</li>";
    return;
  }

  for (const d of snap.docs) {
    const data = d.data();
// ❌ Hide services assigned to other service centers
if (
  data.assignedServiceCenterId &&
  data.assignedServiceCenterId !== currentUser.uid
) {
  continue;
}

    const carSnap = await getDoc(doc(db, "cars", data.carId));
    const carText = carSnap.exists()
      ? `${carSnap.data().carNumber} - ${carSnap.data().brand}`
      : data.carId;

    let buttonHTML = "";

    

    if (!data.assignedServiceCenterId) {
      buttonHTML = `<button data-id="${d.id}" data-action="assign">Assign to Me</button>`;
    } 
    else if (data.assignedServiceCenterId === currentUser.uid) {
      buttonHTML = `<button data-id="${d.id}" data-action="complete">Mark Completed</button>`;
    }
//active service list
    const li = document.createElement("li");
    li.innerHTML = `
  <strong>${carText}</strong>
  ${buttonHTML}<br> 
  📝 Notes: ${data.notes || "—"}
`;

    serviceList.appendChild(li);
  }
}

//logic for the completdAt and the ASSIGN to me buttons

serviceList.addEventListener("click", async (e) => {
  if (e.target.tagName !== "BUTTON") return;

   const serviceId = e.target.dataset.id;
  const action = e.target.dataset.action;

  // ASSIGN SERVICE
  if (action === "assign") {
    await updateDoc(doc(db, "services", serviceId), {
      serviceStatus: "assigned",
      assignedServiceCenterId: currentUser.uid,
      assignedAt: serverTimestamp()
    });
  }
  
  // COMPLETE SERVICE
  if (action === "complete") {
    await updateDoc(doc(db, "services", serviceId), {
      serviceStatus: "completed",
      completedAt: serverTimestamp()
    });
  }
   loadActiveServices();
   loadCompletedServices();

  });

  //complete service list

  async function loadCompletedServices() {
  completedServiceList.innerHTML = "";

  const q = query(
    collection(db, "services"),
    where("serviceStatus", "==", "completed"),
    where("assignedServiceCenterId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    completedServiceList.innerHTML = "<li>No completed services</li>";
    return;
  }

  for (const d of snap.docs) {
    const data = d.data();

    const carSnap = await getDoc(doc(db, "cars", data.carId));
    const carText = carSnap.exists()
      ? `${carSnap.data().carNumber} - ${carSnap.data().brand}`
      : data.carId;

    const completedTime = data.completedAt
      ? new Date(data.completedAt.seconds * 1000).toLocaleString("en-GB", {hour12: true})
      : "-";

    const li = document.createElement("li");

const noteText = data.notes
  ? `<br><em>Note:</em> ${data.notes}`
  : "";

li.innerHTML = `
  <strong>${carText}</strong>
  <br>Completed at: ${completedTime}
  ${noteText}
`;
    completedServiceList.appendChild(li);
  }
}



//logout

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
