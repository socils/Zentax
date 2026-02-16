import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJRXxciCtrnUuJxxfngUVFdtfVI8fKoAs",
  authDomain: "zentax-b8382.firebaseapp.com",
  projectId: "zentax-b8382",
  storageBucket: "zentax-b8382.firebasestorage.app",
  messagingSenderId: "1009345680314",
  appId: "1:1009345680314:web:441c017a0229e526c00383"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let sessionUnsubscribe = null;

// ===== AUTENTICACIÓN =====

export async function registrar(email, password, username) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    const ahora = new Date();
    
    await setDoc(doc(db, "users", uid), {
      email: email.toLowerCase(),
      username: username.trim(),
      uid,
      reputation: 0,
      tradesCount: 0,
      badges: [],
      linkedAccounts: [],
      createdAt: ahora,
      lastActive: ahora
    });
    
    return uid;
  } catch (error) {
    console.error("Error en registrar:", error);
    throw new Error(error.message);
  }
}

export async function iniciarSesion(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user.uid;
  } catch (error) {
    console.error("Error en iniciarSesion:", error);
    throw new Error(error.message);
  }
}

export async function cerrarSesion() {
  try {
    if (sessionUnsubscribe) sessionUnsubscribe();
    await signOut(auth);
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    throw new Error(error.message);
  }
}

export function detectarSesion(callback) {
  sessionUnsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const perfil = await obtenerUsuario(user.uid);
        callback(user.uid, perfil);
      } catch (error) {
        console.error("Error al obtener perfil:", error);
        callback(user.uid, null);
      }
    } else {
      callback(null, null);
    }
  });
  
  return sessionUnsubscribe;
}

export function getCurrentUser() {
  return auth.currentUser;
}

// ===== USUARIOS =====

export async function obtenerUsuario(uid) {
  try {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (docSnap.exists()) {
      return { uid: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    return null;
  }
}

export async function buscarPorUsername(username) {
  try {
    const q = query(collection(db, "users"), where("username", "==", username.trim()));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { uid: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error("Error en búsqueda:", error);
    return null;
  }
}

export async function buscarUsuarios(termino) {
  try {
    const terminoLower = termino.toLowerCase().trim();
    const usuarios = [];
    
    const querySnapshot = await getDocs(collection(db, "users"));
    querySnapshot.forEach(doc => {
      const username = doc.data().username.toLowerCase();
      if (username.includes(terminoLower)) {
        usuarios.push({ uid: doc.id, ...doc.data() });
      }
    });
    
    return usuarios;
  } catch (error) {
    console.error("Error en búsqueda múltiple:", error);
    return [];
  }
}

export async function actualizarUsuario(uid, datos) {
  try {
    await updateDoc(doc(db, "users", uid), {
      ...datos,
      lastActive: new Date()
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    throw new Error(error.message);
  }
}

// ===== TRADES =====

export async function crearTrade(user1, user2, items, evidencia = "") {
  try {
    const ahora = new Date();
    const docRef = await addDoc(collection(db, "trades"), {
      user1,
      user2,
      items,
      evidencia,
      status: "pending",
      createdAt: ahora,
      user1Confirmed: false,
      user2Confirmed: false
    });
    return docRef.id;
  } catch (error) {
    console.error("Error al crear trade:", error);
    throw new Error(error.message);
  }
}

export async function obtenerTodosTrades(uid) {
  try {
    const querySnapshot = await getDocs(collection(db, "trades"));
    const trades = [];
    
    querySnapshot.forEach(doc => {
      const trade = doc.data();
      if (trade.user1 === uid || trade.user2 === uid) {
        trades.push({ id: doc.id, ...trade });
      }
    });
    
    return trades;
  } catch (error) {
    console.error("Error al obtener trades:", error);
    return [];
  }
}

export async function confirmarTrade(tradeId, uid) {
  try {
    const tradeRef = doc(db, "trades", tradeId);
    const tradeSnap = await getDoc(tradeRef);
    
    if (!tradeSnap.exists()) throw new Error("Trade no encontrado");
    
    const trade = tradeSnap.data();
    
    if (trade.user1 === uid) {
      await updateDoc(tradeRef, { user1Confirmed: true });
    } else if (trade.user2 === uid) {
      await updateDoc(tradeRef, { user2Confirmed: true });
    }
    
    const tradeActualizado = await getDoc(tradeRef);
    const tradeData = tradeActualizado.data();
    
    if (tradeData.user1Confirmed && tradeData.user2Confirmed) {
      await updateDoc(tradeRef, { status: "completed" });
      
      // Aumentar reputación
      await aumentarReputacion(trade.user1, 10);
      await aumentarReputacion(trade.user2, 10);
      
      // Aumentar contador de trades
      const user1Ref = await getDoc(doc(db, "users", trade.user1));
      const user2Ref = await getDoc(doc(db, "users", trade.user2));
      
      await updateDoc(doc(db, "users", trade.user1), { 
        tradesCount: (user1Ref.data().tradesCount || 0) + 1 
      });
      await updateDoc(doc(db, "users", trade.user2), { 
        tradesCount: (user2Ref.data().tradesCount || 0) + 1 
      });
      
      // Verificar insignias
      await verificarInsignias(trade.user1);
      await verificarInsignias(trade.user2);
    }
  } catch (error) {
    console.error("Error al confirmar trade:", error);
    throw new Error(error.message);
  }
}

// ===== REPORTES =====

export async function crearReporte(reporterUid, reportedUid, razon, evidencia = "") {
  try {
    const ahora = new Date();
    await addDoc(collection(db, "reports"), {
      reporterUid,
      reportedUid,
      reason: razon,
      evidenceText: evidencia,
      status: "pending",
      createdAt: ahora
    });
    
    // Disminuir reputación
    await disminuirReputacion(reportedUid, 5);
  } catch (error) {
    console.error("Error al crear reporte:", error);
    throw new Error(error.message);
  }
}

export async function obtenerReportes() {
  try {
    const querySnapshot = await getDocs(collection(db, "reports"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error al obtener reportes:", error);
    return [];
  }
}

export async function obtenerReportesDeUsuario(uid) {
  try {
    const q = query(collection(db, "reports"), where("reporterUid", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error al obtener reportes del usuario:", error);
    return [];
  }
}

// ===== VINCULACIÓN DE CUENTAS =====

export async function vincularCuenta(uid, plataforma, usuario) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) throw new Error("Usuario no encontrado");
    
    let linkedAccounts = userSnap.data().linkedAccounts || [];
    
    const index = linkedAccounts.findIndex(acc => acc.platform === plataforma);
    if (index > -1) {
      linkedAccounts[index].username = usuario;
    } else {
      linkedAccounts.push({ platform: plataforma, username: usuario });
    }
    
    await updateDoc(userRef, { linkedAccounts });
  } catch (error) {
    console.error("Error al vincular cuenta:", error);
    throw new Error(error.message);
  }
}

export async function desvincularCuenta(uid, plataforma) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) throw new Error("Usuario no encontrado");
    
    let linkedAccounts = userSnap.data().linkedAccounts || [];
    linkedAccounts = linkedAccounts.filter(acc => acc.platform !== plataforma);
    
    await updateDoc(userRef, { linkedAccounts });
  } catch (error) {
    console.error("Error al desvincular cuenta:", error);
    throw new Error(error.message);
  }
}

// ===== REPUTACIÓN E INSIGNIAS =====

export async function aumentarReputacion(uid, cantidad) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const reputacionActual = userSnap.data().reputation || 0;
      await updateDoc(userRef, { reputation: reputacionActual + cantidad });
    }
  } catch (error) {
    console.error("Error al aumentar reputación:", error);
  }
}

export async function disminuirReputacion(uid, cantidad) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const reputacionActual = userSnap.data().reputation || 0;
      const nuevaReputacion = Math.max(0, reputacionActual - cantidad);
      await updateDoc(userRef, { reputation: nuevaReputacion });
    }
  } catch (error) {
    console.error("Error al disminuir reputación:", error);
  }
}

export async function agregarInsignia(uid, insignia) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      let insignias = userSnap.data().badges || [];
      if (!insignias.includes(insignia)) {
        insignias.push(insignia);
        await updateDoc(userRef, { badges: insignias });
      }
    }
  } catch (error) {
    console.error("Error al agregar insignia:", error);
  }
}

async function verificarInsignias(uid) {
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) return;
    
    const user = userSnap.data();
    const tradesCount = user.tradesCount || 0;
    const reputation = user.reputation || 0;
    
    if (tradesCount === 1) await agregarInsignia(uid, "🎯 Primer Trade");
    if (tradesCount === 10) await agregarInsignia(uid, "⭐ 10 Trades");
    if (tradesCount === 50) await agregarInsignia(uid, "💎 50 Trades");
    if (tradesCount === 100) await agregarInsignia(uid, "👑 100 Trades");
    if (reputation >= 100) await agregarInsignia(uid, "🔥 Trader Confiable");
    if (reputation >= 500) await agregarInsignia(uid, "🌟 Top Trader");
  } catch (error) {
    console.error("Error al verificar insignias:", error);
  }
}

export async function cerrarSesion() {
  try {
    await signOut(auth);
  } catch (error) {
    throw new Error(error.message);
  }
}

export function detectarSesion(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const perfil = await obtenerUsuario(user.uid);
      callback(user.uid, perfil);
    } else {
      callback(null, null);
    }
  });
}

// ===== USUARIOS =====

export async function obtenerUsuario(uid) {
  try {
    const docSnap = await getDoc(doc(db, "users", uid));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    return null;
  }
}

export async function buscarPorUsername(username) {
  try {
    const q = query(collection(db, "users"), where("username", "==", username));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { uid: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error("Error en búsqueda:", error);
    return null;
  }
}

export async function buscarUsuarios(termino) {
  try {
    const q = query(collection(db, "users"), where("username", ">=", termino), where("username", "<=", termino + "\uf8ff"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error en búsqueda múltiple:", error);
    return [];
  }
}

export async function actualizarUsuario(uid, datos) {
  try {
    await updateDoc(doc(db, "users", uid), datos);
  } catch (error) {
    throw new Error(error.message);
  }
}

// ===== TRADES =====

export async function crearTrade(user1, user2, items, evidencia = "") {
  try {
    const docRef = await addDoc(collection(db, "trades"), {
      user1,
      user2,
      items,
      evidencia,
      status: "pending",
      createdAt: serverTimestamp(),
      user1Confirmed: false,
      user2Confirmed: false
    });
    return docRef.id;
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function obtenerTrades(uid) {
  try {
    const q = query(collection(db, "trades"), where("user1", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error al obtener trades:", error);
    return [];
  }
}

export async function obtenerTodosTrades(uid) {
  try {
    const q = query(collection(db, "trades"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(trade => trade.user1 === uid || trade.user2 === uid);
  } catch (error) {
    console.error("Error al obtener todos trades:", error);
    return [];
  }
}

export async function confirmarTrade(tradeId, uid) {
  try {
    const tradeRef = doc(db, "trades", tradeId);
    const tradeSnap = await getDoc(tradeRef);
    const trade = tradeSnap.data();
    
    if (trade.user1 === uid) {
      await updateDoc(tradeRef, { user1Confirmed: true });
    } else if (trade.user2 === uid) {
      await updateDoc(tradeRef, { user2Confirmed: true });
    }
    
    const tradeActualizado = await getDoc(tradeRef);
    if (tradeActualizado.data().user1Confirmed && tradeActualizado.data().user2Confirmed) {
      await updateDoc(tradeRef, { status: "completed" });
      
      // Aumentar reputación
      await aumentarReputacion(trade.user1, 10);
      await aumentarReputacion(trade.user2, 10);
      
      // Aumentar contador de trades
      const user1Ref = await getDoc(doc(db, "users", trade.user1));
      const user2Ref = await getDoc(doc(db, "users", trade.user2));
      
      await updateDoc(doc(db, "users", trade.user1), { tradesCount: (user1Ref.data().tradesCount || 0) + 1 });
      await updateDoc(doc(db, "users", trade.user2), { tradesCount: (user2Ref.data().tradesCount || 0) + 1 });
      
      // Agregar insignias
      verificarInsignias(trade.user1);
      verificarInsignias(trade.user2);
    }
  } catch (error) {
    throw new Error(error.message);
  }
}

// ===== REPORTES =====

export async function crearReporte(reporterUid, reportedUid, razon, evidencia = "") {
  try {
    await addDoc(collection(db, "reports"), {
      reporterUid,
      reportedUid,
      reason: razon,
      evidenceText: evidencia,
      status: "pending",
      createdAt: serverTimestamp()
    });
    
    // Disminuir reputación del reportado
    await disminuirReputacion(reportedUid, 5);
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function obtenerReportes() {
  try {
    const querySnapshot = await getDocs(collection(db, "reports"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error al obtener reportes:", error);
    return [];
  }
}

export async function obtenerReportesDeUsuario(uid) {
  try {
    const q = query(collection(db, "reports"), where("reportedUid", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error al obtener reportes del usuario:", error);
    return [];
  }
}

// ===== VINCULACIÓN DE CUENTAS =====

export async function vincularCuenta(uid, plataforma, usuario) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    const linkedAccounts = userSnap.data().linkedAccounts || [];
    
    const index = linkedAccounts.findIndex(acc => acc.platform === plataforma);
    if (index > -1) {
      linkedAccounts[index].username = usuario;
    } else {
      linkedAccounts.push({ platform: plataforma, username: usuario });
    }
    
    await updateDoc(userRef, { linkedAccounts });
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function desvincularCuenta(uid, plataforma) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    let linkedAccounts = userSnap.data().linkedAccounts || [];
    
    linkedAccounts = linkedAccounts.filter(acc => acc.platform !== plataforma);
    await updateDoc(userRef, { linkedAccounts });
  } catch (error) {
    throw new Error(error.message);
  }
}

// ===== REPUTACIÓN E INSIGNIAS =====

export async function aumentarReputacion(uid, cantidad) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    const reputacionActual = userSnap.data().reputation || 0;
    
    await updateDoc(userRef, { reputation: reputacionActual + cantidad });
  } catch (error) {
    console.error("Error al aumentar reputación:", error);
  }
}

export async function disminuirReputacion(uid, cantidad) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    const reputacionActual = userSnap.data().reputation || 0;
    
    const nuevaReputacion = Math.max(0, reputacionActual - cantidad);
    await updateDoc(userRef, { reputation: nuevaReputacion });
  } catch (error) {
    console.error("Error al disminuir reputación:", error);
  }
}

export async function agregarInsignia(uid, insignia) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    let insignias = userSnap.data().badges || [];
    
    if (!insignias.includes(insignia)) {
      insignias.push(insignia);
      await updateDoc(userRef, { badges: insignias });
    }
  } catch (error) {
    console.error("Error al agregar insignia:", error);
  }
}

async function verificarInsignias(uid) {
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    const user = userSnap.data();
    const tradesCount = user.tradesCount || 0;
    const reputation = user.reputation || 0;
    
    if (tradesCount === 1) await agregarInsignia(uid, "🎯 Primer Trade");
    if (tradesCount === 10) await agregarInsignia(uid, "⭐ 10 Trades");
    if (tradesCount === 50) await agregarInsignia(uid, "💎 50 Trades");
    if (tradesCount === 100) await agregarInsignia(uid, "👑 100 Trades");
    if (reputation >= 100) await agregarInsignia(uid, "🔥 Trader Confiable");
    if (reputation >= 500) await agregarInsignia(uid, "🌟 Top Trader");
  } catch (error) {
    console.error("Error al verificar insignias:", error);
  }
}
