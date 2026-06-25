# EmailJS - Women Secret Nails

La pagina ya envia los correos desde `js/notifications.js` usando:

- Service ID: `service_rgenrgj`
- Template ID: `template_pmw2ukf`
- Admin: `tatismahecha01@gmail.com`

En EmailJS deja esta plantilla con estos campos:

- Subject: `{{subject}}`
- To Email: `{{to_email}}`
- From Name: `Women Secret Nails`
- Reply To: `tatismahecha01@gmail.com`
- Content: copiar el HTML de `EMAILJS-TEMPLATE.html`

Variables que envia la pagina:

- `title`
- `intro`
- `details`
- `cta_url`
- `cta_text`
- `subject`
- `to_email`

Modulos conectados:

- Reserva nueva: correo al admin.
- Cita confirmada desde admin: correo a la usuaria.
- Formulario Trabaja con nosotras: correo al admin.
