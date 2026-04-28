// =====================================================
// js/services.js — con Auth de clientes
// ✅ Verifica si hay sesión activa o invitada
// ✅ Auto-rellena nombre si el cliente está logueado
// ✅ Muestra avatar + nombre en el header
// ✅ 5 pasos completos con todos los campos
// =====================================================

import { db } from "./firebase-config.js";
import {
  collection, getDocs, addDoc,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// ─── Config del negocio ───────────────────────────────────────────────────────
const BUSINESS = {
  openHour:10, openMinute:30,
  closeHour:20, closeMinute:30,
  slotStep:30,
};

// ─── Emojis ───────────────────────────────────────────────────────────────────
const EMOJIS = {
  "shampoo":"🧴","depilacion cejas":"✨","depilación cejas":"✨",
  "cepillado":"💇","semi permanente":"💅","semipermanente":"💅",
  "cejas en henna":"🌿","acrilicas":"💎","acrílicas":"💎",
  "manicura tradicional":"🌸","manicura + pedicura":"🌸",
  "press on":"🎀","press-on":"🎀","pedicura tradicional":"🦶",
};
const emoji = n => EMOJIS[n?.toLowerCase().trim()] || "💅";

const fmtPrice = p => {
  if (!p) return "Consultar";
  const n = parseInt(String(p).replace(/\D/g,""),10);
  return isNaN(n) ? p : "$"+n.toLocaleString("es-CO");
};
const fmtDate = s => {
  if (!s) return "—";
  const [y,m,d] = s.split("-");
  const M=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} de ${M[parseInt(m)-1]} de ${y}`;
};
const fmtTime = t => {
  if (!t) return "—";
  const [h,m] = t.split(":").map(Number);
  return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"pm":"am"}`;
};

// ─── Slots ────────────────────────────────────────────────────────────────────
function genSlots() {
  const s=[]; let h=BUSINESS.openHour, m=BUSINESS.openMinute;
  while(h<BUSINESS.closeHour||(h===BUSINESS.closeHour&&m<BUSINESS.closeMinute)){
    s.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    m+=BUSINESS.slotStep; if(m>=60){m-=60;h++;}
  }
  return s;
}
const toMin = t => { const [h,m]=t.split(":").map(Number); return h*60+m; };
const isBlocked = (slot,res) => res.some(r=>{
  const s=toMin(r.time),e=s+(r.duration||30);
  return toMin(slot)>=s&&toMin(slot)<e;
});

// ─── Estado global ────────────────────────────────────────────────────────────
const bk = {
  serviceId:null, serviceName:null, servicePrice:null, serviceDuration:null,
  date:null, time:null,
  specialist:null, specialistId:null,
  clientName:null, clientPhone:null,
  payment:null,
};

let currentUser = null;
const isGuest   = sessionStorage.getItem("wsn-guest") === "true";

// ─── MAIN ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  // ── Guard: si no hay sesión ni invitado → al login ────────────────────────
  if (!isGuest) {
    const auth = getAuth();
    onAuthStateChanged(auth, user => {
      if (!user) {
        window.location.href = "index.html";
      } else {
        currentUser = user;
        renderClientNav(user);
      }
    });
  } else {
    renderGuestNav();
  }

  const grid       = document.getElementById("services-grid");
  const modal      = document.getElementById("reservation-modal");
  const backdrop   = document.getElementById("modal-backdrop");
  const closeBtn   = document.getElementById("close-modal");
  const modalTitle = document.getElementById("modal-service-name");
  const modalMeta  = document.getElementById("modal-service-meta");

  const TOTAL = 5;
  const stepEls  = Array.from({length:TOTAL},(_,i)=>document.getElementById(`step-${i+1}`));
  const stepDots = Array.from({length:TOTAL},(_,i)=>document.getElementById(`step-dot-${i+1}`));
  const stepOk   = document.getElementById("step-success");

  const dateInput   = document.getElementById("reservation-date");
  const timeSlotsEl = document.getElementById("time-slots");
  const staffListEl = document.getElementById("staff-list");
  const nameInput   = document.getElementById("client-name");
  const phoneInput  = document.getElementById("client-phone");
  const confirmBtn  = document.getElementById("confirm-reservation");
  const closeOk     = document.getElementById("close-success");

  const sumService    = document.getElementById("summary-service");
  const sumSpecialist = document.getElementById("summary-specialist");
  const sumDate       = document.getElementById("summary-date");
  const sumTime       = document.getElementById("summary-time");
  const sumClient     = document.getElementById("summary-client");
  const sumPayment    = document.getElementById("summary-payment");
  const sumPrice      = document.getElementById("summary-price");

  let staffMembers = [];

  // Fecha mínima hoy
  const now = new Date();
  dateInput.min = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  // ── Cargar staff ───────────────────────────────────────────────────────────
  async function loadStaff() {
    try {
      const snap = await getDocs(query(collection(db,"staff"),where("active","==",true)));
      staffMembers = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch(e) { staffMembers=[]; }
  }

  // ── Cargar servicios ───────────────────────────────────────────────────────
  async function loadServices() {
    try {
      const snap = await getDocs(query(collection(db,"services"),where("active","==",true)));
      grid.innerHTML="";
      if(snap.empty){ grid.innerHTML=`<p class="empty-msg">No hay servicios disponibles.</p>`; return; }
      snap.forEach(doc=>{
        const d=doc.data();
        const name=d.name||"Servicio", price=d.price||"", dur=d.duration||30, img=d.image||"";
        const card=document.createElement("div");
        card.className="card";
        card.innerHTML=`
          <div class="card-image-wrap">
            ${img?`<img src="${img}" alt="${name}" loading="lazy">`:`<div class="card-placeholder">${emoji(name)}</div>`}
          </div>
          <div class="card-body">
            <h3 class="card-name">${name}</h3>
            <div class="card-meta">
              <span class="card-price">${fmtPrice(price)}</span>
              ${dur?`<span class="card-sep"></span><span class="card-duration">~${dur} min</span>`:""}
            </div>
            <button class="card-btn">Reservar</button>
          </div>`;
        grid.appendChild(card);
        card.querySelector(".card-btn").onclick=()=>openModal(doc.id,name,price,dur);
      });
    } catch(e){
      grid.innerHTML=`<p class="empty-msg" style="color:var(--rose-deep)">Error cargando servicios.</p>`;
    }
  }

  // ── Abrir modal ────────────────────────────────────────────────────────────
  function openModal(id,name,price,duration){
    Object.assign(bk,{
      serviceId:id,serviceName:name,servicePrice:price,
      serviceDuration:Number(duration)||30,
      date:null,time:null,specialist:null,specialistId:null,
      clientName:null,clientPhone:null,payment:null,
    });
    modalTitle.textContent=name;
    modalMeta.textContent=`${fmtPrice(price)} · ~${duration} min`;
    dateInput.value="";
    timeSlotsEl.innerHTML=`<p class="slots-hint">Selecciona una fecha para ver los horarios.</p>`;

    // Auto-rellenar nombre si está logueada
    if(currentUser){
      nameInput.value = currentUser.displayName || currentUser.email.split("@")[0];
    } else {
      nameInput.value="";
    }
    phoneInput.value="";
    document.querySelectorAll("input[name='payment']").forEach(r=>r.checked=false);
    goTo(1);
    modal.style.display="flex";
    document.body.style.overflow="hidden";
  }

  function closeModal(){ modal.style.display="none"; document.body.style.overflow=""; }
  closeBtn?.addEventListener("click",closeModal);
  backdrop?.addEventListener("click",closeModal);
  closeOk?.addEventListener("click",closeModal);

  // ── Cambio de fecha → slots ────────────────────────────────────────────────
  dateInput?.addEventListener("change", async ()=>{
    const date=dateInput.value; if(!date) return;
    bk.date=date; bk.time=null;
    timeSlotsEl.innerHTML=`<div class="slots-loading">
      <div class="loading-spinner" style="width:20px;height:20px;margin:0 auto 8px;"></div>
      <p>Verificando disponibilidad...</p></div>`;
    try {
      const snap=await getDocs(query(
        collection(db,"reservations"),
        where("date","==",date),
        where("status","in",["pendiente","confirmada"])
      ));
      renderSlots(snap.docs.map(d=>({time:d.data().time,duration:d.data().duration||30})));
    } catch(e){
      timeSlotsEl.innerHTML=`<p class="slots-hint" style="color:var(--rose-deep)">Error verificando horarios.</p>`;
    }
  });

  function renderSlots(reserved){
    const all=genSlots();
    const n=new Date();
    const todayStr=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
    const isToday=bk.date===todayStr;
    const nowMin=n.getHours()*60+n.getMinutes();
    const closeMin=BUSINESS.closeHour*60+BUSINESS.closeMinute;
    timeSlotsEl.innerHTML="";
    let any=false;
    all.forEach(slot=>{
      const sm=toMin(slot);
      const ok=(sm+bk.serviceDuration)<=closeMin&&!(isToday&&sm<=nowMin+30)&&!isBlocked(slot,reserved);
      const btn=document.createElement("button");
      btn.className="time-slot"; btn.dataset.time=slot; btn.textContent=fmtTime(slot);
      if(!ok){btn.classList.add("taken");btn.disabled=true;}else any=true;
      timeSlotsEl.appendChild(btn);
    });
    if(!any){
      const p=document.createElement("p");
      p.className="slots-hint"; p.textContent="No hay horarios disponibles este día.";
      timeSlotsEl.appendChild(p);
    }
  }

  timeSlotsEl?.addEventListener("click",e=>{
    const slot=e.target.closest(".time-slot");
    if(!slot||slot.disabled) return;
    document.querySelectorAll(".time-slot").forEach(s=>s.classList.remove("selected"));
    slot.classList.add("selected"); bk.time=slot.dataset.time;
  });

  // ── Staff ──────────────────────────────────────────────────────────────────
  function renderStaff(){
    if(!staffListEl) return;
    staffListEl.innerHTML="";
    if(!staffMembers.length){
      staffListEl.innerHTML=`<p class="slots-hint">No hay especialistas disponibles.</p>`; return;
    }
    staffMembers.forEach(m=>{
      const lbl=document.createElement("label");
      lbl.className="staff-option";
      lbl.innerHTML=`
        <input type="radio" name="specialist" value="${m.id}" style="display:none;">
        <div class="staff-card">
          <div class="staff-avatar">
            ${m.photo?`<img src="${m.photo}" alt="${m.name}">`:`<span>${m.name.charAt(0)}</span>`}
          </div>
          <div class="staff-info">
            <span class="staff-name">${m.name}</span>
            <span class="staff-role">${m.role||"Especialista"}</span>
          </div>
          <div class="staff-check">✓</div>
        </div>`;
      staffListEl.appendChild(lbl);
      lbl.querySelector("input").onchange=()=>{
        document.querySelectorAll(".staff-card").forEach(c=>c.classList.remove("selected"));
        lbl.querySelector(".staff-card").classList.add("selected");
        bk.specialist=m.name; bk.specialistId=m.id;
      };
    });
    if(staffMembers.length===1){
      const r=staffListEl.querySelector("input");
      if(r){ r.checked=true; staffListEl.querySelector(".staff-card").classList.add("selected");
        bk.specialist=staffMembers[0].name; bk.specialistId=staffMembers[0].id; }
    }
  }

  // ── Navegación ─────────────────────────────────────────────────────────────
  function goTo(n){
    stepEls.forEach((s,i)=>s?.classList.toggle("hidden",i+1!==n));
    stepOk?.classList.add("hidden");
    stepDots.forEach((d,i)=>{
      d?.classList.remove("active","done");
      if(i+1===n) d?.classList.add("active");
      if(i+1<n)  d?.classList.add("done");
    });
    if(n===2) renderStaff();
  }

  document.getElementById("next-step-2")?.addEventListener("click",()=>{
    if(!bk.date){shake(dateInput);return;}
    if(!bk.time){shake(timeSlotsEl);return;}
    goTo(2);
  });
  document.getElementById("back-step-1")?.addEventListener("click",()=>goTo(1));

  document.getElementById("next-step-3")?.addEventListener("click",()=>{
    if(!bk.specialist){shake(staffListEl);return;}
    goTo(3);
  });
  document.getElementById("back-step-2")?.addEventListener("click",()=>goTo(2));

  document.getElementById("next-step-4")?.addEventListener("click",()=>{
    const name=nameInput.value.trim(), phone=phoneInput.value.trim();
    if(!name){shake(nameInput);return;}
    if(!phone){shake(phoneInput);return;}
    bk.clientName=name; bk.clientPhone=phone;
    goTo(4);
  });
  document.getElementById("back-step-3")?.addEventListener("click",()=>goTo(3));

  document.getElementById("next-step-5")?.addEventListener("click",()=>{
    const sel=document.querySelector("input[name='payment']:checked");
    if(!sel){shake(document.querySelector(".payment-options"));return;}
    bk.payment=sel.value;
    sumService.textContent    = bk.serviceName;
    sumSpecialist.textContent = bk.specialist;
    sumDate.textContent       = fmtDate(bk.date);
    sumTime.textContent       = fmtTime(bk.time);
    sumClient.textContent     = `${bk.clientName} · ${bk.clientPhone}`;
    sumPayment.textContent    = bk.payment==="efectivo"?"💵 Efectivo":"💳 Virtual";
    sumPrice.textContent      = fmtPrice(bk.servicePrice);
    goTo(5);
  });
  document.getElementById("back-step-4")?.addEventListener("click",()=>goTo(4));

  // ── Confirmar ──────────────────────────────────────────────────────────────
  confirmBtn?.addEventListener("click", async ()=>{
    confirmBtn.textContent="Guardando..."; confirmBtn.disabled=true;
    try {
      await addDoc(collection(db,"reservations"),{
        serviceId:    bk.serviceId,
        service:      bk.serviceName,
        duration:     bk.serviceDuration,
        date:         bk.date,
        time:         bk.time,
        specialist:   bk.specialist,
        specialistId: bk.specialistId,
        clientName:   bk.clientName,
        phone:        bk.clientPhone,
        userEmail:    currentUser?.email || "invitada",
        userId:       currentUser?.uid   || "guest",
        payment:      bk.payment,
        status:       "pendiente",
        createdAt:    serverTimestamp(),
      });
      stepEls.forEach(s=>s?.classList.add("hidden"));
      stepOk?.classList.remove("hidden");
      stepDots.forEach(d=>{d?.classList.remove("active");d?.classList.add("done");});
    } catch(e){
      console.error(e);
      alert("Error al guardar la reserva. Intenta de nuevo.");
    } finally {
      confirmBtn.textContent="Confirmar cita ✓"; confirmBtn.disabled=false;
    }
  });

  // ── Shake ──────────────────────────────────────────────────────────────────
  function shake(el){
    if(!el) return;
    el.style.animation="none"; el.offsetHeight;
    el.style.animation="shake 0.35s ease";
    el.addEventListener("animationend",()=>{el.style.animation="";},{once:true});
  }

  // ── Estilos dinámicos ──────────────────────────────────────────────────────
  const st=document.createElement("style");
  st.textContent=`
    @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
    .slots-hint{grid-column:1/-1;font-size:13px;color:var(--text-light);text-align:center;padding:12px 0;font-weight:300}
    .slots-loading{grid-column:1/-1;text-align:center;font-size:12px;color:var(--text-light);padding:12px 0}
    .empty-msg{grid-column:1/-1;text-align:center;color:var(--text-light);padding:60px 0;font-size:14px}
    .staff-list{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
    .staff-option{cursor:pointer}
    .staff-card{display:flex;align-items:center;gap:14px;padding:14px 16px;border:2px solid rgba(212,184,150,0.25);border-radius:var(--radius-md);background:var(--nude-pale);transition:border-color var(--transition),background var(--transition),transform var(--transition);position:relative}
    .staff-card:hover{border-color:var(--rose);background:var(--rose-pale);transform:translateY(-1px)}
    .staff-card.selected{border-color:var(--rose-deep);background:var(--rose-pale);box-shadow:0 0 0 3px rgba(201,123,138,0.12)}
    .staff-avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--rose-soft),var(--nude-pale));border:2px solid var(--rose-soft);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;font-family:var(--font-display);font-size:22px;color:var(--rose-deep)}
    .staff-avatar img{width:100%;height:100%;object-fit:cover}
    .staff-info{display:flex;flex-direction:column;gap:2px;flex:1}
    .staff-name{font-family:var(--font-display);font-size:18px;font-weight:400;color:var(--text-dark)}
    .staff-role{font-size:12px;color:var(--text-light);font-weight:300}
    .staff-check{width:24px;height:24px;border-radius:50%;background:var(--rose-deep);color:white;display:none;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
    .staff-card.selected .staff-check{display:flex}
  `;
  document.head.appendChild(st);

  loadStaff();
  loadServices();
});

// ── Header nav helpers ─────────────────────────────────────────────────────────
function renderClientNav(user) {
  const slot = document.getElementById("client-nav-slot");
  if (!slot) return;
  const name = user.displayName || user.email.split("@")[0];
  slot.innerHTML = `
    <a href="profile.html" style="display:flex;align-items:center;gap:8px;text-decoration:none;">
      <span class="client-name-nav">${name}</span>
      <div class="client-avatar">
        ${user.photoURL
          ? `<img src="${user.photoURL}" alt="${name}">`
          : name.charAt(0).toUpperCase()}
      </div>
    </a>`;
}

function renderGuestNav() {
  const slot = document.getElementById("client-nav-slot");
  if (!slot) return;
  slot.innerHTML = `
    <span class="guest-nav-badge">
      Invitada · <a href="index.html">Inicia sesión</a>
    </span>`;
}
