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
  deleteField,
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

const INFO_LABELS = {
  adminOnly: "Info nur für Administratoren",
  adminToStaff: "Info von Administratoren an Check-in Staff",
  staffToAll: "Info von Check-in Staff für alle"
};

const GUEST_EXPORT_HEADERS = [
  "Guest ID",
  "Name",
  "Kategorie",
  "Status",
  "Check-in Zeit",
  "Check-in durch",
  "Check-in Gerät",
  INFO_LABELS.staffToAll,
  INFO_LABELS.adminToStaff,
  INFO_LABELS.adminOnly
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
  adminNotes: {},
  adminNotesLoaded: false,
  auditEntries: [],
  guestUnsubscribe: null,
  adminNotesUnsubscribe: null,
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

  if (setupParam === "1") {
    renderWelcome();
    return;
  }

  if (!eventParam) {
    appState.eventId = "";
    appState.event = null;
    renderJoin();
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
  render(renderEventSetupSections());
  bindEventSetupHandlers();
}

function renderEventSetupSections(options = {}) {
  const knownEvents = getKnownEvents();
  const omitAdminPin = Boolean(options.omitAdminPin);
  return `
    ${knownEvents.length ? `
      <section class="card">
        <h2>Bestehende Events</h2>
        ${renderKnownEventList(appState.eventId)}
      </section>
    ` : ""}
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
        </div>
        ${omitAdminPin ? "" : `
          <div class="form-row">
            <label for="adminPin">Globaler Admin-PIN</label>
            <input id="adminPin" type="password" minlength="${PIN_MIN_LENGTH}" required placeholder="für Event-Erstellung und Admin-Zugriff" />
          </div>
        `}
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
  `;
}

function bindEventSetupHandlers() {
  bindKnownLinkCopyButtons();
  bindKnownEventButtons();

  document.getElementById("createEventForm")?.addEventListener("submit", createEventFromForm);
}

function renderEventSetup() {
  tabContent().innerHTML = renderEventSetupSections({ omitAdminPin: isAdmin() && Boolean(getAdminSession()?.pin) });
  bindEventSetupHandlers();
}

async function createEventFromForm(event) {
  event.preventDefault();
  const result = document.getElementById("setupResult");
  result.innerHTML = `<p class="notice info">Event wird erstellt…</p>`;

  const name = val("newEventName").trim();
  const date = val("newEventDate").trim();
  const adminPin = val("adminPin") || (isAdmin() ? getAdminSession()?.pin || "" : "");
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

    result.innerHTML = `<p class="notice info">Admin-Zugriff wird geprüft…</p>`;
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
  const eventName = appState.event?.name || "Gästeliste Check-in";
  els.eventTitle.textContent = eventName;
  setEventMeta();
  render(renderRolePinSections());
  bindRolePinHandlers();
}

function renderRolePinTab() {
  const content = tabContent();
  content.innerHTML = renderRolePinSections();
  bindRolePinHandlers();
}

function renderRolePinSections() {
  const currentRole = appState.member?.role || "checkin";
  const displayName = appState.member?.displayName || localStorage.getItem("guestlist:memberName") || "";
  const deviceLabel = appState.member?.deviceLabel || "";
  const accessNotice = appState.member?.role === "checkin" && !isActiveCheckinStaff()
    ? `<p class="notice warning">${escapeHtml(checkinStaffAccessMessage())}</p>`
    : "";
  const eventContext = appState.eventId
    ? `<p class="small">Event-ID: <code>${escapeHtml(appState.eventId)}</code></p>`
    : `<p class="small">Check-in Staff wird automatisch mit dem Event verbunden, dessen PIN zum heutigen Event passt. Bis 02:00 Uhr wird zusätzlich das Event vom Vortag geprüft.</p>`;

  return `
    <section class="card">
      <h2>Anmelden</h2>
      ${eventContext}
      ${accessNotice}
      <form id="joinForm" class="grid two">
        <div class="form-row">
          <label for="memberRole">Rolle</label>
          <select id="memberRole">
            <option value="checkin" ${currentRole === "checkin" ? "selected" : ""}>Check-in Staff</option>
            <option value="admin" ${currentRole === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </div>
        <div class="form-row">
          <label for="memberPin">PIN</label>
          <input id="memberPin" type="password" minlength="${PIN_MIN_LENGTH}" required autocomplete="off" placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
          <p class="field-help">Admin: globaler Admin-PIN. Check-in Staff: Event-spezifischer Check-in-PIN.</p>
        </div>
        <div class="form-row">
          <label for="memberName">Name Mitarbeiter:in</label>
          <input id="memberName" value="${escapeHtml(displayName)}" required placeholder="z.B. Eingang 1 / Max" />
        </div>
        <div class="form-row">
          <label for="deviceLabel">Gerät <span class="optional-label">optional</span></label>
          <input id="deviceLabel" value="${escapeHtml(deviceLabel)}" placeholder="z.B. iPad Eingang links" />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" id="joinSubmitBtn" type="submit" disabled>Anmelden</button>
          <button class="btn-secondary" id="logoutBtn" type="button" ${hasLinkedRole() ? "" : "disabled"}>Abmelden</button>
        </div>
      </form>
      <div id="joinResult"></div>
    </section>
  `;
}

function renderAdminSettings() {
  if (!isAdmin()) {
    tabContent().innerHTML = `<section class="card"><h2>Kein Zugriff</h2><p>Admin-Rechte erforderlich.</p></section>`;
    return;
  }
  tabContent().innerHTML = renderAdminPinSection();
  bindAdminPinForm();
}

function renderAdminPinSection() {
  return `
    <section class="card">
      <h2>Admin-PIN ändern</h2>
      <form id="adminPinForm" class="grid">
        <div class="form-row">
          <label for="currentAdminPin">Aktueller Admin-PIN</label>
          <input id="currentAdminPin" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="current-password" placeholder="bisheriger Admin-PIN" />
        </div>
        <div class="form-row">
          <label for="newAdminPin">Neuer Admin-PIN</label>
          <input id="newAdminPin" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
        </div>
        <div class="form-row">
          <label for="newAdminPinConfirm">Neuer Admin-PIN wiederholen</label>
          <input id="newAdminPinConfirm" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="zur Kontrolle wiederholen" />
        </div>
        <div class="actions">
          <button class="btn-primary" id="adminPinSaveBtn" type="submit" disabled>Admin-PIN speichern</button>
        </div>
      </form>
      <div id="adminPinResult"></div>
    </section>
  `;
}

function renderCheckinPinSection() {
  return `
    <section class="card">
      <h2>Check-in-PIN aktueller Event</h2>
      <p class="small">Gilt nur für <strong>${escapeHtml(appState.event?.name || appState.eventId || "aktueller Event")}</strong>. Andere Events behalten ihren eigenen Check-in-PIN.</p>
      <form id="checkinPinForm" class="grid two">
        <div class="form-row">
          <label for="eventCheckinPin">Neuer Check-in-PIN</label>
          <input id="eventCheckinPin" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
        </div>
        <div class="form-row">
          <label for="eventCheckinPinConfirm">Neuer Check-in-PIN wiederholen</label>
          <input id="eventCheckinPinConfirm" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="zur Kontrolle wiederholen" />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" id="checkinPinSaveBtn" type="submit" disabled>Check-in-PIN speichern</button>
        </div>
      </form>
      <div id="checkinPinResult"></div>
    </section>
  `;
}

function bindRolePinHandlers() {
  bindJoinForm();
  document.getElementById("logoutBtn")?.addEventListener("click", logoutCurrentMember);
}

function bindJoinForm() {
  const form = document.getElementById("joinForm");
  const roleInput = document.getElementById("memberRole");
  const pinInput = document.getElementById("memberPin");
  const nameInput = document.getElementById("memberName");
  const deviceInput = document.getElementById("deviceLabel");
  const button = document.getElementById("joinSubmitBtn");
  if (!form || !roleInput || !pinInput || !nameInput || !deviceInput || !button) return;

  const original = {
    role: appState.member?.role || "checkin",
    displayName: appState.member?.displayName || localStorage.getItem("guestlist:memberName") || "",
    deviceLabel: appState.member?.deviceLabel || ""
  };
  const updateButtonState = () => {
    const hasPin = pinInput.value.length >= PIN_MIN_LENGTH;
    const hasName = Boolean(nameInput.value.trim());
    const changed = roleInput.value !== original.role
      || nameInput.value.trim() !== original.displayName
      || deviceInput.value.trim() !== original.deviceLabel;
    button.disabled = !hasPin || !hasName || (appState.member && !changed);
  };

  updateButtonState();
  [roleInput, pinInput, nameInput, deviceInput].forEach((input) => {
    input.addEventListener("input", updateButtonState);
    input.addEventListener("change", updateButtonState);
  });
  form.addEventListener("submit", joinEventFromForm);
}

function bindAdminPinForm() {
  const form = document.getElementById("adminPinForm");
  const currentInput = document.getElementById("currentAdminPin");
  const newInput = document.getElementById("newAdminPin");
  const confirmInput = document.getElementById("newAdminPinConfirm");
  const button = document.getElementById("adminPinSaveBtn");
  if (!form || !currentInput || !newInput || !confirmInput || !button) return;

  const updateButtonState = () => {
    button.disabled = currentInput.value.length < PIN_MIN_LENGTH
      || newInput.value.length < PIN_MIN_LENGTH
      || newInput.value !== confirmInput.value
      || currentInput.value === newInput.value;
  };

  updateButtonState();
  [currentInput, newInput, confirmInput].forEach((input) => input.addEventListener("input", updateButtonState));
  form.addEventListener("submit", updateGlobalAdminPinFromForm);
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

  if (role === "checkin") {
    try {
      const joined = await joinCheckinStaffFromAllowedEvents(pin, displayName, deviceLabel);
      if (!joined) {
        result.innerHTML = `<p class="notice error">${escapeHtml(checkinStaffLoginErrorMessage())}</p>`;
      }
    } catch (error) {
      console.error(error);
      result.innerHTML = `<p class="notice error">${escapeHtml(joinErrorMessage(error))}</p>`;
    }
    return;
  }

  if (!appState.eventId) {
    result.innerHTML = `<p class="notice error">Admin-Anmeldung braucht einen konkreten Event-Link.</p>`;
    return;
  }

  try {
    const pinHash = await hashPin(appState.eventId, role, pin);
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

async function joinCheckinStaffFromAllowedEvents(pin, displayName, deviceLabel) {
  const candidates = getCheckinStaffLoginCandidates();
  if (!candidates.length) return false;

  for (const candidate of candidates) {
    const eventSnap = await getDoc(doc(appState.db, "events", candidate.id));
    if (!eventSnap.exists()) continue;

    const eventData = { id: eventSnap.id, ...eventSnap.data() };
    if (!isEventDateAllowedForCheckinStaff(eventData.date)) continue;

    const pinHash = await hashPin(eventData.id, "checkin", pin);
    try {
      await setDoc(doc(appState.db, "events", eventData.id, "members", appState.user.uid), {
        uid: appState.user.uid,
        role: "checkin",
        pinHash,
        displayName,
        deviceLabel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      if (isPermissionError(error)) continue;
      throw error;
    }

    const memberSnap = await getDoc(doc(appState.db, "events", eventData.id, "members", appState.user.uid));
    unsubscribeAll();
    appState.eventId = eventData.id;
    appState.event = eventData;
    appState.member = memberSnap.exists() ? { id: memberSnap.id, ...memberSnap.data() } : null;
    appState.guests = [];
    appState.adminNotes = {};
    appState.adminNotesLoaded = false;
    appState.auditEntries = [];
    appState.currentTab = "checkin";
    localStorage.setItem("guestlist:memberName", displayName);
    localStorage.removeItem("guestlist:deviceLabel");
    localStorage.setItem("guestlist:lastEventId", eventData.id);
    clearAdminSession();
    saveKnownEvent(eventData);
    window.history.replaceState(null, "", urlWithEvent(eventData.id));
    loadMainApp();
    return true;
  }

  return false;
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
  appState.adminNotes = {};
  appState.adminNotesLoaded = false;
  renderShell();
  if (hasActiveEventAccess()) {
    subscribeGuests();
    subscribeAdminNotes();
  }
  renderActiveTab();
}

function visibleTabs() {
  const baseTabs = [
    { id: "checkin", label: "Check-in" }
  ];

  if (isAdmin()) {
    return [
      ...baseTabs,
      { id: "overview", label: "Übersicht" },
      { id: "admin", label: "Event Gäste & Betrieb" },
      { id: "setup", label: "Events Erstellen" },
      { id: "role", label: "Anmelden" },
      { id: "adminSettings", label: "Admin" },
      { id: "log", label: "Log" }
    ];
  }

  if (isActiveCheckinStaff()) {
    return [
      ...baseTabs,
      { id: "overview", label: "Übersicht" },
      { id: "role", label: "Anmelden" }
    ];
  }

  return [
    { id: "role", label: "Anmelden" }
  ];
}

function ensureCurrentTabVisible() {
  if (appState.currentTab === "lists") appState.currentTab = "overview";
  const tabs = visibleTabs();
  if (!tabs.some((tab) => tab.id === appState.currentTab)) {
    appState.currentTab = tabs[0]?.id || "checkin";
  }
}

function renderShell() {
  const role = ROLE_META[appState.member?.role] || appState.member?.role || "User";
  ensureCurrentTabVisible();
  const tabClass = (tab) => appState.currentTab === tab ? "active" : "";
  const tabs = visibleTabs();
  els.eventTitle.textContent = appState.event?.name || "Gästeliste";
  setEventMeta();
  els.footerText.textContent = `${role} · ${appState.member?.displayName || ""} · ${appState.member?.deviceLabel || ""} · Event: ${appState.eventId || "-"}`;

  render(`
    <div id="flash"></div>
    <nav class="nav-tabs" id="navTabs">
      ${tabs.map((tab) => `<button data-tab="${tab.id}" class="${tabClass(tab.id)}" type="button">${tab.label}</button>`).join("")}
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
}

function renderActiveTab() {
  ensureCurrentTabVisible();
  if (appState.currentTab === "checkin") renderCheckin();
  else if (appState.currentTab === "overview") renderOverview();
  else if (appState.currentTab === "admin") renderAdmin();
  else if (appState.currentTab === "setup") renderEventSetup();
  else if (appState.currentTab === "role") renderRolePinTab();
  else if (appState.currentTab === "adminSettings") renderAdminSettings();
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

function subscribeAdminNotes() {
  if (!isAdmin()) {
    appState.adminNotesLoaded = true;
    return;
  }

  const notesQuery = query(collection(appState.db, "events", appState.eventId, "guestAdminNotes"));
  appState.adminNotesUnsubscribe = onSnapshot(notesQuery, (snapshot) => {
    appState.adminNotes = Object.fromEntries(snapshot.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
    appState.adminNotesLoaded = true;
    renderActiveTab();
  }, (error) => {
    console.error(error);
    notify("Admin-Notizen konnten nicht geladen werden.", "error");
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
    <section class="card compact">
      <div class="actions">
        <button class="btn-secondary" id="checkinAuthBtn" type="button">${isEventMember() ? "Abmelden" : "Anmelden"}</button>
      </div>
    </section>
    ${renderAddGuestPanel(categories)}
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
  document.getElementById("checkinAuthBtn")?.addEventListener("click", handleCheckinAuthButton);
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

function handleCheckinAuthButton() {
  if (isEventMember()) {
    logoutCurrentMember("checkin");
    return;
  }

  appState.currentTab = "role";
  renderShell();
  renderActiveTab();
}

function logoutCurrentMember(nextTab = "role") {
  clearAdminSession();
  if (appState.adminNotesUnsubscribe) {
    appState.adminNotesUnsubscribe();
    appState.adminNotesUnsubscribe = null;
  }
  appState.adminNotes = {};
  appState.adminNotesLoaded = false;
  appState.member = null;
  appState.ui.editingGuestId = "";
  appState.currentTab = nextTab;
  renderShell();
  renderActiveTab();
}

function renderAddGuestPanel(categories) {
  if (!isAdmin()) return "";
  const disabled = writeDisabledAttr();
  return `
    <section class="card compact">
      <details>
        <summary class="details-summary">Gast manuell hinzufügen</summary>
        <form id="addGuestForm" class="grid two">
          <div class="form-row">
            <label for="addName">Name</label>
            <input id="addName" required ${disabled} />
          </div>
          <div class="form-row">
            <label for="addCategory">Kategorie</label>
            <select id="addCategory" ${disabled}>${categories.map((cat) => `<option>${escapeHtml(cat)}</option>`).join("")}</select>
          </div>
          <div class="form-row" style="grid-column:1/-1">
            <label for="addInternalNote">${INFO_LABELS.adminOnly}</label>
            <textarea id="addInternalNote" ${disabled}></textarea>
          </div>
          <div class="form-row" style="grid-column:1/-1">
            <label for="addAdminStaffInfo">${INFO_LABELS.adminToStaff}</label>
            <textarea id="addAdminStaffInfo" ${disabled}></textarea>
          </div>
          <div class="form-row" style="grid-column:1/-1">
            <label for="addSupportComment">${INFO_LABELS.staffToAll}</label>
            <textarea id="addSupportComment" ${disabled}></textarea>
          </div>
          <div class="actions" style="grid-column:1/-1"><button class="btn-primary" type="submit" ${disabled}>Gast speichern</button></div>
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
  const disabled = writeDisabledAttr();
  const memberInfoVisible = isEventMember();
  const staffInfo = memberInfoVisible ? staffInfoForGuest(guest) : "";
  const adminStaffInfo = memberInfoVisible ? adminStaffInfoForGuest(guest) : "";
  const internalNote = isAdmin() ? adminOnlyInfoForGuest(guest) : "";

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
      ${internalNote ? `<p class="notice info"><strong>${INFO_LABELS.adminOnly}:</strong> ${escapeHtml(internalNote)}</p>` : ""}
      ${adminStaffInfo ? `<p class="notice info"><strong>${INFO_LABELS.adminToStaff}:</strong> ${escapeHtml(adminStaffInfo)}</p>` : ""}
      <div class="guest-actions">
        <div class="comment-box form-row">
          <label for="${commentId}">${INFO_LABELS.staffToAll}</label>
          <textarea id="${commentId}" data-comment-for="${escapeHtml(guest.id)}" placeholder="z.B. VIP-Band abgegeben, kommt mit Künstler…" ${disabled}>${escapeHtml(staffInfo)}</textarea>
          <button class="btn-secondary" data-action="save-comment" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Info speichern</button>
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
  const disabled = writeDisabledAttr();
  const internalNote = adminOnlyInfoForGuest(guest);
  const adminStaffInfo = adminStaffInfoForGuest(guest);
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
          <label>${INFO_LABELS.adminOnly}</label>
          <textarea name="internalNote" ${disabled}>${escapeHtml(internalNote)}</textarea>
        </div>
        <div class="form-row" style="grid-column:1/-1">
          <label>${INFO_LABELS.adminToStaff}</label>
          <textarea name="adminStaffInfo" ${disabled}>${escapeHtml(adminStaffInfo)}</textarea>
        </div>
        <div class="form-row" style="grid-column:1/-1">
          <label>${INFO_LABELS.staffToAll}</label>
          <textarea name="supportComment" ${disabled}>${escapeHtml(staffInfoForGuest(guest))}</textarea>
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
  if (!requireEventMember("Check-in")) return;
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
        lastActionByName: appState.member.displayName || "Check-in",
        ...(isAdmin() ? staleGuestFieldDeletes() : {})
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
  if (!requireEventMember("Info speichern")) return;
  if (!requireOnline("Info speichern")) return;
  const guest = findGuest(guestDocId);
  const textarea = document.querySelector(`[data-comment-for="${cssEscape(guestDocId)}"]`);
  if (!guest || !textarea) return;
  const newComment = textarea.value.trim();

  try {
    await updateDoc(guestRef(guestDocId), {
      supportComment: newComment,
      updatedAt: serverTimestamp(),
      lastActionAt: serverTimestamp(),
      lastActionByName: appState.member.displayName || "Check-in",
      ...(isAdmin() ? staleGuestFieldDeletes() : {})
    });
    await addAudit("support_comment_update", guest, {
      oldComment: staffInfoForGuest(guest),
      newComment
    });
    notify("Info gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Info konnte nicht gespeichert werden: ${error.message || error}`, "error");
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
  const adminStaffInfo = String(data.get("adminStaffInfo") || "").trim();
  const internalNote = String(data.get("internalNote") || "").trim();

  try {
    const batch = writeBatch(appState.db);
    batch.update(guestRef(guestDocId), {
      name: trimmedName,
      category: normalizedCategory,
      searchName: normalizeForSearch(`${trimmedName} ${guest.guestId || ""} ${normalizedCategory}`),
      supportComment,
      adminStaffInfo,
      updatedAt: serverTimestamp(),
      lastActionAt: serverTimestamp(),
      lastActionByName: appState.member.displayName || "Admin",
      ...staleGuestFieldDeletes()
    });
    if (internalNote) {
      batch.set(guestAdminNoteRef(guestDocId), {
        internalNote,
        updatedAt: serverTimestamp(),
        updatedByName: appState.member.displayName || "Admin"
      });
    } else {
      batch.delete(guestAdminNoteRef(guestDocId));
    }
    await batch.commit();
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
      lastActionByName: appState.member.displayName || "Admin",
      ...staleGuestFieldDeletes()
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
    const batch = writeBatch(appState.db);
    batch.delete(guestRef(guestDocId));
    batch.delete(guestAdminNoteRef(guestDocId));
    await batch.commit();
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
    ${renderGuestListSection()}
  `;
  bindGuestListControls();
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

function renderGuestListSection() {
  const categories = getCategories();
  const guests = filterGuests("", appState.ui.listCategory, appState.ui.listStatus);

  return `
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
}

function bindGuestListControls() {
  document.getElementById("listCategory")?.addEventListener("change", (e) => {
    appState.ui.listCategory = e.target.value;
    renderOverview();
  });
  document.getElementById("listStatus")?.addEventListener("change", (e) => {
    appState.ui.listStatus = e.target.value;
    renderOverview();
  });
}

function renderGuestTable(guests) {
  const showAdminPrivate = isAdmin();
  const rows = guests.map((g) => `
    <tr>
      <td>${escapeHtml(g.name || "")}</td>
      <td>${escapeHtml(g.guestId || g.id)}</td>
      <td>${escapeHtml(g.category || "")}</td>
      <td><span class="badge ${STATUS_META[g.status || "open"]?.badge || "warning"}">${STATUS_META[g.status || "open"]?.label || "Offen"}</span></td>
      <td>${escapeHtml(adminStaffInfoForGuest(g))}</td>
      <td>${escapeHtml(staffInfoForGuest(g))}</td>
      ${showAdminPrivate ? `<td>${escapeHtml(adminOnlyInfoForGuest(g))}</td>` : ""}
      <td>${formatTimestamp(g.checkedInAt)}</td>
    </tr>
  `).join("");
  const emptyColspan = showAdminPrivate ? 8 : 7;

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Guest ID</th><th>Kategorie</th><th>Status</th><th>${INFO_LABELS.adminToStaff}</th><th>${INFO_LABELS.staffToAll}</th>${showAdminPrivate ? `<th>${INFO_LABELS.adminOnly}</th>` : ""}<th>Check-in Zeit</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${emptyColspan}">Keine Einträge.</td></tr>`}</tbody>
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
  const exportDisabled = appState.adminNotesLoaded ? "" : "disabled";
  content.innerHTML = `
    <section class="card">
      <h2>Event wechseln</h2>
      <p class="small">Aktiviert ein anderes vorbereitetes Event in diesem Browser. Gäste, Import und Export bleiben pro Event getrennt.</p>
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
          <button class="btn-primary" id="eventNameSaveBtn" type="submit" disabled>Eventname speichern</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Event-Links für Door-Leads</h2>
      <p class="small">Diese Links an Check-in-Geräte geben. Mitarbeiter:innen benötigen zusätzlich den Check-in-PIN. Nicht die Basis-URL verwenden.</p>
      ${renderCurrentEventLink()}
    </section>

    ${renderCheckinPinSection()}

    <section class="card">
      <h2>CSV Import</h2>
      <p class="small">Erwartete Spalten: <code>Name</code>, <code>Kategorie</code>, optional <code>Guest ID</code> und Info-Spalten. Excel vorher als CSV speichern.</p>
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
        <button class="btn-secondary" data-export="all" ${exportDisabled}>Alle Gäste CSV</button>
        <button class="btn-secondary" data-export="checked_in" ${exportDisabled}>Eingecheckte CSV</button>
        <button class="btn-secondary" data-export="open" ${exportDisabled}>Offene CSV</button>
        <button class="btn-secondary" data-export="no_show" ${exportDisabled}>No Show CSV</button>
        <button class="btn-secondary" id="exportAuditBtn" type="button">Audit Log CSV</button>
      </div>
      <div id="backupStatus">${appState.ui.lastBackupMessage ? `<p class="notice success">${escapeHtml(appState.ui.lastBackupMessage)}</p>` : ""}</div>
    </section>

    <section class="card">
      <h2>Tagesabschluss</h2>
      <div class="actions">
        <button class="btn-secondary" id="markOpenNoShowBtn">Offene Gäste auf No Show setzen</button>
      </div>
    </section>
  `;

  bindKnownLinkCopyButtons();
  bindKnownEventButtons();
  bindEventNameForm();
  bindCheckinPinForm();
  document.getElementById("previewImportBtn")?.addEventListener("click", previewCsvImport);
  document.getElementById("runImportBtn")?.addEventListener("click", runCsvImport);
  document.querySelectorAll("[data-export]").forEach((btn) => btn.addEventListener("click", () => exportGuests(btn.dataset.export)));
  document.getElementById("exportAuditBtn")?.addEventListener("click", exportAuditLog);
  document.getElementById("markOpenNoShowBtn")?.addEventListener("click", markOpenGuestsNoShow);
}

function bindEventNameForm() {
  const form = document.getElementById("eventNameForm");
  const input = document.getElementById("eventNameInput");
  const button = document.getElementById("eventNameSaveBtn");
  if (!form || !input || !button) return;

  const originalName = appState.event?.name || "";
  const updateButtonState = () => {
    button.disabled = input.value.trim() === originalName || !input.value.trim();
  };

  updateButtonState();
  input.addEventListener("input", updateButtonState);
  form.addEventListener("submit", updateEventNameFromForm);
}

function bindCheckinPinForm() {
  const form = document.getElementById("checkinPinForm");
  const pinInput = document.getElementById("eventCheckinPin");
  const confirmInput = document.getElementById("eventCheckinPinConfirm");
  const button = document.getElementById("checkinPinSaveBtn");
  if (!form || !pinInput || !confirmInput || !button) return;

  const updateButtonState = () => {
    const pin = pinInput.value;
    button.disabled = pin.length < PIN_MIN_LENGTH || pin !== confirmInput.value;
  };

  updateButtonState();
  pinInput.addEventListener("input", updateButtonState);
  confirmInput.addEventListener("input", updateButtonState);
  form.addEventListener("submit", updateCheckinPinFromForm);
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
    adminStaffInfo: val("addAdminStaffInfo"),
    guestId: nextAvailableGuestCode()
  });
  const internalNote = val("addInternalNote").trim();

  try {
    const ref = doc(collection(appState.db, "events", appState.eventId, "guests"));
    const batch = writeBatch(appState.db);
    batch.set(ref, guest);
    if (internalNote) {
      batch.set(guestAdminNoteRef(ref.id), {
        internalNote,
        updatedAt: serverTimestamp(),
        updatedByName: appState.member.displayName || "Admin"
      });
    }
    await batch.commit();
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
  const chunkSize = 225;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = writeBatch(appState.db);
    rows.slice(i, i + chunkSize).forEach((guest) => {
      const ref = doc(collection(appState.db, "events", appState.eventId, "guests"));
      batch.set(ref, buildGuestRecord(guest));
      const internalNote = String(guest.internalNote || "").trim();
      if (internalNote) {
        batch.set(guestAdminNoteRef(ref.id), {
          internalNote,
          updatedAt: serverTimestamp(),
          updatedByName: appState.member?.displayName || "Admin"
        });
      }
    });
    await batch.commit();
    done += Math.min(chunkSize, rows.length - i);
    onProgress?.(done);
  }
}

async function deleteGuestsInChunks(guests, onProgress) {
  const chunkSize = 225;
  let done = 0;
  for (let i = 0; i < guests.length; i += chunkSize) {
    const batch = writeBatch(appState.db);
    guests.slice(i, i + chunkSize).forEach((guest) => {
      batch.delete(guestRef(guest.id));
      batch.delete(guestAdminNoteRef(guest.id));
    });
    await batch.commit();
    done += Math.min(chunkSize, guests.length - i);
    onProgress?.(done);
  }
}

function exportGuests(filter) {
  if (isAdmin() && !appState.adminNotesLoaded) {
    notify("Export noch nicht möglich: Admin-Infos werden noch geladen.", "warning");
    return;
  }
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
    [INFO_LABELS.staffToAll]: staffInfoForGuest(g),
    [INFO_LABELS.adminToStaff]: adminStaffInfoForGuest(g),
    [INFO_LABELS.adminOnly]: adminOnlyInfoForGuest(g)
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
          lastActionByName: appState.member.displayName || "Admin",
          ...staleGuestFieldDeletes()
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

async function updateCheckinPinFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Check-in-PIN neu setzen")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen PINs ändern.", "warning");
    return;
  }

  const result = document.getElementById("checkinPinResult");
  const checkinPin = val("eventCheckinPin");
  const checkinPinConfirm = val("eventCheckinPinConfirm");
  if (checkinPin.length < PIN_MIN_LENGTH) {
    notify(`Check-in-PIN muss mindestens ${PIN_MIN_LENGTH} Zeichen haben.`, "warning");
    return;
  }
  if (checkinPin !== checkinPinConfirm) {
    notify("Check-in-PIN und Wiederholung stimmen nicht überein.", "warning");
    return;
  }

  try {
    const securityRef = doc(appState.db, "events", appState.eventId, "private", "security");
    const securitySnap = await getDoc(securityRef);
    if (!securitySnap.exists()) throw new Error("Security-Dokument fehlt.");
    const checkinPinHash = await hashPin(appState.eventId, "checkin", checkinPin);
    await updateDoc(securityRef, {
      checkinPinHash,
      updatedAt: serverTimestamp()
    });
    await addAudit("pins_reset", { name: "Check-in-PIN" }, { scope: "current_event" });
    document.getElementById("checkinPinForm")?.reset();
    const saveButton = document.getElementById("checkinPinSaveBtn");
    if (saveButton) saveButton.disabled = true;
    if (result) result.innerHTML = `<p class="notice success">Check-in-PIN für diesen Event gespeichert.</p>`;
    notify("Check-in-PIN für diesen Event gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Check-in-PIN konnte nicht gesetzt werden: ${error.message || error}`, "error");
    if (result) result.innerHTML = `<p class="notice error">${escapeHtml(error.message || error)}</p>`;
  }
}

async function updateGlobalAdminPinFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Admin-PIN speichern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen PINs ändern.", "warning");
    return;
  }

  const result = document.getElementById("adminPinResult");
  const currentPin = val("currentAdminPin");
  const newPin = val("newAdminPin");
  const newPinConfirm = val("newAdminPinConfirm");
  if (currentPin.length < PIN_MIN_LENGTH || newPin.length < PIN_MIN_LENGTH) {
    notify(`Admin-PIN muss mindestens ${PIN_MIN_LENGTH} Zeichen haben.`, "warning");
    return;
  }
  if (newPin !== newPinConfirm) {
    notify("Neuer Admin-PIN und Wiederholung stimmen nicht überein.", "warning");
    return;
  }

  const targetEvents = getAdminPinTargetEvents();
  const displayName = appState.member?.displayName || "Admin";
  const deviceLabel = appState.member?.deviceLabel || "";
  if (result) result.innerHTML = `<p class="notice info">Admin-PIN wird für ${targetEvents.length} bekannte Events geprüft…</p>`;

  const failedAccess = [];
  for (const target of targetEvents) {
    try {
      await connectAdminToEvent(target.id, currentPin, displayName);
    } catch (error) {
      console.error(error);
      failedAccess.push(target.name || target.id);
    }
  }

  if (failedAccess.length) {
    const message = `Admin-PIN wurde nicht geändert. Prüfung fehlgeschlagen für: ${failedAccess.join(", ")}`;
    if (result) result.innerHTML = `<p class="notice error">${escapeHtml(message)}</p>`;
    notify(message, "error");
    return;
  }

  try {
    for (const target of targetEvents) {
      const adminPinHash = await hashPin(target.id, "admin", newPin);
      await updateDoc(doc(appState.db, "events", target.id, "private", "security"), {
        adminPinHash,
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(appState.db, "events", target.id, "members", appState.user.uid), {
        uid: appState.user.uid,
        role: "admin",
        pinHash: adminPinHash,
        displayName,
        deviceLabel,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    saveAdminSession(newPin, displayName);
    const memberSnap = await getMemberSnapForEvent(appState.eventId);
    if (memberSnap.exists()) appState.member = { id: memberSnap.id, ...memberSnap.data() };
    await addAudit("admin_pin_reset", { name: "Admin-PIN" }, { scope: "known_events", count: targetEvents.length });
    document.getElementById("adminPinForm")?.reset();
    const saveButton = document.getElementById("adminPinSaveBtn");
    if (saveButton) saveButton.disabled = true;
    if (result) result.innerHTML = `<p class="notice success">Admin-PIN für ${targetEvents.length} bekannte Events gespeichert.</p>`;
    notify("Admin-PIN gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Admin-PIN konnte nicht gesetzt werden: ${error.message || error}`, "error");
    if (result) result.innerHTML = `<p class="notice error">${escapeHtml(error.message || error)}</p>`;
  }
}

function renderAuditLog() {
  if (!isAdmin()) {
    tabContent().innerHTML = `<section class="card"><h2>Kein Zugriff</h2><p>Admin-Rechte erforderlich.</p></section>`;
    return;
  }
  const content = tabContent();
  content.innerHTML = `
    <section class="card audit-card">
      <h2>Audit Log</h2>
      <p class="small">Zeigt die letzten 100 Einträge. Der CSV-Export lädt bis zu 5000 Einträge für dieses Event.</p>
      <div class="actions">
        <button class="btn-secondary" id="exportAuditLogTabBtn" type="button">Audit Log CSV exportieren</button>
      </div>
      <div id="auditList" class="audit-list"><p class="small">Lädt…</p></div>
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
      ${entry.details ? `<div class="small log-details">${escapeHtml(JSON.stringify(entry.details))}</div>` : ""}
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
    pins_reset: "Check-in-PIN neu gesetzt",
    admin_pin_reset: "Admin-PIN neu gesetzt"
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
    const text = `${guest.name || ""} ${guest.guestId || ""} ${guest.category || ""} ${isEventMember() ? `${staffInfoForGuest(guest)} ${adminStaffInfoForGuest(guest)}` : ""} ${isAdmin() ? adminOnlyInfoForGuest(guest) : ""}`;
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
    adminStaffInfo: String(input.adminStaffInfo || "").trim(),
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
  const supportComment = pick(row, [INFO_LABELS.staffToAll, "Support Kommentar", "Support Comment", "Kommentar", "Comment", "Bemerkung"]);
  const adminStaffInfo = pick(row, [INFO_LABELS.adminToStaff, "Info für Check-in Staff", "Check-in Info"]);
  const internalNote = pick(row, [INFO_LABELS.adminOnly, "Interne Notiz", "Internal Note", "Admin-Info", "Admin Notiz", "Private Admin Info", "Notiz", "Note"]);
  const statusRaw = pick(row, ["Status", "Check-in Status"]);
  const status = parseStatus(statusRaw);

  return {
    ...buildGuestRecord({ name, category, guestId, supportComment, adminStaffInfo, status }),
    internalNote: String(internalNote || "").trim()
  };
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

function guestAdminNoteRef(id) {
  return doc(appState.db, "events", appState.eventId, "guestAdminNotes", id);
}

function findGuest(id) {
  return appState.guests.find((g) => g.id === id);
}

function staffInfoForGuest(guest) {
  return String(guest.supportComment || "").trim();
}

function adminStaffInfoForGuest(guest) {
  return String(guest.adminStaffInfo || "").trim();
}

function adminOnlyInfoForGuest(guest) {
  return String(appState.adminNotes[guest.id]?.internalNote || "").trim();
}

function staleGuestFieldDeletes() {
  return {
    internalNote: deleteField(),
    adminPrivateInfo: deleteField()
  };
}

function isAdmin() {
  return appState.member?.role === "admin";
}

function isCheckinStaff() {
  return appState.member?.role === "checkin";
}

function isActiveCheckinStaff() {
  return isCheckinStaff() && isCheckinStaffAccessOpen();
}

function hasLinkedRole() {
  return Boolean(appState.member?.role);
}

function hasActiveEventAccess() {
  return isAdmin() || isActiveCheckinStaff();
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

function checkinStaffAccessWindow() {
  const match = String(appState.event?.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(2, 0, 0, 0);
  return { start, end };
}

function isCheckinStaffAccessOpen(now = new Date()) {
  return isEventDateAllowedForCheckinStaff(appState.event?.date, now);
}

function checkinStaffAccessMessage() {
  const accessWindow = checkinStaffAccessWindow();
  if (!accessWindow) return "Check-in Staff Zugriff ist nicht aktiv, weil kein Eventdatum gesetzt ist.";
  return `Check-in Staff Zugriff ist nur am Eventtag ${formatEventDate(appState.event.date)} bis 02:00 Uhr am Folgetag möglich.`;
}

function getCheckinStaffLoginCandidates(now = new Date()) {
  const candidates = [];
  const todayEvent = findKnownEventByDate(localDateKey(now));
  if (todayEvent) candidates.push(todayEvent);

  if (now.getHours() < 2) {
    const previousEvent = findKnownEventByDate(localDateKey(addDays(now, -1)));
    if (previousEvent && previousEvent.id !== todayEvent?.id) candidates.push(previousEvent);
  }

  return candidates;
}

function findKnownEventByDate(date) {
  return getKnownEvents().find((event) => event.date === date) || null;
}

function isEventDateAllowedForCheckinStaff(eventDate, now = new Date()) {
  if (!eventDate) return false;
  if (eventDate === localDateKey(now)) return true;
  return now.getHours() < 2 && eventDate === localDateKey(addDays(now, -1));
}

function checkinStaffLoginErrorMessage() {
  const candidates = getCheckinStaffLoginCandidates();
  if (!candidates.length) {
    return "Kein Check-in Event für heute gefunden. Bis 02:00 Uhr wird zusätzlich das Event vom Vortag berücksichtigt.";
  }
  return "Check-in-PIN passt zu keinem aktuell erlaubten Event.";
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

function isEventMember() {
  return hasActiveEventAccess();
}

function requireEventMember(action) {
  if (isEventMember()) return true;
  notify(`${action} nicht möglich: Bitte zuerst anmelden.`, "warning");
  return false;
}

function writeDisabledAttr() {
  return isOffline() || !isEventMember() ? "disabled" : "";
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

function getAdminPinTargetEvents() {
  const byId = new Map();
  [
    ...getKnownEvents(),
    appState.event ? { id: appState.eventId, ...appState.event } : null,
    GLOBAL_ADMIN_EVENT_ID ? { id: GLOBAL_ADMIN_EVENT_ID, name: GLOBAL_ADMIN_EVENT_ID } : null
  ].forEach((event) => {
    const normalized = normalizeKnownEvent(event);
    if (!normalized) return;
    byId.set(normalized.id, normalized);
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
              <button class="${isCurrent ? "btn-secondary" : "btn-primary"}" type="button" data-activate-event="${escapeHtml(event.id)}">${isCurrent ? "Aktuell" : "Aktivieren"}</button>
            </span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderCurrentEventLink() {
  const event = {
    id: appState.eventId,
    name: appState.event?.name || appState.eventId,
    date: appState.event?.date || ""
  };
  if (!event.id) return `<p class="notice warning">Aktueller Event ist nicht geladen.</p>`;
  const link = urlWithEvent(event.id);
  return `
    <div class="grid">
      <div class="form-row">
        <label>${escapeHtml(event.name || event.id)}${event.date ? ` · ${escapeHtml(formatEventDate(event.date))}` : ""}</label>
        <div class="copy-field">
          <input value="${escapeHtml(link)}" readonly />
          <button class="btn-secondary" type="button" data-copy-known-link="${escapeHtml(link)}">Kopieren</button>
        </div>
      </div>
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
  document.querySelectorAll("[data-activate-event]").forEach((button) => {
    button.addEventListener("click", async () => {
      const eventId = button.getAttribute("data-activate-event");
      if (!eventId) return;
      if (eventId === appState.eventId) {
        notify("Dieses Event ist bereits aktuell.", "info");
        return;
      }
      button.disabled = true;
      const originalText = button.textContent || "";
      button.textContent = "Aktiviere…";
      try {
        await activateKnownEvent(eventId);
      } catch (error) {
        console.error(error);
        notify(`Event konnte nicht aktiviert werden: ${error?.message || error}`, "error");
        if (document.body.contains(button)) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });
  });
}

async function activateKnownEvent(eventId) {
  const targetEventId = resolveEventId(eventId);
  const previousTab = appState.currentTab;
  const eventSnap = await getDoc(doc(appState.db, "events", targetEventId));
  if (!eventSnap.exists()) {
    throw new Error(`Event ${targetEventId} wurde nicht gefunden.`);
  }

  let memberSnap = await getMemberSnapForEvent(targetEventId);
  if (isAdmin()) {
    const session = getAdminSession();
    if (session?.pin) {
      try {
        await connectAdminToEvent(targetEventId, session.pin, session.displayName || appState.member?.displayName || "Admin");
        memberSnap = await getMemberSnapForEvent(targetEventId);
      } catch (error) {
        console.error(error);
        clearAdminSession();
        if (!memberSnap.exists()) {
          throw new Error("Automatischer Admin-Wechsel fehlgeschlagen. Bitte beim Ziel-Event erneut einloggen.");
        }
      }
    }
  }

  unsubscribeAll();
  appState.eventId = targetEventId;
  appState.event = { id: eventSnap.id, ...eventSnap.data() };
  appState.member = memberSnap.exists() ? { id: memberSnap.id, ...memberSnap.data() } : null;
  appState.guests = [];
  appState.adminNotes = {};
  appState.adminNotesLoaded = false;
  appState.auditEntries = [];
  appState.currentTab = previousTab;
  localStorage.setItem("guestlist:lastEventId", targetEventId);
  saveKnownEvent(appState.event);
  window.history.replaceState(null, "", urlWithEvent(targetEventId));

  if (appState.member) {
    loadMainApp();
    return;
  }

  renderJoin();
  const result = document.getElementById("joinResult");
  if (result) {
    result.innerHTML = `<p class="notice info">Event aktiviert. Bitte mit dem passenden PIN verbinden.</p>`;
  }
}

async function getMemberSnapForEvent(eventId) {
  try {
    return await getDoc(doc(appState.db, "events", eventId, "members", appState.user.uid));
  } catch (error) {
    if (isPermissionError(error)) return { exists: () => false };
    throw error;
  }
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
  if (appState.adminNotesUnsubscribe) {
    appState.adminNotesUnsubscribe();
    appState.adminNotesUnsubscribe = null;
  }
  if (appState.auditUnsubscribe) {
    appState.auditUnsubscribe();
    appState.auditUnsubscribe = null;
  }
}
