import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';

// ===== STATE =====
let state = {
  transactions: [],
  participants: [],
  config: { nom: 'Djoudjieu Jeannette épse Tapondjou', date: '', ville: '', village: '', message: '' },
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
});

onSnapshot(participantsRef, (snapshot) => {
  state.participants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderParticipants();
  renderDashboard();
  renderReponses();
});

onSnapshot(configRef, (docSnap) => {
  if (docSnap.exists()) {
    state.config = docSnap.data();
    // Update local UI when config changes remotely
    document.getElementById('cfg-nom').value = state.config.nom || '';
    document.getElementById('cfg-date').value = state.config.date || '';
    document.getElementById('cfg-ville').value = state.config.ville || '';
    document.getElementById('cfg-village').value = state.config.village || '';
    document.getElementById('cfg-message').value = state.config.message || '';
    updateFormPreview();
    generateShareLink();
  }
});

// ===== NAVIGATION =====
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.getElementById('tab-' + id).classList.add('active');
  if (id === 'dashboard') renderDashboard();
  if (id === 'finances') renderFinances();
  if (id === 'participants') renderParticipants();
  if (id === 'formulaire') renderFormulaire();
}
document.getElementById('tab-dashboard').onclick = () => showPage('dashboard');
document.getElementById('tab-finances').onclick = () => showPage('finances');
document.getElementById('tab-participants').onclick = () => showPage('participants');
document.getElementById('tab-formulaire').onclick = () => showPage('formulaire');

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
      <td style="color:var(--gris);font-size:0.8rem;">${t.categorie || '-'}</td>
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

function transportBadge(t) {
  if (t === 'bus') return '<span class="badge badge-village">🚌 Bus organisé</span>';
  if (t === 'propre') return '<span class="badge badge-ville">🚗 Moyen perso</span>';
  if (t === 'non') return '<span style="color:var(--gris);font-size:0.8rem;">—</span>';
  return '<span style="color:var(--gris);font-size:0.8rem;">—</span>';
}

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

// ===== DASHBOARD =====
function renderDashboard() {
  const entrees = state.transactions.filter(t=>t.type==='entree').reduce((s,t)=>s+t.montant,0);
  const depenses = state.transactions.filter(t=>t.type==='depense').reduce((s,t)=>s+t.montant,0);
  const solde = entrees - depenses;

  document.getElementById('stat-entrees').textContent = fmt(entrees);
  document.getElementById('stat-depenses').textContent = fmt(depenses);
  document.getElementById('stat-solde').textContent = fmt(solde);
  document.getElementById('stat-solde').className = 'stat-value ' + (solde >= 0 ? 'montant-pos' : 'montant-neg');
  document.getElementById('stat-participants').textContent = state.participants.length;

  const recent = [...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  const dt = document.getElementById('dash-transactions');
  if (!recent.length) { dt.innerHTML = '<div class="empty">Aucune transaction</div>'; }
  else {
    dt.innerHTML = recent.map(t => `
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:0.85rem;">${t.description||t.categorie||'—'}</span>
        <span class="${t.type==='entree'?'montant-pos':'montant-neg'}" style="font-size:0.85rem;font-weight:500;">${t.type==='entree'?'+':'-'}${fmt(t.montant)}</span>
      </div>
    `).join('');
  }

  const rp = document.getElementById('dash-repartition');
  const counts = {};
  state.participants.forEach(p => { counts[p.presence] = (counts[p.presence]||0) + 1; });
  const labels = { ville:'Veillée en ville', village:'Village', partout:'Ville + Village', distance:'À distance' };

  const busCnt = state.participants.filter(p=>p.transport==='bus').length;
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
}

// ===== FORMULAIRE =====
document.getElementById('btn-save-config').onclick = async () => {
  const newConfig = {
    nom: document.getElementById('cfg-nom').value || 'Papa',
    date: document.getElementById('cfg-date').value,
    ville: document.getElementById('cfg-ville').value,
    village: document.getElementById('cfg-village').value,
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
  const nom = state.config.nom || 'Papa';
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
  document.getElementById('mf-nom').textContent = document.getElementById('cfg-nom').value || 'Papa';
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
    alert('Erreur lors de l\'envoi');
  }
};

// Check if URL has ?formulaire=1 (simulate public form link opening)
if (window.location.search.includes('formulaire=1')) {
  setTimeout(() => {
    document.getElementById('mf-nom').textContent = state.config.nom || 'Papa';
    document.getElementById('mf-msg').textContent = state.config.message || 'Votre présence est une grande consolation pour la famille.';
    openModal('modal-public-form');
  }, 1000); // give time for config to load from firebase
}

// Init UI
document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
renderDashboard();
generateShareLink();
