//File:backbutton.js

import {
  pushHistory,
  popHistory,
  peekHistory,
} from "/explorer/history.js";

import {
  getLastClickedGroupLabel,
  setLastClickedGroupLabel,
  getMediaRoot,
  getCurrentPath,
  setCurrentPath
} from "/explorer/path.js";

import { 
    disableBackButton
} from "/ui/loading.js";

import { renderFolder } from "/explorer/explorer.js";

// Back button navigates up one folder and fetches new data
const backButton = document.querySelector(".back-btn");
backButton.onclick = () => {
  const root = getMediaRoot();
  const prev = popHistory();

  if (!prev) return;

    const current = getCurrentPath();
    setLastClickedGroupLabel(""); // clear group label on back
    setCurrentPath(prev); // real path going back to
    // If current was inside a virtual group, we were in a grouped view
    const wasInVirtual = current === prev;

    if (wasInVirtual && prev === root) {
      console.log("Back from virtual group to grouped root:", prev);
      renderFolder(prev, true);
    } else {
      console.log("Back to:", prev);
      renderFolder(prev, prev === root);
    }
  };

// Update visibility and audit history
export function updateBackButton(path) {
  const root = getMediaRoot();
  const prev = peekHistory();
  const atRoot = path === root;
  
  // disable back if we're at root
  disableBackButton(atRoot);
  
  if (!prev) return; // history uninitialized
 
  // Push path to history if it's a new navigable path
  if (!atRoot && path !== prev) {
    pushHistory(path);
  }

  console.log(`Back button state updated — path: ${path}, root: ${root}`);
}

export function showBackButton(){
    const backButton = document.querySelector(".back-btn");
    backButton.style.display = 'block';
}