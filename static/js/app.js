/* =========================================================
   Turnero NEXUS SPORT multi-página (HTML/CSS/JS)
   Versión estática (Lo arme para GitHub Pages / hosting estático)
   ========================================================= */

/* ---------- Navegación (HTML en raíz) ---------- */
function goPage(name) {
  window.location.href = name;
}

/* ---------- Storage keys ---------- */
const LS = {
  session: "turnero_session_v2",
  reservations: "turnero_reservations_v2",
  sessions: "turnero_sessions_v2"
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let state = {
  user: null,
  selectedDate: startOfDay(new Date()),
  weekStart: startOfWeek(new Date()),
  monthCursor: new Date(),
  view: "WEEK", // WEEK | MONTH
  filters: { activity: "ALL", instructor: "", location: "" }
};

/* =======================
   Seed demo data
   ======================= */
function seedIfEmpty() {
  const existing = loadJSON(LS.sessions, null);
  if (existing && Array.isArray(existing) && existing.length) return;

  const today = startOfDay(new Date());
  const sessions = [];
  const activities = [
    { a: "Padel", i: ["Profe Juan", "Profe Nico"], l: ["Cancha 1", "Cancha 2"], cap: 8 },
    { a: "Pilates", i: ["Laura Pérez"], l: ["Sala A"], cap: 14 },
    { a: "Gym", i: ["Matías Sosa"], l: ["Gimnasio"], cap: 30 },
    { a: "Crossfit", i: ["Profe Vero"], l: ["Box"], cap: 16 }
  ];

  // slots ~30 días
  for (let d = -7; d <= 28; d++) {
    const day = new Date(today);
    day.setDate(today.getDate() + d);

    // 0..2 por día
    const count = (day.getDay() === 0) ? 0 : (day.getDay() % 3);
    for (let k = 0; k < count; k++) {
      const act = activities[(day.getDate() + k) % activities.length];
      const start = new Date(day);
      start.setHours(18 + k, 0, 0, 0);

      const id = cryptoId();
      const booked = Math.max(0, Math.min(act.cap - 1, ((day.getDate() + k * 3) % 6)));

      sessions.push({
        id,
        activity: act.a,
        instructor: act.i[(day.getDate() + k) % act.i.length],
        location: act.l[(day.getDate() + k) % act.l.length],
        capacity: act.cap,
        booked,
        startISO: start.toISOString()
      });
    }
  }

  saveJSON(LS.sessions, sessions);
}

function getClubSessions() {
  return loadJSON(LS.sessions, []);
}

function paidActivitiesForUser(_username) {
  // demo
  return ["Padel", "Pilates", "Gym", "Crossfit"];
}

function requireSessionOrRedirect() {
  const user = loadJSON(LS.session, null);
  if (!user) {
    goPage("index.html");
    return false;
  }
  state.user = user;
  return true;
}

/* =======================
   Reservations
   ======================= */
function getReservations() {
  const r = loadJSON(LS.reservations, []);
  return Array.isArray(r) ? r : [];
}
function saveReservations(list) {
  saveJSON(LS.reservations, Array.isArray(list) ? list : []);
}
function getMyReservations() {
  const all = getReservations();
  const u = state.user?.username;
  return all.filter(r => r.username === u);
}
function getMySlotIds() {
  return new Set(getMyReservations().map(r => r.slotId));
}

/* =======================
   Formatting
   ======================= */
function fmtDateLong(d) {
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
function fmtDateShort(d) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(d) {
  // 06:00 P / 09:30 A
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const isPM = hours >= 12;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12.toString().padStart(2, "0")}:${minutes} ${isPM ? "P" : "A"}`;
}

/* =======================
   Filters
   ======================= */
function slotMatchesFilters(slot) {
  const f = state.filters;
  const activityOK = (f.activity === "ALL") || (slot.activity === f.activity);
  const instOK = (!f.instructor) || (slot.instructor === f.instructor);
  const locOK = (!f.location) || (slot.location === f.location);
  return activityOK && instOK && locOK;
}

function renderFilters() {
  const sessions = getClubSessions();
  const paid = state.user?.paidActivities || [];
  const paidSessions = sessions.filter(s => paid.includes(s.activity));

  const activities = ["ALL", ...unique(paidSessions.map(s => s.activity))];
  const instructors = ["", ...unique(paidSessions.map(s => s.instructor))];
  const locations = ["", ...unique(paidSessions.map(s => s.location))];

  const actSel = $("#filterActivity");
  const instSel = $("#filterInstructor");
  const locSel = $("#filterLocation");

  if (actSel) {
    actSel.innerHTML = activities.map(a => {
      const label = (a === "ALL") ? "Todas (abonadas)" : a;
      return `<option value="${escAttr(a)}">${esc(label)}</option>`;
    }).join("");
    actSel.value = state.filters.activity;
  }
  if (instSel) {
    instSel.innerHTML = instructors.map(i => {
      const label = i ? i : "Todos";
      return `<option value="${escAttr(i)}">${esc(label)}</option>`;
    }).join("");
    instSel.value = state.filters.instructor;
  }
  if (locSel) {
    locSel.innerHTML = locations.map(l => {
      const label = l ? l : "Todos";
      return `<option value="${escAttr(l)}">${esc(label)}</option>`;
    }).join("");
    locSel.value = state.filters.location;
  }

  actSel?.addEventListener("change", () => {
    state.filters.activity = actSel.value;
    renderActivityLegend();
    renderCalendar();
    renderDaySlots();
  });

  instSel?.addEventListener("change", () => {
    state.filters.instructor = instSel.value;
    renderCalendar();
    renderDaySlots();
  });

  locSel?.addEventListener("change", () => {
    state.filters.location = locSel.value;
    renderCalendar();
    renderDaySlots();
  });

  renderActivityLegend();
}

/* =======================
   Leyenda tipo Lexa (Actividades + color)
   ======================= */
function renderActivityLegend() {
  const host = document.querySelector("#activityLegend");
  const actSel = document.querySelector("#filterActivity");
  if (!host || !actSel || !state.user) return;

  const paid = state.user.paidActivities || [];
  if (!paid.length) {
    host.innerHTML = "";
    return;
  }

  const selected = state.filters.activity;
  const list = (selected === "ALL")
    ? paid
    : paid.includes(selected) ? [selected] : [];

  if (!list.length) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = list.map(a => {
    const cls = activityClass(a);
    return `
      <div class="legend-badge ${cls} ${selected === a ? "is-active" : ""}"
           data-act="${escAttr(a)}"
           role="button" tabindex="0">
        <span class="legend-dot" aria-hidden="true"></span>
        <span>${esc(a)}</span>
      </div>
    `;
  }).join("");

  host.querySelectorAll("[data-act]").forEach(el => {
    const a = el.getAttribute("data-act");

    el.addEventListener("click", () => {
      state.filters.activity = (state.filters.activity === a) ? "ALL" : a;
      actSel.value = state.filters.activity;
      renderActivityLegend();
      renderCalendar();
      renderDaySlots();
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  });
}

/* =======================
   Reservar: slots por día
   ======================= */
function slotsForDayAll(dayDate) {
  const paid = state.user.paidActivities;
  const sessions = getClubSessions();
  const myIds = getMySlotIds();

  return sessions
    .filter(s => paid.includes(s.activity))
    .filter(s => sameDay(new Date(s.startISO), dayDate))
    .filter(s => slotMatchesFilters(s))
    .map(s => ({
      ...s,
      available: s.capacity - s.booked,
      alreadyBooked: myIds.has(s.id)
    }))
    .filter(s => s.available > 0 && !s.alreadyBooked)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
}

function availableCountForDay(dayDate) {
  return slotsForDayAll(dayDate).length;
}

/* =======================
   Reservar: calendario
   ======================= */
function renderCalendarHeader() {
  const title = $("#calTitle");
  const sub = $("#calSub");
  if (!title) return;

  if (state.view === "WEEK") {
    const end = new Date(state.weekStart);
    end.setDate(end.getDate() + 6);
    title.textContent = "Semana";
    if (sub) sub.textContent = `${fmtDateShort(state.weekStart)} → ${fmtDateShort(end)}`;
  } else {
    const m = state.monthCursor.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    title.textContent = "Mes";
    if (sub) sub.textContent = m;
  }
}

function setViewSwitchUI() {
  const pillWeek = $("#pillWeek");
  const pillMonth = $("#pillMonth");

  pillWeek?.classList.toggle("active", state.view === "WEEK");
  pillMonth?.classList.toggle("active", state.view === "MONTH");
}

document.getElementById("btnFilterToggle")?.addEventListener("click", () => {
  document.getElementById("filtersBody")?.classList.toggle("open");
});

function bindViewSwitch() {
  const pillWeek = $("#pillWeek");
  const pillMonth = $("#pillMonth");

  pillWeek?.addEventListener("click", () => {
    state.view = "WEEK";
    setViewSwitchUI();
    renderCalendar();
    renderDaySlots();
  });

  pillMonth?.addEventListener("click", () => {
    state.view = "MONTH";
    setViewSwitchUI();
    renderCalendar();
    renderDaySlots();
  });
}

function renderDowHeader() {
  const dow = $("#dowGrid");
  if (!dow) return;
  const labels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  dow.innerHTML = labels.map(d => `<div class="dow">${d}</div>`).join("");
}

/* --- colores por actividad (clase CSS) --- */
function activityClass(name) {
  const k = (name || "").toLowerCase();
  if (k.includes("padel")) return "padel";
  if (k.includes("gym")) return "gym";
  if (k.includes("pilates")) return "pilates";
  if (k.includes("crossfit")) return "crossfit";
  return "other";
}

/* --- pills HTML dentro del mes --- */
function monthPillsHtml(dayDate) {
  const slots = slotsForDayAll(dayDate);
  if (!slots.length) return `<div class="events"></div>`;

  const maxShow = 2;
  const shown = slots.slice(0, maxShow);
  const rest = slots.length - shown.length;

  const pills = shown.map(s => {
    const t = fmtTime(new Date(s.startISO));
    const cls = activityClass(s.activity);
    return `<div class="event-pill ${cls}" data-slot="${escAttr(s.id)}">${esc(t)} ${esc(s.activity)}</div>`;
  }).join("");

  const more = rest > 0 ? `<div class="event-pill more-pill" data-more="1">+${rest} more</div>` : "";
  return `<div class="events">${pills}${more}</div>`;
}

function renderWeekGrid() {
  const weekGrid = $("#weekGrid");
  const monthGrid = $("#monthGrid");
  const dowGrid = $("#dowGrid");

  if (weekGrid) weekGrid.style.display = "grid";
  if (monthGrid) monthGrid.style.display = "none";
  if (dowGrid) dowGrid.style.display = "none";

  if (!weekGrid) return;
  weekGrid.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const day = new Date(state.weekStart);
    day.setDate(day.getDate() + i);

    const count = availableCountForDay(day);

    const cell = document.createElement("div");
    cell.className = "day-cell" + (sameDay(day, state.selectedDate) ? " active" : "");
    cell.innerHTML = `
      <div class="day-name">${esc(day.toLocaleDateString("es-AR", { weekday: "short" }))}</div>
      <div class="day-date">${esc(fmtDateShort(day))}</div>
      <div class="day-meta">${count > 0 ? `${count} con cupos` : `Sin cupos`}</div>
      ${count > 0 ? `<span class="badge ok">Disponible</span>` : `<span class="badge off">—</span>`}
    `;

    cell.addEventListener("click", () => {
      state.selectedDate = startOfDay(day);
      renderWeekGrid();
      renderDaySlots();
    });

    weekGrid.appendChild(cell);
  }
}

function renderMonthGrid() {
  const monthGrid = $("#monthGrid");
  const weekGrid = $("#weekGrid");
  const dowGrid = $("#dowGrid");

  if (monthGrid) monthGrid.style.display = "grid";
  if (weekGrid) weekGrid.style.display = "none";
  if (dowGrid) dowGrid.style.display = "grid";

  if (!monthGrid) return;

  monthGrid.innerHTML = "";
  renderDowHeader();

  const cursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1);
  const firstDay = startOfWeek(cursor);
  const cells = 42;

  for (let i = 0; i < cells; i++) {
    const day = new Date(firstDay);
    day.setDate(day.getDate() + i);

    const inMonth = day.getMonth() === state.monthCursor.getMonth();

    const cell = document.createElement("div");
    cell.className =
      "month-cell" +
      (!inMonth ? " dim" : "") +
      (sameDay(day, state.selectedDate) ? " active" : "");

    cell.innerHTML = `
      <div class="month-num">${day.getDate()}</div>
      ${monthPillsHtml(day)}
    `;

    cell.addEventListener("click", () => {
      state.selectedDate = startOfDay(day);
      state.monthCursor = new Date(day.getFullYear(), day.getMonth(), 1);
      renderCalendar();
      renderDaySlots();
    });

    monthGrid.appendChild(cell);
  }

  monthGrid.querySelectorAll(".event-pill[data-slot]").forEach(p => {
    p.addEventListener("click", (e) => {
      e.stopPropagation();
      const slotId = p.getAttribute("data-slot");
      const sessions = getClubSessions();
      const slot = sessions.find(s => s.id === slotId);
      if (!slot) return;

      const d = startOfDay(new Date(slot.startISO));
      state.selectedDate = d;
      state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);

      renderCalendar();
      renderDaySlots();
    });
  });

  monthGrid.querySelectorAll(".event-pill[data-more]").forEach(p => {
    p.addEventListener("click", (e) => {
      e.stopPropagation();
      renderDaySlots();
    });
  });
}

function renderCalendar() {
  renderCalendarHeader();
  setViewSwitchUI();
  if (state.view === "MONTH") renderMonthGrid();
  else renderWeekGrid();
}

/* =======================
   Panel derecho + chips de actividades
   ======================= */
function renderDayActivityChips(slots) {
  const host = $("#dayActivityChips");
  if (!host) return;

  if (state.filters.activity !== "ALL") {
    host.innerHTML = "";
    return;
  }

  const activities = unique(slots.map(s => s.activity));
  if (!activities.length) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = activities.map(a => {
    const cls = activityClass(a);
    return `<button class="chip ${cls}" data-act="${escAttr(a)}">${esc(a)}</button>`;
  }).join("");

  host.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filters.activity = btn.getAttribute("data-act");
      const actSel = $("#filterActivity");
      if (actSel) actSel.value = state.filters.activity;
      renderActivityLegend();
      renderCalendar();
      renderDaySlots();
    });
  });
}

function renderDaySlots() {
  const title = $("#slotsTitle");
  const hint = $("#slotsHint");
  const list = $("#slotsList");
  if (!list) return;

  const d = state.selectedDate;

  if (title) title.textContent = `Turnos del día · ${fmtDateLong(d)}`;
  if (hint) hint.textContent = "Seleccioná un turno disponible para anotarte.";

  const slots = slotsForDayAll(d);

  renderDayActivityChips(slots);

  if (!slots.length) {
    list.innerHTML = `<div class="muted">No hay turnos disponibles para este día.</div>`;
    return;
  }

  list.innerHTML = slots.map(s => `
    <div class="slot-card">
      <div class="slot-left">
        <div class="slot-title">${esc(s.activity)} · ${esc(fmtTime(new Date(s.startISO)))}</div>
        <div class="slot-sub">Profesor: ${esc(s.instructor)} · Lugar: ${esc(s.location)}</div>
        <div class="slot-cap">CUPOS DISPONIBLES: <strong>${esc(String(s.available))}</strong></div>
      </div>
      <div class="slot-right">
        <button class="btn-primary" data-slot="${escAttr(s.id)}">Anotarme</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll('button[data-slot]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const slotId = btn.getAttribute("data-slot");
      await bookSlot(slotId, btn);
    });
  });
}

/* =======================
   Booking
   ======================= */
async function bookSlot(slotId, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = "Anotando...";
  await sleep(700);

  const sessions = getClubSessions();
  const slot = sessions.find(s => s.id === slotId);

  if (!slot) {
    toast("bad", "Error", "No se encontró el turno.");
    btnEl.disabled = false;
    btnEl.textContent = "Anotarme";
    return;
  }

  const available = slot.capacity - slot.booked;
  if (available <= 0) {
    toast("bad", "Sin cupos", "Este turno ya no tiene cupos.");
    btnEl.disabled = false;
    btnEl.textContent = "Anotarme";
    return;
  }

  const myIds = getMySlotIds();
  if (myIds.has(slotId)) {
    toast("bad", "Ya estás anotado/a", "Este turno ya está en tus turnos.");
    btnEl.disabled = false;
    btnEl.textContent = "Anotarme";
    return;
  }

  const res = getReservations();
  res.push({
    id: cryptoId(),
    username: state.user.username,
    slotId,
    createdISO: new Date().toISOString()
  });
  saveReservations(res);

  slot.booked += 1;
  saveJSON(LS.sessions, sessions);

  showAlert(
    "ok",
    "Listo",
    `Quedaste anotado/a en ${slot.activity} · ${fmtDateShort(new Date(slot.startISO))} ${fmtTime(new Date(slot.startISO))}`
  );

  btnEl.disabled = false;
  btnEl.textContent = "Anotarme";

  renderCalendar();
  renderDaySlots();
}

function toast(kind, title, msg) {
  const host = $("#toasts");
  if (!host) return;

  const t = document.createElement("div");
  t.className = `toast ${kind || ""}`;
  t.innerHTML = `
    <div class="toast-title">${esc(title || "")}</div>
    <div class="toast-msg">${esc(msg || "")}</div>
  `;
  host.appendChild(t);

  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 2600);
}

function showAlert(kind, title, msg) {
  if (typeof Swal === "undefined") {
    toast(kind === "ok" ? "ok" : "bad", title, msg);
    return;
  }

  const isSuccess = kind === "ok";

  Swal.fire({
    title: title || "",
    text: msg || "",
    icon: isSuccess ? "success" : "error",
    draggable: true,
    timer: 2500,
    showConfirmButton: false,
    background: "#ffffff",
    color: "#0f172a",
    iconColor: getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim(),
    customClass: { popup: "swal-popup-custom" }
  });
}

/* =======================
   Mis turnos + Dashboard
   ======================= */
function myBookedItemsSorted() {
  const sessions = getClubSessions();
  const my = getMyReservations();

  return my
    .map(r => ({ r, slot: sessions.find(s => s.id === r.slotId) }))
    .filter(x => x.slot)
    .sort((a, b) => new Date(a.slot.startISO) - new Date(b.slot.startISO));
}

async function cancelReservation(resId) {
  const primary = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim() || "#3e7699";

  const secondary = getComputedStyle(document.documentElement)
    .getPropertyValue("--secondary")
    .trim() || "#94a3b8";

  // Si SweetAlert2 no está, fallback
  if (typeof Swal === "undefined") {
    const ok = window.confirm("¿Querés darte de baja de este turno?");
    if (!ok) return;
  } else {
    const result = await Swal.fire({
      title: "Confirmar baja",
      text: "¿Querés darte de baja de este turno?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Darme de baja",
      cancelButtonText: "Mantener la clase",
      confirmButtonColor: primary,
      cancelButtonColor: secondary,
      reverseButtons: true,
      iconColor: "#da653c",
      customClass: {
        confirmButton: "swal-btn-primary",
        cancelButton: "swal-btn-secondary"
      },
      buttonsStyling: false
    });
    if (!result.isConfirmed) return;
  }

  const all = getReservations();
  const idx = all.findIndex(r => r.id === resId && r.username === state.user.username);
  if (idx === -1) return;

  const removed = all.splice(idx, 1)[0];
  saveReservations(all);

  const sessions = getClubSessions();
  const slot = sessions.find(s => s.id === removed.slotId);
  if (slot) {
    slot.booked = Math.max(0, (slot.booked || 0) - 1);
    saveJSON(LS.sessions, sessions);
  }

  if (typeof Swal === "undefined") {
    toast("ok", "Listo", "Te diste de baja correctamente");
  } else {
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Te diste de baja correctamente",
      showConfirmButton: false,
      timer: 1800,
      timerProgressBar: true,
      iconColor: primary
    });
  }
}

function renderMisTurnos() {
  const host =
    $("#myTurnsList") ||
    $("#misTurnosList") ||
    $("#turnosList");

  if (!host) return;

  const empty =
    $("#myTurnsEmpty") ||
    $("#misTurnosEmpty");

  const items = myBookedItemsSorted();

  if (!items.length) {
    if (empty) empty.style.display = "";
    host.innerHTML = "";
    return;
  }
  if (empty) empty.style.display = "none";

  host.innerHTML = items.map(x => {
    const d = new Date(x.slot.startISO);
    return `
      <div class="card turn-card">
        <div class="turn-main">
          <div class="turn-title">${esc(x.slot.activity)} · ${esc(fmtTime(d))}</div>
          <div class="turn-meta">${esc(fmtDateLong(d))}</div>
          <div class="turn-meta">${esc(x.slot.instructor)} · ${esc(x.slot.location)}</div>
        </div>
        <div class="turn-actions">
          <button class="btn btn-warn btn-cancel" data-cancel="${escAttr(x.r.id)}">
            <i class="mdi mdi-trash-can-outline" aria-hidden="true"></i>
            <span class="btn-label">Darme de baja</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  host.querySelectorAll("button[data-cancel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await cancelReservation(btn.getAttribute("data-cancel"));
      renderMisTurnos();
      renderDashboard();
    });
  });
}

function renderDashboard() {
  const nextHost =
    $("#nextTurn") ||
    $("#nextTurnCard") ||
    $("#nextTurnBox");

  const tbody =
    $("#myTurnsTbody") ||
    $("#dashboardTableBody") ||
    $("#dashboardTurnsBody");

  const listHost = $("#dashboardTurnsList");

  const empty =
    $("#dashboardEmpty") ||
    $("#myTurnsEmptyDash");

  const items = myBookedItemsSorted();

  if (nextHost) {
    if (!items.length) {
      nextHost.innerHTML = `<div class="muted">Todavía no tenés turnos reservados.</div>`;
    } else {
      const x = items[0];
      const d = new Date(x.slot.startISO);
      nextHost.innerHTML = `
        <div class="next-card">
          <div class="next-title">${esc(x.slot.activity)} · ${esc(fmtDateLong(d))}</div>
          <div class="next-meta">${esc(fmtTime(d))} · ${esc(x.slot.instructor)} · ${esc(x.slot.location)}</div>
        </div>
      `;
    }
  }

  // Tabla
  if (tbody) {
    tbody.innerHTML = "";

    if (!items.length) {
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";

    items.forEach(x => {
      const d = new Date(x.slot.startISO);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(x.slot.activity)}</td>
        <td>${esc(fmtDateShort(d))}</td>
        <td>${esc(fmtTime(d))}</td>
        <td>${esc(x.slot.instructor)}</td>
        <td>${esc(x.slot.location)}</td>
        <td>
          <button
            class="btn btn-warn btn-sm btn-cancel"
            data-cancel="${escAttr(x.r.id)}"
            aria-label="Darme de baja"
            title="Darme de baja"
          >
            <i class="mdi mdi-trash-can-outline" aria-hidden="true"></i>
            <span class="btn-label">Darme de baja</span>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("button[data-cancel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await cancelReservation(btn.getAttribute("data-cancel"));
        renderDashboard();
        renderMisTurnos();
      });
    });
  }

  // Lista
  if (listHost) {
    if (!items.length) {
      if (empty) empty.style.display = "";
      listHost.innerHTML = "";
      return;
    }
    if (empty) empty.style.display = "none";

    listHost.innerHTML = items.map(x => {
      const d = new Date(x.slot.startISO);
      return `
        <div class="card turn-card">
          <div class="turn-main">
            <div class="turn-title">${esc(x.slot.activity)} · ${esc(fmtTime(d))}</div>
            <div class="turn-meta">${esc(fmtDateLong(d))}</div>
            <div class="turn-meta">${esc(x.slot.instructor)} · ${esc(x.slot.location)}</div>
          </div>
          <div class="turn-actions">
            <button
              class="btn btn-warn btn-cancel"
              data-cancel="${escAttr(x.r.id)}"
              aria-label="Darme de baja"
              title="Darme de baja"
            >
              <i class="mdi mdi-trash-can-outline" aria-hidden="true"></i>
              <span class="btn-label">Darme de baja</span>
            </button>
          </div>
        </div>
      `;
    }).join("");

    listHost.querySelectorAll("button[data-cancel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await cancelReservation(btn.getAttribute("data-cancel"));
        renderDashboard();
        renderMisTurnos();
      });
    });
  }
}

/* =======================
   Reservar: navegación
   ======================= */
function bindReservarNav() {
  $("#btnPrev")?.addEventListener("click", () => {
    if (state.view === "WEEK") {
      state.weekStart = addDays(state.weekStart, -7);
      state.selectedDate = startOfDay(state.weekStart);
    } else {
      state.monthCursor = addMonths(state.monthCursor, -1);
      state.selectedDate = startOfDay(new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1));
      state.weekStart = startOfWeek(state.selectedDate);
    }
    renderCalendar();
    renderDaySlots();
  });

  $("#btnNext")?.addEventListener("click", () => {
    if (state.view === "WEEK") {
      state.weekStart = addDays(state.weekStart, 7);
      state.selectedDate = startOfDay(state.weekStart);
    } else {
      state.monthCursor = addMonths(state.monthCursor, 1);
      state.selectedDate = startOfDay(new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1));
      state.weekStart = startOfWeek(state.selectedDate);
    }
    renderCalendar();
    renderDaySlots();
  });

  $("#btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem(LS.session);
    goPage("index.html");
  });

  const page = document.body.getAttribute("data-page");
  $$(".subnav-inner a[data-route]").forEach(a => a.classList.remove("active"));
  if (page) $(`.subnav-inner a[data-route="${page}"]`)?.classList.add("active");
}

function bindFiltersToggle() {
  const card = document.querySelector(".filters");
  const btn = document.getElementById("btnFiltersToggle");
  if (!card || !btn) return;

  function syncByBreakpoint() {
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    if (!isMobile) {
      card.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    } else {
      card.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }
  }

  btn.addEventListener("click", () => {
    const open = card.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  window.addEventListener("resize", syncByBreakpoint);
  syncByBreakpoint();
}

/* =======================
   Init
   ======================= */
function init() {
  seedIfEmpty();

  const page = document.body.getAttribute("data-page");

  if (page === "login") {
    $("#btnLogin")?.addEventListener("click", () => {
      const username = ($("#loginUser")?.value || "").trim().toLowerCase();
      if (!username) {
        showAlert("bad", "Error", "Ingresá un usuario.");
        return;
      }
      const user = { username, paidActivities: paidActivitiesForUser(username) };
      saveJSON(LS.session, user);
      toast("ok", "Bienvenido/a", `Actividades abonadas: ${user.paidActivities.join(", ")}`);
      goPage("dashboard.html");
    });
    return;
  }

  if (!requireSessionOrRedirect()) return;

  if (page === "reservar") {
    state.selectedDate = startOfDay(new Date());
    state.weekStart = startOfWeek(state.selectedDate);
    state.monthCursor = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), 1);

    // Default: desktop=MONTH, mobile=WEEK
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    state.view = isMobile ? "WEEK" : "MONTH";

    bindViewSwitch();
    bindReservarNav();
    renderFilters();
    setViewSwitchUI();
    renderCalendar();
    renderDaySlots();
    return;
  }

  if (page === "mis-turnos") {
    $("#btnLogout")?.addEventListener("click", () => {
      localStorage.removeItem(LS.session);
      goPage("index.html");
    });
    renderMisTurnos();
    return;
  }

  if (page === "dashboard") {
    $("#btnLogout")?.addEventListener("click", () => {
      localStorage.removeItem(LS.session);
      goPage("index.html");
    });
    renderDashboard();
    return;
  }

  $("#btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem(LS.session);
    goPage("index.html");
  });
}

/* =======================
   Utils
   ======================= */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function unique(arr) { return Array.from(new Set(arr)); }
function cryptoId() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escAttr(s) { return esc(s).replaceAll("`", ""); }

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
function startOfWeek(d) {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=dom
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/* =======================
   Header (menú mobile + logout)
   ======================= */
(function initHeaderLexa() {
  const btn = document.getElementById("btnMenuToggle");
  const menu = document.getElementById("mobileMenu");
  const logoutTop = document.getElementById("btnLogoutTop");
  const logoutMobile = document.getElementById("btnLogoutMobile");

  function openMenu() {
    if (!menu) return;
    menu.hidden = false;
    btn?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function closeMenu() {
    if (!menu) return;
    menu.hidden = true;
    btn?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  btn?.addEventListener("click", () => {
    if (menu?.hidden) openMenu();
    else closeMenu();
  });

  menu?.addEventListener("click", (e) => {
    if (e.target === menu) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu && !menu.hidden) closeMenu();
  });

  function doLogout() {
    localStorage.removeItem(LS.session);
    goPage("index.html");
  }
  logoutTop?.addEventListener("click", doLogout);
  logoutMobile?.addEventListener("click", doLogout);

  const route = (document.body.dataset.route || "").trim();
  document.querySelectorAll("[data-route]").forEach(a => {
    if (route && a.getAttribute("data-route") === route) a.classList.add("is-active");
  });
})();

init();