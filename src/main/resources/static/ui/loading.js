//File:loading.js
let isLoading = false; 

export function getIsLoading() { return isLoading; }
export function setIsLoading(bool) { isLoading = bool; }

export function showGlobalSpinner() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) spinner.style.display = "block";
}

export function hideGlobalSpinner() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) spinner.style.display = "none";
}
