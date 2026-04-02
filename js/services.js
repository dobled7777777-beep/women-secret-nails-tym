<script type="module">
import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Seleccionamos el contenedor donde se mostrarán las cards
const container = document.querySelector(".services-container");

async function loadServices() {
  try {
    const querySnapshot = await getDocs(collection(db, "services"));

    // Limpiamos el contenedor antes de agregar los servicios
    container.innerHTML = "";

    querySnapshot.forEach((doc) => {
      const data = doc.data();

      const card = `
        <div class="card">
          <img src="${data.image}" alt="${data.name}">
          <h3>${data.name}</h3>
          <p>$${data.price}</p>
          <p>${data.duration} min</p>
          <button>Reservar</button>
        </div>
      `;

      container.innerHTML += card;
    });
  } catch (error) {
    console.error("Error cargando servicios:", error);
    container.innerHTML = "<p>Error cargando los servicios. Intenta de nuevo más tarde.</p>";
  }
}

// Ejecutamos la función al cargar la página
loadServices();
</script>

// Ejecutamos la función al cargar la página
loadServices();
</script>
