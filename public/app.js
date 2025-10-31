// === MIRANO RP FRONT JS — corrigé ===

// --- Utils ---
async function jget(u){ const r=await fetch(u); return r.json(); }
async function jpost(u,d){ const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d||{})}); try{return await r.json()}catch{return{ok:false}}}
async function jdel(u){ const r=await fetch(u,{method:'DELETE'}); try{return await r.json()}catch{return{ok:false}}}

// --- Toast system ---
(function ensureToast(){
  if(!document.querySelector('.toast-wrap')){
    const d=document.createElement('div');
    d.className='toast-wrap';
    document.body.appendChild(d);
  }
})();
function toast(msg, kind){
  const root=document.querySelector('.toast-wrap');
  const t=document.createElement('div');
  t.className='toast'+(kind?' '+kind:'');
  t.textContent=msg;
  root.appendChild(t);
  setTimeout(()=>{ t.classList.add('fade'); setTimeout(()=>t.remove(),300); }, 6000);
}

// --- Hover gradient ---
document.addEventListener('mousemove',(e)=>{
  const btn = e.target.closest?.('.btn'); if(!btn) return;
  const r = btn.getBoundingClientRect();
  btn.style.setProperty('--x', `${e.clientX - r.left}px`);
  btn.style.setProperty('--y', `${e.clientY - r.top}px`);
});

// --- Header + connexion ---
async function initHeader(){
  const loginBtn = document.querySelector('[data-login-btn]');
  const dashBtn  = document.querySelector('[data-dashboard-btn]');
  const resBtn   = document.querySelector('[data-results-btn]');
  const userMenu = document.querySelector('.user-menu');
  const userTrig = document.getElementById('userTrigger');
  const userPop  = document.getElementById('userPop');
  const logout   = document.getElementById('logoutBtn');
  const uname    = document.getElementById('usernameSlot');

  const me = await jget('/api/me');
  const logged = !!me.user;

  // gestion affichage boutons
  if (loginBtn) loginBtn.classList.toggle('hide', logged);
  if (dashBtn)  dashBtn.classList.toggle('hide', !logged);
  if (userMenu) userMenu.classList.toggle('hide', !logged);

  if (uname) uname.textContent = logged ? '@'+me.user.username : '@invité';

  if (resBtn) {
    if (!logged) resBtn.classList.add('hide');
    else {
      const adm = await jget('/api/is-admin');
      resBtn.classList.toggle('hide', !adm.isAdmin);
    }
  }

  // menu utilisateur
  if (userTrig && userPop) {
    userTrig.addEventListener('click', ()=> userPop.style.display = (userPop.style.display==='block'?'none':'block'));
    document.addEventListener('click',(e)=>{
      if (!userPop.contains(e.target) && !userTrig.contains(e.target)) userPop.style.display='none';
    });
  }

  if (logout) logout.addEventListener('click', async ()=>{
    await fetch('/auth/logout',{method:'POST'});
    location.href='/';
  });

  // liens privés
  const privateLinks = document.querySelectorAll('a[href="/dashboard.html"]');
  privateLinks.forEach(a=>{
    a.addEventListener('click', async (e)=>{
      const me2 = await jget('/api/me');
      if (!me2.user) {
        e.preventDefault();
        toast('🔐 Connecte-toi avec Discord pour accéder à ton espace privé.', 'bad');
      }
    });
  });

  // logo → accueil
  const logo = document.querySelector('.logo');
  const title = document.querySelector('.title');
  [logo, title].forEach(el=>{
    if (el) el.addEventListener('click', ()=> location.href='/');
  });
}

// --- Formulaire candidature ---
function initForm(){
  const f=document.getElementById('application-form');
  if(!f) return;
  f.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    const me = await jget('/api/me');
    if(!me.user){
      toast('❌ Connecte-toi avec Discord avant d’envoyer.','bad');
      return;
    }
    const res = await jpost('/api/apply', data);
    if (res.success) {
      toast('✅ Candidature envoyée !','good');
      setTimeout(()=>location.href='/dashboard.html',700);
    } else toast('❌ Erreur lors de l’envoi.','bad');
  });
}

// --- Chat flottant ---
function createChatFloat(){
  if (document.querySelector('.chat-float')) return document.querySelector('.chat-float');
  const wrap = document.createElement('div');
  wrap.className = 'chat-float';
  wrap.innerHTML = `
    <div class="chat-header" id="chatDrag">
      <div class="chat-title">Chat</div>
      <button class="chat-close" aria-label="Fermer">✕</button>
    </div>
    <div class="chat-body">
      <div class="log" id="chatLog"></div>
      <div class="input-row">
        <input class="input" id="chatInput" type="text" placeholder="Écrire un message…" />
        <button class="btn" id="chatSend">Envoyer</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  return wrap;
}
function makeDraggable(box, handle){
  let x=0,y=0,ox=0,oy=0,drag=false;
  handle.addEventListener('mousedown', (e)=>{
    drag=true; ox=e.clientX; oy=e.clientY;
    const r=box.getBoundingClientRect(); x=r.left; y=r.top;
    document.body.style.userSelect='none';
  });
  document.addEventListener('mousemove', (e)=>{
    if(!drag) return;
    const dx=e.clientX-ox, dy=e.clientY-oy;
    box.style.left=(x+dx)+'px'; box.style.top=(y+dy)+'px';
    box.style.position='fixed';
  });
  document.addEventListener('mouseup', ()=>{ drag=false; document.body.style.userSelect=''; });
}
function renderMsg(log, m, isYou){
  const p=document.createElement('div');
  p.className='msg'+(isYou?' you':'');
  p.innerHTML = `<strong>${m.userName||'Utilisateur'}</strong><br>${m.content}`;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

// --- Dashboard utilisateur ---
async function initDashboard(){
  const listContainer = document.getElementById('my-applications-cards');
  if (!listContainer) return;

  const me = await jget('/api/me');
  if(!me.user){ toast('Connecte-toi avec Discord','bad'); location.href='/'; return; }

  const apps = await jget('/api/my-applications');
  listContainer.innerHTML = '';
  if (!apps.length){
    listContainer.innerHTML = '<div class="muted">Aucune candidature pour l’instant.</div>';
    return;
  }

  const socket = io();
  let currentChatApp = null;

  apps.forEach(app=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '12px';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div>
          <div style="font-weight:800">${app.discord_tag || '-'}</div>
          <div class="muted" style="opacity:.8">${new Date(app.created_at).toLocaleString()}</div>
        </div>
        <div class="status ${app.status.replace(' ','_')}">${app.status}</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;position:relative">
        <button class="btn small" data-show>Afficher</button>
        <button class="btn small" data-chat>Chat</button>
        <button class="btn small ghost" data-del>Supprimer</button>
      </div>
    `;
    card.querySelector('[data-show]').addEventListener('click', ()=> showDetailModal(app));
    card.querySelector('[data-chat]').addEventListener('click', ()=> openChat(app));
    card.querySelector('[data-del]').addEventListener('click', async ()=>{
      if (!confirm('Supprimer cette candidature ?')) return;
      const r = await jdel(`/api/admin/delete/${app._id}`); // route corrigée
      if (r.success){ toast('🗑️ Supprimée','good'); initDashboard(); }
      else toast('❌ Action refusée','bad');
    });
    listContainer.appendChild(card);
  });

  // --- Détail candidature ---
  function showDetailModal(app){
    const modal = document.createElement('div');
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:9997';
    modal.innerHTML = `
      <div class="card" style="max-width:700px;width:94%;position:relative">
        <button class="btn small" id="closeDetail" style="position:absolute;right:10px;top:10px">✕</button>
        <h3>Détail de la candidature</h3>
        <dl style="display:grid;grid-template-columns:180px 1fr;gap:8px;margin:0">
          <dt>Envoyée le</dt><dd>${new Date(app.created_at).toLocaleString()}</dd>
          <dt>Discord Tag</dt><dd>${app.discord_tag||'-'}</dd>
          <dt>Âge</dt><dd>${app.age ?? '-'}</dd>
          <dt>Disponibilités</dt><dd>${app.availability ?? '-'}</dd>
          <dt>Expérience RP</dt><dd>${app.rp_experience ?? '-'}</dd>
          <dt>Exp. Modération</dt><dd>${app.mod_experience ?? '-'}</dd>
          <dt>Motivations</dt><dd>${app.motivations ?? '-'}</dd>
          <dt>Points à améliorer</dt><dd>${app.improvements ?? '-'}</dd>
          <dt>Message</dt><dd>${app.message ?? '-'}</dd>
        </dl>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#closeDetail').addEventListener('click', ()=> modal.remove());
    modal.addEventListener('click',(e)=>{ if(e.target===modal) modal.remove(); });
  }

  // --- Chat ---
  const chatAudio = new Audio('/sounds/ding.mp3');
  function playDing(){chatAudio.currentTime=0;chatAudio.play().catch(()=>{});}

  async function openChat(app){
    currentChatApp = app;
    const box = createChatFloat();
    const drag = box.querySelector('#chatDrag');
    const close = box.querySelector('.chat-close');
    const log = box.querySelector('#chatLog');
    const input = box.querySelector('#chatInput');
    const sendBtn = box.querySelector('#chatSend');

    log.innerHTML = '';
    box.style.display = 'block';
    makeDraggable(box, drag);

    socket.emit('leaveRoom', { appId: app._id });
    socket.emit('joinRoom', { appId: app._id });

    const hist = await jget(`/api/messages/${app._id}`);
    hist.forEach(m=> renderMsg(log, m, m.userId === me.user.id));

    socket.off('chatMessage'); // pour éviter doublons
    socket.on('chatMessage',(msg)=>{
      if(!currentChatApp || msg.appId !== currentChatApp._id) return;
      renderMsg(log, msg, msg.userId === me.user.id);
      if(!document.hasFocus()) playDing();
    });

    sendBtn.onclick = ()=>{
      const txt=(input.value||'').trim();
      if(!txt) return;
      socket.emit('chatMessage',{ appId: app._id, userId: me.user.id, userName: me.user.username, content: txt });
      input.value='';
    };
    close.onclick = ()=>{
      socket.emit('leaveRoom', { appId: app._id });
      box.style.display='none';
    };
  }
}

// --- Boot ---
window.addEventListener('DOMContentLoaded', async ()=>{
  await initHeader();
  initForm();
  initDashboard();
});
