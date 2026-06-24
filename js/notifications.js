// =====================================================

// js/notifications.js — Sistema de notificaciones WSN

// ✅ EmailJS  — email automático al admin y clienta

// ✅ CallMeBot — WhatsApp automático al admin

// ✅ wa.me links — WhatsApp manual admin → clienta

// =====================================================



// ══════════════════════════════════════════════════

//  ⚙️  CONFIGURA ESTOS VALORES  (ver SETUP.md)

// ══════════════════════════════════════════════════

export const NOTIFY_CONFIG = {

  emailjs: {

    publicKey:        "FfOnIphvjFABGNa2O",          // EmailJS > Account > API Keys

    serviceId:        "service_rgenrgj",          // EmailJS > Email Services

    adminTemplateId:  "wsn_admin_nueva_cita",   // nombre que pondrás al template

    clientTemplateId: "wsn_cliente_confirmada", // nombre que pondrás al template

  },

  callmebot: {

    adminPhone: "573017886217",   // con código de país, sin +

    apiKey:     "TU_CALLMEBOT_APIKEY", // te llega por WhatsApp al activar (ver SETUP.md)

  },

  business: {

    phone:        "573017886217",

    name:         "Women Secret Nails",

    nequiNumber:  "3017886217",

    adminEmail:   "tatismahecha01@gmail.com",

  },

};



// ── Cargar EmailJS desde CDN una sola vez ─────────────────────────────────────

let emailjsLoaded = false;

export function loadEmailJS() {

  return new Promise(resolve => {

    if (emailjsLoaded || window.emailjs) {

      emailjsLoaded = true;

      resolve(); return;

    }

    const s = document.createElement("script");

    s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";

    s.onload = () => {

      window.emailjs.init(NOTIFY_CONFIG.emailjs.publicKey);

      emailjsLoaded = true;

      resolve();

    };

    s.onerror = () => { console.warn("EmailJS no se pudo cargar"); resolve(); };

    document.head.appendChild(s);

  });

}



// ── 1. Email al ADMIN cuando llega reserva nueva ─────────────────────────────

export async function notifyAdminEmail(data) {

  // data: { service, clientName, phone, date, time, specialist, payment, reservationId }

  await loadEmailJS();

  if (!window.emailjs) return;

  if (NOTIFY_CONFIG.emailjs.publicKey === "TU_PUBLIC_KEY") {

    console.warn("EmailJS no configurado. Ver SETUP-NOTIFICACIONES.md");

    return;

  }

  try {

    await window.emailjs.send(

      NOTIFY_CONFIG.emailjs.serviceId,

      NOTIFY_CONFIG.emailjs.adminTemplateId,

      {

        to_email:   NOTIFY_CONFIG.business.adminEmail,

        service:    data.service,

        clientName: data.clientName,

        phone:      data.phone,

        date:       data.date,

        time:       data.time,

        specialist: data.specialist,

        payment:    data.payment === "efectivo" ? "💵 Efectivo" : "📱 Nequi / Daviplata",

        admin_url:  `${window.location.origin}/admin.html`,

      }

    );

    console.log("✅ Email admin enviado");

  } catch(e) {

    console.warn("EmailJS admin error:", e);

  }

}



// ── 2. Email a la CLIENTA cuando admin confirma ───────────────────────────────

export async function notifyClientEmail(data) {

  // data: { clientEmail, clientName, service, date, time, specialist }

  if (!data.clientEmail || data.clientEmail === "invitada") return;

  await loadEmailJS();

  if (!window.emailjs) return;

  if (NOTIFY_CONFIG.emailjs.publicKey === "TU_PUBLIC_KEY") return;

  try {

    await window.emailjs.send(

      NOTIFY_CONFIG.emailjs.serviceId,

      NOTIFY_CONFIG.emailjs.clientTemplateId,

      {

        to_email:    data.clientEmail,

        clientName:  data.clientName,

        service:     data.service,

        date:        data.date,

        time:        data.time,

        specialist:  data.specialist,

        business:    NOTIFY_CONFIG.business.name,

      }

    );

    console.log("✅ Email clienta enviado");

  } catch(e) {

    console.warn("EmailJS cliente error:", e);

  }

}



// ── 3. WhatsApp automático al ADMIN via CallMeBot ────────────────────────────

export async function notifyAdminWhatsApp(data) {

  const { adminPhone, apiKey } = NOTIFY_CONFIG.callmebot;

  if (apiKey === "TU_CALLMEBOT_APIKEY") {

    console.warn("CallMeBot no configurado. Ver SETUP-NOTIFICACIONES.md");

    return;

  }

  const text = encodeURIComponent(

    `💅 *Nueva cita WSN!*\n\n` +

    `👤 ${data.clientName}\n` +

    `📞 ${data.phone}\n` +

    `💅 ${data.service}\n` +

    `📅 ${data.date} — ${data.time}\n` +

    `💳 ${data.payment === "efectivo" ? "Efectivo" : "Nequi/Daviplata"}\n\n` +

    `👉 Confirmar: ${window.location.origin}/admin.html`

  );

  try {

    await fetch(

      `https://api.callmebot.com/whatsapp.php?phone=${adminPhone}&text=${text}&apikey=${apiKey}`,

      { mode: "no-cors" }

    );

    console.log("✅ WhatsApp admin enviado");

  } catch(e) {

    console.warn("CallMeBot error:", e);

  }

}



// ── 4. Link de WhatsApp para que admin confirme a la clienta ─────────────────

export function buildClientWhatsAppUrl(data) {

  // data: { phone, clientName, service, date, time, specialist }

  const clean = data.phone.replace(/\D/g, "");

  const phone = clean.startsWith("57") ? clean : `57${clean}`;

  const msg = encodeURIComponent(

    `¡Hola ${data.clientName}! 💅\n\n` +

    `Tu cita en *${NOTIFY_CONFIG.business.name}* está ✅ *CONFIRMADA*\n\n` +

    `📅 *Fecha:* ${data.date}\n` +

    `🕐 *Hora:* ${data.time}\n` +

    `💅 *Servicio:* ${data.service}\n` +

    `👩‍💼 *Especialista:* ${data.specialist}\n\n` +

    `¡Te esperamos! 🌸`

  );

  return `https://wa.me/${phone}?text=${msg}`;

}



// ── 5. Link de WhatsApp para que clienta envíe comprobante Nequi ─────────────

export function buildComprobanteWhatsAppUrl(data) {

  // data: { clientName, service, date, time }

  const msg = encodeURIComponent(

    `Hola 💅 Acabo de reservar una cita.\n\n` +

    `👤 *${data.clientName}*\n` +

    `💅 Servicio: ${data.service}\n` +

    `📅 ${data.date} — ${data.time}\n\n` +

    `Adjunto comprobante de pago por Nequi/Daviplata 📎`

  );

  return `https://wa.me/${NOTIFY_CONFIG.business.phone}?text=${msg}`;

} 

