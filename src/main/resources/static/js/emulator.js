export function launchEmulator(rom) {
  fetch('/emulator/launch?rom=' + encodeURIComponent(rom), { method: 'POST' })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to launch emulator.");
      return res.text();
    })
    .then((msg) => console.log(msg))
    .catch((err) => alert("Emulator error: " + err.message));
}