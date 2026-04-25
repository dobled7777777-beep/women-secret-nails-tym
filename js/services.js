// js/services.js
import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ─── Emojis por defecto según el servicio ───────────────────────────────────
const SERVICE_EMOJIS = {
  "shampoo":                "🧴",
  "depilacion cejas":       "✨",
  "depilación cejas":       "✨",
  "cepillado":              "💇",
  "semi permanente":        "💅",
  "semipermanente":         "💅",
  "cejas en henna":         "🌿",
  "acrilicas":              "💎",
  "acrílicas":              "💎",
  "manicura tradicional":   "🌸",
  "press on":               "🎀",
  "pedicura tradicional":   "🦶",
};

function getEmoji(name = "") {
  const key = name.toLowerCase().trim();
  return SERVICE_EMOJIS[key] || "💅";
}

// ─── Formatear precio en pesos colombianos ──────────────────────────────────
function formatPrice(price) {
  if (!price) return "Consultar";
  const num = parseInt(String(price).replace(/\D/g, ""), 10);
  if (isNaN(num)) return price;
  return "$" + num.toLocaleString("es-CO");
}

// ─── Formatear fecha legible ─────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`;
}

// ─── Estado global de la reserva ────────────────────────────────────────────
const booking = {
  serviceId:   null,
  serviceName: null,
  servicePrice: null,
  date:        null,
  time:        null,
  payment:     null,
};

// ─── DOM ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  const grid         = document.getElementById("services-grid");
  const modal        = document.getElementById("reservation-modal");
  const backdrop     = document.getElementById("modal-backdrop");
  const closeBtn     = document.getElementById("close-modal");
  const modalTitle   = document.getElementById("modal-service-name");
  const modalMeta    = document.getElementById("modal-service-meta");

  // Pasos
  const steps        = [1, 2, 3].map(n => document.getElementById(`step-${n}`));
  const stepDots     = [1, 2, 3].map(n => document.getElementById(`step-dot-${n}`));
  const stepSuccess  = document.getElementById("step-success");

  // Inputs paso 1
  const dateInput    = document.getElementById("reservation-date");
  const timeSlotsEl  = document.getElementById("time-slots");

  // Botones navegación
  const nextStep2Btn = document.getElementById("next-step-2");
  const backStep1Btn = document.getElementById("back-step-1");
  const nextStep3Btn = document.getElementById("next-step-3");
  const backStep2Btn = document.getElementById("back-step-2");
  const confirmBtn   = document.getElementById("confirm-reservation");
  const closeSuccess = document.getElementById("close-success");

  // Resumen paso 3
  const summaryService  = document.getElementById("summary-service");
  const summaryDate     = document.getElementById("summary-date");
  const summaryTime     = document.getElementById("summary-time");
  const summaryPayment  = document.getElementById("summary-payment");
  const summaryPrice    = document.getElementById("summary-price");

  // ── Cargar servicios desde Firestore ──────────────────────────────────────
  async function loadServices() {
    try {
      const snapshot = await getDocs(collection(db, "services"));
      grid.innerHTML = "";

      snapshot.forEach((doc, i) => {
        const data = doc.data();
        const name  = data.name  || "Servicio";
        const price = data.price || "";
        const duration = data.duration || "";
        const image = data.image || "";
        const emoji = getEmoji(name);

        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <div class="card-image-wrap">
            ${image
              ? `<img src="${image}" alt="${name}" loading="lazy">`
              : `<div class="card-placeholder">${emoji}</div>`
            }
          </div>
          <div class="card-body">
            <h3 class="card-name">${name}</h3>
            <div class="card-meta">
              <span class="card-price">${formatPrice(price)}</span>
              ${duration ? `<span class="card-sep"></span><span class="card-duration">${duration}</span>` : ""}
            </div>
            <button class="card-btn">Reservar</button>
          </div>
        `;

        grid.appendChild(card);

        // Evento reservar
        card.querySelector(".card-btn").addEventListener("click", () => {
          openModal(doc.id, name, price, duration);
        });
      });

      if (snapshot.empty) {
        grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-light);padding:60px 0;">No hay servicios disponibles por ahora.</p>`;
      }

    } catch (err) {
      console.error("Error cargando servicios:", err);
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--rose-deep);padding:60px 0;">Error cargando los servicios. Intenta de nuevo.</p>`;
    }
  }

  // ── Abrir modal ───────────────────────────────────────────────────────────
  function openModal(id, name, price, duration) {
    booking.serviceId   = id;
    booking.serviceName = name;
    booking.servicePrice = price;
    booking.time = null;

    modalTitle.textContent = name;
    modalMeta.textContent  = [formatPrice(price), duration ? `· ${duration}` : ""].filter(Boolean).join(" ");

    // Resetear fecha
    dateInput.value = "";
    // Quitar selección de horario
    document.querySelectorAll(".time-slot").forEach(s => s.classList.remove("selected"));
    // Quitar selección de pago
    document.querySelectorAll("input[name='payment']").forEach(r => r.checked = false);

    goToStep(1);
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  // ── Cerrar modal ──────────────────────────────────────────────────────────
  function closeModalFn() {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  closeBtn.addEventListener("click", closeModalFn);
  backdrop.addEventListener("click", closeModalFn);
  closeSuccess?.addEventListener("click", closeModalFn);

  // ── Navegación entre pasos ────────────────────────────────────────────────
  function goToStep(n) {
    steps.forEach((s, i) => {
      if (!s) return;
      s.classList.toggle("hidden", i + 1 !== n);
    });
    stepSuccess?.classList.add("hidden");

    stepDots.forEach((dot, i) => {
      if (!dot) return;
      dot.classList.remove("active", "done");
      if (i + 1 === n) dot.classList.add("active");
      if (i + 1 < n)  dot.classList.add("done");
    });
  }

  // Paso 1 → 2
  nextStep2Btn?.addEventListener("click", async () => {
    if (!dateInput.value) {
      shakElement(dateInput);
      return;
    }
    if (!booking.time) {
      shakElement(timeSlotsEl);
      return;
    }
    booking.date = dateInput.value;
    goToStep(2);
  });

  // Paso 2 → 1
  backStep1Btn?.addEventListener("click", () => goToStep(1));

  // Paso 2 → 3
  nextStep3Btn?.addEventListener("click", () => {
    const selected = document.querySelector("input[name='payment']:checked");
    if (!selected) {
      shakElement(document.querySelector(".payment-options"));
      return;
    }
    booking.payment = selected.value;

    // Rellenar resumen
    summaryService.textContent = booking.serviceName;
    summaryDate.textContent    = formatDate(booking.date);
    summaryTime.textContent    = formatTimeLabel(booking.time);
    summaryPayment.textContent = booking.payment === "efectivo" ? "Efectivo" : "Virtual (Nequi/Transferencia)";
    summaryPrice.textContent   = formatPrice(booking.servicePrice);

    goToStep(3);
  });

  // Paso 3 → 2
  backStep2Btn?.addEventListener("click", () => goToStep(2));

  // ── Confirmar reserva ─────────────────────────────────────────────────────
  confirmBtn?.addEventListener("click", async () => {
    confirmBtn.textContent = "Guardando...";
    confirmBtn.disabled = true;

    try {
      await addDoc(collection(db, "reservations"), {
        serviceId:   booking.serviceId,
        service:     booking.serviceName,
        date:        booking.date,
        time:        booking.time,
        payment:     booking.payment,
        createdAt:   serverTimestamp(),
      });

      // Mostrar éxito
      steps.forEach(s => s?.classList.add("hidden"));
      stepSuccess?.classList.remove("hidden");
      stepDots.forEach(d => d?.classList.replace("active", "done"));

    } catch (err) {
      console.error("Error al guardar reserva:", err);
      alert("Hubo un error al guardar tu reserva. Intenta de nuevo.");
    } finally {
      confirmBtn.textContent = "Confirmar cita ✓";
      confirmBtn.disabled = false;
    }
  });

  // ── Selección de horario ──────────────────────────────────────────────────
  timeSlotsEl?.addEventListener("click", (e) => {
    const slot = e.target.closest(".time-slot");
    if (!slot || slot.classList.contains("taken")) return;

    document.querySelectorAll(".time-slot").forEach(s => s.classList.remove("selected"));
    slot.classList.add("selected");
    booking.time = slot.dataset.time;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function shakElement(el) {
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "shake 0.35s ease";
    el.addEventListener("animationend", () => { el.style.animation = ""; }, { once: true });
  }

  function formatTimeLabel(time) {
    if (!time) return "—";
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2,"0")} ${suffix}`;
  }

  // ── Agregar animación shake al CSS dinámicamente ──────────────────────────
  const shakeStyle = document.createElement("style");
  shakeStyle.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-6px); }
      40%      { transform: translateX(6px); }
      60%      { transform: translateX(-4px); }
      80%      { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(shakeStyle);

  // ── Iniciar ───────────────────────────────────────────────────────────────
  loadServices();
});
