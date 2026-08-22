/* ../src/modules/logout.js */
const { LOGIN_PATH } = require("../../config/generated-paths");

function renderLogout() {
  return `
  
    <div class="acrx-dshb-wr logout-page">
      <div class="logout-box fade-in-up">
        <h1>Logging out...</h1>
        <p>If you are not redirected automatically, click the button below.</p>
        <button id="logoutBtn" class="btn accent">Logout Now</button>
      </div>
    </div>
    <script>
      const LOGOUT_API = "/acr/api/logout";     // ← change if your logout route is different
      const LOGIN_PATH = "/acroxa/login";         // ← your login page path

      const performLogout = async () => {
        try {
          // Call the backend logout endpoint to clear the cookie
          const response = await fetch(LOGOUT_API, {
            method: "POST",                      // or "GET" if you made the route GET
            credentials: "include",              // ← required for cookie to be cleared
            headers: {
              "Content-Type": "application/json"
            }
          });

          // Optional: you can await response.json() if you want to show a toast or something
          // but for logout page we usually just redirect anyway
          console.log("Logout API called successfully");

        } catch (err) {
          console.error("Logout API failed:", err);
          // Even if the fetch fails (network issue, etc.), we still want to redirect
        }

        // Always redirect to login after attempting logout
        window.location.replace(LOGIN_PATH);
      };

      // Auto-logout after 1 second (same as before)
      setTimeout(performLogout, 1000);

      // Manual button click
      document.getElementById("logoutBtn")?.addEventListener("click", () => {
        performLogout();
      });
    </script>
  `;
}

module.exports = { renderLogout };
