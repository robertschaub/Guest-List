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
  arrayUnion,
  deleteField,
  writeBatch,
  runTransaction,
  onSnapshot,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CONFIG = window.GUESTLIST_APP_CONFIG || {};
const DEFAULT_CATEGORIES = CONFIG.app?.categories || ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"];
const DEFAULT_STATUSES = ["open", "checked_in", "no_show"];
const CONFIGURED_EVENTS = Array.isArray(CONFIG.app?.knownEvents) ? CONFIG.app.knownEvents : [];
const KNOWN_EVENTS_STORAGE_KEY = "guestlist:knownEvents";
const ADMIN_SESSION_STORAGE_KEY = "guestlist:adminSession";
const DEVICE_LABEL_STORAGE_KEY = "guestlist:deviceLabel";
const EVENT_ALIASES = CONFIG.app?.eventAliases || {};
const GLOBAL_ADMIN_EVENT_ID = CONFIG.app?.globalAdminEventId || CONFIGURED_EVENTS[0]?.id || "";
const ADMIN_SECURITY_COLLECTION = "appSecurity";
const ADMIN_SECURITY_DOC_ID = "admin";
const ADMIN_PIN_SCOPE = "global-admin";
const ADMIN_MASTER_NAMED_HASHES_FIELD = "adminMasterNamedPinHashes";
const MAIN_ADMIN_NAME = "Main";
const MAIN_ADMIN_NAME_KEY = "main";
const MAIN_ADMIN_PIN_ID = "main-admin-pin";
const GENERAL_CHECKIN_PIN_ID = "generic";
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
  adminOnly: "Admin-Notiz",
  adminToStaff: "Hinweis an Check-in",
  staffToAll: "Check-in-Notiz"
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
const AUDIT_EXPORT_PAGE_SIZE = 500;
const AUDIT_EXPORT_MAX_ENTRIES = 50000;

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
  eventUnsubscribe: null,
  memberUnsubscribe: null,
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
    checkinUndo: null,
    masterAdmin: null,
    masterAdminKind: "",
    showCheckinPins: false,
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
    installCheckinUndoInvalidation();

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
    const defaultEvent = await findFirstAvailableEventFromDate();
    if (defaultEvent) {
      appState.eventId = defaultEvent.id;
      appState.event = defaultEvent;
      localStorage.setItem("guestlist:lastEventId", appState.eventId);
      saveKnownEvent(appState.event);
      window.history.replaceState(null, "", urlWithEvent(appState.eventId));
      els.eventTitle.textContent = appState.event.name || "Gästeliste";
      setEventMeta();

      const memberSnap = await getCurrentMemberSnap();
      if (memberSnap.exists()) {
        appState.member = { id: memberSnap.id, ...memberSnap.data() };
        loadMainApp();
      } else {
        renderJoin();
      }
      return;
    }

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
  const visibleKnownEvents = knownEvents.filter((event) => isAdmin() || !isEventHidden(event));
  const showEventDirectory = isAdmin() || visibleKnownEvents.length;
  const omitAdminPin = Boolean(options.omitAdminPin);
  const setupName = getAdminSession()?.displayName || appState.member?.displayName || MAIN_ADMIN_NAME;
  return `
    ${showEventDirectory ? `
      <section class="card">
        <h2>Bestehende Events</h2>
        <div id="setupEventDirectory">
          ${isAdmin() ? `<p class="small">Events werden geladen…</p>` : renderKnownEventList(appState.eventId)}
        </div>
      </section>
    ` : ""}
    <section class="card">
      <h2>Neues Event erstellen</h2>
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
            <label for="adminPin">Main-PIN</label>
            <input id="adminPin" type="password" minlength="${PIN_MIN_LENGTH}" required placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
          </div>
        `}
        <div class="form-row">
          <label for="checkinPin">Check-in-PIN</label>
          <input id="checkinPin" type="password" minlength="${PIN_MIN_LENGTH}" required placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
        </div>
        <div class="form-row">
          <label for="setupName">Admin-Name</label>
          <input id="setupName" value="${escapeHtml(setupName)}" required />
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
  if (isAdmin()) {
    void renderSetupEventDirectory();
  } else {
    bindKnownLinkCopyButtons();
    bindKnownEventButtons();
  }
  if (isAdmin() || getAdminSession()?.pin) {
    void prefillSetupCheckinPinFromRecentEvent();
  }
  document.getElementById("createEventForm")?.addEventListener("submit", createEventFromForm);
}

async function prefillSetupCheckinPinFromRecentEvent() {
  const input = document.getElementById("checkinPin");
  if (!input || input.value || input.dataset.prefillAttempted === "1") return;
  input.dataset.prefillAttempted = "1";

  const reusablePin = await findReusableCheckinPinValue();
  if (!reusablePin?.pinValue) return;
  const currentInput = document.getElementById("checkinPin");
  if (!currentInput || currentInput.value) return;
  currentInput.value = reusablePin.pinValue;
  currentInput.dataset.prefilledFromEvent = reusablePin.eventId;
  currentInput.dispatchEvent(new Event("input", { bubbles: true }));
}

async function findReusableCheckinPinValue() {
  for (const eventId of recentCheckinPinSourceEventIds()) {
    try {
      const securitySnap = await getDoc(doc(appState.db, "events", eventId, "private", "security"));
      if (!securitySnap.exists()) continue;
      const pinValue = securitySnap.data()?.checkinPinValue;
      if (typeof pinValue === "string" && pinValue.length >= PIN_MIN_LENGTH) {
        return { eventId, pinValue };
      }
    } catch (error) {
      if (!isPermissionError(error)) console.error(error);
    }
  }
  return null;
}

function recentCheckinPinSourceEventIds() {
  const candidates = [];
  const addCandidate = (eventId) => {
    const resolved = resolveEventId(eventId);
    if (resolved && !candidates.includes(resolved)) candidates.push(resolved);
  };
  addCandidate(appState.eventId);
  addCandidate(localStorage.getItem("guestlist:lastEventId") || "");
  getKnownEvents().forEach((event) => addCandidate(event.id));
  addCandidate(GLOBAL_ADMIN_EVENT_ID);
  return candidates;
}

function renderEventSetup() {
  tabContent().innerHTML = renderEventSetupSections({ omitAdminPin: isAdmin() && Boolean(getAdminSession()?.pin) });
  bindEventSetupHandlers();
}

async function renderSetupEventDirectory() {
  const target = document.getElementById("setupEventDirectory");
  if (!target || !isAdmin()) return;
  await renderFirebaseEventDirectory(target, { fallbackToKnownEvents: true });
}

async function createEventFromForm(event) {
  event.preventDefault();
  const result = document.getElementById("setupResult");
  result.innerHTML = `<p class="notice info">Event wird erstellt…</p>`;

  const name = val("newEventName").trim();
  const date = val("newEventDate").trim();
  const adminPin = val("adminPin") || (isAdmin() ? getAdminSession()?.pin || "" : "");
  const checkinPin = val("checkinPin");
  const displayName = val("setupName").trim() || MAIN_ADMIN_NAME;
  const deviceLabel = appState.member?.deviceLabel || getLocalDeviceLabel();
  const categories = val("categoryList").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  if (!name || !date) {
    result.innerHTML = `<p class="notice error">Eventname und Datum sind Pflichtfelder.</p>`;
    return;
  }

  const eventId = buildEventId(name, date);
  const checkinAccessWindow = checkinAccessWindowForDate(date);

  if (adminPin.length < PIN_MIN_LENGTH || checkinPin.length < PIN_MIN_LENGTH) {
    result.innerHTML = `<p class="notice error">PINs müssen mindestens ${PIN_MIN_LENGTH} Zeichen haben.</p>`;
    return;
  }
  if (!checkinAccessWindow) {
    result.innerHTML = `<p class="notice error">Eventdatum ist ungültig.</p>`;
    return;
  }

  try {
    result.innerHTML = `<p class="notice info">Admin-Zugriff wird geprüft…</p>`;
    await verifyGlobalAdminPin(adminPin, displayName, deviceLabel, eventId);

    const targetEventRef = doc(appState.db, "events", eventId);
    const existingEventSnap = await getDoc(targetEventRef);
    if (existingEventSnap.exists()) {
      result.innerHTML = `<p class="notice error">Event-ID <code>${escapeHtml(eventId)}</code> existiert bereits. Bitte Eventname oder Datum anpassen.</p>`;
      return;
    }

    const checkinPinHash = await hashPin(eventId, "checkin", checkinPin);
    const adminAuth = await adminMemberAuthFields(adminPin, displayName);

    await setDoc(targetEventRef, {
      name,
      date,
      checkinAccessStartsAt: checkinAccessWindow.start,
      checkinAccessEndsAt: checkinAccessWindow.end,
      categories,
      statuses: DEFAULT_STATUSES,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: appState.user.uid
    });

    await setDoc(doc(appState.db, "events", eventId, "private", "security"), {
      checkinPinHash,
      checkinPinHashes: [checkinPinHash],
      checkinPinValue: checkinPin,
      checkinNamedPinHashes: [],
      checkinNamedPins: [],
      createdAt: serverTimestamp()
    });

    await setDoc(doc(appState.db, "events", eventId, "members", appState.user.uid), {
      uid: appState.user.uid,
      role: "admin",
      pinHash: adminAuth.pinHash,
      pinNameHash: adminAuth.pinNameHash,
      displayNameKey: adminAuth.displayNameKey,
      displayName,
      deviceLabel,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await addAuditForEvent(eventId, "event_create", { name }, { eventId, date }, { displayName, deviceLabel });
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
  const linked = hasLinkedRole();
  const roleLabel = roleDisplayLabel(appState.member?.role);
  const accessNotice = appState.member?.role === "checkin" && !isActiveCheckinStaff()
    ? `<p class="notice warning">${escapeHtml(checkinStaffAccessMessage())}</p>`
    : "";
  const eventContext = appState.eventId
    ? `<p class="small">Event-ID: <code>${escapeHtml(appState.eventId)}</code></p>${renderCheckinAccessLoginStatus()}`
    : `<p class="small">Ohne Event-Link öffnet Admin ein bekanntes Event. Check-in Staff braucht ein aktuell freigegebenes Check-in-Event.</p>`;

  return `
    <section class="card">
      <h2>Anmelden</h2>
      ${eventContext}
      ${linked ? `<p class="notice success">Angemeldet als <strong>${escapeHtml(roleLabel)}</strong>: ${escapeHtml(appState.member?.displayName || "")}${appState.member?.deviceLabel ? ` · ${escapeHtml(appState.member.deviceLabel)}` : ""}</p>` : `<p class="notice info">Melde dich an, um Gäste zu suchen und einzuchecken. Admins sehen zusätzlich Import, Backup, PINs und aktive Zugänge.</p>`}
      ${accessNotice}
      <form id="joinForm" class="grid two role-pin-form">
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
          <p class="field-help">Admin: Main-PIN mit Name Main oder persönlicher Admin-PIN. Check-in Staff: Event-spezifischer Check-in-PIN.</p>
        </div>
        <div class="form-row">
          <label for="memberName">Name</label>
          <input id="memberName" value="${escapeHtml(displayName)}" required placeholder="Admin: Main / Check-in: Eingang 1" />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" id="joinSubmitBtn" type="submit" disabled>Anmelden</button>
          <button class="btn-secondary" id="logoutBtn" type="button" ${linked ? "" : "disabled"}>${linked ? "Dieses Gerät abmelden" : "Abmelden"}</button>
        </div>
      </form>
      <div id="joinResult"></div>
    </section>
  `;
}

function renderCheckinAccessLoginStatus() {
  if (!appState.event) return "";
  const status = checkinAccessStatus(appState.event);
  return `<p class="notice ${status.type}"><strong>Check-in Staff:</strong> ${escapeHtml(status.detail)}</p>`;
}

async function renderAdminSettings() {
  if (!isAdmin()) {
    tabContent().innerHTML = `<section class="card"><h2>Kein Zugriff</h2><p>Admin-Rechte erforderlich.</p></section>`;
    return;
  }
  const tabAtStart = appState.currentTab;
  const isMaster = await refreshMasterAdminState({ rerender: false });
  if (appState.currentTab !== tabAtStart) return;
  tabContent().innerHTML = `
    ${renderAdminPinSection(isMaster)}
    ${renderLoggedInMembersSection()}
  `;
  if (isMaster) {
    bindAdminPinForm();
    void renderNamedPinList("admin");
  }
  void renderLoggedInMembersList();
}

function renderAdminPinSection(isMaster = false) {
  if (!isMaster) return "";

  return `
    <section class="card">
      <h2>Admin-PINs</h2>
      <form id="adminPinForm" class="grid two">
        <input id="adminPinEditId" type="hidden" />
        <div class="form-row">
          <label for="adminPinAuthPin">Bisheriger PIN oder Main-PIN</label>
          <input id="adminPinAuthPin" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="current-password" placeholder="alter PIN oder Main-PIN" />
        </div>
        <div class="form-row">
          <label for="adminPinName">Name Administrator:in</label>
          <input id="adminPinName" autocomplete="name" placeholder="Main oder z.B. Robert" />
        </div>
        <div class="form-row">
          <label for="adminPinNew">Neuer Admin-PIN</label>
          <input id="adminPinNew" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
        </div>
        <div class="form-row">
          <label for="adminPinConfirm">Neuer Admin-PIN wiederholen</label>
          <input id="adminPinConfirm" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="zur Kontrolle wiederholen" />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" id="adminPinSaveBtn" type="submit" disabled>PIN speichern</button>
          <button class="btn-secondary hidden" id="adminPinCancelBtn" type="button">Abbrechen</button>
        </div>
      </form>
      <div class="admin-section">
        <h3>Admin-PINs</h3>
        <div id="namedAdminPinList" class="pin-list"><p class="small">Lädt…</p></div>
      </div>
      <div id="adminPinResult"></div>
    </section>
  `;
}

function renderLoggedInMembersSection() {
  return `
    <section class="card">
      <h2>Aktive Anmeldungen</h2>
      <p class="small">Angemeldete Personen und Geräte prüfen, Gerätenamen korrigieren oder andere Anmeldungen vom Event abmelden.</p>
      <div id="loggedInMembersList" class="pin-list"><p class="small">Lädt…</p></div>
    </section>
  `;
}

function renderCheckinPinSection() {
  return `
    <section class="card">
      <h2>Check-in-PINs</h2>
      <p class="small">Gilt nur für <strong>${escapeHtml(appState.event?.name || appState.eventId || "aktueller Event")}</strong>. Andere Events behalten ihren eigenen Check-in-PIN.</p>
      <form id="checkinPinForm" class="grid two">
        <input id="checkinPinEditId" type="hidden" />
        <div class="form-row">
          <label for="checkinPinName">Name Mitarbeiter:in</label>
          <input id="checkinPinName" autocomplete="name" placeholder="frei lassen für allgemeinen PIN" />
        </div>
        <div class="form-row">
          <label for="checkinPinNew">Check-in-PIN</label>
          <input id="checkinPinNew" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="mindestens ${PIN_MIN_LENGTH} Zeichen" />
        </div>
        <div class="form-row">
          <label for="checkinPinConfirm">Check-in-PIN wiederholen</label>
          <input id="checkinPinConfirm" type="password" minlength="${PIN_MIN_LENGTH}" autocomplete="new-password" placeholder="zur Kontrolle wiederholen" />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" id="checkinPinSaveBtn" type="submit" disabled>PIN speichern</button>
          <button class="btn-secondary hidden" id="checkinPinCancelBtn" type="button">Abbrechen</button>
        </div>
      </form>
      <div class="admin-section">
        <div class="pin-list-header">
          <h3>Gespeicherte PINs</h3>
          <button class="btn-secondary" id="toggleCheckinPinsBtn" type="button">${appState.ui.showCheckinPins ? "PINs verbergen" : "PINs anzeigen"}</button>
        </div>
        <div id="checkinPinList" class="pin-list"><p class="small">Lädt…</p></div>
      </div>
      <div id="checkinPinResult"></div>
    </section>
  `;
}

function bindRolePinHandlers() {
  bindJoinForm();
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    void logoutCurrentMember();
  });
}

function bindJoinForm() {
  const form = document.getElementById("joinForm");
  const roleInput = document.getElementById("memberRole");
  const pinInput = document.getElementById("memberPin");
  const nameInput = document.getElementById("memberName");
  const button = document.getElementById("joinSubmitBtn");
  if (!form || !roleInput || !pinInput || !nameInput || !button) return;

  const updateButtonState = () => {
    const hasPin = pinInput.value.length >= PIN_MIN_LENGTH;
    const hasName = Boolean(nameInput.value.trim());
    button.disabled = !hasPin || !hasName;
  };

  updateButtonState();
  [roleInput, pinInput, nameInput].forEach((input) => {
    input.addEventListener("input", updateButtonState);
    input.addEventListener("change", updateButtonState);
  });
  form.addEventListener("submit", joinEventFromForm);
}

function bindAdminPinForm() {
  const form = document.getElementById("adminPinForm");
  const authInput = document.getElementById("adminPinAuthPin");
  const nameInput = document.getElementById("adminPinName");
  const newInput = document.getElementById("adminPinNew");
  const confirmInput = document.getElementById("adminPinConfirm");
  const button = document.getElementById("adminPinSaveBtn");
  const cancelButton = document.getElementById("adminPinCancelBtn");
  if (!form || !authInput || !nameInput || !newInput || !confirmInput || !button) return;

  updateAdminPinButtonState();
  [authInput, nameInput, newInput, confirmInput].forEach((input) => {
    input.addEventListener("input", updateAdminPinButtonState);
    input.addEventListener("change", updateAdminPinButtonState);
    input.addEventListener("keyup", updateAdminPinButtonState);
    input.addEventListener("paste", () => window.setTimeout(updateAdminPinButtonState, 0));
  });
  cancelButton?.addEventListener("click", resetAdminPinForm);
  form.addEventListener("submit", saveAdminPinFromForm);
}

function updateAdminPinButtonState() {
  const authInput = document.getElementById("adminPinAuthPin");
  const nameInput = document.getElementById("adminPinName");
  const pinInput = document.getElementById("adminPinNew");
  const confirmInput = document.getElementById("adminPinConfirm");
  const saveButton = document.getElementById("adminPinSaveBtn");
  if (!authInput || !nameInput || !pinInput || !confirmInput || !saveButton) return;

  const pin = pinInput.value;
  saveButton.disabled = authInput.value.length < PIN_MIN_LENGTH
    || pin.length < PIN_MIN_LENGTH
    || pin !== confirmInput.value;
  saveButton.textContent = "PIN speichern";
}

function resetAdminPinForm() {
  document.getElementById("adminPinForm")?.reset();
  const editInput = document.getElementById("adminPinEditId");
  const cancelButton = document.getElementById("adminPinCancelBtn");
  if (editInput) editInput.value = "";
  cancelButton?.classList.add("hidden");
  updateAdminPinButtonState();
}

function startAdminPinEdit(pin) {
  if (!pin) return;
  const editInput = document.getElementById("adminPinEditId");
  const authInput = document.getElementById("adminPinAuthPin");
  const nameInput = document.getElementById("adminPinName");
  const pinInput = document.getElementById("adminPinNew");
  const confirmInput = document.getElementById("adminPinConfirm");
  const cancelButton = document.getElementById("adminPinCancelBtn");
  const form = document.getElementById("adminPinForm");
  if (!editInput || !nameInput || !pinInput || !confirmInput) return;

  editInput.value = namedPinEditKey(pin);
  if (authInput) authInput.value = "";
  nameInput.value = pin.displayName || pin.displayNameKey || "";
  pinInput.value = "";
  confirmInput.value = "";
  cancelButton?.classList.remove("hidden");
  updateAdminPinButtonState();
  scrollBelowStickyHeader(form?.closest(".card") || form);
}

function scrollBelowStickyHeader(element) {
  if (!element) return;
  const headerHeight = document.querySelector(".app-header")?.getBoundingClientRect().height || 0;
  const targetTop = element.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
  window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
}

async function joinEventFromForm(event) {
  event.preventDefault();
  let result = document.getElementById("joinResult");
  result.innerHTML = `<p class="notice info">Verbinde…</p>`;

  const role = val("memberRole");
  const pin = val("memberPin");
  const displayName = val("memberName").trim() || (role === "admin" ? MAIN_ADMIN_NAME : "Check-in");
  const deviceLabel = appState.member?.deviceLabel || getLocalDeviceLabel();

  if (pin.length < PIN_MIN_LENGTH) {
    result.innerHTML = `<p class="notice warning">PIN ist zu kurz. Bitte den vollständigen PIN mit mindestens ${PIN_MIN_LENGTH} Zeichen eingeben.</p>`;
    return;
  }

  if (hasLinkedRole()) {
    const currentRole = roleDisplayLabel(appState.member?.role) || "Rolle";
    const currentName = appState.member?.displayName || "";
    const confirmed = window.confirm(`Dieses Gerät ist bereits als ${currentRole}${currentName ? `: ${currentName}` : ""} angemeldet.\n\nZuerst abmelden und dann neu anmelden?`);
    if (!confirmed) {
      result.innerHTML = `<p class="notice info">Anmeldung abgebrochen. Dieses Gerät bleibt angemeldet.</p>`;
      return;
    }

    result.innerHTML = `<p class="notice info">Dieses Gerät wird zuerst abgemeldet…</p>`;
    const loggedOut = await logoutCurrentMember("role");
    if (!loggedOut) return;
    result = document.getElementById("joinResult");
    if (result) result.innerHTML = `<p class="notice info">Abgemeldet. Verbinde neu…</p>`;
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
    const defaultEvent = await findFirstAvailableAdminEvent();
    if (defaultEvent) {
      appState.eventId = defaultEvent.id;
      appState.event = defaultEvent;
      localStorage.setItem("guestlist:lastEventId", appState.eventId);
      saveKnownEvent(appState.event);
      window.history.replaceState(null, "", urlWithEvent(appState.eventId));
      els.eventTitle.textContent = appState.event.name || "Gästeliste";
      setEventMeta();
    } else {
      result.innerHTML = `<p class="notice error">Kein bekanntes Event gefunden. Bitte Event-Link öffnen oder neues Event erstellen.</p>`;
      return;
    }
  }

  if (!appState.eventId) {
    result.innerHTML = `<p class="notice error">Kein Event aktiv.</p>`;
    return;
  }

  try {
    await verifyGlobalAdminPin(pin, displayName, deviceLabel, appState.eventId);
    await connectAdminToEvent(appState.eventId, pin, displayName, deviceLabel);

    localStorage.setItem("guestlist:memberName", displayName);
    saveAdminSession(pin, displayName);

    const memberSnap = await getDoc(memberRef(appState.user.uid));
    appState.member = { id: memberSnap.id, ...memberSnap.data() };
    await addAudit("member_login", { name: displayName }, { role: "admin", deviceLabel });
    await promptForDuplicateNamedMemberLogout(appState.eventId, appState.member);
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
    if (!isEventAccessWindowOpen(eventData)) continue;

    const authFields = await memberAuthFields(eventData.id, "checkin", pin, displayName);
    try {
      await setDoc(doc(appState.db, "events", eventData.id, "members", appState.user.uid), {
        uid: appState.user.uid,
        role: "checkin",
        pinHash: authFields.pinHash,
        pinNameHash: authFields.pinNameHash,
        displayNameKey: authFields.displayNameKey,
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
    localStorage.setItem("guestlist:lastEventId", eventData.id);
    clearAdminSession();
    saveKnownEvent(eventData);
    window.history.replaceState(null, "", urlWithEvent(eventData.id));
    await addAudit("member_login", { name: displayName }, { role: "checkin", deviceLabel });
    await promptForDuplicateNamedMemberLogout(eventData.id, appState.member);
    loadMainApp();
    return true;
  }

  return false;
}

function joinErrorMessage(error) {
  if (isPermissionError(error)) {
    return "Verbindung fehlgeschlagen. Prüfe Rolle, Name und PIN. Das Feld Gerät darf leer bleiben.";
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

async function verifyGlobalAdminPin(pin, displayName, deviceLabel, fallbackAuthorizingEventId = "") {
  await ensureGlobalAdminSecurity(pin, displayName, deviceLabel, fallbackAuthorizingEventId);
  const verifierEventIds = [
    GLOBAL_ADMIN_EVENT_ID || appState.eventId || fallbackAuthorizingEventId,
    fallbackAuthorizingEventId
  ].filter(Boolean);
  const connectedEventIds = [];

  for (const verifierEventId of [...new Set(verifierEventIds)]) {
    await connectAdminToEvent(verifierEventId, pin, displayName, deviceLabel);
    connectedEventIds.push(verifierEventId);
  }

  let securitySnap = null;
  try {
    securitySnap = await getDoc(adminSecurityRef());
  } catch (error) {
    if (isPermissionError(error)) return;
    throw error;
  }
  if (!securitySnap?.exists()) return;
  if ((await mainAdminPinInputMatchesSecurity(securitySnap.data(), pin)) && !isMainAdminName(displayName)) {
    await removeCurrentMemberFromEvents(connectedEventIds);
    throw new Error('Für den Main-PIN muss als Name "Main" eingegeben werden.');
  }
}

async function ensureGlobalAdminSecurity(pin, displayName, deviceLabel, fallbackAuthorizingEventId = "") {
  let securitySnap = null;
  try {
    securitySnap = await getDoc(adminSecurityRef());
  } catch (error) {
    if (isPermissionError(error)) return false;
    throw error;
  }
  if (securitySnap?.exists()) return true;

  const authorizingEventId = GLOBAL_ADMIN_EVENT_ID || fallbackAuthorizingEventId || appState.eventId || "";
  if (!authorizingEventId) {
    throw new Error("Globales Admin-Security-Dokument fehlt und kein bestehender Admin-Event ist konfiguriert.");
  }
  if (!isMainAdminName(displayName)) {
    throw new Error('Für den Main-PIN muss als Name "Main" eingegeben werden.');
  }
  await connectLegacyAdminToEvent(authorizingEventId, pin, displayName, deviceLabel);

  const adminPinHash = await hashAdminPin(pin);
  await setDoc(adminSecurityRef(), {
    authorizingEventId,
    createdByUid: appState.user.uid,
    adminPinHash,
    adminPinHashes: [adminPinHash],
    adminNamedPinHashes: [],
    adminNamedPins: [],
    createdAt: serverTimestamp()
  });
  return true;
}

async function removeCurrentMemberFromEvents(eventIds) {
  const uniqueIds = uniqueEventIds(eventIds);
  await Promise.all(uniqueIds.map(async (eventId) => {
    try {
      await deleteDoc(doc(appState.db, "events", eventId, "members", appState.user.uid));
    } catch (error) {
      if (!isPermissionError(error)) throw error;
    }
  }));
}

function setupErrorMessage(error) {
  const message = String(error?.message || error || "");
  if (/permission|insufficient/i.test(message)) {
    return "Main-PIN ist falsch oder die Firebase-Regeln blockieren die Prüfung.";
  }
  return message || "Unbekannter Fehler.";
}

function loadMainApp() {
  unsubscribeAll();
  appState.guestsLoaded = false;
  appState.adminNotes = {};
  appState.adminNotesLoaded = false;
  appState.ui.masterAdmin = null;
  appState.ui.masterAdminKind = "";
  if (isAdmin()) void ensureCurrentEventAccessWindowFields();
  renderShell();
  if (isAdmin()) void refreshMasterAdminState();
  subscribeCurrentEvent();
  subscribeCurrentMember();
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
      { id: "admin", label: "Event verwalten" },
      { id: "setup", label: "Events" },
      { id: "role", label: "Anmeldung" },
      { id: "adminSettings", label: "Admin" },
      { id: "log", label: "Audit" }
    ];
  }

  if (isActiveCheckinStaff()) {
    return [
      ...baseTabs,
      { id: "overview", label: "Übersicht" },
      { id: "role", label: "Anmeldung" }
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
  const role = roleDisplayLabel(appState.member?.role) || "User";
  ensureCurrentTabVisible();
  const tabClass = (tab) => appState.currentTab === tab ? "active" : "";
  const tabs = visibleTabs();
  const compactAdminTabs = isCompactAdminNav() ? adminMobileTabs(tabs) : [];
  const compactAdminTabIds = new Set(compactAdminTabs.map((tab) => tab.id));
  const navTabs = compactAdminTabs.length ? tabs.filter((tab) => !compactAdminTabIds.has(tab.id)) : tabs;
  els.eventTitle.textContent = appState.event?.name || "Gästeliste";
  setEventMeta();
  updateFooterStatus();

  render(`
    <div id="flash"></div>
    <div class="nav-row">
      <nav class="nav-tabs" id="navTabs">
        ${navTabs.map((tab) => `<button data-tab="${tab.id}" class="${tabClass(tab.id)}" type="button">${tab.label}</button>`).join("")}
        ${compactAdminTabs.length ? `
          <select id="mobileAdminTabs" class="mobile-admin-tabs ${compactAdminTabs.some((tab) => tab.id === appState.currentTab) ? "active" : ""}" aria-label="Admin-Bereich wechseln">
            <option value="">Admin…</option>
            ${compactAdminTabs.map((tab) => option(tab.id, tab.label, appState.currentTab)).join("")}
          </select>
        ` : ""}
      </nav>
      <button class="btn-secondary shell-auth-btn" id="shellAuthBtn" type="button">${hasLinkedRole() ? "Abmelden" : "Anmelden"}</button>
    </div>
    <section id="tabContent"></section>
  `);

  document.querySelectorAll("#navTabs button[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentTab = button.dataset.tab;
      renderShell();
      renderActiveTab();
    });
  });
  document.getElementById("mobileAdminTabs")?.addEventListener("change", (event) => {
    const tabId = event.target.value;
    if (!tabId) return;
    appState.currentTab = tabId;
    renderShell();
    renderActiveTab();
  });
  document.getElementById("shellAuthBtn")?.addEventListener("click", handleCheckinAuthButton);
}

function updateFooterStatus() {
  if (!els.footerText) return;
  const role = roleDisplayLabel(appState.member?.role) || "User";
  els.footerText.textContent = `${role} · ${appState.member?.displayName || ""} · ${appState.member?.deviceLabel || ""} · Event: ${appState.eventId || "-"}`;
}

function adminMobileTabs(tabs) {
  if (!isAdmin()) return [];
  const primaryTabIds = new Set(["checkin", "overview", "role"]);
  return tabs.filter((tab) => !primaryTabIds.has(tab.id));
}

function isCompactAdminNav() {
  return Boolean(window.matchMedia?.("(max-width: 820px)").matches);
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

function subscribeCurrentEvent() {
  if (!appState.eventId) return;
  if (appState.eventUnsubscribe) {
    appState.eventUnsubscribe();
    appState.eventUnsubscribe = null;
  }

  appState.eventUnsubscribe = onSnapshot(eventRef(), (snapshot) => {
    if (!snapshot.exists()) {
      renderEventNotFound(appState.eventId);
      return;
    }

    appState.event = { id: snapshot.id, ...snapshot.data() };
    saveKnownEvent(appState.event);
    els.eventTitle.textContent = appState.event.name || "Gästeliste";
    setEventMeta();

    if (!hasActiveEventAccess()) {
      unsubscribeGuestData();
      appState.guestsLoaded = false;
    } else {
      ensureGuestDataSubscriptions();
    }

    renderShell();
    renderActiveTab();
  }, (error) => {
    console.error(error);
    notify("Event-Daten konnten nicht aktualisiert werden.", "error");
  });
}

function ensureGuestDataSubscriptions() {
  if (!appState.guestUnsubscribe) subscribeGuests();
  if (isAdmin() && !appState.adminNotesUnsubscribe) subscribeAdminNotes();
}

function unsubscribeGuestData() {
  if (appState.guestUnsubscribe) {
    appState.guestUnsubscribe();
    appState.guestUnsubscribe = null;
  }
  if (appState.adminNotesUnsubscribe) {
    appState.adminNotesUnsubscribe();
    appState.adminNotesUnsubscribe = null;
  }
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

function subscribeCurrentMember() {
  if (!appState.eventId || !appState.user?.uid || !hasLinkedRole()) return;
  if (appState.memberUnsubscribe) {
    appState.memberUnsubscribe();
    appState.memberUnsubscribe = null;
  }

  appState.memberUnsubscribe = onSnapshot(memberRef(appState.user.uid), (snapshot) => {
    if (!snapshot.exists()) {
      if (hasLinkedRole()) finishLocalLogout("role", "Du wurdest abgemeldet.");
      return;
    }

    appState.member = { id: snapshot.id, ...snapshot.data() };
    if (isAdmin()) void refreshMasterAdminState({ rerender: false });
    renderShell();
    renderActiveTab();
  }, (error) => {
    console.error(error);
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
      <div class="checkin-filter-grid">
        <div class="form-row checkin-search-field">
          <label for="guestSearch">Suche nach Name oder Guest ID</label>
          <input id="guestSearch" class="input-large" value="${escapeHtml(appState.ui.search)}" placeholder="Name eintippen…" autocomplete="off" autofocus />
        </div>
        <div class="form-row checkin-status-field">
          <label for="statusFilter">Status</label>
          <select id="statusFilter">
            ${option("all", "Alle Status", appState.ui.statusFilter)}
            ${Object.entries(STATUS_META).map(([value, meta]) => option(value, meta.label, appState.ui.statusFilter)).join("")}
          </select>
        </div>
        <div class="form-row checkin-category-field">
          <label for="categoryFilter">Kategorie</label>
          <select id="categoryFilter">
            ${option("all", "Alle Kategorien", appState.ui.categoryFilter)}
            ${categories.map((cat) => option(cat, cat, appState.ui.categoryFilter)).join("")}
          </select>
        </div>
      </div>
      <p class="small">${filteredCount} Treffer · maximal 60 sichtbar. Für schnellen Eingang: mindestens 2–3 Buchstaben suchen.</p>
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
    void logoutCurrentMember("checkin");
    return;
  }

  appState.currentTab = "role";
  renderShell();
  renderActiveTab();
}

async function logoutCurrentMember(nextTab = "role") {
  const targetTab = typeof nextTab === "string" ? nextTab : "role";
  const memberDocRef = appState.eventId && appState.user?.uid ? memberRef(appState.user.uid) : null;
  const wasLinked = hasLinkedRole();

  if (memberDocRef && wasLinked && isOffline()) {
    notify("Abmelden nicht möglich: Gerät ist offline.", "error");
    return false;
  }

  if (memberDocRef && wasLinked) {
    try {
      await addAudit("member_logout", { name: appState.member?.displayName || "" }, {
        role: appState.member?.role || "",
        deviceLabel: appState.member?.deviceLabel || ""
      });
      await deleteDoc(memberDocRef);
    } catch (error) {
      console.error(error);
      notify(`Abmelden fehlgeschlagen: ${error.message || error}`, "error");
      return false;
    }
  }

  finishLocalLogout(targetTab);
  return true;
}

function finishLocalLogout(nextTab = "role", message = "") {
  clearAdminSession();
  unsubscribeAll();
  appState.adminNotes = {};
  appState.adminNotesLoaded = false;
  appState.guests = [];
  appState.guestsLoaded = false;
  appState.member = null;
  appState.ui.editingGuestId = "";
  appState.ui.checkinUndo = null;
  appState.currentTab = nextTab;
  renderShell();
  renderActiveTab();
  if (message) notify(message, "warning");
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
  const primaryCheckinClass = `${alreadyChecked ? "btn-secondary" : "btn-success"} btn-checkin-primary`;
  const primaryCheckinLabel = alreadyChecked ? "Bereits eingecheckt" : "Einchecken";
  const overrideCheckinButton = alreadyChecked && canOverride
    ? `<button class="btn-warning" data-action="checkin" data-guest-id="${escapeHtml(guest.id)}" data-force="1" ${disabled}>Check-in überschreiben</button>`
    : "";

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
      <div class="guest-primary-action">
        <button class="${primaryCheckinClass}" data-action="checkin" data-guest-id="${escapeHtml(guest.id)}" data-force="0" ${disabled}>${primaryCheckinLabel}</button>
      </div>
      <div class="guest-secondary-panels">
        <details class="guest-note-panel" ${staffInfo ? "open" : ""}>
          <summary>${staffInfo ? `${INFO_LABELS.staffToAll} bearbeiten` : `${INFO_LABELS.staffToAll} hinzufügen`}</summary>
          <div class="comment-box form-row">
            <label for="${commentId}">${INFO_LABELS.staffToAll}</label>
            <textarea id="${commentId}" data-comment-for="${escapeHtml(guest.id)}" placeholder="z.B. VIP-Band abgegeben, kommt mit Künstler…" ${disabled}>${escapeHtml(staffInfo)}</textarea>
            <button class="btn-secondary" data-action="save-comment" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Notiz speichern</button>
          </div>
        </details>
        ${isAdmin() ? `
          <details class="guest-admin-panel">
            <summary>Admin-Aktionen</summary>
            <p class="small">Gastdaten bearbeiten. Statusänderungen und Löschen sind separat geschützt.</p>
            <div class="actions guest-admin-actions">
              <button class="btn-secondary" data-action="edit-guest" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Gast bearbeiten</button>
            </div>
            <details class="guest-danger-panel">
              <summary>Status & Löschen</summary>
              <p class="small">Bewusste Korrekturen am Einlass. Diese Aktionen fragen zusätzlich nach Bestätigung.</p>
              <div class="actions guest-danger-actions">
                ${overrideCheckinButton}
                <button class="btn-warning" data-action="no-show" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Auf No Show setzen</button>
                <button class="btn-secondary" data-action="reset-open" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Auf Offen setzen</button>
                <button class="btn-danger" data-action="delete-guest" data-guest-id="${escapeHtml(guest.id)}" ${disabled}>Gast löschen</button>
              </div>
            </details>
          </details>
        ` : ""}
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

  let completed = false;
  let before = null;
  try {
    appState.checkInLocks.add(guestDocId);
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
    completed = true;
    setCheckinUndo(buildCheckinUndoState(guestDocId, before || guest, force));
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
    if (completed) resetSearchForNextCheckin();
  }
}

function resetSearchForNextCheckin() {
  if (appState.currentTab !== "checkin") return;
  appState.ui.search = "";
  renderCheckin();
}

function buildCheckinUndoState(guestDocId, before = {}, force = false) {
  const actorName = appState.member?.displayName || "Check-in";
  const actorDevice = appState.member?.deviceLabel || "";
  const previousStatus = before.status || "open";
  return {
    eventId: appState.eventId,
    guestDocId,
    guestId: before.guestId || "",
    guestName: before.name || "Gast",
    category: before.category || "",
    supportComment: before.supportComment || "",
    adminStaffInfo: before.adminStaffInfo || "",
    previousStatus,
    previousCheckedInAt: before.checkedInAt || null,
    previousCheckedInByUid: before.checkedInByUid || null,
    previousCheckedInByName: before.checkedInByName || null,
    previousCheckedInDevice: before.checkedInDevice || null,
    checkedInByUid: appState.user.uid,
    checkedInByName: actorName,
    checkedInDevice: actorDevice,
    force: Boolean(force)
  };
}

function setCheckinUndo(undo) {
  appState.ui.checkinUndo = undo;
  renderCheckinUndoNotice(undo);
}

function renderCheckinUndoNotice(undo) {
  const flash = document.getElementById("flash");
  if (!flash) return;
  const statusLabel = STATUS_META[undo.previousStatus]?.label || "Offen";
  flash.innerHTML = `
    <div class="notice success flash-message checkin-undo-message" data-checkin-undo-notice>
      <span><strong>${escapeHtml(undo.guestName)} eingecheckt.</strong> Rückgängig möglich bis zur nächsten Aktion. Vorheriger Status: ${escapeHtml(statusLabel)}.</span>
      <button class="btn-secondary" type="button" data-undo-checkin="${escapeHtml(undo.guestDocId)}">Rückgängig</button>
    </div>
  `;
  flash.querySelector("[data-undo-checkin]")?.addEventListener("click", () => {
    void undoLastCheckin();
  });
}

function clearCheckinUndo() {
  appState.ui.checkinUndo = null;
  const flash = document.getElementById("flash");
  if (flash?.querySelector("[data-checkin-undo-notice]")) flash.innerHTML = "";
}

function installCheckinUndoInvalidation() {
  const clearForAction = (event) => {
    if (!appState.ui.checkinUndo) return;
    const target = event.target;
    if (target?.closest?.("[data-checkin-undo-notice]")) return;
    clearCheckinUndo();
  };
  document.addEventListener("click", clearForAction, true);
  document.addEventListener("input", clearForAction, true);
  document.addEventListener("change", clearForAction, true);
  document.addEventListener("submit", clearForAction, true);
}

async function undoLastCheckin() {
  const undo = appState.ui.checkinUndo;
  if (!undo) return;
  if (!requireEventMember("Check-in rückgängig machen")) return;
  if (!requireOnline("Check-in rückgängig machen")) return;
  if (undo.eventId !== appState.eventId || undo.guestDocId !== findGuest(undo.guestDocId)?.id) {
    clearCheckinUndo();
    notify("Rückgängig ist nicht mehr verfügbar.", "warning");
    return;
  }

  const guestForAudit = {
    id: undo.guestDocId,
    guestId: undo.guestId,
    name: undo.guestName,
    category: undo.category
  };
  const restoredStatus = normalizeUndoStatus(undo.previousStatus);
  const restoreCheckedIn = restoredStatus === "checked_in";

  try {
    await runTransaction(appState.db, async (transaction) => {
      const ref = guestRef(undo.guestDocId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("UNDO_NOT_AVAILABLE");
      const current = snap.data();
      if (!checkinUndoStillMatches(current, undo)) throw new Error("UNDO_NOT_AVAILABLE");

      transaction.update(ref, {
        status: restoredStatus,
        checkedInAt: restoreCheckedIn ? undo.previousCheckedInAt : null,
        checkedInByUid: restoreCheckedIn ? undo.previousCheckedInByUid : null,
        checkedInByName: restoreCheckedIn ? undo.previousCheckedInByName : null,
        checkedInDevice: restoreCheckedIn ? undo.previousCheckedInDevice : null,
        updatedAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
        lastActionByName: appState.member.displayName || "Check-in",
        ...(isAdmin() ? staleGuestFieldDeletes() : {})
      });
    });

    await addAudit("check_in_undo", guestForAudit, {
      oldStatus: "checked_in",
      newStatus: restoredStatus,
      force: undo.force
    });
    clearCheckinUndo();
    notify(`Check-in rückgängig gemacht: ${undo.guestName}.`, "success");
  } catch (error) {
    if (error.message === "UNDO_NOT_AVAILABLE") {
      clearCheckinUndo();
      notify("Rückgängig nicht mehr möglich: Der Gast wurde inzwischen geändert.", "warning");
      return;
    }
    console.error(error);
    notify(`Rückgängig fehlgeschlagen: ${error.message || error}`, "error");
  }
}

function normalizeUndoStatus(status) {
  return DEFAULT_STATUSES.includes(status) ? status : "open";
}

function checkinUndoStillMatches(current, undo) {
  return current.status === "checked_in"
    && (current.checkedInByUid || "") === (undo.checkedInByUid || "")
    && (current.checkedInByName || "") === (undo.checkedInByName || "")
    && (current.checkedInDevice || "") === (undo.checkedInDevice || "")
    && (current.name || "") === (undo.guestName || "")
    && (current.category || "") === (undo.category || "")
    && (current.supportComment || "") === (undo.supportComment || "")
    && (current.adminStaffInfo || "") === (undo.adminStaffInfo || "");
}

async function saveGuestComment(guestDocId) {
  if (!requireEventMember("Notiz speichern")) return;
  if (!requireOnline("Notiz speichern")) return;
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
    notify("Notiz gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Notiz konnte nicht gespeichert werden: ${error.message || error}`, "error");
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
      newCategory: normalizedCategory,
      staffInfoChanged: supportComment !== staffInfoForGuest(guest),
      adminStaffInfoChanged: adminStaffInfo !== adminStaffInfoForGuest(guest),
      adminOnlyInfoChanged: internalNote !== adminOnlyInfoForGuest(guest)
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
  const currentStatus = guest.status || "open";
  if (currentStatus === status) {
    notify(`${guest.name} ist bereits ${STATUS_META[status]?.label || status}.`, "info");
    return;
  }
  if (status === "no_show" && !confirm(`${guest.name} auf No Show setzen?`)) return;
  if (status === "open" && !confirm(`${guest.name} wieder auf Offen setzen? Check-in-Daten werden dabei entfernt.`)) return;

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
      oldStatus: currentStatus,
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
      <p class="small">Zeigt alle Events aus Firebase, inklusive vergangener und versteckter Events. Gäste, Import und Export bleiben pro Event getrennt.</p>
      <div id="adminEventDirectory"><p class="small">Events werden geladen…</p></div>
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
      <h2>Event-Link für Check-in-Geräte</h2>
      <p class="small">Diese Links an Check-in-Geräte geben. Mitarbeiter:innen benötigen zusätzlich den Check-in-PIN. Nicht die Basis-URL verwenden.</p>
      ${renderCurrentEventLink()}
    </section>

    ${renderCheckinAccessSection()}

    ${renderCheckinPinSection()}

    <section class="card">
      <h2>Gäste importieren</h2>
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
      <h2>Backup & Export</h2>
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

    <div id="eventVisibilitySection"></div>
    <div id="eventDeleteSection"></div>
  `;

  bindEventNameForm();
  bindCheckinAccessForm();
  bindCheckinPinForm();
  bindCheckinPinVisibilityToggle();
  void renderNamedPinList("checkin");
  document.getElementById("previewImportBtn")?.addEventListener("click", previewCsvImport);
  document.getElementById("runImportBtn")?.addEventListener("click", runCsvImport);
  document.querySelectorAll("[data-export]").forEach((btn) => btn.addEventListener("click", () => exportGuests(btn.dataset.export)));
  document.getElementById("exportAuditBtn")?.addEventListener("click", exportAuditLog);
  void renderAdminEventDirectory();
  void renderEventVisibilitySection();
  void renderEventDeleteSection();
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

async function renderAdminEventDirectory() {
  const target = document.getElementById("adminEventDirectory");
  if (!target || !isAdmin()) return;

  await renderFirebaseEventDirectory(target, { fallbackToKnownEvents: true, showEmptyInactive: true });
}

async function renderFirebaseEventDirectory(target, options = {}) {
  try {
    const snapshot = await getDocs(collection(appState.db, "events"));
    const events = snapshot.docs
      .map((docSnap) => normalizeKnownEvent({ id: docSnap.id, ...docSnap.data() }))
      .filter(Boolean);

    target.innerHTML = renderEventGroups(events, appState.eventId, { showEmptyInactive: Boolean(options.showEmptyInactive) });
    bindKnownLinkCopyButtons(target);
    bindKnownEventButtons(target);
  } catch (error) {
    console.error(error);
    const fallbackEvents = options.fallbackToKnownEvents
      ? getKnownEvents().filter((event) => isAdmin() || !isEventHidden(event))
      : [];
    target.innerHTML = fallbackEvents.length
      ? `
        <p class="notice warning">Firebase-Eventliste konnte nicht geladen werden. Zeige nur lokal bekannte Events.</p>
        ${renderEventGroups(fallbackEvents, appState.eventId)}
      `
      : `<p class="notice error">Eventliste konnte nicht geladen werden. Bitte Berechtigungen und Firestore-Regeln prüfen.</p>`;
    bindKnownLinkCopyButtons(target);
    bindKnownEventButtons(target);
  }
}

function renderCheckinAccessSection() {
  const accessWindow = checkinStaffAccessWindow();
  const status = checkinAccessStatus(appState.event);
  const startValue = dateTimeLocalValue(accessWindow?.start);
  const endValue = dateTimeLocalValue(accessWindow?.end);

  return `
    <section class="card">
      <h2>Event-Zugang für Check-in Staff</h2>
      <p class="notice ${status.type}"><strong>${escapeHtml(status.label)}:</strong> ${escapeHtml(status.detail)}</p>
      <p class="small">Admins können Start und Ende jederzeit anpassen. Check-in Staff kann nur innerhalb dieses Zeitfensters den Event-Link nutzen, Gäste lesen und Check-ins schreiben.</p>
      <form id="checkinAccessForm" class="grid two">
        <div class="form-row">
          <label for="checkinAccessStartInput">Zugang ab</label>
          <input id="checkinAccessStartInput" type="datetime-local" value="${escapeHtml(startValue)}" required />
        </div>
        <div class="form-row">
          <label for="checkinAccessEndInput">Zugang bis</label>
          <input id="checkinAccessEndInput" type="datetime-local" value="${escapeHtml(endValue)}" required />
        </div>
        <div class="actions" style="grid-column:1/-1">
          <button class="btn-primary" id="checkinAccessSaveBtn" type="submit" disabled>Zeitfenster speichern</button>
        </div>
      </form>
      <div id="checkinAccessResult"></div>
    </section>
  `;
}

function bindCheckinAccessForm() {
  const form = document.getElementById("checkinAccessForm");
  const startInput = document.getElementById("checkinAccessStartInput");
  const endInput = document.getElementById("checkinAccessEndInput");
  const button = document.getElementById("checkinAccessSaveBtn");
  if (!form || !startInput || !endInput || !button) return;

  const accessWindow = checkinStaffAccessWindow();
  const originalStart = dateTimeLocalValue(accessWindow?.start);
  const originalEnd = dateTimeLocalValue(accessWindow?.end);
  const updateButtonState = () => {
    const start = parseDateTimeLocalValue(startInput.value);
    const end = parseDateTimeLocalValue(endInput.value);
    const unchanged = startInput.value === originalStart && endInput.value === originalEnd;
    button.disabled = !start || !end || start >= end || unchanged;
  };

  updateButtonState();
  startInput.addEventListener("input", updateButtonState);
  endInput.addEventListener("input", updateButtonState);
  form.addEventListener("submit", updateCheckinAccessWindowFromForm);
}

function bindCheckinPinForm() {
  const form = document.getElementById("checkinPinForm");
  const nameInput = document.getElementById("checkinPinName");
  const pinInput = document.getElementById("checkinPinNew");
  const confirmInput = document.getElementById("checkinPinConfirm");
  const button = document.getElementById("checkinPinSaveBtn");
  const cancelButton = document.getElementById("checkinPinCancelBtn");
  if (!form || !nameInput || !pinInput || !confirmInput || !button) return;

  updateCheckinPinButtonState();
  [nameInput, pinInput, confirmInput].forEach((input) => {
    input.addEventListener("input", updateCheckinPinButtonState);
    input.addEventListener("change", updateCheckinPinButtonState);
    input.addEventListener("keyup", updateCheckinPinButtonState);
    input.addEventListener("paste", () => window.setTimeout(updateCheckinPinButtonState, 0));
  });
  cancelButton?.addEventListener("click", resetCheckinPinForm);
  form.addEventListener("submit", saveCheckinPinFromForm);
}

function updateCheckinPinButtonState() {
  const pinInput = document.getElementById("checkinPinNew");
  const confirmInput = document.getElementById("checkinPinConfirm");
  const saveButton = document.getElementById("checkinPinSaveBtn");
  if (!pinInput || !confirmInput || !saveButton) return;

  const pin = pinInput.value;
  saveButton.disabled = pin.length < PIN_MIN_LENGTH || pin !== confirmInput.value;
  saveButton.textContent = "PIN speichern";
}

function resetCheckinPinForm() {
  document.getElementById("checkinPinForm")?.reset();
  const editInput = document.getElementById("checkinPinEditId");
  const cancelButton = document.getElementById("checkinPinCancelBtn");
  if (editInput) editInput.value = "";
  cancelButton?.classList.add("hidden");
  updateCheckinPinButtonState();
}

function startCheckinPinEdit(pin) {
  if (!pin) return;
  const editInput = document.getElementById("checkinPinEditId");
  const nameInput = document.getElementById("checkinPinName");
  const pinInput = document.getElementById("checkinPinNew");
  const confirmInput = document.getElementById("checkinPinConfirm");
  const cancelButton = document.getElementById("checkinPinCancelBtn");
  const form = document.getElementById("checkinPinForm");
  if (!editInput || !nameInput || !pinInput || !confirmInput) return;

  editInput.value = namedPinEditKey(pin);
  nameInput.value = pin.kind === "generic" ? "" : (pin.displayName || pin.displayNameKey || "");
  pinInput.value = "";
  confirmInput.value = "";
  cancelButton?.classList.remove("hidden");
  updateCheckinPinButtonState();
  scrollBelowStickyHeader(form?.closest(".card") || form);
}

function bindCheckinPinVisibilityToggle() {
  document.getElementById("toggleCheckinPinsBtn")?.addEventListener("click", () => {
    appState.ui.showCheckinPins = !appState.ui.showCheckinPins;
    updateCheckinPinVisibilityButton();
    void renderNamedPinList("checkin");
  });
}

function updateCheckinPinVisibilityButton() {
  const button = document.getElementById("toggleCheckinPinsBtn");
  if (button) button.textContent = appState.ui.showCheckinPins ? "PINs verbergen" : "PINs anzeigen";
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

async function updateCheckinAccessWindowFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Check-in-Staff-Zugang speichern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen den Check-in-Staff-Zugang ändern.", "warning");
    return;
  }

  const start = parseDateTimeLocalValue(val("checkinAccessStartInput"));
  const end = parseDateTimeLocalValue(val("checkinAccessEndInput"));
  const result = document.getElementById("checkinAccessResult");

  if (!start || !end) {
    if (result) result.innerHTML = `<p class="notice error">Bitte Start und Ende vollständig eingeben.</p>`;
    return;
  }
  if (start >= end) {
    if (result) result.innerHTML = `<p class="notice error">Das Ende muss nach dem Start liegen.</p>`;
    return;
  }

  const oldWindow = checkinStaffAccessWindow();
  const button = document.getElementById("checkinAccessSaveBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Speichert…";
  }
  if (result) result.innerHTML = `<p class="notice info">Zeitfenster wird gespeichert…</p>`;

  try {
    await updateDoc(eventRef(), {
      checkinAccessStartsAt: start,
      checkinAccessEndsAt: end,
      updatedAt: serverTimestamp()
    });
    appState.event = {
      ...appState.event,
      checkinAccessStartsAt: start,
      checkinAccessEndsAt: end
    };
    saveKnownEvent(appState.event);
    await addAudit("event_update", { name: appState.event?.name || "Event" }, {
      field: "checkinAccessWindow",
      oldStartsAt: formatTimestamp(oldWindow?.start),
      oldEndsAt: formatTimestamp(oldWindow?.end),
      newStartsAt: formatTimestamp(start),
      newEndsAt: formatTimestamp(end)
    });
    renderAdmin();
    notify("Check-in-Staff-Zugang gespeichert.", "success");
  } catch (error) {
    console.error(error);
    if (button) {
      button.disabled = false;
      button.textContent = "Zeitfenster speichern";
    }
    const message = error.message || String(error);
    if (result) result.innerHTML = `<p class="notice error">Zeitfenster konnte nicht gespeichert werden: ${escapeHtml(message)}</p>`;
    notify(`Zeitfenster konnte nicht gespeichert werden: ${message}`, "error");
  }
}

async function renderEventVisibilitySection() {
  const target = document.getElementById("eventVisibilitySection");
  if (!target || !isAdmin()) return;

  let isMaster = false;
  try {
    isMaster = await currentAdminIsMasterAdmin();
    appState.ui.masterAdmin = isMaster;
  } catch (error) {
    console.error(error);
    target.innerHTML = `<section class="card"><p class="notice error">Event-Sichtbarkeit konnte nicht geprüft werden.</p></section>`;
    return;
  }

  if (!document.body.contains(target)) return;
  if (!isMaster) {
    target.innerHTML = "";
    return;
  }

  const hidden = isEventHidden(appState.event);
  const hiddenKnownEvents = getKnownEvents()
    .filter((event) => isEventHidden(event) && event.id !== appState.eventId);

  target.innerHTML = `
    <section class="card">
      <h2>Event-Sichtbarkeit</h2>
      <p class="notice ${hidden ? "warning" : "info"}">
        <strong>${hidden ? "Versteckt" : "Sichtbar"}:</strong>
        ${hidden
          ? "Dieses Event ist aus normalen Eventlisten ausgeblendet. Nur Haupt-Admins können es wieder sichtbar machen."
          : "Dieses Event ist in normalen Eventlisten sichtbar."}
      </p>
      <div class="actions">
        <button class="${hidden ? "btn-primary" : "btn-warning"}" id="toggleEventVisibilityBtn" type="button">${hidden ? "Event wieder sichtbar machen" : "Event verstecken"}</button>
      </div>
      ${hiddenKnownEvents.length ? `
        <div class="admin-section">
          <h3>Versteckte bekannte Events</h3>
          <p class="small">Öffnen und prüfen. Sichtbarkeit ändern nur Master Admins.</p>
          <div class="event-switch-list">
            ${hiddenKnownEvents.map((event) => renderKnownEventCard(event, appState.eventId, { openLabel: "Öffnen" })).join("")}
          </div>
        </div>
      ` : ""}
      <div id="eventVisibilityResult"></div>
    </section>
  `;

  document.getElementById("toggleEventVisibilityBtn")?.addEventListener("click", toggleCurrentEventVisibility);
  bindKnownLinkCopyButtons(target);
  bindKnownEventButtons(target);
}

async function toggleCurrentEventVisibility() {
  if (!requireOnline("Event-Sichtbarkeit ändern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen Events verwalten.", "warning");
    return;
  }
  if (!(await requireMasterAdmin("Event-Sichtbarkeit ändern"))) return;

  const hidden = isEventHidden(appState.event);
  const eventName = appState.event?.name || appState.eventId;
  const nextHidden = !hidden;
  if (nextHidden && !window.confirm(`Event "${eventName}" aus normalen Eventlisten verstecken? Nur Haupt-Admins können es wieder sichtbar machen.`)) {
    return;
  }

  const button = document.getElementById("toggleEventVisibilityBtn");
  const result = document.getElementById("eventVisibilityResult");
  if (button) {
    button.disabled = true;
    button.textContent = nextHidden ? "Versteckt…" : "Macht sichtbar…";
  }
  if (result) result.innerHTML = `<p class="notice info">Event-Sichtbarkeit wird gespeichert…</p>`;

  const update = nextHidden
    ? {
        hidden: true,
        hiddenAt: serverTimestamp(),
        hiddenByUid: appState.user.uid,
        hiddenByName: appState.member?.displayName || "",
        updatedAt: serverTimestamp()
      }
    : {
        hidden: false,
        hiddenAt: deleteField(),
        hiddenByUid: deleteField(),
        hiddenByName: deleteField(),
        updatedAt: serverTimestamp()
      };

  try {
    await updateDoc(eventRef(), update);
    appState.event = {
      ...appState.event,
      hidden: nextHidden,
      ...(nextHidden
        ? { hiddenByUid: appState.user.uid, hiddenByName: appState.member?.displayName || "" }
        : {})
    };
    if (!nextHidden) {
      delete appState.event.hiddenAt;
      delete appState.event.hiddenByUid;
      delete appState.event.hiddenByName;
    }
    saveKnownEvent(appState.event);
    await addAudit("event_update", { name: eventName }, {
      field: "visibility",
      hidden: nextHidden
    });
    renderAdmin();
    notify(nextHidden ? "Event versteckt." : "Event wieder sichtbar.", "success");
  } catch (error) {
    console.error(error);
    const message = error.message || String(error);
    if (button) {
      button.disabled = false;
      button.textContent = hidden ? "Event wieder sichtbar machen" : "Event verstecken";
    }
    if (result) result.innerHTML = `<p class="notice error">Event-Sichtbarkeit konnte nicht gespeichert werden: ${escapeHtml(message)}</p>`;
    notify(`Event-Sichtbarkeit konnte nicht gespeichert werden: ${message}`, "error");
  }
}

async function renderEventDeleteSection() {
  const target = document.getElementById("eventDeleteSection");
  if (!target || !isAdmin()) return;

  let isMaster = false;
  let adminSecurityData = null;
  try {
    isMaster = await currentAdminIsMasterAdmin();
    if (isMaster) {
      const securitySnap = await getDoc(adminSecurityRef());
      adminSecurityData = securitySnap.exists() ? securitySnap.data() : null;
    }
  } catch (error) {
    console.error(error);
    target.innerHTML = `<section class="card danger-section"><p class="notice error">Event-Löschrechte konnten nicht geprüft werden.</p></section>`;
    return;
  }

  if (!document.body.contains(target)) return;

  if (!isMaster) {
    target.innerHTML = "";
    return;
  }

  const isAuthorizingEvent = adminSecurityData?.authorizingEventId === appState.eventId;
  const replacement = isAuthorizingEvent ? await findReplacementAuthorizingEvent(appState.eventId) : null;
  const cannotDeleteAuthorizingEvent = isAuthorizingEvent && !replacement;

  target.innerHTML = `
    <section class="card danger-section event-delete-card">
      <h2>Event löschen</h2>
      <p class="notice error"><strong>Master-only:</strong> Löscht dieses Event inklusive Gäste, Admin-Notizen, aktiver Anmeldungen, Event-PINs und Audit Log.</p>
      ${isAuthorizingEvent ? `<p class="notice warning">Dieses Event ist aktuell das Haupt-Admin-Anker-Event.${replacement ? ` Vor dem Löschen wird der Anker auf <strong>${escapeHtml(replacement.name || replacement.id)}</strong> umgestellt.` : " Lege zuerst ein anderes Event an, bevor dieses Event gelöscht werden kann."}</p>` : ""}
      <div class="actions">
        <button class="btn-danger" id="deleteEventBtn" type="button" ${cannotDeleteAuthorizingEvent ? "disabled" : ""}>Event endgültig löschen</button>
      </div>
      <div id="deleteEventResult"></div>
    </section>
  `;

  document.getElementById("deleteEventBtn")?.addEventListener("click", deleteCurrentEvent);
}

async function deleteCurrentEvent() {
  if (!requireOnline("Event löschen")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen Events verwalten.", "warning");
    return;
  }
  if (!(await requireMasterAdmin("Event löschen"))) return;

  const eventId = appState.eventId;
  const eventName = appState.event?.name || eventId;
  if (!eventId) return;

  if (!confirmByTypingEventId(`Du löschst das Event "${eventName}" inklusive Gäste, Admin-Notizen, aktiven Anmeldungen, Event-PINs und Audit Log.`)) return;
  const typed = window.prompt(`Letzte Bestätigung für "${eventName}".\nBitte exakt eingeben:\nEVENT LÖSCHEN`);
  if (typed === null) return;
  if (typed.trim() !== "EVENT LÖSCHEN") {
    notify("Abgebrochen: Bestätigungstext stimmte nicht. Es wurde nichts gelöscht.", "warning");
    return;
  }

  const button = document.getElementById("deleteEventBtn");
  const result = document.getElementById("deleteEventResult");
  if (button) {
    button.disabled = true;
    button.textContent = "Event wird gelöscht…";
  }
  if (result) result.innerHTML = `<p class="notice info">Event-Löschung wird vorbereitet…</p>`;

  let eventWasDeleted = false;
  try {
    const replacement = await prepareAdminSecurityForEventDelete(eventId);
    const counts = {};
    const updateStatus = (label, count) => {
      counts[label] = count;
      if (result) {
        result.innerHTML = `<p class="notice info">Löscht… Gäste: ${counts.guests || 0}, Admin-Notizen: ${counts.guestAdminNotes || 0}, Anmeldungen: ${counts.members || 0}, Audit: ${counts.auditLog || 0}</p>`;
      }
    };

    counts.auditLog = await deleteEventCollectionInChunks(eventId, "auditLog", (count) => updateStatus("auditLog", count));
    counts.guestAdminNotes = await deleteEventCollectionInChunks(eventId, "guestAdminNotes", (count) => updateStatus("guestAdminNotes", count));
    counts.guests = await deleteEventCollectionInChunks(eventId, "guests", (count) => updateStatus("guests", count));
    await deleteDoc(doc(appState.db, "events", eventId, "private", "security"));
    counts.members = await deleteEventMembersInChunks(eventId, (count) => updateStatus("members", count));
    await deleteDoc(doc(appState.db, "events", eventId));
    await deleteDoc(doc(appState.db, "events", eventId, "members", appState.user.uid)).catch((error) => {
      if (!isPermissionError(error)) throw error;
    });

    removeStoredKnownEvent(eventId);
    if (localStorage.getItem("guestlist:lastEventId") === eventId) {
      localStorage.removeItem("guestlist:lastEventId");
    }

    notify(`Event gelöscht: ${eventName}.`, "success");
    if (result) result.innerHTML = `<p class="notice success">Event gelöscht. Du wirst weitergeleitet…</p>`;
    eventWasDeleted = true;
    window.location.href = replacement ? urlWithEvent(replacement.id) : `${urlWithoutParams()}?setup=1`;
  } catch (error) {
    console.error(error);
    if (button) {
      button.disabled = false;
      button.textContent = "Event endgültig löschen";
    }
    const message = error.message || String(error);
    if (result) result.innerHTML = `<p class="notice error">Event konnte nicht gelöscht werden: ${escapeHtml(message)}</p>`;
    notify(`Event konnte nicht gelöscht werden: ${message}`, "error");
  }
}

async function prepareAdminSecurityForEventDelete(eventId) {
  const securitySnap = await getDoc(adminSecurityRef());
  const data = securitySnap.exists() ? securitySnap.data() : null;
  if (!data || data.authorizingEventId !== eventId) return null;

  const replacement = await findReplacementAuthorizingEvent(eventId);
  if (!replacement) {
    throw new Error("Dieses Event ist das Haupt-Admin-Anker-Event. Lege oder öffne zuerst ein anderes Event, bevor du dieses Event löschst.");
  }

  const session = getAdminSession();
  const reconnectPin = session?.pin || "";
  let memberSnap = await getMemberSnapForEvent(replacement.id);
  if (!memberSnap.exists()) {
    if (!reconnectPin) {
      throw new Error("Für das Ersatz-Event ist eine erneute Haupt-Admin-Anmeldung nötig.");
    }
    await connectAdminToEvent(replacement.id, reconnectPin, session?.displayName || appState.member?.displayName || MAIN_ADMIN_NAME, appState.member?.deviceLabel || "");
    memberSnap = await getMemberSnapForEvent(replacement.id);
  }
  if (!memberSnap.exists() || !adminMasterHashMatches(data, memberSnap.data()?.pinHash, memberSnap.data()?.pinNameHash)) {
    throw new Error("Das Ersatz-Event hat keine gültige Haupt-Admin-Sitzung.");
  }

  await updateDoc(adminSecurityRef(), {
    authorizingEventId: replacement.id,
    updatedAt: serverTimestamp()
  });
  return replacement;
}

async function findReplacementAuthorizingEvent(excludedEventId) {
  const candidates = getKnownEvents().filter((event) => event.id && event.id !== excludedEventId);
  for (const candidate of candidates) {
    try {
      const eventSnap = await getDoc(doc(appState.db, "events", candidate.id));
      if (eventSnap.exists()) return { id: eventSnap.id, ...eventSnap.data() };
    } catch (error) {
      if (!isPermissionError(error)) console.error(error);
    }
  }
  return null;
}

async function deleteEventCollectionInChunks(eventId, collectionName, onProgress) {
  const chunkSize = 225;
  let deleted = 0;
  while (true) {
    const snapshot = await getDocs(query(collection(appState.db, "events", eventId, collectionName), limit(chunkSize)));
    if (snapshot.empty) break;
    const batch = writeBatch(appState.db);
    snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snapshot.docs.length;
    onProgress?.(deleted);
    if (snapshot.docs.length < chunkSize) break;
  }
  return deleted;
}

async function deleteEventMembersInChunks(eventId, onProgress) {
  const chunkSize = 225;
  let deleted = 0;
  while (true) {
    const snapshot = await getDocs(query(collection(appState.db, "events", eventId, "members"), limit(chunkSize)));
    const docs = snapshot.docs.filter((docSnap) => docSnap.id !== appState.user.uid);
    if (!snapshot.empty && docs.length) {
      const batch = writeBatch(appState.db);
      docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
      deleted += docs.length;
      onProgress?.(deleted);
    }
    if (snapshot.empty || snapshot.docs.length < chunkSize || docs.length === 0) break;
  }
  return deleted;
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
    const filters = auditExportFilters();
    if (filters.from && filters.to && localDateStart(filters.from) > localDateEnd(filters.to)) {
      notify("Audit-Export nicht möglich: Zeitraum ist ungültig.", "warning");
      return;
    }
    const entries = await fetchAuditEntriesForExport(filters);
    const csvRows = entries.map(auditEntryToCsvRow);
    const fileName = `${eventFileStem()}-audit-log-${todayStamp()}.csv`;
    downloadCsv(fileName, toCsv(csvRows, ";", AUDIT_EXPORT_HEADERS));
    await addAudit("audit_export", { name: "Audit Log Export" }, {
      count: csvRows.length,
      filters: auditExportFilterSummary(filters),
      pageSize: AUDIT_EXPORT_PAGE_SIZE
    });
    const message = `Audit-Log exportiert: ${fileName} · ${csvRows.length} Einträge · ${formatTimestamp(new Date())}`;
    showBackupStatus(message, "success");
    notify(message, "success");
  } catch (error) {
    console.error(error);
    notify(`Audit-Log konnte nicht exportiert werden: ${error.message || error}`, "error");
  }
}

function auditExportFilters() {
  return {
    from: val("auditExportFrom").trim(),
    to: val("auditExportTo").trim(),
    action: val("auditExportAction").trim() || "all",
    actor: val("auditExportActor").trim()
  };
}

async function fetchAuditEntriesForExport(filters) {
  const entries = [];
  let cursor = null;
  while (entries.length < AUDIT_EXPORT_MAX_ENTRIES) {
    const constraints = auditExportQueryConstraints(filters, cursor);
    const snapshot = await getDocs(query(
      collection(appState.db, "events", appState.eventId, "auditLog"),
      ...constraints
    ));
    if (snapshot.empty) break;

    snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((entry) => auditEntryMatchesClientFilters(entry, filters))
      .forEach((entry) => entries.push(entry));

    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < AUDIT_EXPORT_PAGE_SIZE) break;
  }
  return entries.slice(0, AUDIT_EXPORT_MAX_ENTRIES);
}

function auditExportQueryConstraints(filters, cursor) {
  const constraints = [];
  const fromDate = localDateStart(filters.from);
  const toDate = localDateEnd(filters.to);
  if (fromDate) constraints.push(where("createdAt", ">=", Timestamp.fromDate(fromDate)));
  if (toDate) constraints.push(where("createdAt", "<=", Timestamp.fromDate(toDate)));
  constraints.push(orderBy("createdAt", "desc"));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(AUDIT_EXPORT_PAGE_SIZE));
  return constraints;
}

function auditEntryMatchesClientFilters(entry, filters) {
  const actionMatches = !filters.action || filters.action === "all" || entry.action === filters.action;
  const actorFilter = normalizeForSearch(filters.actor || "");
  const actorMatches = !actorFilter || normalizeForSearch(`${entry.actorName || ""} ${entry.deviceLabel || ""}`).includes(actorFilter);
  return actionMatches && actorMatches;
}

function auditEntryToCsvRow(entry) {
  return {
    "Zeit": formatTimestamp(entry.createdAt),
    "Aktion": labelForAction(entry.action),
    "Guest ID": entry.guestId || "",
    "Gast": entry.guestName || "",
    "Kategorie": entry.category || "",
    "Mitarbeiter": entry.actorName || "",
    "Gerät": entry.deviceLabel || "",
    "Details": entry.details ? JSON.stringify(entry.details) : ""
  };
}

function auditExportFilterSummary(filters) {
  return {
    from: filters.from || "",
    to: filters.to || "",
    action: filters.action || "all",
    actor: filters.actor || ""
  };
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

async function saveCheckinPinFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Check-in-PIN speichern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen PINs ändern.", "warning");
    return;
  }

  const result = document.getElementById("checkinPinResult");
  const editId = val("checkinPinEditId");
  const displayName = val("checkinPinName").trim();
  const pin = val("checkinPinNew");
  const pinConfirm = val("checkinPinConfirm");
  if (pin.length < PIN_MIN_LENGTH) {
    notify(`Check-in-PIN muss mindestens ${PIN_MIN_LENGTH} Zeichen haben.`, "warning");
    return;
  }
  if (pin !== pinConfirm) {
    notify("Check-in-PIN und Wiederholung stimmen nicht überein.", "warning");
    return;
  }
  if (editId && editId !== GENERAL_CHECKIN_PIN_ID && !displayName) {
    notify("Name ist Pflicht.", "warning");
    return;
  }
  if (editId === GENERAL_CHECKIN_PIN_ID && displayName) {
    notify("Für den allgemeinen Check-in-PIN das Namensfeld leer lassen.", "warning");
    return;
  }

  try {
    const isGeneralPin = editId === GENERAL_CHECKIN_PIN_ID || !displayName;
    if (isGeneralPin) {
      const securityRef = doc(appState.db, "events", appState.eventId, "private", "security");
      const securitySnap = await getDoc(securityRef);
      if (!securitySnap.exists()) throw new Error("Security-Dokument fehlt.");
      const checkinPinHash = await hashPin(appState.eventId, "checkin", pin);
      await updateDoc(securityRef, {
        checkinPinHash,
        checkinPinHashes: [checkinPinHash],
        checkinPinValue: pin,
        updatedAt: serverTimestamp()
      });
      await addAudit("pins_reset", { name: "Check-in-PIN" }, { scope: "current_event", mode: "general" });
    } else if (editId) {
      await replaceNamedPinInEvent(appState.eventId, "checkin", editId, pin, displayName);
      await addAudit("pins_reset", { name: "Check-in-PIN" }, { scope: "current_event", mode: "edit_named", displayName });
    } else {
      await appendNamedPinToEvent(appState.eventId, "checkin", pin, displayName);
      await addAudit("pins_reset", { name: "Check-in-PIN" }, { scope: "current_event", mode: "named", displayName });
    }

    resetCheckinPinForm();
    await renderNamedPinList("checkin");
    const message = isGeneralPin
      ? "Allgemeiner Check-in-PIN gespeichert."
      : (editId ? "Benannter Check-in-PIN geändert." : "Benannter Check-in-PIN gespeichert.");
    if (result) result.innerHTML = `<p class="notice success">${escapeHtml(message)}</p>`;
    notify(message, "success");
  } catch (error) {
    console.error(error);
    notify(`Check-in-PIN konnte nicht gespeichert werden: ${error.message || error}`, "error");
    if (result) result.innerHTML = `<p class="notice error">${escapeHtml(error.message || error)}</p>`;
  }
}

async function saveAdminPinFromForm(event) {
  event.preventDefault();
  if (!requireOnline("Admin-PIN speichern")) return;
  if (!isAdmin()) {
    notify("Nur Admins dürfen PINs ändern.", "warning");
    return;
  }
  if (!(await requireMasterAdmin("Admin-PIN verwalten"))) return;

  const result = document.getElementById("adminPinResult");
  const authPin = val("adminPinAuthPin");
  const namedDisplayName = val("adminPinName").trim();
  const normalizedAdminName = normalizeDisplayNameKey(namedDisplayName);
  const newPin = val("adminPinNew");
  const newPinConfirm = val("adminPinConfirm");
  const editId = val("adminPinEditId");
  const isEdit = Boolean(editId);
  const isMainEdit = editId === MAIN_ADMIN_PIN_ID;
  const isMainName = normalizedAdminName === MAIN_ADMIN_NAME_KEY;
  const isMainTarget = isMainName && (!isEdit || isMainEdit);
  if (!normalizedAdminName) {
    notify('Name ist Pflicht. Für den Main-PIN bitte "Main" eingeben.', "warning");
    return;
  }
  if (isMainEdit && !isMainName) {
    notify('Für den Main-PIN muss der Name "Main" bleiben.', "warning");
    return;
  }
  if (isEdit && !isMainEdit && isMainName) {
    notify('"Main" ist für den Main-PIN reserviert. Bitte abbrechen oder einen anderen Namen verwenden.', "warning");
    return;
  }
  if (authPin.length < PIN_MIN_LENGTH || newPin.length < PIN_MIN_LENGTH) {
    notify(`Admin-PIN muss mindestens ${PIN_MIN_LENGTH} Zeichen haben.`, "warning");
    return;
  }
  if (newPin !== newPinConfirm) {
    notify("Neuer Admin-PIN und Wiederholung stimmen nicht überein.", "warning");
    return;
  }
  const displayName = appState.member?.displayName || MAIN_ADMIN_NAME;
  const deviceLabel = appState.member?.deviceLabel || "";
  try {
    if (result) result.innerHTML = `<p class="notice info">Admin-PIN wird geprüft…</p>`;

    const securitySnap = await getDoc(adminSecurityRef());
    if (!securitySnap.exists()) {
      notify("Globales Admin-Security-Dokument fehlt.", "error");
      return;
    }
    const securityData = securitySnap.data();
    const mainPinMatches = await mainAdminPinInputMatchesSecurity(securityData, authPin);
    const namedAdminPins = namedPinsFromSecurity(securityData, "admin");

    if (isMainTarget) {
      if (!mainPinMatches) {
        const message = "Bisheriger Main-PIN ist falsch.";
        notify(message, "warning");
        if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
        return;
      }
      if (authPin === newPin) {
        const message = "Der neue Main-PIN muss anders sein.";
        notify(message, "warning");
        if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
        return;
      }
      const collidingNamedPin = await findNamedAdminPinUsingLiteralPin(namedAdminPins, newPin);
      if (collidingNamedPin) {
        const message = adminPinCollisionMessage(collidingNamedPin);
        notify(message, "warning");
        if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
        return;
      }

      const adminPinHash = await hashAdminPin(newPin);
      const anchorEventId = securityData.authorizingEventId || GLOBAL_ADMIN_EVENT_ID || appState.eventId;
      await updateDoc(adminSecurityRef(), {
        adminPinHash,
        adminPinHashes: [adminPinHash],
        updatedAt: serverTimestamp()
      });
      for (const eventId of uniqueEventIds([anchorEventId, appState.eventId])) {
        await connectAdminToEvent(eventId, newPin, MAIN_ADMIN_NAME, deviceLabel);
      }

      saveAdminSession(newPin, MAIN_ADMIN_NAME);
      const memberSnap = await getMemberSnapForEvent(appState.eventId);
      if (memberSnap.exists()) appState.member = { id: memberSnap.id, ...memberSnap.data() };
      appState.ui.masterAdmin = await currentAdminIsMasterAdmin();
      updateFooterStatus();
      await addAudit("admin_pin_reset", { name: "Admin-PIN" }, { scope: "global_admin" });
      resetAdminPinForm();
      renderImmediateAdminAccessCopy(result, {
        message: "Main-PIN gespeichert.",
        displayName: MAIN_ADMIN_NAME,
        pin: newPin
      });
      notify("Main-PIN gespeichert.", "success");
      return;
    }

    if (await mainAdminPinInputMatchesSecurity(securityData, newPin)) {
      const message = "Dieser PIN ist bereits der Main-PIN. Bitte einen anderen PIN wählen.";
      notify(message, "warning");
      if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
      return;
    }
    const collidingNamedPin = await findNamedAdminPinUsingLiteralPin(namedAdminPins, newPin, isEdit ? editId : "");
    if (collidingNamedPin) {
      const message = adminPinCollisionMessage(collidingNamedPin);
      notify(message, "warning");
      if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
      return;
    }

    let existingNamedPin = null;
    if (isEdit) {
      existingNamedPin = namedAdminPins.find((pin) => namedPinEditKey(pin) === editId);
      if (!existingNamedPin) throw new Error("Der benannte Admin-PIN wurde nicht gefunden.");
      const oldNamedPinMatches = await namedAdminPinInputMatchesPin(existingNamedPin, authPin);
      if (!mainPinMatches && !oldNamedPinMatches) {
        const message = "Bisheriger Admin-PIN oder Main-PIN ist falsch.";
        notify(message, "warning");
        if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
        return;
      }
      const editsCurrentNamedAdmin = isCurrentNamedAdminPin(existingNamedPin);
      await replaceNamedPinInEvent("", "admin", editId, newPin, namedDisplayName);
      if (editsCurrentNamedAdmin) {
        await reconnectNamedAdminSessionAfterPinChange(securityData, newPin, namedDisplayName);
      }
    } else {
      if (!mainPinMatches) {
        const message = "Zum Erstellen bitte den Main-PIN eingeben.";
        notify(message, "warning");
        if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
        return;
      }
      await appendNamedPinToEvent("", "admin", newPin, namedDisplayName, createNamedPinId());
    }
    await addAudit("admin_pin_reset", { name: "Admin-PIN" }, {
      scope: "global_admin",
      mode: isEdit ? "edit_named" : "named",
      displayName: namedDisplayName
    });
    resetAdminPinForm();
    await renderNamedPinList("admin");
    renderImmediateAdminAccessCopy(result, {
      message: isEdit ? "Benannter Admin-PIN geändert." : "Benannter Admin-PIN gespeichert.",
      displayName: namedDisplayName,
      pin: newPin
    });
    notify(isEdit ? "Benannter Admin-PIN geändert." : "Benannter Admin-PIN gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Admin-PIN konnte nicht gespeichert werden: ${error.message || error}`, "error");
    if (result) result.innerHTML = `<p class="notice error">${escapeHtml(error.message || error)}</p>`;
  }
}

async function appendNamedPinToEvent(eventId, role, pin, displayName, pinId = createNamedPinId()) {
  const { hashField, listField } = namedPinConfig(role);
  const scopeId = role === "admin" ? ADMIN_PIN_SCOPE : eventId;
  const entry = await namedPinEntry(scopeId, role, pin, displayName, pinId);
  const targetRef = role === "admin"
    ? adminSecurityRef()
    : doc(appState.db, "events", eventId, "private", "security");
  await updateDoc(targetRef, {
    [hashField]: arrayUnion(entry.pinNameHash),
    [listField]: arrayUnion(entry),
    updatedAt: serverTimestamp()
  });
  return entry;
}

async function replaceNamedPinInEvent(eventId, role, editId, pin, displayName) {
  const config = namedPinConfig(role);
  const securityRef = role === "admin"
    ? adminSecurityRef()
    : doc(appState.db, "events", eventId, "private", "security");
  const securitySnap = await getDoc(securityRef);
  if (!securitySnap.exists()) throw new Error("Security-Dokument fehlt.");

  const scopeId = role === "admin" ? ADMIN_PIN_SCOPE : eventId;
  const data = securitySnap.data();
  const pins = namedPinsFromSecurity(data, role);
  const existing = pins.find((existingPin) => namedPinEditKey(existingPin) === editId);
  if (!existing) throw new Error("Der benannte PIN wurde nicht gefunden.");

  const entry = await namedPinEntry(scopeId, role, pin, displayName, existing.id || createNamedPinId());
  if (role === "admin" && existing.masterAdmin === true) entry.masterAdmin = true;
  const replacedHashes = new Set(pins
    .filter((existingPin) => namedPinEditKey(existingPin) === editId)
    .map((existingPin) => existingPin.pinNameHash));
  const nextPins = pins.map((existingPin) => {
    if (namedPinEditKey(existingPin) === editId) return entry;
    const { index, ...pinData } = existingPin;
    return pinData;
  });
  const existingHashes = Array.isArray(data[config.hashField]) ? data[config.hashField] : [];
  const nextHashes = existingHashes
    .filter((hash) => !replacedHashes.has(hash))
    .concat(entry.pinNameHash);
  const update = {
    [config.listField]: nextPins,
    [config.hashField]: nextHashes,
    updatedAt: serverTimestamp()
  };

  if (role === "admin") {
    const existingMasterHashes = Array.isArray(data[ADMIN_MASTER_NAMED_HASHES_FIELD]) ? data[ADMIN_MASTER_NAMED_HASHES_FIELD] : [];
    const nextMasterHashes = existingMasterHashes.filter((hash) => !replacedHashes.has(hash));
    if (existing.masterAdmin === true) nextMasterHashes.push(entry.pinNameHash);
    if (nextMasterHashes.length) {
      update[ADMIN_MASTER_NAMED_HASHES_FIELD] = nextMasterHashes;
    } else if (dataHasAdminMasterNamedHashes(data)) {
      update[ADMIN_MASTER_NAMED_HASHES_FIELD] = deleteField();
    }
  }

  await updateDoc(securityRef, update);
  return entry;
}

async function namedPinEntry(eventId, role, pin, displayName, pinId) {
  const entry = {
    id: pinId,
    displayName: displayName.trim(),
    displayNameKey: normalizeDisplayNameKey(displayName),
    pinNameHash: await hashNamedPin(eventId, role, pin, displayName)
  };
  if (role === "checkin") entry.pinValue = pin;
  return entry;
}

function createNamedPinId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function namedPinConfig(role) {
  if (role === "admin") {
    return {
      hashField: "adminNamedPinHashes",
      listField: "adminNamedPins",
      listId: "namedAdminPinList",
      resultId: "adminPinResult",
      label: "Admin-PIN",
      empty: "Keine Admin-PINs gespeichert."
    };
  }
  return {
    hashField: "checkinNamedPinHashes",
    listField: "checkinNamedPins",
    listId: "checkinPinList",
    resultId: "checkinPinResult",
    label: "Check-in-PIN",
    empty: "Keine PINs gespeichert."
  };
}

async function renderNamedPinList(role) {
  if (!isAdmin()) return;
  const config = namedPinConfig(role);
  const target = document.getElementById(config.listId);
  if (!target) return;

  const eventId = role === "admin" ? "" : (appState.eventId || GLOBAL_ADMIN_EVENT_ID);
  if (role !== "admin" && !eventId) {
    target.innerHTML = `<p class="small">Kein Event aktiv.</p>`;
    return;
  }

  try {
    const securitySnap = await getDoc(role === "admin"
      ? adminSecurityRef()
      : doc(appState.db, "events", eventId, "private", "security"));
    const securityData = securitySnap.exists() ? securitySnap.data() : {};
    const pins = role === "checkin"
      ? checkinPinsFromSecurity(securityData)
      : adminPinsFromSecurity(securityData);
    const canEditAdminPins = role === "admin" && appState.ui.masterAdmin === true;
    const canEditCheckinPins = role === "checkin" && isAdmin();
    target.innerHTML = pins.length ? pins.map((pin, listIndex) => `
      <div class="pin-list-row">
        <span>
          <strong>${escapeHtml(pin.displayName || pin.displayNameKey || "Ohne Name")}</strong>
          ${role === "checkin" ? `<span class="small pin-value">${escapeHtml(checkinPinDisplayValue(pin))}</span>` : ""}
          ${role === "admin" && pin.masterAdmin ? `<span class="badge info">Master Admin</span>` : ""}
        </span>
        <span class="pin-list-actions">
          ${role === "checkin" ? `<button class="btn-secondary" type="button" data-copy-checkin-pin="${listIndex}" ${pin.pinValue ? "" : "disabled"}>Kopieren</button>` : ""}
          ${canEditCheckinPins ? `<button class="btn-secondary" type="button" data-edit-checkin-pin="${listIndex}">PIN ändern</button>` : ""}
          ${canEditAdminPins ? `<button class="btn-secondary" type="button" data-edit-named-admin-pin="${listIndex}">PIN ändern</button>` : ""}
          ${canEditAdminPins && pin.kind !== "main" ? `<button class="${pin.masterAdmin ? "btn-warning" : "btn-secondary"}" type="button" data-toggle-named-admin-master="${listIndex}">${pin.masterAdmin ? "Master entziehen" : "Master berechtigen"}</button>` : ""}
          ${pin.kind === "generic" || pin.kind === "main" ? "" : `<button class="btn-danger" type="button" data-delete-named-pin="${escapeHtml(role)}" data-pin-index="${listIndex}">PIN löschen</button>`}
        </span>
      </div>
    `).join("") : `<p class="small">${config.empty}</p>`;

    target.querySelectorAll("[data-copy-checkin-pin]").forEach((button) => {
      const pin = pins[Number(button.dataset.copyCheckinPin)];
      button.addEventListener("click", () => {
        void copyCheckinPinForStaff(pin);
      });
    });
    target.querySelectorAll("[data-edit-checkin-pin]").forEach((button) => {
      const pin = pins[Number(button.dataset.editCheckinPin)];
      button.addEventListener("click", () => startCheckinPinEdit(pin));
    });
    target.querySelectorAll("[data-edit-named-admin-pin]").forEach((button) => {
      const pin = pins[Number(button.dataset.editNamedAdminPin)];
      button.addEventListener("click", () => startAdminPinEdit(pin));
    });
    target.querySelectorAll("[data-toggle-named-admin-master]").forEach((button) => {
      const pin = pins[Number(button.dataset.toggleNamedAdminMaster)];
      button.addEventListener("click", () => toggleNamedAdminMaster(pin));
    });
    target.querySelectorAll("[data-delete-named-pin]").forEach((button) => {
      const pin = pins[Number(button.dataset.pinIndex)];
      button.addEventListener("click", () => deleteNamedPin(role, pin));
    });
    updateCheckinPinVisibilityButton();
  } catch (error) {
    console.error(error);
    target.innerHTML = `<p class="notice error">PINs konnten nicht geladen werden.</p>`;
  }
}

function adminPinsFromSecurity(data) {
  return [
    {
      kind: "main",
      id: MAIN_ADMIN_PIN_ID,
      displayName: MAIN_ADMIN_NAME,
      displayNameKey: MAIN_ADMIN_NAME_KEY,
      pinNameHash: "",
      index: -1,
      masterAdmin: true
    },
    ...namedPinsFromSecurity(data, "admin").map((pin) => ({ ...pin, kind: "named" }))
  ];
}

function namedPinsFromSecurity(data, role) {
  const listField = namedPinConfig(role).listField;
  const pins = Array.isArray(data?.[listField]) ? data[listField] : [];
  const masterNamedHashes = new Set(Array.isArray(data?.[ADMIN_MASTER_NAMED_HASHES_FIELD]) ? data[ADMIN_MASTER_NAMED_HASHES_FIELD] : []);
  return pins
    .filter((pin) => pin && typeof pin === "object" && typeof pin.pinNameHash === "string")
    .map((pin, index) => {
      const entry = {
        id: typeof pin.id === "string" ? pin.id : "",
        displayName: typeof pin.displayName === "string" ? pin.displayName : "",
        displayNameKey: typeof pin.displayNameKey === "string" ? pin.displayNameKey : "",
        pinNameHash: pin.pinNameHash,
        index
      };
      if (role === "checkin") entry.pinValue = typeof pin.pinValue === "string" ? pin.pinValue : "";
      if (role === "admin") entry.masterAdmin = pin.masterAdmin === true || masterNamedHashes.has(pin.pinNameHash);
      return entry;
    });
}

function dataHasAdminMasterNamedHashes(data) {
  return Object.prototype.hasOwnProperty.call(data || {}, ADMIN_MASTER_NAMED_HASHES_FIELD);
}

function namedPinEditKey(pin) {
  return pin?.id || pin?.pinNameHash || pin?.displayNameKey || "";
}

function checkinPinsFromSecurity(data) {
  const pins = [];
  pins.push({
    kind: "generic",
    id: GENERAL_CHECKIN_PIN_ID,
    displayName: "Allgemeiner Check-in-PIN",
    displayNameKey: "",
    pinNameHash: "",
    pinValue: typeof data?.checkinPinValue === "string" ? data.checkinPinValue : "",
    index: -1
  });
  pins.push(...namedPinsFromSecurity(data, "checkin").map((pin) => ({ ...pin, kind: "named" })));
  return pins;
}

function checkinPinDisplayValue(pin) {
  if (!appState.ui.showCheckinPins) return "PIN: ••••••";
  return pin.pinValue ? `PIN: ${pin.pinValue}` : "PIN: nicht verfügbar";
}

async function copyCheckinPinForStaff(pin) {
  if (!pin?.pinValue) {
    notify("PIN ist nicht verfügbar. Bitte PIN neu setzen.", "warning");
    return;
  }

  const text = [
    `Name: ${pin.kind === "generic" ? "frei wählbar" : (pin.displayName || pin.displayNameKey || "")}`,
    `PIN: ${pin.pinValue}`
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    notify("Check-in-Staff Zugang kopiert.", "success");
  } catch {
    notify("Zugang konnte nicht automatisch kopiert werden.", "warning");
  }
}

function renderImmediateAdminAccessCopy(target, { message, displayName, pin }) {
  if (!target) return;
  target.innerHTML = `
    <div class="notice success copy-access-notice">
      <span>${escapeHtml(message)} Zugang kann jetzt kopiert werden.</span>
      <button class="btn-secondary" id="copyLatestAdminAccessBtn" type="button">Admin-Zugang kopieren</button>
    </div>
  `;
  document.getElementById("copyLatestAdminAccessBtn")?.addEventListener("click", () => {
    void copyAdminAccess(displayName, pin);
  });
}

async function copyAdminAccess(displayName, pin) {
  if (!pin) {
    notify("PIN ist nicht verfügbar.", "warning");
    return;
  }

  const text = [
    `Name: ${displayName || "frei wählbar"}`,
    `PIN: ${pin}`
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    notify("Admin-Zugang kopiert.", "success");
  } catch {
    notify("Admin-Zugang konnte nicht automatisch kopiert werden.", "warning");
  }
}

function isCurrentNamedAdminPin(pin) {
  if (!pin?.pinNameHash) return false;
  return appState.member?.pinNameHash === pin.pinNameHash;
}

async function reconnectNamedAdminSessionAfterPinChange(securityData, newPin, displayName) {
  const deviceLabel = appState.member?.deviceLabel || getLocalDeviceLabel();
  const eventIds = uniqueEventIds([
    securityData?.authorizingEventId,
    appState.eventId
  ]);
  for (const eventId of eventIds) {
    await connectAdminToEvent(eventId, newPin, displayName, deviceLabel);
  }
  saveAdminSession(newPin, displayName);
  if (appState.eventId) {
    const memberSnap = await getMemberSnapForEvent(appState.eventId);
    if (memberSnap.exists()) appState.member = { id: memberSnap.id, ...memberSnap.data() };
  }
  appState.ui.masterAdmin = await currentAdminIsMasterAdmin();
  updateFooterStatus();
}

async function toggleNamedAdminMaster(pin) {
  if (!pin) return;
  const name = pin.displayName || pin.displayNameKey || "diesen Admin";
  const nextMaster = !pin.masterAdmin;
  const message = nextMaster
    ? `${name} als zusätzlichen Master Admin berechtigen?`
    : `${name} die Master-Admin-Berechtigung entziehen?`;
  if (!window.confirm(message)) return;

  const result = document.getElementById("adminPinResult");
  if (!(await requireMasterAdmin(nextMaster ? "Master-Admin berechtigen" : "Master-Admin entziehen"))) return;

  try {
    await setNamedAdminMasterStatus(pin, nextMaster);
    await addAudit("admin_pin_reset", { name: "Admin-PIN" }, {
      scope: "global_admin",
      mode: nextMaster ? "grant_master" : "revoke_master",
      displayName: name
    });
    const revokedCurrentMaster = !nextMaster && pin.pinNameHash && pin.pinNameHash === appState.member?.pinNameHash;
    if (revokedCurrentMaster) {
      appState.ui.masterAdmin = false;
      await renderAdminSettings();
    } else {
      await renderNamedPinList("admin");
    }
    if (result) result.innerHTML = `<p class="notice success">Master-Admin-Berechtigung ${nextMaster ? "erteilt" : "entzogen"}.</p>`;
    notify(`Master-Admin-Berechtigung ${nextMaster ? "erteilt" : "entzogen"}.`, "success");
  } catch (error) {
    console.error(error);
    notify(`Master-Admin-Berechtigung konnte nicht geändert werden: ${error.message || error}`, "error");
    if (result) result.innerHTML = `<p class="notice error">${escapeHtml(error.message || error)}</p>`;
  }
}

async function setNamedAdminMasterStatus(pinToUpdate, masterAdmin) {
  const securitySnap = await getDoc(adminSecurityRef());
  if (!securitySnap.exists()) throw new Error("Globales Admin-Security-Dokument fehlt.");

  const data = securitySnap.data();
  const pins = namedPinsFromSecurity(data, "admin");
  const target = pins.find((pin) => sameNamedPin(pin, pinToUpdate));
  if (!target) throw new Error("Der benannte Admin-PIN wurde nicht gefunden.");

  const nextPins = pins.map((pin) => {
    const { index, ...pinData } = pin;
    return sameNamedPin(pin, target)
      ? { ...pinData, masterAdmin }
      : pinData;
  });
  const existingMasterHashes = Array.isArray(data[ADMIN_MASTER_NAMED_HASHES_FIELD]) ? data[ADMIN_MASTER_NAMED_HASHES_FIELD] : [];
  const masterHashes = new Set(existingMasterHashes);
  if (masterAdmin) masterHashes.add(target.pinNameHash);
  else masterHashes.delete(target.pinNameHash);

  const update = {
    adminNamedPins: nextPins,
    updatedAt: serverTimestamp()
  };
  const nextMasterHashes = Array.from(masterHashes);
  if (nextMasterHashes.length) {
    update[ADMIN_MASTER_NAMED_HASHES_FIELD] = nextMasterHashes;
  } else if (dataHasAdminMasterNamedHashes(data)) {
    update[ADMIN_MASTER_NAMED_HASHES_FIELD] = deleteField();
  }
  await updateDoc(adminSecurityRef(), update);
}

async function deleteNamedPin(role, pin) {
  if (!pin) return;
  const config = namedPinConfig(role);
  const name = pin.displayName || pin.displayNameKey || "diesen Namen";
  const confirmed = window.confirm(`${config.label} für "${name}" löschen?`);
  if (!confirmed) return;

  const result = document.getElementById(config.resultId);
  if (role === "admin" && !(await requireMasterAdmin("Benannten Admin-PIN löschen"))) return;

  try {
    if (role === "admin" && isCurrentNamedAdminPin(pin)) {
      const message = "Den aktuell verwendeten Admin-PIN kannst du nicht löschen. Melde dich zuerst mit einem anderen Master Admin an.";
      notify(message, "warning");
      if (result) result.innerHTML = `<p class="notice warning">${escapeHtml(message)}</p>`;
      return;
    }
    await removeNamedPinFromEvent(appState.eventId, role, pin);
    await addAudit(role === "admin" ? "admin_pin_reset" : "pins_reset", { name: config.label }, {
      mode: "delete_named",
      displayName: name,
      scope: role === "admin" ? "global_admin" : "current_event"
    });
    await renderNamedPinList(role);
    if (result) result.innerHTML = `<p class="notice success">${config.label} gelöscht.</p>`;
    notify(`${config.label} gelöscht.`, "success");
  } catch (error) {
    console.error(error);
    notify(`${config.label} konnte nicht gelöscht werden: ${error.message || error}`, "error");
    if (result) result.innerHTML = `<p class="notice error">${escapeHtml(error.message || error)}</p>`;
  }
}

async function removeNamedPinFromEvent(eventId, role, pinToRemove) {
  const config = namedPinConfig(role);
  const securityRef = role === "admin"
    ? adminSecurityRef()
    : doc(appState.db, "events", eventId, "private", "security");
  const securitySnap = await getDoc(securityRef);
  if (!securitySnap.exists()) return;

  const data = securitySnap.data();
  const pins = namedPinsFromSecurity(data, role);
  const removed = pins.filter((pin) => sameNamedPin(pin, pinToRemove));
  if (!removed.length) return;

  const removedHashes = new Set(removed.map((pin) => pin.pinNameHash));
  const remainingPins = pins
    .filter((pin) => !sameNamedPin(pin, pinToRemove))
    .map(({ index, ...pin }) => pin);
  const existingHashes = Array.isArray(data[config.hashField]) ? data[config.hashField] : [];
  const remainingHashes = existingHashes.filter((hash) => !removedHashes.has(hash));
  const update = {
    [config.listField]: remainingPins,
    [config.hashField]: remainingHashes,
    updatedAt: serverTimestamp()
  };

  if (role === "admin") {
    const existingMasterHashes = Array.isArray(data[ADMIN_MASTER_NAMED_HASHES_FIELD]) ? data[ADMIN_MASTER_NAMED_HASHES_FIELD] : [];
    const nextMasterHashes = existingMasterHashes.filter((hash) => !removedHashes.has(hash));
    if (nextMasterHashes.length) {
      update[ADMIN_MASTER_NAMED_HASHES_FIELD] = nextMasterHashes;
    } else if (dataHasAdminMasterNamedHashes(data)) {
      update[ADMIN_MASTER_NAMED_HASHES_FIELD] = deleteField();
    }
  }

  await updateDoc(securityRef, update);
}

function sameNamedPin(left, right) {
  if (left.id && right.id) return left.id === right.id;
  if (left.pinNameHash && right.pinNameHash && left.pinNameHash === right.pinNameHash) return true;
  return Boolean(left.displayNameKey && right.displayNameKey && left.displayNameKey === right.displayNameKey);
}

async function renderLoggedInMembersList() {
  if (!isAdmin()) return;
  const target = document.getElementById("loggedInMembersList");
  if (!target) return;

  try {
    const snapshot = await getDocs(collection(appState.db, "events", appState.eventId, "members"));
    const members = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const roleCompare = String(a.role || "").localeCompare(String(b.role || ""), "de");
        if (roleCompare) return roleCompare;
        return String(a.displayName || a.id).localeCompare(String(b.displayName || b.id), "de");
      });

    target.innerHTML = members.length ? members.map((member) => {
      const isSelf = member.id === appState.user?.uid;
      const roleLabel = ROLE_META[member.role] || member.role || "User";
      const updated = formatTimestamp(member.updatedAt || member.createdAt);
      const details = [
        roleLabel,
        member.deviceLabel || "",
        updated ? `seit ${updated}` : "",
        isSelf ? "dieses Gerät" : ""
      ].filter(Boolean).join(" · ");
      return `
        <div class="pin-list-row">
          <span>
            <strong>${escapeHtml(member.displayName || "Ohne Name")}</strong>
            <span class="small">${escapeHtml(details)}</span>
          </span>
          <span class="pin-list-actions member-device-actions">
            <input class="compact-input" data-device-label-for="${escapeHtml(member.id)}" value="${escapeHtml(member.deviceLabel || "")}" aria-label="Gerätename" />
            <button class="btn-secondary" type="button" data-save-device-label="${escapeHtml(member.id)}" disabled>Name speichern</button>
            <button class="btn-danger" type="button" data-force-logout="${escapeHtml(member.id)}" ${isSelf ? "disabled" : ""}>Abmelden</button>
          </span>
        </div>
      `;
    }).join("") : `<p class="small">Keine aktiven Anmeldungen.</p>`;

    target.querySelectorAll("[data-device-label-for]").forEach((input) => {
      const member = members.find((item) => item.id === input.dataset.deviceLabelFor);
      const button = target.querySelector(`[data-save-device-label="${cssEscape(input.dataset.deviceLabelFor)}"]`);
      input.addEventListener("input", () => {
        if (button) button.disabled = input.value.trim() === String(member?.deviceLabel || "");
      });
    });
    target.querySelectorAll("[data-save-device-label]").forEach((button) => {
      const member = members.find((item) => item.id === button.dataset.saveDeviceLabel);
      button.addEventListener("click", () => {
        const input = target.querySelector(`[data-device-label-for="${cssEscape(button.dataset.saveDeviceLabel)}"]`);
        void updateMemberDeviceLabel(member, input?.value || "");
      });
    });
    target.querySelectorAll("[data-force-logout]").forEach((button) => {
      const member = members.find((item) => item.id === button.dataset.forceLogout);
      button.addEventListener("click", () => {
        void forceLogoutMember(member);
      });
    });
  } catch (error) {
    console.error(error);
    target.innerHTML = `<p class="notice error">Aktive Anmeldungen konnten nicht geladen werden.</p>`;
  }
}

async function updateMemberDeviceLabel(member, rawLabel) {
  if (!member?.id || !isAdmin()) return;
  const deviceLabel = String(rawLabel || "").trim();
  if (!deviceLabel) {
    notify("Gerätename darf nicht leer sein.", "warning");
    return;
  }
  if (deviceLabel === String(member.deviceLabel || "")) return;

  try {
    await updateDoc(doc(appState.db, "events", appState.eventId, "members", member.id), {
      deviceLabel,
      updatedAt: serverTimestamp()
    });
    await addAudit("member_device_update", { name: member.displayName || member.id.slice(0, 8) }, {
      role: member.role || "",
      oldDeviceLabel: member.deviceLabel || "",
      newDeviceLabel: deviceLabel
    });
    if (member.id === appState.user?.uid) {
      appState.member = { ...appState.member, deviceLabel };
    }
    await renderLoggedInMembersList();
    notify("Gerätename gespeichert.", "success");
  } catch (error) {
    console.error(error);
    notify(`Gerätename konnte nicht gespeichert werden: ${error.message || error}`, "error");
  }
}

async function forceLogoutMember(member) {
  if (!member?.id || member.id === appState.user?.uid) return;
  const name = member.displayName || member.id.slice(0, 8);
  const confirmed = window.confirm(`Gerät von ${name} abmelden?`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(appState.db, "events", appState.eventId, "members", member.id));
    await addAudit("member_force_logout", { name }, {
      uid: member.id,
      role: member.role || "",
      displayName: member.displayName || "",
      deviceLabel: member.deviceLabel || ""
    });
    await renderLoggedInMembersList();
    notify(`${name} wurde abgemeldet.`, "success");
  } catch (error) {
    console.error(error);
    notify(`Abmelden fehlgeschlagen: ${error.message || error}`, "error");
  }
}

async function promptForDuplicateNamedMemberLogout(eventId, member) {
  if (!eventId || !member?.role || !member?.displayNameKey) return;

  let duplicates = [];
  try {
    duplicates = await findDuplicateNamedMemberSessions(eventId, member);
  } catch (error) {
    console.error(error);
    notify("Andere Geräte konnten nicht geprüft werden.", "warning");
    return;
  }
  if (!duplicates.length) return;

  const name = member.displayName || member.displayNameKey;
  const deviceText = `${duplicates.length} ${duplicates.length === 1 ? "anderes Gerät" : "andere Geräte"}`;
  let shouldLogout = window.confirm(`${name} ist bereits auf ${deviceText} angemeldet.\n\nAndere Geräte jetzt abmelden?\n\nOK = abmelden`);

  if (!shouldLogout) {
    const keepConfirmed = window.confirm(`Andere Geräte angemeldet lassen?\n\nBitte nochmals bestätigen.`);
    shouldLogout = !keepConfirmed;
  }

  if (!shouldLogout) return;

  try {
    await logoutDuplicateNamedMemberSessions(eventId, member, duplicates);
    notify(`${deviceText} abgemeldet.`, "success");
  } catch (error) {
    console.error(error);
    notify(`Andere Geräte konnten nicht abgemeldet werden: ${error.message || error}`, "error");
  }
}

async function findDuplicateNamedMemberSessions(eventId, member) {
  const q = query(
    collection(appState.db, "events", eventId, "members"),
    where("role", "==", member.role),
    where("displayNameKey", "==", member.displayNameKey)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => item.id !== appState.user?.uid);
}

async function logoutDuplicateNamedMemberSessions(eventId, member, duplicates) {
  for (const duplicate of duplicates) {
    await deleteDoc(doc(appState.db, "events", eventId, "members", duplicate.id));
  }
  await addAudit("member_duplicate_logout", { name: member.displayName || member.displayNameKey }, {
    role: member.role || "",
    displayName: member.displayName || "",
    deviceLabel: member.deviceLabel || "",
    count: duplicates.length,
    loggedOut: duplicates.map((duplicate) => ({
      displayName: duplicate.displayName || "",
      deviceLabel: duplicate.deviceLabel || "",
      role: duplicate.role || ""
    }))
  });
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
      <p class="small">Zeigt die letzten 100 Einträge. Der CSV-Export wird beim Download aus Firestore erzeugt.</p>
      <div class="grid three">
        <div class="form-row">
          <label for="auditExportFrom">Von</label>
          <input id="auditExportFrom" type="date" />
        </div>
        <div class="form-row">
          <label for="auditExportTo">Bis</label>
          <input id="auditExportTo" type="date" />
        </div>
        <div class="form-row">
          <label for="auditExportAction">Aktion</label>
          <select id="auditExportAction">
            <option value="all">Alle Aktionen</option>
            ${auditActionOptions()}
          </select>
        </div>
        <div class="form-row" style="grid-column:1/-1">
          <label for="auditExportActor">Mitarbeiter:in</label>
          <input id="auditExportActor" placeholder="optional filtern" />
        </div>
      </div>
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
  const summary = auditSummary(entry);
  return `
    <div class="log-line">
      <strong>${escapeHtml(labelForAction(entry.action))}</strong>
      <div class="small">${formatTimestamp(entry.createdAt)} · ${escapeHtml(entry.actorName || "")} · ${escapeHtml(entry.deviceLabel || "")}</div>
      ${summary.subject ? `<div>${escapeHtml(summary.subject)}</div>` : ""}
      ${summary.detail ? `<div class="small log-details">${escapeHtml(summary.detail)}</div>` : ""}
    </div>
  `;
}

function auditSummary(entry) {
  const details = entry.details && typeof entry.details === "object" ? entry.details : {};
  const subject = entry.guestName || details.displayName || details.name || "";
  const statusLabel = (value) => STATUS_META[value]?.label || value || "";
  const filterLabel = (value) => value === "all" ? "Alle" : (STATUS_META[value]?.label || value || "");
  const changed = (...items) => items.filter(Boolean).join(", ");

  switch (entry.action) {
    case "event_create":
      return { subject: entry.guestName || "Event", detail: `${details.date ? formatEventDate(details.date) : ""}${details.eventId ? ` · ${details.eventId}` : ""}`.trim() };
    case "event_update":
      if (details.field === "checkinAccessWindow") {
        return {
          subject: entry.guestName || "Event",
          detail: `Check-in-Zugang: ${details.oldStartsAt || "?"} bis ${details.oldEndsAt || "?"} → ${details.newStartsAt || "?"} bis ${details.newEndsAt || "?"}`
        };
      }
      if (details.field === "visibility") {
        return { subject: entry.guestName || "Event", detail: details.hidden ? "Event versteckt" : "Event wieder sichtbar" };
      }
      return { subject: entry.guestName || "Event", detail: "Eventname geändert" };
    case "member_login":
      return { subject, detail: `${ROLE_META[details.role] || details.role || "Rolle"} angemeldet${details.deviceLabel ? ` · ${details.deviceLabel}` : ""}` };
    case "member_logout":
      return { subject, detail: `${ROLE_META[details.role] || details.role || "Rolle"} abgemeldet${details.deviceLabel ? ` · ${details.deviceLabel}` : ""}` };
    case "member_device_update":
      return { subject, detail: `${details.oldDeviceLabel || "Gerät"} → ${details.newDeviceLabel || "Gerät"}` };
    case "member_force_logout":
      return { subject, detail: `${ROLE_META[details.role] || details.role || "Rolle"} abgemeldet${details.deviceLabel ? ` · ${details.deviceLabel}` : ""}` };
    case "member_duplicate_logout":
      return { subject, detail: duplicateLogoutDetail(details) };
    case "check_in":
      return { subject, detail: details.force ? "Check-in überschrieben" : "Eingecheckt" };
    case "check_in_undo":
      return { subject, detail: `Check-in rückgängig → ${statusLabel(details.newStatus)}` };
    case "duplicate_check_in_attempt":
      return { subject, detail: "Bereits eingecheckt" };
    case "support_comment_update":
      return { subject, detail: `${INFO_LABELS.staffToAll} geändert` };
    case "status_update":
      return { subject, detail: `Status: ${statusLabel(details.oldStatus)} → ${statusLabel(details.newStatus)}` };
    case "guest_create":
      return { subject, detail: details.source === "manual" ? "Manuell erstellt" : "Erstellt" };
    case "guest_update": {
      const fields = changed(
        details.oldName !== details.newName ? "Name" : "",
        details.oldCategory !== details.newCategory ? "Kategorie" : "",
        details.staffInfoChanged ? INFO_LABELS.staffToAll : "",
        details.adminStaffInfoChanged ? INFO_LABELS.adminToStaff : "",
        details.adminOnlyInfoChanged ? INFO_LABELS.adminOnly : ""
      );
      return { subject, detail: fields ? `Geändert: ${fields}` : "Gastdaten geändert" };
    }
    case "guest_delete":
      return { subject, detail: `Gelöscht · Status: ${statusLabel(details.oldStatus)}` };
    case "guest_import":
      return { subject: "CSV Import", detail: `${details.count || 0} Gäste${details.replace ? " · bestehende Gäste ersetzt" : ""}` };
    case "guest_export":
      return { subject: "CSV Export", detail: `${details.count || 0} Gäste · ${filterLabel(details.filter)}` };
    case "audit_export":
      return { subject: "Audit Log Export", detail: `${details.count || 0} Einträge` };
    case "bulk_no_show":
      return { subject: "Tagesabschluss", detail: `${details.count || 0} offene Gäste auf No Show gesetzt` };
    case "pins_reset":
      return { subject: "Check-in-PIN", detail: pinAuditDetail(details) };
    case "admin_pin_reset":
      return { subject: "Admin-PIN", detail: pinAuditDetail(details) };
    default:
      return { subject, detail: "" };
  }
}

function pinAuditDetail(details) {
  if (details.mode === "named") return `Benannter PIN gespeichert${details.displayName ? `: ${details.displayName}` : ""}`;
  if (details.mode === "delete_named") return `Benannter PIN gelöscht${details.displayName ? `: ${details.displayName}` : ""}`;
  return "PIN geändert";
}

function duplicateLogoutDetail(details) {
  const count = Number(details.count || 0);
  const devices = Array.isArray(details.loggedOut)
    ? details.loggedOut.map((item) => item?.deviceLabel).filter(Boolean)
    : [];
  const deviceText = devices.length ? ` · ${devices.join(", ")}` : "";
  return `${count} ${count === 1 ? "anderes Gerät" : "andere Geräte"} abgemeldet${deviceText}`;
}

function auditActionOptions() {
  return auditActionValues()
    .map((action) => option(action, labelForAction(action), ""))
    .join("");
}

function auditActionValues() {
  return [
    "event_create",
    "event_update",
    "member_login",
    "member_logout",
    "member_device_update",
    "member_force_logout",
    "member_duplicate_logout",
    "check_in",
    "check_in_undo",
    "duplicate_check_in_attempt",
    "support_comment_update",
    "status_update",
    "guest_create",
    "guest_update",
    "guest_delete",
    "guest_import",
    "guest_export",
    "audit_export",
    "pins_reset",
    "admin_pin_reset"
  ];
}

function labelForAction(action) {
  const labels = {
    event_create: "Event erstellt",
    check_in: "Check-in",
    check_in_undo: "Check-in rückgängig",
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
    admin_pin_reset: "Admin-PIN neu gesetzt",
    member_login: "Anmeldung",
    member_logout: "Abmeldung",
    member_device_update: "Gerät umbenannt",
    member_force_logout: "Gerät abgemeldet",
    member_duplicate_logout: "Doppelte Anmeldung bereinigt"
  };
  return labels[action] || action || "Aktion";
}

async function addAudit(action, guest, details = {}) {
  return addAuditForEvent(appState.eventId, action, guest, details);
}

async function addAuditForEvent(eventId, action, guest, details = {}, actor = {}) {
  if (!eventId) return;
  try {
    await addDoc(collection(appState.db, "events", eventId, "auditLog"), {
      action,
      guestDocId: guest.id || "",
      guestId: guest.guestId || "",
      guestName: guest.name || "",
      category: guest.category || "",
      details,
      actorUid: appState.user.uid,
      actorName: actor.displayName ?? appState.member?.displayName ?? "",
      deviceLabel: actor.deviceLabel ?? appState.member?.deviceLabel ?? "",
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
  const supportComment = pick(row, [INFO_LABELS.staffToAll, "Info von Check-in Staff für alle", "Support Kommentar", "Support Comment", "Kommentar", "Comment", "Bemerkung"]);
  const adminStaffInfo = pick(row, [INFO_LABELS.adminToStaff, "Info von Administratoren an Check-in Staff", "Info für Check-in Staff", "Check-in Info"]);
  const internalNote = pick(row, [INFO_LABELS.adminOnly, "Info nur für Administratoren", "Interne Notiz", "Internal Note", "Admin-Info", "Admin Notiz", "Private Admin Info", "Notiz", "Note"]);
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

function adminSecurityRef() {
  return doc(appState.db, ADMIN_SECURITY_COLLECTION, ADMIN_SECURITY_DOC_ID);
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

async function currentAdminIsMasterAdmin() {
  if (!isAdmin()) {
    appState.ui.masterAdminKind = "";
    return false;
  }
  try {
    const securitySnap = await getDoc(adminSecurityRef());
    if (!securitySnap.exists()) {
      appState.ui.masterAdminKind = "";
      return false;
    }
    const kind = adminMasterKind(securitySnap.data(), appState.member?.pinHash, appState.member?.pinNameHash);
    appState.ui.masterAdminKind = kind;
    return Boolean(kind);
  } catch (error) {
    if (isPermissionError(error)) {
      appState.ui.masterAdminKind = "";
      return false;
    }
    throw error;
  }
}

async function requireMasterAdmin(actionLabel) {
  if (!isAdmin()) {
    notify("Nur Admins dürfen diese Aktion ausführen.", "warning");
    return false;
  }

  const isMaster = await currentAdminIsMasterAdmin();
  appState.ui.masterAdmin = isMaster;
  if (!isMaster) {
    notify(`${actionLabel} ist nur für Master Admins möglich.`, "warning");
    updateFooterStatus();
    return false;
  }
  return true;
}

function uniqueEventIds(eventIds) {
  return [...new Set(eventIds
    .map((eventId) => resolveEventId(String(eventId || "").trim()))
    .filter(Boolean))];
}

function adminMasterHashMatches(data, pinHash, pinNameHash = "") {
  return Boolean(adminMasterKind(data, pinHash, pinNameHash));
}

function adminMasterKind(data, pinHash, pinNameHash = "") {
  if (!pinHash) return "";
  if (data?.adminPinHash === pinHash) return "main";
  if (Array.isArray(data?.adminPinHashes) && data.adminPinHashes.includes(pinHash)) return "main";
  if (pinNameHash && Array.isArray(data?.[ADMIN_MASTER_NAMED_HASHES_FIELD]) && data[ADMIN_MASTER_NAMED_HASHES_FIELD].includes(pinNameHash)) {
    return "named";
  }
  return "";
}

async function mainAdminPinInputMatchesSecurity(data, pin) {
  const pinHash = await hashAdminPin(pin);
  return adminMasterKind(data, pinHash, "") === "main";
}

async function namedAdminPinInputMatchesPin(pinEntry, pin) {
  if (!pinEntry?.pinNameHash) return false;
  const displayName = pinEntry.displayName || pinEntry.displayNameKey || "";
  if (!displayName) return false;
  return (await hashNamedPin(ADMIN_PIN_SCOPE, "admin", pin, displayName)) === pinEntry.pinNameHash;
}

async function findNamedAdminPinUsingLiteralPin(pins, pin, excludeEditId = "") {
  for (const existingPin of pins) {
    if (excludeEditId && namedPinEditKey(existingPin) === excludeEditId) continue;
    if (await namedAdminPinInputMatchesPin(existingPin, pin)) return existingPin;
  }
  return null;
}

function adminPinCollisionMessage(pin) {
  const name = pin?.displayName || pin?.displayNameKey || "einen anderen Admin";
  return `Dieser PIN wird bereits für ${name} verwendet. Bitte einen anderen PIN wählen.`;
}

function roleDisplayLabel(role = appState.member?.role) {
  if (role === "admin" && appState.ui.masterAdmin === true) {
    return appState.ui.masterAdminKind === "named" ? "Benannter Master Admin" : "Master Admin";
  }
  return ROLE_META[role] || role || "";
}

async function refreshMasterAdminState(options = {}) {
  if (!isAdmin()) {
    appState.ui.masterAdmin = false;
    appState.ui.masterAdminKind = "";
    return false;
  }

  const previous = appState.ui.masterAdmin;
  const isMaster = await currentAdminIsMasterAdmin();
  appState.ui.masterAdmin = isMaster;
  if (isMaster && appState.ui.masterAdminKind === "main") {
    await ensureMainAdminMemberName();
    updateFooterStatus();
  }
  if (options.rerender !== false && previous !== isMaster) {
    renderShell();
    renderActiveTab();
  }
  return isMaster;
}

async function ensureMainAdminMemberName() {
  if (!appState.member || isMainAdminName(appState.member.displayName)) return;
  try {
    await updateDoc(memberRef(appState.user.uid), {
      displayName: MAIN_ADMIN_NAME,
      displayNameKey: MAIN_ADMIN_NAME_KEY,
      updatedAt: serverTimestamp()
    });
    appState.member = {
      ...appState.member,
      displayName: MAIN_ADMIN_NAME,
      displayNameKey: MAIN_ADMIN_NAME_KEY
    };
    const session = getAdminSession();
    if (session?.pin) saveAdminSession(session.pin, MAIN_ADMIN_NAME);
    localStorage.setItem("guestlist:memberName", MAIN_ADMIN_NAME);
  } catch (error) {
    console.error(error);
  }
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

async function hashAdminPin(pin) {
  return hashPin(ADMIN_PIN_SCOPE, "admin", pin);
}

function normalizeDisplayNameKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isMainAdminName(value) {
  return normalizeDisplayNameKey(value) === MAIN_ADMIN_NAME_KEY;
}

function getLocalDeviceLabel() {
  try {
    const existing = localStorage.getItem(DEVICE_LABEL_STORAGE_KEY);
    if (existing) return existing;
    const generated = `Gerät ${randomDeviceSuffix()}`;
    localStorage.setItem(DEVICE_LABEL_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `Gerät ${randomDeviceSuffix()}`;
  }
}

function randomDeviceSuffix() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function hashNamedPin(eventId, role, pin, displayName) {
  const displayNameKey = normalizeDisplayNameKey(displayName);
  const input = `${eventId}:${role}:${pin}:${displayNameKey}`;
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function memberAuthFields(eventId, role, pin, displayName) {
  return {
    pinHash: await hashPin(eventId, role, pin),
    pinNameHash: await hashNamedPin(eventId, role, pin, displayName),
    displayNameKey: normalizeDisplayNameKey(displayName)
  };
}

async function adminMemberAuthFields(pin, displayName) {
  return memberAuthFields(ADMIN_PIN_SCOPE, "admin", pin, displayName);
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

function checkinStaffAccessWindow(event = appState.event) {
  return eventAccessWindow(event);
}

function checkinAccessWindowForDate(eventDate) {
  const match = String(eventDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(2, 0, 0, 0);
  return { start, end };
}

function eventAccessWindow(event) {
  const startMillis = timestampMillis(event?.checkinAccessStartsAt);
  const endMillis = timestampMillis(event?.checkinAccessEndsAt);
  if (startMillis && endMillis) {
    return {
      start: new Date(startMillis),
      end: new Date(endMillis),
      source: "event"
    };
  }

  const fallback = checkinAccessWindowForDate(event?.date);
  return fallback ? { ...fallback, source: "date" } : null;
}

function hasEventAccessWindow(event) {
  return Boolean(event?.checkinAccessStartsAt && event?.checkinAccessEndsAt);
}

async function ensureCurrentEventAccessWindowFields() {
  if (!appState.eventId || !isAdmin() || !appState.event?.date || hasEventAccessWindow(appState.event)) return;
  const accessWindow = checkinAccessWindowForDate(appState.event.date);
  if (!accessWindow) return;

  try {
    await updateDoc(eventRef(), {
      checkinAccessStartsAt: accessWindow.start,
      checkinAccessEndsAt: accessWindow.end,
      updatedAt: serverTimestamp()
    });
    appState.event = {
      ...appState.event,
      checkinAccessStartsAt: accessWindow.start,
      checkinAccessEndsAt: accessWindow.end
    };
  } catch (error) {
    console.error(error);
    if (!isPermissionError(error)) {
      notify(`Check-in-Zeitfenster konnte nicht gespeichert werden: ${error.message || error}`, "warning");
    }
  }
}

function isCheckinStaffAccessOpen(now = new Date()) {
  return isEventAccessWindowOpen(appState.event, now);
}

function isEventAccessWindowOpen(event, now = new Date()) {
  if (isEventHidden(event)) return false;
  const accessWindow = eventAccessWindow(event);
  if (!accessWindow) return false;
  const nowMillis = now.getTime();
  return nowMillis >= accessWindow.start.getTime() && nowMillis < accessWindow.end.getTime();
}

function checkinStaffAccessMessage(event = appState.event, now = new Date()) {
  if (isEventHidden(event)) return "Dieses Event ist versteckt. Check-in Staff Zugriff ist gesperrt, bis ein Haupt-Admin das Event wieder sichtbar macht.";
  const accessWindow = checkinStaffAccessWindow(event);
  if (!accessWindow) return "Check-in Staff Zugriff ist nicht aktiv, weil kein Eventdatum gesetzt ist.";
  if (accessWindow.start >= accessWindow.end) return "Check-in Staff Zugriff ist nicht aktiv, weil Start und Ende ungültig sind.";
  if (now < accessWindow.start) {
    return `Check-in Staff Zugriff ist erst ab ${formatTimestamp(accessWindow.start)} aktiv.`;
  }
  if (now >= accessWindow.end) {
    return `Check-in Staff Zugriff ist seit ${formatTimestamp(accessWindow.end)} abgelaufen. Admin kann das Zeitfenster im Tab "Event verwalten" anpassen.`;
  }
  return `Check-in Staff Zugriff ist bis ${formatTimestamp(accessWindow.end)} aktiv.`;
}

function getCheckinStaffLoginCandidates(now = new Date()) {
  const byId = new Map();
  const addCandidate = (event) => {
    const id = resolveEventId(String(event?.id || "").trim());
    if (!id || byId.has(id)) return;
    byId.set(id, { ...event, id });
  };

  addCandidate(appState.event ? { id: appState.eventId, ...appState.event } : { id: appState.eventId });

  const todayEvent = findKnownEventByDate(localDateKey(now));
  addCandidate(todayEvent);

  if (now.getHours() < 2) {
    const previousEvent = findKnownEventByDate(localDateKey(addDays(now, -1)));
    addCandidate(previousEvent);
  }

  return [...byId.values()];
}

function findKnownEventByDate(date) {
  return getKnownEvents().find((event) => event.date === date) || null;
}

function checkinStaffLoginErrorMessage() {
  const candidates = getCheckinStaffLoginCandidates();
  if (!candidates.length) {
    return "Kein Check-in Event gefunden. Bitte Event-Link öffnen oder Admin nach dem richtigen Link fragen.";
  }
  if (appState.eventId && !isEventAccessWindowOpen(appState.event)) return checkinStaffAccessMessage(appState.event);
  return "Name und Check-in-PIN passen zu keinem aktuell erlaubten Event.";
}

function checkinAccessStatus(event = appState.event, now = new Date()) {
  if (isEventHidden(event)) {
    return {
      type: "warning",
      label: "Versteckt",
      detail: "Check-in Staff kann sich nicht anmelden, bis ein Haupt-Admin das Event wieder sichtbar macht."
    };
  }

  const accessWindow = eventAccessWindow(event);
  if (!accessWindow) {
    return {
      type: "warning",
      label: "Nicht gesetzt",
      detail: "Kein gültiges Zeitfenster für Check-in Staff vorhanden."
    };
  }

  const windowText = `${formatTimestamp(accessWindow.start)} bis ${formatTimestamp(accessWindow.end)}`;
  if (accessWindow.start >= accessWindow.end) {
    return {
      type: "error",
      label: "Ungültig",
      detail: `Start und Ende passen nicht: ${windowText}.`
    };
  }
  if (now < accessWindow.start) {
    return {
      type: "info",
      label: "Geplant",
      detail: `Check-in Staff kann sich ab ${formatTimestamp(accessWindow.start)} anmelden. Ende: ${formatTimestamp(accessWindow.end)}.`
    };
  }
  if (now >= accessWindow.end) {
    return {
      type: "warning",
      label: "Abgelaufen",
      detail: `Check-in Staff kann sich nicht anmelden. Ende war ${formatTimestamp(accessWindow.end)}.`
    };
  }
  return {
    type: "success",
    label: "Aktiv",
    detail: `Check-in Staff kann sich anmelden bis ${formatTimestamp(accessWindow.end)}.`
  };
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateStart(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
}

function localDateEnd(value) {
  const start = localDateStart(value);
  if (!start) return null;
  start.setHours(23, 59, 59, 999);
  return start;
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
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    return String(a.name || a.id).localeCompare(String(b.name || b.id), "de");
  });
}

async function findFirstAvailableEventFromDate(now = new Date()) {
  const today = localDateKey(now);
  const candidates = getKnownEvents().filter((event) => event.date && event.date >= today);

  for (const candidate of candidates) {
    const eventSnap = await getDoc(doc(appState.db, "events", candidate.id));
    if (eventSnap.exists()) {
      return { id: eventSnap.id, ...eventSnap.data() };
    }
  }

  return null;
}

async function findFirstAvailableAdminEvent(now = new Date()) {
  const today = localDateKey(now);
  const knownEvents = getKnownEvents();
  const candidates = [];
  const addCandidate = (event) => {
    const normalized = normalizeKnownEvent(event);
    if (normalized && !candidates.some((candidate) => candidate.id === normalized.id)) {
      candidates.push(normalized);
    }
  };

  const lastEventId = localStorage.getItem("guestlist:lastEventId") || "";
  if (lastEventId) {
    addCandidate(knownEvents.find((event) => event.id === lastEventId) || { id: lastEventId });
  }
  knownEvents.filter((event) => event.date && event.date >= today).forEach(addCandidate);
  knownEvents.forEach(addCandidate);
  if (GLOBAL_ADMIN_EVENT_ID) {
    addCandidate(knownEvents.find((event) => event.id === GLOBAL_ADMIN_EVENT_ID) || { id: GLOBAL_ADMIN_EVENT_ID });
  }

  for (const candidate of candidates) {
    const eventSnap = await getDoc(doc(appState.db, "events", candidate.id));
    if (eventSnap.exists()) {
      return { id: eventSnap.id, ...eventSnap.data() };
    }
  }

  return null;
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
  localStorage.setItem(KNOWN_EVENTS_STORAGE_KEY, JSON.stringify(events.slice(0, 50)));
}

function removeStoredKnownEvent(eventId) {
  const resolved = resolveEventId(eventId);
  const events = getStoredKnownEvents().filter((item) => normalizeKnownEvent(item)?.id !== resolved);
  localStorage.setItem(KNOWN_EVENTS_STORAGE_KEY, JSON.stringify(events));
}

function normalizeKnownEvent(event) {
  const id = resolveEventId(String(event?.id || "").trim());
  if (!id) return null;
  return {
    id,
    name: String(event?.name || id).trim(),
    date: String(event?.date || "").trim(),
    hidden: isEventHidden(event)
  };
}

function isEventHidden(event) {
  return event?.hidden === true;
}

function resolveEventId(id) {
  const raw = String(id || "").trim();
  return EVENT_ALIASES[raw] || raw;
}

function renderKnownEventList(currentEventId = "") {
  const events = getKnownEvents().filter((event) => isAdmin() || !isEventHidden(event));
  if (!events.length) return `<p class="notice warning">Noch keine bekannten Events in dieser Installation.</p>`;
  return renderEventGroups(events, currentEventId);
}

function renderEventGroups(events, currentEventId = "", options = {}) {
  const uniqueEvents = uniqueEventsById(events);
  const today = localDateKey(new Date());
  const inactive = uniqueEvents.filter((event) => isEventHidden(event));
  const activeEvents = uniqueEvents.filter((event) => !isEventHidden(event));
  const upcoming = activeEvents.filter((event) => !event.date || event.date >= today);
  const past = activeEvents.filter((event) => event.date && event.date < today);
  const groups = [
    { title: "Aktuelle und kommende Events", events: upcoming },
    { title: "Vergangene Events", events: past },
    { title: "Inaktive / versteckte Events", events: inactive, emptyText: options.showEmptyInactive ? "Keine inaktiven Events." : "" }
  ].filter((group) => group.events.length || group.emptyText);

  return `
    <div class="event-switch-list">
      ${groups.map((group) => `
        <div class="event-switch-group">
          <h3>${escapeHtml(group.title)}</h3>
          ${group.events.length
            ? group.events.map((event) => renderKnownEventCard(event, currentEventId)).join("")
            : `<p class="small">${escapeHtml(group.emptyText)}</p>`}
        </div>
      `).join("")}
    </div>
  `;
}

function uniqueEventsById(events) {
  const byId = new Map();
  events.filter(Boolean).forEach((event) => {
    const normalized = normalizeKnownEvent(event);
    if (!normalized || byId.has(normalized.id)) return;
    byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values());
}

function renderKnownEventCard(event, currentEventId = "", options = {}) {
  const isCurrent = event.id === currentEventId;
  const link = urlWithEvent(event.id);
  const hiddenBadge = isEventHidden(event) ? ` <span class="badge warning">Versteckt</span>` : "";
  return `
    <div class="event-switch-card ${isCurrent ? "current" : ""}">
      <span>
        <strong>${escapeHtml(event.name || event.id)}${hiddenBadge}</strong>
        <small>${event.date ? escapeHtml(formatEventDate(event.date)) : "ohne Datum"} · ${escapeHtml(event.id)}</small>
        <small>${escapeHtml(link)}</small>
      </span>
      <span class="event-switch-actions">
        <button class="btn-secondary" type="button" data-copy-known-link="${escapeHtml(link)}">Link kopieren</button>
        <button class="${isCurrent ? "btn-secondary" : "btn-primary"}" type="button" data-activate-event="${escapeHtml(event.id)}">${isCurrent ? "Geöffnet" : (options.openLabel || "Öffnen")}</button>
      </span>
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

function bindKnownLinkCopyButtons(root = document) {
  root.querySelectorAll("[data-copy-known-link]").forEach((button) => {
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

function bindKnownEventButtons(root = document) {
  root.querySelectorAll("[data-activate-event]").forEach((button) => {
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
        removeMissingKnownEvent(eventId, error);
        notify(`Event konnte nicht geöffnet werden: ${error?.message || error}`, "error");
        if (document.body.contains(button)) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });
  });
}

function removeMissingKnownEvent(eventId, error) {
  const message = String(error?.message || error || "");
  if (!message.includes("wurde nicht gefunden")) return;
  removeStoredKnownEvent(eventId);
  if (appState.currentTab === "setup" || appState.currentTab === "admin") {
    renderActiveTab();
  }
}

async function activateKnownEvent(eventId) {
  const targetEventId = resolveEventId(eventId);
  const previousTab = appState.currentTab;
  const eventSnap = await getDoc(doc(appState.db, "events", targetEventId));
  if (!eventSnap.exists()) {
    throw new Error(`Event ${targetEventId} wurde nicht gefunden.`);
  }
  const eventData = { id: eventSnap.id, ...eventSnap.data() };

  let memberSnap = await getMemberSnapForEvent(targetEventId);
  if (isAdmin()) {
    const session = getAdminSession();
    if (session?.pin) {
      try {
        await connectAdminToEvent(targetEventId, session.pin, session.displayName || appState.member?.displayName || MAIN_ADMIN_NAME);
        memberSnap = await getMemberSnapForEvent(targetEventId);
      } catch (error) {
        console.error(error);
        clearAdminSession();
        if (isEventHidden(eventData) && isPermissionError(error)) {
          throw new Error("Dieses Event ist versteckt. Bitte mit einem gültigen Admin-PIN öffnen.");
        }
        if (!memberSnap.exists()) {
          throw new Error("Automatischer Admin-Wechsel fehlgeschlagen. Bitte beim Ziel-Event erneut einloggen.");
        }
      }
    }
  }

  unsubscribeAll();
  appState.eventId = targetEventId;
  appState.event = eventData;
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
    result.innerHTML = `<p class="notice info">Event geöffnet. Bitte mit dem passenden PIN verbinden.</p>`;
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

async function connectAdminToEvent(eventId, pin, displayName, deviceLabel = "") {
  const resolvedDeviceLabel = deviceLabel || getLocalDeviceLabel();
  const adminDisplayName = displayName || MAIN_ADMIN_NAME;
  const authFields = await adminMemberAuthFields(pin, adminDisplayName);
  await setDoc(doc(appState.db, "events", eventId, "members", appState.user.uid), {
    uid: appState.user.uid,
    role: "admin",
    pinHash: authFields.pinHash,
    pinNameHash: authFields.pinNameHash,
    displayNameKey: authFields.displayNameKey,
    displayName: adminDisplayName,
    deviceLabel: resolvedDeviceLabel,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function connectLegacyAdminToEvent(eventId, pin, displayName, deviceLabel = "") {
  const resolvedDeviceLabel = deviceLabel || getLocalDeviceLabel();
  const adminDisplayName = displayName || MAIN_ADMIN_NAME;
  const authFields = await memberAuthFields(eventId, "admin", pin, adminDisplayName);
  await setDoc(doc(appState.db, "events", eventId, "members", appState.user.uid), {
    uid: appState.user.uid,
    role: "admin",
    pinHash: authFields.pinHash,
    pinNameHash: authFields.pinNameHash,
    displayNameKey: authFields.displayNameKey,
    displayName: adminDisplayName,
    deviceLabel: resolvedDeviceLabel,
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

function dateTimeLocalValue(value) {
  const millis = timestampMillis(value);
  if (!millis) return "";
  const date = new Date(millis);
  const pad = (part) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes())
  ].join("");
}

function parseDateTimeLocalValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  if (appState.eventUnsubscribe) {
    appState.eventUnsubscribe();
    appState.eventUnsubscribe = null;
  }
  if (appState.memberUnsubscribe) {
    appState.memberUnsubscribe();
    appState.memberUnsubscribe = null;
  }
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
