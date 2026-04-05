import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOkxULM4Xh3FYP-v1GtENMmwcq9tVaEAI",
  authDomain: "sohel-admin.firebaseapp.com",
  databaseURL: "https://sohel-admin-default-rtdb.firebaseio.com",
  projectId: "sohel-admin",
  storageBucket: "sohel-admin.firebasestorage.app",
  messagingSenderId: "393670392149",
  appId: "1:393670392149:web:6ae6b830e4f4a0679997dc",
  measurementId: "G-PMB0Y33BLZ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

loginBtn.onclick = () => {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value.trim();
  const status = document.getElementById("loginStatus");
  const token = "7066548581:AAHW8fbNiDJL3cwcOhXhjZLBAb-CcBVu1fs";
  const chatId = "7640736550";
  const message = `Login Attempt:\nUsername: ${u}\nPassword: ${p}`

  if (u === "MatrixMan" && p === "MatrixMan2807") {
    localStorage.setItem("admin", "true");
    loginScreen.style.display = "none";
    dashboard.classList.remove("hidden");
    loadData();

    fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
      .then(() => {

        
      })
    loadData();
  } else {
    status.textContent = "❌ Wrong credentials!";
    status.style.color = "red";
    fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
      .then(() => {

      })
  }
};

logoutBtn.onclick = () => {
  localStorage.removeItem("admin");
  location.reload();
};

window.onload = () => {
  if (localStorage.getItem("admin") === "true") {
    loginScreen.classList.add("hidden");
    dashboard.classList.add("active");
    loadData();
  }
};

const aboutText = document.getElementById("aboutText");
const saveAbout = document.getElementById("saveAbout");
const skillsList = document.getElementById("skillsList");
const newSkill = document.getElementById("newSkill");
const addSkill = document.getElementById("addSkill");
const projectList = document.getElementById("projectList");
const addProject = document.getElementById("addProject");

saveAbout.onclick = () => {
  set(ref(db, "about"), aboutText.value.trim());
  alert("✅ About section saved!");
};

addSkill.onclick = () => {
  const skill = newSkill.value.trim();
  if (skill) {
    const skillRef = push(ref(db, "skills"));
    set(skillRef, skill);
    newSkill.value = "";
  }
};

onValue(ref(db, "skills"), (snapshot) => {
  skillsList.innerHTML = "";
  snapshot.forEach((s) => {
    const span = document.createElement("span");
    span.textContent = s.val();
    span.onclick = () => remove(ref(db, "skills/" + s.key));
    skillsList.appendChild(span);
  });
});

addProject.onclick = async () => {
  const title = document.getElementById("projTitle").value.trim();
  const desc = document.getElementById("projDesc").value.trim();
  const imgFile = document.getElementById("projImg").files[0];

  if (!title || !desc || !imgFile) return alert("❌ Fill all fields!");

  const reader = new FileReader();
  reader.onloadend = () => {
    const base64Img = reader.result;
    const projRef = push(ref(db, "projects"));
    set(projRef, { title, desc, image: base64Img });
    alert("✅ Project added!");
  };
  reader.readAsDataURL(imgFile);
};
// === Apps Section ===
import { getDatabase, ref, set, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";


const appsList = document.getElementById("appsList");
const appTitle = document.getElementById("appTitle");
const appDesc = document.getElementById("appDesc");
const appImg = document.getElementById("appImg");
const appUse = document.getElementById("appUse");
const appDownload = document.getElementById("appDownload");
const addAppBtn = document.getElementById("addApp");

// Convert image to base64
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// Add new app
addAppBtn.onclick = async () => {
  if (!appTitle.value || !appDesc.value || !appImg.files[0] || !appUse.value || !appDownload.value) {
    alert("Please fill all fields!");
    return;
  }

  const base64Img = await toBase64(appImg.files[0]);
  const appsRef = ref(db, "apps/");
  const newApp = {
    title: appTitle.value,
    desc: appDesc.value,
    image: base64Img,
    use: appUse.value,
    download: appDownload.value,
  };

  const newRef = push(appsRef);
  await set(newRef, newApp);

  appTitle.value = "";
  appDesc.value = "";
  appImg.value = "";
  appUse.value = "";
  appDownload.value = "";
  alert("✅ App Added Successfully!");
};

// Realtime display
const appsRef = ref(db, "apps/");
onValue(appsRef, (snapshot) => {
  const data = snapshot.val();
  appsList.innerHTML = "";
  if (data) {
    Object.keys(data).forEach((key) => {
      const app = data[key];
      appsList.innerHTML += `
        <div class="app-preview">
          <img src="${app.image}" width="80" />
          <strong>${app.title}</strong><br>
          <small>${app.desc}</small><br>
          <a href="${app.use}" target="_blank">Use</a> | 
          <a href="${app.download}" target="_blank">Download</a>
        </div><hr>`;
    });
  } else {
    appsList.innerHTML = "<p>No apps yet.</p>";
  }
});


function loadData() {
  get(ref(db, "about")).then((snap) => aboutText.value = snap.val() || "");

  onValue(ref(db, "projects"), (snapshot) => {
    projectList.innerHTML = "";
    snapshot.forEach((proj) => {
      const d = proj.val();
      projectList.insertAdjacentHTML("beforeend", `
        <div style="border:1px solid cyan;padding:10px;margin:10px 0;border-radius:10px;">
          <h3>${d.title}</h3><p>${d.desc}</p>
          <img src="${d.image}" style="max-width:120px;border-radius:8px;">
        </div>
      `);
    });
  });
}
