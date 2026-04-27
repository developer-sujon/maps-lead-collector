const STORAGE_KEY = "mlc_leads_v1";
const STATUS_KEY = "mlc_status_v1";
const SETTINGS_KEY = "mlc_settings_v1";
const EMAIL_CACHE_KEY = "mlc_email_cache_v1";

const EMAIL_MAX_TIMEOUT_MS = 10000;
const EMAIL_MAX_BYTES = 220_000;
const MAX_EMAIL_CACHE_ITEMS = 500;

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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function leadKey(lead) {
  if (lead && lead.placeUrl) return `place:${normalizeText(lead.placeUrl)}`;
  const name = normalizeText(lead?.name);
  const address = normalizeText(lead?.address);
  const phone = normalizeText(lead?.phone);
  const website = normalizeText(lead?.website);
  return `na:${name}|${address}|${phone}|${website}`;
}

function normalizeWebsiteUrl(input) {
  try {
    const u = new URL(String(input || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
    u.username = "";
    u.password = "";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return "";
  }
}

function websiteOriginKey(input) {
  try {
    const u = new URL(String(input || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

function originHomeUrl(origin) {
  if (!origin) return "";
  return `${origin}/`;
}

async function getLeads() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const leads = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  return leads;
}

async function setLeads(leads) {
  await chrome.storage.local.set({ [STORAGE_KEY]: leads });
}

async function getStatus() {
  const result = await chrome.storage.local.get([STATUS_KEY]);
  const status = result[STATUS_KEY] || { running: false, updatedAt: null };
  return status;
}

async function setStatus(status) {
  await chrome.storage.local.set({ [STATUS_KEY]: status });
  chrome.runtime.sendMessage({ type: "STATUS_UPDATED", status }).catch(() => {});
}

async function broadcastCount(count) {
  chrome.runtime.sendMessage({ type: "COUNT_UPDATED", count }).catch(() => {});
}

async function getSettings() {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  const s = result[SETTINGS_KEY];
  if (!s || typeof s !== "object") return DEFAULT_SETTINGS;
  const fields = s.fields && typeof s.fields === "object" ? s.fields : {};
  return {
    emailMode: typeof s.emailMode === "string" ? s.emailMode : DEFAULT_SETTINGS.emailMode,
    maxLeads: Number.isFinite(Number(s.maxLeads)) ? Number(s.maxLeads) : DEFAULT_SETTINGS.maxLeads,
    delayMs: Number.isFinite(Number(s.delayMs)) ? Number(s.delayMs) : DEFAULT_SETTINGS.delayMs,
    fields: {
      ...DEFAULT_SETTINGS.fields,
      ...fields
    }
  };
}

async function getEmailCache() {
  const result = await chrome.storage.local.get([EMAIL_CACHE_KEY]);
  const cache = result[EMAIL_CACHE_KEY];
  if (cache && typeof cache === "object") return cache;
  return {};
}

async function setEmailCache(cache) {
  await chrome.storage.local.set({ [EMAIL_CACHE_KEY]: cache });
}

function cacheEntryFresh(entry) {
  if (!entry || typeof entry !== "object") return false;
  const ts = Number(entry.ts || 0);
  if (!ts) return false;
  const age = Date.now() - ts;
  const emails = Array.isArray(entry.emails) ? entry.emails : [];
  if (emails.length) return age < 30 * 24 * 60 * 60 * 1000;
  return age < 6 * 60 * 60 * 1000;
}

function pruneCache(cache) {
  const entries = Object.entries(cache || {});
  if (entries.length <= MAX_EMAIL_CACHE_ITEMS) return cache;
  entries.sort((a, b) => Number(a[1]?.ts || 0) - Number(b[1]?.ts || 0));
  const toRemove = entries.length - MAX_EMAIL_CACHE_ITEMS;
  for (let i = 0; i < toRemove; i += 1) delete cache[entries[i][0]];
  return cache;
}

function extractEmailsFromHtml(html) {
  const emails = new Set();
  const mailtoRegex = /mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
  const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

  let match = null;
  while ((match = mailtoRegex.exec(html))) emails.add(match[1].toLowerCase());
  while ((match = emailRegex.exec(html))) emails.add(match[0].toLowerCase());

  return Array.from(emails).slice(0, 20);
}

function extractCandidatePaths(html) {
  const candidates = new Set();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match = null;
  while ((match = hrefRegex.exec(String(html || "")))) {
    const href = String(match[1] || "").trim();
    if (!href) continue;
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    try {
      const u = new URL(href, "https://x.invalid");
      const path = u.pathname || "/";
      const low = path.toLowerCase();
      if (low.includes("contact") || low.includes("about") || low.includes("support")) candidates.add(path);
    } catch {}
    if (candidates.size >= 8) break;
  }
  const common = ["/contact", "/contact-us", "/about", "/about-us", "/support", "/help"];
  for (const p of common) candidates.add(p);
  return Array.from(candidates).slice(0, 8);
}

async function readLimitedText(response, maxBytes) {
  try {
    const body = response.body;
    if (!body || typeof body.getReader !== "function") return await response.text();
    const reader = body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - received;
      if (remaining <= 0) {
        try {
          await reader.cancel();
        } catch {}
        break;
      }

      if (value.byteLength <= remaining) {
        chunks.push(value);
        received += value.byteLength;
      } else {
        chunks.push(value.slice(0, remaining));
        received += remaining;
        try {
          await reader.cancel();
        } catch {}
        break;
      }
    }

    if (!chunks.length) return "";
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return new TextDecoder("utf-8").decode(merged);
  } catch {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }
}

async function fetchHtmlAndEmails(url, timeoutMs) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    clearTimeout(timeout);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return { html: "", emails: [] };
    const html = await readLimitedText(res, EMAIL_MAX_BYTES);
    return { html, emails: extractEmailsFromHtml(html) };
  } catch {
    return { html: "", emails: [] };
  }
}

function toCsvValue(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(String(str ?? ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function leadsToCsv(leads, fields) {
  const ordered = [
    "name",
    "phone",
    "address",
    "website",
    "emails",
    "category",
    "openingHours",
    "priceRange",
    "description",
    "rating",
    "reviews",
    "reviewsData",
    "latitude",
    "longitude",
    "city",
    "country",
    "postalCode",
    "placeId",
    "plusCode",
    "neighborhood",
    "streetName",
    "busyStatus",
    "popularTimes",
    "photos",
    "socialLinks",
    "menuUrl",
    "amenities",
    "claimedStatus",
    "deliveryAvailable",
    "placeUrl"
  ];
  const enabled = ordered.filter((k) => fields?.[k] === true);
  const headers = enabled.length ? enabled : ["name", "phone"];

  const lines = [headers.join(",")];
  for (const lead of leads) {
    const row = headers.map((h) => toCsvValue(lead?.[h]));
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function pickFields(lead, fields) {
  const ordered = [
    "name",
    "phone",
    "address",
    "website",
    "emails",
    "category",
    "openingHours",
    "priceRange",
    "description",
    "rating",
    "reviews",
    "reviewsData",
    "latitude",
    "longitude",
    "city",
    "country",
    "postalCode",
    "placeId",
    "plusCode",
    "neighborhood",
    "streetName",
    "busyStatus",
    "popularTimes",
    "photos",
    "socialLinks",
    "menuUrl",
    "amenities",
    "claimedStatus",
    "deliveryAvailable",
    "placeUrl"
  ];
  const enabled = ordered.filter((k) => fields?.[k] === true);
  const keys = enabled.length ? enabled : ["name", "phone"];
  const out = {};
  for (const k of keys) out[k] = lead?.[k] ?? "";
  return out;
}

async function clearAll() {
  await chrome.storage.local.remove([STORAGE_KEY, STATUS_KEY, EMAIL_CACHE_KEY]);
  await broadcastCount(0);
  await setStatus({ running: false, updatedAt: Date.now() });
}

async function enrichEmails(website, mode, timeoutMs) {
  const origin = websiteOriginKey(website);
  if (!origin) return [];

  const cache = await getEmailCache();
  const entry = cache[origin];
  if (cacheEntryFresh(entry)) return Array.isArray(entry.emails) ? entry.emails : [];

  const start = Date.now();
  const timeLeft = () => timeoutMs - (Date.now() - start);

  const tryFetch = async (url) => {
    const left = timeLeft();
    if (left < 1500) return { html: "", emails: [] };
    return await fetchHtmlAndEmails(url, left);
  };

  const home = originHomeUrl(origin);
  const first = await tryFetch(home);
  if (first.emails.length) {
    cache[origin] = { emails: first.emails, ts: Date.now() };
    pruneCache(cache);
    await setEmailCache(cache);
    return first.emails;
  }

  if (mode !== "deep") {
    cache[origin] = { emails: [], ts: Date.now() };
    pruneCache(cache);
    await setEmailCache(cache);
    return [];
  }

  const paths = extractCandidatePaths(first.html);
  const seen = new Set();
  for (const p of paths) {
    const left = timeLeft();
    if (left < 1500) break;
    const url = `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await tryFetch(url);
    if (res.emails.length) {
      cache[origin] = { emails: res.emails, ts: Date.now() };
      pruneCache(cache);
      await setEmailCache(cache);
      return res.emails;
    }
  }

  cache[origin] = { emails: [], ts: Date.now() };
  pruneCache(cache);
  await setEmailCache(cache);
  return [];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") return;

    if (message.type === "GET_STATE") {
      const leads = await getLeads();
      const status = await getStatus();
      sendResponse({ ok: true, count: leads.length, status });
      return;
    }

    if (message.type === "GET_LEADS") {
      const leads = await getLeads();
      sendResponse({ ok: true, leads });
      return;
    }

    if (message.type === "SET_RUNNING") {
      const running = Boolean(message.running);
      await setStatus({ running, updatedAt: Date.now() });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "CLEAR_ALL") {
      await clearAll();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "ADD_LEAD") {
      const incoming = message.lead || {};
      const leads = await getLeads();
      const existingKeys = new Set(leads.map(leadKey));
      const key = leadKey(incoming);
      if (existingKeys.has(key)) {
        sendResponse({ ok: true, added: false, count: leads.length, key });
        return;
      }
      const next = leads.concat([{ ...incoming, _key: key }]);
      await setLeads(next);
      await broadcastCount(next.length);
      sendResponse({ ok: true, added: true, count: next.length, key });
      return;
    }

    if (message.type === "UPDATE_LEAD") {
      const key = String(message.key || "");
      const patch = message.patch && typeof message.patch === "object" ? message.patch : null;
      if (!key || !patch) {
        sendResponse({ ok: false, error: "bad_args" });
        return;
      }
      const leads = await getLeads();
      const idx = leads.findIndex((l) => l && l._key === key);
      if (idx < 0) {
        sendResponse({ ok: false, error: "not_found" });
        return;
      }
      leads[idx] = { ...leads[idx], ...patch };
      await setLeads(leads);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "DELETE_LEAD") {
      const key = String(message.key || "");
      if (!key) {
        sendResponse({ ok: false, error: "bad_args" });
        return;
      }
      const leads = await getLeads();
      const next = leads.filter((l) => l && l._key !== key);
      await setLeads(next);
      await broadcastCount(next.length);
      sendResponse({ ok: true, count: next.length });
      return;
    }

    if (message.type === "DEDUPE_LEADS") {
      const leads = await getLeads();
      const seen = new Set();
      const next = [];
      for (const l of leads) {
        const k = leadKey(l);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ ...l, _key: k });
      }
      await setLeads(next);
      await broadcastCount(next.length);
      sendResponse({ ok: true, removed: leads.length - next.length, count: next.length });
      return;
    }

    if (message.type === "ENRICH_EMAILS") {
      const website = normalizeWebsiteUrl(message.website);
      if (!website) {
        sendResponse({ ok: true, emails: [] });
        return;
      }

      const timeoutMsRaw = Number(message.timeoutMs || 0);
      const timeoutMs = Math.max(1500, Math.min(EMAIL_MAX_TIMEOUT_MS, timeoutMsRaw || EMAIL_MAX_TIMEOUT_MS));
      const mode = String(message.mode || "home");
      if (mode === "off") {
        sendResponse({ ok: true, emails: [] });
        return;
      }
      const emails = await enrichEmails(website, mode === "deep" ? "deep" : "home", timeoutMs);
      sendResponse({ ok: true, emails });
      return;
    }

    if (message.type === "EXPORT_CSV") {
      const leads = await getLeads();
      const settings = await getSettings();
      const csv = "\ufeff" + leadsToCsv(leads, settings.fields);
      const url = `data:text/csv;charset=utf-8;base64,${toBase64Utf8(csv)}`;
      const filename = `maps-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      const downloadId = await chrome.downloads.download({
        url,
        filename,
        saveAs: true
      });
      sendResponse({ ok: true, downloadId });
      return;
    }

    if (message.type === "EXPORT_JSON") {
      const leads = await getLeads();
      const settings = await getSettings();
      const rows = leads.map((l) => pickFields(l, settings.fields));
      const json = JSON.stringify(rows, null, 2);
      const url = `data:application/json;charset=utf-8;base64,${toBase64Utf8(json)}`;
      const filename = `maps-leads-${new Date().toISOString().slice(0, 10)}.json`;
      const downloadId = await chrome.downloads.download({
        url,
        filename,
        saveAs: true
      });
      sendResponse({ ok: true, downloadId });
      return;
    }

    if (message.type === "EXTRACT_EMAILS_FROM_TAB") {
      const tabId = message.tabId;
      if (typeof tabId !== "number") {
        sendResponse({ ok: false, error: "tabId_missing" });
        return;
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "ISOLATED",
        func: () => {
          const emails = new Set();
          const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

          const addFromString = (s) => {
            if (!s) return;
            const matches = String(s).match(emailRegex) || [];
            for (const m of matches) emails.add(m.toLowerCase());
          };

          for (const a of Array.from(document.querySelectorAll("a[href]"))) {
            const href = a.getAttribute("href") || "";
            if (href.startsWith("mailto:")) {
              const v = href.slice("mailto:".length).split("?")[0];
              addFromString(v);
            } else {
              addFromString(href);
            }
            addFromString(a.textContent || "");
          }

          addFromString(document.body?.innerText || "");
          return Array.from(emails).slice(0, 30);
        }
      });
      const emails = Array.isArray(results) && results[0] ? results[0].result || [] : [];
      sendResponse({ ok: true, emails });
      return;
    }
  })()
    .then(() => {})
    .catch((err) => {
      sendResponse({ ok: false, error: String(err?.message || err) });
    });

  return true;
});
