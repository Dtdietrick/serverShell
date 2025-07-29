//File:history.js

//Take path and history
let pathHistory = [];
export function pushHistory(path) {
  if (!path || path === pathHistory[pathHistory.length - 1]) return;
  pathHistory.push(path);
}

export function popHistory() {
  if (pathHistory.length > 1) {
    pathHistory.pop(); // drop current
    return pathHistory[pathHistory.length - 1]; // previous
  }
  return pathHistory[0]; // root fallback
}

export function getHistory() {
  return [...pathHistory];
}

export function resetHistory(rootPath) {
  pathHistory = [rootPath]; // reset with just the root
}

export function peekHistory() {
  return pathHistory[pathHistory.length - 1];
}