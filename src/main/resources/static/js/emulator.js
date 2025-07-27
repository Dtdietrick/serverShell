export function launchEmulator(rom, button) {
  const spinner = document.getElementById("loading-spinner");
  
  if (button.disabled) return; // extra safety against double click
  
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Launching... ⏳";
  spinner.style.display = "block";
  const win = window.open('', '_blank'); 
  
  fetch('/emulator/launch?rom=' + encodeURIComponent(rom), { method: 'POST' })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to launch emulator.");
      return res.text(); // server returns full http://localhost:PORT/vnc.html...
    })
    .then((url) => {
      // Wait before launching to let Docker fully bind ports
      setTimeout(() => {
        // Reset UI
        win.location.href = url;
        button.textContent = originalText;
        button.disabled = false;
        spinner.style.display = "none"; // Hide spinner
      }, 2500);
    })
    .catch((err) => {
      win.close();
      alert("Emulator error: " + err.message);
      button.textContent = originalText;
      button.disabled = false;
      spinner.style.display = "none";
    });
}