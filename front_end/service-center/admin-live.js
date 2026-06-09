import { auth, db } from "../firebase.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const DEMO_ROOM_URL = "https://autocare247.daily.co/bay-1"; 
const currentServiceId = new URLSearchParams(window.location.search).get("serviceId");
let adminCallFrame = null;
let serviceListener = null;

if (!currentServiceId) window.location.href = "manage-services.html";

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "../index.html"; return; }
    startLiveViewer();
});

document.getElementById("closeLiveBtn").addEventListener("click", leaveRoomAndGoBack);

function startLiveViewer() {
    const videoContainer = document.getElementById("adminVideoContainer");

    adminCallFrame = window.DailyIframe.createFrame(videoContainer, {
        iframeStyle: { width: '100%', height: '100%', border: '0' },
        showLeaveButton: false,
        showFullscreenButton: true
    });

    adminCallFrame.join({ 
        url: DEMO_ROOM_URL,
        cameraClearValue: false, 
        micClearValue: false     
    });

    const serviceRef = doc(db, "services", currentServiceId);
    serviceListener = onSnapshot(serviceRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        
        if (data.carSnapshot) {
            document.getElementById("vehicleName").textContent = `- ${data.carSnapshot.brand || ''} ${data.carSnapshot.carNumber || ''}`;
        }

       // Eject admin if master switch is off OR camera is paused
        if (data.liveEnabled === false || data.cameraActive === false) {
            alert("The mechanic has paused the camera broadcast.");
            leaveRoomAndGoBack();
        }
    });
}

async function leaveRoomAndGoBack() {
    if (adminCallFrame) {
        await adminCallFrame.leave();
        adminCallFrame.destroy();
    }
    if (serviceListener) serviceListener();
    window.location.href = `monitor.html?serviceId=${currentServiceId}`;
}