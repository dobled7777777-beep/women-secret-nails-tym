<script type="module">
import { db } from "./firebase-config.js";
import { collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Elementos del DOM
const container = document.querySelector(".services-container");
const modal = document.getElementById("reservation-modal");
const closeModal = document.getElementById("close-modal");
const selectedServiceEl = document.getElementById("selected-service");
const confirmButton = document.getElementById("confirm-reservation");
const dateInput = document.getElementById("reservation-date");
const timeInput = document.getElementById("reservation-time");

let selectedServiceName = "";

// Función para cargar servicios
async function loadServices() {
  try {
    const querySnapshot = await getDocs(collection(db, "services"));
    container.innerHTML = "";

    querySnapshot.forEach((doc) => {
      const data = doc.data();

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <img src="${data.image}" alt="${data.name}">
        <h3>${data.name}</h3>
        <p>$${data.price}</p>
        <p>${data.duration} min</p>
        <button class="reserve-btn">Reservar</button>
      `;
      container.appendChild(card);

      // Evento click en "Reservar"
      card.querySelector(".reserve-btn").addEventListener("click", () => {
        selectedServiceName = data.name;
        selectedServiceEl.textContent = `Servicio: ${selectedServiceName}`;
        dateInput.value = "";
        timeInput.value = "";
        modal.style.display = "flex";
      });
    });
  } catch (error) {
    console.error("Error cargando servicios:", error);
    container.innerHTML = "<p>Error cargando los servicios. Intenta de nuevo más tarde.</p>";
  }
}

// Cerrar modal
closeModal.addEventListener("click", () => {
  modal.style.display = "none";
});

// Confirmar reserva
confirmButton.addEventListener("click", async () => {
  const date = dateInput.value;
  const time = timeInput.value;

  if (!date || !time) {
    alert("Por favor selecciona fecha y hora.");
    return;
  }

  try {
    await addDoc(collection(db, "reservations"), {
      service: selectedServiceName,
      date,
      time,
      createdAt: serverTimestamp()
    });
    alert(`Reserva confirmada para ${selectedServiceName} el ${date} a las ${time}`);
    modal.style.display = "none";
  } catch (error) {
    console.error("Error guardando reserva:", error);
    alert("Error al guardar la reserva.");
  }
});

// Ejecutar carga de servicios al iniciar
loadServices();
</script>
loadServices();
</script>
