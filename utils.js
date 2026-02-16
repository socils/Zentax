// ===== ZENTAX UTILS - SISTEMA CENTRALIZADO =====

// ESTRUCTURA DE DATOS
// localStorage: {
//   "zentax_users": { "email": { password, username, uid, createdAt } }
//   "zentax_session": { email, uid }
//   "zentax_data": { "uid": { trades, reports, links } }
// }

// ===== GESTIÓN DE USUARIOS =====

export function inicializarDB() {
  if (!localStorage.getItem("zentax_users")) {
    localStorage.setItem("zentax_users", JSON.stringify({}));
  }
  if (!localStorage.getItem("zentax_data")) {
    localStorage.setItem("zentax_data", JSON.stringify({}));
  }
}

export function registrarUsuario(email, password, username) {
  try {
    const users = JSON.parse(localStorage.getItem("zentax_users")) || {};
    
    // Validaciones
    if (!email || !password || !username) {
      throw new Error("Todos los campos son obligatorios");
    }
    
    if (email.length < 5 || !email.includes("@")) {
      throw new Error("Email inválido");
    }
    
    if (password.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }
    
    if (username.length < 3) {
      throw new Error("El usuario debe tener al menos 3 caracteres");
    }
    
    // Verificar duplicados
    if (users[email.toLowerCase()]) {
      throw new Error("Este email ya está registrado");
    }
    
    // Generar UID
    const uid = "user_" + Date.now();
    
    // Guardar usuario
    users[email.toLowerCase()] = {
      email: email.toLowerCase(),
      password, // En producción usar hash
      username: username.trim(),
      uid,
      createdAt: new Date().toISOString()
    };
    
    localStorage.setItem("zentax_users", JSON.stringify(users));
    
    // Inicializar datos del usuario
    const allData = JSON.parse(localStorage.getItem("zentax_data")) || {};
    allData[uid] = {
      trades: [],
      reports: [],
      links: [],
      reputation: 0,
      badges: [],
      lastActive: new Date().toISOString()
    };
    localStorage.setItem("zentax_data", JSON.stringify(allData));
    
    return { uid, email: email.toLowerCase(), username };
  } catch (error) {
    throw new Error(error.message);
  }
}

export function iniciarSesion(email, password) {
  try {
    const users = JSON.parse(localStorage.getItem("zentax_users")) || {};
    const user = users[email.toLowerCase()];
    
    if (!user) {
      throw new Error("Email no encontrado");
    }
    
    if (user.password !== password) {
      throw new Error("Contraseña incorrecta");
    }
    
    // Guardar sesión
    const session = {
      email: user.email,
      uid: user.uid,
      username: user.username,
      loginTime: new Date().toISOString()
    };
    
    localStorage.setItem("zentax_session", JSON.stringify(session));
    
    return session;
  } catch (error) {
    throw new Error(error.message);
  }
}

export function cerrarSesion() {
  localStorage.removeItem("zentax_session");
}

export function obtenerSesion() {
  try {
    const session = localStorage.getItem("zentax_session");
    return session ? JSON.parse(session) : null;
  } catch (error) {
    console.error("Error al parsear sesión:", error);
    cerrarSesion();
    return null;
  }
}

export function verificarSesion() {
  const session = obtenerSesion();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

// ===== GESTIÓN DE DATOS DEL USUARIO =====

export function obtenerDatosUsuario(uid) {
  try {
    const allData = JSON.parse(localStorage.getItem("zentax_data")) || {};
    return allData[uid] || null;
  } catch (error) {
    console.error("Error al obtener datos:", error);
    return null;
  }
}

export function guardarDatosUsuario(uid, datos) {
  try {
    const allData = JSON.parse(localStorage.getItem("zentax_data")) || {};
    allData[uid] = { ...allData[uid], ...datos };
    localStorage.setItem("zentax_data", JSON.stringify(allData));
  } catch (error) {
    console.error("Error al guardar datos:", error);
  }
}

export function obtenerPerfilPublico(username) {
  try {
    const users = JSON.parse(localStorage.getItem("zentax_users")) || {};
    let usuarioEncontrado = null;
    
    for (const [email, user] of Object.entries(users)) {
      if (user.username.toLowerCase() === username.toLowerCase()) {
        usuarioEncontrado = user;
        break;
      }
    }
    
    if (!usuarioEncontrado) return null;
    
    const datos = obtenerDatosUsuario(usuarioEncontrado.uid);
    return {
      username: usuarioEncontrado.username,
      uid: usuarioEncontrado.uid,
      createdAt: usuarioEncontrado.createdAt,
      ...datos
    };
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    return null;
  }
}

export function buscarUsuarios(termino) {
  try {
    const users = JSON.parse(localStorage.getItem("zentax_users")) || {};
    const terminoLower = termino.toLowerCase();
    const resultados = [];
    
    for (const [email, user] of Object.entries(users)) {
      if (user.username.toLowerCase().includes(terminoLower)) {
        const datos = obtenerDatosUsuario(user.uid);
        resultados.push({
          username: user.username,
          uid: user.uid,
          reputation: datos?.reputation || 0,
          tradesCount: datos?.trades?.length || 0,
          badges: datos?.badges || []
        });
      }
    }
    
    return resultados;
  } catch (error) {
    console.error("Error en búsqueda:", error);
    return [];
  }
}

// ===== SISTEMA DE TRADES =====

export function crearTrade(uid, items, evidencia = "") {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) throw new Error("Usuario no encontrado");
    
    const trade = {
      id: "trade_" + Date.now(),
      items,
      evidencia,
      createdAt: new Date().toISOString(),
      status: "pending",
      confirmedBy: [uid]
    };
    
    datos.trades.push(trade);
    guardarDatosUsuario(uid, datos);
    
    return trade;
  } catch (error) {
    console.error("Error al crear trade:", error);
    throw error;
  }
}

export function obtenerTrades(uid) {
  try {
    const datos = obtenerDatosUsuario(uid);
    return datos?.trades || [];
  } catch (error) {
    console.error("Error al obtener trades:", error);
    return [];
  }
}

export function confirmarTrade(uid, tradeId) {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) throw new Error("Usuario no encontrado");
    
    const trade = datos.trades.find(t => t.id === tradeId);
    if (!trade) throw new Error("Trade no encontrado");
    
    if (!trade.confirmedBy.includes(uid)) {
      trade.confirmedBy.push(uid);
    }
    
    if (trade.confirmedBy.length >= 2) {
      trade.status = "completed";
      agregarReputacion(uid, 10);
    }
    
    guardarDatosUsuario(uid, datos);
    return trade;
  } catch (error) {
    console.error("Error al confirmar trade:", error);
    throw error;
  }
}

// ===== SISTEMA DE REPORTES =====

export function crearReporte(uid, usuarioReportado, razon, evidencia = "") {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) throw new Error("Usuario no encontrado");
    
    const reporte = {
      id: "report_" + Date.now(),
      usuarioReportado,
      razon,
      evidencia,
      createdAt: new Date().toISOString(),
      status: "pending"
    };
    
    datos.reports.push(reporte);
    guardarDatosUsuario(uid, datos);
    
    // Disminuir reputación del reportado
    disminuirReputacion(usuarioReportado, 5);
    
    return reporte;
  } catch (error) {
    console.error("Error al crear reporte:", error);
    throw error;
  }
}

export function obtenerReportes(uid) {
  try {
    const datos = obtenerDatosUsuario(uid);
    return datos?.reports || [];
  } catch (error) {
    console.error("Error al obtener reportes:", error);
    return [];
  }
}

// ===== SISTEMA DE REPUTACIÓN E INSIGNIAS =====

export function agregarReputacion(uid, cantidad) {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) return;
    
    datos.reputation = (datos.reputation || 0) + cantidad;
    verificarInsignias(uid);
    guardarDatosUsuario(uid, datos);
  } catch (error) {
    console.error("Error al agregar reputación:", error);
  }
}

export function disminuirReputacion(uid, cantidad) {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) return;
    
    datos.reputation = Math.max(0, (datos.reputation || 0) - cantidad);
    guardarDatosUsuario(uid, datos);
  } catch (error) {
    console.error("Error al disminuir reputación:", error);
  }
}

export function verificarInsignias(uid) {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) return;
    
    const insignias = [];
    const tradesCount = datos.trades?.filter(t => t.status === "completed").length || 0;
    const reputation = datos.reputation || 0;
    const reportesRecibidos = obtenerReportesRecibidos(uid).length;
    
    // Insignias por trades
    if (tradesCount >= 1) insignias.push("🎯 Primer Trade");
    if (tradesCount >= 10) insignias.push("⭐ 10 Trades");
    if (tradesCount >= 50) insignias.push("💎 50 Trades");
    if (tradesCount >= 100) insignias.push("👑 100 Trades");
    
    // Insignias por reputación
    if (reputation >= 100) insignias.push("🔥 Trader Confiable");
    if (reputation >= 500) insignias.push("🌟 Top Trader");
    
    // Insignias por comportamiento
    if (reportesRecibidos === 0) insignias.push("🛡️ Cuenta Limpia");
    
    datos.badges = [...new Set(insignias)]; // Eliminar duplicados
    guardarDatosUsuario(uid, datos);
  } catch (error) {
    console.error("Error al verificar insignias:", error);
  }
}

export function obtenerReportesRecibidos(uid) {
  try {
    const allData = JSON.parse(localStorage.getItem("zentax_data")) || {};
    const reportes = [];
    
    for (const [, datos] of Object.entries(allData)) {
      if (datos.reports) {
        datos.reports.forEach(r => {
          if (r.usuarioReportado === uid) {
            reportes.push(r);
          }
        });
      }
    }
    
    return reportes;
  } catch (error) {
    console.error("Error al obtener reportes recibidos:", error);
    return [];
  }
}

// ===== GESTIÓN DE CUENTAS VINCULADAS =====

export function vincularCuenta(uid, plataforma, usuario) {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) throw new Error("Usuario no encontrado");
    
    if (!datos.links) datos.links = [];
    
    const index = datos.links.findIndex(l => l.platform === plataforma);
    if (index > -1) {
      datos.links[index].username = usuario;
    } else {
      datos.links.push({ platform: plataforma, username: usuario });
    }
    
    guardarDatosUsuario(uid, datos);
  } catch (error) {
    console.error("Error al vincular cuenta:", error);
    throw error;
  }
}

export function desvincularCuenta(uid, plataforma) {
  try {
    const datos = obtenerDatosUsuario(uid);
    if (!datos) throw new Error("Usuario no encontrado");
    
    datos.links = (datos.links || []).filter(l => l.platform !== plataforma);
    guardarDatosUsuario(uid, datos);
  } catch (error) {
    console.error("Error al desvincular:", error);
    throw error;
  }
}

export function obtenerCuentasVinculadas(uid) {
  try {
    const datos = obtenerDatosUsuario(uid);
    return datos?.links || [];
  } catch (error) {
    console.error("Error al obtener cuentas:", error);
    return [];
  }
}

// ===== UTILIDADES =====

export function formatearFecha(isoDate) {
  const fecha = new Date(isoDate);
  return fecha.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function calcularDiasActivo(isoDate) {
  const ahora = new Date();
  const fecha = new Date(isoDate);
  const diff = ahora - fecha;
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dias;
}

// Inicializar al cargar
inicializarDB();
