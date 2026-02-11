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

const serviceList = document.getElementById("serviceList");


//can only access by the service-center
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  
//role protection
  if (userSnap.data().role !== "service_center") {
    alert("Access denied");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  loadActiveServices();
});

//fetching the car service details

async function loadActiveServices() {
  serviceList.innerHTML = "";

  const q = query(
    collection(db, "services"),
    where("serviceStatus", "==", "in_progress")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    serviceList.innerHTML = "<li>No active services</li>";
    return;
  }

  for (const d of snap.docs) {
    const data = d.data();

    // fetch car info
    const carSnap = await getDoc(doc(db, "cars", data.carId));
    const carText = carSnap.exists()
      ? `${carSnap.data().carNumber} - ${carSnap.data().brand}`
      : data.carId;

    const li = document.createElement("li");
    li.innerHTML = `
      ${carText}
      <button data-id="${d.id}">Mark Completed</button>
    `;

    serviceList.appendChild(li);
  }
}

//logic for the completdAt burron

serviceList.addEventListener("click", async (e) => {
  if (e.target.tagName !== "BUTTON") return;

  const serviceId = e.target.getAttribute("data-id");

  await updateDoc(doc(db, "services", serviceId), {
    serviceStatus: "completed",
    completedAt: serverTimestamp()
  });

  alert("Service marked as completed");
  loadActiveServices();
});

//logout

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
