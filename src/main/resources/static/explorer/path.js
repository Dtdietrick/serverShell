//File:path.js
let lastClickedGroupLabel = null;
let mediaRoot = "";
let currentPath = "";

//track forward path for media in explorer
export function setMediaRoot(path) {mediaRoot = path.split("/")[0];} // e.g., "TV" from "TV/B"
export function getMediaRoot() { return mediaRoot; }
export function getCurrentPath() {  return currentPath; }
export function setCurrentPath(path) {  currentPath = path; }
export function getLastClickedGroupLabel() { return lastClickedGroupLabel; }
export function setLastClickedGroupLabel(label) { lastClickedGroupLabel = label; }