import { getAuth, onAuthStateChanged, signOut } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { initializeApp } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

import {getFirestore ,collection, addDoc, query, where, getDocs,setDoc, updateDoc,serverTimestamp, doc, getDoc} 
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
  //car DOMS
  const addCarBtn = document.getElementById("addCarBtn");
  const carNumber = document.getElementById("carNumber");
  const brand = document.getElementById("brand");
  const model = document.getElementById("model");
  const colour = document.getElementById("colour");
  //Service DOMS
  const carSelect = document.getElementById("carSelect");
  const serviceNotes = document.getElementById("serviceNotes");
  const serviceList = document.getElementById("serviceList");
  const createServiceBtn = document.getElementById("createServiceBtn");
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
    //the button are enbale once the user is logged in

    addCarBtn.disabled = false;
    createServiceBtn.disabled = false;

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



addCarBtn.addEventListener("click", async () => {

  //checks is the car is already exists

  const carCheckQuery = query(
  collection(db, "cars"),
  where("ownerId", "==", currentUser.uid),
  where("carNumber", "==", carNumber.value.trim())
);

const existingCars = await getDocs(carCheckQuery);

if (!existingCars.empty) {
  alert("This car is already registered");
  return;
}

  if (
    !carNumber.value.trim() ||
    !brand.value.trim() ||
    !model.value.trim() ||
    !colour.value.trim()
  ) {
    alert("Fill all car details");
    return;
  }
  //disable button the user is known or logged in
  addCarBtn.disabled = true;
createServiceBtn.disabled = true;

  try {
    await setDoc(
      //set the RC number as the CarID
    doc(db, "cars", carNumber.value.trim().toUpperCase()), {
      ownerId: currentUser.uid,
      carNumber: carNumber.value.trim().toUpperCase(),
      brand: brand.value.trim(),
      model: model.value.trim(),
      colour: colour.value.trim(),
      createdAt: serverTimestamp()
    });

    carNumber.value = "";
    brand.value = "";
    model.value = "";
    colour.value = "";

    alert("Car added successfully");

    carNumber.value = "";
    brand.value = "";
    model.value = "";
    colour.value = "";

    loadCarOptions();

  } catch (e) {
    console.error(e);
    alert("Failed to add car");
   } finally {
    addCarBtn.disabled = false;
    createServiceBtn.disabled = false;
   }
});



// populate car dropdown
async function loadCarOptions() {
  carSelect.innerHTML = "";

  const q = query(collection(db, "cars"), 
  where("ownerId", "==", currentUser.uid));

  const snap = await getDocs(q);

  //  No car -> block service creation
  if (snap.empty) {
    createServiceBtn.disabled = true;
    return;
  }

  // Cars exist -> allow service creation
  createServiceBtn.disabled = false;
  
  snap.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.data().carNumber} - ${d.data().brand}`;
    carSelect.appendChild(opt);
  });
}
//verfying and blocking if or car is not selected or no note added for the service created
// ------CREATE SERVICE----
createServiceBtn.addEventListener("click", async () => {
  if (!carSelect.value) {
    alert("Please register a car before creating a service");
    return;
  }

  if (!serviceNotes.value.trim()) {
    alert("Please add service notes");
    return;
  }

  //check: is this car already in service?

  const activeServiceQuery = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid),
    where("carId", "==", carSelect.value),
    where("serviceStatus", "==", "in_progress")
  );

  const activeSnap = await getDocs(activeServiceQuery);

  if (!activeSnap.empty) {
    alert("This car is already under service. Please wait until it is completed.");
     serviceNotes.value = "";
    return;
  }


  try {
    await addDoc(collection(db, "services"), {
      ownerId: currentUser.uid,
      carId: carSelect.value,
      notes: serviceNotes.value,
      serviceStatus: "in_progress",
      startedAt: serverTimestamp()
    });
    alert("Service created");

    serviceNotes.value = "";
    carSelect.selectedIndex = 0;

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
