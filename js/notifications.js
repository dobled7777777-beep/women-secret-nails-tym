// =====================================================
// js/notifications.js — Sistema de notificaciones WSN
// =====================================================

export const NOTIFY_CONFIG = {
  emailjs: {
    publicKey:        "FfOnIphvjFABGNa2O",        
    serviceId:        "service_rgenrgj",         
    adminTemplateId:  "wsn_admin_nueva_cita",   
    clientTemplateId: "wsn_cliente_confirmada", 
  },
  callmebot: {
    adminPhone: "573017886217",  
    apiKey:     "TU_CALLMEBOT_APIKEY", 
  },
  business: {
    phone:        "573017886217",
    name:         "Women Secret Nails",
    nequiNumber:  "3017886217",
    adminEmail:   "tatismahecha01@gmail.com",
  },
};

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

export async function notifyAdminEmail(data) {
  await loadEmailJS();
  if (!window.emailjs) return;
  
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
    console.error("EmailJS admin error:", e);
  }
}

export async function notifyClientEmail(data) {
  if (!data.clientEmail || data.clientEmail === "invitada") return;
  await loadEmailJS();
  if (!window.emailjs) return;
  
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
    console.error("EmailJS cliente error:", e);
  }
}

export async function notifyAdminWhatsApp(data) {
  const { adminPhone, apiKey } = NOTIFY_CONFIG.callmebot;
  if (apiKey === "TU_CALLMEBOT_APIKEY") return;
  
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
    await fetch(`https://api.callmebot.com/whatsapp.php?phone=${adminPhone}&text=${text}&apikey=${apiKey}`, { mode: "no-cors" });
    console.log("✅ WhatsApp admin enviado");
  } catch(e) {
    console.warn("CallMeBot error:", e);
  }
}

export function buildClientWhatsAppUrl(data) {
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

export function buildComprobanteWhatsAppUrl(data) {
  const msg = encodeURIComponent(
    `Hola 💅 Acabo de reservar una cita.\n\n` +
    `👤 *${data.clientName}*\n` +
    `💅 Servicio: ${data.service}\n` +
    `📅 ${data.date} — ${data.time}\n\n` +
    `Adjunto comprobante de pago por Nequi/Daviplata 📎`
  );
  return `https://wa.me/${NOTIFY_CONFIG.business.phone}?text=${msg}`;
}
