if (globalThis.__mlcContentLoaded) {}
globalThis.__mlcContentLoaded = true;

let running = false;
let stopRequested = false;
let lastSentCount = 0;
const SETTINGS_KEY = "mlc_settings_v1";

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
    rating: false,
    reviews: false,
    category: false,
    placeUrl: false,
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

let currentSettings = DEFAULT_SETTINGS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  currentSettings = mergeSettings(res[SETTINGS_KEY]);
}

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes[SETTINGS_KEY]) return;
  currentSettings = mergeSettings(changes[SETTINGS_KEY].newValue);
});

function textOf(el) {
  if (!el) return "";
  return (el.textContent || "").trim();
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

function findFeed() {
  return (
    document.querySelector('div[role="feed"]') ||
    document.querySelector('div[role="main"] div[role="feed"]') ||
    null
  );
}

function getFeedItems(feed) {
  if (!feed) return [];
  const items = Array.from(feed.querySelectorAll('div[role="article"]'));
  return items;
}

function isDetailsOpen() {
  return Boolean(document.querySelector('h1[class*="DUwDvf"]') || document.querySelector('h1'));
}

function findDetailsRoot() {
  const nameEl =
    document.querySelector('h1[class*="DUwDvf"]') ||
    document.querySelector('h1[class*="fontHeadlineLarge"]') ||
    document.querySelector('h1');
  if (!nameEl) return null;
  return nameEl.closest('div[role="main"]') || document.body;
}

function getDataItemText(root, itemId) {
  if (!root) return "";
  const button =
    root.querySelector(`button[data-item-id="${itemId}"]`) ||
    root.querySelector(`div[data-item-id="${itemId}"]`) ||
    root.querySelector(`a[data-item-id="${itemId}"]`) ||
    null;
  if (!button) return "";
  const aria = button.getAttribute("aria-label") || "";
  const raw = firstNonEmpty(aria, textOf(button));
  const normalized = raw.replace(/^(Address|Phone|Website|Directions|Located in|Plus code|Add website)\s*:\s*/i, "");
  return normalized.trim();
}

function normalizePhoneText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const cleaned = raw
    .replace(/^(Phone|Call|Copy phone number|Phone number|Telephone|Tel)\s*:?\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const match = cleaned.match(/\+?\d[\d\s().-]{6,}\d/);
  return match ? match[0].replace(/\s{2,}/g, " ").trim() : "";
}

function findPhone(root) {
  if (!root) return "";

  const direct = [
    getDataItemText(root, "phone"),
    getDataItemText(root, "phone:tel")
  ];
  for (const value of direct) {
    const phone = normalizePhoneText(value);
    if (phone) return phone;
  }

  const nodes = Array.from(
    root.querySelectorAll(
      [
        'a[href^="tel:"]',
        'button[data-item-id^="phone"]',
        'div[data-item-id^="phone"]',
        'a[data-item-id^="phone"]',
        'button[aria-label*="phone" i]',
        'div[aria-label*="phone" i]',
        'a[aria-label*="phone" i]',
        'button[aria-label*="call" i]',
        'a[aria-label*="call" i]'
      ].join(",")
    )
  ).slice(0, 25);

  for (const node of nodes) {
    const candidates = [
      node.getAttribute("href") || "",
      node.getAttribute("aria-label") || "",
      textOf(node)
    ];
    for (const candidate of candidates) {
      const normalized = normalizePhoneText(String(candidate).replace(/^tel:/i, ""));
      if (normalized) return normalized;
    }
  }

  return "";
}

function getWebsiteUrl(root) {
  if (!root) return "";
  const a =
    root.querySelector('a[data-item-id="authority"][href]') ||
    root.querySelector('a[aria-label^="Website:"][href]') ||
    root.querySelector('a[href^="http"][data-tooltip*="website" i]') ||
    root.querySelector('a[href^="http"][jsaction*="website" i]') ||
    null;
  if (a) return a.href;
  const t = getDataItemText(root, "authority");
  if (t && /^https?:\/\//i.test(t)) return t;
  return "";
}

function parseRatingAndReviews(root) {
  if (!root) return { rating: "", reviews: "" };
  const ratingEl =
    root.querySelector('div.F7nice span[aria-hidden="true"]') ||
    root.querySelector('span[aria-label*="stars" i]') ||
    root.querySelector('span[role="img"][aria-label*="stars" i]') ||
    null;
  let rating = "";
  if (ratingEl) {
    const aria = ratingEl.getAttribute("aria-label") || "";
    const txt = textOf(ratingEl);
    rating = firstNonEmpty(txt, aria).replace(/[^0-9.]/g, "").trim();
  }

  const reviewsEl =
    root.querySelector('button[aria-label*="reviews" i]') ||
    root.querySelector('a[aria-label*="reviews" i]') ||
    null;
  let reviews = "";
  if (reviewsEl) {
    const aria = reviewsEl.getAttribute("aria-label") || "";
    const txt = firstNonEmpty(aria, textOf(reviewsEl));
    const m = txt.match(/([\d,]+)\s+reviews/i);
    reviews = m ? m[1].replace(/,/g, "") : txt.replace(/[^\d,]/g, "").replace(/,/g, "");
  }
  return { rating, reviews };
}

function parseCategory(root) {
  if (!root) return "";
  const el =
    root.querySelector('button[jsaction*="pane.rating.category" i]') ||
    root.querySelector('button[aria-label^="Category:" i]') ||
    root.querySelector('div[aria-label^="Category:" i]') ||
    null;
  if (el) {
    const aria = el.getAttribute("aria-label") || "";
    const raw = firstNonEmpty(aria, textOf(el));
    return raw.replace(/^Category\s*:\s*/i, "").trim();
  }
  const chips = Array.from(root.querySelectorAll('button[class*="DkEaL"]')).map(textOf).filter(Boolean);
  return chips[0] || "";
}

function parseName(root) {
  const el =
    document.querySelector('h1[class*="DUwDvf"]') ||
    document.querySelector('h1[class*="fontHeadlineLarge"]') ||
    document.querySelector("h1");
  const name = textOf(el);
  if (name) return name;
  return "";
}

function currentPlaceUrl() {
  const u = location.href;
  if (u.includes("/maps/")) return u;
  return "";
}

function parseLatLngFromUrl(url) {
  const u = String(url || "");
  let m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { latitude: m[1], longitude: m[2] };
  m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { latitude: m[1], longitude: m[2] };
  return { latitude: "", longitude: "" };
}

function parsePostalCode(address) {
  const a = String(address || "");
  const m = a.match(/(?:^|[^0-9])(\d{4,10}(?:-\d{4})?)(?:[^0-9]|$)/);
  return m ? m[1] : "";
}

function parseAddressParts(address) {
  const raw = String(address || "").trim();
  if (!raw) return { streetName: "", neighborhood: "", city: "", country: "", postalCode: "" };
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const country = parts.length >= 1 ? parts[parts.length - 1] : "";
  const city = parts.length >= 2 ? parts[parts.length - 2] : "";
  const streetName = parts.length >= 1 ? parts[0] : "";
  const neighborhood = parts.length >= 3 ? parts[1] : "";
  const postalCode = parsePostalCode(raw);
  return { streetName, neighborhood, city, country, postalCode };
}

function findPriceRange(root) {
  if (!root) return "";
  const byLabel = Array.from(root.querySelectorAll('[aria-label*="Price" i]')).map((e) => e.getAttribute("aria-label") || "");
  for (const s of byLabel) {
    const m = s.match(/\$+/);
    if (m) return m[0];
  }
  const spans = Array.from(root.querySelectorAll("span")).slice(0, 500);
  for (const sp of spans) {
    const t = textOf(sp);
    if (t && /^\$+\s*$/.test(t) && t.length <= 6) return t.trim();
  }
  return "";
}

function findOpeningHours(root) {
  const t = getDataItemText(root, "oh");
  if (t) return t;
  const btn =
    root?.querySelector('button[aria-label^="Hours" i]') ||
    root?.querySelector('div[aria-label^="Hours" i]') ||
    null;
  const aria = btn ? btn.getAttribute("aria-label") || "" : "";
  return aria.replace(/^Hours\s*:\s*/i, "").trim();
}

function findPlusCode(root) {
  const raw = getDataItemText(root, "oloc") || getDataItemText(root, "locatedin") || "";
  const m = String(raw).match(/([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i);
  return m ? m[1].toUpperCase() : "";
}

function findSectionText(root, titles) {
  const wanted = (titles || []).map((t) => String(t || "").toLowerCase()).filter(Boolean);
  if (!root || !wanted.length) return "";
  const nodes = Array.from(root.querySelectorAll('[role="heading"], h2, h3, div[aria-level]')).slice(0, 250);
  for (const n of nodes) {
    const tt = textOf(n).toLowerCase();
    if (!tt) continue;
    const ok = wanted.some((w) => tt.includes(w));
    if (!ok) continue;
    const container = n.closest("section") || n.parentElement;
    const content = container ? textOf(container) : "";
    const cleaned = content.replace(textOf(n), "").trim();
    if (cleaned) return cleaned.slice(0, 700);
  }
  return "";
}

function findBusyStatus(root) {
  const text = String(root?.innerText || "");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const l of lines) {
    const low = l.toLowerCase();
    if (low.includes("busy") || low.includes("not too busy") || low.includes("usually")) return l.slice(0, 220);
  }
  return "";
}

function findPopularTimes(root) {
  const text = String(root?.innerText || "");
  const idx = text.toLowerCase().indexOf("popular times");
  if (idx < 0) return "";
  return text.slice(idx, idx + 700).replace(/\s+/g, " ").trim();
}

function collectPhotos(root) {
  const imgs = Array.from((root || document).querySelectorAll("img[src]"));
  const urls = [];
  const seen = new Set();
  for (const img of imgs) {
    const src = String(img.getAttribute("src") || "");
    if (!src) continue;
    const low = src.toLowerCase();
    if (!low.includes("googleusercontent.com") && !low.includes("ggpht.com") && !low.includes("lh3.googleusercontent.com")) continue;
    if (seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
    if (urls.length >= 10) break;
  }
  return urls;
}

function collectSocialLinks(root) {
  const anchors = Array.from((root || document).querySelectorAll("a[href]"));
  const urls = [];
  const seen = new Set();
  const ok = (href) => {
    const h = String(href || "").toLowerCase();
    return (
      h.includes("facebook.com") ||
      h.includes("instagram.com") ||
      h.includes("tiktok.com") ||
      h.includes("twitter.com") ||
      h.includes("x.com") ||
      h.includes("linkedin.com") ||
      h.includes("youtube.com") ||
      h.includes("wa.me") ||
      h.includes("whatsapp.com")
    );
  };
  for (const a of anchors) {
    const href = String(a.href || "");
    if (!href) continue;
    if (!ok(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(href);
    if (urls.length >= 10) break;
  }
  return urls;
}

function findMenuUrl(root) {
  const anchors = Array.from((root || document).querySelectorAll("a[href]"));
  for (const a of anchors) {
    const txt = textOf(a).toLowerCase();
    const aria = String(a.getAttribute("aria-label") || "").toLowerCase();
    if (txt.includes("menu") || aria.includes("menu")) return String(a.href || "");
  }
  return "";
}

function collectAmenities(root) {
  const text = String(root?.innerText || "");
  const keys = [
    "Dine-in",
    "Takeout",
    "Delivery",
    "Curbside pickup",
    "Wheelchair accessible",
    "Outdoor seating",
    "Reservations",
    "Wi-Fi",
    "Parking",
    "Live music",
    "Good for kids"
  ];
  const found = [];
  for (const k of keys) {
    if (text.toLowerCase().includes(k.toLowerCase())) found.push(k);
  }
  return found;
}

function detectClaimedStatus(root) {
  const text = String(root?.innerText || "").toLowerCase();
  if (text.includes("claim this business") || text.includes("own this business")) return "Unclaimed";
  return "";
}

function detectDelivery(root, amenities) {
  const a = Array.isArray(amenities) ? amenities : [];
  if (a.some((x) => String(x).toLowerCase().includes("delivery"))) return "Yes";
  const text = String(root?.innerText || "").toLowerCase();
  if (text.includes("delivery")) return "Yes";
  return "";
}

async function collectReviewsData(root, limit) {
  const btn =
    root?.querySelector('button[jsaction*="review" i]') ||
    root?.querySelector('button[aria-label*="reviews" i]') ||
    root?.querySelector('div[aria-label*="reviews" i][role="button"]') ||
    null;

  if (!btn) return "";
  try {
    btn.click();
  } catch {}

  const startedAt = Date.now();
  while (Date.now() - startedAt < 2500) {
    const cards = Array.from(document.querySelectorAll("div[data-review-id]"));
    if (cards.length) break;
    await sleep(150);
  }

  const cards = Array.from(document.querySelectorAll("div[data-review-id]")).slice(0, Math.max(1, Math.min(10, limit || 5)));
  const out = [];

  for (const c of cards) {
    const ratingEl = c.querySelector('span[role="img"][aria-label*="star" i]');
    const ratingAria = ratingEl ? String(ratingEl.getAttribute("aria-label") || "") : "";
    const rating = (ratingAria.match(/([0-9.]+)\s*star/i) || [])[1] || "";

    const nameEl = c.querySelector(".d4r55") || c.querySelector('span[class*="d4r55"]') || c.querySelector('a[aria-label][href*="contrib"]');
    const reviewerName = textOf(nameEl);

    const dateEl = c.querySelector(".rsqaWe") || c.querySelector('span[class*="rsqaWe"]');
    const reviewDate = textOf(dateEl);

    const textEl = c.querySelector('span[jsname="bN97Pc"]') || c.querySelector('span[jsname="fbQN7e"]') || c.querySelector(".wiI7pd");
    const reviewText = textOf(textEl);

    let ownerReply = "";
    const replyNode = Array.from(c.querySelectorAll("div,span")).find((n) =>
      String(textOf(n) || "").toLowerCase().includes("response from the owner")
    );
    if (replyNode) {
      const parent = replyNode.parentElement;
      ownerReply = parent ? textOf(parent).replace(textOf(replyNode), "").trim() : "";
    }

    const photos = Array.from(c.querySelectorAll("img[src]"))
      .map((i) => String(i.getAttribute("src") || ""))
      .filter((s) => s && (s.includes("googleusercontent.com") || s.includes("ggpht.com")))
      .slice(0, 6);

    out.push({
      reviewerName,
      reviewDate,
      rating,
      reviewText,
      ownerReply,
      reviewPhotos: photos
    });
  }

  try {
    const back =
      document.querySelector('button[aria-label="Back" i]') ||
      document.querySelector('button[aria-label*="Back" i]') ||
      null;
    if (back) back.click();
  } catch {}

  if (!out.length) return "";
  try {
    return JSON.stringify(out);
  } catch {
    return "";
  }
}

async function openItem(item) {
  if (!item) return false;
  const clickable =
    item.querySelector('a[href][aria-label]') ||
    item.querySelector('a[href]') ||
    item.querySelector('div[role="button"]') ||
    item;
  clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  clickable.click();
  return true;
}

async function waitForDetailsChange(prevName) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (stopRequested) return false;
    const root = findDetailsRoot();
    const name = root ? parseName(root) : "";
    if (name && name !== prevName) return true;
    await sleep(200);
  }
  return false;
}

async function collectCurrentDetails() {
  const root = findDetailsRoot();
  if (!root) return null;

  const name = parseName(root);
  if (!name) return null;

  const address = getDataItemText(root, "address");
  const phone = findPhone(root);
  const website = getWebsiteUrl(root) || getDataItemText(root, "authority");
  const { rating, reviews } = parseRatingAndReviews(root);
  const category = parseCategory(root);
  const placeUrl = currentPlaceUrl();
  const openingHours = findOpeningHours(root);
  const priceRange = findPriceRange(root);
  const description = findSectionText(root, ["From the business", "About", "Description"]);
  const { latitude, longitude } = parseLatLngFromUrl(placeUrl);
  const plusCode = findPlusCode(root);
  const addrParts = parseAddressParts(address);
  const popularTimes = findPopularTimes(root);
  const busyStatus = findBusyStatus(root);
  const photosArr = collectPhotos(root);
  const socialArr = collectSocialLinks(root);
  const menuUrl = findMenuUrl(root);
  const amenitiesArr = collectAmenities(root);
  const claimedStatus = detectClaimedStatus(root);
  const deliveryAvailable = detectDelivery(root, amenitiesArr);
  const placeId = "";

  let reviewsData = "";
  const fields = currentSettings?.fields || DEFAULT_SETTINGS.fields;
  if (fields.reviewsData) reviewsData = await collectReviewsData(root, 5);

  return {
    name,
    phone,
    address,
    website,
    rating,
    reviews,
    category,
    openingHours,
    priceRange,
    description,
    latitude,
    longitude,
    city: addrParts.city,
    country: addrParts.country,
    postalCode: addrParts.postalCode,
    placeId,
    plusCode,
    neighborhood: addrParts.neighborhood,
    streetName: addrParts.streetName,
    popularTimes,
    busyStatus,
    photos: photosArr.join("; "),
    socialLinks: socialArr.join("; "),
    menuUrl,
    amenities: amenitiesArr.join("; "),
    claimedStatus,
    deliveryAvailable,
    reviewsData,
    placeUrl,
    emails: ""
  };
}

function emailMode() {
  const mode = String(currentSettings?.emailMode || "off");
  if (mode === "deep") return "deep";
  if (mode === "home") return "home";
  return "off";
}

async function fetchEmailsIfEnabled(lead) {
  const mode = emailMode();
  if (mode === "off") return [];
  const website = String(lead.website || "").trim();
  if (!website || !/^https?:\/\//i.test(website)) return [];
  const res = await chrome.runtime
    .sendMessage({ type: "ENRICH_EMAILS", website, mode, timeoutMs: 10000 })
    .catch(() => null);
  const emails = res && res.ok && Array.isArray(res.emails) ? res.emails : [];
  return emails;
}

async function addLead(lead) {
  const res = await chrome.runtime.sendMessage({ type: "ADD_LEAD", lead }).catch(() => null);
  if (res && res.ok) {
    if (typeof res.count === "number" && res.count !== lastSentCount) {
      lastSentCount = res.count;
      chrome.runtime.sendMessage({ type: "COUNT_UPDATED", count: res.count }).catch(() => {});
    }

    const maxLeads = Math.max(0, Math.floor(Number(currentSettings?.maxLeads || 0)));
    if (maxLeads > 0 && typeof res.count === "number" && res.count >= maxLeads) {
      stopRequested = true;
    }

    if (res.added === true && res.key && emailMode() !== "off") {
      const emails = await fetchEmailsIfEnabled(lead);
      if (emails.length) {
        await chrome.runtime
          .sendMessage({ type: "UPDATE_LEAD", key: res.key, patch: { emails: emails.join("; ") } })
          .catch(() => null);
      }
    }
  }
}

async function scrollFeed(feed) {
  const before = feed.scrollTop;
  feed.scrollTop = feed.scrollHeight;
  const delayMs = Math.max(0, Math.floor(Number(currentSettings?.delayMs || 250)));
  await sleep(Math.max(250, Math.min(1200, delayMs * 3)));
  const after = feed.scrollTop;
  return after !== before;
}

async function collectLoop() {
  if (running) return;
  running = true;
  stopRequested = false;
  await loadSettings();
  await chrome.runtime.sendMessage({ type: "SET_RUNNING", running: true }).catch(() => {});

  const feed = findFeed();
  if (!feed) {
    running = false;
    await chrome.runtime.sendMessage({ type: "SET_RUNNING", running: false }).catch(() => {});
    return;
  }

  const processed = new Set();
  let prevName = "";
  let noNewRounds = 0;

  while (!stopRequested) {
    const items = getFeedItems(feed);
    let didNew = false;

    for (const item of items) {
      if (stopRequested) break;
      const id =
        item.getAttribute("data-result-id") ||
        item.querySelector('a[href*="/maps/place/"]')?.getAttribute("href") ||
        item.querySelector('a[href]')?.getAttribute("href") ||
        textOf(item.querySelector('div[role="heading"]')) ||
        textOf(item);

      const key = String(id || "").slice(0, 500);
      if (!key || processed.has(key)) continue;
      processed.add(key);
      didNew = true;

      await openItem(item);
      const changed = await waitForDetailsChange(prevName);
      if (!changed) continue;

      const details = await collectCurrentDetails();
      if (!details) continue;
      prevName = details.name;

      await addLead(details);
      const delayMs = Math.max(0, Math.floor(Number(currentSettings?.delayMs || 250)));
      await sleep(Math.max(0, Math.min(2000, delayMs)));
    }

    const scrolled = await scrollFeed(feed);
    if (!didNew && !scrolled) {
      noNewRounds += 1;
      if (noNewRounds >= 3) break;
    } else {
      noNewRounds = 0;
    }
  }

  running = false;
  stopRequested = false;
  await chrome.runtime.sendMessage({ type: "SET_RUNNING", running: false }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") return;

    if (message.type === "START_COLLECTION") {
      collectLoop();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "STOP_COLLECTION") {
      stopRequested = true;
      sendResponse({ ok: true });
      return;
    }
  })()
    .then(() => {})
    .catch((err) => {
      sendResponse({ ok: false, error: String(err?.message || err) });
    });

  return true;
});
