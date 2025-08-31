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

export function toggleMediaButtons(show) {
  const buttons = document.querySelectorAll(".media-btn"); 
  buttons.forEach((btn) => {
    show ? btn.classList.remove("disabled") : btn.classList.add("disabled");
  });
}

export function disableBackButton(disable) { 
  const backButton = document.querySelector(".back-btn");
  console.log("disable back button?: ", disable);
  disable ? backButton.classList.add("disabled") : backButton.classList.remove("disabled");
}
