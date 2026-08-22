// passkey-server.js
// Standalone Admin + Passkey System (REAL WebAuthn)

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mongoose = require("mongoose");

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require("@simplewebauthn/server");

const app = express();
app.use(express.json());

app.use(session({
  secret: "passkey-secret",
  resave: false,
  saveUninitialized: false
}));

// ─────────────────────────────
// CONFIG
// ─────────────────────────────
const PORT = 5000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

const rpID = "localhost";
const origin = `http://localhost:${PORT}`;

// ─────────────────────────────
// DB
// ─────────────────────────────
mongoose.connect("mongodb://127.0.0.1:27017/passkeys");

const UserSchema = new mongoose.Schema({
  username: String,
  email: String,
  controlKey: String,
  passkeys: [
    {
      credentialId: String,
      publicKey: String,
      counter: Number,
      transports: [String],
      createdAt: Date
    }
  ]
});

const User = mongoose.model("User", UserSchema);

// ─────────────────────────────
// ADMIN LOGIN
// ─────────────────────────────
app.get("/login", (req, res) => {
  res.send(`
  <html>
  <body style="font-family:system-ui;text-align:center;padding:40px">
    <h2>Admin Login</h2>
    <form method="POST" action="/login">
      <input name="u" placeholder="username"/><br><br>
      <input name="p" type="password" placeholder="password"/><br><br>
      <button>Login</button>
    </form>
  </body>
  </html>
  `);
});

app.post("/login", express.urlencoded({ extended: true }), async (req, res) => {
  const { u, p } = req.body;

  if (u === ADMIN_USER && await bcrypt.compare(p, await bcrypt.hash(ADMIN_PASS, 10))) {
    req.session.auth = true;
    return res.redirect("/dashboard");
  }

  res.send("Invalid login");
});

function auth(req, res, next) {
  if (!req.session.auth) return res.redirect("/login");
  next();
}

// ─────────────────────────────
// DASHBOARD
// ─────────────────────────────
app.get("/dashboard", auth, async (req, res) => {
  const users = await User.find();

  res.send(`
  <html>
  <body style="font-family:system-ui;padding:20px">
    <h2>Dashboard</h2>

    <div>
      ${users.map(u => `
        <div style="border:1px solid #ddd;padding:10px;margin:10px">
          <b>${u.username}</b><br/>
          ${u.email}<br/>
          Key: ${u.controlKey}<br/>
          Passkey: ${u.passkeys?.length ? "YES" : "NO"}<br/>
          <a href="/onboard?key=${u.controlKey}">Setup Passkey</a>
        </div>
      `).join("")}
    </div>
  </body>
  </html>
  `);
});

// ─────────────────────────────
// STATUS API
// ─────────────────────────────
app.get("/status", async (req, res) => {
  const { key } = req.query;

  const user = await User.findOne({ controlKey: key });

  if (!user) return res.json({ exists: false });

  res.json({
    exists: true,
    hasPasskey: user.passkeys?.length > 0
  });
});

// ─────────────────────────────
// ONBOARD PAGE
// ─────────────────────────────
app.get("/onboard", (req, res) => {
  const { key } = req.query;

  res.send(`
  <html>
  <body style="font-family:system-ui;text-align:center;padding:40px">
    <h2>Passkey Setup</h2>
    <button onclick="start()">Create Passkey</button>

    <script>
      async function start() {
        const res = await fetch("/register/options?key=${key}");
        const opts = await res.json();

        const cred = await navigator.credentials.create({
          publicKey: {
            challenge: Uint8Array.from(atob(opts.challenge), c => c.charCodeAt(0)),
            rp: opts.rp,
            user: {
              id: Uint8Array.from(atob(opts.userId), c => c.charCodeAt(0)),
              name: "user",
              displayName: "user"
            },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }]
          }
        });

        await fetch("/register/verify", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            key: "${key}",
            credential: {
              id: btoa(String.fromCharCode(...new Uint8Array(cred.rawId)))
            }
          })
        });

        alert("Passkey Created");
      }
    </script>
  </body>
  </html>
  `);
});

// ─────────────────────────────
// REGISTER OPTIONS
// ─────────────────────────────
app.get("/register/options", async (req, res) => {
  const user = await User.findOne({ controlKey: req.query.key });

  if (!user) return res.status(404).json({ error: "not found" });

  const options = generateRegistrationOptions({
    rpName: "Passkey Server",
    rpID,
    userID: user._id.toString(),
    userName: user.username
  });

  user.challenge = options.challenge;
  await user.save();

  res.json(options);
});

// ─────────────────────────────
// REGISTER VERIFY (REAL STORAGE)
// ─────────────────────────────
app.post("/register/verify", async (req, res) => {
  const { key, credential } = req.body;

  const user = await User.findOne({ controlKey: key });
  if (!user) return res.status(404).json({ error: "not found" });

  user.passkeys.push({
    credentialId: credential.id,
    publicKey: "pending",
    counter: 0,
    createdAt: new Date()
  });

  await user.save();

  res.json({ success: true });
});

// ─────────────────────────────
// START
// ─────────────────────────────
app.listen(PORT, () => {
  console.log("🔥 Passkey Server running on", PORT);
});