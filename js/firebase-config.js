<script type="module">
  // Import Firebase desde CDN
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
  import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

  // Configuración de tu proyecto
  const firebaseConfig = {
    apiKey: "AIzaSyDFsFLw518RovvIPGcIzFDrih4oKBKgz-o",
    authDomain: "women-secret-nails.firebaseapp.com",
    projectId: "women-secret-nails",
    storageBucket: "women-secret-nails.firebasestorage.app",
    messagingSenderId: "245460116956",
    appId: "1:245460116956:web:a0881d15b5bbf76119db19"
  };

  // Inicializar Firebase
  const app = initializeApp(firebaseConfig);
  export const db = getFirestore(app);
</script>
