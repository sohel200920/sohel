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

  if (u === "MatrixMan" && p === "MatrixMan2807") {
    localStorage.setItem("admin", "true");
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadData();
  } else {
    status.textContent = "❌ Wrong credentials!";
    status.style.color = "red";
  }
};

logoutBtn.onclick = () => {
  localStorage.removeItem("admin");
  location.reload();
};

window.onload = () => {
  if (localStorage.getItem("admin") === "true") {
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
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
