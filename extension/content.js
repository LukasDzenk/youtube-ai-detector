const YAB_REPORT_CONTAINER_ID = "yab-report-container";

let settings = {
  pageHome: true, pageSearch: true, pageWatch: true, pageShorts: true, pageSubs: true,
  colorTheme: "default",
  customFlagged: "#ff9100", customReported: "#f44336",
};
let currentVideoId = null;
let currentInfo = null;
let preNavigateButtons = null;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function loadSettings() {
  yabSetDevMode(YAB_CONFIG.devMode);
  chrome.runtime.sendMessage({ type: "getSettings" }, (resp) => {
    if (resp) {
      settings = resp;
      yabLog("Settings loaded:", settings);
      applyTheme(settings.colorTheme);
    }
  });
}

chrome.storage.onChanged.addListener((changes) => {
  for (const key of Object.keys(settings)) {
    if (changes[key]) settings[key] = changes[key].newValue;
  }
  if (changes.colorTheme || changes.customFlagged || changes.customReported) {
    applyTheme(settings.colorTheme);
  }
  applySettingsVisibility();
});

function getPageType() {
  const path = location.pathname;
  if (path === "/" || path === "/feed/trending" || path.startsWith("/feed/explore")) return "home";
  if (path.startsWith("/results") || path.startsWith("/hashtag")) return "search";
  if (path.startsWith("/watch") || path.startsWith("/clip")) return "watch";
  if (path.startsWith("/shorts")) return "shorts";
  if (path.startsWith("/feed/subscriptions") || path.startsWith("/feed/channels")) return "subs";
  return "home";
}

function isPageEnabled() {
  const map = {
    home: settings.pageHome,
    search: settings.pageSearch,
    watch: settings.pageWatch,
    shorts: settings.pageShorts,
    subs: settings.pageSubs,
  };
  return map[getPageType()] !== false;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const YAB_THEME_VARS = [
  "--yab-flagged-bg", "--yab-flagged-bg-hover", "--yab-flagged-text",
  "--yab-flagged-border", "--yab-flagged-border-hover",
  "--yab-reported-text", "--yab-reported-bg", "--yab-reported-bg-hover",
  "--yab-reported-border", "--yab-reported-border-hover", "--yab-hover-text",
];

function applyThemeToElement(el, theme) {
  if (!el) return;
  for (const v of YAB_THEME_VARS) el.style.removeProperty(v);

  if (theme === "custom") {
    delete el.dataset.theme;
    const f = hexToRgb(settings.customFlagged);
    const r = hexToRgb(settings.customReported);
    el.style.setProperty("--yab-flagged-bg", `rgba(${f}, 0.12)`);
    el.style.setProperty("--yab-flagged-bg-hover", `rgba(${f}, 0.22)`);
    el.style.setProperty("--yab-flagged-text", settings.customFlagged);
    el.style.setProperty("--yab-flagged-border", `rgba(${f}, 0.45)`);
    el.style.setProperty("--yab-flagged-border-hover", `rgba(${f}, 0.65)`);
    el.style.setProperty("--yab-reported-text", settings.customReported);
    el.style.setProperty("--yab-reported-bg", `rgba(${r}, 0.15)`);
    el.style.setProperty("--yab-reported-bg-hover", `rgba(${r}, 0.25)`);
    el.style.setProperty("--yab-reported-border", `rgba(${r}, 0.4)`);
    el.style.setProperty("--yab-reported-border-hover", `rgba(${r}, 0.6)`);
    el.style.setProperty("--yab-hover-text", settings.customReported);
  } else if (theme && theme !== "default") {
    el.dataset.theme = theme;
  } else {
    delete el.dataset.theme;
  }
}

function applyTheme(theme) {
  applyThemeToElement(document.getElementById(YAB_REPORT_CONTAINER_ID), theme);
  applyThemeToElement(document.documentElement, theme);
}

function applySettingsVisibility() {
  const reportContainer = document.getElementById(YAB_REPORT_CONTAINER_ID);
  if (reportContainer) {
    reportContainer.style.display = isPageEnabled() ? "" : "none";
  }
}

// ---------------------------------------------------------------------------
// Video ID extraction (from Return YouTube Dislike reference)
// ---------------------------------------------------------------------------

function getVideoId() {
  try {
    const url = new URL(window.location.href);
    const pathname = url.pathname;
    if (pathname.startsWith("/clip")) {
      const meta =
        document.querySelector("meta[itemprop='videoId']") ||
        document.querySelector("meta[itemprop='identifier']");
      return meta ? meta.content : null;
    }
    if (pathname.startsWith("/shorts")) {
      return pathname.slice(8);
    }
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// YouTube button container helpers (from Return YouTube Dislike reference)
// ---------------------------------------------------------------------------

const isMobile = location.hostname === "m.youtube.com";
const isShorts = () => location.pathname.startsWith("/shorts");

function getShortsActionBar() {
  try {
    if (isMobile) {
      const elements = document.querySelectorAll("ytm-like-button-renderer");
      for (const el of elements) {
        if (isInViewport(el)) return el.closest("#actions") || el.parentElement;
      }
      return null;
    }
    const selectors = [
      "ytd-reel-video-renderer[is-active] #actions",
      "ytd-reel-player-overlay-renderer #actions",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isInViewport(el)) return el;
    }
    const likeButtons = document.querySelectorAll("#like-button > ytd-like-button-renderer");
    for (const el of likeButtons) {
      if (isInViewport(el)) {
        return el.closest("#actions") || el.parentElement?.parentElement;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getButtons() {
  try {
    if (isShorts()) {
      return getShortsActionBar();
    }
    if (isMobile) {
      return (
        document.querySelector(
          ".slim-video-action-bar-actions .segmented-buttons"
        ) || document.querySelector(".slim-video-action-bar-actions")
      );
    }
    if (document.getElementById("menu-container")?.offsetParent === null) {
      return (
        document.querySelector("ytd-menu-renderer.ytd-watch-metadata > div") ||
        document.querySelector(
          "ytd-menu-renderer.ytd-video-primary-info-renderer > div"
        )
      );
    }
    return document
      .getElementById("menu-container")
      ?.querySelector("#top-level-buttons-computed");
  } catch {
    return null;
  }
}

function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  const h = innerHeight || document.documentElement.clientHeight;
  const w = innerWidth || document.documentElement.clientWidth;
  return (
    !(
      rect.top === 0 &&
      rect.left === 0 &&
      rect.bottom === 0 &&
      rect.right === 0
    ) &&
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= h &&
    rect.right <= w
  );
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function formatCount(n) {
  if (n === undefined || n === null) return "0";
  try {
    const locale = document.documentElement.lang || navigator.language || "en";
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      compactDisplay: "short",
    }).format(n);
  } catch {
    return String(n);
  }
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const ICON_FLAG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
  <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
</svg>`;

// ---------------------------------------------------------------------------
// Report UI (watch page)
// ---------------------------------------------------------------------------

function createReportUI(info) {
  const existing = document.getElementById(YAB_REPORT_CONTAINER_ID);
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = YAB_REPORT_CONTAINER_ID;

  const reportBtn = document.createElement("button");
  reportBtn.className = "yab-report-btn";
  reportBtn.innerHTML = `${ICON_FLAG}<span class="yab-btn-label">AI slop</span><span class="yab-count" id="yab-report-count">${formatCount(info?.report_count || 0)}</span>`;

  const tooltip = document.createElement("div");
  tooltip.className = "yab-tooltip";
  tooltip.id = "yab-tooltip";
  updateTooltipContent(tooltip, info);

  updateButtonState(reportBtn, info);

  reportBtn.addEventListener("click", () => handleReport());
  reportBtn.addEventListener("touchstart", () => handleReport());
  reportBtn.addEventListener("mouseenter", () => tooltip.classList.add("yab-tooltip-visible"));
  reportBtn.addEventListener("mouseleave", () => tooltip.classList.remove("yab-tooltip-visible"));

  container.appendChild(reportBtn);
  container.appendChild(tooltip);

  if (!isPageEnabled()) {
    container.style.display = "none";
  }

  return container;
}

function buildTooltipText(info) {
  const count = info?.report_count || 0;
  const reported = !!info?.reported;
  const isAi = !!info?.is_ai;

  let heading, body;
  if (reported) {
    heading = "You reported this video";
    body = "Click again to undo your report.";
  } else {
    heading = "Flag AI-generated content";
    body = "Think this video is AI slop? Report it. When enough people flag a video, it gets labeled for everyone.";
  }

  let stats;
  if (count === 0) {
    stats = "No reports yet — be the first.";
  } else if (count === 1) {
    stats = "1 person has reported this video.";
  } else {
    stats = `${count.toLocaleString()} people have reported this video.`;
  }

  if (isAi) {
    stats += " Community-flagged as AI.";
  }

  return { heading, body, stats };
}

function updateTooltipContent(tooltip, info) {
  if (!tooltip) return;
  const { heading, body, stats } = buildTooltipText(info);
  tooltip.innerHTML =
    `<strong class="yab-tooltip-heading">${heading}</strong>` +
    `<span class="yab-tooltip-body">${body}</span>` +
    `<span class="yab-tooltip-stats">${stats}</span>`;
}

function updateButtonState(btn, info) {
  if (!btn) return;
  btn.classList.toggle("yab-reported", !!info?.reported);
  btn.classList.toggle("yab-is-ai", !!info?.is_ai);
  btn.removeAttribute("title");
}

function updateReportUI(info) {
  const el = document.getElementById("yab-report-count");
  if (el) el.textContent = formatCount(info.report_count);
  const btn = document.querySelector(".yab-report-btn");
  updateButtonState(btn, info);
  const tooltip = document.getElementById("yab-tooltip");
  updateTooltipContent(tooltip, info);
}

async function handleReport() {
  const videoId = getVideoId();
  if (!videoId) return;
  yabLog("Report clicked:", { videoId });

  const container = document.getElementById(YAB_REPORT_CONTAINER_ID);
  if (container) container.classList.add("yab-loading");

  const result = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "submitReport", videoId },
      resolve
    );
  });

  if (container) container.classList.remove("yab-loading");

  if (result) {
    currentInfo = result;
    updateReportUI(result);
    yabLog("Report result:", result);
  }
}

function injectReportUI(info) {
  try {
    const buttons = getButtons();
    if (!buttons) return;

    if (document.getElementById(YAB_REPORT_CONTAINER_ID)) {
      updateReportUI(info);
      return;
    }

    const reportUI = createReportUI(info);

    if (isShorts()) {
      reportUI.classList.add("yab-shorts");
      buttons.appendChild(reportUI);
    } else {
      buttons.parentElement.insertBefore(reportUI, buttons.nextSibling);
    }

    applyTheme(settings.colorTheme);
  } catch {
    yabWarn("Failed to inject report UI");
  }
}

// ---------------------------------------------------------------------------
// Smartimation observer (keeps report count visible after YouTube animations)
// ---------------------------------------------------------------------------

let smartimationObserver = null;

function setupSmartimationObserver() {
  try {
    const buttons = getButtons();
    if (!buttons) return;

    const smartimationContainer = buttons.querySelector("yt-smartimation");
    if (!smartimationContainer) return;

    if (
      smartimationObserver &&
      smartimationObserver._container === smartimationContainer
    ) {
      return;
    }

    if (smartimationObserver) smartimationObserver.disconnect();

    smartimationObserver = new MutationObserver(() => {
      if (currentInfo) updateReportUI(currentInfo);
    });
    smartimationObserver._container = smartimationContainer;
    smartimationObserver.observe(smartimationContainer, {
      attributes: true,
      subtree: true,
      childList: true,
    });
    yabLog("Smartimation observer attached");
  } catch {
    // Not critical
  }
}

// ---------------------------------------------------------------------------
// Thumbnail labels (search, home, subscriptions feeds)
// ---------------------------------------------------------------------------

const THUMB_LABEL_CLASS = "yab-thumb-label";
const THUMB_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>`;
let thumbObserver = null;
let thumbScanPending = false;

function extractVideoIdFromHref(href) {
  try {
    const url = new URL(href, location.origin);
    if (url.pathname === "/watch") return url.searchParams.get("v");
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
    return null;
  } catch {
    return null;
  }
}

function getThumbnailContainers() {
  return document.querySelectorAll(
    "ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer"
  );
}

function scanThumbnails() {
  if (!isPageEnabled()) return;
  if (thumbScanPending) return;
  thumbScanPending = true;

  requestAnimationFrame(() => {
    thumbScanPending = false;
    doScanThumbnails();
  });
}

async function doScanThumbnails() {
  const containers = getThumbnailContainers();
  const videoMap = new Map();

  for (const container of containers) {
    if (container.dataset.yabScanned) continue;
    container.dataset.yabScanned = "1";

    const link = container.querySelector("a#thumbnail, a.ytd-thumbnail");
    if (!link?.href) continue;

    const videoId = extractVideoIdFromHref(link.href);
    if (!videoId) continue;

    const thumbEl = link.querySelector("#thumbnail, ytd-thumbnail, yt-image")?.parentElement || link;

    if (!videoMap.has(videoId)) {
      videoMap.set(videoId, []);
    }
    videoMap.get(videoId).push({ thumbEl: link, container });
  }

  if (videoMap.size === 0) return;

  const videoIds = [...videoMap.keys()];
  yabLog("Thumbnail scan:", videoIds.length, "new videos");

  const results = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getVideos", videoIds },
      resolve
    );
  });

  if (!results) return;

  for (const [videoId, entries] of videoMap) {
    const info = results[videoId];
    if (!info?.is_ai) continue;

    for (const { thumbEl } of entries) {
      if (thumbEl.querySelector(`.${THUMB_LABEL_CLASS}`)) continue;

      thumbEl.style.position = "relative";
      const badge = document.createElement("span");
      badge.className = THUMB_LABEL_CLASS;
      if (info.reported) badge.classList.add("yab-thumb-reported");
      badge.innerHTML = `${THUMB_ICON} AI · ${formatCount(info.report_count)}`;
      thumbEl.appendChild(badge);
    }
  }
}

function setupThumbObserver() {
  if (thumbObserver) thumbObserver.disconnect();

  const target = document.querySelector("ytd-app") || document.body;
  thumbObserver = new MutationObserver((mutations) => {
    let hasNewNodes = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) { hasNewNodes = true; break; }
    }
    if (hasNewNodes) scanThumbnails();
  });
  thumbObserver.observe(target, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Watch page state management
// ---------------------------------------------------------------------------

async function onVideoPage() {
  const videoId = getVideoId();
  if (!videoId || videoId === currentVideoId) return;

  yabLog("Watch page:", videoId);
  currentVideoId = videoId;

  const videos = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getVideos", videoIds: [videoId] },
      resolve
    );
  });

  currentInfo = videos?.[videoId] || { report_count: 0, is_ai: false };
  yabLog("Video info:", currentInfo);
  injectReportUI(currentInfo);
  setupSmartimationObserver();
}

// ---------------------------------------------------------------------------
// Initialization & observers (modeled after Return YouTube Dislike)
// ---------------------------------------------------------------------------

function isVideoLoaded() {
  try {
    const videoId = getVideoId();
    if (!videoId) return false;

    if (isMobile) {
      return (
        document.getElementById("player")?.getAttribute("loading") === "false"
      );
    }

    if (isShorts()) {
      return document.querySelector("ytd-reel-video-renderer") !== null;
    }

    return (
      document.querySelector(`ytd-watch-grid[video-id='${videoId}']`) !==
        null ||
      document.querySelector(`ytd-watch-flexy[video-id='${videoId}']`) !== null
    );
  } catch {
    return false;
  }
}

function checkAndInit() {
  if (!isPageEnabled()) return;

  try {
    const isWatchPage = !!getVideoId();
    const buttons = getButtons();

    if (isWatchPage && buttons?.offsetParent && isVideoLoaded()) {
      if (preNavigateButtons !== buttons) {
        preNavigateButtons = buttons;
        onVideoPage();
      } else if (!document.getElementById(YAB_REPORT_CONTAINER_ID)) {
        onVideoPage();
      }
    }
  } catch {
    // DOM not ready yet
  }
}

let initTimer = null;

function clearThumbScanned() {
  document.querySelectorAll("[data-yab-scanned]").forEach(el => {
    delete el.dataset.yabScanned;
  });
  document.querySelectorAll(`.${THUMB_LABEL_CLASS}`).forEach(el => el.remove());
}

function onNavigate() {
  yabLog("Navigation detected:", location.pathname);
  currentVideoId = null;
  preNavigateButtons = null;
  clearThumbScanned();

  if (initTimer) clearInterval(initTimer);
  let scanCount = 0;
  initTimer = setInterval(() => {
    checkAndInit();
    scanThumbnails();
    scanCount++;
    const isWatchReady = getVideoId() && document.getElementById(YAB_REPORT_CONTAINER_ID);
    const isFeedSettled = !getVideoId() && scanCount > 10;
    if (isWatchReady || isFeedSettled) {
      clearInterval(initTimer);
      initTimer = null;
    }
  }, 150);

  setTimeout(() => {
    if (initTimer) {
      clearInterval(initTimer);
      initTimer = null;
    }
  }, 15000);

  setupThumbObserver();
  scanThumbnails();
}

(function init() {
  loadSettings();

  window.addEventListener("yt-navigate-finish", onNavigate, true);
  onNavigate();

  // Shorts swipe detection — URL changes without yt-navigate-finish
  let lastShortsId = null;
  setInterval(() => {
    if (!isShorts()) { lastShortsId = null; return; }
    const vid = getVideoId();
    if (vid && vid !== lastShortsId) {
      lastShortsId = vid;
      const existing = document.getElementById(YAB_REPORT_CONTAINER_ID);
      if (existing) existing.remove();
      currentVideoId = null;
      preNavigateButtons = null;
      onVideoPage();
    }
  }, 500);

  if (isMobile) {
    const originalPush = history.pushState;
    history.pushState = function (...args) {
      onNavigate();
      return originalPush.apply(history, args);
    };

    setInterval(() => {
      try {
        if (currentInfo && document.getElementById(YAB_REPORT_CONTAINER_ID)) {
          updateReportUI(currentInfo);
        }
      } catch {
        // Mobile DOM refresh -- silently fail
      }
    }, 1000);
  }
})();
