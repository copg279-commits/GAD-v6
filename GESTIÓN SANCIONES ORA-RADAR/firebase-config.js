// Nombre de la tabla/documento a gestionar
const DB_REF = 'denuncias_global_ORA-RADAR';

// Configuración de tu proyecto Firebase
const firebaseConfig = {
    apiKey: "AIzaSyA6EDUJ2dG50DphB-dF6GLi3P2IlW8lDz4",
    authDomain: "gad-alicante-v3.firebaseapp.com",
    databaseURL: "https://gad-alicante-v3-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "gad-alicante-v3",
    storageBucket: "gad-alicante-v3.firebasestorage.app",
    messagingSenderId: "906986258369",
    appId: "1:906986258369:web:21a7ea29a33b5f395e3940"
};

// Inicializar la aplicación
firebase.initializeApp(firebaseConfig);
const database = firebase.database();