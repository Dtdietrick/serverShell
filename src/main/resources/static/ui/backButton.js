//File:backbutton.js

import {
  pushHistory,
  popHistory,
  peekHistory,
} from "/explorer/history.js";

import {
  getCurrentPath,
  setCurrentPath,
  getLastClickedGroupLabel,
  setLastClickedGroupLabel,
  getMediaRoot
} from "/explorer/path.js";

import { 
    getShowBackButton, 
    setShowBackButton
} from "/ui/loading.js";

import { renderFolder } from "/explorer/explorer.js";

// Back button navigates up one folder and fetches new data
const backButton = document.querySelector(".back-btn");
backButton.onclick = () => {
  const current = getCurrentPath();
  const root = getMediaRoot();

  if (!current || current === root) return;

  const prev = popHistory();
  console.log("Back to:", prev);

  if (prev === root) {
    setLastClickedGroupLabel("");
  }

  setCurrentPath(prev);
  renderFolder(prev);
};
//console.log("peekHistory:", peekHistory());
//console.log("pathHistory:", getPathHistory());
export function updateBackButton(path) {
  const show = getShowBackButton();
  const root = getMediaRoot();
  const prev = peekHistory();
  console.log(`before update: ${path}`);
  const atRoot = path === root;

  // skip if history is not yet initialized
  if (!prev) return;
  
  // update button UI
  setShowBackButton(!atRoot);

  // push to path history ONLY if it's a new path
  if (!atRoot && path !== prev) {
    pushHistory(path);
  }
  
  console.log(`after update: ${path}`);
};