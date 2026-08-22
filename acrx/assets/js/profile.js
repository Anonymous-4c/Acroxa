/* ../acrx/assets/js/profile.js */
document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("profile-root");
  if (!root) return;

  try {

    // ✅ Fetch rendered HTML from /api/profile (not JSON)
    const res = await fetch("/acr/api/profile", {
      method: "GET",
    });

    // ✅ If unauthorized, show message
    if (res.status === 401) {
      root.innerHTML = `<p class="error">Unauthorized. Please log in again.</p>`;
      return;
    }

    // ✅ If OK, directly insert HTML
    if (res.ok) {
      const html = await res.text();
      root.innerHTML = html;
    } else {
      const errText = await res.text();
      root.innerHTML = `<p class="error">Error loading profile: ${errText}</p>`;
    }
  } catch (err) {
    console.error("Profile load error:", err);
    root.innerHTML = `<p class="error">Failed to connect to API</p>`;
  }
});
