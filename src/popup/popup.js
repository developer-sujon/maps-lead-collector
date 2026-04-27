const $ = (sel) => document.querySelector(sel);
const SETTINGS_KEY = "mlc_settings_v1";
const LAST_QUERY_KEY = "mlc_last_query_v1";

const DEFAULT_SETTINGS = {
  emailMode: "off",
  maxLeads: 0,
  delayMs: 250,
  fields: {
    name: true,
    phone: true,
    address: true,
    website: true,
    emails: false,
    rating: true,
    reviews: true,
    category: true,
    placeUrl: true,
    openingHours: false,
    priceRange: false,
    description: false,
    latitude: false,
    longitude: false,
    city: false,
    country: false,
    postalCode: false,
    placeId: false,
    plusCode: false,
    neighborhood: false,
    streetName: false,
    popularTimes: false,
    busyStatus: false,
    photos: false,
    socialLinks: false,
    menuUrl: false,
    amenities: false,
    claimedStatus: false,
    deliveryAvailable: false,
    reviewsData: false
  }
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isMapsUrl(url) {
  return typeof url === "string" && url.startsWith("https://www.google.com/maps");
}

function setVisible(id, visible) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = value;
}

function setRunningUI(running) {
  const pill = $("#running-pill");
  if (pill) {
    pill.classList.toggle("on", Boolean(running));
    pill.classList.toggle("off", !running);
  }
  setText("#running", running ? "Running" : "Stopped");
}

function mergeSettings(s) {
  const ok = s && typeof s === "object" ? s : {};
  const fields = ok.fields && typeof ok.fields === "object" ? ok.fields : {};
  return {
    emailMode: typeof ok.emailMode === "string" ? ok.emailMode : DEFAULT_SETTINGS.emailMode,
    maxLeads: Number.isFinite(Number(ok.maxLeads)) ? Number(ok.maxLeads) : DEFAULT_SETTINGS.maxLeads,
    delayMs: Number.isFinite(Number(ok.delayMs)) ? Number(ok.delayMs) : DEFAULT_SETTINGS.delayMs,
    fields: { ...DEFAULT_SETTINGS.fields, ...fields }
  };
}

async function loadSettings() {
  const res = await chrome.storage.local.get([SETTINGS_KEY]);
  return mergeSettings(res[SETTINGS_KEY]);
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function applySettingsToUI(settings) {
  const fields = settings?.fields || {};
  const map = {
    name: "#f-name",
    phone: "#f-phone",
    address: "#f-address",
    website: "#f-website",
    emails: "#f-emails",
    rating: "#f-rating",
    reviews: "#f-reviews",
    category: "#f-category",
    placeUrl: "#f-placeUrl",
    openingHours: "#f-openingHours",
    priceRange: "#f-priceRange",
    description: "#f-description",
    latitude: "#f-latitude",
    longitude: "#f-longitude",
    city: "#f-city",
    country: "#f-country",
    postalCode: "#f-postalCode",
    placeId: "#f-placeId",
    plusCode: "#f-plusCode",
    neighborhood: "#f-neighborhood",
    streetName: "#f-streetName",
    popularTimes: "#f-popularTimes",
    busyStatus: "#f-busyStatus",
    photos: "#f-photos",
    socialLinks: "#f-socialLinks",
    menuUrl: "#f-menuUrl",
    amenities: "#f-amenities",
    claimedStatus: "#f-claimedStatus",
    deliveryAvailable: "#f-deliveryAvailable",
    reviewsData: "#f-reviewsData"
  };
  for (const [k, sel] of Object.entries(map)) {
    const el = $(sel);
    if (el) el.checked = Boolean(fields[k]);
  }

  const emailMode = $("#email-mode");
  if (emailMode) emailMode.value = String(settings?.emailMode || "off");

  const maxLeads = $("#max-leads");
  if (maxLeads) maxLeads.value = String(Number(settings?.maxLeads || 0));

  const delayMs = $("#delay-ms");
  if (delayMs) delayMs.value = String(Number(settings?.delayMs || 250));
}

async function readSettingsFromUI() {
  const get = (sel) => Boolean($(sel)?.checked);
  const emailMode = String($("#email-mode")?.value || "off");
  const maxLeads = Math.max(0, Math.floor(Number($("#max-leads")?.value || 0)));
  const delayMs = Math.max(0, Math.floor(Number($("#delay-ms")?.value || 250)));
  return {
    emailMode,
    maxLeads,
    delayMs,
    fields: {
      name: get("#f-name"),
      phone: get("#f-phone"),
      address: get("#f-address"),
      website: get("#f-website"),
      emails: get("#f-emails"),
      rating: get("#f-rating"),
      reviews: get("#f-reviews"),
      category: get("#f-category"),
      placeUrl: get("#f-placeUrl"),
      openingHours: get("#f-openingHours"),
      priceRange: get("#f-priceRange"),
      description: get("#f-description"),
      latitude: get("#f-latitude"),
      longitude: get("#f-longitude"),
      city: get("#f-city"),
      country: get("#f-country"),
      postalCode: get("#f-postalCode"),
      placeId: get("#f-placeId"),
      plusCode: get("#f-plusCode"),
      neighborhood: get("#f-neighborhood"),
      streetName: get("#f-streetName"),
      popularTimes: get("#f-popularTimes"),
      busyStatus: get("#f-busyStatus"),
      photos: get("#f-photos"),
      socialLinks: get("#f-socialLinks"),
      menuUrl: get("#f-menuUrl"),
      amenities: get("#f-amenities"),
      claimedStatus: get("#f-claimedStatus"),
      deliveryAvailable: get("#f-deliveryAvailable"),
      reviewsData: get("#f-reviewsData")
    }
  };
}

async function initSettingsUI() {
  const settings = await loadSettings();
  applySettingsToUI(settings);

  $("#email-mode")?.addEventListener("change", async () => {
    const mode = String($("#email-mode")?.value || "off");
    if (mode !== "off") $("#f-emails") && ($("#f-emails").checked = true);
    if (mode === "off") $("#f-emails") && ($("#f-emails").checked = false);
    const next = await readSettingsFromUI();
    await saveSettings(next);
  });

  for (const id of ["#max-leads", "#delay-ms"]) {
    $(id)?.addEventListener("change", async () => {
      const next = await readSettingsFromUI();
      await saveSettings(next);
    });
  }

  const ids = [
    "#f-name",
    "#f-phone",
    "#f-address",
    "#f-website",
    "#f-emails",
    "#f-rating",
    "#f-reviews",
    "#f-category",
    "#f-placeUrl",
    "#f-openingHours",
    "#f-priceRange",
    "#f-description",
    "#f-latitude",
    "#f-longitude",
    "#f-city",
    "#f-country",
    "#f-postalCode",
    "#f-placeId",
    "#f-plusCode",
    "#f-neighborhood",
    "#f-streetName",
    "#f-popularTimes",
    "#f-busyStatus",
    "#f-photos",
    "#f-socialLinks",
    "#f-menuUrl",
    "#f-amenities",
    "#f-claimedStatus",
    "#f-deliveryAvailable",
    "#f-reviewsData"
  ];
  for (const id of ids) {
    $(id)?.addEventListener("change", async () => {
      if (id === "#f-emails") {
        const checked = Boolean($("#f-emails")?.checked);
        if (!checked) $("#email-mode") && ($("#email-mode").value = "off");
        if (checked && String($("#email-mode")?.value || "off") === "off") $("#email-mode") && ($("#email-mode").value = "home");
      }
      const next = await readSettingsFromUI();
      await saveSettings(next);
    });
  }
}

let lastLeads = [];

function leadToSearchText(lead) {
  return [
    lead?.name,
    lead?.phone,
    lead?.address,
    lead?.city,
    lead?.country,
    lead?.postalCode,
    lead?.website,
    lead?.emails,
    lead?.category,
    lead?.description,
    lead?.socialLinks,
    lead?.placeUrl
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
}

function renderLeads(leads) {
  const root = $("#lead-list");
  if (!root) return;
  root.textContent = "";

  const q = String($("#lead-search")?.value || "").trim().toLowerCase();
  const filtered = q ? leads.filter((l) => leadToSearchText(l).includes(q)) : leads;
  const show = filtered.slice(0, 30);

  if (!show.length) {
    const empty = document.createElement("div");
    empty.className = "lead-row";
    empty.textContent = q ? "No match." : "No leads yet.";
    root.appendChild(empty);
    return;
  }

  for (const lead of show) {
    const row = document.createElement("div");
    row.className = "lead-row";
    row.dataset.key = String(lead?._key || "");

    const main = document.createElement("div");
    main.className = "lead-main";

    const name = document.createElement("div");
    name.className = "lead-name";
    name.textContent = String(lead?.name || "(No name)");

    const sub = document.createElement("div");
    sub.className = "lead-sub";
    const bits = [];
    if (lead?.phone) bits.push(lead.phone);
    if (lead?.website) bits.push(lead.website);
    if (lead?.emails) bits.push(lead.emails);
    sub.textContent = bits.join(" • ");

    main.appendChild(name);
    main.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "lead-actions";

    const open = document.createElement("a");
    open.className = "link";
    open.href = "#";
    open.textContent = "Open";

    const del = document.createElement("a");
    del.className = "danger-link";
    del.href = "#";
    del.textContent = "Del";

    actions.appendChild(open);
    actions.appendChild(del);

    row.appendChild(main);
    row.appendChild(actions);
    root.appendChild(row);
  }
}

async function refreshLeads() {
  const res = await chrome.runtime.sendMessage({ type: "GET_LEADS" }).catch(() => null);
  lastLeads = res && res.ok && Array.isArray(res.leads) ? res.leads : [];
  renderLeads(lastLeads);
}

async function refreshState() {
  const tab = await getActiveTab();
  const maps = isMapsUrl(tab?.url);

  setVisible("#view-maps", !maps);
  setVisible("#view-maps-ready", maps);

  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => null);
  if (state && state.ok) {
    setText("#count", String(state.count));
    setRunningUI(Boolean(state.status?.running));
  }

  await refreshLeads();
}

async function sendToContent(type, payload = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: "no_tab" };
  try {
    return await chrome.tabs.sendMessage(tab.id, { type, ...payload });
  } catch (e) {
    const msg = String(e?.message || e);
    const isNoReceiver =
      msg.includes("Receiving end does not exist") ||
      msg.includes("Could not establish connection") ||
      msg.includes("The message port closed");
    if (!isNoReceiver) return { ok: false, error: msg };

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/contentScript.js"]
      });
      await new Promise((r) => setTimeout(r, 200));
      return await chrome.tabs.sendMessage(tab.id, { type, ...payload });
    } catch (e2) {
      return { ok: false, error: String(e2?.message || e2) };
    }
  }
}

function setBusy(busy) {
  for (const id of [
    "#start",
    "#stop",
    "#export",
    "#export-json",
    "#clear",
    "#refresh-leads",
    "#dedupe",
    "#maps-search",
    "#scan-emails"
  ]) {
    const el = $(id);
    if (el) el.disabled = busy;
  }
}

async function start() {
  setBusy(true);
  setText("#status", "Collecting started...");
  const res = await sendToContent("START_COLLECTION");
  if (!res || !res.ok) {
    const tab = await getActiveTab();
    if (tab?.url && !isMapsUrl(tab.url)) {
      setText("#status", "Go to a Google Maps tab and press Start again.");
    } else {
      setText("#status", `Start failed: ${res?.error || "unknown"}`);
    }
  }
  setBusy(false);
  await refreshState();
}

async function stop() {
  setBusy(true);
  setText("#status", "Stopping...");
  const res = await sendToContent("STOP_COLLECTION");
  if (!res || !res.ok) setText("#status", `Stop failed: ${res?.error || "unknown"}`);
  setBusy(false);
  await refreshState();
}

async function clearAll() {
  setBusy(true);
  setText("#status", "Clearing...");
  const res = await chrome.runtime.sendMessage({ type: "CLEAR_ALL" }).catch(() => null);
  if (!res || !res.ok) setText("#status", `Clear failed: ${res?.error || "unknown"}`);
  setBusy(false);
  await refreshState();
}

async function exportCsv() {
  setBusy(true);
  setText("#status", "Preparing CSV...");
  const res = await chrome.runtime.sendMessage({ type: "EXPORT_CSV" }).catch(() => null);
  if (!res || !res.ok) setText("#status", `Export failed: ${res?.error || "unknown"}`);
  else setText("#status", "CSV export started.");
  setBusy(false);
}

async function exportJson() {
  setBusy(true);
  setText("#status", "Preparing JSON...");
  const res = await chrome.runtime.sendMessage({ type: "EXPORT_JSON" }).catch(() => null);
  if (!res || !res.ok) setText("#status", `Export failed: ${res?.error || "unknown"}`);
  else setText("#status", "JSON export started.");
  setBusy(false);
}

async function dedupeLeads() {
  setBusy(true);
  setText("#status", "Removing duplicates...");
  const res = await chrome.runtime.sendMessage({ type: "DEDUPE_LEADS" }).catch(() => null);
  if (!res || !res.ok) setText("#status", `Dedupe failed: ${res?.error || "unknown"}`);
  else setText("#status", `Done. Removed ${res.removed || 0}.`);
  setBusy(false);
  await refreshState();
}

function mapsSearchUrl(query) {
  const q = String(query || "").trim();
  if (!q) return "https://www.google.com/maps";
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

async function openMapsSearch(query) {
  const url = mapsSearchUrl(query);
  await chrome.storage.local.set({ [LAST_QUERY_KEY]: String(query || "").trim() });
  const tab = await getActiveTab();
  if (tab?.id && isMapsUrl(tab.url)) {
    await chrome.tabs.update(tab.id, { url, active: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
  window.close();
}

async function initMapsSearchUI() {
  const res = await chrome.storage.local.get([LAST_QUERY_KEY]).catch(() => ({}));
  const last = String(res?.[LAST_QUERY_KEY] || "");
  const input = $("#maps-query");
  if (input && last) input.value = last;
}

async function scanEmailsFromCurrentTab() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  setBusy(true);
  setText("#emails", "Scanning...");
  const res = await chrome.runtime
    .sendMessage({ type: "EXTRACT_EMAILS_FROM_TAB", tabId: tab.id })
    .catch(() => null);
  const emails = res && res.ok && Array.isArray(res.emails) ? res.emails : [];
  setText("#emails", emails.length ? emails.join("\n") : "No email found.");
  setBusy(false);
}

$("#start")?.addEventListener("click", start);
$("#stop")?.addEventListener("click", stop);
$("#clear")?.addEventListener("click", clearAll);
$("#export")?.addEventListener("click", exportCsv);
$("#export-json")?.addEventListener("click", exportJson);
$("#dedupe")?.addEventListener("click", dedupeLeads);
$("#refresh-leads")?.addEventListener("click", refreshLeads);
$("#maps-search")?.addEventListener("click", async () => {
  const q = String($("#maps-query")?.value || "").trim();
  await openMapsSearch(q);
});
$("#maps-query")?.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const q = String($("#maps-query")?.value || "").trim();
  await openMapsSearch(q);
});
$("#scan-emails")?.addEventListener("click", scanEmailsFromCurrentTab);
$("#lead-search")?.addEventListener("input", () => renderLeads(lastLeads));

$("#lead-list")?.addEventListener("click", async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  const row = t.closest(".lead-row");
  if (!row) return;
  const key = String(row.dataset.key || "");
  if (!key) return;
  if (t.classList.contains("danger-link")) {
    e.preventDefault();
    setBusy(true);
    const res = await chrome.runtime.sendMessage({ type: "DELETE_LEAD", key }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) setText("#status", `Delete failed: ${res?.error || "unknown"}`);
    await refreshState();
    return;
  }
  if (t.classList.contains("link")) {
    e.preventDefault();
    const lead = lastLeads.find((l) => l && l._key === key);
    const url = String(lead?.website || lead?.placeUrl || "").trim();
    if (url) await chrome.tabs.create({ url });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== "string") return;
  if (message.type === "COUNT_UPDATED") {
    setText("#count", String(message.count ?? 0));
    refreshLeads();
  }
  if (message.type === "STATUS_UPDATED") setRunningUI(Boolean(message.status?.running));
});

refreshState();
initSettingsUI();
initMapsSearchUI();
