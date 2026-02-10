import { getAuth, onAuthStateChanged, signOut } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { initializeApp } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

import {getFirestore ,collection, addDoc, query, where, getDocs, updateDoc,serverTimestamp, doc, getDoc} 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";



const firebaseConfig = {
 apiKey: "AIzaSyBf_wiFJv5K-wHZdPKGjx48dAIwYCE36rw",
    authDomain: "car-service-app-c369c.firebaseapp.com",
    projectId: "car-service-app-c369c",
    storageBucket: "car-service-app-c369c.firebasestorage.app",
    messagingSenderId: "88111807766",
    appId: "1:88111807766:web:0ccaf8189abf18d336e437",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

//role
let currentRole = null;
let currentUser = null;

// 🔐 Auth check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
  else {
    currentUser = user;

    const userSnap = await getDoc(doc(db, "users", user.uid));
    currentRole = userSnap.data().role;

loadCarOptions();
loadServices();
    }
});

// 🚪 Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});


//the car logic

const addCarBtn = document.getElementById("addCarBtn");
const carNumber = document.getElementById("carNumber");
const brand = document.getElementById("brand");
const model = document.getElementById("model");
const colour = document.getElementById("colour");

addCarBtn.addEventListener("click", async () => {
   if (
    !carNumber.value ||
    !brand.value ||
    !model.value ||
    !colour.value
  ) {
    alert("Fill all car details");
    return;
  }
  try {
    await addDoc(collection(db, "cars"), {
      ownerId: currentUser.uid,
      carNumber: carNumber.value,
      brand: brand.value,
      model: model.value,
      colour: colour.value,
      createdAt: serverTimestamp()
    });

    alert("Car added successfully");
    loadCarOptions();
  } catch (e) {
    console.error(e);
    alert("Failed to add car");
  }
});


const carSelect = document.getElementById("carSelect");
const serviceList = document.getElementById("serviceList");
const createServiceBtn = document.getElementById("createServiceBtn");

// populate car dropdown
async function loadCarOptions() {
  carSelect.innerHTML = "";
  const q = query(collection(db, "cars"), where("ownerId", "==", currentUser.uid));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.data().carNumber} - ${d.data().brand}`;
    carSelect.appendChild(opt);
  });
}

// create service
createServiceBtn.addEventListener("click", async () => {
  try {
    await addDoc(collection(db, "services"), {
      ownerId: currentUser.uid,
      carId: carSelect.value,
      notes: serviceNotes.value,
      serviceStatus: "in_progress",
      startedAt: serverTimestamp()
    });
    alert("Service created");
    loadServices();
  } catch {
    alert("Failed to create service");
  }
});

// list services

 async function loadServices() {
  serviceList.innerHTML = "";

  const q = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  for (const d of snap.docs) {
    const li = document.createElement("li");
    const data = d.data();

    // fetch car details
    const carSnap = await getDoc(doc(db, "cars", data.carId));
    const carText = carSnap.exists()
      ? `${carSnap.data().carNumber} - ${carSnap.data().brand}`
      : "Unknown car";

    li.innerHTML = `
      ${carText} | ${data.serviceStatus}
      ${
        data.serviceStatus !== "completed" && currentRole === "service_center"
          ? `<button data-id="${d.id}">Complete</button>`
          : ""
      }
    `;

    serviceList.appendChild(li);
  }
}



// complete service
serviceList.addEventListener("click", async (e) => {
  if (e.target.tagName === "BUTTON") {
    const id = e.target.getAttribute("data-id");
    await updateDoc(doc(db, "services", id), {
      serviceStatus: "completed",
      completedAt: serverTimestamp()
    });
    loadServices();
  }
});
