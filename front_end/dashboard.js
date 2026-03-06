import { getAuth, onAuthStateChanged, signOut } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { initializeApp } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

import {getFirestore ,collection, addDoc, query, where, getDocs,setDoc, updateDoc,serverTimestamp, doc, getDoc, onSnapshot} 
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

  //welcome note
  const welcomeText = document.getElementById("welcomeText");
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
  const historyList = document.getElementById("historyList");
  const carHistory = document.getElementById("carHistory");
  //priority
  const priorityOrder = {
  "assigned": 1,
  "in_progress": 2,
  "completed": 3
};
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
    const userData = userSnap.data();
    welcomeText.innerText = `Welcome, ${userData.name}`;

    //role guard
 if (currentRole !== "customer") {
    alert("Access denied");
    window.location.href = "index.html";
    return;
  }

    
    //the button are enbale once the user is logged in*(UI)
    addCarBtn.disabled = false;
    createServiceBtn.disabled = false;

loadCarOptions();
listenToCustomerServices();

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
  carHistory.innerHTML = "";

  // Add the "Placeholder" options first
  const placeholder1 = new Option("Select Car", "");
  placeholder1.disabled = true;  // Optional: makes it unselectable once changed
  placeholder1.selected = true;  // Makes it the default visible text
  carSelect.appendChild(placeholder1);

  const placeholder2 = new Option("Select Car for History", "");
  placeholder2.disabled = true;
  placeholder2.selected = true;
  carHistory.appendChild(placeholder2);

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
    const carData = d.data();
    const displayText = `${carData.carNumber} - ${carData.brand} (${carData.model})`;
    const carId = d.id;

    // Add to 'Create Service' dropdown
    const opt1 = new Option(displayText, carId);
    carSelect.appendChild(opt1);

    // Add to 'View History' dropdown
    const opt2 = new Option(displayText, carId);
    carHistory.appendChild(opt2);
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
    where("serviceStatus", "in", ["in_progress", "assigned"])
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
      assignedServiceCenterId: null, // NOT assigned yet
      startedAt: serverTimestamp()
    });
    alert("Service created");

    serviceNotes.value = "";
    carSelect.selectedIndex = 0;

   // listenToCustomerServices();

  } catch {
    alert("Failed to create service");
  }
});

// list services

 function listenToCustomerServices() {

  const q = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid)
  );

  onSnapshot(q, async (snap) => {

    serviceList.innerHTML = "";

    if (snap.empty) {
      serviceList.innerHTML = "<li>No services yet</li>";
      return;
    }

    const servicesArray = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const pA = priorityOrder[a.serviceStatus] || 99;
        const pB = priorityOrder[b.serviceStatus] || 99;

        if (pA !== pB) return pA - pB;
        return (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0);
      });

    for (const data of servicesArray) {
      const li = document.createElement("li");

      const carSnap = await getDoc(doc(db, "cars", data.carId));
      const carText = carSnap.exists()
        ? `${carSnap.data().carNumber} - ${carSnap.data().brand} (${carSnap.data().model})`
        : "Unknown car";

      li.innerHTML = `
        <strong>${carText}</strong><br>
        📝 Notes: ${data.notes || "—"}<br>
        Status: <b>${data.serviceStatus.toUpperCase()}</b>
      `;

      serviceList.appendChild(li);
    }
  });
}


//service history list

async function loadServiceHistory(carId) {
  historyList.innerHTML = "";

  const q = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid),
    where("carId", "==", carId)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    historyList.innerHTML = "<li>No service history</li>";
    return;
  }

  const services = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));

  services.forEach(s => {
    const li = document.createElement("li");

    // 1. Define the 3-way logic
    const statusLabel = 
        s.serviceStatus === "completed" 
            ? "COMPLETED" 
            : s.serviceStatus === "assigned" 
                ? "ASSIGNED TO TECHNICIAN" 
                : "IN PROGRESS (Awaiting service center)";

    // 2. Prepare the date strings
    const startedText = s.startedAt
        ? new Date(s.startedAt.seconds * 1000).toLocaleString("en-GB", {hour12: true})
        : "-";

    const completedText = (s.serviceStatus === "completed" && s.completedAt)
        ? ` | Completed: ${new Date(s.completedAt.seconds * 1000).toLocaleString("en-GB", {hour12: true})}`
        : "";

    // 3. Build the HTML (Only set innerHTML ONCE)
    li.innerHTML = `
        <strong>${statusLabel}</strong><br>
        📝 Notes: ${s.notes || "—"}<br>
        Started: ${startedText}${completedText}
    `;

    historyList.appendChild(li);
});
}

//trigger on click show service history

carHistory.addEventListener("change", () => {
  const selectedCarId = carHistory.value;
  
  // Only load if the value isn't the empty placeholder string
  if (selectedCarId) {
    loadServiceHistory(selectedCarId);
  } else {
    historyList.innerHTML = ""; 
  }
});

