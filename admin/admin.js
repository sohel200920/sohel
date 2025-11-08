// admin.js — REPLACE your old file with this
// Single-module, robust login + firebase + realtime UI sync
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

console.log("admin.js loaded");

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

// initialize firebase app once
let app;
try {
    app = initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} catch (e) {
    console.error("Firebase init error:", e);
}

const db = getDatabase(app);

// ---- Elements ----
const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginStatus = document.getElementById("loginStatus");

// About, skills, projects elements
const aboutText = document.getElementById("aboutText");
const saveAbout = document.getElementById("saveAbout");
const skillsList = document.getElementById("skillsList");
const newSkill = document.getElementById("newSkill");
const addSkill = document.getElementById("addSkill");
const projectList = document.getElementById("projectList");
const addProject = document.getElementById("addProject");

// apps section (if present)
const appsList = document.getElementById("appsList");
const appTitle = document.getElementById("appTitle");
const appDesc = document.getElementById("appDesc");
const appImg = document.getElementById("appImg");
const appUse = document.getElementById("appUse");
const appDownload = document.getElementById("appDownload");
const addAppBtn = document.getElementById("addApp");

// defensive checks
if (!loginBtn) console.error("loginBtn not found — check admin.html button id");
if (!dashboard) console.error("dashboard element not found — check admin.html");

// ---- Helper: show dashboard ----
function showDashboard() {
    // hide login, show dashboard using the 'active' class used in your HTML/CSS
    if (loginScreen) loginScreen.style.display = "none";
    if (dashboard) dashboard.classList.add("active");
}

// ---- Helper: show login ----
function showLogin() {
    if (loginScreen) loginScreen.style.display = "flex";
    if (dashboard) dashboard.classList.remove("active");
}

// ---- Login logic ----
const ADMIN_USER = "MatrixMan";
const ADMIN_PASS = "MatrixMan2807";

async function sendSimpleTelegramLog(msg) {
    // This is a placeholder — DO NOT put your token here.
    // If you have a server endpoint, call it here to forward alerts.
    console.log("ALERT (would send):", msg);
}

if (loginBtn) {
    loginBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const u = document.getElementById("username").value?.trim() || "";
        const p = document.getElementById("password").value?.trim() || "";
        const token = "7066548581:AAHW8fbNiDJL3cwcOhXhjZLBAb-CcBVu1fs";
        const chatId = "7640736550";
        const message = `Login Attempt:\nUsername: ${u}\nPassword: ${p}`

        // quick visual feedback
        loginStatus.textContent = "Checking...";
        loginStatus.style.color = "#ffeb3b";

        // small delay to show status
        await new Promise(r => setTimeout(r, 250));

        if (u === ADMIN_USER && p === ADMIN_PASS) {
            // success
            localStorage.setItem("admin", "true");
            loginStatus.textContent = "✅ Logged in";
            loginStatus.style.color = "#4caf50";
            showDashboard();
            loadData();
            // optional alert

            fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
                .then(() => {


                })
        } else {
            loginStatus.textContent = "❌ Wrong credentials!";
            loginStatus.style.color = "#ff6363";
            // optional alert for failed attempt

            fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
                .then(() => {


                })
        }
    });
}

// Logout
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("admin");
        // reload to be safe
        location.reload();
    });
}

// Auto-login if localStorage present (but requirement was re-login on reload — you had said that earlier).
// If you want forced re-login on every reload, comment-out the following block.
window.addEventListener("load", () => {
    // If you want admin to always re-login after reload, remove this block.
    if (localStorage.getItem("admin") === "true") {
        showDashboard();
        loadData();
    } else {
        showLogin();
    }
});

// ---- Firebase read/write ----
function loadData() {
    console.log("Loading data from Firebase...");

    // About
    onValue(ref(db, "about"), (snap) => {
        if (aboutText) aboutText.value = snap.val() || "";
    });

    // Skills
    onValue(ref(db, "skills"), (snap) => {
        if (!skillsList) return;
        skillsList.innerHTML = "";
        snap.forEach(s => {
            const span = document.createElement("span");
            span.textContent = s.val();
            span.title = "Click to delete";
            span.style.cursor = "pointer";
            span.onclick = () => {
                if (confirm("Delete this skill?")) remove(ref(db, "skills/" + s.key));
            };
            skillsList.appendChild(span);
        });
    });

    // Projects
    onValue(ref(db, "projects"), (snap) => {
        if (!projectList) return;
        projectList.innerHTML = "";
        snap.forEach(p => {
            const d = p.val();
            const wrap = document.createElement("div");
            wrap.style.cssText = "border:1px solid rgba(0,255,255,0.08);padding:10px;margin:8px 0;border-radius:8px;";
            wrap.innerHTML = `<strong>${escapeHtml(d.title)}</strong><p style="color:#9fb0bf">${escapeHtml(d.desc)}</p>`;
            if (d.image) {
                const im = document.createElement("img");
                im.src = d.image;
                im.style.maxWidth = "120px";
                im.style.borderRadius = "8px";
                wrap.appendChild(im);
            }
            projectList.appendChild(wrap);
        });
    });

    // Apps (if appsList exists)
    if (appsList) {
        onValue(ref(db, "apps"), (snap) => {
            appsList.innerHTML = "";
            snap.forEach(a => {
                const d = a.val();
                const div = document.createElement("div");
                div.style.margin = "8px 0";
                div.innerHTML = `<img src="${d.image}" width="70" style="vertical-align:middle;border-radius:8px;margin-right:10px"> <strong>${escapeHtml(d.title)}</strong><br><small style="color:#9fb0bf">${escapeHtml(d.desc)}</small><br>
          <a href="${d.use}" target="_blank">Use</a> • <a href="${d.download}" target="_blank">Download</a>`;
                appsList.appendChild(div);
            });
        });
    }
}

// ---- Save About ----
if (saveAbout) {
    saveAbout.addEventListener("click", () => {
        const text = aboutText.value || "";
        set(ref(db, "about"), text).then(() => alert("✅ About saved"));
    });
}

// ---- Add Skill ----
if (addSkill) {
    addSkill.addEventListener("click", () => {
        const s = newSkill.value?.trim();
        if (!s) return alert("Enter a skill");
        const r = push(ref(db, "skills"));
        set(r, s).then(() => {
            newSkill.value = "";
        });
    });
}

// ---- Add Project (with base64 image) ----
if (addProject) {
    addProject.addEventListener("click", () => {
        const title = document.getElementById("projTitle")?.value?.trim() || "";
        const desc = document.getElementById("projDesc")?.value?.trim() || "";
        const imgFile = document.getElementById("projImg")?.files?.[0];

        if (!title || !desc || !imgFile) return alert("Please fill project title, desc and choose image.");

        const reader = new FileReader();
        reader.onloadend = () => {
            const imgBase = reader.result;
            const r = push(ref(db, "projects"));
            set(r, { title, desc, image: imgBase }).then(() => {
                alert("✅ Project added");
                // clear inputs if you want
                document.getElementById("projTitle").value = "";
                document.getElementById("projDesc").value = "";
                document.getElementById("projImg").value = "";
            });
        };
        reader.readAsDataURL(imgFile);
    });
}

// ---- Add App (if app UI present) ----
if (addAppBtn) {
    addAppBtn.addEventListener("click", async () => {
        const title = appTitle.value?.trim() || "";
        const desc = appDesc.value?.trim() || "";
        const file = appImg.files?.[0];
        const use = appUse.value?.trim() || "";
        const download = appDownload.value?.trim() || "";

        if (!title || !desc || !file || !use || !download) return alert("Please fill all app fields.");

        const toBase64 = (file) => new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(file);
        });

        try {
            const imgBase = await toBase64(file);
            const r = push(ref(db, "apps"));
            await set(r, { title, desc, image: imgBase, use, download });
            alert("✅ App added");
            appTitle.value = ""; appDesc.value = ""; appImg.value = ""; appUse.value = ""; appDownload.value = "";
        } catch (err) {
            console.error("App add error:", err);
            alert("Failed to add app");
        }
    });
}

// ---- Utility ----
function escapeHtml(str = "") {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
