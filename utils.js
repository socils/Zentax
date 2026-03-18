// ===== ZENTAX UTILS - FIREBASE BACKEND + CACHE LOCAL =====

// La inicialización y la configuración de Firebase viven en `firebase.js`.
// Aquí importamos las instancias compartidas para evitar inicializar dos veces.
import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// LOCAL CACHE (para mantener compatibilidad con el código existente que espera API síncrona)
// Guardamos un caché local después de operaciones Firebase para que las páginas no requieran cambios.

function writeLocalSession(session) {
  try {
    localStorage.setItem("zentax_session", JSON.stringify(session));
  } catch (e) {
    console.warn("No se pudo escribir sesión en localStorage:", e);
  }
}

function writeLocalData(uid, data) {
  try {
    const all = JSON.parse(localStorage.getItem("zentax_data")) || {};
    all[uid] = data;
    localStorage.setItem("zentax_data", JSON.stringify(all));
  } catch (e) {
    console.warn("No se pudo escribir data en localStorage:", e);
  }
}

function readLocalData(uid) {
  try {
    const all = JSON.parse(localStorage.getItem("zentax_data")) || {};
    return all[uid] || null;
  } catch (e) {
    return null;
  }
}

// ===== RUTINAS DE AUTENTICACIÓN (reemplazan localStorage) =====

export async function registrarUsuario(email, password, username) {
  // Crea usuario en Firebase Auth y documentos en Firestore
  try {
    if (!email || !password || !username) throw new Error("Todos los campos son obligatorios");
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Crear doc de perfil
    await setDoc(doc(db, "users", uid), {
      email: email.toLowerCase(),
      username: username.trim(),
      createdAt: serverTimestamp()
    });

    // Crear doc de datos
    const initialData = {
      trades: [],
      reports: [],
      links: [],
      reputation: 0,
      badges: [],
      lastActive: serverTimestamp()
    };
    await setDoc(doc(db, "data", uid), initialData);

    const session = { email: email.toLowerCase(), uid, username: username.trim(), loginTime: new Date().toISOString() };
    writeLocalSession(session); // cache local para compatibilidad
    writeLocalData(uid, initialData);

    return session;
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function iniciarSesion(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Obtener perfil y datos desde Firestore
    const userSnap = await getDoc(doc(db, "users", uid));
    const dataSnap = await getDoc(doc(db, "data", uid));

    const username = userSnap.exists() ? userSnap.data().username : email.split("@")[0];
    const data = dataSnap.exists() ? dataSnap.data() : { trades: [], reports: [], links: [], reputation: 0, badges: [] };

    const session = { email: email.toLowerCase(), uid, username, loginTime: new Date().toISOString() };
    writeLocalSession(session);
    writeLocalData(uid, data);

    return session;
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function cerrarSesion() {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn("Error al cerrar sesión en Firebase:", e);
  }
  try { localStorage.removeItem("zentax_session"); } catch (e) {}
}

export function obtenerSesion() {
  // Mantener compatibilidad: devolver caché local si existe
  try {
    const s = localStorage.getItem("zentax_session");
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

export function verificarSesion() {
  // Devuelve sesión cacheada para no romper páginas síncronas.
  const s = obtenerSesion();
  if (!s) {
    // Intentar verificar con Firebase asíncrono en background
    onAuthStateChanged(auth, async (user) => {
      if (!user) window.location.href = "index.html";
    });
    return null;
  }
  return s;
}

// ===== GESTIÓN DE DATOS DEL USUARIO (Firestore) =====

export function obtenerDatosUsuario(uid) {
  // Devuelve datos cacheados (síncrono). Para datos actualizados, usar syncDatosUsuario.
  return readLocalData(uid);
}

export async function syncDatosUsuario(uid) {
  // Trae datos desde Firestore y actualiza cache local
  try {
    const snap = await getDoc(doc(db, "data", uid));
    if (!snap.exists()) return null;
    const datos = snap.data();
    writeLocalData(uid, datos);
    return datos;
  } catch (e) {
    console.error("Error al sincronizar datos:", e);
    return null;
  }
}

export async function guardarDatosUsuario(uid, datos) {
  // Actualiza Firestore y cache local
  try {
    // Merge local copy first
    const local = readLocalData(uid) || {};
    const merged = { ...local, ...datos };
    writeLocalData(uid, merged);

    // Actualizar Firestore
    await setDoc(doc(db, "data", uid), merged, { merge: true });
  } catch (e) {
    console.error("Error al guardar datos en Firestore:", e);
  }
}

export async function obtenerPerfilPublico(username) {
  try {
    // Buscamos en la colección 'users' (no indexado aquí, hacemos get a todos - para proyectos pequeños)
    // NOTA: en producción usar queries y campos indexados.
    const usersCache = []; // We'll rely on local cache first
    const allLocal = JSON.parse(localStorage.getItem("zentax_users")) || {};
    for (const [email, user] of Object.entries(allLocal)) usersCache.push(user);
    const found = usersCache.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (found) {
      const datos = readLocalData(found.uid);
      return { username: found.username, uid: found.uid, createdAt: found.createdAt, ...datos };
    }
    // fallback: try Firestore (costly)
    // Not implemented: keep compatibility
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export function buscarUsuarios(termino) {
  // Usar cache local
  try {
    const users = JSON.parse(localStorage.getItem("zentax_users")) || {};
    const terminoLower = termino.toLowerCase();
    const resultados = [];
    for (const [email, user] of Object.entries(users)) {
      if (user.username.toLowerCase().includes(terminoLower)) {
        const datos = readLocalData(user.uid);
        resultados.push({ username: user.username, uid: user.uid, reputation: datos?.reputation || 0, tradesCount: datos?.trades?.length || 0, badges: datos?.badges || [] });
      }
    }
    return resultados;
  } catch (e) {
    console.error(e);
    return [];
  }
}

// ===== UTILIDADES INALTERADAS =====

export function formatearFecha(isoDate) {
  const fecha = new Date(isoDate);
  return fecha.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
}

export function calcularDiasActivo(isoDate) {
  const ahora = new Date();
  const fecha = new Date(isoDate);
  const diff = ahora - fecha;
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dias;
}

// Nota: dejamos funciones de negocio (trades, reports, reputación) sin cambios
// ya que utilizan obtenerDatosUsuario/guardarDatosUsuario, que ahora sincronizan con Firestore.

