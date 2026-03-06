importScripts("config.js", "logger.js");

const API_BASE = "http://localhost:3000/api";
const CACHE_TTL_MS = 5 * 60 * 1000;

const videoCache = new Map();
const myReports = new Set();
const selfFlagEnabled = YAB_CONFIG.selfFlag;

function generateUUID() {
  return crypto.randomUUID();
}

function loadMyReports() {
  chrome.storage.local.get({ myReports: [] }, ({ myReports: saved }) => {
    for (const id of saved) myReports.add(id);
    yabLog("Loaded my reports:", myReports.size);
  });
}

function saveMyReports() {
  chrome.storage.local.set({ myReports: [...myReports] });
}

loadMyReports();

async function getInstallId() {
  const { installId } = await chrome.storage.local.get("installId");
  if (installId) {
    yabLog("Install ID:", installId);
    return installId;
  }
  const newId = generateUUID();
  await chrome.storage.local.set({ installId: newId });
  yabLog("Generated new install ID:", newId);
  return newId;
}

function getCached(videoId) {
  const entry = videoCache.get(videoId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    videoCache.delete(videoId);
    yabLog("Cache expired:", videoId);
    return null;
  }
  yabLog("Cache hit:", videoId);
  return entry.data;
}

function setCache(videoId, data) {
  videoCache.set(videoId, { data, ts: Date.now() });
  yabLog("Cache set:", videoId, data);
}

async function fetchVideosBatch(videoIds) {
  const uncached = [];
  const result = {};

  for (const id of videoIds) {
    const cached = getCached(id);
    if (cached) {
      result[id] = cached;
    } else {
      uncached.push(id);
    }
  }

  yabLog("Batch fetch:", videoIds.length, "requested,", uncached.length, "uncached");

  if (uncached.length > 0) {
    const chunks = [];
    for (let i = 0; i < uncached.length; i += 50) {
      chunks.push(uncached.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      try {
        const url = `${API_BASE}/videos/batch?ids=${chunk.join(",")}`;
        yabLog("API request:", url);
        const resp = await fetch(url);
        yabLog("API response:", resp.status);
        if (resp.ok) {
          const json = await resp.json();
          for (const [vid, info] of Object.entries(json.videos)) {
            setCache(vid, info);
            result[vid] = info;
          }
        }
      } catch (err) {
        yabError("Batch fetch failed:", err);
      }
    }
  }

  for (const id of videoIds) {
    const reported = myReports.has(id);
    if (result[id]) {
      result[id] = {
        ...result[id],
        reported,
        is_ai: (selfFlagEnabled && reported) ? true : result[id].is_ai,
      };
    } else if (reported) {
      result[id] = { report_count: 1, is_ai: selfFlagEnabled, reported: true };
    }
  }

  return result;
}

async function submitReport(videoId) {
  const installId = await getInstallId();
  yabLog("Submitting report:", { videoId, installId });
  try {
    const resp = await fetch(`${API_BASE}/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Install-Id": installId,
      },
      body: JSON.stringify({ video_id: videoId }),
    });
    yabLog("Report response:", resp.status);
    if (resp.ok) {
      const json = await resp.json();
      if (json.reported) {
        myReports.add(videoId);
      } else {
        myReports.delete(videoId);
      }
      saveMyReports();
      const info = {
        report_count: json.report_count,
        is_ai: (selfFlagEnabled && json.reported) ? true : json.is_ai,
        reported: json.reported,
      };
      yabLog("Report toggled:", info);
      setCache(videoId, info);
      return info;
    }
    yabError("Report submit failed:", resp.status);
    return null;
  } catch (err) {
    yabError("Report submit error:", err);
    return null;
  }
}

yabSetDevMode(YAB_CONFIG.devMode);
yabLog("Background worker started");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "getVideos") {
    fetchVideosBatch(msg.videoIds).then(sendResponse);
    return true;
  }
  if (msg.type === "submitReport") {
    submitReport(msg.videoId).then(sendResponse);
    return true;
  }
  if (msg.type === "getSettings") {
    chrome.storage.local.get(
      {
        pageHome: true,
        pageSearch: true,
        pageWatch: true,
        pageShorts: true,
        pageSubs: true,
        colorTheme: "default",
        customFlagged: "#ff9100",
        customReported: "#f44336",
      },
      sendResponse
    );
    return true;
  }
});
