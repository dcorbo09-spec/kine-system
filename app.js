// ============================================================
// KINE SYSTEM – PWA Logic
// app.js
// ============================================================

const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxOSsNkuWoq52XonlJIcNLck3wrdyHVXH38fQb_P-VpNS1urxPFu2qh5bctykflPH8sKg/exec";

const state = {
  usuario:       null,
  pacientes:     [],
  tratamientos:  [],
  pacienteSelec: null,
  estadoSelec:   null
};

// ============================================================
// INICIALIZACIÓN
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // Service Worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Vincular eventos
  bindEvents();

  // Verificar sesión guardada
  const sesion = getSesion();
  if (sesion) {
    state.usuario = sesion;
    inicializarApp();
  } else {
    mostrarScreen("login");
    setTimeout(() => document.getElementById("login-email").focus(), 300);
  }
});

function bindEvents() {
  // LOGIN
  document.getElementById("btn-ingresar").addEventListener("click", iniciarSesion);
  document.getElementById("login-email").addEventListener("keydown", e => {
    if (e.key === "Enter") iniciarSesion();
  });

  // SALIR
  document.getElementById("btn-salir").addEventListener("click", logout);

  // BÚSQUEDA
  document.getElementById("search-input").addEventListener("input", e => {
    buscarPaciente(e.target.value);
  });

  // NUEVO PACIENTE
  document.getElementById("btn-nuevo-paciente").addEventListener("click", () => {
    mostrarScreen("nuevo");
  });

  // TRATAMIENTO
  document.getElementById("select-tratamiento").addEventListener("change", validarFormulario);

  // ESTADOS
  document.querySelectorAll(".estado-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const valor = btn.getAttribute("data-estado");
      seleccionarEstado(btn, valor);
    });
  });

  // CONFIRMAR
  document.getElementById("btn-confirmar").addEventListener("click", confirmarSesion);

  // VOLVER / CANCELAR
  document.getElementById("btn-volver").addEventListener("click", volverAlHome);
  document.getElementById("btn-otra").addEventListener("click", volverAlHome);
  document.getElementById("btn-cancelar-nuevo").addEventListener("click", volverAlHome);

  // GUARDAR NUEVO PACIENTE
  document.getElementById("btn-guardar-nuevo").addEventListener("click", guardarNuevoPaciente);
}

async function inicializarApp() {
  mostrarUsuario();
  mostrarScreen("loading");

  try {
    const [pacResp, tratResp] = await Promise.all([
      apiPost({ action: "getPacientes", email: state.usuario.email }),
      apiPost({ action: "getTratamientos", email: state.usuario.email })
    ]);

    if (pacResp.ok)  state.pacientes    = pacResp.pacientes;
    if (tratResp.ok) {
      state.tratamientos = tratResp.tratamientos;
      poblarTratamientos();
    }

    mostrarScreen("home");
    setTimeout(() => document.getElementById("search-input").focus(), 300);

  } catch (err) {
    alert("Error conectando al servidor: " + err.message);
    mostrarScreen("home");
  }
}

// ============================================================
// AUTH
// ============================================================

async function iniciarSesion() {
  const email   = document.getElementById("login-email").value.trim().toLowerCase();
  const btn     = document.getElementById("btn-ingresar");
  const errorEl = document.getElementById("login-error");

  errorEl.style.display = "none";

  if (!email) {
    errorEl.textContent   = "Ingresá tu email";
    errorEl.style.display = "block";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Verificando...";

  try {
    const resp = await apiPost({ action: "loginEmail", email });

    if (resp.ok) {
      state.usuario = { email, nombre: resp.nombre };
      guardarSesion(state.usuario);
      await inicializarApp();
    } else {
      errorEl.textContent   = resp.error || "Email no autorizado.";
      errorEl.style.display = "block";
    }

  } catch (err) {
    errorEl.textContent   = "Error de conexión. Verificá tu internet.";
    errorEl.style.display = "block";
  } finally {
    btn.disabled    = false;
    btn.textContent = "Ingresar →";
  }
}

function logout() {
  if (!confirm("¿Cerrar sesión?")) return;
  localStorage.removeItem("kine_sesion");
  state.usuario    = null;
  state.pacientes  = [];
  document.getElementById("btn-salir").style.display      = "none";
  document.getElementById("topbar-user").style.display    = "none";
  document.getElementById("login-email").value            = "";
  document.getElementById("login-error").style.display    = "none";
  mostrarScreen("login");
}

// ============================================================
// BÚSQUEDA
// ============================================================

function buscarPaciente(query) {
  const container = document.getElementById("results-container");
  query = query.trim().toLowerCase();

  if (!query) { container.innerHTML = ""; return; }

  const resultados = state.pacientes.filter(p => {
    const nombre = (p.apellido + " " + p.nombre).toLowerCase();
    const dni    = (p.dni || "").toString();
    return nombre.includes(query) || dni.startsWith(query);
  });

  if (resultados.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        😕 No encontramos al paciente<br>
        <small>¿Querés registrarlo como nuevo?</small>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="results-list" id="results-list"></div>`;
  const list = document.getElementById("results-list");

  resultados.slice(0, 10).forEach(p => {
    const restantes  = (p.sesionesAut || 0) - (p.sesionesConsumidas || 0);
    const badgeClass = restantes <= 0 ? "badge-danger" : restantes <= 2 ? "badge-warning" : "badge-ok";
    const badgeText  = restantes > 0 ? `${restantes} ses. restantes` : "⚠️ Sin sesiones";

    const card = document.createElement("div");
    card.className = "patient-card";
    card.innerHTML = `
      <div class="patient-info">
        <div class="patient-name">${p.apellido}, ${p.nombre}</div>
        <div class="patient-meta">
          DNI: ${p.dni} · ${p.obraSocial || "Sin OS"}
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>
      <span class="chevron">›</span>`;

    card.addEventListener("click", () => seleccionarPaciente(p.id));
    list.appendChild(card);
  });
}

// ============================================================
// REGISTRO
// ============================================================

async function seleccionarPaciente(idPaciente) {
  const p = state.pacientes.find(x => x.id === idPaciente);
  if (!p) return;

  state.pacienteSelec = p;
  state.estadoSelec   = null;

  document.getElementById("select-tratamiento").value = "";
  document.getElementById("nota-sesion").value        = "";
  document.querySelectorAll(".estado-btn").forEach(b => b.classList.remove("selected"));
  document.getElementById("btn-confirmar").disabled   = true;

  // Card del paciente
  const consumidas  = p.sesionesConsumidas || 0;
  const autorizadas = p.sesionesAut || 0;
  const restantes   = autorizadas - consumidas;
  const porcentaje  = autorizadas > 0 ? Math.min((consumidas / autorizadas) * 100, 100) : 0;

  let badgeClass    = "badge-ok";
  let progressClass = "";
  if (restantes <= 0)      { badgeClass = "badge-danger";  progressClass = "danger"; }
  else if (restantes <= 2) { badgeClass = "badge-warning"; progressClass = "warn";   }

  document.getElementById("reg-card-paciente").innerHTML = `
    <div class="reg-card-header">
      <div class="reg-name">${p.apellido}, ${p.nombre}</div>
      <span class="badge ${badgeClass}">${restantes > 0 ? restantes + " rest." : "⚠️ Sin ses."}</span>
    </div>
    <div class="reg-grid">
      <div class="reg-item"><label>DNI</label><span>${p.dni}</span></div>
      <div class="reg-item"><label>Obra Social</label><span>${p.obraSocial || "Particular"}</span></div>
      <div class="reg-item"><label>Plan</label><span>${p.plan || "—"}</span></div>
      <div class="reg-item"><label>Médico</label><span>${p.medicoDer || "—"}</span></div>
    </div>
    <div class="sesiones-row">
      <div>
        <div class="ses-label">Sesiones consumidas</div>
        <div class="progress-bar">
          <div class="progress-fill ${progressClass}" style="width:${porcentaje}%"></div>
        </div>
      </div>
      <div class="ses-count">${consumidas}<span> / ${autorizadas}</span></div>
    </div>`;

  // Alerta sesiones
  const alertaEl = document.getElementById("alerta-sesiones");
  if (restantes <= 0) {
    alertaEl.className     = "alerta-box danger";
    alertaEl.style.display = "block";
    alertaEl.textContent   = "⛔ Este paciente agotó las sesiones autorizadas. Verificá antes de continuar.";
  } else if (restantes <= 2) {
    alertaEl.className     = "alerta-box";
    alertaEl.style.display = "block";
    alertaEl.textContent   = `⚠️ Quedan solo ${restantes} sesión/es autorizadas.`;
  } else {
    alertaEl.style.display = "none";
  }

  // Última sesión
  try {
    const resp = await apiPost({
      action: "getUltimasSesiones",
      email: state.usuario.email,
      idPaciente: p.id
    });

    const container = document.getElementById("ultima-sesion-container");
    if (resp.ok && resp.sesiones.length > 0) {
      const u = resp.sesiones[0];
      container.innerHTML = `
        <div class="ultima-sesion-box">
          <strong>Última sesión: ${u.fecha} – ${u.hora}</strong>
          Kine: ${u.kinesiologo} · ${u.tratamiento} · ${formatEstado(u.estadoPaciente)}
          ${u.nota ? `<br><em>"${u.nota}"</em>` : ""}
        </div>`;
    } else {
      container.innerHTML = `
        <div class="ultima-sesion-box" style="border-color: var(--text3); color: var(--text3);">
          🆕 Primera sesión del paciente
        </div>`;
      const primerBtn = document.querySelector('[data-estado="PRIMERA_SESION"]');
      if (primerBtn) seleccionarEstado(primerBtn, "PRIMERA_SESION");
    }
  } catch(e) {
    document.getElementById("ultima-sesion-container").innerHTML = "";
  }

  mostrarScreen("registro");
}

function seleccionarEstado(btn, valor) {
  document.querySelectorAll(".estado-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  state.estadoSelec = valor;
  validarFormulario();
}

function validarFormulario() {
  const ok = document.getElementById("select-tratamiento").value && state.estadoSelec;
  document.getElementById("btn-confirmar").disabled = !ok;
}

async function confirmarSesion() {
  const btn = document.getElementById("btn-confirmar");
  btn.disabled    = true;
  btn.textContent = "Guardando...";

  const p = state.pacienteSelec;

  try {
    const resp = await apiPost({
      action:           "registrarSesion",
      email:            state.usuario.email,
      idPaciente:       p.id,
      apellidoPaciente: p.apellido,
      nombrePaciente:   p.nombre,
      dniPaciente:      p.dni,
      obraSocial:       p.obraSocial,
      tratamiento:      document.getElementById("select-tratamiento").value,
      estadoPaciente:   state.estadoSelec,
      nota:             document.getElementById("nota-sesion").value.trim(),
      dispositivo:      "pwa"
    });

    if (resp.ok) {
      // Actualizar contador local
      const idx = state.pacientes.findIndex(x => x.id === p.id);
      if (idx >= 0) state.pacientes[idx].sesionesConsumidas = (state.pacientes[idx].sesionesConsumidas || 0) + 1;

      const ahora = new Date();
      const hora  = ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      const fecha = ahora.toLocaleDateString("es-AR");

      document.getElementById("exito-detalle").innerHTML = `
        <strong>${p.apellido}, ${p.nombre}</strong><br>
        Sesión ${resp.nroSesion} · ${fecha} · ${hora}<br>
        Kinesiólogo: ${state.usuario.nombre}`;

      const alertaExito = document.getElementById("exito-alerta");
      if (resp.alerta) {
        alertaExito.innerHTML = `<div class="alerta-box ${resp.alerta.tipo === 'LIMITE_ALCANZADO' ? 'danger' : ''}" style="display:block">${resp.alerta.mensaje}</div>`;
      } else {
        alertaExito.innerHTML = "";
      }

      document.getElementById("search-input").value        = "";
      document.getElementById("results-container").innerHTML = "";
      mostrarScreen("exito");

    } else {
      alert("Error al guardar: " + resp.error);
      btn.disabled    = false;
      btn.textContent = "✓ CONFIRMAR ATENCIÓN";
    }

  } catch (err) {
    alert("Error de conexión: " + err.message);
    btn.disabled    = false;
    btn.textContent = "✓ CONFIRMAR ATENCIÓN";
  }
}

// ============================================================
// NUEVO PACIENTE
// ============================================================

async function guardarNuevoPaciente() {
  const apellido = document.getElementById("np-apellido").value.trim();
  const nombre   = document.getElementById("np-nombre").value.trim();
  const dni      = document.getElementById("np-dni").value.trim();
  const os       = document.getElementById("np-os").value.trim();
  const sesiones = document.getElementById("np-sesiones").value;

  if (!apellido || !nombre || !dni || !os || !sesiones) {
    alert("Completá los campos obligatorios (*)");
    return;
  }

  const btn = document.getElementById("btn-guardar-nuevo");
  btn.disabled    = true;
  btn.textContent = "Guardando...";

  try {
    const resp = await apiPost({
      action: "altaPaciente",
      email:  state.usuario.email,
      apellido, nombre, dni,
      obraSocial:          os,
      sesionesAutorizadas: parseInt(sesiones),
      nroAfiliado:  document.getElementById("np-afiliado").value.trim(),
      planOS:       document.getElementById("np-plan").value.trim(),
      medicoDer:    document.getElementById("np-medico").value.trim(),
      diagnostico:  document.getElementById("np-diagnostico").value.trim(),
      telefono:     document.getElementById("np-telefono").value.trim()
    });

    if (resp.ok) {
      state.pacientes.push({
        id: resp.id, apellido, nombre, dni,
        obraSocial: os, sesionesAut: parseInt(sesiones), sesionesConsumidas: 0,
        plan: document.getElementById("np-plan").value.trim(),
        medicoDer: document.getElementById("np-medico").value.trim()
      });
      alert(`✓ Paciente ${apellido}, ${nombre} registrado`);
      document.querySelectorAll("#screen-nuevo input").forEach(i => i.value = "");
      volverAlHome();
    } else {
      alert("Error: " + resp.error);
    }

  } catch (err) {
    alert("Error de conexión: " + err.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = "✓ Guardar paciente";
  }
}

// ============================================================
// NAVEGACIÓN
// ============================================================

function mostrarScreen(nombre) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));

  if (nombre === "loading") {
    const home = document.getElementById("screen-home");
    home.classList.add("active");
    document.getElementById("results-container").innerHTML = `
      <div class="loading-wrap">
        <div class="spinner"></div>
        Cargando pacientes...
      </div>`;
    return;
  }

  const el = document.getElementById("screen-" + nombre);
  if (el) el.classList.add("active");
}

function volverAlHome() {
  state.pacienteSelec = null;
  state.estadoSelec   = null;
  document.getElementById("search-input").value         = "";
  document.getElementById("results-container").innerHTML = "";
  mostrarScreen("home");
  setTimeout(() => document.getElementById("search-input").focus(), 300);
}

function mostrarUsuario() {
  document.getElementById("btn-salir").style.display   = "block";
  document.getElementById("topbar-user").style.display = "block";
  document.getElementById("topbar-user").textContent   = state.usuario.nombre;
}

// ============================================================
// HELPERS
// ============================================================

function poblarTratamientos() {
  const select = document.getElementById("select-tratamiento");
  select.innerHTML = '<option value="">Seleccioná un tratamiento...</option>';
  state.tratamientos.forEach(t => {
    const opt       = document.createElement("option");
    opt.value       = t.descripcion;
    opt.textContent = t.descripcion;
    select.appendChild(opt);
  });
}

function formatEstado(estado) {
  const m = {
    PRIMERA_SESION: "🆕 1ra sesión",
    MEJORA:         "📈 Mejora",
    IGUAL:          "➡️ Sin cambios",
    DOLOR:          "😣 Dolor",
    REAGUDIZACION:  "⚠️ Reagudización",
    ALTA:           "✅ Alta"
  };
  return m[estado] || estado;
}

// ============================================================
// API
// ============================================================

async function apiPost(data) {
  const resp = await fetch(BACKEND_URL, {
    method: "POST",
    body: JSON.stringify(data)
  });
  return resp.json();
}

// ============================================================
// STORAGE LOCAL (localStorage, no chrome.storage)
// ============================================================

function guardarSesion(usuario) {
  localStorage.setItem("kine_sesion", JSON.stringify(usuario));
}

function getSesion() {
  try {
    return JSON.parse(localStorage.getItem("kine_sesion"));
  } catch {
    return null;
  }
}
