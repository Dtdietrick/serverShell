//File:onClick.js
import { showGlobalSpinner, hideGlobalSpinner } from "/ui/loading.js";

export function attachLauncherSpinnerEvents() {
  const launcher = document.getElementById("pinned-launchers");
  if (!launcher) return;

  launcher.querySelectorAll("button").forEach((button) => {
    const originalText = button.textContent;

    button.addEventListener("click", () => {
      if (button.disabled) return;

      button.disabled = true;
      button.textContent = "Loading... ⏳";
      showGlobalSpinner();

      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
        hideGlobalSpinner();
      }, 2500);
    });
  });
}