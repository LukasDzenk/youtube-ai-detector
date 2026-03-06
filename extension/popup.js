const COLOR_DEFAULTS = {
  customFlagged: "#ff9100",
  customReported: "#f44336",
};

function setActiveThemeSwatch(theme) {
  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
  document.getElementById("custom-colors").classList.toggle("visible", theme === "custom");
}

function updateCustomSwatchPreview(flagged, reported) {
  const fill = document.getElementById("swatch-custom-fill");
  if (fill) {
    fill.style.background = `linear-gradient(135deg, ${flagged} 50%, ${reported} 50%)`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(
    { colorTheme: "default", ...COLOR_DEFAULTS },
    (values) => {
      setActiveThemeSwatch(values.colorTheme);

      document.getElementById("color-flagged").value = values.customFlagged;
      document.getElementById("color-reported").value = values.customReported;
      updateCustomSwatchPreview(values.customFlagged, values.customReported);
    }
  );

  document.getElementById("theme-picker").addEventListener("click", (e) => {
    const swatch = e.target.closest(".theme-swatch");
    if (!swatch) return;
    const theme = swatch.dataset.theme;
    chrome.storage.local.set({ colorTheme: theme });
    setActiveThemeSwatch(theme);
  });

  document.getElementById("color-flagged").addEventListener("input", (e) => {
    chrome.storage.local.set({ customFlagged: e.target.value });
    updateCustomSwatchPreview(
      e.target.value,
      document.getElementById("color-reported").value
    );
  });

  document.getElementById("color-reported").addEventListener("input", (e) => {
    chrome.storage.local.set({ customReported: e.target.value });
    updateCustomSwatchPreview(
      document.getElementById("color-flagged").value,
      e.target.value
    );
  });
});
