/********* app.js (shared) *********/

// ------------- FIREBASE CONFIG (v8) -------------
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCOkxULM4Xh3FYP-v1GtENMmwcq9tVaEAI",
  authDomain: "sohel-admin.firebaseapp.com",
  databaseURL: "https://sohel-admin-default-rtdb.firebaseio.com/",
  projectId: "sohel-admin",
  storageBucket: "sohel-admin.firebasestorage.app",
  messagingSenderId: "393670392149",
  appId: "1:393670392149:web:6ae6b830e4f4a0679997dc",
  measurementId: "G-PMB0Y33BLZ"
};

// Initialize Firebase once
if (typeof firebase === "undefined") {
  console.error("Firebase SDK not loaded. Make sure you include firebase-app.js and firebase-database.js before app.js");
} else {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  window.db = firebase.database(); // make db global
  // gracefully attach storage if available
  if (firebase.storage) {
    window.storage = firebase.storage();
  }
}

// ------------- ADMIN CREDENTIALS (example) -------------
const ADMIN_USERNAME = "MatrixMan";
const ADMIN_PASSWORD = "MatrixMan2807";

// ------------- Helper utilities -------------
function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function escapeAttr(str) {
  if (!str) return "";
  return String(str).replace(/"/g, '&quot;');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------- Student Login (index.html / register) ----------
   Use this function from your login/register page.
   It sets localStorage "studentID" (consistent across app).
*/
function studentLogin() {
  const idEl = document.getElementById("studentID");
  const nameEl = document.getElementById("studentName");
  const classEl = document.getElementById("studentClass");

  const id = idEl ? (idEl.value || "").trim() : "";
  const name = nameEl ? (nameEl.value || "").trim() : "";
  const className = classEl ? (classEl.value || "").trim() : "";

  if (!id || !name || !className) {
    alert("Please fill all fields");
    return;
  }

  window.db.ref("students/" + id).set({
    id: id,
    name: name,
    class: className,
    school: "",
    mobile: ""
  }).then(() => {
    localStorage.setItem("studentID", id);
    window.location.href = "home.html";
  }).catch(err => {
    alert("Error: " + err.message);
  });
}

/* ---------- Student Dashboard loader (home.html) ----------
   Call loadStudentDashboard(studentId) to render student info UI.
*/
function loadStudentDashboard(studentId) {
  const infoEl = document.getElementById("studentInfo");
  if (!infoEl) return;
  infoEl.innerHTML = "Loading...";

  window.db.ref("students/" + studentId).once("value")
    .then(snap => {
      if (!snap.exists()) {
        infoEl.innerHTML = "<p>Student data not found.</p>";
        return;
      }
      const d = snap.val();
      infoEl.innerHTML = `
        <div class="info-card">
          <p><strong>Name:</strong> ${escapeHTML(d.name || "")}</p>
          <p><strong>ID:</strong> ${escapeHTML(d.id || "")}</p>
          <p><strong>Class:</strong> ${escapeHTML(d.class || "")}</p>
          <p><strong>School:</strong> ${escapeHTML(d.school || "—")}</p>
          <p><strong>Mobile:</strong> ${escapeHTML(d.mobile || "—")}</p>
        </div>
      `;
    })
    .catch(err => {
      infoEl.innerHTML = "<p>Error loading data.</p>";
      console.error(err);
    });
}

/* ---------- Admin helpers used by admin_dashboard.html ----------
   These are generic helpers — admin page will call these directly.
*/

// Save admin message to student: path students/{id}/message
async function adminSaveMessageForStudent(studentId, { title = "", text = "", buttonText = "", buttonLink = "", imageBase64 = "" }) {
  const payload = {
    title: title || "",
    text: text || "",
    buttonText: buttonText || "",
    buttonLink: buttonLink || "",
    image: imageBase64 || "",
    status: "pending",
    createdAt: Date.now()
  };
  await window.db.ref(`students/${studentId}/message`).set(payload);
  return payload;
}

// Clear message
function adminClearMessageForStudent(studentId) {
  return window.db.ref(`students/${studentId}/message`).remove();
}

// Move student record (used by admin)
async function moveStudentRecord(oldId, newId, updates = {}) {
  const oldSnap = await window.db.ref('students/' + oldId).once('value');
  const oldData = oldSnap.val() || {};
  const payload = Object.assign({}, oldData, updates);
  payload.id = newId;
  await window.db.ref('students/' + newId).set(payload);
  await window.db.ref('students/' + oldId).remove();
  return payload;
}

/* ---------- Storage & Student submit helpers (NEW) ----------
   uploadFileToStorage: uploads file to firebase storage and returns {url, path}
   studentSubmitResponse: records student's response and marks message done
*/

async function uploadFileToStorage(studentId, createdAt, fieldId, file) {
  if (!window.storage) {
    throw new Error("Firebase Storage not initialized. Include firebase-storage.js before app.js.");
  }
  const path = `responses/${studentId}/${createdAt}/${fieldId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
  const ref = window.storage.ref(path);
  const snap = await ref.put(file);
  const url = await snap.ref.getDownloadURL();
  return { url, path };
}

/**
 * studentSubmitResponse(studentId, messageCreatedAt, collectedData)
 * - collectedData is an object where keys are field ids and values are either primitive or {type:'file', url, path, name}
 */
async function studentSubmitResponse(studentId, messageCreatedAt, collectedData) {
  // store under responses/{studentId}/{messageCreatedAt}
  const basePath = `responses/${studentId}/${messageCreatedAt}`;
  await window.db.ref(basePath).set({
    data: collectedData,
    submittedAt: Date.now()
  });

  // mark message as done
  await window.db.ref(`students/${studentId}/message/status`).set('done');
  // optional: remove hasPendingMessage flag
  await window.db.ref(`students/${studentId}`).update({ hasPendingMessage: false });

  return { ok: true };
}
