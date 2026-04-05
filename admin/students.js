/* ---------- admin.js ----------
   Separated admin logic for Students / Builder / Messages / Announcements / Quizzes
   This script expects `db` (firebase.database()) to be available — keep your app.js (firebase init)
   loaded BEFORE this file.
*/

// Defensive HTML escape helper (do not override if defined by other code)
window.escapeHTML = window.escapeHTML || function (str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

// Basic state
let students = {}; let selectedId = null; let builderSpec = [];

// small UI helpers
function showStudentStatus(msg) {
    const el = document.getElementById('studentMessageStatus');
    if (!el) return;
    el.innerText = msg;
    setTimeout(() => { if (el) el.innerText = ''; }, 4000);
}

// Sidebar toggles
const btnStudents = document.getElementById('btnStudents'),
    btnAnnouncements = document.getElementById('btnAnnouncements'),
    btnQuizzes = document.getElementById('btnQuizzes');

const studentsSection = document.getElementById('studentsSection'),
    announcementsSection = document.getElementById('announcementsSection'),
    quizzesSection = document.getElementById('quizzesSection');

btnStudents.onclick = () => {
    btnStudents.classList.add('active');
    btnAnnouncements.classList.remove('active');
    btnQuizzes.classList.remove('active');
    studentsSection.style.display = 'block';
    announcementsSection.style.display = 'none';
    quizzesSection.style.display = 'none';
};
btnAnnouncements.onclick = () => {
    btnStudents.classList.remove('active');
    btnAnnouncements.classList.add('active');
    btnQuizzes.classList.remove('active');
    studentsSection.style.display = 'none';
    announcementsSection.style.display = 'block';
    quizzesSection.style.display = 'none';
};
btnQuizzes.onclick = () => {
    btnStudents.classList.remove('active');
    btnAnnouncements.classList.remove('active');
    btnQuizzes.classList.add('active');
    studentsSection.style.display = 'none';
    announcementsSection.style.display = 'none';
    quizzesSection.style.display = 'block';
};

// Admin helper (local to this file) - saves message object to student's message path
async function adminSaveMessage(studentId, payload) {
    if (!studentId) {
        console.error("adminSaveMessage: missing studentId");
        throw new Error("studentId required");
    }
    if (!window.db) {
        console.error("adminSaveMessage: Firebase `db` not found. Make sure firebase-database.js and app.js are loaded before this script.");
        throw new Error("Firebase DB not initialized");
    }

    const messagePayload = Object.assign({
        title: "",
        text: "",
        image: "",
        buttonType: "none",
        buttonText: "",
        buttonLinkExternal: "",
        buttonLinkInternal: "",
        formSpec: [],
        status: "pending",
        createdAt: Date.now()
    }, payload || {});

    try {
        await db.ref(`students/${studentId}/message`).set(messagePayload);
        await db.ref(`students/${studentId}`).update({ hasPendingMessage: true });
        console.log("adminSaveMessage: saved for", studentId, messagePayload);
        return { ok: true, saved: messagePayload };
    } catch (err) {
        console.error("adminSaveMessage: failed", err);
        throw err;
    }
}

// Load students
async function loadStudents() {
    const listEl = document.getElementById('studentList');
    listEl.innerHTML = '<div class="small">Loading...</div>';
    const snap = await db.ref('students').once('value');
    students = snap.val() || {};
    renderStudents();
}

function renderStudents(filter = '') {
    const el = document.getElementById('studentList'); el.innerHTML = '';
    const keys = Object.keys(students || {});
    const q = (filter || '').toLowerCase();
    const filtered = keys.filter(k => {
        const s = students[k] || {};
        if (!q) return true;
        return (s.name || '').toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q) || (s.mobile || '').toLowerCase().includes(q);
    });
    if (!filtered.length) { el.innerHTML = '<div class="small">No students</div>'; return; }
    filtered.forEach(id => {
        const s = students[id] || {};
        const div = document.createElement('div'); div.className = 'student-item';
        div.innerHTML = `<div class="avatar">${s.profile ? '<img src="${escapeHTML(s.profile)}">'.replace('${escapeHTML(s.profile)}', escapeHTML(s.profile)) : escapeHTML((s.name || '').slice(0, 2).toUpperCase())}</div><div style="flex:1"><div style="font-weight:700">${escapeHTML(s.name || '—')}</div><div class="small">${escapeHTML(s.id || '')} • ${escapeHTML(s.class || '')}</div></div>`;
        div.onclick = () => openStudentModal(id);
        el.appendChild(div);
    });
}

document.getElementById('refreshStudents').onclick = () => loadStudents();
document.getElementById('studentSearch').addEventListener('input', e => renderStudents(e.target.value));

// Open student modal
function openStudentModal(id) {
    selectedId = id; const s = students[id] || {};
    document.getElementById('m_img').src = s.profile || '';
    document.getElementById('m_name').innerText = s.name || '';
    document.getElementById('m_id').innerText = s.id || '';
    document.getElementById('studentModal').classList.add('active');

    // load existing message if any
    db.ref(`students/${id}/message`).once('value').then(snap => {
        const m = snap.val() || {};
        document.getElementById('msgTitle').value = m.title || '';
        document.getElementById('msgText').value = m.text || '';
        document.getElementById('msgBtnText').value = m.buttonText || '';
        document.getElementById('msgBtnType').value = m.buttonType || 'none';
        document.getElementById('msgBtnLinkExternal').value = m.buttonLinkExternal || '';
        document.getElementById('msgBtnLinkInternal').value = m.buttonLinkInternal || '';
        document.getElementById('msgRequireForm').checked = Array.isArray(m.formSpec) && m.formSpec.length > 0;
        builderSpec = Array.isArray(m.formSpec) ? JSON.parse(JSON.stringify(m.formSpec)) : []; // deep copy
        renderBuilderPreview(); renderBuilderList(); updateBtnExtra();
        const ms = document.getElementById('studentMessageStatus');
        if (m.status === 'pending') { ms.innerText = 'Student has pending message'; } else if (m.status === 'done') { ms.innerText = 'Last message resolved'; } else ms.innerText = '';
        setTimeout(() => ms.innerText = '', 4000);
    });
}

document.getElementById('closeModal').onclick = () => { document.getElementById('studentModal').classList.remove('active'); selectedId = null; };

// button extra UI
function updateBtnExtra() {
    const t = document.getElementById('msgBtnType').value;
    document.getElementById('btnExtra').style.display = t === 'none' ? 'none' : 'block';
    document.getElementById('msgBtnLinkExternal').style.display = t === 'external' ? 'block' : 'none';
    document.getElementById('msgBtnLinkInternal').style.display = t === 'internal' ? 'block' : 'none';
}
document.getElementById('msgBtnType').addEventListener('change', updateBtnExtra);

// Builder modal controls
document.getElementById('openBuilder').onclick = () => { document.getElementById('builderModal').classList.add('active'); renderBuilderList(); };
document.getElementById('closeBuilderBtn').onclick = () => { document.getElementById('builderModal').classList.remove('active'); };

function renderBuilderList() {
    const c = document.getElementById('builderList'); c.innerHTML = '';
    if (!builderSpec.length) c.innerHTML = '<div class="small">No fields</div>';
    builderSpec.forEach((f, i) => {
        const el = document.createElement('div'); el.className = 'field-item';
        el.innerHTML = `<div style="flex:1"><strong>${escapeHTML(f.label)}</strong><div class="small">${f.type}${f.required ? ' • required' : ''}${f.type === 'select' && f.options ? ' • options:' + f.options.join(', ') : ''}</div></div><div style="display:flex;gap:6px"><button class="btn grey" data-i="${i}" data-op="up">↑</button><button class="btn grey" data-i="${i}" data-op="down">↓</button><button class="btn" data-i="${i}" data-op="del" style="background:#ef4444">Del</button></div>`;
        c.appendChild(el);
        el.querySelector('[data-op="up"]').onclick = () => { if (i > 0) { builderSpec.splice(i - 1, 0, builderSpec.splice(i, 1)[0]); renderBuilderList(); renderBuilderPreview(); } };
        el.querySelector('[data-op="down"]').onclick = () => { if (i < builderSpec.length - 1) { builderSpec.splice(i + 1, 0, builderSpec.splice(i, 1)[0]); renderBuilderList(); renderBuilderPreview(); } };
        el.querySelector('[data-op="del"]').onclick = () => { builderSpec.splice(i, 1); renderBuilderList(); renderBuilderPreview(); };
    });
}

document.getElementById('addFieldBtn').onclick = () => {
    const type = document.getElementById('fieldType').value;
    const label = document.getElementById('fieldLabel').value.trim();
    const required = document.getElementById('fieldReq').checked;
    if (!label) return alert('Label required');
    const id = (label.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString().slice(-4));
    const field = { id, label, type, required: !!required };
    if (type === 'file') field.accept = 'image/png,image/jpeg';
    if (type === 'select') { const opts = prompt('Options separated by comma'); field.options = opts ? opts.split(',').map(s => s.trim()).filter(Boolean) : []; }
    builderSpec.push(field);
    document.getElementById('fieldLabel').value = '';
    document.getElementById('fieldReq').checked = false;
    renderBuilderList();
    renderBuilderPreview();
};

document.getElementById('saveBuilderBtn').onclick = () => { document.getElementById('builderModal').classList.remove('active'); renderBuilderPreview(); showStudentStatus('Builder saved'); };

function renderBuilderPreview() {
    const el = document.getElementById('builderPreview'); el.innerHTML = '';
    if (!builderSpec.length) { el.innerHTML = '<div class="small">No form fields</div>'; return; }
    builderSpec.forEach(f => {
        const d = document.createElement('div'); d.className = 'small'; d.style.marginBottom = '6px';
        d.innerText = `${f.label} ${f.required ? '(required)' : ''} — ${f.type}${f.options ? ' • options:' + f.options.join(', ') : ''}`;
        el.appendChild(d);
    });
}

// Send message
document.getElementById('sendMsgBtn').onclick = async () => {
    if (!selectedId) return showStudentStatus('Select student first');
    const title = document.getElementById('msgTitle').value.trim();
    const text = document.getElementById('msgText').value.trim();
    const btnText = document.getElementById('msgBtnText').value.trim();
    const btnType = document.getElementById('msgBtnType').value;
    const btnExt = document.getElementById('msgBtnLinkExternal').value.trim();
    const btnInt = document.getElementById('msgBtnLinkInternal').value;
    const requireForm = document.getElementById('msgRequireForm').checked;
    const file = document.getElementById('msgImage').files[0];
    if (!text) return showStudentStatus('Message text required');
    showStudentStatus('Sending message...');
    let imageBase64 = '';
    if (file) {
        imageBase64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => res('');
            r.readAsDataURL(file);
        });
    }

    const finalFormSpec = requireForm ? JSON.parse(JSON.stringify(builderSpec || [])) : [];
    const payload = { title, text, image: imageBase64 || '', buttonType: btnType, buttonText: btnText || '', buttonLinkExternal: btnExt || '', buttonLinkInternal: btnInt || '', formSpec: finalFormSpec };

    try { await adminSaveMessage(selectedId, payload); showStudentStatus('Message sent ✔'); document.getElementById('msgText').value = ''; document.getElementById('msgImage').value = ''; } catch (e) { console.error(e); showStudentStatus('Send failed'); }
};

// Clear message
document.getElementById('clearMsgBtn').onclick = () => {
    if (!selectedId) return;
    if (!confirm('Remove message for this student?')) return;
    db.ref(`students/${selectedId}/message`).remove().then(() => showStudentStatus('Message cleared'));
};

// Announcements — extended to support button and file attachments
document.getElementById('saveAnn').onclick = async () => {
    const text = document.getElementById('annText').value.trim();
    const imgFile = document.getElementById('annImage').files[0];
    const anyFile = document.getElementById('annFile').files[0];
    const btnText = document.getElementById('annBtnText').value.trim();
    const btnLink = document.getElementById('annBtnLink').value.trim();
    if (!text) return alert('Text required');
    const id = Date.now().toString();
    // Read files (if any) as base64
    let imgB64 = '';
    let fileB64 = '';
    let fileName = '';
    if (imgFile) {
        imgB64 = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(imgFile);
        });
    }
    if (anyFile) {
        fileName = anyFile.name;
        fileB64 = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(anyFile);
        });
    }

    // Structure saved to DB:
    const payload = {
        text,
        image: imgB64 || '',
        file: fileB64 || '',      // base64 data for file
        fileName: fileName || '',
        buttonText: btnText || '',
        buttonLink: btnLink || '',
        createdAt: Date.now()
    };

    await db.ref(`announcements/${id}`).set(payload);
    await loadAnnouncements();
    alert('Saved');
};

async function loadAnnouncements() {
    const el = document.getElementById('annList'); el.innerHTML = 'Loading...';
    const snap = await db.ref('announcements').once('value');
    el.innerHTML = '';
    if (!snap.exists()) { el.innerHTML = '<div class="small">No announcements</div>'; return; }
    snap.forEach(ch => {
        const d = ch.val() || {};
        const div = document.createElement('div'); div.className = 'card';
        // Build header with text + date + delete
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

        const left = document.createElement('div');
        left.innerHTML = `<b>${escapeHTML(d.text || '')}</b><div class="small">${new Date(d.createdAt || 0).toLocaleString()}</div>`;

        const right = document.createElement('div');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn grey';
        delBtn.innerText = 'Delete';
        delBtn.onclick = () => { if (!confirm('Delete?')) return; db.ref(`announcements/${ch.key}`).remove().then(() => loadAnnouncements()); };
        right.appendChild(delBtn);

        header.appendChild(left); header.appendChild(right);

        div.appendChild(header);

        // image (if any)
        if (d.image) {
            const imgWrap = document.createElement('div'); imgWrap.style.marginTop = '8px';
            const img = document.createElement('img');
            img.src = d.image;
            img.style.maxWidth = '220px';
            img.style.borderRadius = '8px';
            imgWrap.appendChild(img);
            div.appendChild(imgWrap);
        }

        // file (if any) — show download link
        if (d.file && d.fileName) {
            const fWrap = document.createElement('div');
            fWrap.style.marginTop = '8px';
            const a = document.createElement('a');
            a.href = d.file;
            a.download = d.fileName;
            a.innerText = `Download: ${d.fileName}`;
            a.style.display = 'inline-block';
            a.style.padding = '8px 10px';
            a.style.borderRadius = '8px';
            a.style.textDecoration = 'none';
            a.style.border = '1px solid #e6e9ef';
            fWrap.appendChild(a);
            div.appendChild(fWrap);
        }

        // button (if any)
        if (d.buttonText && d.buttonLink) {
            const bWrap = document.createElement('div');
            bWrap.style.marginTop = '8px';
            const btn = document.createElement('a');
            btn.href = d.buttonLink;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.innerText = d.buttonText;
            btn.className = 'btn';
            bWrap.appendChild(btn);
            div.appendChild(bWrap);
        }

        el.appendChild(div);
    });
}

// provide a delete function in global scope (used earlier rendering pattern)
window.deleteAnn = id => { if (!confirm('Delete?')) return; db.ref(`announcements/${id}`).remove().then(() => loadAnnouncements()); };

// Quizzes
document.getElementById('saveQuiz').onclick = async () => {
    const q = {
        question: document.getElementById('qQuestion').value.trim(),
        opt1: document.getElementById('qOpt1').value.trim(),
        opt2: document.getElementById('qOpt2').value.trim(),
        opt3: document.getElementById('qOpt3').value.trim(),
        opt4: document.getElementById('qOpt4').value.trim(),
        correct: document.getElementById('qCorrect').value.trim(),
        createdAt: Date.now()
    };
    if (!q.question) return alert('Question required');
    await db.ref(`quizzes/${Date.now()}`).set(q);
    loadQuizzes();
};

async function loadQuizzes() {
    const el = document.getElementById('quizList'); el.innerHTML = 'Loading...';
    const snap = await db.ref('quizzes').once('value'); el.innerHTML = '';
    if (!snap.exists()) { el.innerHTML = '<div class="small">No quizzes</div>'; return; }
    snap.forEach(ch => {
        const d = ch.val() || {};
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><b>${escapeHTML(d.question || '')}</b></div><div><button class="btn grey" onclick="deleteQuiz('${ch.key}')">Delete</button></div></div>`;
        el.appendChild(card);
    });
}
window.deleteQuiz = id => { if (!confirm('Delete?')) return; db.ref(`quizzes/${id}`).remove().then(() => loadQuizzes()); };

// CSV export
document.getElementById('downloadCSV').onclick = async () => {
    const snap = await db.ref('students').once('value');
    let csv = 'Name,ID,Class,Mobile,DOB,School\n';
    snap.forEach(ch => {
        const s = ch.val() || {};
        csv += `"${(s.name || '').replace(/"/g, '""')}","${(s.id || '').replace(/"/g, '""')}","${(s.class || '').replace(/"/g, '""')}","${(s.mobile || '').replace(/"/g, '""')}","${(s.dob || '').replace(/"/g, '""')}","${(s.school || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'students.csv'; document.body.appendChild(a); a.click(); a.remove();
};

// Edit / Delete student simple flows
document.getElementById('editStudent').onclick = async () => {
    if (!selectedId) return;
    const s = students[selectedId] || {};
    const newName = prompt('Full name', s.name || '') || s.name;
    const newClass = prompt('Class', s.class || '') || s.class;
    const newMobile = prompt('Mobile', s.mobile || '') || s.mobile;
    await db.ref(`students/${selectedId}`).update({ name: newName, class: newClass, mobile: newMobile });
    showStudentStatus('Saved'); loadStudents();
};
document.getElementById('deleteStudent').onclick = async () => {
    if (!selectedId) return;
    if (!confirm('Delete student?')) return;
    await db.ref(`students/${selectedId}`).remove();
    showStudentStatus('Deleted');
    loadStudents();
    document.getElementById('studentModal').classList.remove('active');
};

document.getElementById('downloadPhoto').onclick = () => {
    if (!selectedId) return alert('Select student');
    const s = students[selectedId] || {};
    if (!s.profile) return alert('No photo');
    const a = document.createElement('a'); a.href = s.profile; a.download = `${selectedId}-photo.png`; document.body.appendChild(a); a.click(); a.remove();
};

// init - load initial data and attach live listeners
(async function init() {
    try {
        await loadStudents();
        await loadAnnouncements();
        await loadQuizzes();
        // keep students in sync
        if (db && db.ref) {
            db.ref('students').on('value', snap => { students = snap.val() || {}; renderStudents(document.getElementById('studentSearch').value || ''); });
        }
    } catch (err) {
        console.error('init failed', err);
    }
})();
