import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';

// ===== CATEGORIES & LABELS =====
const CAT_LABELS = {
  'apport-personnel': 'Apport personnel',
  'dette': 'Dette / Emprunt',
  'contribution-famille': 'Contribution famille',
  'contribution-ami': 'Contribution amis/collègues',
  'collecte': 'Collecte / Tontine',
  'cercueil': 'Cercueil / Pompes funèbres',
  'transport': 'Transport / Déplacement',
  'nourriture': 'Nourriture / Restauration',
  'boisson': 'Boissons',
  'location': 'Location salle / Chaises',
  'habit-deuil': 'Habits de deuil',
  'musique': 'Musique / Orchestre',
  'ceremonie': 'Cérémonie religieuse',
  'impression': 'Impression / Faire-part',
  'autre': 'Autre'
};

function catLabel(val) {
  return CAT_LABELS[val] || val;
}

// ===== CRYPTOGRAPHY =====
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== STATE =====
let state = {
  transactions: [],
  participants: [],
  config: { nom: 'Djoudjieu Jeannette épse Tapondjou', date: '', ville: '', village: '', message: '', passcode: 'b2cef26ca4c8ec88081a645723e9d499c5c18ee3c683278f7ce7be915cb2042e' },
};

// References to Firestore
const transactionsRef = collection(db, 'transactions');
const participantsRef = collection(db, 'participants');
const configRef = doc(db, 'settings', 'config');

// Setup Realtime Listeners
onSnapshot(transactionsRef, (snapshot) => {
  state.transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderFinances();
  renderDashboard();
  renderRapports();
});

onSnapshot(participantsRef, (snapshot) => {
  state.participants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderParticipants();
  renderDashboard();
  renderReponses();
  renderRapports();
});

onSnapshot(configRef, (docSnap) => {
  if (docSnap.exists()) {
    state.config = docSnap.data();
    // Update local UI when config changes remotely
    document.getElementById('cfg-nom').value = state.config.nom || '';
    document.getElementById('cfg-date').value = state.config.date || '';
    document.getElementById('cfg-ville').value = state.config.ville || '';
    document.getElementById('cfg-village').value = state.config.village || '';
    document.getElementById('cfg-passcode').value = '';
    document.getElementById('cfg-message').value = state.config.message || '';
    
    // Update page labels
    const nom = state.config.nom || 'Djoudjieu Jeannette épse Tapondjou';
    const msg = state.config.message || 'Votre présence est une grande consolation pour la famille.';
    document.querySelectorAll('.lbl-cfg-nom').forEach(el => el.textContent = nom);
    document.querySelectorAll('.lbl-cfg-message').forEach(el => el.textContent = msg);
    
    updateFormPreview();
    generateShareLink();
  }
});

// ===== AUTHENTICATION & LOCK SYSTEM =====
function checkAuth() {
  const isAdmin = localStorage.getItem('admin_auth') === 'true';
  const nav = document.querySelector('nav');
  const visitorPage = document.getElementById('page-visitor');
  
  if (isAdmin) {
    nav.style.display = 'flex';
    if (visitorPage) {
      visitorPage.style.display = 'none';
      visitorPage.classList.remove('active');
    }
    const activePage = document.querySelector('.page.active');
    if (!activePage || activePage.id === 'page-visitor') {
      showPage('dashboard');
    } else {
      const activeId = activePage.id.replace('page-', '');
      showPage(activeId);
    }
  } else {
    nav.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    if (visitorPage) {
      visitorPage.classList.add('active');
      visitorPage.style.display = 'block';
    }
  }
}

async function login(passcode) {
  const correctHash = state.config.passcode || 'b2cef26ca4c8ec88081a645723e9d499c5c18ee3c683278f7ce7be915cb2042e';
  const hashedInput = await sha256(passcode);
  if (hashedInput === correctHash) {
    localStorage.setItem('admin_auth', 'true');
    checkAuth();
    toast('Connexion réussie');
    document.getElementById('admin-passcode').value = '';
    closeModal('modal-admin-login');
  } else {
    alert('Code d\'accès incorrect.');
  }
}

function logout() {
  if (confirm('Se déconnecter de l\'espace admin ?')) {
    localStorage.removeItem('admin_auth');
    checkAuth();
    toast('Déconnexion effectuée');
  }
}

// Bind auth triggers
document.getElementById('link-admin-login').onclick = () => {
  openModal('modal-admin-login');
  setTimeout(() => document.getElementById('admin-passcode').focus(), 300);
};
document.getElementById('close-modal-admin-login').onclick = () => closeModal('modal-admin-login');
document.getElementById('btn-submit-admin-login').onclick = () => {
  const code = document.getElementById('admin-passcode').value.trim();
  login(code);
};
document.getElementById('admin-passcode').onkeydown = (e) => {
  if (e.key === 'Enter') {
    login(e.target.value.trim());
  }
};

// ===== NAVIGATION =====
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  
  const pageEl = document.getElementById('page-' + id);
  const tabEl = document.getElementById('tab-' + id);
  if (pageEl) pageEl.classList.add('active');
  if (tabEl) tabEl.classList.add('active');
  
  if (id === 'dashboard') renderDashboard();
  if (id === 'finances') renderFinances();
  if (id === 'participants') renderParticipants();
  if (id === 'formulaire') renderFormulaire();
  if (id === 'rapports') renderRapports();
}

document.getElementById('tab-dashboard').onclick = () => showPage('dashboard');
document.getElementById('tab-finances').onclick = () => showPage('finances');
document.getElementById('tab-participants').onclick = () => showPage('participants');
document.getElementById('tab-formulaire').onclick = () => showPage('formulaire');
document.getElementById('tab-rapports').onclick = () => showPage('rapports');
document.getElementById('tab-logout').onclick = () => logout();

// ===== UTILS =====
function fmt(n) {
  return Number(n).toLocaleString('fr-FR') + ' FCFA';
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = '✓ ' + msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function presenceBadge(p) {
  const map = {
    ville: ['badge-ville','Veillée — Ville'],
    village: ['badge-village','Village'],
    partout: ['badge-partout','Ville + Village'],
    distance: ['badge-ville','À distance'],
  };
  const [cls, txt] = map[p] || ['badge-ville', p];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function transportBadge(t) {
  if (t === 'bus') return '<span class="badge badge-village">🚌 Bus organisé</span>';
  if (t === 'propre') return '<span class="badge badge-ville">🚗 Moyen perso</span>';
  return '<span style="color:var(--gris);font-size:0.8rem;">—</span>';
}

// Attach Modal Closers
document.getElementById('close-modal-transaction').onclick = () => closeModal('modal-transaction');
document.getElementById('cancel-modal-transaction').onclick = () => closeModal('modal-transaction');
document.getElementById('close-modal-participant').onclick = () => closeModal('modal-participant');
document.getElementById('cancel-modal-participant').onclick = () => closeModal('modal-participant');
document.getElementById('close-modal-public').onclick = () => closeModal('modal-public-form');

// ===== FINANCES =====
document.getElementById('btn-new-transaction').onclick = () => openModal('modal-transaction');
document.getElementById('btn-save-transaction').onclick = async () => {
  const type = document.getElementById('t-type').value;
  const montant = parseFloat(document.getElementById('t-montant').value);
  const categorie = document.getElementById('t-categorie').value;
  const date = document.getElementById('t-date').value || new Date().toISOString().split('T')[0];
  const description = document.getElementById('t-description').value;
  const personne = document.getElementById('t-personne').value;

  if (!montant || montant <= 0) { alert('Veuillez entrer un montant valide.'); return; }

  try {
    await addDoc(transactionsRef, { type, montant, categorie, date, description, personne });
    closeModal('modal-transaction');
    toast('Transaction enregistrée');
    ['t-montant','t-description','t-personne'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('t-date').value = '';
  } catch (e) {
    console.error(e);
    alert('Erreur lors de l\'enregistrement');
  }
};

window.deleteTransaction = async (id) => {
  if (!confirm('Supprimer cette transaction ?')) return;
  try {
    await deleteDoc(doc(db, 'transactions', id));
    toast('Transaction supprimée');
  } catch (e) {
    console.error(e);
    alert('Erreur lors de la suppression');
  }
};

function renderFinances() {
  const tbody = document.getElementById('finance-table');
  if (!state.transactions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Aucune transaction enregistrée</td></tr>';
    return;
  }
  const sorted = [...state.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));
  tbody.innerHTML = sorted.map(t => `
    <tr>
      <td>${t.date}</td>
      <td><span class="badge ${t.type==='entree'?'badge-entree':'badge-depense'}">${t.type==='entree'?'Entrée':'Dépense'}</span></td>
      <td style="color:var(--gris);font-size:0.8rem;">${catLabel(t.categorie)}</td>
      <td>${t.description || '-'}${t.personne ? `<br><span style="color:var(--gris);font-size:0.78rem;">${t.personne}</span>` : ''}</td>
      <td class="${t.type==='entree'?'montant-pos':'montant-neg'}" style="font-weight:500;">${t.type==='entree'?'+':'-'} ${fmt(t.montant)}</td>
      <td><button class="btn btn-danger" onclick="window.deleteTransaction('${t.id}')">Suppr.</button></td>
    </tr>
  `).join('');
}

// ===== PARTICIPANTS =====
document.getElementById('btn-new-participant').onclick = () => openModal('modal-participant');
document.getElementById('btn-save-participant').onclick = async () => {
  const nom = document.getElementById('p-nom').value;
  if (!nom.trim()) { alert('Le nom est obligatoire.'); return; }
  
  const pData = {
    nom,
    tel: document.getElementById('p-tel').value,
    presence: document.getElementById('p-presence').value,
    transport: document.getElementById('p-transport').value,
    contribution: parseFloat(document.getElementById('p-contribution').value) || 0,
    note: document.getElementById('p-note').value,
    source: 'manuel',
    date: new Date().toISOString()
  };

  try {
    await addDoc(participantsRef, pData);
    closeModal('modal-participant');
    toast('Participant ajouté');
    ['p-nom','p-tel','p-contribution','p-note'].forEach(id => document.getElementById(id).value = '');
  } catch(e) {
    console.error(e);
    alert('Erreur lors de l\'ajout');
  }
};

window.deleteParticipant = async (id) => {
  if (!confirm('Supprimer ce participant ?')) return;
  try {
    await deleteDoc(doc(db, 'participants', id));
    toast('Participant supprimé');
  } catch(e) {
    console.error(e);
    alert('Erreur');
  }
};

function renderParticipants() {
  const tbody = document.getElementById('participants-table');
  if (!state.participants.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Aucun participant enregistré</td></tr>';
    return;
  }
  tbody.innerHTML = state.participants.map(p => `
    <tr>
      <td>${p.nom}${p.source==='formulaire'?'<br><span style="color:var(--or);font-size:0.72rem;">via formulaire</span>':''}</td>
      <td style="color:var(--gris);font-size:0.83rem;">${p.tel || '-'}</td>
      <td>${presenceBadge(p.presence)}</td>
      <td>${transportBadge(p.transport)}</td>
      <td class="montant-pos">${p.contribution ? fmt(p.contribution) : '-'}</td>
      <td style="color:var(--gris);font-size:0.82rem;max-width:180px;">${p.note || '-'}</td>
      <td><button class="btn btn-danger" onclick="window.deleteParticipant('${p.id}')">Suppr.</button></td>
    </tr>
  `).join('');
}

// ===== CHARTS & GRAPHICS HELPERS =====
const chartInstances = {};
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// ===== DASHBOARD RENDER =====
function renderDashboard() {
  const entrees = state.transactions.filter(t=>t.type==='entree').reduce((s,t)=>s+t.montant,0);
  const depenses = state.transactions.filter(t=>t.type==='depense').reduce((s,t)=>s+t.montant,0);
  const solde = entrees - depenses;

  document.getElementById('stat-entrees').textContent = fmt(entrees);
  document.getElementById('stat-depenses').textContent = fmt(depenses);
  document.getElementById('stat-solde').textContent = fmt(solde);
  document.getElementById('stat-solde').className = 'stat-value ' + (solde >= 0 ? 'montant-pos' : 'montant-neg');
  document.getElementById('stat-participants').textContent = state.participants.length;

  const busCnt = state.participants.filter(p=>p.transport==='bus').length;
  document.getElementById('stat-bus').textContent = busCnt;

  const recent = [...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  const dt = document.getElementById('dash-transactions');
  if (!recent.length) { dt.innerHTML = '<div class="empty">Aucune transaction</div>'; }
  else {
    dt.innerHTML = recent.map(t => `
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:0.85rem;">${t.description||catLabel(t.categorie)||'—'}</span>
        <span class="${t.type==='entree'?'montant-pos':'montant-neg'}" style="font-size:0.85rem;font-weight:500;">${t.type==='entree'?'+':'-'}${fmt(t.montant)}</span>
      </div>
    `).join('');
  }

  const rp = document.getElementById('dash-repartition');
  const counts = {};
  state.participants.forEach(p => { counts[p.presence] = (counts[p.presence]||0) + 1; });
  const labels = { ville:'Veillée en ville', village:'Village', partout:'Ville + Village', distance:'À distance' };

  const propreCnt = state.participants.filter(p=>p.transport==='propre').length;

  if (!Object.keys(counts).length) {
    rp.innerHTML = '<div class="empty">Aucun participant</div>';
  } else {
    rp.innerHTML = Object.entries(counts).map(([k,v]) => `
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:0.85rem;">${labels[k]||k}</span>
        <span style="color:var(--or);font-weight:600;">${v}</span>
      </div>
    `).join('') + (busCnt||propreCnt ? `
      <div style="margin-top:0.8rem;padding-top:0.5rem;border-top:1px solid rgba(201,168,76,0.2);">
        <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--gris);margin-bottom:0.4rem;">Transport village</div>
        ${busCnt ? `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;font-size:0.85rem;"><span>🚌 Bus organisé</span><span style="color:var(--or);font-weight:600;">${busCnt}</span></div>` : ''}
        ${propreCnt ? `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;font-size:0.85rem;"><span>🚗 Moyen personnel</span><span style="color:var(--or);font-weight:600;">${propreCnt}</span></div>` : ''}
      </div>` : '');
  }

  document.getElementById('dash-date').textContent = 'Mis à jour le ' + new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'});

  // Render dashboard balance chart
  destroyChart('balance');
  const canvasBalance = document.getElementById('chart-balance');
  if (canvasBalance) {
    const ctx1 = canvasBalance.getContext('2d');
    chartInstances['balance'] = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['Entrées', 'Dépenses', 'Solde'],
        datasets: [{
          data: [entrees, depenses, Math.abs(solde)],
          backgroundColor: ['rgba(127,196,154,0.7)', 'rgba(201,112,112,0.7)', solde >= 0 ? 'rgba(201,168,76,0.7)' : 'rgba(201,112,112,0.4)'],
          borderColor: ['#7fc49a', '#c97070', solde >= 0 ? '#c9a84c' : '#c97070'],
          borderWidth: 1
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: '#6b6460', callback: v => v >= 1000 ? (v / 1000) + 'k' : v }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#6b6460' }, grid: { display: false } }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  // Render expenses doughnut chart
  destroyChart('depenses');
  const depCats = {};
  state.transactions.filter(t => t.type === 'depense').forEach(t => {
    depCats[t.categorie] = (depCats[t.categorie] || 0) + t.montant;
  });
  const canvasDep = document.getElementById('chart-depenses');
  if (canvasDep && Object.keys(depCats).length) {
    const ctx2 = canvasDep.getContext('2d');
    chartInstances['depenses'] = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: Object.keys(depCats).map(catLabel),
        datasets: [{
          data: Object.values(depCats),
          backgroundColor: ['rgba(201,168,76,0.8)', 'rgba(127,196,154,0.8)', 'rgba(122,168,212,0.8)', 'rgba(201,112,112,0.8)', 'rgba(180,140,80,0.8)', 'rgba(100,160,130,0.8)', 'rgba(160,100,160,0.8)'],
          borderColor: 'rgba(26,22,20,0.5)',
          borderWidth: 2
        }]
      },
      options: {
        plugins: { legend: { labels: { color: '#f5f0e8', font: { size: 11 } } } },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }
}

// ===== CONFIGURATION =====
document.getElementById('btn-save-config').onclick = async () => {
  const inputPasscode = document.getElementById('cfg-passcode').value.trim();
  let savedPasscode = state.config.passcode || 'b2cef26ca4c8ec88081a645723e9d499c5c18ee3c683278f7ce7be915cb2042e';
  
  if (inputPasscode !== '') {
    savedPasscode = await sha256(inputPasscode);
  }

  const newConfig = {
    nom: document.getElementById('cfg-nom').value || 'Djoudjieu Jeannette épse Tapondjou',
    date: document.getElementById('cfg-date').value,
    ville: document.getElementById('cfg-ville').value,
    village: document.getElementById('cfg-village').value,
    passcode: savedPasscode,
    message: document.getElementById('cfg-message').value,
  };
  try {
    await setDoc(configRef, newConfig);
    toast('Configuration sauvegardée');
  } catch(e) {
    console.error(e);
    alert('Erreur lors de la sauvegarde');
  }
};

['cfg-nom', 'cfg-date', 'cfg-ville', 'cfg-village', 'cfg-message'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateFormPreview);
});

function updateFormPreview() {
  const nom = document.getElementById('cfg-nom').value || 'Djoudjieu Jeannette épse Tapondjou';
  const msg = document.getElementById('cfg-message').value || 'Votre présence est une grande consolation pour la famille.';
  document.getElementById('pv-nom').textContent = nom;
  document.getElementById('pv-msg').textContent = msg;

  document.querySelectorAll('.lbl-cfg-nom').forEach(el => el.textContent = nom);
  document.querySelectorAll('.lbl-cfg-message').forEach(el => el.textContent = msg);
}

function generateShareLink() {
  const base = window.location.href.split('?')[0].split('#')[0];
  const link = base + '?formulaire=1';
  document.getElementById('share-link').value = link;
  return link;
}

document.getElementById('btn-copy-link').onclick = () => {
  const link = document.getElementById('share-link').value;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => toast('Lien copié !')).catch(() => {
    document.getElementById('share-link').select();
    document.execCommand('copy');
    toast('Lien copié !');
  });
};

document.getElementById('btn-share-whatsapp').onclick = () => {
  const link = document.getElementById('share-link').value;
  const nom = state.config.nom || 'Djoudjieu Jeannette épse Tapondjou';
  const msg = encodeURIComponent(`Chers proches,\nNous traversons un moment difficile avec le deuil de ${nom}.\nMerci de remplir ce formulaire pour nous indiquer comment vous pouvez nous assister :\n${link}`);
  window.open('https://wa.me/?text=' + msg, '_blank');
};

function renderFormulaire() {
  updateFormPreview();
  generateShareLink();
  renderReponses();
}

function renderReponses() {
  const reponses = state.participants.filter(p => p.source === 'formulaire');
  document.getElementById('reponses-count').textContent = reponses.length;
  const tbody = document.getElementById('reponses-table');
  if (!reponses.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Aucune réponse reçue</td></tr>';
    return;
  }
  tbody.innerHTML = reponses.map(p => `
    <tr>
      <td>${p.nom}</td>
      <td style="color:var(--gris);font-size:0.83rem;">${p.tel||'-'}</td>
      <td>${presenceBadge(p.presence)}</td>
      <td>${transportBadge(p.transport)}</td>
      <td class="montant-pos">${p.contribution ? fmt(p.contribution) : '-'}</td>
      <td style="color:var(--gris);font-size:0.82rem;max-width:150px;">${p.note||'-'}</td>
      <td><button class="btn btn-danger" onclick="window.deleteParticipant('${p.id}')">Suppr.</button></td>
    </tr>
  `).join('');
}

// ===== PUBLIC FORM LOGIC =====
document.getElementById('btn-preview-form').onclick = () => {
  document.getElementById('mf-nom').textContent = document.getElementById('cfg-nom').value || 'Djoudjieu Jeannette épse Tapondjou';
  document.getElementById('mf-msg').textContent = document.getElementById('cfg-message').value || 'Votre présence est une grande consolation pour la famille.';
  openModal('modal-public-form');
};

document.getElementById('btn-submit-public-form').onclick = async () => {
  const nom = document.getElementById('mf-pnom').value.trim();
  const tel = document.getElementById('mf-tel').value.trim();
  const presence = document.getElementById('mf-presence').value;
  const contribution = parseFloat(document.getElementById('mf-contribution').value) || 0;
  const note = document.getElementById('mf-note').value;
  const transport = document.getElementById('mf-transport').value;

  if (!nom) { alert('Le nom est obligatoire.'); return; }
  if (!presence) { alert('Veuillez indiquer où vous pouvez assister.'); return; }

  const pData = { nom, tel, presence, transport, contribution, note, source: 'formulaire', date: new Date().toISOString() };
  
  try {
    await addDoc(participantsRef, pData);
    closeModal('modal-public-form');
    toast('Réponse enregistrée — Merci !');
    ['mf-pnom','mf-tel','mf-contribution','mf-note'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('mf-presence').value = '';
    document.getElementById('mf-transport').value = '';
  } catch(e) {
    console.error(e);
    alert(`Erreur lors de l'envoi : ${e?.message || e}`);
  }
};

// ===== VISITOR PUBLIC PAGE SUBMISSION =====
document.getElementById('btn-submit-visitor-form').onclick = async () => {
  const nom = document.getElementById('vf-pnom').value.trim();
  const tel = document.getElementById('vf-tel').value.trim();
  const presence = document.getElementById('vf-presence').value;
  const contribution = parseFloat(document.getElementById('vf-contribution').value) || 0;
  const note = document.getElementById('vf-note').value;
  const transport = document.getElementById('vf-transport').value;

  if (!nom) { alert('Le nom est obligatoire.'); return; }
  if (!presence) { alert('Veuillez indiquer où vous pouvez nous assister.'); return; }
  if (transport === '') { alert('Veuillez choisir un moyen de transport.'); return; }

  const pData = { nom, tel, presence, transport, contribution, note, source: 'formulaire', date: new Date().toISOString() };
  
  try {
    const btn = document.getElementById('btn-submit-visitor-form');
    btn.disabled = true;
    btn.textContent = 'Envoi en cours...';
    await addDoc(participantsRef, pData);
    toast('Réponse enregistrée — Merci !');
    ['vf-pnom','vf-tel','vf-contribution','vf-note'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('vf-presence').value = '';
    document.getElementById('vf-transport').value = '';
  } catch(e) {
    console.error(e);
    alert(`Erreur lors de l'envoi : ${e?.message || e}`);
  } finally {
    const btn = document.getElementById('btn-submit-visitor-form');
    btn.disabled = false;
    btn.textContent = 'Envoyer ma réponse';
  }
};

// ===== REPORTS PAGE INTEGRATION =====
function renderRapports() {
  const entrees = state.transactions.filter(t=>t.type==='entree').reduce((s,t)=>s+t.montant,0);
  const depenses = state.transactions.filter(t=>t.type==='depense').reduce((s,t)=>s+t.montant,0);

  // Chart évolution
  destroyChart('evolution');
  const txSorted = [...state.transactions].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const canvasEvo = document.getElementById('chart-evolution');
  if (canvasEvo && txSorted.length) {
    let cumul = 0;
    const evoLabels = [], evoData = [];
    txSorted.forEach(t=>{ cumul += t.type==='entree'?t.montant:-t.montant; evoLabels.push(t.date); evoData.push(cumul); });
    const ctx3 = canvasEvo.getContext('2d');
    chartInstances['evolution'] = new Chart(ctx3, {
      type:'line',
      data:{ labels:evoLabels, datasets:[{ label:'Solde cumulé', data:evoData,
        borderColor:'#c9a84c', backgroundColor:'rgba(201,168,76,0.1)', fill:true, tension:0.3, pointBackgroundColor:'#c9a84c' }]},
      options:{ plugins:{legend:{labels:{color:'#f5f0e8'}}}, scales:{ y:{ticks:{color:'#6b6460',callback:v=>v>=1000?(v/1000)+'k':v}, grid:{color:'rgba(255,255,255,0.05)'}}, x:{ticks:{color:'#6b6460',maxTicksLimit:6}, grid:{display:false}} }, responsive:true, maintainAspectRatio:false }
    });
  }

  // Chart catégories dépenses
  destroyChart('categories');
  const depCats = {};
  state.transactions.filter(t=>t.type==='depense').forEach(t=>{ depCats[t.categorie]=(depCats[t.categorie]||0)+t.montant; });
  const canvasCats = document.getElementById('chart-categories');
  if (canvasCats && Object.keys(depCats).length) {
    const ctx4 = canvasCats.getContext('2d');
    chartInstances['categories'] = new Chart(ctx4, {
      type:'bar',
      data:{ labels:Object.keys(depCats).map(catLabel), datasets:[{ data:Object.values(depCats),
        backgroundColor:'rgba(201,112,112,0.75)', borderColor:'#c97070', borderWidth:1 }]},
      options:{ indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#6b6460',callback:v=>v>=1000?(v/1000)+'k':v}, grid:{color:'rgba(255,255,255,0.05)'}}, y:{ticks:{color:'#6b6460'}, grid:{display:false}} }, responsive:true, maintainAspectRatio:false }
    });
  }

  // Chart présence
  destroyChart('presence');
  const presenceCounts = {};
  state.participants.forEach(p=>{ presenceCounts[p.presence]=(presenceCounts[p.presence]||0)+1; });
  const presLabels = { ville:'Veillée Ville', village:'Village', partout:'Ville+Village', distance:'À distance' };
  const canvasPresence = document.getElementById('chart-presence');
  if (canvasPresence && Object.keys(presenceCounts).length) {
    const ctx5 = canvasPresence.getContext('2d');
    chartInstances['presence'] = new Chart(ctx5, {
      type:'pie',
      data:{ labels:Object.keys(presenceCounts).map(k=>presLabels[k]||k), datasets:[{ data:Object.values(presenceCounts),
        backgroundColor:['rgba(122,168,212,0.8)','rgba(127,196,154,0.8)','rgba(201,168,76,0.8)','rgba(180,140,80,0.6)'],
        borderColor:'rgba(26,22,20,0.5)', borderWidth:2 }]},
      options:{ plugins:{legend:{labels:{color:'#f5f0e8',font:{size:11}}}}, responsive:true, maintainAspectRatio:false }
    });
  }

  // Chart transport
  destroyChart('transport');
  const busCnt = state.participants.filter(p=>p.transport==='bus').length;
  const propreCnt = state.participants.filter(p=>p.transport==='propre').length;
  const nonCnt = state.participants.filter(p=>p.transport==='non'||!p.transport).length;
  const canvasTransport = document.getElementById('chart-transport');
  if (canvasTransport && (busCnt||propreCnt||nonCnt)) {
    const ctx6 = canvasTransport.getContext('2d');
    chartInstances['transport'] = new Chart(ctx6, {
      type:'doughnut',
      data:{ labels:['🚌 Bus organisé','🚗 Moyen perso','⛔ Pas au village'],
        datasets:[{ data:[busCnt,propreCnt,nonCnt],
          backgroundColor:['rgba(127,196,154,0.8)','rgba(122,168,212,0.8)','rgba(180,100,100,0.5)'],
          borderColor:'rgba(26,22,20,0.5)', borderWidth:2 }]},
      options:{ plugins:{legend:{labels:{color:'#f5f0e8',font:{size:11}}}}, responsive:true, maintainAspectRatio:false }
    });
  }
}

function genererRapport() {
  const entrees = state.transactions.filter(t=>t.type==='entree').reduce((s,t)=>s+t.montant,0);
  const depenses = state.transactions.filter(t=>t.type==='depense').reduce((s,t)=>s+t.montant,0);
  const solde = entrees - depenses;
  const busCnt = state.participants.filter(p=>p.transport==='bus').length;
  const coutBus = busCnt * 16500;

  const entrCats = {};
  state.transactions.filter(t=>t.type==='entree').forEach(t=>{ entrCats[t.categorie]=(entrCats[t.categorie]||0)+t.montant; });
  const depCats = {};
  state.transactions.filter(t=>t.type==='depense').forEach(t=>{ depCats[t.categorie]=(depCats[t.categorie]||0)+t.montant; });

  const now = new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});

  document.getElementById('rapport-body').innerHTML = `
    <div style="font-size:0.8rem;color:var(--gris);margin-bottom:1.5rem;">Généré le ${now}</div>

    <div class="rapport-section">
      <h3>📥 Entrées — ${fmt(entrees)}</h3>
      ${Object.entries(entrCats).map(([k,v])=>`<div class="rapport-row"><span>${catLabel(k)}</span><span class="montant-pos">+ ${fmt(v)}</span></div>`).join('')||'<div style="color:var(--gris);font-size:0.85rem;">Aucune entrée</div>'}
      <div class="rapport-total"><span>Total entrées</span><span class="montant-pos">+ ${fmt(entrees)}</span></div>
    </div>

    <div class="rapport-section">
      <h3>📤 Dépenses — ${fmt(depenses)}</h3>
      ${Object.entries(depCats).map(([k,v])=>`<div class="rapport-row"><span>${catLabel(k)}</span><span class="montant-neg">- ${fmt(v)}</span></div>`).join('')||'<div style="color:var(--gris);font-size:0.85rem;">Aucune dépense</div>'}
      <div class="rapport-total"><span>Total dépenses</span><span class="montant-neg">- ${fmt(depenses)}</span></div>
    </div>

    <div class="rapport-section">
      <h3>💰 Solde</h3>
      <div class="rapport-total" style="font-size:1.3rem;">
        <span>Solde actuel</span>
        <span class="${solde>=0?'montant-pos':'montant-neg'}">${fmt(solde)}</span>
      </div>
    </div>

    <div class="rapport-section">
      <h3>👥 Participants — ${state.participants.length} personnes</h3>
      <div class="rapport-row"><span>Veillée en ville</span><span style="color:var(--or);">${state.participants.filter(p=>p.presence==='ville'||p.presence==='partout').length}</span></div>
      <div class="rapport-row"><span>Célébration au village</span><span style="color:var(--or);">${state.participants.filter(p=>p.presence==='village'||p.presence==='partout').length}</span></div>
      <div class="rapport-row"><span>À distance</span><span style="color:var(--or);">${state.participants.filter(p=>p.presence==='distance').length}</span></div>
    </div>

    <div class="rapport-section">
      <h3>🚌 Transport village</h3>
      <div class="rapport-row"><span>Bus organisé (× ${busCnt} personnes)</span><span style="color:var(--or);">${busCnt} pers.</span></div>
      <div class="rapport-row"><span>Coût total bus (${busCnt} × 16 500 FCFA)</span><span class="montant-neg">${fmt(coutBus)}</span></div>
      <div class="rapport-row"><span>Moyen personnel</span><span style="color:var(--or);">${state.participants.filter(p=>p.transport==='propre').length} pers.</span></div>
      <div class="rapport-row"><span>Contributions prévues (participants)</span><span class="montant-pos">+ ${fmt(state.participants.reduce((s,p)=>s+p.contribution,0))}</span></div>
    </div>
  `;
  toast('Rapport généré !');
}

function telechargerRapport() {
  const entrees = state.transactions.filter(t=>t.type==='entree').reduce((s,t)=>s+t.montant,0);
  const depenses = state.transactions.filter(t=>t.type==='depense').reduce((s,t)=>s+t.montant,0);
  const solde = entrees - depenses;
  const now = new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Rapport Deuil — Djoudjieu Jeannette</title>
  <style>
    body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222;}
    h1{font-size:1.8rem;color:#1a1614;border-bottom:2px solid #c9a84c;padding-bottom:0.5rem;}
    h2{font-size:1.2rem;color:#8b6914;margin-top:1.5rem;}
    .sub{color:#666;font-size:0.9rem;}
    table{width:100%;border-collapse:collapse;margin:0.5rem 0 1rem;}
    th{background:#f5f0e8;padding:0.5rem 0.8rem;text-align:left;font-size:0.8rem;text-transform:uppercase;}
    td{padding:0.5rem 0.8rem;border-bottom:1px solid #eee;}
    .total{font-weight:bold;font-size:1.1rem;padding:0.8rem;background:#fffbe8;}
    .pos{color:#2e7d52;} .neg{color:#8b2e2e;}
    footer{margin-top:2rem;font-size:0.8rem;color:#999;border-top:1px solid #eee;padding-top:1rem;}
  </style></head><body>
  <h1>🕊 Rapport de Deuil</h1>
  <p class="sub">Djoudjieu Jeannette épouse Tapondjou — Généré le ${now}</p>
  
  <h2>FINANCES</h2>
  <table>
    <thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Montant</th></tr></thead>
    <tbody>
      ${state.transactions.map(t=>`<tr><td>${t.date}</td><td>${catLabel(t.categorie)}</td><td>${t.description||'-'}</td><td class="${t.type==='entree'?'pos':'neg'}">${t.type==='entree'?'+':'-'} ${Number(t.montant).toLocaleString('fr-FR')} FCFA</td></tr>`).join('')}
      <tr class="total"><td colspan="3">Solde</td><td class="${solde>=0?'pos':'neg'}">${Number(solde).toLocaleString('fr-FR')} FCFA</td></tr>
    </tbody>
  </table>
  
  <h2>PARTICIPANTS (${state.participants.length})</h2>
  <table>
    <thead><tr><th>Nom</th><th>Contact</th><th>Présence</th><th>Transport</th><th>Contribution</th></tr></thead>
    <tbody>
      ${state.participants.map(p=>`<tr><td>${p.nom}</td><td>${p.tel||'-'}</td><td>${p.presence}</td><td>${p.transport}</td><td class="pos">${p.contribution?Number(p.contribution).toLocaleString('fr-FR')+' FCFA':'-'}</td></tr>`).join('')}
    </tbody>
  </table>
  
  <footer>
    <p>Généré automatiquement — En mémoire de Maman</p>
  </footer>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
  toast('Fenêtre d\'impression ouverte');
}

function exportCSV() {
  if (!state.participants.length && !state.transactions.length) {
    alert('Aucune donnée à exporter.');
    return;
  }
  
  // Export Participants
  if (state.participants.length) {
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'Nom;Contact;Presence;Transport;Contribution;Note;Source;Date\n';
    state.participants.forEach(p => {
      csv += `"${p.nom.replace(/"/g, '""')}";"${(p.tel || '').replace(/"/g, '""')}";"${p.presence}";"${p.transport}";${p.contribution || 0};"${(p.note || '').replace(/"/g, '""')}";"${p.source || ''}";"${p.date || ''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `participants_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export Transactions
  if (state.transactions.length) {
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'Date;Type;Categorie;Description;Donateur_Beneficiaire;Montant\n';
    state.transactions.forEach(t => {
      csv += `"${t.date}";"${t.type}";"${catLabel(t.categorie)}";"${(t.description || '').replace(/"/g, '""')}";"${(t.personne || '').replace(/"/g, '""')}";${t.montant}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `finances_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  toast('Données exportées en CSV !');
}

// Bind Reports action buttons
document.getElementById('btn-generate-rapport').onclick = () => genererRapport();
document.getElementById('btn-download-pdf').onclick = () => telechargerRapport();
document.getElementById('btn-export-csv').onclick = () => exportCSV();

// ===== PUBLIC FORM POPUP ROUTING =====
if (window.location.search.includes('formulaire=1')) {
  setTimeout(() => {
    document.getElementById('mf-nom').textContent = state.config.nom || 'Djoudjieu Jeannette épse Tapondjou';
    document.getElementById('mf-msg').textContent = state.config.message || 'Votre présence est une grande consolation pour la famille.';
    openModal('modal-public-form');
  }, 1000);
}

// ===== INITIALIZE =====
document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
checkAuth();
renderDashboard();
generateShareLink();
