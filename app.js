import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CONFIG = window.GUESTLIST_APP_CONFIG || {};
const DEFAULT_CATEGORIES = CONFIG.app?.categories || ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"];
const DEFAULT_STATUSES = ["open", "checked_in", "no_show"];
const CONFIGURED_EVENTS = Array.isArray(CONFIG.app?.knownEvents) ? CONFIG.app.knownEvents : [];
const KNOWN_EVENTS_STORAGE_KEY = "guestlist:knownEvents";
const ADMIN_SESSION_STORAGE_KEY = "guestlist:adminSession";
const EVENT_ALIASES = CONFIG.app?.eventAliases || {};
const GLOBAL_ADMIN_EVENT_ID = CONFIG.app?.globalAdminEventId || CONFIGURED_EVENTS[0]?.id || "";
const PIN_MIN_LENGTH = 4;

const STATUS_META = {
  open: { label: "Offen", badge: "warning" },
  checked_in: { label: "Eingecheckt", badge: "success" },
  no_show: { label: "No Show", badge: "danger" }
};

const ROLE_META = {
  checkin: "Check-in Staff",
  admin: "Admin"
};

const GUEST_EXPORT_HEADERS = [
  "Guest ID",
  "Name",
  "Kategorie",
  "Status",
  "Check-in Zeit",
  "Check-in durch",
  "Check-in Gerät",
  "Support Kommentar",
  "Interne Notiz"
];

const AUDIT_EXPORT_HEADERS = [
  "Zeit",
  "Aktion",
  "Guest ID",
  "Gast",
  "Kategorie",
  "Mitarbeiter",
  "Gerät",
  "Details"
];

const appState = {
  firebaseApp: null,
  auth: null,
  db: null,
  user: null,
  eventId: null,
  event: null,
  member: null,
  guests: [],
  guestsLoaded: false,
  auditEntries: [],
  guestUnsubscribe: null,
  auditUnsubscribe: null,
  checkInLocks: new Set(),
  currentTab: "checkin",
  ui: {
    search: "",
    categoryFilter: "all",
    statusFilter: "all",
    listCategory: "all",
    listStatus: "all",
    importRows: [],
    importPreview: [],
    importInProgress: false,
    editingGuestId: "",
    lastBackupMessage: ""
  }
};

const els = {
  main: document.getElementById("main"),
  eventTitle: document.getElementById("eventTitle"),
  eventMeta: document.getElementById("eventMeta"),
  connectionStatus: document.getElementById("connectionStatus"),
  footerText: document.getElementById("footerText")
};

window.addEventListener("online", () => setConnectionStatus("Online", "ok"));
window.addEventListener("offline", () => setConnectionStatus("Offline", "warn"));

document.addEventListener("DOMContentLoaded", boot);

async function boot() {
  if (isConfigMissing()) {
    renderConfigMissing();
    return;
  }

  try {
    appState.firebaseApp = initializeApp(CONFIG.firebaseConfig);
    appState.auth = getAuth(appState.firebaseApp);
    appState.db = getFirestore(appState.firebaseApp);

    enableIndexedDbPersistence(appState.db).catch((error) => {
      console.warn("Firestore offline cache could not be enabled", error.code || error.message);
    });

    setConnectionStatus(navigator.onLine ? "Online" : "Offline", navigator.onLine ? "ok" : "warn");

    onAuthStateChanged(appState.auth, async (user) => {
      if (!user) return;
      appState.user = user;
      try {
        await startApp();
      } catch (error) {
        console.error(error);
        renderError("App konnte nicht geladen werden.", startupErrorMessage(error));
      }
    });

    await signInAnonymously(appState.auth);
  } catch (error) {
    console.error(error);
    renderError("Firebase konnte nicht gestartet werden.", error.message || String(error));
  }
}

async function startApp() {
  const params = new URLSearchParams(window.location.search);
  const rawEventParam = params.get("event");
  const eventParam = resolveEventId(rawEventParam);
  const setupParam = params.get("setup");

  if (setupParam === "1" || !eventParam) {
    renderWelcome();
    return;
  }

  if (rawEventParam && eventParam !== rawEventParam) {
    window.location.replace(urlWithEvent(eventParam));
    return;
  }

  appState.eventId = eventParam;
  localStorage.setItem("guestlist:lastEventId", appState.eventId);

  const eventSnap = await getDoc(eventRef());
  if (!eventSnap.exists()) {
    renderEventNotFound(appState.eventId);
    return;
  }

  appState.event = { id: eventSnap.id, ...eventSnap.data() };
  saveKnownEvent(appState.event);
  els.eventTitle.textContent = appState.event.name || "Gästeliste";
  setEventMeta();

  const memberSnap = await getCurrentMemberSnap();
  if (memberSnap.exists()) {
    appState.member = { id: memberSnap.id, ...memberSnap.data() };
    loadMainApp();
  } else {
    renderJoin();
  }
}

async function getCurrentMemberSnap() {
  try {
    return await getDoc(memberRef(appState.user.uid));
  } catch (error) {
    if (isPermissionError(error)) {
      return { exists: () => false };
    }
    throw error;
  }
}

function isPermissionError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code.includes("permission-denied") || /permission|insufficient/i.test(message);
}

function startupErrorMessage(error) {
  if (isPermissionError(error)) {
    return "Berechtigung fehlt. Bitte Event-Link neu öffnen und PIN erneut eingeben.";
  }
  return error?.message || String(error);
}

function isConfigMissing() {
  const firebaseConfig = CONFIG.firebaseConfig || {};
  return !firebaseConfig.apiKey ||
    !firebaseConfig.projectId ||
    String(firebaseConfig.apiKey).startsWith("PASTE_") ||
    String(firebaseConfig.projectId).startsWith("PASTE_");
}

function renderConfigMissing() {
  els.eventTitle.textContent = "Setup nötig";
  setHeaderMeta([]);
  els.connectionStatus.textContent = "Nicht konfiguriert";
  els.connectionStatus.className = "status-pill err";
  render(`
    <section class="card">
      <h2>Firebase-Konfiguration fehlt</h2>
      <p>Öffne <code>app-config.js</code> und ersetze die Platzhalter durch die Firebase-Web-App-Konfiguration.</p>
      <ol>
        <li>Firebase-Projekt erstellen.</li>
        <li>Firestore Database aktivieren.</li>
        <li>Authentication → Anonymous aktivieren.</li>
        <li>Firestore Rules aus <code>firebase.rules</code> einfügen und veröffentlichen.</li>
        <li>Firebase-Konfiguration in <code>app-config.js</code> eintragen.</li>
      </ol>
    </section>
  `);
}

function renderWelcome() {
  els.eventTitle.textContent = "Gästeliste Check-in";
  setHeaderMeta([]);
  const savedEventId = localStorage.getItem("guestlist:lastEventId") || "";
  const knownEvents = getKnownEvents();
  render(`
    <nav class="nav-tabs">
      <button class="active" type="button">Events Erstellen</button>
      ${savedEventId ? `<button id="returnLastEventBtn" type="button">Zurück zum Event</button>` : ""}
    </nav>

    ${knownEvents.length ? `
      <section class="card">
        <h2>Bestehende Events</h2>
        ${renderKnownEventList()}
      </section>
    ` : ""}

    <section class="card compact">
      <details>
        <summary class="details-summary">Event per ID öffnen</summary>
        <p class="small">Nur verwenden, wenn der Event nicht in der Liste steht. Die Basis-URL öffnet kein Event automatisch.</p>
        ${savedEventId ? `<p class="notice warning">Zuletzt in diesem Browser geöffnet: <code>${escapeHtml(savedEventId)}</code>. Bitte bewusst prüfen, ob das der richtige Tag ist.</p>` : ""}
        <form id="joinExistingForm" class="grid two">
          <div class="form-row">
            <label for="existingEventId">Event-ID</label>
            <input id="existingEventId" value="" placeholder="z.B. evt-abc123" autocomplete="off" />
          </div>
          <div class="form-row" style="align-self:end">
            <button class="btn-primary" type="submit">Event öffnen</button>
          </div>
        </form>
      </details>
    </section>

    <section class="card">
      <h2>Neues Event initialisieren</h2>
      <form id="createEventForm" class="grid two">
        <div class="form-row">
          <label for="newEventName">Eventname</label>
          <input id="newEventName" value="${escapeHtml(CONFIG.app?.defaultEventName || "Event Gästeliste")}" required />
        </div>
        <div class="form-row">
          <label for="newEventDate">Datum</label>
          <input id="newEventDate" type="date" required />
          <p class="field-help">Die Event-ID wird aus den ersten zwei Wörtern und dem Datum erzeugt, z.B. <code>the-garden-260501</code>.</p>
        </div>
        <div class="form-row">
          <label for="adminPin">Globaler Admin-PIN</label>
          <input id="adminPin" type="password" minlength="${PIN_MIN_LENGTH}" required placeholder="für Event-Erstellung und Admin-Zugriff" />
        </div>
        <div class="form-row">
          <label for="checkinPin">Check-in-PIN</label>
          <input id="checkinPin" type="password" minlength="${PIN_MIN_LENGTH}" required placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
        </div>
        <div class="form-row">
          <label for="setupName">Dein Name</label>
          <input id="setupName" value="Admin" required />
        </div>
        <div class="form-row">
          <label for="setupDevice">Gerät</label>
          <input id="setupDevice" value="" placeholder="optional" />
        </div>
        <div class="form-row" style="grid-column:1/-1">
          <label for="categoryList">Kategorien, eine pro Zeile</label>
          <textarea id="categoryList">${DEFAULT_CATEGORIES.map(escapeHtml).join("\n")}</textarea>
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" type="submit">Event erstellen</button>
        </div>
      </form>
      <div id="setupResult"></div>
    </section>
  `);

  bindKnownLinkCopyButtons();
  bindKnownEventButtons();
  document.getElementById("returnLastEventBtn")?.addEventListener("click", () => {
    window.location.href = urlWithEvent(savedEventId);
  });

  document.getElementById("joinExistingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = document.getElementById("existingEventId").value.trim();
    if (!id) return;
    window.location.href = urlWithEvent(id);
  });

  document.getElementById("createEventForm").addEventListener("submit", createEventFromForm);
}

async function createEventFromForm(event) {
  event.preventDefault();
  const result = document.getElementById("setupResult");
  result.innerHTML = `<p class="notice info">Event wird erstellt…</p>`;

  const name = val("newEventName").trim();
  const date = val("newEventDate").trim();
  const adminPin = val("adminPin");
  const checkinPin = val("checkinPin");
  const displayName = val("setupName").trim() || "Admin";
  const deviceLabel = val("setupDevice").trim();
  const categories = val("categoryList").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  if (!name || !date) {
    result.innerHTML = `<p class="notice error">Eventname und Datum sind Pflichtfelder.</p>`;
    return;
  }

  const eventId = buildEventId(name, date);

  if (adminPin.length < PIN_MIN_LENGTH || checkinPin.length < PIN_MIN_LENGTH) {
    result.innerHTML = `<p class="notice error">PINs müssen mindestens ${PIN_MIN_LENGTH} Zeichen haben.</p>`;
    return;
  }

  try {
    if (!GLOBAL_ADMIN_EVENT_ID) {
      result.innerHTML = `<p class="notice error">Globaler Admin-Event ist nicht konfiguriert.</p>`;
      return;
    }

    result.innerHTML = `<p class="notice info">Globaler Admin-PIN wird geprüft…</p>`;
    await verifyGlobalAdminPin(adminPin, displayName, deviceLabel);

    const targetEventRef = doc(appState.db, "events", eventId);
    const existingEventSnap = await getDoc(targetEventRef);
    if (existingEventSnap.exists()) {
      result.innerHTML = `<p class="notice error">Event-ID <code>${escapeHtml(eventId)}</code> existiert bereits. Bitte Eventname oder Datum anpassen.</p>`;
      return;
    }

    const adminPinHash = await hashPin(eventId, "admin", adminPin);
    const checkinPinHash = await hashPin(eventId, "checkin", checkinPin);

    await setDoc(targetEventRef, {
      name,
      date,
      categories,
      statuses: DEFAULT_STATUSES,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: appState.user.uid
    });

    await setDoc(doc(appState.db, "events", eventId, "private", "security"), {
      adminPinHash,
      checkinPinHash,
      createdAt: serverTimestamp()
    });

    await setDoc(doc(appState.db, "events", eventId, "members", appState.user.uid), {
      uid: appState.user.uid,
      role: "admin",
      pinHash: adminPinHash,
      displayName,
      deviceLabel,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    saveKnownEvent({ id: eventId, name, date });

    result.innerHTML = `
      <div class="notice success">
        Event erstellt. Speichere die PINs sicher. Du wirst jetzt weitergeleitet.
      </div>
    `;
    setTimeout(() => {
      window.location.href = urlWithEvent(eventId);
    }, 800);
  } catch (error) {
    console.error(error);
    result.innerHTML = `<p class="notice error">Event konnte nicht erstellt werden: ${escapeHtml(setupErrorMessage(error))}</p>`;
  }
}

function renderEventNotFound(eventId) {
  els.eventTitle.textContent = "Event nicht gefunden";
  setHeaderMeta([`ID: ${eventId}`]);
  render(`
    <section class="card">
      <h2>Event nicht gefunden</h2>
      <p>Für die Event-ID <code>${escapeHtml(eventId)}</code> wurde kein Event gefunden.</p>
      <div class="actions">
        <button class="btn-secondary" onclick="window.location.href='${escapeJsUrl(urlWithoutParams())}?setup=1'">Zur Event-Auswahl</button>
      </div>
    </section>
  `);
}

function renderJoin() {
  const eventName = appState.event?.name || "Event";
  els.eventTitle.textContent = eventName;
  setEventMeta();
  render(`
    <section class="card">
      <h2>Mit Event verbinden</h2>
      <p class="small">Event-ID: <code>${escapeHtml(appState.eventId)}</code></p>
      <form id="joinForm" class="grid two">
        <div class="form-row">
          <label for="memberRole">Rolle</label>
          <select id="memberRole">
            <option value="checkin">Check-in Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="form-row">
          <label for="memberPin">PIN</label>
          <input id="memberPin" type="password" minlength="${PIN_MIN_LENGTH}" required autocomplete="off" placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
          <p class="field-help">Admin: globaler Admin-PIN. Check-in Staff: Event-spezifischer Check-in-PIN.</p>
        </div>
        <div class="form-row">
          <label for="memberName">Name Mitarbeiter:in</label>
          <input id="memberName" value="${escapeHtml(localStorage.getItem("guestlist:memberName") || "")}" required placeholder="z.B. Eingang 1 / Max" />
        </div>
        <div class="form-row">
          <label for="deviceLabel">Gerät <span class="optional-label">optional</span></label>
          <input id="deviceLabel" value="" placeholder="z.B. iPad Eingang links" />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" type="submit">Verbinden</button>
        </div>
      </form>
      <div id="joinResult"></div>
    </section>
  `);
  document.getElementById("joinForm").addEventListener("submit", joinEventFromForm);
}

async function joinEventFromForm(event) {
  event.preventDefault();
  const result = document.getElementById("joinResult");
  result.innerHTML = `<p class="notice info">Verbinde…</p>`;

  const role = val("memberRole");
  const pin = val("memberPin");
  const displayName = val("memberName").trim() || "Check-in";
  const deviceLabel = val("deviceLabel").trim();

  if (pin.length < PIN_MIN_LENGTH) {
    result.innerHTML = `<p class="notice warning">PIN ist zu kurz. Bitte den vollständigen PIN mit mindestens ${PIN_MIN_LENGTH} Zeichen eingeben.</p>`;
    return;
  }

  const pinHash = await hashPin(appState.eventId, role, pin);

  try {
    await setDoc(memberRef(appState.user.uid), {
      uid: appState.user.uid,
      role,
      pinHash,
      displayName,
      deviceLabel,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    localStorage.setItem("guestlist:memberName", displayName);
    localStorage.removeItem("guestlist:deviceLabel");
    if (role === "admin") saveAdminSession(pin, displayName);
    else clearAdminSession();

    const memberSnap = await getDoc(memberRef(appState.user.uid));
    appState.member = { id: memberSnap.id, ...memberSnap.data() };
    result.innerHTML = `<p class="notice success">Verbunden.</p>`;
    loadMainApp();
  } catch (error) {
    console.error(error);
    result.innerHTML = `<p class="notice error">${escapeHtml(joinErrorMessage(error))}</p>`;
  }
}

function joinErrorMessage(error) {
  if (isPermissionError(error)) {
    return "Verbindung fehlgeschlagen. Prüfe Rolle und PIN. Das Feld Gerät darf leer bleiben.";
  }
  return `Verbindung fehlgeschlagen: ${error?.message || error}`;
}

function saveAdminSession(pin, displayName) {
  try {
    sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify({
      pin,
      displayName,
      savedAt: Date.now()
    }));
  } catch {
    // Session convenience only; ignore if browser blocks it.
  }
}

function getAdminSession() {
  try {
    const data = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || "null");
    if (!data?.pin) return null;
    return data;
  } catch {
    return null;
  }
}

function clearAdminSession() {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

async function verifyGlobalAdminPin(pin, displayName, deviceLabel) {
  const pinHash = await hashPin(GLOBAL_ADMIN_EVENT_ID, "admin", pin);
  await setDoc(doc(appState.db, "events", GLOBAL_ADMIN_EVENT_ID, "members", appState.user.uid), {
    uid: appState.user.uid,
    role: "admin",
    pinHash,
    displayName,
    deviceLabel,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function setupErrorMessage(error) {
  const message = String(error?.message || error || "");
  if (/permission|insufficient/i.test(message)) {
    return "Globaler Admin-PIN ist falsch oder die Firebase-Regeln blockieren die Prüfung.";
  }
  return message || "Unbekannter Fehler.";
}

function loadMainApp() {
  unsubscribeAll();
  appState.guestsLoaded = false;
  renderShell();
  subscribeGuests();
  renderActiveTab();
}

function renderShell() {
  const role = ROLE_META[appState.member?.role] || appState.member?.role || "User";
  els.eventTitle.textContent = appState.event?.name || "Gästeliste";
  setEventMeta();
  els.footerText.textContent = `${role} · ${appState.member?.displayName || ""} · ${appState.member?.deviceLabel || ""} · Event: ${appState.eventId || "-"}`;

  render(`
    <div id="flash"></div>
    <nav class="nav-tabs" id="navTabs">
      <button data-tab="checkin" class="active">Check-in</button>
      ${isAdmin() ? `<button data-tab="overview">Übersicht</button><button data-tab="lists">Listen</button><button data-tab="admin">Event Gäste & Betrieb</button><button data-tab="log">Log</button>` : ""}
      <button id="switchEventBtn" type="button">Events Erstellen</button>
      <button id="switchRoleBtn" type="button">Rolle/PIN wechseln</button>
    </nav>
    <section id="tabContent"></section>
  `);

  document.querySelectorAll("#navTabs button[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentTab = button.dataset.tab;
      document.querySelectorAll("#navTabs button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === appState.currentTab));
      renderActiveTab();
    });
  });
  document.getElementById("switchRoleBtn")?.addEventListener("click", () => renderJoin());
  document.getElementById("switchEventBtn")?.addEventListener("click", () => {
    window.location.href = `${urlWithoutParams()}?setup=1`;
  });
}

function renderActiveTab() {
  if (!isAdmin() && ["overview", "lists", "admin", "log"].includes(appState.currentTab)) appState.currentTab = "checkin";
  if (appState.currentTab === "checkin") renderCheckin();
  else if (appState.currentTab === "overview") renderOverview();
  else if (appState.currentTab === "lists") renderLists();
  else if (appState.currentTab === "admin") renderAdmin();
  else if (appState.currentTab === "log") renderAuditLog();
}

function subscribeGuests() {
  const q = query(collection(appState.db, "events", appState.eventId, "guests"), orderBy("searchName"));
  appState.guestUnsubscribe = onSnapshot(q, (snapshot) => {
    appState.guests = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    appState.guestsLoaded = true;
    if (appState.ui.importInProgress && appState.currentTab === "admin") return;
    renderActiveTab();
  }, (error) => {
    console.error(error);
    appState.guestsLoaded = true;
    notify("Gästeliste konnte nicht geladen werden. Prüfe Berechtigungen und Firestore-Regeln.", "error");
  });
}

function renderCheckin() {
  const content = tabContent();
  const categories = getCategories();

  if (!appState.guestsLoaded) {
    content.innerHTML = `
      ${renderSummaryCards()}
      ${isOffline() ? `<div class="notice error"><strong>Offline:</strong> Check-in und Änderungen sind gesperrt. Bitte Verbindung prüfen und Seite neu laden.</div>` : ""}
      <section class="card compact">
        <strong>Gäste laden…</strong>
        <p class="small">Falls diese Meldung bleibt: Verbindung prüfen und Seite hart neu laden.</p>
      </section>
    `;
    return;
  }

  const filteredGuests = filterGuests(appState.ui.search, appState.ui.categoryFilter, appState.ui.statusFilter);
  const results = filteredGuests.slice(0, 60);
  const filteredCount = filteredGuests.length;

  content.innerHTML = `
    ${renderSummaryCards()}
    ${isOffline() ? `<div class="notice error"><strong>Offline:</strong> Check-in und Änderungen sind gesperrt. Bitte Verbindung prüfen und Seite neu laden.</div>` : ""}
    ${renderEmptyEventWarning()}
    <section class="card search-sticky">
      <div class="grid three">
        <div class="form-row" style="grid-column: span 2;">
          <label for="guestSearch">Suche nach Name oder Guest ID</label>
          <input id="guestSearch" class="input-large" value="${escapeHtml(appState.ui.search)}" placeholder="Name eintippen…" autocomplete="off" autofocus />
        </div>
        <div class="form-row">
          <label for="statusFilter">Status</label>
          <select id="statusFilter">
            ${option("all", "Alle Status", appState.ui.statusFilter)}
            ${Object.entries(STATUS_META).map(([value, meta]) => option(value, meta.label, appState.ui.statusFilter)).join("")}
          </select>
        </div>
        <div class="form-row" style="grid-column:1/-1">
          <label for="categoryFilter">Kategorie</label>
          <select id="categoryFilter">
            ${option("all", "Alle Kategorien", appState.ui.categoryFilter)}
            ${categories.map((cat) => option(cat, cat, appState.ui.categoryFilter)).join("")}
          </select>
        </div>
      </div>
      <p class="small">${filteredCount} Treffer · maximal 60 sichtbar. Für schnellen Eingang: mindestens 2–3 Buchstaben suchen.</p>
    </section>
    ${isAdmin() ? renderAddGuestPanel(categories) : ""}
    <section class="guest-list">
      ${results.length ? results.map(renderGuestCard).join("") : `<div class="card compact"><strong>Keine Treffer</strong><p class="small">Prüfe Schreibweise, Kategorie oder Statusfilter.</p></div>`}
    </section>
  `;

  const search = document.getElementById("guestSearch");
  search?.addEventListener("input", debounce((e) => {
    appState.ui.search = e.target.value;
    renderCheckin();
  }, 120));
  search?.focus({ preventScroll: true });
  search?.setSelectionRange(search.value.length, search.value.length);

  document.getElementById("categoryFilter")?.addEventListener("change", (e) => {
    appState.ui.categoryFilter = e.target.value;
    renderCheckin();
  });
  document.getElementById("statusFilter")?.addEventListener("change", (e) => {
    appState.ui.statusFilter = e.target.value;
    renderCheckin();
  });
  document.getElementById("addGuestForm")?.addEventListener("submit", addGuestFromForm);

  attachGuestCardHandlers(content);
}

function renderEmptyEventWarning() {
  if (!appState.guestsLoaded) return "";
  if (appState.guests.length) return "";
  if (isAdmin()) {
    return `
      <div class="notice warning">
        <strong>Dieses Event hat aktuell 0 Gäste.</strong>
        Prüfe oben Eventname, Datum und Event-ID. Importiere zuerst die passende CSV im Admin-Tab, bevor der Link an Check-in-Geräte geht.
      </div>
    `;
  }
  return `
    <div class="notice warning">
      <strong>Dieses Event hat aktuell 0 Gäste.</strong>
      Bitte Admin informieren und prüfen lassen, ob der richtige Event-Link geöffnet und die CSV importiert wurde.
    </div>
  `;
}

function renderAddGuestPanel(categories) {
  return `
    <section class="card compact">
      <details>
        <summary class="details-summary">Gast manuell hinzufügen</summary>
        <p class="small">Nur für kurzfristige Ergänzungen verwenden. Der neue Gast erscheint danach direkt in dieser Liste.</p>
        <form id="addGuestForm" class="grid two">
          <div class="form-row">
            <label for="addName">Name</label>
            <input id="addName" required />
          </div>
          <div class="form-row">
            <label for="addCategory">Kategorie</label>
            <select id="addCategory">${categories.map((cat) => `<option>${escapeHtml(cat)}</option>`).join("")}</select>
          </div>
          <div class="form-row" style="grid-column:1/-1">
            <label for="addSupportComment">Support-Kommentar</label>
            <textarea id="addSupportComment"></textarea>
          </div>
          <div class="form-row" style="grid-column:1/-1">
            <label for="addInternalNote">Interne Notiz</label>
            <textarea id="addInternalNote"></textarea>
          </div>
          <div class="actions" style="grid-column:1/-1"><button class="btn-primary" type="submit">Gast speichern</button></div>
        </form>
      </details>
    </section>
  `;
}

function renderGuestCard(guest) {
  if (isAdmin() && appState.ui.editingGuestId === guest.id) return renderGuestEditCard(guest);

  const status = STATUS_META[guest.status || "open"] || STATUS_META.open;
  const checkedText = guest.checkedInAt ? ` · ${formatTimestamp(guest.checkedInAt)}` : "";
  const byText = guest.checkedInByName ? ` · durch ${escapeHtml(guest.checkedInByName)}` : "";
  const alreadyChecked = guest.status === "checked_in";
  const canOverride = isAdmin();
  const commentId = `comment-${guest.id}`;
  const disabled = isOffline() ? "disabled" : "";

  return `
    <article class="guest-card" data-guest-id="${escapeHtml(guest.id)}">
      <div class="guest-head">
        <div>
          <h3 class="guest-title">${escapeHtml(guest.name || "Ohne Name")}</h3>
          <div class="guest-meta">${escapeHtml(guest.guestId || guest.id)}${checkedText}${byText}</div>
          <div class="badges">
            <span class="badge info">${escapeHtml(guest.category || "Keine Kategorie")}</span>
            <span class="badge ${status.badge}">${status.label}</span>
          </div>
        </div>
        <div class="small">${escapeHtml(guest.checkedInDevice || "")}</div>
      </div>
      ${guest.internalNote ? `<p class="notice info"><strong>Notiz:</strong> ${escapeHtml(guest.internalNote)}</p>` : ""}
      <div class="guest-actions">
        <div class="comment-box form-row">
          <label for="${commentId}">Support-Kommentar</label>
          <textarea id="${commentId}" data-comment-for="${escapeHtml(guest.id)}" placeholder="z.B. VIP-Band abgeben, kommt mit Künstler…" ${disabled}>${escapeHtml(guest.supportComment || "")}</textarea>
          <button class="btn-secondary" data-action="save-comment" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Kommentar speichern</button>
        </div>
        <div class="actions" style="margin-top:22px">
          ${alreadyChecked && !canOverride ? `<button class="btn-secondary" data-action="checkin" data-guest-id="${escapeHtml(guest.id)}" data-force="0" ${disabled}>Bereits eingecheckt</button>` : `<button class="btn-success" data-action="checkin" data-guest-id="${escapeHtml(guest.id)}" data-force="${alreadyChecked && canOverride ? "1" : "0"}" ${disabled}>${alreadyChecked ? "Check-in überschreiben" : "Einchecken"}</button>`}
          ${isAdmin() ? `
            <button class="btn-secondary" data-action="edit-guest" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Bearbeiten</button>
            <button class="btn-warning" data-action="no-show" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>No Show</button>
            <button class="btn-secondary" data-action="reset-open" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Auf Offen</button>
            <button class="btn-danger" data-action="delete-guest" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Löschen</button>
          ` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderGuestEditCard(guest) {
  const categories = getCategories();
  const disabled = isOffline() ? "disabled" : "";
  return `
    <article class="guest-card edit-card" data-guest-id="${escapeHtml(guest.id)}">
      <h3 class="guest-title">Gast bearbeiten</h3>
      <div class="guest-meta">${escapeHtml(guest.guestId || guest.id)}</div>
      <form class="grid two edit-guest-form" data-edit-guest-form="${escapeHtml(guest.id)}">
        <div class="form-row">
          <label>Name</label>
          <input name="name" value="${escapeHtml(guest.name || "")}" required ${disabled} />
        </div>
        <div class="form-row">
          <label>Kategorie</label>
          <select name="category" ${disabled}>
            ${categories.map((cat) => option(cat, cat, guest.category || categories[0] || "GA")).join("")}
          </select>
        </div>
        <div class="form-row" style="grid-column:1/-1">
          <label>Support-Kommentar</label>
          <textarea name="supportComment" ${disabled}>${escapeHtml(guest.supportComment || "")}</textarea>
        </div>
        <div class="form-row" style="grid-column:1/-1">
          <label>Interne Notiz</label>
          <textarea name="internalNote" ${disabled}>${escapeHtml(guest.internalNote || "")}</textarea>
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" type="submit" ${disabled}>Speichern</button>
          <button class="btn-secondary" type="button" data-action="cancel-edit" data-guest-id="${escapeHtml(guest.id)}">Abbrechen</button>
        </div>
      </form>
    </article>
  `;
}

function attachGuestCardHandlers(root) {
  root.querySelectorAll("[data-action='checkin']").forEach((button) => {
    button.addEventListener("click", () => checkInGuest(button.dataset.guestId, button.dataset.force === "1"));
  });

  root.querySelectorAll("[data-action='save-comment']").forEach((button) => {
    button.addEventListener("click", () => saveGuestComment(button.dataset.guestId));
  });

  root.querySelectorAll("[data-action='edit-guest']").forEach((button) => {
    button.addEventListener("click", () => editGuest(button.dataset.guestId));
  });

  root.querySelectorAll("[data-edit-guest-form]").forEach((form) => {
    form.addEventListener("submit", (event) => saveEditedGuest(event, form.dataset.editGuestForm));
  });

  root.querySelectorAll("[data-action='cancel-edit']").forEach((button) => {
    button.addEventListener("click", () => {
      if (appState.ui.editingGuestId === button.dataset.guestId) appState.ui.editingGuestId = "";
      renderActiveTab();
    });
  });

  root.querySelectorAll("[data-action='no-show']").forEach((button) => {
    button.addEventListener("click", () => updateGuestStatus(button.dataset.guestId, "no_show"));
  });

  root.querySelectorAll("[data-action='reset-open']").forEach((button) => {
    button.addEventListener("click", () => updateGuestStatus(button.dataset.guestId, "open"));
  });

  root.querySelectorAll("[data-action='delete-guest']").forEach((button) => {
    button.addEventListener("click", () => deleteGuest(button.dataset.guestId));
  });
}

async function checkInGuest(guestDocId, force = false) {
  if (!requireOnline("Check-in")) return;
  if (appState.checkInLocks.has(guestDocId)) return;
  const guest = findGuest(guestDocId);
  if (!guest) return;

  if (guest.status === "checked_in" && !force) {
    await addAudit("duplicate_check_in_attempt", guest, {
      existingCheckedInAt: formatTimestamp(guest.checkedInAt),
      existingCheckedInBy: guest.checkedInByName || "",
      source: "local_state"
    });
    notify(`Schon eingecheckt: ${guest.name} um ${formatTimestamp(guest.checkedInAt)}.`, "warning");
    return;
  }

  if (guest.status === "checked_in" && force && !confirm(`${guest.name} ist bereits eingecheckt. Check-in überschreiben?`)) {
    return;
  }

  try {
    appState.checkInLocks.add(guestDocId);
    let before = null;
    await runTransaction(appState.db, async (transaction) => {
      const ref = guestRef(guestDocId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("Gast nicht gefunden.");
      before = snap.data();
      if (before.status === "checked_in" && !force) {
        throw new Error("ALREADY_CHECKED_IN");
      }
      transaction.update(ref, {
        status: "checked_in",
        checkedInAt: serverTimestamp(),
        checkedInByUid: appState.user.uid,
        checkedInByName: appState.member.displayName || "Check-in",
        checkedInDevice: appState.member.deviceLabel || "",
        updatedAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
        lastActionByName: appState.member.displayName || "Check-in"
      });
    });

    await addAudit("check_in", guest, {
      oldStatus: before?.status || "open",
      newStatus: "checked_in",
      force
    });
    notify(`${guest.name} eingecheckt.`, "success");
  } catch (error) {
    if (error.message === "ALREADY_CHECKED_IN") {
      await addAudit("duplicate_check_in_attempt", guest, {
        existingCheckedInAt: formatTimestamp(before?.checkedInAt),
        existingCheckedInBy: before?.checkedInByName || "",
        source: "transaction"
      });
      notify(`Doppel-Check-in verhindert: ${guest.name} ist bereits eingecheckt.`, "warning");
    } else {
      console.error(error);
      notify(`Check-in fehlgeschlagen: ${error.message || error}`, "error");
    }
  } finally {
    appState.checkInLocks.delete(guestDocId);
  }
}

async function saveGuestComment(guestDocId) {
  if (!requireOnline("Kommentar speichern")) return;
  const guest = findGuest(guestDocId);
  const textarea = document.querySelector(`[data-comment-for="${cssEscape(guestDocId)}"]`);
  if (!guest || !textarea) return;
  const newComment = textarea.value.trim();

  try {
    await updateDoc(guestRef(guestDocId), {
      supportComment: newComment,
      updatedAt: serverTimestamp(),
      lastActionAt: serverTimestamp(),
      lastActionByName: appState.member.displayName || "Check-in"
    });
    await addAudit("support_comment_update", guest, {
      oldComment: guest.supportComment || "",
      newComment
    });
    notify("Support-Kommentar gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Kommentar konnte nicht gespeichert werden: ${error.message || error}`, "error");
  }
}

function editGuest(guestDocId) {
  if (!isAdmin()) {
    notify("Nur Admins dürfen Gäste bearbeiten.", "warning");
    return;
  }
  const guest = findGuest(guestDocId);
  if (!guest) return;

  appState.ui.editingGuestId = guestDocId;
  renderActiveTab();
}

async function saveEditedGuest(event, guestDocId) {
  event.preventDefault();
  if (!requireOnline("Gast speichern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen Gäste bearbeiten.", "warning");
    return;
  }
  const guest = findGuest(guestDocId);
  if (!guest) return;

  const form = event.currentTarget;
  const data = new FormData(form);
  const trimmedName = String(data.get("name") || "").trim();
  if (!trimmedName) {
    notify("Name darf nicht leer sein.", "warning");
    return;
  }
  const normalizedCategory = normalizeCategory(data.get("category") || guest.category || getCategories()[0] || "GA");
  const supportComment = String(data.get("supportComment") || "").trim();
  const internalNote = String(data.get("internalNote") || "").trim();

  try {
    await updateDoc(guestRef(guestDocId), {
      name: trimmedName,
      category: normalizedCategory,
      searchName: normalizeForSearch(`${trimmedName} ${guest.guestId || ""} ${normalizedCategory}`),
      supportComment,
      internalNote,
      updatedAt: serverTimestamp(),
      lastActionAt: serverTimestamp(),
      lastActionByName: appState.member.displayName || "Admin"
    });
    await addAudit("guest_update", guest, {
      oldName: guest.name || "",
      newName: trimmedName,
      oldCategory: guest.category || "",
      newCategory: normalizedCategory
    });
    appState.ui.editingGuestId = "";
    notify("Gast aktualisiert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Gast konnte nicht aktualisiert werden: ${error.message || error}`, "error");
  }
}

async function updateGuestStatus(guestDocId, status) {
  if (!requireOnline("Status ändern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen den Status manuell ändern.", "warning");
    return;
  }
  const guest = findGuest(guestDocId);
  if (!guest) return;

  try {
    const update = {
      status,
      updatedAt: serverTimestamp(),
      lastActionAt: serverTimestamp(),
      lastActionByName: appState.member.displayName || "Admin"
    };
    if (status !== "checked_in") {
      update.checkedInAt = null;
      update.checkedInByUid = null;
      update.checkedInByName = null;
      update.checkedInDevice = null;
    }
    await updateDoc(guestRef(guestDocId), update);
    await addAudit("status_update", guest, {
      oldStatus: guest.status || "open",
      newStatus: status
    });
    notify(`Status geändert: ${guest.name} → ${STATUS_META[status]?.label || status}.`, "success");
  } catch (error) {
    console.error(error);
    notify(`Status konnte nicht geändert werden: ${error.message || error}`, "error");
  }
}

async function deleteGuest(guestDocId) {
  if (!requireOnline("Gast löschen")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen Gäste löschen.", "warning");
    return;
  }
  const guest = findGuest(guestDocId);
  if (!guest) return;

  const label = `${guest.name || "Ohne Name"} (${guest.guestId || guest.id})`;
  if (!confirm(`Gast wirklich löschen?\n\n${label}\n\nDiese Aktion entfernt den Gast aus diesem Event.`)) return;

  try {
    await deleteDoc(guestRef(guestDocId));
    await addAudit("guest_delete", guest, {
      oldStatus: guest.status || "open",
      checkedInAt: formatTimestamp(guest.checkedInAt),
      checkedInBy: guest.checkedInByName || ""
    });
    if (appState.ui.editingGuestId === guestDocId) appState.ui.editingGuestId = "";
    notify(`Gast gelöscht: ${guest.name || guest.guestId || guest.id}.`, "success");
  } catch (error) {
    console.error(error);
    notify(`Gast konnte nicht gelöscht werden: ${error.message || error}`, "error");
  }
}

function renderOverview() {
  const content = tabContent();
  content.innerHTML = `
    ${renderSummaryCards()}
    <section class="card">
      <h2>Summen nach Kategorie</h2>
      ${renderCategoryStatsTable()}
    </section>
    <section class="card">
      <h2>Letzte Check-ins</h2>
      ${renderRecentCheckins()}
    </section>
  `;
}

function renderSummaryCards() {
  const stats = calculateStats();
  return `
    <section class="summary-grid">
      <div class="metric"><span>Total</span><strong>${stats.total}</strong></div>
      <div class="metric"><span>Eingecheckt</span><strong>${stats.checkedIn}</strong></div>
      <div class="metric"><span>Offen</span><strong>${stats.open}</strong></div>
      <div class="metric"><span>No Show</span><strong>${stats.noShow}</strong></div>
    </section>
  `;
}

function renderCategoryStatsTable() {
  const categories = getCategories();
  const rows = categories.map((category) => {
    const guests = appState.guests.filter((g) => (g.category || "") === category);
    const total = guests.length;
    const checked = guests.filter((g) => g.status === "checked_in").length;
    const open = guests.filter((g) => (g.status || "open") === "open").length;
    const noShow = guests.filter((g) => g.status === "no_show").length;
    return `
      <tr>
        <td><strong>${escapeHtml(category)}</strong></td>
        <td>${total}</td>
        <td>${checked}</td>
        <td>${open}</td>
        <td>${noShow}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Kategorie</th><th>Total</th><th>Eingecheckt</th><th>Offen</th><th>No Show</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderRecentCheckins() {
  const rows = appState.guests
    .filter((g) => g.status === "checked_in" && g.checkedInAt)
    .sort((a, b) => timestampMillis(b.checkedInAt) - timestampMillis(a.checkedInAt))
    .slice(0, 20)
    .map((g) => `
      <tr>
        <td>${escapeHtml(g.name || "")}</td>
        <td>${escapeHtml(g.category || "")}</td>
        <td>${formatTimestamp(g.checkedInAt)}</td>
        <td>${escapeHtml(g.checkedInByName || "")}</td>
      </tr>
    `).join("");

  if (!rows) return `<p class="small">Noch keine Check-ins.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Kategorie</th><th>Zeit</th><th>Durch</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderLists() {
  const content = tabContent();
  const categories = getCategories();
  const guests = filterGuests("", appState.ui.listCategory, appState.ui.listStatus);

  content.innerHTML = `
    ${renderSummaryCards()}
    <section class="card">
      <h2>Listen</h2>
      <div class="grid two">
        <div class="form-row">
          <label for="listCategory">Kategorie</label>
          <select id="listCategory">
            ${option("all", "Alle Kategorien", appState.ui.listCategory)}
            ${categories.map((cat) => option(cat, cat, appState.ui.listCategory)).join("")}
          </select>
        </div>
        <div class="form-row">
          <label for="listStatus">Status</label>
          <select id="listStatus">
            ${option("all", "Alle Status", appState.ui.listStatus)}
            ${Object.entries(STATUS_META).map(([value, meta]) => option(value, meta.label, appState.ui.listStatus)).join("")}
          </select>
        </div>
      </div>
      <p class="small">${guests.length} Personen in dieser Liste.</p>
      ${renderGuestTable(guests)}
    </section>
  `;

  document.getElementById("listCategory")?.addEventListener("change", (e) => {
    appState.ui.listCategory = e.target.value;
    renderLists();
  });
  document.getElementById("listStatus")?.addEventListener("change", (e) => {
    appState.ui.listStatus = e.target.value;
    renderLists();
  });
}

function renderGuestTable(guests) {
  const rows = guests.map((g) => `
    <tr>
      <td>${escapeHtml(g.name || "")}</td>
      <td>${escapeHtml(g.guestId || g.id)}</td>
      <td>${escapeHtml(g.category || "")}</td>
      <td><span class="badge ${STATUS_META[g.status || "open"]?.badge || "warning"}">${STATUS_META[g.status || "open"]?.label || "Offen"}</span></td>
      <td>${escapeHtml(g.supportComment || "")}</td>
      <td>${formatTimestamp(g.checkedInAt)}</td>
    </tr>
  `).join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Guest ID</th><th>Kategorie</th><th>Status</th><th>Support-Kommentar</th><th>Check-in Zeit</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6">Keine Einträge.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderAdmin() {
  if (!isAdmin()) {
    tabContent().innerHTML = `<section class="card"><h2>Kein Zugriff</h2><p>Admin-Rechte erforderlich.</p></section>`;
    return;
  }

  const content = tabContent();
  const categories = getCategories();
  content.innerHTML = `
    <section class="card">
      <h2>Kurzanleitung Admin</h2>
      <ul class="compact-list">
        <li>Der Admin-PIN ist global für alle Events; Check-in-PINs sind pro Event separat.</li>
        <li>Vor Eventstart unter Export / Backup eine CSV-Sicherung herunterladen.</li>
        <li>Event-Link und beide PINs extern sichern; PINs sind später nicht auslesbar.</li>
        <li>Bei Geräteproblemen: Seite hart neu laden (<code>Ctrl+F5</code>), Event-Link neu öffnen, PIN erneut eingeben.</li>
      </ul>
    </section>

    <section class="card">
      <h2>Event wechseln</h2>
      <p class="small">Öffnet ein anderes vorbereitetes Event in diesem Browser. Gäste, Import und Export bleiben pro Event getrennt.</p>
      ${renderKnownEventList(appState.eventId)}
    </section>

    <section class="card">
      <h2>Event-Einstellungen</h2>
      <form id="eventNameForm" class="grid two">
        <div class="form-row">
          <label for="eventNameInput">Eventname</label>
          <input id="eventNameInput" value="${escapeHtml(appState.event?.name || "")}" required />
        </div>
        <div class="form-row">
          <label>Event-ID</label>
          <input value="${escapeHtml(appState.eventId || "")}" readonly />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" type="submit">Eventname speichern</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Event-Links für Door-Leads</h2>
      <p class="small">Diese Links an Check-in-Geräte geben. Mitarbeiter:innen benötigen zusätzlich den Check-in-PIN. Nicht die Basis-URL verwenden.</p>
      ${renderKnownEventLinks()}
    </section>

    <section class="card">
      <h2>CSV Import</h2>
      <p class="small">Erwartete Spalten: <code>Name</code>, <code>Kategorie</code>, optional <code>Guest ID</code>, <code>Support Kommentar</code>, <code>Notiz</code>. Excel vorher als CSV speichern.</p>
      <div class="grid two">
        <div class="form-row">
          <label for="csvFile">CSV-Datei</label>
          <input id="csvFile" type="file" accept=".csv,text/csv" />
        </div>
        <div class="form-row">
          <label for="defaultImportCategory">Fallback-Kategorie</label>
          <select id="defaultImportCategory">${categories.map((cat) => `<option>${escapeHtml(cat)}</option>`).join("")}</select>
        </div>
      </div>
      <label class="small" style="display:flex; gap:8px; align-items:center; margin-top:10px">
        <input id="replaceGuests" type="checkbox" style="width:auto; min-height:auto" /> Vorhandene Gäste vor Import löschen
      </label>
      <div class="actions">
        <button class="btn-secondary" id="previewImportBtn">CSV prüfen</button>
        <button class="btn-primary" id="runImportBtn" disabled>Import starten</button>
      </div>
      <div id="importResult"></div>
    </section>

    <section class="card">
      <h2>Export / Backup</h2>
      <p class="small">Backup für dieses Event: ${escapeHtml(appState.event?.name || "")} · ${escapeHtml(appState.event?.date || "")} · ${escapeHtml(appState.eventId || "")} · aktuell ${appState.guests.length} Gäste.</p>
      <div class="actions">
        <button class="btn-secondary" data-export="all">Alle Gäste CSV</button>
        <button class="btn-secondary" data-export="checked_in">Eingecheckte CSV</button>
        <button class="btn-secondary" data-export="open">Offene CSV</button>
        <button class="btn-secondary" data-export="no_show">No Show CSV</button>
        <button class="btn-secondary" id="exportAuditBtn" type="button">Audit Log CSV</button>
      </div>
      <div id="backupStatus">${appState.ui.lastBackupMessage ? `<p class="notice success">${escapeHtml(appState.ui.lastBackupMessage)}</p>` : ""}</div>
    </section>

    <section class="card">
      <h2>Admin-Aktionen</h2>
      <div class="actions">
        <button class="btn-warning" id="markOpenNoShowBtn">Alle offenen Gäste auf No Show setzen</button>
        <button class="btn-secondary" id="resetPinsToggle">Check-in-PIN neu setzen</button>
      </div>
      <div id="pinResetPanel" class="admin-section hidden">
        <p class="notice info">Der Admin-PIN ist global und wird hier nicht pro Event geändert.</p>
        <form id="pinResetForm" class="grid">
          <div class="form-row">
            <label for="newCheckinPin">Neuer Check-in-PIN</label>
            <input id="newCheckinPin" type="password" minlength="${PIN_MIN_LENGTH}" placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
          </div>
          <div class="actions"><button class="btn-primary" type="submit">Check-in-PIN speichern</button></div>
        </form>
      </div>
    </section>
  `;

  bindKnownLinkCopyButtons();
  bindKnownEventButtons();
  document.getElementById("eventNameForm")?.addEventListener("submit", updateEventNameFromForm);
  document.getElementById("previewImportBtn")?.addEventListener("click", previewCsvImport);
  document.getElementById("runImportBtn")?.addEventListener("click", runCsvImport);
  document.querySelectorAll("[data-export]").forEach((btn) => btn.addEventListener("click", () => exportGuests(btn.dataset.export)));
  document.getElementById("exportAuditBtn")?.addEventListener("click", exportAuditLog);
  document.getElementById("markOpenNoShowBtn")?.addEventListener("click", markOpenGuestsNoShow);
  document.getElementById("resetPinsToggle")?.addEventListener("click", () => document.getElementById("pinResetPanel").classList.toggle("hidden"));
  document.getElementById("pinResetForm")?.addEventListener("submit", resetPinsFromForm);
}

async function updateEventNameFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Eventname speichern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen den Eventnamen ändern.", "warning");
    return;
  }

  const name = val("eventNameInput").trim();
  if (!name) {
    notify("Eventname darf nicht leer sein.", "warning");
    return;
  }

  const oldName = appState.event?.name || "";
  if (name === oldName) {
    notify("Eventname ist unverändert.", "info");
    return;
  }

  try {
    await updateDoc(eventRef(), {
      name,
      updatedAt: serverTimestamp()
    });
    appState.event = { ...appState.event, name };
    els.eventTitle.textContent = name;
    setEventMeta();
    saveKnownEvent(appState.event);
    await addAudit("event_update", { name }, { field: "name", oldName, newName: name });
    renderAdmin();
    notify("Eventname gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Eventname konnte nicht gespeichert werden: ${error.message || error}`, "error");
  }
}

async function addGuestFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Gast hinzufügen")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen Gäste hinzufügen.", "warning");
    return;
  }
  const guest = buildGuestRecord({
    name: val("addName"),
    category: val("addCategory"),
    supportComment: val("addSupportComment"),
    internalNote: val("addInternalNote"),
    guestId: nextAvailableGuestCode()
  });

  try {
    const ref = await addDoc(collection(appState.db, "events", appState.eventId, "guests"), guest);
    await addAudit("guest_create", { id: ref.id, ...guest }, { source: "manual" });
    document.getElementById("addGuestForm").reset();
    notify("Gast hinzugefügt.", "success");
  } catch (error) {
    console.error(error);
    notify(`Gast konnte nicht gespeichert werden: ${error.message || error}`, "error");
  }
}

async function previewCsvImport() {
  const fileInput = document.getElementById("csvFile");
  const result = document.getElementById("importResult");
  const file = fileInput.files?.[0];
  if (!file) {
    result.innerHTML = `<p class="notice warning">Bitte CSV-Datei auswählen.</p>`;
    return;
  }

  try {
    const text = await readCsvFileText(file);
    const rows = parseCsv(text);
    const defaultCategory = val("defaultImportCategory");
    const mapped = rows.map((row, idx) => mapCsvRowToGuest(row, idx, defaultCategory));
    const previewRows = mapped.filter((guest) => guest.name);
    const replace = document.getElementById("replaceGuests").checked;
    const validation = validateImportRows(mapped, replace);
    appState.ui.importRows = mapped;
    appState.ui.importPreview = previewRows.slice(0, 8);

    document.getElementById("runImportBtn").disabled = previewRows.length === 0 || validation.errors.length > 0;
    result.innerHTML = `
      <div class="notice ${previewRows.length && !validation.errors.length ? "success" : "warning"}">${previewRows.length} gültige Gäste gefunden.</div>
      ${validation.errors.length ? `<div class="notice error"><strong>Import blockiert:</strong><ul>${validation.errors.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("")}</ul></div>` : ""}
      ${validation.warnings.length ? `<div class="notice warning"><strong>Hinweise:</strong><ul>${validation.warnings.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("")}</ul></div>` : ""}
      ${previewRows.length ? renderGuestTable(previewRows.slice(0, 8).map((g, i) => ({ id: `preview-${i}`, ...g }))) : ""}
    `;
  } catch (error) {
    console.error(error);
    result.innerHTML = `<p class="notice error">CSV konnte nicht gelesen werden: ${escapeHtml(error.message || String(error))}</p>`;
  }
}

async function runCsvImport() {
  const result = document.getElementById("importResult");
  const rows = appState.ui.importRows;
  const replace = document.getElementById("replaceGuests").checked;
  const runButton = document.getElementById("runImportBtn");
  if (!requireOnline("CSV importieren")) return;
  if (appState.ui.importInProgress) {
    result.innerHTML = `<p class="notice warning">Import läuft bereits.</p>`;
    return;
  }
  if (!rows.length) return;

  const validation = validateImportRows(rows, replace);
  if (validation.errors.length) {
    result.innerHTML = `<div class="notice error"><strong>Import blockiert:</strong><ul>${validation.errors.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("")}</ul></div>`;
    return;
  }

  if (replace && !confirmByTypingEventId(`Du löschst ${appState.guests.length} bestehende Gäste im Event "${appState.event?.name || appState.eventId}" und importierst ${rows.length} Gäste neu.`)) return;
  if (!replace && !confirm(`${rows.length} Gäste zusätzlich importieren?`)) return;

  appState.ui.importInProgress = true;
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = "Import läuft…";
  }
  result.innerHTML = `
    <p class="notice info">Import läuft…</p>
    <div class="progress"><div id="importProgress"></div></div>
  `;

  try {
    let completed = 0;
    if (replace) {
      await deleteGuestsInChunks(appState.guests, (done) => {
        completed = done;
        setProgress("importProgress", Math.min(35, Math.round((done / Math.max(appState.guests.length, 1)) * 35)));
      });
    }

    await writeGuestsInChunks(rows, (done) => {
      const pct = replace ? 35 + Math.round((done / rows.length) * 65) : Math.round((done / rows.length) * 100);
      setProgress("importProgress", pct);
    });

    await addAudit("guest_import", { name: "CSV Import" }, { count: rows.length, replace });
    result.innerHTML = `<p class="notice success">Import abgeschlossen: ${rows.length} Gäste.</p>`;
    appState.ui.importRows = [];
    if (runButton) runButton.disabled = true;
    notify(`Import abgeschlossen: ${rows.length} Gäste.`, "success");
  } catch (error) {
    console.error(error);
    result.innerHTML = `<p class="notice error">Import fehlgeschlagen: ${escapeHtml(error.message || String(error))}</p>`;
  } finally {
    appState.ui.importInProgress = false;
    if (runButton) runButton.textContent = "Import starten";
  }
}

async function writeGuestsInChunks(rows, onProgress) {
  const chunkSize = 450;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = writeBatch(appState.db);
    rows.slice(i, i + chunkSize).forEach((guest) => {
      const ref = doc(collection(appState.db, "events", appState.eventId, "guests"));
      batch.set(ref, buildGuestRecord(guest));
    });
    await batch.commit();
    done += Math.min(chunkSize, rows.length - i);
    onProgress?.(done);
  }
}

async function deleteGuestsInChunks(guests, onProgress) {
  const chunkSize = 450;
  let done = 0;
  for (let i = 0; i < guests.length; i += chunkSize) {
    const batch = writeBatch(appState.db);
    guests.slice(i, i + chunkSize).forEach((guest) => batch.delete(guestRef(guest.id)));
    await batch.commit();
    done += Math.min(chunkSize, guests.length - i);
    onProgress?.(done);
  }
}

function exportGuests(filter) {
  let rows = appState.guests;
  if (filter !== "all") rows = rows.filter((g) => (g.status || "open") === filter);

  const csvRows = rows.map((g) => ({
    "Guest ID": g.guestId || "",
    "Name": g.name || "",
    "Kategorie": g.category || "",
    "Status": STATUS_META[g.status || "open"]?.label || g.status || "Offen",
    "Check-in Zeit": formatTimestamp(g.checkedInAt),
    "Check-in durch": g.checkedInByName || "",
    "Check-in Gerät": g.checkedInDevice || "",
    "Support Kommentar": g.supportComment || "",
    "Interne Notiz": g.internalNote || ""
  }));

  const fileName = `${eventFileStem()}-${filter}-${todayStamp()}.csv`;
  downloadCsv(fileName, toCsv(csvRows, ";", GUEST_EXPORT_HEADERS));
  void addAudit("guest_export", { name: "CSV Export" }, { filter, count: csvRows.length });
  const message = `Backup erstellt: ${fileName} · ${csvRows.length} Gäste · ${formatTimestamp(new Date())}`;
  showBackupStatus(message, "success");
  notify(message, "success");
}

async function exportAuditLog() {
  if (!requireOnline("Audit Log exportieren")) return;
  if (!isAdmin()) return;

  try {
    const q = query(collection(appState.db, "events", appState.eventId, "auditLog"), orderBy("createdAt", "desc"), limit(5000));
    const snapshot = await getDocs(q);
    const entries = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    const csvRows = entries.map((entry) => ({
      "Zeit": formatTimestamp(entry.createdAt),
      "Aktion": labelForAction(entry.action),
      "Guest ID": entry.guestId || "",
      "Gast": entry.guestName || "",
      "Kategorie": entry.category || "",
      "Mitarbeiter": entry.actorName || "",
      "Gerät": entry.deviceLabel || "",
      "Details": entry.details ? JSON.stringify(entry.details) : ""
    }));
    const fileName = `${eventFileStem()}-audit-log-${todayStamp()}.csv`;
    downloadCsv(fileName, toCsv(csvRows, ";", AUDIT_EXPORT_HEADERS));
    await addAudit("audit_export", { name: "Audit Log Export" }, { count: csvRows.length, limit: 5000 });
    const message = `Audit-Log exportiert: ${fileName} · ${csvRows.length} Einträge · ${formatTimestamp(new Date())}`;
    showBackupStatus(message, "success");
    notify(message, "success");
  } catch (error) {
    console.error(error);
    notify(`Audit-Log konnte nicht exportiert werden: ${error.message || error}`, "error");
  }
}

function confirmByTypingEventId(actionText) {
  const expected = appState.eventId || "";
  const entered = window.prompt(`${actionText}\n\nDas ist eine irreversible Massenaktion im aktuellen Event.\nZur Bestätigung exakt die Event-ID eingeben:\n${expected}`);
  if (entered === null) return false;
  if (entered.trim() !== expected) {
    notify("Abgebrochen: Event-ID stimmte nicht. Es wurde nichts geändert.", "warning");
    return false;
  }
  return true;
}

async function markOpenGuestsNoShow() {
  if (!requireOnline("No Show setzen")) return;
  if (!isAdmin()) return;
  const openGuests = appState.guests.filter((g) => (g.status || "open") === "open");
  if (!openGuests.length) {
    notify("Keine offenen Gäste gefunden.", "info");
    return;
  }
  if (!confirmByTypingEventId(`Du setzt ${openGuests.length} offene Gäste im Event "${appState.event?.name || appState.eventId}" auf No Show.`)) return;

  try {
    const chunkSize = 450;
    for (let i = 0; i < openGuests.length; i += chunkSize) {
      const batch = writeBatch(appState.db);
      openGuests.slice(i, i + chunkSize).forEach((guest) => {
        batch.update(guestRef(guest.id), {
          status: "no_show",
          updatedAt: serverTimestamp(),
          lastActionAt: serverTimestamp(),
          lastActionByName: appState.member.displayName || "Admin"
        });
      });
      await batch.commit();
    }
    await addAudit("bulk_no_show", { name: "Bulk No Show" }, { count: openGuests.length });
    notify(`${openGuests.length} Gäste auf No Show gesetzt.`, "success");
  } catch (error) {
    console.error(error);
    notify(`Bulk-Aktion fehlgeschlagen: ${error.message || error}`, "error");
  }
}

async function resetPinsFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Check-in-PIN neu setzen")) return;
  const checkinPin = val("newCheckinPin");
  if (checkinPin.length < PIN_MIN_LENGTH) {
    notify(`Check-in-PIN muss mindestens ${PIN_MIN_LENGTH} Zeichen haben.`, "warning");
    return;
  }

  try {
    const securityRef = doc(appState.db, "events", appState.eventId, "private", "security");
    const securitySnap = await getDoc(securityRef);
    if (!securitySnap.exists()) throw new Error("Security-Dokument fehlt.");
    const adminPinHash = securitySnap.data().adminPinHash;
    const checkinPinHash = await hashPin(appState.eventId, "checkin", checkinPin);
    await updateDoc(securityRef, {
      adminPinHash,
      checkinPinHash,
      updatedAt: serverTimestamp()
    });
    await addAudit("pins_reset", { name: "Check-in-PIN" }, { scope: "checkin_only" });
    document.getElementById("pinResetForm").reset();
    notify("Check-in-PIN wurde für dieses Event neu gesetzt.", "success");
  } catch (error) {
    console.error(error);
    notify(`Check-in-PIN konnte nicht gesetzt werden: ${error.message || error}`, "error");
  }
}

function renderAuditLog() {
  if (!isAdmin()) {
    tabContent().innerHTML = `<section class="card"><h2>Kein Zugriff</h2><p>Admin-Rechte erforderlich.</p></section>`;
    return;
  }
  const content = tabContent();
  content.innerHTML = `
    <section class="card">
      <h2>Audit Log</h2>
      <p class="small">Zeigt die letzten 100 Einträge. Der CSV-Export lädt bis zu 5000 Einträge für dieses Event.</p>
      <div class="actions">
        <button class="btn-secondary" id="exportAuditLogTabBtn" type="button">Audit Log CSV exportieren</button>
      </div>
      <div id="auditList"><p class="small">Lädt…</p></div>
    </section>
  `;
  document.getElementById("exportAuditLogTabBtn")?.addEventListener("click", exportAuditLog);

  if (appState.auditUnsubscribe) appState.auditUnsubscribe();
  const q = query(collection(appState.db, "events", appState.eventId, "auditLog"), orderBy("createdAt", "desc"), limit(100));
  appState.auditUnsubscribe = onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    appState.auditEntries = entries;
    const list = document.getElementById("auditList");
    if (!list) return;
    list.innerHTML = entries.length ? entries.map(renderAuditLine).join("") : `<p class="small">Noch keine Log-Einträge.</p>`;
  }, (error) => {
    console.error(error);
    const list = document.getElementById("auditList");
    if (list) list.innerHTML = `<p class="notice error">Audit Log konnte nicht geladen werden.</p>`;
  });
}

function renderAuditLine(entry) {
  return `
    <div class="log-line">
      <strong>${escapeHtml(labelForAction(entry.action))}</strong>
      <div class="small">${formatTimestamp(entry.createdAt)} · ${escapeHtml(entry.actorName || "")} · ${escapeHtml(entry.deviceLabel || "")}</div>
      <div>${escapeHtml(entry.guestName || "")}</div>
      ${entry.details ? `<div class="small">${escapeHtml(JSON.stringify(entry.details))}</div>` : ""}
    </div>
  `;
}

function labelForAction(action) {
  const labels = {
    check_in: "Check-in",
    support_comment_update: "Kommentar geändert",
    status_update: "Status geändert",
    guest_create: "Gast erstellt",
    guest_update: "Gast geändert",
    guest_delete: "Gast gelöscht",
    event_update: "Event geändert",
    guest_import: "CSV Import",
    guest_export: "CSV Export",
    audit_export: "Audit Log Export",
    duplicate_check_in_attempt: "Doppel-Check-in verhindert",
    bulk_no_show: "Bulk No Show",
    pins_reset: "Check-in-PIN neu gesetzt"
  };
  return labels[action] || action || "Aktion";
}

async function addAudit(action, guest, details = {}) {
  try {
    await addDoc(collection(appState.db, "events", appState.eventId, "auditLog"), {
      action,
      guestDocId: guest.id || "",
      guestId: guest.guestId || "",
      guestName: guest.name || "",
      category: guest.category || "",
      details,
      actorUid: appState.user.uid,
      actorName: appState.member?.displayName || "",
      deviceLabel: appState.member?.deviceLabel || "",
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Audit log write failed", error);
  }
}

function calculateStats() {
  const total = appState.guests.length;
  const checkedIn = appState.guests.filter((g) => g.status === "checked_in").length;
  const noShow = appState.guests.filter((g) => g.status === "no_show").length;
  const open = appState.guests.filter((g) => (g.status || "open") === "open").length;
  return { total, checkedIn, open, noShow };
}

function filterGuests(search, category, status) {
  const normalizedSearch = normalizeForSearch(search || "");
  return appState.guests.filter((guest) => {
    const text = `${guest.name || ""} ${guest.guestId || ""} ${guest.category || ""} ${guest.supportComment || ""}`;
    const searchMatches = !normalizedSearch || normalizeForSearch(text).includes(normalizedSearch);
    const categoryMatches = !category || category === "all" || (guest.category || "") === category;
    const statusMatches = !status || status === "all" || (guest.status || "open") === status;
    return searchMatches && categoryMatches && statusMatches;
  });
}

function getCategories() {
  const fromEvent = Array.isArray(appState.event?.categories) ? appState.event.categories : [];
  const fromGuests = Array.from(new Set(appState.guests.map((g) => g.category).filter(Boolean)));
  return Array.from(new Set([...fromEvent, ...DEFAULT_CATEGORIES, ...fromGuests]));
}

function buildGuestRecord(input) {
  const name = String(input.name || "").trim();
  const category = normalizeCategory(input.category || getCategories()[0] || "GA");
  const guestId = String(input.guestId || nextGuestCode(appState.guests.length + 1)).trim();
  return {
    guestId,
    name,
    searchName: normalizeForSearch(`${name} ${guestId} ${category}`),
    category,
    status: input.status && DEFAULT_STATUSES.includes(input.status) ? input.status : "open",
    supportComment: String(input.supportComment || "").trim(),
    internalNote: String(input.internalNote || "").trim(),
    checkedInAt: input.checkedInAt || null,
    checkedInByUid: input.checkedInByUid || null,
    checkedInByName: input.checkedInByName || null,
    checkedInDevice: input.checkedInDevice || null,
    createdAt: input.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: appState.user?.uid || null,
    createdByName: appState.member?.displayName || "Import"
  };
}

function mapCsvRowToGuest(row, index, defaultCategory) {
  const name = pick(row, ["Name", "Gast", "Guest", "Guest Name", "Gäste Name", "Vollständiger Name", "Full Name"])
    || [pick(row, ["Vorname", "First Name", "Firstname"]), pick(row, ["Nachname", "Last Name", "Lastname"])].filter(Boolean).join(" ");
  const category = pick(row, ["Kategorie", "Category", "Ticket", "Ticket Type", "Tickettyp", "Typ", "Type"])
    || defaultCategory;
  const guestId = pick(row, ["Guest ID", "GuestID", "ID", "Code", "Nummer", "Nr"])
    || nextGuestCode(appState.guests.length + index + 1);
  const supportComment = pick(row, ["Support Kommentar", "Support Comment", "Kommentar", "Comment", "Bemerkung"]);
  const internalNote = pick(row, ["Notiz", "Note", "Internal Note", "Interne Notiz"]);
  const statusRaw = pick(row, ["Status", "Check-in Status"]);
  const status = parseStatus(statusRaw);

  return buildGuestRecord({ name, category, guestId, supportComment, internalNote, status });
}

function normalizeCategory(input) {
  const value = String(input || "").trim();
  const categories = getCategories();
  const found = categories.find((cat) => normalizeForSearch(cat) === normalizeForSearch(value));
  return found || value || categories[0] || "GA";
}

function parseStatus(value) {
  const normalized = normalizeForSearch(value || "");
  if (["eingecheckt", "checkedin", "checked in", "checked", "checkin"].includes(normalized)) return "checked_in";
  if (["noshow", "no show", "abwesend"].includes(normalized)) return "no_show";
  return "open";
}

function parseCsv(text) {
  const source = String(text || "").replace(/^\ufeff/, "");
  const delimiter = detectCsvDelimiter(source);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map(normKey);
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (cells[index] || "").trim();
    });
    return obj;
  });
}

async function readCsvFileText(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function detectCsvDelimiter(text) {
  const candidates = [",", ";", "\t"];
  const scores = Object.fromEntries(candidates.map((delimiter) => [delimiter, 0]));
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim()).slice(0, 5);

  for (const line of lines) {
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && candidates.includes(char)) {
        scores[char] += 1;
      }
    }
  }

  return candidates.sort((a, b) => scores[b] - scores[a])[0] || ",";
}

function validateImportRows(rows, replaceExisting) {
  const errors = [];
  const warnings = [];
  const ids = new Map();
  const existingIds = new Set(appState.guests.map((guest) => normalizeGuestId(guest.guestId)).filter(Boolean));

  rows.forEach((guest, index) => {
    const rowNumber = index + 2;
    const guestId = normalizeGuestId(guest.guestId);
    if (!guest.name) errors.push(`Zeile ${rowNumber}: Name fehlt.`);
    if (!guestId) errors.push(`Zeile ${rowNumber}: Guest ID fehlt.`);
    if (!guest.category) warnings.push(`Zeile ${rowNumber}: Kategorie fehlt, Fallback wurde verwendet.`);

    if (guestId) {
      const firstRow = ids.get(guestId);
      if (firstRow) {
        errors.push(`Guest ID "${guest.guestId}" ist doppelt in der CSV (Zeilen ${firstRow} und ${rowNumber}).`);
      } else {
        ids.set(guestId, rowNumber);
      }
      if (!replaceExisting && existingIds.has(guestId)) {
        errors.push(`Guest ID "${guest.guestId}" existiert bereits. Für einen vollständigen Neuimport "Vorhandene Gäste vor Import löschen" aktivieren.`);
      }
    }
  });

  if (rows.length > 450) {
    warnings.push(`Großer Import mit ${rows.length} Gästen: wird automatisch in Firestore-Batches geschrieben.`);
  }

  return { errors, warnings };
}

function normalizeGuestId(value) {
  return String(value || "").trim().toLowerCase();
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const value = row[normKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function toCsv(rows, delimiter = ",", explicitHeaders = null) {
  const headers = explicitHeaders || Object.keys(rows[0] || {});
  if (!headers.length) return "";
  const lines = [headers.join(delimiter)];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h], delimiter)).join(delimiter));
  }
  return lines.join("\r\n");
}

function csvEscape(value, delimiter = ",") {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(delimiter) || /[\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, csv) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tabContent() {
  return document.getElementById("tabContent");
}

function render(html) {
  els.main.innerHTML = html;
}

function renderError(title, message) {
  render(`
    <section class="card">
      <h2>${escapeHtml(title)}</h2>
      <p class="notice error">${escapeHtml(message)}</p>
    </section>
  `);
}

function notify(message, type = "info") {
  const flash = document.getElementById("flash");
  if (!flash) {
    console.log(message);
    return;
  }
  const escapedMessage = escapeHtml(message);
  if (type === "error") {
    flash.innerHTML = `
      <div class="notice ${type} flash-message">
        <span>${escapedMessage}</span>
        <button class="flash-close" type="button" aria-label="Meldung schließen">Schließen</button>
      </div>
    `;
    flash.querySelector(".flash-close")?.addEventListener("click", () => {
      flash.innerHTML = "";
    });
    return;
  }
  flash.innerHTML = `<div class="notice ${type}">${escapedMessage}</div>`;
  setTimeout(() => {
    if (flash.innerHTML.includes(escapedMessage)) flash.innerHTML = "";
  }, 4500);
}

function showBackupStatus(message, type = "info") {
  appState.ui.lastBackupMessage = message;
  const target = document.getElementById("backupStatus");
  if (target) target.innerHTML = `<p class="notice ${type}">${escapeHtml(message)}</p>`;
}

function setConnectionStatus(text, mode = "ok") {
  els.connectionStatus.textContent = text;
  els.connectionStatus.className = `status-pill ${mode}`;
}

function eventRef() {
  return doc(appState.db, "events", appState.eventId);
}

function memberRef(uid) {
  return doc(appState.db, "events", appState.eventId, "members", uid);
}

function guestRef(id) {
  return doc(appState.db, "events", appState.eventId, "guests", id);
}

function findGuest(id) {
  return appState.guests.find((g) => g.id === id);
}

function isAdmin() {
  return appState.member?.role === "admin";
}

function val(id) {
  return document.getElementById(id)?.value || "";
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJsUrl(value) {
  return String(value).replace(/'/g, "%27");
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normKey(value) {
  return normalizeForSearch(value).replace(/[^a-z0-9]/g, "");
}

async function hashPin(eventId, role, pin) {
  const input = `${eventId}:${role}:${pin}`;
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildEventId(name, date) {
  const words = normalizeForSearch(name).split(/\s+/).filter(Boolean).slice(0, 2);
  const namePart = (words.length ? words : ["event"]).join("-");
  const datePart = shortDateForEventId(date);
  return [namePart, datePart].filter(Boolean).join("-");
}

function shortDateForEventId(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[1].slice(2)}${match[2]}${match[3]}`;
}

function nextGuestCode(num) {
  return `G-${String(num).padStart(4, "0")}`;
}

function nextAvailableGuestCode(start = appState.guests.length + 1) {
  const existing = new Set(appState.guests.map((guest) => normalizeGuestId(guest.guestId)).filter(Boolean));
  let number = Math.max(1, start);
  while (existing.has(normalizeGuestId(nextGuestCode(number)))) {
    number += 1;
  }
  return nextGuestCode(number);
}

function isOffline() {
  return navigator.onLine === false;
}

function requireOnline(action) {
  if (!isOffline()) return true;
  notify(`${action} nicht möglich: Gerät ist offline.`, "error");
  return false;
}

function setEventMeta() {
  const parts = [
    appState.event?.date ? `Datum: ${formatEventDate(appState.event.date)}` : "",
    appState.eventId ? `ID: ${appState.eventId}` : ""
  ];
  setHeaderMeta(parts);
}

function setHeaderMeta(parts) {
  const meta = ensureEventMeta();
  if (!meta) return;
  const text = parts.filter(Boolean).join(" · ");
  meta.textContent = text;
  meta.hidden = !text;
}

function getKnownEvents() {
  const byId = new Map();
  [...CONFIGURED_EVENTS, ...getStoredKnownEvents()].forEach((event) => {
    const normalized = normalizeKnownEvent(event);
    if (!normalized) return;
    const existing = byId.get(normalized.id);
    byId.set(normalized.id, {
      ...(existing || {}),
      ...normalized
    });
  });
  return [...byId.values()].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare) return dateCompare;
    return String(a.name || a.id).localeCompare(String(b.name || b.id), "de");
  });
}

function getStoredKnownEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KNOWN_EVENTS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveKnownEvent(event) {
  const normalized = normalizeKnownEvent(event);
  if (!normalized) return;

  const events = getStoredKnownEvents().filter((item) => normalizeKnownEvent(item)?.id !== normalized.id);
  events.unshift(normalized);
  localStorage.setItem(KNOWN_EVENTS_STORAGE_KEY, JSON.stringify(events.slice(0, 12)));
}

function normalizeKnownEvent(event) {
  const id = resolveEventId(String(event?.id || "").trim());
  if (!id) return null;
  return {
    id,
    name: String(event?.name || id).trim(),
    date: String(event?.date || "").trim()
  };
}

function resolveEventId(id) {
  const raw = String(id || "").trim();
  return EVENT_ALIASES[raw] || raw;
}

function renderKnownEventList(currentEventId = "") {
  const events = getKnownEvents();
  if (!events.length) return `<p class="notice warning">Noch keine bekannten Events in dieser Installation.</p>`;

  return `
    <div class="event-switch-list">
      ${events.map((event) => {
        const isCurrent = event.id === currentEventId;
        const link = urlWithEvent(event.id);
        return `
          <div class="event-switch-card ${isCurrent ? "current" : ""}">
            <span>
              <strong>${escapeHtml(event.name || event.id)}</strong>
              <small>${event.date ? escapeHtml(formatEventDate(event.date)) : "ohne Datum"} · ${escapeHtml(event.id)}</small>
            </span>
            <span class="event-switch-actions">
              <button class="btn-secondary" type="button" data-copy-known-link="${escapeHtml(link)}">Link kopieren</button>
              <button class="${isCurrent ? "btn-secondary" : "btn-primary"}" type="button" data-open-event="${escapeHtml(event.id)}">${isCurrent ? "Aktuell" : "Öffnen"}</button>
            </span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderKnownEventLinks() {
  const events = getKnownEvents();
  if (!events.length) return `<p class="notice warning">Noch keine bekannten Events in dieser Installation.</p>`;

  return `
    <div class="grid">
      ${events.map((event) => {
        const link = urlWithEvent(event.id);
        return `
          <div class="form-row">
            <label>${escapeHtml(event.name || event.id)}${event.date ? ` · ${escapeHtml(formatEventDate(event.date))}` : ""}</label>
            <div class="copy-field">
              <input value="${escapeHtml(link)}" readonly />
              <button class="btn-secondary" type="button" data-copy-known-link="${escapeHtml(link)}">Kopieren</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function bindKnownLinkCopyButtons() {
  document.querySelectorAll("[data-copy-known-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const link = button.getAttribute("data-copy-known-link") || "";
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        notify("Door-Lead-Link kopiert.", "success");
      } catch {
        notify("Link konnte nicht automatisch kopiert werden. Bitte Feld markieren und kopieren.", "warning");
      }
    });
  });
}

function bindKnownEventButtons() {
  document.querySelectorAll("[data-open-event]").forEach((button) => {
    button.addEventListener("click", async () => {
      const eventId = button.getAttribute("data-open-event");
      if (!eventId) return;
      if (eventId === appState.eventId) {
        notify("Dieses Event ist bereits geöffnet.", "info");
        return;
      }
      if (isAdmin()) {
        button.disabled = true;
        button.dataset.originalText = button.textContent || "";
        const session = getAdminSession();
        if (session?.pin) {
          try {
            await connectAdminToEvent(eventId, session.pin, session.displayName || appState.member?.displayName || "Admin");
            window.location.href = urlWithEvent(eventId);
            return;
          } catch (error) {
            console.error(error);
            clearAdminSession();
            notify("Automatischer Admin-Wechsel fehlgeschlagen. Bitte beim Ziel-Event erneut einloggen.", "warning");
          }
        }
        button.disabled = false;
      }
      window.location.href = urlWithEvent(eventId);
    });
  });
}

async function connectAdminToEvent(eventId, pin, displayName) {
  const pinHash = await hashPin(eventId, "admin", pin);
  await setDoc(doc(appState.db, "events", eventId, "members", appState.user.uid), {
    uid: appState.user.uid,
    role: "admin",
    pinHash,
    displayName: displayName || "Admin",
    deviceLabel: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function ensureEventMeta() {
  if (els.eventMeta) return els.eventMeta;
  if (!els.eventTitle) return null;
  const meta = document.createElement("div");
  meta.id = "eventMeta";
  meta.className = "event-meta";
  meta.hidden = true;
  els.eventTitle.insertAdjacentElement("afterend", meta);
  els.eventMeta = meta;
  return meta;
}

function formatEventDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function urlWithoutParams() {
  return `${window.location.origin}${window.location.pathname}`;
}

function urlWithEvent(id) {
  return `${urlWithoutParams()}?event=${encodeURIComponent(id)}`;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatTimestamp(value) {
  if (!value) return "";
  const millis = timestampMillis(value);
  if (!millis) return "";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(millis));
}

function todayStamp() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("");
}

function safeFileName(value) {
  return normalizeForSearch(value).replace(/\s+/g, "-") || "gaesteliste";
}

function eventFileStem() {
  const parts = [
    safeFileName(appState.event?.name || "gaesteliste"),
    appState.event?.date ? safeFileName(appState.event.date) : "",
    appState.eventId ? safeFileName(appState.eventId) : ""
  ].filter(Boolean);
  return parts.join("-");
}

function setProgress(id, pct) {
  const bar = document.getElementById(id);
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function unsubscribeAll() {
  if (appState.guestUnsubscribe) {
    appState.guestUnsubscribe();
    appState.guestUnsubscribe = null;
  }
  if (appState.auditUnsubscribe) {
    appState.auditUnsubscribe();
    appState.auditUnsubscribe = null;
  }
}
