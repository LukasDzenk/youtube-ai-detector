const YAB_REPORT_CONTAINER_ID = "yab-report-container";

let settings = {
  colorTheme: "default",
  showTooltip: true,
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
      Object.assign(settings, resp);
      yabLog("Settings loaded:", settings);
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
  if (changes.showTooltip && !settings.showTooltip) {
    const tooltip = document.getElementById("yab-tooltip");
    if (tooltip) tooltip.classList.remove("yab-tooltip-visible");
  }
});

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function applyTheme(theme) {
  const container = document.getElementById(YAB_REPORT_CONTAINER_ID);
  if (!container) return;

  container.style.removeProperty("--yab-flagged-bg");
  container.style.removeProperty("--yab-flagged-bg-hover");
  container.style.removeProperty("--yab-flagged-text");
  container.style.removeProperty("--yab-flagged-border");
  container.style.removeProperty("--yab-flagged-border-hover");
  container.style.removeProperty("--yab-reported-text");
  container.style.removeProperty("--yab-reported-bg");
  container.style.removeProperty("--yab-reported-bg-hover");
  container.style.removeProperty("--yab-reported-border");
  container.style.removeProperty("--yab-reported-border-hover");
  container.style.removeProperty("--yab-hover-text");

  if (theme === "custom") {
    delete container.dataset.theme;
    const f = hexToRgb(settings.customFlagged);
    const r = hexToRgb(settings.customReported);
    container.style.setProperty("--yab-flagged-bg", `rgba(${f}, 0.12)`);
    container.style.setProperty("--yab-flagged-bg-hover", `rgba(${f}, 0.22)`);
    container.style.setProperty("--yab-flagged-text", settings.customFlagged);
    container.style.setProperty("--yab-flagged-border", `rgba(${f}, 0.45)`);
    container.style.setProperty("--yab-flagged-border-hover", `rgba(${f}, 0.65)`);
    container.style.setProperty("--yab-reported-text", settings.customReported);
    container.style.setProperty("--yab-reported-bg", `rgba(${r}, 0.15)`);
    container.style.setProperty("--yab-reported-bg-hover", `rgba(${r}, 0.25)`);
    container.style.setProperty("--yab-reported-border", `rgba(${r}, 0.4)`);
    container.style.setProperty("--yab-reported-border-hover", `rgba(${r}, 0.6)`);
    container.style.setProperty("--yab-hover-text", settings.customReported);
  } else if (theme && theme !== "default") {
    container.dataset.theme = theme;
  } else {
    delete container.dataset.theme;
  }
}

// ---------------------------------------------------------------------------
// Video ID extraction
// ---------------------------------------------------------------------------

function getVideoId() {
  try {
    const url = new URL(window.location.href);
    const pathname = url.pathname;

    if (pathname.startsWith("/watch")) {
      return url.searchParams.get("v");
    }

    if (pathname.startsWith("/shorts/")) {
      return pathname.split("/")[2];
    }

    return null;
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// YouTube button container helpers (from Return YouTube Dislike reference)
// ---------------------------------------------------------------------------

const isMobile = location.hostname === "m.youtube.com";
function getButtons() {
  try {
    if (isMobile) {
      return document.querySelector(".slim-video-action-bar-actions .segmented-buttons") || 
             document.querySelector(".slim-video-action-bar-actions");
    }

    if (location.pathname.startsWith("/shorts/")) {
      const activeReel = Array.from(document.querySelectorAll('ytd-reel-video-renderer')).find(reel => 
        reel.hasAttribute('is-active') || reel.hasAttribute('overlay-applied')
      );
      
      if (activeReel) {
        return activeReel.querySelector("#button-bar") || 
               activeReel.querySelector("reel-action-bar-view-model");
      }
      
      return document.querySelector("#button-bar");
      
      const allActionBars = document.querySelectorAll("#actions.ytd-shorts, #extra-buttons.ytd-shorts");
      for (const bar of allActionBars) {
        if (bar.offsetParent !== null) return bar;
      }
      
      return null;
    }

    if (document.getElementById("menu-container")?.offsetParent === null) {
      return (
        document.querySelector("ytd-menu-renderer.ytd-watch-metadata > div") ||
        document.querySelector("ytd-menu-renderer.ytd-video-primary-info-renderer > div")
      );
    }
    return document.getElementById("menu-container")?.querySelector("#top-level-buttons-computed");
  } catch (e) {
    return null;
  }
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

  const tooltip = ensureTooltipElement();
  updateTooltipContent(tooltip, info);

  updateButtonState(reportBtn, info);

  reportBtn.addEventListener("click", () => handleReport());
  reportBtn.addEventListener("touchstart", () => handleReport());
  reportBtn.addEventListener("mouseenter", () => {
    if (settings.showTooltip === false) return;
    positionTooltip(tooltip, reportBtn);
    tooltip.classList.add("yab-tooltip-visible");
  });
  reportBtn.addEventListener("mouseleave", () => {
    tooltip.classList.remove("yab-tooltip-visible");
  });

  container.appendChild(reportBtn);
  return container;
}

function ensureTooltipElement() {
  let tooltip = document.getElementById("yab-tooltip");
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.className = "yab-tooltip";
  tooltip.id = "yab-tooltip";
  tooltip.dataset.placement = "top";
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionTooltip(tooltip, targetEl) {
  if (!tooltip || !targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const tooltipWidth = tooltip.offsetWidth || 260;
  const tooltipHeight = tooltip.offsetHeight || 120;
  const edgePadding = 12;

  let centerX = rect.left + rect.width / 2;
  const minCenter = edgePadding + tooltipWidth / 2;
  const maxCenter = window.innerWidth - edgePadding - tooltipWidth / 2;
  centerX = Math.min(maxCenter, Math.max(minCenter, centerX));

  const canRenderAbove = rect.top >= tooltipHeight + edgePadding + 10;
  tooltip.dataset.placement = canRenderAbove ? "top" : "bottom";
  tooltip.style.left = `${centerX}px`;
  tooltip.style.top = canRenderAbove ? `${rect.top}px` : `${rect.bottom}px`;
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
    
    if (location.pathname.startsWith("/shorts/")) {
      const targetContainer = buttons.querySelector("reel-action-bar-view-model") || buttons;
      
      const pivot = targetContainer.querySelector("pivot-button-view-model");
      if (pivot) {
        targetContainer.insertBefore(reportUI, pivot);
      } else {
        targetContainer.appendChild(reportUI);
      }
    } else {
      buttons.parentElement.insertBefore(reportUI, buttons.nextSibling);
    }
    
    applyTheme(settings.colorTheme);
  } catch (e) {
    yabWarn("Failed to inject report UI:", e);
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
// Watch page state management
// ---------------------------------------------------------------------------

async function onVideoPage() {
  const videoId = getVideoId();
  if (!videoId) return;
  if (videoId === currentVideoId && document.getElementById(YAB_REPORT_CONTAINER_ID)) return;

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
      return document.getElementById("player")?.getAttribute("loading") === "false";
    }

    if (location.pathname.startsWith("/shorts/")) {
       return !!document.querySelector('ytd-reel-video-renderer[is-active] video') || 
              !!document.querySelector('ytd-reel-video-renderer video');
    }

    return (
      document.querySelector(`ytd-watch-grid[video-id='${videoId}']`) !== null ||
      document.querySelector(`ytd-watch-flexy[video-id='${videoId}']`) !== null
    );
  } catch {
    return false;
  }
}

function checkAndInit() {
  try {
    const vidId = getVideoId();
    const buttons = getButtons();
    const loaded = isVideoLoaded();

    if (window.location.pathname.includes("shorts")) {
       console.log("[YAB Debug] ID:", vidId, "| Buttons Found:", !!buttons, "| Loaded:", loaded);
    }

    const buttonsVisible = window.location.pathname.startsWith("/shorts/") 
          ? !!buttons 
          : !!buttons?.offsetParent;

    if (vidId && buttonsVisible && loaded) {
      if (preNavigateButtons !== buttons) {
        preNavigateButtons = buttons;
        onVideoPage();
      } else if (!document.getElementById(YAB_REPORT_CONTAINER_ID)) {
        onVideoPage();
      }
    }
  } catch (e) {
  }
}

let initTimer = null;

function onNavigate() {
  yabLog("Navigation detected:", location.pathname);
  const oldUI = document.getElementById(YAB_REPORT_CONTAINER_ID);
  if (oldUI) oldUI.remove();

  currentVideoId = null;
  preNavigateButtons = null;
  
  if (initTimer) clearInterval(initTimer);

  initTimer = setInterval(() => {
    const vidId = getVideoId();
    checkAndInit();

    const currentUI = document.getElementById(YAB_REPORT_CONTAINER_ID);
    if (vidId && currentUI && currentVideoId === vidId) {
      clearInterval(initTimer);
      initTimer = null;
      yabLog("Timer stopped: UI injected for", vidId);
    }
  }, 200);

  setTimeout(() => {
    if (initTimer) {
      clearInterval(initTimer);
      initTimer = null;
    }
  }, 10000);
}

(function init() {
  loadSettings();

  window.addEventListener("yt-navigate-finish", onNavigate, true);
  onNavigate();

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
