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

import { disableBackButton } from "/ui/loading.js";
import { renderFolder } from "/explorer/explorer.js";

const backButton = document.querySelector(".back-btn");
const GROUP_KEY = "explorer.groupAtRoot";
//Back button navigates up one folder and fetches new data
backButton.onclick = () => {
  const root = getMediaRoot();
  const prev = popHistory();

  if (!prev) return;

  // clear any letter tag
  setLastClickedGroupLabel(""); 
  setCurrentPath(prev);

  const groupPref = (localStorage.getItem("explorer.groupAtRoot") ?? "true") === "true";
  renderFolder(prev, prev === root ? groupPref : false);
  };

// Update visibility and audit history
export function updateBackButton(path) {
  const root = getMediaRoot();
  const atRoot = path === root;  
  // disable back if we're at root
  disableBackButton(atRoot);

  const toggle = document.getElementById("toggle-grouping");
  if (toggle) {
    toggle.disabled = !atRoot;
    toggle.classList.toggle('disabled', !atRoot);
    toggle.style.display = "inline-block";
  }

  console.log(`Back button state updated — path: ${path}, root: ${root}`);
}