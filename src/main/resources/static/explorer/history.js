//File: history.js

/*Clean audit of file history and pathing without any virtual diretory noise*/ 

let pathHistory = [];

// Push a new path or marker onto history stack
export function pushHistory(path) {
  if (!path || path === pathHistory[pathHistory.length - 1]) return;
  console.log("pushHistory:", path);
  pathHistory.push(path);
}

// Pop current view and return the previous history path
export function popHistory() {
  if (pathHistory.length <= 1) return pathHistory[0];

  pathHistory.pop();
  return pathHistory[pathHistory.length - 1] || "";
}

// Get the current top of the stack
export function peekHistory() {
  return pathHistory[pathHistory.length - 1] || "";
}

// Optional: reset entire history stack
export function resetHistory(path) {
  pathHistory = [path];
}
