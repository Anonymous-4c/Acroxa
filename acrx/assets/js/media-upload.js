/* ../acrx/assets/js/media-upload.js */
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("file-input");
  const uploadBox = document.getElementById("upload-box");
  const progressBox = document.getElementById("upload-progress");
  const selectBtn = document.getElementById("select-files");

  selectBtn.addEventListener("click", () => fileInput.click());

  uploadBox.addEventListener("dragover", e => {
    e.preventDefault();
    uploadBox.classList.add("dragging");
  });

  uploadBox.addEventListener("dragleave", () => {
    uploadBox.classList.remove("dragging");
  });

  uploadBox.addEventListener("drop", e => {
    e.preventDefault();
    uploadBox.classList.remove("dragging");
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener("change", e => handleFiles(e.target.files));

  function handleFiles(files) {
    const formData = new FormData();
    for (const file of files) formData.append("media", file);

    fetch("/acr/api/media/upload", 
      { method: "POST", 
        body: formData })
      .then(res => res.json())
      .then(data => {
        progressBox.innerHTML = "";
        if (data.success) {
          data.files.forEach(f => {
            const div = document.createElement("div");
            div.textContent = `${f.name} ✅`;
            progressBox.appendChild(div);
          });
        }
      })
      .catch(() => {
        progressBox.innerHTML = `<p style="color:red;">Upload failed.</p>`;
      });
  }
});
