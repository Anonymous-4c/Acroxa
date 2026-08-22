// src/models/sql/User.js
const { DataTypes } = require("sequelize");
const crypto = require("crypto");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "user")
  .map(s => s.structure)
  .reduce((acc, curr) => ({ ...acc, ...curr }), {});

const buildModel = (sequelize) => {
  const User = sequelize.define("User", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    fullName: DataTypes.STRING,
    password: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.ENUM("admin", "editor", "author", "seo", "designer", "developer", "user"),
      defaultValue: "user"
    },
    avatar: { type: DataTypes.STRING, defaultValue: "" },
    bio: { type: DataTypes.TEXT, defaultValue: "" },
    jobTitle: DataTypes.STRING,
    phone: DataTypes.STRING,
    location: DataTypes.STRING,
    department: DataTypes.STRING,
    website: DataTypes.STRING,
    skills: { type: DataTypes.JSON, defaultValue: [] },
    socialLinks: { type: DataTypes.JSON, defaultValue: {} },
    emailVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    emailVerificationCode: DataTypes.STRING,
    resetPasswordToken: DataTypes.STRING,
    resetPasswordExpires: DataTypes.DATE,
    lastLogin: DataTypes.DATE,
    firstLogin: { type: DataTypes.BOOLEAN, defaultValue: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    isSuspended: { type: DataTypes.BOOLEAN, defaultValue: false },
    isDefaultAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    // ── V2 Auth Engine Fields ──────────────────────────────
    controlKey: {
      type: DataTypes.STRING(64),
      unique: true,
      allowNull: true, // populated at creation or by integrity check
      comment: "Cryptographically random key for /token/control/<controlKey>"
    },
    passkeys: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: "WebAuthn credential list: [{credentialId, publicKey, transports, createdAt, lastUsedAt}]"
    },
    recoverySecretHash: {
      type: DataTypes.STRING,
      allowNull: true
    },
    sessionVersion: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
      comment: "Increment to invalidate all existing sessions (global logout)"
    },
    lastControlAccess: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp of last successful /token/control/<controlKey> visit"
    },
    // ──────────────────────────────────────────────────────

    ...getExtensions()
  }, {
    tableName: "users",
    timestamps: true,
    hooks: {
      beforeValidate: (user) => {
        if (user.email) user.email = user.email.toLowerCase().trim();
        if (user.username) user.username = user.username.toLowerCase().trim();
      },
      beforeCreate: (user) => {
        // Auto-assign a control key if not already provided
        if (!user.controlKey) {
          user.controlKey = crypto.randomBytes(32).toString("hex");
        }
        if (!user.sessionVersion) {
          user.sessionVersion = 1;
        }
        if (!user.passkeys) {
          user.passkeys = [];
        }
      }
    }
  });

  // ── Static helpers ──────────────────────────────────────
  User.findByUsername = (u) =>
    User.findOne({ where: { username: u.toLowerCase().trim() } });

  User.findByEmail = (e) =>
    User.findOne({ where: { email: e.toLowerCase().trim() } });

  User.findByControlKey = (key) =>
    User.findOne({ where: { controlKey: key, isActive: true, isSuspended: false } });

  User.createUser = (data) =>
    User.create({
      ...data,
      username: data.username?.toLowerCase().trim(),
      email: data.email?.toLowerCase().trim(),
      controlKey: data.controlKey || crypto.randomBytes(32).toString("hex"),
      sessionVersion: data.sessionVersion || 1,
      isDefaultAdmin: data.isDefaultAdmin || false,
      passkeys: data.passkeys || []
    });

  User.existsAny = async () => (await User.count()) > 0;

  // ── Instance helpers ────────────────────────────────────
  User.prototype.addPasskey = async function(credential) {
    const passkeys = Array.isArray(this.passkeys) ? [...this.passkeys] : [];
    passkeys.push({
      credentialId: credential.credentialId,
      publicKey: credential.publicKey,
      transports: credential.transports || [],
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    });
    this.passkeys = passkeys;
    await this.save();
  };

  User.prototype.updatePasskeyLastUsed = async function(credentialId) {
    const passkeys = Array.isArray(this.passkeys) ? [...this.passkeys] : [];
    const idx = passkeys.findIndex(p => p.credentialId === credentialId);
    if (idx !== -1) {
      passkeys[idx].lastUsedAt = new Date().toISOString();
      this.passkeys = passkeys;
      await this.save();
    }
  };

  User.prototype.bumpSessionVersion = async function() {
    this.sessionVersion = (this.sessionVersion || 1) + 1;
    await this.save();
    return this.sessionVersion;
  };

  User.prototype.toJSON = function () {
    const v = this.get();
    delete v.password;
    delete v.resetPasswordToken;
    delete v.resetPasswordExpires;
    delete v.emailVerificationCode;
    // Never expose the control key to API consumers
    delete v.controlKey;
    return v;
  };

  return User;
};

module.exports = { buildModel };
