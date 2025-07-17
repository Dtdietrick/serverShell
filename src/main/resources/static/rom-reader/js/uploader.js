export function setupUploadForm(romName) {
  const form   = document.getElementById("upload-save-form");
  const status = document.getElementById("upload-status");
  const downloadLink = document.getElementById("download-save");

  const savePath = `/saves/${romName}.sav`;

  form.action = savePath;
  downloadLink.href = savePath;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    try {
      const res = await fetch(savePath, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error(await res.text());

      status.textContent = "✅ Save uploaded!";
      status.style.color = "lightgreen";
    } catch (err) {
      status.textContent = `❌ Upload failed: ${err.message}`;
      status.style.color = "red";
    }
  });
}