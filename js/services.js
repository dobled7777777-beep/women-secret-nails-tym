// =====================================================
// js/services.js — CORREGIDO
// FIX 1: nav siempre muestra Inicio + Trabaja con nosotras
// FIX 2: guest flow — el modal funciona sin login
// FIX 3: cuando guest inicia sesión el nav se actualiza
//        correctamente y no queda "pegado"
// =====================================================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, query, where,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  notifyAdminEmail,
  notifyAdminWhatsApp,
  buildComprobanteWhatsAppUrl,
} from "./notifications.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Configuración del negocio
// ─────────────────────────────────────────────────────────────────────────────
const BUSINESS = {
  openHour: 10, openMinute: 30,
  closeHour: 20, closeMinute: 30,
  slotStep: 30,
};
const ADMIN_EMAIL = "tatismahecha01@gmail.com";
const WALLET_PHONE = "3017886217";

const EMOJIS = {
  "shampoo":"🧴","depilacion cejas":"✨","depilación cejas":"✨",
  "cepillado":"💇","semi permanente":"💅","semipermanente":"💅",
  "cejas en henna":"🌿","acrilicas":"💎","acrílicas":"💎",
  "manicura tradicional":"🌸","manicura + pedicura":"🌸",
  "press on":"🎀","press-on":"🎀","pedicura tradicional":"🦶",
};

const emoji    = n => EMOJIS[n?.toLowerCase().trim()] || "💅";
const fmtPrice = p => {
  if (!p) return "Consultar";
  const n = parseInt(String(p).replace(/\D/g, ""), 10);
  return isNaN(n) ? p : "$" + n.toLocaleString("es-CO");
};
const fmtDate = s => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} de ${M[parseInt(m) - 1]} de ${y}`;
};
const fmtTime = t => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

function genSlots() {
  const s = []; let h = BUSINESS.openHour, m = BUSINESS.openMinute;
  while (h < BUSINESS.closeHour || (h === BUSINESS.closeHour && m < BUSINESS.closeMinute)) {
    s.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += BUSINESS.slotStep;
    if (m >= 60) { m -= 60; h++; }
  }
  return s;
}
const toMin     = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const isBlocked = (slot, res) => res.some(r => {
  const s = toMin(r.time), e = s + (r.duration || 30);
  return toMin(slot) >= s && toMin(slot) < e;
});

// ─────────────────────────────────────────────────────────────────────────────
//  Estado global
// ─────────────────────────────────────────────────────────────────────────────
const bk = {
  serviceId: null, serviceName: null, servicePrice: null, serviceDuration: null,
  date: null, time: null, specialist: null, specialistId: null,
  clientName: null, clientPhone: null, payment: null,
};

let currentUser   = null;
let staffMembers  = [];
let unsubServices = null;
let unsubSlots    = null;

// ─────────────────────────────────────────────────────────────────────────────
//  NAV — renderiza según estado de auth
//  FIX: siempre se llama, independiente de si es guest o no.
//  FIX: limpia sessionStorage de guest cuando hay user real.
// ─────────────────────────────────────────────────────────────────────────────
function renderNav(user) {
  const slot = document.getElementById("client-nav-slot");
  if (!slot) return;

  if (user) {
    // Usuario autenticado → limpiar flag de invitada si quedó pegado
    sessionStorage.removeItem("wsn-guest");
    currentUser = user;
    const name = user.displayName || user.email.split("@")[0];
    const isAdmin = user.email?.toLowerCase() === ADMIN_EMAIL;
    slot.innerHTML = `
      <span class="client-nav">
        ${isAdmin ? `<a href="admin.html" class="admin-nav-link">Admin</a>` : ""}
        <a href="profile.html"
           style="display:flex;align-items:center;gap:8px;text-decoration:none;">
          <span class="client-name-nav">${name}</span>
          <div class="client-avatar">
            ${user.photoURL
              ? `<img src="${user.photoURL}" alt="${name}">`
              : name.charAt(0).toUpperCase()}
          </div>
        </a>
      </span>`;
  } else {
    // Sin sesión: puede ser invitada o anónima
    const isGuest = sessionStorage.getItem("wsn-guest") === "true";
    if (isGuest) {
      slot.innerHTML = `
        <span class="guest-nav-badge">
          Invitada ·
          <a href="login.html">Inicia sesión</a>
        </span>`;
    } else {
      // No hay sesión ni flag de guest → redirigir al login
      window.location.replace("login.html");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT principal
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  const auth = getAuth();

  // FIX CLAVE: onAuthStateChanged se llama SIEMPRE.
  // Ya no está dentro de un if(!isGuest) — eso era lo que causaba que
  // el nav quedara pegado al iniciar sesión después de ser invitada.
  onAuthStateChanged(auth, user => {
    renderNav(user);

    // Guard: si no hay user ni flag de guest, redirigir (ya lo hace renderNav)
    const isGuest = sessionStorage.getItem("wsn-guest") === "true";
    if (!user && !isGuest) return; // renderNav ya redirigió
  });

  // ── Referencias DOM ──────────────────────────────────────────────────────
  const grid       = document.getElementById("services-grid");
  const modal      = document.getElementById("reservation-modal");
  const backdrop   = document.getElementById("modal-backdrop");
  const closeBtn   = document.getElementById("close-modal");
  const modalTitle = document.getElementById("modal-service-name");
  const modalMeta  = document.getElementById("modal-service-meta");

  const TOTAL    = 5;
  const stepEls  = Array.from({length: TOTAL}, (_, i) => document.getElementById(`step-${i + 1}`));
  const stepDots = Array.from({length: TOTAL}, (_, i) => document.getElementById(`step-dot-${i + 1}`));
  const stepOk   = document.getElementById("step-success");

  const dateInput    = document.getElementById("reservation-date");
  const dateTrigger  = document.getElementById("date-trigger");
  const dateValue    = document.getElementById("date-trigger-value");
  const calendarPop  = document.getElementById("calendar-popover");
  const calendarGrid = document.getElementById("calendar-grid");
  const calendarTitle = document.getElementById("calendar-title");
  const calendarPrev = document.getElementById("calendar-prev");
  const calendarNext = document.getElementById("calendar-next");
  const timeSlotsEl  = document.getElementById("time-slots");
  const staffListEl  = document.getElementById("staff-list");
  const nameInput    = document.getElementById("client-name");
  const phoneInput   = document.getElementById("client-phone");
  const confirmBtn   = document.getElementById("confirm-reservation");
  const closeOk      = document.getElementById("close-success");
  const nequiPanel   = document.getElementById("nequi-panel");
  const nequiCopyBtn = document.getElementById("nequi-copy-btn");
  const openNequiBtn = document.getElementById("open-nequi");
  const openDaviplataBtn = document.getElementById("open-daviplata");

  const sumService    = document.getElementById("summary-service");
  const sumSpecialist = document.getElementById("summary-specialist");
  const sumDate       = document.getElementById("summary-date");
  const sumTime       = document.getElementById("summary-time");
  const sumClient     = document.getElementById("summary-client");
  const sumPayment    = document.getElementById("summary-payment");
  const sumPrice      = document.getElementById("summary-price");

  // Fecha mínima = hoy
  const now = new Date();
  dateInput.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── Panel Nequi ──────────────────────────────────────────────────────────
  document.querySelectorAll("input[name='payment']").forEach(radio => {
    radio.addEventListener("change", () => {
      if (!nequiPanel) return;
      nequiPanel.style.display = radio.value === "nequi" ? "block" : "none";
    });
  });

  nequiCopyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(WALLET_PHONE).then(() => {
      nequiCopyBtn.textContent = "¡Copiado! ✓";
      nequiCopyBtn.style.background = "#4caf50";
      setTimeout(() => {
        nequiCopyBtn.textContent = "Copiar número";
        nequiCopyBtn.style.background = "";
      }, 2500);
    });
  });

  function openWallet(appName) {
    const amount = parseInt(String(bk.servicePrice || "").replace(/\D/g, ""), 10);
    const note = encodeURIComponent(`Women Secret Nails - ${bk.serviceName || "Reserva"}`);
    const urls = appName === "nequi"
      ? [
          `nequi://send?phone=${WALLET_PHONE}${amount ? `&amount=${amount}` : ""}&description=${note}`,
          "nequi://app"
        ]
      : [
          `daviplata://send?phone=${WALLET_PHONE}${amount ? `&amount=${amount}` : ""}&description=${note}`,
          "daviplata://app"
        ];

    window.location.href = urls[0];
    setTimeout(() => {
      if (document.hidden) return;
      window.location.href = urls[1];
      showToast(`Si ${appName === "nequi" ? "Nequi" : "Daviplata"} no se abre, paga al ${WALLET_PHONE}.`);
    }, 900);
  }

  openNequiBtn?.addEventListener("click", () => openWallet("nequi"));
  openDaviplataBtn?.addEventListener("click", () => openWallet("daviplata"));

  function dateToValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function valueToDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function setReservationDate(value) {
    dateInput.value = value;
    bk.date = value;
    bk.time = null;
    dateValue.textContent = fmtDate(value);
    calendarPop?.classList.remove("open");
    dateTrigger?.setAttribute("aria-expanded", "false");
    subscribeSlots(value);
    renderCalendar();
  }

  function renderCalendar() {
    if (!calendarGrid || !calendarTitle) return;
    calendarTitle.textContent = calendarMonth.toLocaleDateString("es-CO", {
      month: "long",
      year: "numeric",
    });
    calendarGrid.innerHTML = "";

    const minDate = valueToDate(dateInput.min);
    minDate.setHours(0, 0, 0, 0);
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const leading = (first.getDay() + 6) % 7;
    const days = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();

    for (let i = 0; i < leading; i++) {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "calendar-day empty";
      empty.disabled = true;
      calendarGrid.appendChild(empty);
    }

    for (let day = 1; day <= days; day++) {
      const current = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
      current.setHours(0, 0, 0, 0);
      const value = dateToValue(current);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar-day";
      btn.textContent = day;
      btn.disabled = current < minDate;
      if (value === dateInput.value) btn.classList.add("selected");
      btn.addEventListener("click", () => setReservationDate(value));
      calendarGrid.appendChild(btn);
    }
  }

  dateTrigger?.addEventListener("click", () => {
    const open = !calendarPop?.classList.contains("open");
    calendarPop?.classList.toggle("open", open);
    dateTrigger.setAttribute("aria-expanded", String(open));
    renderCalendar();
  });

  document.addEventListener("click", e => {
    if (!calendarPop?.classList.contains("open")) return;
    if (e.target.closest(".date-picker-wrap")) return;
    calendarPop.classList.remove("open");
    dateTrigger?.setAttribute("aria-expanded", "false");
  });

  calendarPrev?.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  calendarNext?.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  // ── Servicios en tiempo real ─────────────────────────────────────────────
  function subscribeServices() {
    if (unsubServices) unsubServices();
    grid.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando servicios...</p></div>`;

    const q = query(collection(db, "services"), where("active", "==", true));
    unsubServices = onSnapshot(q, snap => {
      grid.innerHTML = "";
      if (snap.empty) {
        grid.innerHTML = `<p class="empty-msg">No hay servicios disponibles.</p>`;
        return;
      }
      const docs = [...snap.docs].sort((a, b) =>
        (a.data().name || "").localeCompare(b.data().name || "")
      );
      docs.forEach((docSnap, i) => {
        const d = docSnap.data(), name = d.name || "Servicio";
        const card = document.createElement("div");
        card.className = "card";
        card.style.animationDelay = `${i * 0.06}s`;

        // 3D tilt
        card.addEventListener("mousemove", e => {
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 6}deg) translateY(-6px)`;
          card.style.boxShadow = `${-x * 8}px ${-y * 6}px 30px rgba(201,123,138,0.18),0 12px 40px rgba(44,31,34,0.1)`;
        });
        card.addEventListener("mouseleave", () => {
          card.style.transform = "";
          card.style.boxShadow = "";
        });

        card.innerHTML = `
          <div class="card-image-wrap">
            ${d.image
              ? `<img src="${d.image}" alt="${name}" loading="lazy">`
              : `<div class="card-placeholder">${emoji(name)}</div>`}
          </div>
          <div class="card-body">
            <h3 class="card-name">${name}</h3>
            <div class="card-meta">
              <span class="card-price">${fmtPrice(d.price)}</span>
              ${d.duration ? `<span class="card-sep"></span><span class="card-duration">~${d.duration} min</span>` : ""}
            </div>
            <button class="card-btn">Reservar</button>
          </div>`;

        grid.appendChild(card);
        card.querySelector(".card-btn").onclick = () =>
          openModal(docSnap.id, name, d.price, d.duration);
      });
    }, err => {
      console.error(err);
      grid.innerHTML = `<p class="empty-msg" style="color:var(--rose-deep)">Error cargando servicios.</p>`;
    });
  }

  function subscribeStaff() {
    onSnapshot(
      query(collection(db, "staff"), where("active", "==", true)),
      snap => { staffMembers = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    );
  }

  // ── Slots en tiempo real ─────────────────────────────────────────────────
  function subscribeSlots(date) {
    if (unsubSlots) { unsubSlots(); unsubSlots = null; }
    timeSlotsEl.innerHTML = `<div class="slots-loading"><div class="loading-spinner" style="width:20px;height:20px;margin:0 auto 8px;"></div><p>Verificando disponibilidad...</p></div>`;

    const q = query(
      collection(db, "reservations"),
      where("date", "==", date),
      where("status", "in", ["pendiente", "confirmada"])
    );
    unsubSlots = onSnapshot(q, snap => {
      const reserved = snap.docs.map(d => ({
        time: d.data().time,
        duration: d.data().duration || 30,
      }));
      renderSlots(reserved);
      if (bk.time && isBlocked(bk.time, reserved)) {
        bk.time = null;
        timeSlotsEl.querySelector(".time-slot.selected")?.classList.remove("selected");
        showToast("Ese horario acaba de ser reservado 💨 Elige otro.");
      }
    });
  }

  function renderSlots(reserved) {
    const all = genSlots();
    const n = new Date();
    const todayStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    const isToday  = bk.date === todayStr;
    const nowMin   = n.getHours() * 60 + n.getMinutes();
    const closeMin = BUSINESS.closeHour * 60 + BUSINESS.closeMinute;

    timeSlotsEl.innerHTML = "";
    let any = false;

    all.forEach(slot => {
      const sm = toMin(slot);
      const ok = (sm + bk.serviceDuration) <= closeMin
              && !(isToday && sm <= nowMin + 30)
              && !isBlocked(slot, reserved);

      const btn = document.createElement("button");
      btn.className = "time-slot";
      btn.dataset.time = slot;
      btn.textContent = fmtTime(slot);
      if (slot === bk.time) btn.classList.add("selected");
      if (!ok) { btn.classList.add("taken"); btn.disabled = true; }
      else any = true;
      timeSlotsEl.appendChild(btn);
    });

    if (!any) {
      const p = document.createElement("p");
      p.className = "slots-hint";
      p.textContent = "No hay horarios disponibles este día.";
      timeSlotsEl.appendChild(p);
    }
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  function openModal(id, name, price, duration) {
    Object.assign(bk, {
      serviceId: id, serviceName: name, servicePrice: price,
      serviceDuration: Number(duration) || 30,
      date: null, time: null, specialist: null, specialistId: null,
      clientName: null, clientPhone: null, payment: null,
    });
    modalTitle.textContent = name;
    modalMeta.textContent  = `${fmtPrice(price)} · ~${duration} min`;
    dateInput.value        = "";
    dateValue.textContent   = "Seleccionar fecha";
    calendarMonth           = new Date(now.getFullYear(), now.getMonth(), 1);
    calendarPop?.classList.remove("open");
    dateTrigger?.setAttribute("aria-expanded", "false");
    renderCalendar();
    timeSlotsEl.innerHTML  = `<p class="slots-hint">Selecciona una fecha para ver los horarios.</p>`;
    if (unsubSlots) { unsubSlots(); unsubSlots = null; }
    if (nequiPanel) nequiPanel.style.display = "none";
    document.querySelectorAll("input[name='payment']").forEach(r => r.checked = false);

    // FIX GUEST: si es invitada, dejar nombre vacío para que lo llene ella.
    // Si tiene sesión, pre-llenar con su nombre.
    nameInput.value  = currentUser
      ? (currentUser.displayName || currentUser.email.split("@")[0])
      : "";
    phoneInput.value = "";

    goTo(1);
    modal.style.display    = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (unsubSlots) { unsubSlots(); unsubSlots = null; }
    modal.style.display          = "none";
    document.body.style.overflow = "";
  }

  closeBtn?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", closeModal);
  closeOk?.addEventListener("click", closeModal);

  dateInput?.addEventListener("change", () => {
    const date = dateInput.value;
    if (!date) return;
    setReservationDate(date);
  });

  timeSlotsEl?.addEventListener("click", e => {
    const slot = e.target.closest(".time-slot");
    if (!slot || slot.disabled) return;
    document.querySelectorAll(".time-slot").forEach(s => s.classList.remove("selected"));
    slot.classList.add("selected");
    bk.time = slot.dataset.time;
  });

  // ── Staff ────────────────────────────────────────────────────────────────
  function renderStaff() {
    if (!staffListEl) return;
    staffListEl.innerHTML = "";
    if (!staffMembers.length) {
      staffListEl.innerHTML = `<p class="slots-hint">No hay especialistas disponibles.</p>`;
      return;
    }
    staffMembers.forEach(m => {
      const lbl = document.createElement("label");
      lbl.className = "staff-option";
      lbl.innerHTML = `
        <input type="radio" name="specialist" value="${m.id}" style="display:none;">
        <div class="staff-card">
          <div class="staff-avatar">
            ${m.photo
              ? `<img src="${m.photo}" alt="${m.name}">`
              : `<span>${m.name.charAt(0)}</span>`}
          </div>
          <div class="staff-info">
            <span class="staff-name">${m.name}</span>
            <span class="staff-role">${m.role || "Especialista"}</span>
          </div>
          <div class="staff-check">✓</div>
        </div>`;
      staffListEl.appendChild(lbl);
      lbl.querySelector("input").onchange = () => {
        document.querySelectorAll(".staff-card").forEach(c => c.classList.remove("selected"));
        lbl.querySelector(".staff-card").classList.add("selected");
        bk.specialist   = m.name;
        bk.specialistId = m.id;
      };
    });
    // Auto-seleccionar si solo hay una especialista
    if (staffMembers.length === 1) {
      const r = staffListEl.querySelector("input");
      if (r) {
        r.checked = true;
        staffListEl.querySelector(".staff-card").classList.add("selected");
        bk.specialist   = staffMembers[0].name;
        bk.specialistId = staffMembers[0].id;
      }
    }
  }

  // ── Navegación de pasos ──────────────────────────────────────────────────
  function goTo(n) {
    stepEls.forEach((s, i) => s?.classList.toggle("hidden", i + 1 !== n));
    stepOk?.classList.add("hidden");
    stepDots.forEach((d, i) => {
      d?.classList.remove("active", "done");
      if (i + 1 === n) d?.classList.add("active");
      if (i + 1 < n)  d?.classList.add("done");
    });
    if (n === 2) renderStaff();
  }

  document.getElementById("next-step-2")?.addEventListener("click", () => {
    if (!bk.date) { shake(dateInput); return; }
    if (!bk.time) { shake(timeSlotsEl); return; }
    goTo(2);
  });
  document.getElementById("back-step-1")?.addEventListener("click", () => goTo(1));

  document.getElementById("next-step-3")?.addEventListener("click", () => {
    if (!bk.specialist) { shake(staffListEl); return; }
    goTo(3);
  });
  document.getElementById("back-step-2")?.addEventListener("click", () => goTo(2));

  document.getElementById("next-step-4")?.addEventListener("click", () => {
    const name  = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    if (!name)  { shake(nameInput); return; }
    if (!phone) { shake(phoneInput); return; }
    bk.clientName  = name;
    bk.clientPhone = phone;
    goTo(4);
  });
  document.getElementById("back-step-3")?.addEventListener("click", () => goTo(3));

  document.getElementById("next-step-5")?.addEventListener("click", () => {
    const sel = document.querySelector("input[name='payment']:checked");
    if (!sel) { shake(document.querySelector(".payment-options")); return; }
    bk.payment = sel.value;
    sumService.textContent    = bk.serviceName;
    sumSpecialist.textContent = bk.specialist;
    sumDate.textContent       = fmtDate(bk.date);
    sumTime.textContent       = fmtTime(bk.time);
    sumClient.textContent     = `${bk.clientName} · ${bk.clientPhone}`;
    sumPayment.textContent    = bk.payment === "efectivo" ? "💵 Efectivo" : "📱 Nequi / Daviplata";
    sumPrice.textContent      = fmtPrice(bk.servicePrice);
    goTo(5);
  });
  document.getElementById("back-step-4")?.addEventListener("click", () => goTo(4));

  // ── Confirmar reserva ────────────────────────────────────────────────────
  confirmBtn?.addEventListener("click", async () => {
    confirmBtn.textContent = "Guardando...";
    confirmBtn.disabled    = true;

    // FIX GUEST: si es invitada, userId = "guest" y userEmail = "invitada"
    // Esto ya estaba bien, pero nos aseguramos de que currentUser se lea
    // del estado actual (no del closure inicial)
    const isGuestNow = sessionStorage.getItem("wsn-guest") === "true";

    try {
      await addDoc(collection(db, "reservations"), {
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

      // Notificar admin
      const notifData = {
        service:    bk.serviceName,
        clientName: bk.clientName,
        phone:      bk.clientPhone,
        date:       fmtDate(bk.date),
        time:       fmtTime(bk.time),
        specialist: bk.specialist,
        payment:    bk.payment,
      };
      notifyAdminEmail(notifData);
      notifyAdminWhatsApp(notifData);

      // Pasar al paso de éxito
      stepEls.forEach(s => s?.classList.add("hidden"));
      stepOk?.classList.remove("hidden");
      stepDots.forEach(d => { d?.classList.remove("active"); d?.classList.add("done"); });

      // Botón comprobante Nequi
      if (bk.payment === "nequi") {
        const wrap = document.getElementById("comprobante-btn-wrap");
        const btn  = document.getElementById("comprobante-wa-btn");
        if (wrap && btn) {
          wrap.style.display = "block";
          btn.href = buildComprobanteWhatsAppUrl({
            clientName: bk.clientName,
            service:    bk.serviceName,
            date:       fmtDate(bk.date),
            time:       fmtTime(bk.time),
          });
        }
      }

      // FIX GUEST: si era invitada y reservó, mostrar aviso de login
      if (isGuestNow && !currentUser) {
        showToast("✅ ¡Reserva enviada! Crea una cuenta para ver tus citas 💅");
      }

    } catch(e) {
      console.error(e);
      alert("Error al guardar la reserva. Intenta de nuevo.");
    } finally {
      confirmBtn.textContent = "Confirmar cita ✓";
      confirmBtn.disabled    = false;
    }
  });

  // ── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const t = document.createElement("div");
    t.className   = "wsn-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("wsn-toast--show"), 10);
    setTimeout(() => {
      t.classList.remove("wsn-toast--show");
      setTimeout(() => t.remove(), 400);
    }, 4000);
  }

  // ── Shake ─────────────────────────────────────────────────────────────────
  function shake(el) {
    if (!el) return;
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "shake 0.35s ease";
    el.addEventListener("animationend", () => { el.style.animation = ""; }, { once: true });
  }

  // ── Estilos dinámicos ────────────────────────────────────────────────────
  const st = document.createElement("style");
  st.textContent = `
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
    .wsn-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--text-dark);color:white;padding:12px 20px;border-radius:var(--radius-xl);font-size:13px;z-index:9999;transition:transform 0.35s cubic-bezier(0.34,1.2,0.64,1),opacity 0.35s;opacity:0;max-width:90vw;text-align:center;box-shadow:0 8px 32px rgba(44,31,34,0.25)}
    .wsn-toast--show{transform:translateX(-50%) translateY(0);opacity:1}
    .btn-whatsapp{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;background:#25D366;color:white;border:none;border-radius:var(--radius-xl);font-family:var(--font-body);font-size:13px;font-weight:500;letter-spacing:0.06em;cursor:pointer;text-decoration:none;transition:background 0.2s,transform 0.2s,box-shadow 0.2s}
    .btn-whatsapp:hover{background:#1ebe5d;transform:translateY(-2px);box-shadow:0 6px 20px rgba(37,211,102,0.35)}
    @media(max-width:480px){.staff-card{flex-wrap:wrap}}
  `;
  document.head.appendChild(st);

  // ── Arrancar ─────────────────────────────────────────────────────────────
  subscribeStaff();
  subscribeServices();
});
