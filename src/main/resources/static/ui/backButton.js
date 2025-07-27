//File:backbutton.js

import {
  getCurrentPath,
  popPreviousPath,
  getLastClickedGroupLabel,
  setLastClickedGroupLabel,
  isInVirtualGroup,
  setInVirtualGroup,
  getMediaRoot
} from "/media/mediaState.js";

import { renderFolder } from "/explorer/virtualExplorer.js";

const backButton = document.getElementById("back-button");

// Back button navigates up one folder and fetches new data
function updateBackButtonVisibility() {
  const current = getCurrentPath();
  const root = getMediaRoot();
  backButton.style.display = current !== root ? "block" : "none";
}

backButton.onclick = () => {
  const currentPath = getCurrentPath();
  const mediaRoot = getMediaRoot();
  if (!currentPath) return;

  if (!currentPath || currentPath === mediaRoot) {
    console.log("Already at root, no back action.");
    return;
  }
  
  const prev = popPreviousPath();
  console.log("Back to:", prev);
  
  // Reset flags if going back to grouped view
  if (prev === mediaRoot) {
    setLastClickedGroupLabel("");
    setInVirtualGroup(false);
  }


  renderFolder(prev);
  updateBackButtonVisibility();
};

export { updateBackButtonVisibility };