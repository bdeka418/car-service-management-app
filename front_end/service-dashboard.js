import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc,
  getDocs,
  addDoc,
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

//storage
import {
  getStorage,
  ref,
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
let clickListenerAttached = false;




// Cache car details to avoid async race in render loop
const carCache = {};

//can only access by the service-center
let currentUser = null;

let activeServicesUnsubscribe = null;
let completedUnsubscribe = null;

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

//car cache loader 
const carDataCache = {};

async function getCarText(carId) {

  if (carDataCache[carId]) return carDataCache[carId];

  const carSnap = await getDoc(doc(db, "cars", carId));

  if (!carSnap.exists()) return carId;

  const carText =
    `${carSnap.data().carNumber} - ${carSnap.data().brand} (${carSnap.data().model})`;

  carDataCache[carId] = carText;

  return carText;
}


//=======================================
//fetching the car service details
//=======================================

function listenToActiveServices() {
  if (activeServicesUnsubscribe) {
    activeServicesUnsubscribe();
  }

  const activeMap = new Map();

  const unassignedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "in_progress"),
    where("assignedServiceCenterId", "==", null)
  );

  const assignedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "assigned"),
    where("assignedServiceCenterId", "==", currentUser.uid)
  );

  function updateMap(change) {

  const docId = change.doc.id;

  if (change.type === "removed") {

    activeMap.delete(docId);

  } else {

    activeMap.set(docId, change.doc);

  }

}

// function renderAll() {

//   serviceList.innerHTML = "";

//   if (activeMap.size === 0) {
//     serviceList.innerHTML = "<li>No active services available</li>";
//     return;
//   }

//   for (const docSnap of activeMap.values()) {
//      renderServiceDoc(docSnap);
//   }
// }

 const handleSnap = async () => {

  serviceList.innerHTML = "";

  const docs = [];

  const unassignedSnap = await getDocs(unassignedQuery);
  const assignedSnap = await getDocs(assignedQuery);

  docs.push(...unassignedSnap.docs);
  docs.push(...assignedSnap.docs);

  if (docs.length === 0) {
    serviceList.innerHTML = "<li>No active services available</li>";
    return;
  }

  for (const d of docs) {
    await renderServiceDoc(d);
  }

};

  const unsub1 = onSnapshot(unassignedQuery, () => handleSnap());
const unsub2 = onSnapshot(assignedQuery, () => handleSnap());

  activeServicesUnsubscribe = () => {
    unsub1();
    unsub2();
  };
}


 async function renderServiceDoc(d) {
  const data = d.data();
  const serviceId = d.id;


  // -------------------------------
  // Car text (with cache)
  // -------------------------------
  const carText = await getCarText(data.carId);

  // -------------------------------
  // ui
  // -------------------------------
  let buttonHTML = "";

// SERVICE NOT ASSIGNED
if (!data.assignedServiceCenterId) {

  buttonHTML = `
    <button data-id="${serviceId}" data-action="assign">
      Assign Me
    </button>
  `;

}

// SERVICE ASSIGNED TO THIS CENTER
else if (
  data.assignedServiceCenterId === currentUser.uid &&
  data.serviceStatus === "assigned"
) {

  buttonHTML = `
  ${!data.hasMedia ? `
    <button data-id="${serviceId}" data-action="cancel">
      Cancel Assignment
    </button>

    <input 
      type="file" 
      class="media-input" 
      data-id="${serviceId}"
    >

    <button data-id="${serviceId}" data-action="upload">
      Upload Media
    </button>
 ` : ""}
    <button
      data-id="${serviceId}"
      data-action="complete"
      ${!data.hasMedia ? "disabled" : ""}
    >
      Complete Service
    </button>

   
  `;
}
  // -------------------------------
  // Render list item
  // -------------------------------
  const li = document.createElement("li");
li.id = `service-${serviceId}`;

li.innerHTML = `
  <div class="service-tile">

    <div class="service-header">
      <strong>${carText}</strong>
    </div>

    <div class="service-notes">
      📝 Notes: ${data.notes || "—"}
    </div>

    <div id="media-${serviceId}" class="service-media"></div>
     <div class="upload-progress" id="progress-${serviceId}"></div>
    <div class="service-actions">
      ${buttonHTML}
    </div>

  </div>
`;

  const existing = document.getElementById(`service-${serviceId}`);
if (existing) {
  existing.replaceWith(li);
} else {
  serviceList.appendChild(li);
}
if (
  data.assignedServiceCenterId === currentUser.uid &&
  data.serviceStatus === "assigned" &&
  data.hasMedia
) {
  await loadServiceMedia(serviceId);
}
}
  
async function loadServiceMedia(serviceId) {

 const mediaContainer = document.getElementById(`media-${serviceId}`);
if (!mediaContainer) return;

/* prevent repeated reads */
if (mediaContainer.dataset.loaded === "true") return;
mediaContainer.dataset.loaded = "true";

  try{
  const mediaSnap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  mediaContainer.innerHTML = "";

  mediaSnap.forEach((doc) => {

    const data = doc.data();

    const img = document.createElement("img");
    img.src = data.url;
    img.style.width = "120px";

    mediaContainer.appendChild(img);

  });
}catch (err) {
 // silent fail (rules blocked media read)
}
}

//logic for the completdAt and the ASSIGN to me buttons

if (!clickListenerAttached) {
  clickListenerAttached = true;

  serviceList.addEventListener("click", async (e) => {
  
    const button = e.target.closest("button");

    if (!button) return;

    const serviceId = button.dataset.id;
    const action = button.dataset.action;

    if (!serviceId || !action) return;   
    const serviceTile = document.getElementById(`service-${serviceId}`);
    console.log("ACTION:", action, "SERVICE:", serviceId);
    if (action === "upload") {

  const fileInput = serviceTile.querySelector(".media-input");
  const progressEl = serviceTile.querySelector(".upload-progress");

  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a file first");
    return;
  }
progressEl.innerText = "Starting upload...";
  console.log("Starting upload...");

  const serviceSnap = await getDoc(doc(db, "services", serviceId));
const serviceData = serviceSnap.data();
  const fileRef = ref(
    storage,
    `services/${serviceId}/media/${Date.now()}_${file.name}`
  );

 const uploadTask = uploadBytesResumable(fileRef, file, {
  customMetadata: {
    assignedServiceCenterId: currentUser.uid,
    ownerId: serviceData.ownerId
  }
});

  uploadTask.on(
    "state_changed",

    (snapshot) => {
      const progress =
        (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      console.log("Upload progress:", progress);

       progressEl.innerText = "Uploading: " + Math.round(progress) + "%";
    },

    (error) => {
       progressEl.innerText = "Upload failed";
      console.error("Upload failed:", error);
    },
    

    async () => {

      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
       progressEl.innerText = "Upload complete";

await addDoc(
  collection(db, "services", serviceId, "media"),
  {
    url: downloadURL,
    uploadedBy: currentUser.uid,
    fileName: file.name,
    createdAt: serverTimestamp()
  }
);

await updateDoc(doc(db, "services", serviceId), {
  hasMedia: true,
  mediaUploadedAt: serverTimestamp()
});
    }
  );
  
  return;
}
    console.log("CLICK HANDLER EXECUTED");

    if (action === "assign") {
      console.log("ASSIGN CLICKED BY:", currentUser.uid);

      await updateDoc(doc(db, "services", serviceId), {
        serviceStatus: "assigned",
        assignedServiceCenterId: currentUser.uid,
        assignedAt: serverTimestamp(),
        hasMedia: false
      });
      return;
    }

    if (action === "complete") {
      await updateDoc(doc(db, "services", serviceId), {
        serviceStatus: "completed",
        completedAt: serverTimestamp()
      });
    
      return;
    }

    if (action === "cancel") {
      await updateDoc(doc(db, "services", serviceId), {
        serviceStatus: "in_progress",
        assignedServiceCenterId: null,
        assignedAt: null,
        hasMedia: false
      });
      
      return;
    }
  });
}
    

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

  completedUnsubscribe = onSnapshot(q, async (snap) => {
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
