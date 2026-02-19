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
  getDoc,
  addDoc,
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

//storage
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";


const firebaseConfig = {
  apiKey: "AIzaSyBf_wiFJv5K-wHZdPKGjx48dAIwYCE36rw",
  authDomain: "car-service-app-c369c.firebaseapp.com",
  projectId: "car-service-app-c369c",
  storageBucket: "car-service-app-c369c.firebasestorage.app"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
//welcome note
const welcomeText = document.getElementById("welcomeText");

const serviceList = document.getElementById("serviceList");
const completedServiceList = document.getElementById("completedServiceList");
//upload(storge)
const storage = getStorage(app);
const mediaInput = document.getElementById("mediaInput");
const uploadBtn = document.getElementById("uploadMediaBtn");
const uploadStatus = document.getElementById("uploadStatus");


document.getElementById("uploadSection").style.display = "none";
uploadBtn.disabled = true;





//can only access by the service-center
let currentUser = null;
let selectedServiceId = null;

let completedUnsubscribe = null;

// Store media listeners to prevent duplicates
const mediaUnsubscribers = {};

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

  listenToActiveServices();
listenToCompletedServices();


});


function listenToServiceMedia(serviceId, buttonEl, warningEl) {

  // Remove old listener if exists
  if (mediaUnsubscribers[serviceId]) {
    mediaUnsubscribers[serviceId]();
  }

  const mediaRef = collection(db, "services", serviceId, "media");

  mediaUnsubscribers[serviceId] = onSnapshot(
    mediaRef,
    (mediaSnap) => {
      const hasMedia = !mediaSnap.empty;

      buttonEl.disabled = !hasMedia;

      if (warningEl) {
        warningEl.style.display = hasMedia ? "none" : "block";
      }
    },
    (error) => {
      // Permission race protection
      buttonEl.disabled = true;
    }
  );
}




//=======================================
//fetching the car service details
//=======================================

function listenToActiveServices() {
  const q = query(
    collection(db, "services"),
    where("serviceStatus", "in", ["in_progress", "assigned"])
  );

  onSnapshot(q, async (snap) => {
    serviceList.innerHTML = "";

    if (snap.empty) {
      serviceList.innerHTML = "<li>No active services</li>";
      return;
    }

    for (const d of snap.docs) {
      const data = d.data();

      // 🔐 Assigned filtering (keep this – very important)
      if (
        data.assignedServiceCenterId &&
        data.assignedServiceCenterId !== currentUser.uid
      ) {
        continue;
      }

      const carSnap = await getDoc(doc(db, "cars", data.carId));
      const carText = carSnap.exists()
        ? `${carSnap.data().carNumber} - ${carSnap.data().brand} (${carSnap.data().model})`
        : data.carId;

      let buttonHTML = "";

      if (!data.assignedServiceCenterId) {
        buttonHTML = `<button data-id="${d.id}" data-action="assign">Assign to Me</button>`;
      }
   else if (data.assignedServiceCenterId === currentUser.uid) {

  const buttonId = `complete-btn-${d.id}`;
  const warningId = `warning-${d.id}`;
  const cancelId = `cancel-btn-${d.id}`;

  buttonHTML = `
    <button
      id="${buttonId}"
      data-id="${d.id}"
      data-action="complete"
      disabled
    >
      Mark Completed
    </button>

    <button
    id="${cancelId}"
    data-id="${d.id}"
    data-action="cancel"
    style="margin-left:8px;"
  >
    Cancel Assignment
  </button>

    <small id="${warningId}">
      ⚠ Upload at least one photo/video before completing
    </small>
  `;
}


      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${carText}</strong><br>
        📝 Notes: ${data.notes || "—"}
        ${buttonHTML}
      `;

      serviceList.appendChild(li);

      // Attach media listener after element exists
if (data.assignedServiceCenterId === currentUser.uid) {

  setTimeout(() => {
    const btn = document.getElementById(`complete-btn-${d.id}`);
    const warn = document.getElementById(`warning-${d.id}`);

    if (btn) {
      listenToServiceMedia(d.id, btn, warn);
    }
  }, 0);

}

    }
    
  });
}


//logic for the completdAt and the ASSIGN to me buttons

serviceList.addEventListener("click", async (e) => {
    //  Robust event delegation
  const button = e.target.closest("button");
  if (!button) return;

  const serviceId = button.dataset.id;
  const action = button.dataset.action;

  if (!serviceId || !action) return;

  selectedServiceId = serviceId;

  // ================= ASSIGN =================

  if (action === "assign") {
    await updateDoc(doc(db, "services", serviceId), {
      serviceStatus: "assigned",
      assignedServiceCenterId: currentUser.uid,
      assignedAt: serverTimestamp(),
     
    });

    //  Enable upload after assign
    document.getElementById("uploadSection").style.display = "block";
    uploadBtn.disabled = false;
  }
 // ================= COMPLETE =================
 if (action === "complete") {

  await updateDoc(doc(db, "services", serviceId), {
    serviceStatus: "completed",
    completedAt: serverTimestamp()
  });

  // 🧹 Stop media listener
  if (mediaUnsubscribers[serviceId]) {
    mediaUnsubscribers[serviceId]();
    delete mediaUnsubscribers[serviceId];
  }

  // Hide upload section
  selectedServiceId = null;
  uploadBtn.disabled = true;
  document.getElementById("uploadSection").style.display = "none";
  uploadStatus.innerText = "";
}
// ================= CANCEL =================
else if (action === "cancel") {

  await updateDoc(doc(db, "services", serviceId), {
    serviceStatus: "in_progress",
    assignedServiceCenterId: null,
    assignedAt: null
  });

  // Stop media listener
  if (mediaUnsubscribers[serviceId]) {
    mediaUnsubscribers[serviceId]();
    delete mediaUnsubscribers[serviceId];
  }

  // Hide upload section
  selectedServiceId = null;
  uploadBtn.disabled = true;
  document.getElementById("uploadSection").style.display = "none";
  uploadStatus.innerText = "";
}
});



  //complete service list

 function listenToCompletedServices() {

  //  Stop previous listener if exists
  if (completedUnsubscribe) {
    completedUnsubscribe();
  }
  const q = query(
    collection(db, "services"),
    where("serviceStatus", "==", "completed"),
    where("assignedServiceCenterId", "==", currentUser.uid)
  );

  onSnapshot(q, async (snap) => {
    completedServiceList.innerHTML = "";

    if (snap.empty) {
      completedServiceList.innerHTML = "<li>No completed services</li>";
      return;
    }

    for (const d of snap.docs) {
      const data = d.data();

      const carSnap = await getDoc(doc(db, "cars", data.carId));
      const carText = carSnap.exists()
        ? `${carSnap.data().carNumber} - ${carSnap.data().brand} (${carSnap.data().model})`
        : data.carId;

      const startedTime = data.startedAt
        ? new Date(data.startedAt.seconds * 1000).toLocaleString("en-GB", { hour12: true })
        : "-";

      const completedTime = data.completedAt
        ? new Date(data.completedAt.seconds * 1000).toLocaleString("en-GB", { hour12: true })
        : "-";

      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${carText}</strong><br>
        Started: ${startedTime}<br>
        Completed: ${completedTime}
      `;

      completedServiceList.appendChild(li);
    }
  });
}




//logout

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

//upload & upload button logic

uploadBtn.addEventListener("click", async () => {
  if (!selectedServiceId) {
    alert("Select a service first");
    return;
  }

  // 🔐 STATUS CHECK (THIS IS WHERE IT GOES)
  const serviceSnap = await getDoc(doc(db, "services", selectedServiceId));
  const serviceData = serviceSnap.data();

  if (serviceData.serviceStatus !== "assigned") {
    alert("Upload allowed only after assigning the service");
    return;
  }

  const file = mediaInput.files[0];
  if (!file) {
    alert("Please select a file");
    return;
  }
  
  uploadStatus.innerText = "Uploading...";

  //upload status add add doc logic 
 
  const fileRef = ref(
  storage,
  `services/${selectedServiceId}/media/${Date.now()}_${file.name}`
);

const uploadTask = uploadBytesResumable(fileRef, file, {
  customMetadata: {
    assignedServiceCenterId: currentUser.uid
  }
});

uploadTask.on(
  "state_changed",

  null, // progress not needed now

  (error) => {
    console.error(error);
    uploadStatus.innerText = "Upload failed ❌";
  },

  async () => {

     uploadStatus.innerText = "Processing...";

    // ✅ Upload COMPLETED successfully
    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

    // Save media info to Firestore
    await addDoc(
      collection(db, "services", selectedServiceId, "media"),
      {
        url: downloadURL,
        uploadedBy: currentUser.uid,
        fileName: file.name,
        createdAt: serverTimestamp()
      }
    );

    uploadStatus.innerText = "Upload successful ✅";
    mediaInput.value = "";


    
  }
);

});