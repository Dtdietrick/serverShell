//File: auth.js

/* Logout user and redirect to login page. */

export function logout() {
  fetch("/logout", {
    method: "POST",
    credentials: "same-origin",
  })
    .then(() => (window.location.href = "/login?logout"))
    .catch((err) => console.error("Logout failed", err));
}