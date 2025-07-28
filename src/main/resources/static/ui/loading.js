//File:loading.js
let isLoading = false; 
let isBackBtn = false;

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

export function toggleMediaButtons(show) {
  const buttons = document.querySelectorAll(".media-btn"); 
  buttons.forEach((btn) => {
    show ? btn.classList.remove("disabled") : btn.classList.add("disabled");
  });
}

export function getShowBackButton() { return isBackBtn; }
export function setShowBackButton(show) { 
    const backButton = document.querySelector(".back-btn");
    
    show ? backButton.classList.remove("disabled") : backButton.classList.add("disabled");
    
    isBackBtn = show; 
}
