// =====================================================
// js/services.js — Fase 3
// ✅ Todo lo de Fase 2 +
// ✅ Paso de selección de especialista
// ✅ Auto-selección si solo hay una persona
// ✅ Guarda specialist en la reserva
// =====================================================

import { db } from "./firebase-config.js";
import {
  collection, getDocs, addDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ─── Configuración del negocio ───────────────────────────────────────────────
const BUSINESS = {
  openHour: 10, openMinute: 30,
  closeHour: 20, closeMinute: 30,
  slotStep: 30,
};

// ─── Emojis por servicio ─────────────────────────────────────────────────────
const SERVICE_EMOJIS = {
  "shampoo":"🧴","depilacion cejas":"✨","depilación cejas":"✨",
  "cepillado":"💇","semi permanente":"💅","semipermanente":"💅",
  "cejas en henna":"🌿","acrilicas":"💎","acrílicas":"💎",
  "manicura tradicional":"🌸","manicura + pedicura":"🌸",
  "press on":"🎀","press-on":"🎀","pedicura tradicional":"🦶",
};
const getEmoji = (name="") => SERVICE_EMOJIS[name.toLowerCase().trim()] || "💅";

const formatPrice = (p) => {
  if (!p) return "Consultar";
  const n = parseInt(String(p).replace(/\D/g,""),10);
  return isNaN(n) ? p : "$" + n.toLocaleString("es-CO");
};
const formatDate = (s) => {
  if (!s) return "—";
  const [y,m,d] = s.split("-");
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} de ${M[parseInt(m)-1]} de ${y}`;
};
const formatTime = (t) => {
  if (!t) return "—";
  const [h,m] = t.split(":").map(Number);
  return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"pm":"am"}`;
};

// ─── Helpers de slots ─────────────────────────────────────────────────────────
function generateSlots() {
  const s = []; let h = BUSINESS.openHour, m = BUSINESS.openMinute;
  while (h < BUSINESS.closeHour || (h===BUSINESS.closeHour && m<BUSINESS.closeMinute)) {
    s.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    m += BUSINESS.slotStep; if (m>=60){m-=60;h++;}
  }
  return s;
}
const toMin = (t) => { const [h,m]=t.split(":").map(Number); return h*60+m; };
const isBlocked = (slot, reservations) => reservations.some(r => {
  const start=toMin(r.time), end=start+(r.duration||30);
  return toMin(slot)>=start && toMin(slot)<end;
});

// ─── Estado global ────────────────────────────────────────────────────────────
const booking = {
  serviceId:null, serviceName:null, servicePrice:null, serviceDuration:null,
  date:null, time:null, payment:null, specialist:null, specialistId:null,
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  const grid       = document.getElementById("services-grid");
  const modal      = document.getElementById("reservation-modal");
  const backdrop   = document.getElementById("modal-backdrop");
  const closeBtn   = document.getElementById("close-modal");
  const modalTitle = document.getElementById("modal-service-name");
  const modalMeta  = document.getElementById("modal-service-meta");

  // 4 pasos ahora: 1-fecha/hora, 2-especialista, 3-pago, 4-confirmar
  const stepEls   = [1,2,3,4].map(n=>document.getElementById(`step-${n}`));
  const stepDots  = [1,2,3,4].map(n=>document.getElementById(`step-dot-${n}`));
  const stepSuccess = document.getElementById("step-success");

  const dateInput   = document.getElementById("reservation-date");
  const timeSlotsEl = document.getElementById("time-slots");

  // Navegación
  const next2 = document.getElementById("next-step-2");
  const back1 = document.getElementById("back-step-1");
  const next3 = document.getElementById("next-step-3");
  const back2 = document.getElementById("back-step-2");
  const next4 = document.getElementById("next-step-4");
  const back3 = document.getElementById("back-step-3");
  const confirmBtn  = document.getElementById("confirm-reservation");
  const closeSuccess= document.getElementById("close-success");

  // Resumen
  const sumService   = document.getElementById("summary-service");
  const sumDate      = document.getElementById("summary-date");
  const sumTime      = document.getElementById("summary-time");
  const sumSpecialist= document.getElementById("summary-specialist");
  const sumPayment   = document.getElementById("summary-payment");
  const sumPrice     = document.getElementById("summary-price");

  // Staff list container
  const staffListEl = document.getElementById("staff-list");

  let staffMembers = []; // cache del staff

  // Fecha mínima = hoy
  const now = new Date();
  dateInput.min = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  // ── Cargar staff al iniciar ────────────────────────────────────────────────
  async function loadStaff() {
    try {
      const snap = await getDocs(
        query(collection(db,"staff"), where("active","==",true))
      );
      staffMembers = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch(err) {
      console.error("Error cargando staff:", err);
      staffMembers = [];
    }
  }

  // ── Cargar servicios ───────────────────────────────────────────────────────
  async function loadServices() {
    try {
      const snap = await getDocs(
        query(collection(db,"services"), where("active","==",true))
      );
      grid.innerHTML = "";
      if (snap.empty) {
        grid.innerHTML = `<p class="empty-msg">No hay servicios disponibles.</p>`; return;
      }
      snap.forEach(doc => {
        const data = doc.data();
        const name     = data.name     || "Servicio";
        const price    = data.price    || "";
        const duration = data.duration || 30;
        const image    = data.image    || "";
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <div class="card-image-wrap">
            ${image
              ? `<img src="${image}" alt="${name}" loading="lazy">`
              : `<div class="card-placeholder">${getEmoji(name)}</div>`}
          </div>
          <div class="card-body">
            <h3 class="card-name">${name}</h3>
            <div class="card-meta">
              <span class="card-price">${formatPrice(price)}</span>
              ${duration?`<span class="card-sep"></span><span class="card-duration">~${duration} min</span>`:""}
            </div>
            <button class="card-btn">Reservar</button>
          </div>`;
        grid.appendChild(card);
        card.querySelector(".card-btn").addEventListener("click", ()=>
          openModal(doc.id, name, price, duration)
        );
      });
    } catch(err) {
      grid.innerHTML = `<p class="empty-msg" style="color:var(--rose-deep)">Error cargando servicios.</p>`;
    }
  }

  // ── Abrir modal ────────────────────────────────────────────────────────────
  function openModal(id, name, price, duration) {
    Object.assign(booking, {
      serviceId:id, serviceName:name, servicePrice:price,
      serviceDuration:Number(duration)||30,
      date:null, time:null, payment:null, specialist:null, specialistId:null,
    });
    modalTitle.textContent = name;
    modalMeta.textContent  = `${formatPrice(price)} · ~${duration} min`;
    dateInput.value = "";
    timeSlotsEl.innerHTML = `<p class="slots-hint">Selecciona una fecha para ver los horarios.</p>`;
    document.querySelectorAll("input[name='payment']").forEach(r=>r.checked=false);
    goToStep(1);
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }
  closeBtn?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", closeModal);
  closeSuccess?.addEventListener("click", closeModal);

  // ── Cambio de fecha ────────────────────────────────────────────────────────
  dateInput?.addEventListener("change", async () => {
    const date = dateInput.value; if (!date) return;
    booking.date = date; booking.time = null;
    timeSlotsEl.innerHTML = `<div class="slots-loading">
      <div class="loading-spinner" style="width:20px;height:20px;margin:0 auto 8px;"></div>
      <p>Verificando disponibilidad...</p></div>`;
    try {
      const snap = await getDocs(query(
        collection(db,"reservations"),
        where("date","==",date),
        where("status","in",["pendiente","confirmada"])
      ));
      renderSlots(snap.docs.map(d=>({time:d.data().time, duration:d.data().duration||30})));
    } catch(err) {
      timeSlotsEl.innerHTML = `<p class="slots-hint" style="color:var(--rose-deep)">Error verificando horarios.</p>`;
    }
  });

  // ── Renderizar slots ───────────────────────────────────────────────────────
  function renderSlots(reserved) {
    const all = generateSlots();
    const n = new Date();
    const todayStr = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
    const isToday = booking.date === todayStr;
    const nowMin  = n.getHours()*60+n.getMinutes();
    const closeMin= BUSINESS.closeHour*60+BUSINESS.closeMinute;
    timeSlotsEl.innerHTML = "";
    let any = false;
    all.forEach(slot => {
      const sm = toMin(slot);
      const ok = (sm+booking.serviceDuration)<=closeMin && !(isToday && sm<=nowMin+30) && !isBlocked(slot,reserved);
      const btn = document.createElement("button");
      btn.className="time-slot"; btn.dataset.time=slot; btn.textContent=formatTime(slot);
      if (!ok) { btn.classList.add("taken"); btn.disabled=true; } else any=true;
      timeSlotsEl.appendChild(btn);
    });
    if (!any) {
      const p = document.createElement("p");
      p.className="slots-hint"; p.textContent="No hay horarios disponibles este día.";
      timeSlotsEl.appendChild(p);
    }
  }

  // ── Click en slot ──────────────────────────────────────────────────────────
  timeSlotsEl?.addEventListener("click", e=>{
    const slot=e.target.closest(".time-slot");
    if (!slot||slot.disabled) return;
    document.querySelectorAll(".time-slot").forEach(s=>s.classList.remove("selected"));
    slot.classList.add("selected"); booking.time=slot.dataset.time;
  });

  // ── Renderizar staff ───────────────────────────────────────────────────────
  function renderStaff() {
    if (!staffListEl) return;
    staffListEl.innerHTML = "";

    if (staffMembers.length === 0) {
      staffListEl.innerHTML = `<p class="slots-hint">No hay especialistas disponibles.</p>`;
      return;
    }

    staffMembers.forEach(member => {
      const card = document.createElement("label");
      card.className = "staff-option";
      card.innerHTML = `
        <input type="radio" name="specialist" value="${member.id}" style="display:none;">
        <div class="staff-card">
          <div class="staff-avatar">
            ${member.photo
              ? `<img src="${member.photo}" alt="${member.name}">`
              : `<span>${member.name.charAt(0)}</span>`}
          </div>
          <div class="staff-info">
            <span class="staff-name">${member.name}</span>
            <span class="staff-role">${member.role || "Especialista"}</span>
          </div>
          <div class="staff-check">✓</div>
        </div>`;
      staffListEl.appendChild(card);
      card.querySelector("input").addEventListener("change", () => {
        document.querySelectorAll(".staff-card").forEach(c=>c.classList.remove("selected"));
        card.querySelector(".staff-card").classList.add("selected");
        booking.specialist   = member.name;
        booking.specialistId = member.id;
      });
    });

    // Auto-seleccionar si solo hay una persona
    if (staffMembers.length === 1) {
      const radio = staffListEl.querySelector("input[type='radio']");
      if (radio) {
        radio.checked = true;
        staffListEl.querySelector(".staff-card").classList.add("selected");
        booking.specialist   = staffMembers[0].name;
        booking.specialistId = staffMembers[0].id;
      }
    }
  }

  // ── Navegación ─────────────────────────────────────────────────────────────
  function goToStep(n) {
    stepEls.forEach((s,i)=>s?.classList.toggle("hidden",i+1!==n));
    stepSuccess?.classList.add("hidden");
    stepDots.forEach((d,i)=>{
      d?.classList.remove("active","done");
      if (i+1===n) d?.classList.add("active");
      if (i+1<n)  d?.classList.add("done");
    });
    // Al llegar al paso de staff, renderizarlo
    if (n===2) renderStaff();
  }

  // 1 → 2
  next2?.addEventListener("click", ()=>{
    if (!booking.date) { shake(dateInput); return; }
    if (!booking.time) { shake(timeSlotsEl); return; }
    goToStep(2);
  });
  back1?.addEventListener("click", ()=>goToStep(1));

  // 2 → 3
  next3?.addEventListener("click", ()=>{
    if (!booking.specialist) { shake(staffListEl); return; }
    goToStep(3);
  });
  back2?.addEventListener("click", ()=>goToStep(2));

  // 3 → 4
  next4?.addEventListener("click", ()=>{
    const sel = document.querySelector("input[name='payment']:checked");
    if (!sel) { shake(document.querySelector(".payment-options")); return; }
    booking.payment = sel.value;
    sumService.textContent    = booking.serviceName;
    sumDate.textContent       = formatDate(booking.date);
    sumTime.textContent       = formatTime(booking.time);
    sumSpecialist.textContent = booking.specialist;
    sumPayment.textContent    = booking.payment==="efectivo" ? "💵 Efectivo" : "💳 Virtual (Nequi/Transferencia)";
    sumPrice.textContent      = formatPrice(booking.servicePrice);
    goToStep(4);
  });
  back3?.addEventListener("click", ()=>goToStep(3));

  // ── Confirmar reserva ──────────────────────────────────────────────────────
  confirmBtn?.addEventListener("click", async ()=>{
    confirmBtn.textContent="Guardando..."; confirmBtn.disabled=true;
    try {
      await addDoc(collection(db,"reservations"),{
        serviceId:    booking.serviceId,
        service:      booking.serviceName,
        duration:     booking.serviceDuration,
        date:         booking.date,
        time:         booking.time,
        payment:      booking.payment,
        specialist:   booking.specialist,
        specialistId: booking.specialistId,
        status:       "pendiente",
        createdAt:    serverTimestamp(),
      });
      stepEls.forEach(s=>s?.classList.add("hidden"));
      stepSuccess?.classList.remove("hidden");
      stepDots.forEach(d=>{d?.classList.remove("active");d?.classList.add("done");});
    } catch(err) {
      console.error(err);
      alert("Error al guardar la reserva. Intenta de nuevo.");
    } finally {
      confirmBtn.textContent="Confirmar cita ✓"; confirmBtn.disabled=false;
    }
  });

  // ── Shake ──────────────────────────────────────────────────────────────────
  function shake(el) {
    if (!el) return;
    el.style.animation="none"; el.offsetHeight;
    el.style.animation="shake 0.35s ease";
    el.addEventListener("animationend",()=>{el.style.animation="";},{once:true});
  }

  // ── Estilos dinámicos ──────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    @keyframes shake {
      0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)}
      40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
    }
    .slots-hint { grid-column:1/-1;font-size:13px;color:var(--text-light);text-align:center;padding:12px 0;font-weight:300; }
    .slots-loading { grid-column:1/-1;text-align:center;font-size:12px;color:var(--text-light);padding:12px 0; }
    .empty-msg { grid-column:1/-1;text-align:center;color:var(--text-light);padding:60px 0;font-size:14px; }

    /* Staff cards */
    .staff-list { display:flex; flex-direction:column; gap:10px; margin-bottom:20px; }
    .staff-option { cursor:pointer; }
    .staff-card {
      display:flex; align-items:center; gap:14px;
      padding:14px 16px;
      border:2px solid rgba(212,184,150,0.25);
      border-radius:var(--radius-md);
      background:var(--nude-pale);
      transition:border-color var(--transition), background var(--transition), transform var(--transition);
      position:relative;
    }
    .staff-card:hover { border-color:var(--rose); background:var(--rose-pale); transform:translateY(-1px); }
    .staff-card.selected {
      border-color:var(--rose-deep); background:var(--rose-pale);
      box-shadow:0 0 0 3px rgba(201,123,138,0.12);
    }
    .staff-avatar {
      width:48px; height:48px; border-radius:50%;
      background:linear-gradient(135deg,var(--rose-soft),var(--nude-pale));
      border:2px solid var(--rose-soft);
      display:flex; align-items:center; justify-content:center;
      overflow:hidden; flex-shrink:0;
      font-family:var(--font-display); font-size:22px; color:var(--rose-deep);
    }
    .staff-avatar img { width:100%; height:100%; object-fit:cover; }
    .staff-info { display:flex; flex-direction:column; gap:2px; flex:1; }
    .staff-name { font-family:var(--font-display); font-size:18px; font-weight:400; color:var(--text-dark); }
    .staff-role { font-size:12px; color:var(--text-light); font-weight:300; }
    .staff-check {
      width:24px; height:24px; border-radius:50%;
      background:var(--rose-deep); color:white;
      display:none; align-items:center; justify-content:center;
      font-size:12px; flex-shrink:0;
    }
    .staff-card.selected .staff-check { display:flex; }
  `;
  document.head.appendChild(style);

  // ── Iniciar ────────────────────────────────────────────────────────────────
  loadStaff();
  loadServices();
});
