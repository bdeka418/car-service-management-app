import { db, auth, storage }
from "../firebase.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
   onAuthStateChanged,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
 
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";

import {
  getFunctions,
  httpsCallable
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";

/* =========================
   DOM
========================= */

const profileName =
document.getElementById(
  "profileName"
);

const profileEmail =
document.getElementById(
  "profileEmail"
);

const profilePhone =
document.getElementById(
  "profilePhone"
);

const infoName =
document.getElementById(
  "infoName"
);

const infoEmail =
document.getElementById(
  "infoEmail"
);

const infoPhone =
document.getElementById(
  "infoPhone"
);

const profileImage =
document.getElementById(
  "profileImage"
);

const drawerUserName =
document.getElementById(
  "drawerUserName"
);

const drawerUserAvatar =
document.getElementById(
  "drawerUserAvatar"
);

const infoDob =
document.getElementById(
  "infoDob"
);

const infoAddress =
document.getElementById(
  "infoAddress"
);

const infoLanguage =
document.getElementById(
  "infoLanguage"
);

const infoTheme =
document.getElementById(
  "infoTheme"
);

const memberSince =
document.getElementById(
  "memberSince"
);

const verifiedBadge =
document.getElementById(
  "verifiedBadge"
);

let currentUser = null;

let currentUserData = null;

let selectedProfileImage = null;

const functions =
getFunctions(
  undefined,
  "asia-south1"
);

/* =========================
   TOAST
========================= */

const toastContainer =
document.getElementById(
  "toastContainer"
);

function showToast(
  message,
  type = "success"
){

  const toast =
  document.createElement("div");

  toast.className =
  `toast toast-${type}`;

  toast.innerText =
  message;

  toastContainer.appendChild(
    toast
  );

  setTimeout(()=>{

    toast.style.opacity = "0";

    toast.style.transform =
    "translateX(40px)";

    setTimeout(()=>{

      toast.remove();

    },300);

  },3000);

}

/* =========================
   AUTH
========================= */

onAuthStateChanged(
  auth,
  async(user)=>{

    if(!user){

      window.location.href =
      "../index.html";

      return;
    }

    const userRef = doc(
      db,
      "users",
      user.uid
    );

    const userSnap =
    await getDoc(userRef);

    const userData =
    userSnap.data();

    currentUser = user;

    currentUserData = userData;

    drawerUserName.innerText =
userData.name || "Customer";

/* AVATAR LETTERS */

const initials =
(userData.name || "U")
.split(" ")
.map(word => word[0])
.join("")
.substring(0,2);

drawerUserAvatar.innerText =
initials;


    profileName.innerText =
    userData.name || "Customer";

    infoName.innerText =
    userData.name || "Customer";

    profileEmail.innerText =
    userData.email || "N/A";

    infoEmail.innerText =
    userData.email || "N/A";

    profilePhone.innerText =
    userData.phone || "N/A";

    infoPhone.innerText =
    userData.phone || "N/A";

    // Use profile image if available, otherwise use default avatar
    profileImage.src =
userData.profileImage ||
"./default-avatar.png";

infoDob.innerText =
userData.dob || "N/A";

infoAddress.innerText =
[
  userData.address,
  userData.city,
  userData.state,
  userData.country,
  userData.pincode
]
.filter(Boolean)
.join(", ") || "N/A";

infoLanguage.innerText =
userData.language || "English";

infoTheme.innerText =
userData.theme || "System";

//email verification

const verifyEmailBtn =
document.getElementById(
  "verifyEmailBtn"
);

verifiedBadge.style.display =
user.emailVerified
? "inline-flex"
: "none";

if(user.emailVerified){

  const verificationSent =
  localStorage.getItem(
    "verificationSuccessSent"
  );

  if(!verificationSent){

    try{

      const sendVerifiedMail =
      httpsCallable(
        functions,
        "sendEmailVerifiedSuccessEmail"
      );

      await sendVerifiedMail();

      localStorage.setItem(
        "verificationSuccessSent",
        "true"
      );

    }catch(error){

      console.log(error);

    }

  }

}

document.getElementById(
  "emailVerificationStatus"
).innerText =
user.emailVerified
? "Verified"
: "Not Verified";

/* HIDE VERIFY BUTTON IF VERIFIED */

verifyEmailBtn.style.display =
user.emailVerified
? "none"
: "inline-flex";


//member since

if(userData.createdAt){

  const joinDate =
  userData.createdAt.toDate();

  memberSince.innerText =
  `Member since ${
    joinDate.toLocaleString(
      "default",
      { month:"long" }
    )
  } ${joinDate.getFullYear()}`;

  const lastLogin =
new Date(
  user.metadata.lastSignInTime
);

const day =
String(
  lastLogin.getDate()
).padStart(2,"0");

const month =
String(
  lastLogin.getMonth() + 1
).padStart(2,"0");

const year =
lastLogin.getFullYear();

const formattedTime =
lastLogin.toLocaleTimeString(
  [],
  {
    hour:"2-digit",
    minute:"2-digit"
  }
);

document.getElementById(
  "lastLoginText"
).innerText =
`${day}-${month}-${year} ${formattedTime}`;

}





    /* VEHICLES */

    const carsQuery = query(
      collection(db,"cars"),
      where(
        "ownerId",
        "==",
        user.uid
      ),
     
    );

    const carsSnap =
    await getDocs(carsQuery);

    let activeVehicleCount = 0;

carsSnap.forEach((carDoc)=>{

  const car =
  carDoc.data();

  if(car.deleted !== true){

    activeVehicleCount++;

  }

});

document.getElementById(
  "vehicleCount"
).innerText =
activeVehicleCount;

   /* =========================
   SERVICES + APPOINTMENTS
========================= */

const servicesQuery =
query(
  collection(db,"services"),
  where(
    "ownerId",
    "==",
    user.uid
  )
);

const servicesSnap =
await getDocs(
  servicesQuery
);

/* =========================
   COUNTERS
========================= */

let totalAppointments = 0;

let acceptedServices = 0;

let totalSpent = 0;

let cancelledServices = 0;

/* =========================
   LOOP
========================= */

servicesSnap.forEach((serviceDoc)=>{

  const service =
  serviceDoc.data();

  /* ALL CREATED SERVICES */

  totalAppointments++;

  /* ACCEPTED BY SERVICE CENTER */

  if(

    service.serviceStatus === "assigned" ||

    service.serviceStatus === "job_assigned" ||

    service.serviceStatus === "in_service" ||

    service.serviceStatus === "pending_approval" ||

    service.serviceStatus === "work_done" ||

    service.serviceStatus === "completed"

  ){

    acceptedServices++;

  }

  /* TOTAL SPENT */

  if(
  service.serviceStatus ===
  "completed"
){

  totalSpent += Number(
    service.totalAmount || 0
  );

}

if(
  service.serviceStatus ===
  "cancelled"
){

  cancelledServices++;

}

});

/* =========================
   UPDATE UI
========================= */

document.getElementById(
  "serviceCount"
).innerText =
acceptedServices;

document.getElementById(
  "appointmentCount"
).innerText =
totalAppointments;

document.getElementById(
  "spentAmount"
).innerText =
`₹${totalSpent}`;

document.getElementById(
  "cancelledCount"
).innerText =
cancelledServices;

  }
);

/* =========================
   EDIT PROFILE MODAL
========================= */

const editProfileModal =
document.getElementById(
  "editProfileModal"
);

const closeProfileModal =
document.getElementById(
  "closeProfileModal"
);

const cancelProfileEdit =
document.getElementById(
  "cancelProfileEdit"
);

const profileEditBtn =
document.querySelector(
  ".profile-edit-btn"
);

const saveProfileBtn =
document.getElementById(
  "saveProfileBtn"
);

const profileImageInput =
document.getElementById(
  "profileImageInput"
);

const chooseProfileImageBtn =
document.getElementById(
  "chooseProfileImageBtn"
);

const profilePreviewImage =
document.getElementById(
  "profilePreviewImage"
);

/* =========================
   DRAWER
========================= */

const menuToggle =
document.getElementById(
  "menuToggle"
);

const mobileDrawer =
document.getElementById(
  "mobileDrawer"
);

const sidebarOverlay =
document.getElementById(
  "sidebarOverlay"
);

const profilePage =
document.getElementById(
  "profilePage"
);

menuToggle.addEventListener(
  "click",
  ()=>{

    mobileDrawer.classList.toggle(
      "open"
    );

    sidebarOverlay.classList.toggle(
      "show"
    );

    profilePage.classList.toggle(
      "drawer-open"
    );

    menuToggle.classList.toggle(
      "drawer-open"
    );

  }
);

sidebarOverlay.addEventListener(
  "click",
  ()=>{

    mobileDrawer.classList.remove(
      "open"
    );

    sidebarOverlay.classList.remove(
      "show"
    );

    profilePage.classList.remove(
      "drawer-open"
    );

    menuToggle.classList.remove(
      "drawer-open"
    );

  }
);

/* =========================
   PROFILE EDIT
========================= */

profileEditBtn.addEventListener(
  "click",
  ()=>{

    document.getElementById(
      "editName"
    ).value =
    currentUserData.name || "";

    document.getElementById(
      "editPhone"
    ).value =
    currentUserData.phone || "";

    document.getElementById(
      "editDob"
    ).value =
    currentUserData.dob || "";

    document.getElementById(
      "editCity"
    ).value =
    currentUserData.city || "";

    document.getElementById(
      "editState"
    ).value =
    currentUserData.state || "";

    document.getElementById(
      "editCountry"
    ).value =
    currentUserData.country || "";

    document.getElementById(
  "editPincode"
).value =
currentUserData.pincode || "";

    document.getElementById(
      "editAddress"
    ).value =
    currentUserData.address || "";

    profilePreviewImage.src =
    currentUserData.profileImage ||
    "./default-avatar.png";

    editProfileModal.classList.add(
      "show"
    );

  }
);

function closeEditModal(){

  editProfileModal.classList.remove(
    "show"
  );

}

closeProfileModal.addEventListener(
  "click",
  closeEditModal
);

cancelProfileEdit.addEventListener(
  "click",
  closeEditModal
);

//image picker

chooseProfileImageBtn.addEventListener(
  "click",
  ()=>{

    profileImageInput.click();

  }
);

profileImageInput.addEventListener(
  "change",
  (e)=>{

    const file =
    e.target.files[0];

    if(!file) return;

    selectedProfileImage =
    file;

    profilePreviewImage.src =
    URL.createObjectURL(file);

  }
);

//save profile
saveProfileBtn.addEventListener(
  "click",
  async()=>{

    try{

      saveProfileBtn.innerText =
      "Saving...";

      saveProfileBtn.disabled = true;
      
      let imageUrl =
      currentUserData.profileImage || "";

      let imagePath =
      currentUserData.profileImagePath || "";

      /* DELETE OLD IMAGE */

      if(
        selectedProfileImage &&
        imagePath
      ){

        try{

          const oldImageRef =
          ref(
            storage,
            imagePath
          );

          await deleteObject(
            oldImageRef
          );

        }catch(err){

          console.log(
            "Old image delete failed"
          );

        }

      }

      /* UPLOAD NEW IMAGE */

      if(selectedProfileImage){

        imagePath =
        `profile_images/${currentUser.uid}`;

        const imageRef =
        ref(
          storage,
          imagePath
        );

        await uploadBytes(
          imageRef,
          selectedProfileImage
        );

        imageUrl =
        await getDownloadURL(
          imageRef
        );

      }

      await updateDoc(

        doc(
          db,
          "users",
          currentUser.uid
        ),

        {

          name:
          document.getElementById(
            "editName"
          ).value,

          phone:
          document.getElementById(
            "editPhone"
          ).value,

          dob:
          document.getElementById(
            "editDob"
          ).value,

          city:
          document.getElementById(
            "editCity"
          ).value,

          state:
          document.getElementById(
            "editState"
          ).value,

          country:
          document.getElementById(
            "editCountry"
          ).value,

          pincode:
          document.getElementById(
          "editPincode"
           ).value,

          address:
          document.getElementById(
            "editAddress"
          ).value,

          profileImage:
          imageUrl,

          profileImagePath:
          imagePath,

          role:
          currentUserData.role || "customer",

          updatedAt:
          serverTimestamp()

        }

      );

      showToast(
  "Profile updated successfully"
);

setTimeout(()=>{

  location.reload();

},1200);

    }catch(error){

      console.error(error);

      showToast(
  "Failed to update profile",
  "error"
);
    }finally{

      saveProfileBtn.innerText =
      "Save Profile";

      saveProfileBtn.disabled = false;
    }

  }
);

/* =========================
   CHANGE PASSWORD
========================= */

const changePasswordBtn =
document.getElementById(
  "changePasswordBtn"
);

const changePasswordModal =
document.getElementById(
  "changePasswordModal"
);

const closePasswordModal =
document.getElementById(
  "closePasswordModal"
);

const cancelPasswordBtn =
document.getElementById(
  "cancelPasswordBtn"
);

const savePasswordBtn =
document.getElementById(
  "savePasswordBtn"
);

/* OPEN */

changePasswordBtn.addEventListener(
  "click",
  ()=>{

    changePasswordModal.classList.add(
      "show"
    );

  }
);

/* CLOSE */

function closePasswordModalFunc(){

  changePasswordModal.classList.remove(
    "show"
  );

}

closePasswordModal.addEventListener(
  "click",
  closePasswordModalFunc
);

cancelPasswordBtn.addEventListener(
  "click",
  closePasswordModalFunc
);

/* UPDATE PASSWORD */

savePasswordBtn.addEventListener(
  "click",
  async()=>{

    try{

      const currentPassword =
      document.getElementById(
        "currentPassword"
      ).value;

      const newPassword =
      document.getElementById(
        "newPassword"
      ).value;

      const confirmPassword =
      document.getElementById(
        "confirmPassword"
      ).value;

      if(
        !currentPassword ||
        !newPassword ||
        !confirmPassword
      ){

        showToast(
          "Fill all fields",
          "warning"
        );

        return;
      }

      if(
        newPassword.length < 6
      ){

        showToast(
          "Password must be at least 6 characters",
          "warning"
        );

        return;
      }

      if(
        newPassword !== confirmPassword
      ){

        showToast(
          "Passwords do not match",
          "error"
        );

        return;
      }

      savePasswordBtn.innerText =
      "Updating...";

      savePasswordBtn.disabled =
      true;

      const credential =
      EmailAuthProvider.credential(
        currentUser.email,
        currentPassword
      );

      await reauthenticateWithCredential(
        currentUser,
        credential
      );

      await updatePassword(
  currentUser,
  newPassword
);

/* SEND SECURITY MAIL */

const sendPasswordAlert =
httpsCallable(
  functions,
  "sendPasswordChangedEmail"
);

await sendPasswordAlert();

showToast(
  "Password updated successfully"
);

      closePasswordModalFunc();

    }catch(error){

      console.error(error);

      if(
        error.code ===
        "auth/invalid-credential"
      ){

        showToast(
          "Current password is incorrect",
          "error"
        );

      }else{

        showToast(
          "Failed to update password",
          "error"
        );

      }

    }finally{

      savePasswordBtn.innerText =
      "Update Password";

      savePasswordBtn.disabled =
      false;
    }

  }
);

/* =========================
   EMAIL VERIFICATION
========================= */

const verifyEmailBtn =
document.getElementById(
  "verifyEmailBtn"
);

verifyEmailBtn.addEventListener(
  "click",
  async()=>{

    try{

      verifyEmailBtn.disabled =
      true;

      verifyEmailBtn.innerText =
      "Sending...";

      localStorage.removeItem(
  "verificationSuccessSent"
);

      const sendVerification =
      httpsCallable(
        functions,
        "sendVerificationEmail"
      );

      await sendVerification();

      showToast(
        "Verification email sent"
      );

    }catch(error){

      console.error(error);

      showToast(
        "Failed to send verification email",
        "error"
      );

    }finally{

      verifyEmailBtn.disabled =
      false;

      verifyEmailBtn.innerText =
      "Verify";

    }

  }
);

/* =========================
   LOGOUT ALL DEVICES
========================= */

const logoutAllBtn =
document.getElementById(
  "logoutAllBtn"
);

logoutAllBtn.addEventListener(
  "click",
  async()=>{

    try{

      logoutAllBtn.disabled =
      true;

      logoutAllBtn.innerText =
      "Logging out...";

      const logoutAll =
      httpsCallable(
        functions,
        "logoutAllDevices"
      );

      await logoutAll();

      showToast(
  "All devices logged out"
);

setTimeout(async()=>{

  await signOut(auth);

  window.location.href =
  "../index.html";

},1200);

    }catch(error){

      console.error(error);

      showToast(
        "Failed to logout all devices",
        "error"
      );

    }finally{

      logoutAllBtn.disabled =
      false;

      logoutAllBtn.innerText =
      "Logout All";

    }

  }
);

/* =========================
   LOGOUT
========================= */

const logoutBtn =
document.getElementById(
  "logoutBtn"
);

logoutBtn.addEventListener(
  "click",
  async()=>{

    await signOut(auth);

    window.location.href =
    "../index.html";

  }
);