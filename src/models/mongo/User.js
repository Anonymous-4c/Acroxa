// src/models/mongo/User.js
// PURE FUNCTIONS ONLY — NO MODEL EXPORT

const mongoose = require("mongoose");
const crypto = require("crypto");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "user")
  .map(s => s.structure)
  .reduce((acc, curr) => ({ ...acc, ...curr }), {});

const getSchema = () => {
  const schema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    fullName: String,
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "editor", "author", "seo", "designer", "developer", "user"],
      default: "user"
    },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "" },
    jobTitle: String,
    phone: String,
    location: String,
    department: String,
    website: String,
    skills: { type: [String], default: [] },
    socialLinks: { type: Object, default: {} },
    emailVerified: { type: Boolean, default: false },
    emailVerificationCode: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastLogin: Date,
    firstLogin: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isSuspended: { type: Boolean, default: false },
    isDefaultAdmin: { type: Boolean, default: false },
    // ── V2 Auth Engine Fields ──────────────────────────────
    controlKey: {
      type: String,
      unique: true,
      sparse: true, // allows null during migration window
      index: true,
      comment: "Cryptographically random key for /token/control/<controlKey>"
    },
    passkeys: {
      type: [
        {
          credentialId: { type: String, required: true },
          publicKey: { type: String, required: true },
          transports: [String],
          createdAt: { type: Date, default: Date.now },
          lastUsedAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    recoverySecretHash: {
      type: String,
      default: null
    },
    sessionVersion: {
      type: Number,
      default: 1,
      comment: "Increment to invalidate all existing sessions (global logout)"
    },
    lastControlAccess: {
      type: Date,
      default: null,
      comment: "Timestamp of last successful /token/control/<controlKey> visit"
    },
    // ──────────────────────────────────────────────────────

    ...getExtensions()
  }, { timestamps: true, strictPopulate: false });

  // ── Hooks ───────────────────────────────────────────────
  schema.pre("save", function (next) {
    if (this.isModified("email")) this.email = this.email.toLowerCase().trim();
    if (this.isModified("username")) this.username = this.username.toLowerCase().trim();

    // Auto-assign missing V2 fields on first save
    if (!this.controlKey) {
      this.controlKey = crypto.randomBytes(32).toString("hex");
    }
    if (!this.sessionVersion) {
      this.sessionVersion = 1;
    }
    if (!this.passkeys) {
      this.passkeys = [];
    }

    next();
  });

  schema.set("toJSON", {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      delete ret.emailVerificationCode;
      // Never expose the control key to API consumers
      delete ret.controlKey;
      return ret;
    }
  });

  return schema;
};

// ── Static & instance methods ────────────────────────────
const attachMethods = (User) => {
  User.findByUsername = async (username) =>
    User.findOne({ username: username.toLowerCase().trim() });

  User.findByEmail = async (email) =>
    User.findOne({ email: email.toLowerCase().trim() });

  User.findByControlKey = async (key) =>
    User.findOne({ controlKey: key, isActive: true, isSuspended: false });

  User.createUser = async (data) =>
    User.create({
      ...data,
      username: data.username?.toLowerCase().trim(),
      email: data.email?.toLowerCase().trim(),
      controlKey: data.controlKey || crypto.randomBytes(32).toString("hex"),
      sessionVersion: data.sessionVersion || 1,
      isDefaultAdmin: data.isDefaultAdmin || false,
      passkeys: data.passkeys || []
    });

  User.existsAny = async () => {
    try {
      return await User.exists({});
    } catch {
      return false;
    }
  };

  // Instance: add a new passkey credential
  User.prototype.addPasskey = async function (credential) {
    this.passkeys.push({
      credentialId: credential.credentialId,
      publicKey: credential.publicKey,
      transports: credential.transports || [],
      createdAt: new Date(),
      lastUsedAt: new Date()
    });
    await this.save();
  };

  // Instance: mark a passkey as used
  User.prototype.updatePasskeyLastUsed = async function (credentialId) {
    const pk = this.passkeys.find(p => p.credentialId === credentialId);
    if (pk) {
      pk.lastUsedAt = new Date();
      await this.save();
    }
  };

  // Instance: bump session version (global logout)
  User.prototype.bumpSessionVersion = async function () {
    this.sessionVersion = (this.sessionVersion || 1) + 1;
    await this.save();
    return this.sessionVersion;
  };

  return User;
};

const buildModel = () => {
  const schema = getSchema();
  // Guard against re-registration in hot-reload environments
  const User = mongoose.models.User || mongoose.model("User", schema);
  return attachMethods(User);
};

module.exports = { buildModel };
