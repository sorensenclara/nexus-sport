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
  sessions: "turnero_sessions_v2",
  paymentPlans: "turnero_payment_plans_v1",
  paymentDraft: "turnero_payment_draft_v1"
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let state = {
  user: null,
  selectedDate: startOfDay(new Date()),
  weekStart: startOfWeek(new Date()),
  monthCursor: new Date(),
  view: "WEEK",
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

  for (let d = -7; d <= 28; d++) {
    const day = new Date(today);
    day.setDate(today.getDate() + d);

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
  return ["Padel", "Pilates", "Gym", "Crossfit"];
}

function paymentPlansForUser(user) {
  const paid = user?.paidActivities || [];

  const defaultCatalog = {
    "Padel": { hours: "8 hs", price: 32000, paymentMethod: "cash", status: "active" },
    "Pilates": { hours: "4 hs", price: 18000, paymentMethod: "cash", status: "active" },
    "Gym": { hours: "12 hs", price: 24000, paymentMethod: "cash", status: "active" },
    "Crossfit": { hours: "8 hs", price: 26000, paymentMethod: "cash", status: "active" }
  };

  const saved = loadJSON(LS.paymentPlans, null);
  if (saved && Array.isArray(saved) && saved.length) return saved;

  const plans = paid.map(name => {
    const base = defaultCatalog[name] || { hours: "—", price: 0, paymentMethod: "cash", status: "active" };
    return {
      activity: name,
      hours: base.hours,
      price: base.price,
      paymentMethod: base.paymentMethod,
      status: base.status
    };
  });

  saveJSON(LS.paymentPlans, plans);
  return plans;
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

  const actSel = $("#filterActivity");
  const instSel = $("#filterInstructor");
  const locSel = $("#filterLocation");

  const activities = ["ALL", ...unique(paidSessions.map(s => s.activity))];

  const activityBase =
    state.filters.activity === "ALL"
      ? []
      : paidSessions.filter(s => s.activity === state.filters.activity);

  let instructors = [""];
  let locations = [""];

  if (state.filters.activity !== "ALL") {
    let forInstructor = [...activityBase];
    let forLocation = [...activityBase];

    if (state.filters.location) {
      forInstructor = forInstructor.filter(s => s.location === state.filters.location);
    }

    if (state.filters.instructor) {
      forLocation = forLocation.filter(s => s.instructor === state.filters.instructor);
    }

    instructors = ["", ...unique(forInstructor.map(s => s.instructor))];
    locations = ["", ...unique(forLocation.map(s => s.location))];
  }

  if (actSel) {
    actSel.innerHTML = activities.map(a => {
      const label = (a === "ALL") ? "Todas mis clases" : a;
      return `<option value="${escAttr(a)}">${esc(label)}</option>`;
    }).join("");
    actSel.value = state.filters.activity;
  }

  if (locSel) {
    locSel.innerHTML = locations.map(l => {
      const label = l ? l : "Todos";
      return `<option value="${escAttr(l)}">${esc(label)}</option>`;
    }).join("");

    if (!locations.includes(state.filters.location)) {
      state.filters.location = "";
    }

    locSel.value = state.filters.location;
    locSel.disabled = state.filters.activity === "ALL";
  }

  if (instSel) {
    instSel.innerHTML = instructors.map(i => {
      const label = i ? i : "Todos";
      return `<option value="${escAttr(i)}">${esc(label)}</option>`;
    }).join("");

    if (!instructors.includes(state.filters.instructor)) {
      state.filters.instructor = "";
    }

    instSel.value = state.filters.instructor;
    instSel.disabled = state.filters.activity === "ALL";
  }

  actSel.onchange = () => {
    state.filters.activity = actSel.value;

    if (state.filters.activity === "ALL") {
      state.filters.location = "";
      state.filters.instructor = "";
    } else {
      const activitySessions = paidSessions.filter(s => s.activity === state.filters.activity);

      const validLocations = unique(activitySessions.map(s => s.location));
      const validInstructors = unique(activitySessions.map(s => s.instructor));

      if (!validLocations.includes(state.filters.location)) {
        state.filters.location = "";
      }

      if (!validInstructors.includes(state.filters.instructor)) {
        state.filters.instructor = "";
      }
    }

    renderFilters();
    renderActivityLegend();
    renderCalendar();
    renderDaySlots();
  };

  locSel.onchange = () => {
    state.filters.location = locSel.value;

    if (state.filters.activity !== "ALL") {
      const activitySessions = paidSessions
        .filter(s => s.activity === state.filters.activity)
        .filter(s => !state.filters.location || s.location === state.filters.location);

      const validInstructors = unique(activitySessions.map(s => s.instructor));
      if (!validInstructors.includes(state.filters.instructor)) {
        state.filters.instructor = "";
      }
    }

    renderFilters();
    renderCalendar();
    renderDaySlots();
  };

  instSel.onchange = () => {
    state.filters.instructor = instSel.value;

    if (state.filters.activity !== "ALL") {
      const activitySessions = paidSessions
        .filter(s => s.activity === state.filters.activity)
        .filter(s => !state.filters.instructor || s.instructor === state.filters.instructor);

      const validLocations = unique(activitySessions.map(s => s.location));
      if (!validLocations.includes(state.filters.location)) {
        state.filters.location = "";
      }
    }

    renderFilters();
    renderCalendar();
    renderDaySlots();
  };

  renderActivityLegend();
  syncFiltersUI();
}

function getFilteredSessionsForSelectors() {
  const sessions = getClubSessions();
  const paid = state.user?.paidActivities || [];

  let base = sessions.filter(s => paid.includes(s.activity));

  if (state.filters.activity !== "ALL") {
    base = base.filter(s => s.activity === state.filters.activity);
  }

  return base;
}

function buildFilterSummaryText() {
  const act = state.filters.activity === "ALL" ? "Todas mis clases" : state.filters.activity;
  const loc = state.filters.location || "Todos";
  const inst = state.filters.instructor || "Todos";
  return `Actividad: ${act} · Lugar: ${loc} · Profesor: ${inst}`;
}

function syncFiltersUI() {
  const card = document.getElementById("filtersCard");
  const btnToggle = document.getElementById("btnFiltersToggle");
  const btnClose = document.getElementById("btnCloseFilters");
  const body = document.getElementById("filtersBody");
  const summary = document.getElementById("filtersSummary");
  const summaryText = document.getElementById("filtersSummaryText");

  if (!card || !body || !btnToggle) return;

  const isOpen = card.classList.contains("is-open");

  body.hidden = !isOpen;

  if (summary) {
    summary.hidden = isOpen;
  }

  if (summaryText) {
    summaryText.textContent = buildFilterSummaryText();
  }

  btnToggle.setAttribute("aria-expanded", String(isOpen));
  if (btnClose) btnClose.setAttribute("aria-expanded", String(isOpen));
}

/* =======================
   Leyenda actividades
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

function activityClass(name) {
  const k = (name || "").toLowerCase();
  if (k.includes("padel")) return "padel";
  if (k.includes("gym")) return "gym";
  if (k.includes("pilates")) return "pilates";
  if (k.includes("crossfit")) return "crossfit";
  return "other";
}

function monthPillsHtml(dayDate) {
  const slots = slotsForDayAll(dayDate);
  if (!slots.length) return `<div class="events"></div>`;

  const isMobileMonth = window.matchMedia("(max-width: 820px)").matches;
  const maxShow = isMobileMonth ? 1 : 2;

  const shown = slots.slice(0, maxShow);
  const rest = slots.length - shown.length;

  const pills = shown.map(s => {
    const t = fmtTime(new Date(s.startISO));
    const cls = activityClass(s.activity);

    if (isMobileMonth) {
      return `
        <div class="event-pill ${cls} compact" data-slot="${escAttr(s.id)}">
          <span class="event-time">${esc(t)}</span>
        </div>
      `;
    }

    return `
      <div class="event-pill ${cls}" data-slot="${escAttr(s.id)}">
        ${esc(t)} ${esc(s.activity)}
      </div>
    `;
  }).join("");

  const more = rest > 0
    ? `<div class="event-pill more-pill" data-more="1">+${rest}</div>`
    : "";

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
      scrollToSlotsMobile();
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
      scrollToSlotsMobile();
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
      scrollToSlotsMobile();
    });
  });

  monthGrid.querySelectorAll(".event-pill[data-more]").forEach(p => {
    p.addEventListener("click", (e) => {
      e.stopPropagation();
      renderDaySlots();
      scrollToSlotsMobile();
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
   Panel derecho + chips
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


function isMobileViewport() {
  return window.matchMedia("(max-width: 820px)").matches;
}

function scrollToSlotsMobile() {
  if (!isMobileViewport()) return;

  const slotsTitle = document.getElementById("slotsTitle");
  const fab = document.getElementById("mobileBackToCalendar");

  if (slotsTitle) {
    slotsTitle.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (fab) {
    fab.hidden = false;
  }
}

function scrollToCalendarMobile() {
  const calendarCard = document.querySelector(".calendar-wrap > section.card:first-child");
  if (calendarCard) {
    calendarCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function scrollToFiltersMobile() {
  const filtersCard = document.getElementById("filtersCard");
  if (filtersCard) {
    filtersCard.classList.add("is-open");
    syncFiltersUI();
    filtersCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
    .trim() || "#22769B";

  const secondary = getComputedStyle(document.documentElement)
    .getPropertyValue("--secondary")
    .trim() || "#94a3b8";

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
      iconColor: "#EC5B29",
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


function bindFiltersMobile() {
  const btnOpen = document.getElementById("btnFiltersToggle");
  const btnClose = document.getElementById("btnCloseFilters");
  const card = document.getElementById("filtersCard");
  const fab = document.getElementById("mobileBackToCalendar");

  if (!card) return;

  btnOpen?.addEventListener("click", () => {
    card.classList.add("is-open");
    syncFiltersUI();
    scrollToFiltersMobile();
  });

  btnClose?.addEventListener("click", () => {
    card.classList.remove("is-open");
    syncFiltersUI();
  });

  fab?.addEventListener("click", () => {
    scrollToCalendarMobile();
  });

  syncFiltersUI();
}

/* =======================
   Init
   ======================= */
function init() {
  seedIfEmpty();

  const page = document.body.getAttribute("data-page");

  if (page === "login") {
    $("#btnLogin")?.addEventListener("click", () => {
      const username = ($("#loginUser")?.value || "").trim();

      if (!username) {
        showAlert("bad", "Error", "Ingresá un usuario.");
        return;
      }

      const user = {
        username,
        paidActivities: paidActivitiesForUser(username)
      };

      saveJSON(LS.session, user);
      toast("ok", "Bienvenido/a", `Actividades abonadas: ${user.paidActivities.join(", ")}`);
      goPage("dashboard.html");
    });
    return;
  }

  if (!requireSessionOrRedirect()) return;

  /* esto hace que el nombre/avatar se cargue en TODAS las páginas */
  bindProfileData();

  if (page === "reservar") {
    state.selectedDate = startOfDay(new Date());
    state.weekStart = startOfWeek(state.selectedDate);
    state.monthCursor = new Date(
      state.selectedDate.getFullYear(),
      state.selectedDate.getMonth(),
      1
    );

    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    state.view = isMobile ? "WEEK" : "MONTH";

    bindViewSwitch();
    bindReservarNav();
    bindFiltersMobile();
    renderFilters();
    setViewSwitchUI();
    renderCalendar();
    renderDaySlots();
    return;
  }

  if (page === "mis-turnos") {
    renderMisTurnos();
    return;
  }

  if (page === "dashboard") {
    renderDashboard();
    return;
  }

  if (page === "perfil") {
  renderProfilePaidClasses();
  bindProfilePayments();
  return;
  }

  if (page === "adherir-debito") {
  bindDebitCardForm();
  return;
  } 
}

function renderProfilePaidClasses() {
  const host = document.getElementById("profilePaidClasses");
  if (!host || !state.user) return;

  const acts = state.user.paidActivities || [];

  if (!acts.length) {
    host.innerHTML = `<tr><td colspan="3">No tenés clases abonadas</td></tr>`;
    return;
  }

  host.innerHTML = acts.map(a => `
    <tr>
      <td>${esc(a)}</td>
      <td>Según disponibilidad</td>
      <td>—</td>
    </tr>
  `).join("");
}

function formatCurrencyARS(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function discountedPrice(price) {
  return Math.round((price || 0) * 0.9);
}

function paymentMethodLabel(method) {
  return method === "debit" ? "Débito automático" : "Efectivo";
}

function paymentBenefitLabel(method) {
  return method === "debit" ? "10% off" : "—";
}

function paymentStatusLabel(status, method) {
  if (method === "debit") return "Adherido";
  if (status === "active") return "No adherido";
  return "Pendiente";
}

function renderProfilePayments(editMode = false) {
  const tableHost = document.getElementById("profilePaymentsTable");
  const cardsHost = document.getElementById("profilePaymentsCards");
  const editHead = document.getElementById("paymentEditHead");
  const editActions = document.getElementById("paymentEditActions");

  if (!state.user || !tableHost || !cardsHost) return;

  const plans = paymentPlansForUser(state.user);
  const section = document.querySelector(".payment-section");
  const hasActiveDebits = plans.some(plan => plan.paymentMethod === "debit");

  if (section) {
    section.classList.toggle("has-active-debits", hasActiveDebits);
  }

  if (editHead) editHead.hidden = !editMode;
  if (editActions) editActions.hidden = !editMode;

  tableHost.innerHTML = plans.map((plan, index) => {
    const method = paymentMethodLabel(plan.paymentMethod);
    const benefit = paymentBenefitLabel(plan.paymentMethod);
    const status = paymentStatusLabel(plan.status, plan.paymentMethod);
    const canSelect = editMode && plan.paymentMethod !== "debit";

    return `
      <tr>
        <td>${esc(plan.activity)}</td>
        <td>${esc(plan.hours)}</td>
        <td>${esc(formatCurrencyARS(plan.paymentMethod === "debit" ? discountedPrice(plan.price) : plan.price))}</td>
        <td>${esc(method)}</td>
        <td>${esc(benefit)}</td>
        <td>${esc(status)}</td>
        ${editMode ? `
          <td>
            ${plan.paymentMethod === "debit"
              ? `<span class="payment-muted">Ya adherido</span>`
              : `<label class="payment-select">
                  <input type="checkbox" class="payment-checkbox" data-payment-index="${index}">
                  <span>Adherir</span>
                </label>`
            }
          </td>
        ` : ""}
      </tr>
    `;
  }).join("");

  cardsHost.innerHTML = plans.map((plan, index) => {
    const method = paymentMethodLabel(plan.paymentMethod);
    const benefit = paymentBenefitLabel(plan.paymentMethod);
    const status = paymentStatusLabel(plan.status, plan.paymentMethod);
    const finalPrice = plan.paymentMethod === "debit" ? discountedPrice(plan.price) : plan.price;

    return `
      <article class="payment-card">
        <div class="payment-card-head">
          <div>
            <h4 class="payment-card-title">${esc(plan.activity)}</h4>
          </div>
          <span class="payment-status ${plan.paymentMethod === "debit" ? "is-active" : "is-pending"}">
            ${esc(status)}
          </span>
        </div>

        <div class="payment-card-grid">
          <div class="payment-meta">
            <span class="payment-meta-label">Horas mensuales</span>
            <span class="payment-meta-value">${esc(plan.hours)}</span>
          </div>

          <div class="payment-meta">
            <span class="payment-meta-label">Valor mensual</span>
            <span class="payment-meta-value">${esc(formatCurrencyARS(finalPrice))}</span>
          </div>

          <div class="payment-meta">
            <span class="payment-meta-label">Forma de pago</span>
            <span class="payment-meta-value">${esc(method)}</span>
          </div>

          <div class="payment-meta">
            <span class="payment-meta-label">Beneficio</span>
            <span class="payment-meta-value ${plan.paymentMethod === "debit" ? "payment-discount" : "payment-muted"}">
              ${esc(benefit)}
            </span>
          </div>
        </div>

        ${editMode ? `
          <div style="margin-top:14px;">
            ${plan.paymentMethod === "debit"
              ? `<span class="payment-muted">Ya adherido al débito automático</span>`
              : `<label class="payment-select">
                  <input type="checkbox" class="payment-checkbox" data-payment-index="${index}">
                  <span>Pasar este abono a débito automático</span>
                </label>`
            }
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function bindProfilePayments() {
  const btnEdit = document.getElementById("btnEditPayments");
  const btnCancel = document.getElementById("btnCancelPaymentsEdit");
  const btnContinue = document.getElementById("btnGoToDebitCard");

  if (!btnEdit) return;

  let editMode = false;

  function refresh() {
    renderProfilePayments(editMode);
  }

  btnEdit.addEventListener("click", () => {
    editMode = true;
    refresh();
  });

  btnCancel?.addEventListener("click", () => {
    editMode = false;
    localStorage.removeItem(LS.paymentDraft);
    refresh();
  });

  btnContinue?.addEventListener("click", () => {
    const checked = Array.from(document.querySelectorAll(".payment-checkbox:checked"))
      .map(el => Number(el.getAttribute("data-payment-index")));

    if (!checked.length) {
      showAlert("bad", "Seleccioná al menos un abono", "Elegí qué actividades querés adherir al débito automático.");
      return;
    }

    saveJSON(LS.paymentDraft, checked);
    window.location.href = "adherir-debito.html";
  });

  refresh();
}

function renderDebitSelectedList() {
  const host = document.getElementById("debitSelectedList");
  if (!host || !state.user) return;

  const plans = paymentPlansForUser(state.user);
  const selectedIndexes = loadJSON(LS.paymentDraft, []);
  const selectedPlans = plans.filter((_, idx) => selectedIndexes.includes(idx));

  host.innerHTML = selectedPlans.map(plan => `
    <div class="debit-selected-item">
      <div>
        <strong>${esc(plan.activity)}</strong><br>
        <span class="payment-muted">${esc(plan.hours)} · ${esc(formatCurrencyARS(discountedPrice(plan.price)))}</span>
      </div>
      <span class="payment-discount">10% off</span>
    </div>
  `).join("");
}

function bindDebitCardForm() {
  const form = document.getElementById("debitCardForm");
  if (!form || !state.user) return;

  renderDebitSelectedList();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const holder = (document.getElementById("cardHolder")?.value || "").trim();
    const number = (document.getElementById("cardNumber")?.value || "").trim();
    const expiry = (document.getElementById("cardExpiry")?.value || "").trim();
    const cvv = (document.getElementById("cardCvv")?.value || "").trim();

    if (!holder || !number || !expiry || !cvv) {
      showAlert("bad", "Faltan datos", "Completá todos los campos de la tarjeta.");
      return;
    }

    const plans = paymentPlansForUser(state.user);
    const selectedIndexes = loadJSON(LS.paymentDraft, []);

    const updatedPlans = plans.map((plan, idx) => {
      if (selectedIndexes.includes(idx)) {
        return {
          ...plan,
          paymentMethod: "debit"
        };
      }
      return plan;
    });

    saveJSON(LS.paymentPlans, updatedPlans);
    localStorage.removeItem(LS.paymentDraft);

    await Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Tu adhesión al débito automático fue exitosa",
      showConfirmButton: false,
      timer: 1800,
      timerProgressBar: true
    });

    window.location.href = "perfil.html";
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

function escAttr(s) {
  return esc(s).replaceAll("`", "");
}

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
  const dow = x.getDay();
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
   Header
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
    if (route && a.getAttribute("data-route") === route) {
      a.classList.add("is-active");
    }
  });
})();

/* =======================
   Perfil de Usuario
   ======================= */
document.addEventListener("DOMContentLoaded", () => {
  const btnDebito = document.getElementById("btnDebitoAutomatico");
  const btnDelete = document.getElementById("btnDeleteAccount");
  const btnLogoutProfile = document.getElementById("btnLogoutProfile");

  if (btnDebito) {
    btnDebito.addEventListener("click", async () => {
      const result = await Swal.fire({
        title: "¿Adherirte a débito automático?",
        text: "Tu cuota pasará a cobrarse automáticamente todos los meses.",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, adherirme",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#005ba5"
      });

      if (result.isConfirmed) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Solicitud enviada correctamente",
          showConfirmButton: false,
          timer: 2200,
          timerProgressBar: true
        });
      }
    });
  }

if (btnDelete) {
  btnDelete.addEventListener("click", async () => {
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim() || "#22769B";

    const secondary = getComputedStyle(document.documentElement)
      .getPropertyValue("--secondary")
      .trim() || "#94a3b8";

    if (typeof Swal === "undefined") {
      const ok = window.confirm("¿Eliminar cuenta?");
      if (!ok) return;
    } else {
      const result = await Swal.fire({
        title: "Eliminar cuenta",
        text: "Esta acción no se puede deshacer.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Eliminar cuenta",
        cancelButtonText: "Cancelar",
        confirmButtonColor: primary,
        cancelButtonColor: secondary,
        reverseButtons: true,
        iconColor: "#EC5B29",
        customClass: {
          confirmButton: "swal-btn-primary",
          cancelButton: "swal-btn-secondary"
        },
        buttonsStyling: false
      });

      if (!result.isConfirmed) return;
    }

    localStorage.removeItem(LS.session);

    await Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Cuenta eliminada correctamente",
      showConfirmButton: false,
      timer: 1400,
      timerProgressBar: true,
      iconColor: primary
    });

    window.location.href = "index.html";
  });
}
  if (btnLogoutProfile) {
    btnLogoutProfile.addEventListener("click", () => {
      localStorage.removeItem(LS.session);
      window.location.href = "index.html";
    });
  }

  const links = document.querySelectorAll(".profile-nav-link");
  const sections = document.querySelectorAll(".profile-section");

  function updateActiveLink() {
    let currentId = "";

    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= 180) currentId = section.id;
    });

    links.forEach(link => {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + currentId);
    });
  }

  window.addEventListener("scroll", updateActiveLink);
  updateActiveLink();
});

/* =======================
   Cambiar clave
   ======================= */
function bindChangePassword() {
  const btnSavePassword = document.getElementById("btnSavePassword");
  if (!btnSavePassword) return;

  btnSavePassword.addEventListener("click", async () => {
    const oldPass = document.getElementById("oldPassword")?.value.trim() || "";
    const newPass = document.getElementById("newPassword")?.value.trim() || "";
    const repeatPass = document.getElementById("repeatPassword")?.value.trim() || "";

    if (!oldPass || !newPass || !repeatPass) {
      Swal.fire("Faltan datos", "Completá todos los campos.", "warning");
      return;
    }

    if (newPass !== repeatPass) {
      Swal.fire("Error", "La nueva contraseña no coincide.", "error");
      return;
    }

    Swal.fire({
      icon: "success",
      title: "Contraseña actualizada",
      text: "Los cambios se guardaron correctamente."
    }).then(() => {
      window.location.href = "perfil.html";
    });
  });
}

/* =======================
   Perfil: cargar datos
   ======================= */
function bindProfileData() {
  const user = loadJSON(LS.session, null);
  if (!user) return;

  const rawName = (user.username || "Usuario").trim();

  const initials = rawName
    .split(" ")
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "US";

  const headerAvatar = document.getElementById("headerAvatar");
  const profileAvatar = document.getElementById("profileAvatar");
  const profileName = document.getElementById("profileName");

  if (headerAvatar) headerAvatar.textContent = initials;
  if (profileAvatar) profileAvatar.textContent = initials;
  if (profileName) profileName.textContent = rawName;
}

/* =======================
   INIT
   ======================= */
bindChangePassword();
init();