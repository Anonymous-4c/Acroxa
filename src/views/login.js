const { el, Toggle, CustomDropdown } = require("./lib/framework");

function renderLogin() {
  const keepMeToggle = Toggle({
    id: "keepMeToggle",
    label: "Keep me logged in",
    hint: "Extend session duration",
    checked: false
  });

  const keepMeDuration = CustomDropdown({
    id: "keepMeDuration",
    label: "Session Duration",
    items: [
      { label: "2 hours", value: "2h" },
      { label: "24 hours", value: "24h" },
      { label: "7 days", value: "7d" },
      { label: "14 days", value: "14d" }
    ]
  });

  return `<!DOCTYPE html>
<html lang="en" data-no-auth-redirect>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Acroxa</title>

  <link rel="stylesheet" href="/acrx/assets/css/ad-log.css">
  <link rel="stylesheet" href="/acrx/assets/css/ad-c.css">
  <link rel="stylesheet" href="/acrx/assets/css/ad-ds.css">
  <link rel="stylesheet" href="/acrx/assets/css/ad-st.css">
  <link rel="stylesheet" href="/acrx/assets/css/root.css">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Lobster&display=swap" rel="stylesheet">

  <link id="favicon" rel="icon" type="image/svg+xml" href="/acrx/assets/images/icon.svg">
</head>

<body>
  <main class="mw12 d-flex flex-col">

    <e class="rot-c h-1000 w-1000">
      <div class="dot-child">
        <div class="dot-child">
          <div class="dot-child">
            <div class="dot-child"></div>
          </div>
        </div>
      </div>
    </e>

    <div class="form h-600 w-600 d-flex flex-col">

      <div class="branding">
        <div class="ic"></div>
      </div>

      <div class="main d-flex flex-col p-2">

        <p>Username or Email</p>
        ${el("input", {
          type: "text",
          id: "okl",
          placeholder: "Username or Email"
        })}

        <p>Password</p>
        ${el("input", {
          type: "password",
          id: "pwd",
          placeholder: "Password"
        })}

        <!-- Keep Me Logged In -->
        ${el("div", { class: "keep-me-row d-flex" },
          keepMeToggle,
          keepMeDuration
        )}

        ${el("div", { class: "d-flex" },
          el("button", {
            class: "fg-b btn button",
            "data-set-op": "log"
          }, "Login"),

          el("sep"),

          el("button", {
            class: "fg-p btn button",
            "data-set-op": "forgot"
          }, "Forget Password")
        )}

      </div>

      <div class="reset-box">
        <div class="step1">
          ${el("input", {
            id: "identifier",
            type: "text",
            placeholder: "Username or Email"
          })}

          ${el("div", {
            id: "sendCodeBtn",
            class: "btn button-pst"
          }, "Send Reset Code")}
        </div>

        <div class="step2" style="display:none;">
          ${el("input", {
            id: "code",
            type: "text",
            placeholder: "Verification Code"
          })}

          ${el("input", {
            id: "newPassword",
            type: "password",
            placeholder: "New Password"
          })}

          ${el("button", {
            id: "resetPwdBtn",
            class: "btn button-pst"
          }, "Reset Password")}
        </div>
      </div>

    </div>
  </main>

  <div id="no-ref"></div>

  <script src="/acrx/assets/js/login.js" type="module"></script>
  <script src="/acrx/assets/js/all.js" type="module"></script>
</body>
</html>`;
}

module.exports = { renderLogin };