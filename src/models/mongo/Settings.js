// src/models/mongo/Settings.js
// PURE FUNCTIONS ONLY — NO MODEL EXPORT

const mongoose = require("mongoose");

const getSchema = () => {
  const schema = new mongoose.Schema(
    {
      // ── GENERAL ────────────────────────────────────────────────────────────
      general: {
        siteName:        { type: String,  default: "Acroxa CMS" },
        siteTagline:     { type: String,  default: "" },
        siteDescription: { type: String,  default: "" },
        siteLogo:        { type: String,  default: "" },
        siteFavicon:     { type: String,  default: "" },
        siteURL:         { type: String,  default: "https://example.com" },
        adminEmail:      { type: String,  default: "" },
      },

      // ── LOCALIZATION ───────────────────────────────────────────────────────
      localization: {
        language:   { type: String, default: "en" },
        timezone:   { type: String, default: "UTC" },
        dateFormat: { type: String, default: "DD/MM/YYYY" },
        timeFormat: { type: String, enum: ["12h", "24h"], default: "24h" },
        currency:   { type: String, default: "USD" },
      },

      // ── SYSTEM ─────────────────────────────────────────────────────────────
      system: {
        maintenanceMode:           { type: Boolean, default: false },
        registrationEnabled:       { type: Boolean, default: true },
        defaultUserRole:           { type: String,  default: "user" },
        contentModerationRequired: { type: Boolean, default: false },
        autoSaveInterval:          { type: Number,  default: 30 },
        paginationLimit:           { type: Number,  default: 10 },
      },

      // ── SECURITY ───────────────────────────────────────────────────────────
      security: {
        loginAttemptsLimit: { type: Number,  default: 5 },
        sessionTimeout:     { type: Number,  default: 3600 },
        twoFactorEnabled:   { type: Boolean, default: false },
        passwordPolicy: {
          minLength:        { type: Number,  default: 8 },
          requireNumbers:   { type: Boolean, default: true },
          requireSymbols:   { type: Boolean, default: false },
          requireUppercase: { type: Boolean, default: true },
        },
        allowedIPs:  { type: [String], default: [] },
        corsOrigins: { type: [String], default: ["*"] },
      },

      // ── API ────────────────────────────────────────────────────────────────
      api: {
        apiEnabled:   { type: Boolean, default: true },
        apiRateLimit: { type: Number,  default: 100 },
        webhookURLs:  { type: [String], default: [] },
        thirdPartyKeys: {
          googleAnalytics: { type: String, default: "" },
          stripe:          { type: String, default: "" },
          openai:          { type: String, default: "" },
          gemini:          { type: String, default: "" },
        },
      },

      // ── PLUGINS ────────────────────────────────────────────────────────────
      plugins: {
        enabledPlugins:   { type: [String], default: [] },
        pluginAutoUpdate: { type: Boolean,  default: true },
        pluginConfig:     { type: mongoose.Schema.Types.Mixed, default: {} },
      },

      // ── CONTENT ────────────────────────────────────────────────────────────
      content: {
        defaultPostStatus: { type: String, enum: ["draft", "published", "private"], default: "draft" },
        allowComments:     { type: Boolean, default: true },
        postsPerPage:      { type: Number,  default: 10 },

        uploadStrategy: { type: String, enum: ["auto", "stream", "chunk"], default: "auto" },
        storageDriver:  { type: String, enum: ["local", "s3", "cloudinary", "custom"], default: "local" },

        autoOrganizeMedia: { type: Boolean, default: true },
        mediaNaming:       { type: String, enum: ["uuid", "original", "slug"], default: "uuid" },

        imageOptimization: {
          enabled: { type: Boolean, default: true },
          quality: { type: Number,  default: 80, min: 1, max: 100 },
          formats: { type: [String], default: ["webp"] },
        },

        versioning: {
          enabled:      { type: Boolean, default: true },
          maxRevisions: { type: Number,  default: 10 },
        },

        autosave: {
          enabled:  { type: Boolean, default: true },
          interval: { type: Number,  default: 30 },
        },
      },

      // ── HOMEPAGE ──────────────────────────────────────────────────────────
      homepage: {
        mode: {
          type: String,
          enum: ["posts", "page", "landing"],
          default: "posts",
        },
        pageId: {
          type: String,
          default: null,
        },
        template: {
          type: String,
          default: "homepage",
        },
      },

      // ── BLOG PAGE ────────────────────────────────────────────────────────
      blogPage: {
        enabled: { type: Boolean, default: false },
        pageId: { type: String, default: null },
        template: { type: String, default: "blog" },
        postsPerPage: { type: Number, default: 10 },
      },

      // ── ROUTING ──────────────────────────────────────────────────────────
      routing: {
        postPrefix: { type: String, default: "post" },
        categoryPrefix: { type: String, default: "category" },
        pagePrefix: { type: String, default: "" },

        enablePrettyURLs:   { type: Boolean, default: true },
        permalinkStructure: { type: String,  default: "/:postPrefix/:slug" },

        landingPagePrefix: { type: String, default: "landing" },
      },

      // ── SEO ────────────────────────────────────────────────────────────────
      seo: {
        metaTitle:       { type: String,  default: "" },
        metaDescription: { type: String,  default: "" },
        metaKeywords:    { type: String,  default: "" },
        enableSitemap:   { type: Boolean, default: true },
        enableRobotsTxt: { type: Boolean, default: true },
        canonicalURL:    { type: Boolean, default: true },
        openGraph: {
          enabled:      { type: Boolean, default: true },
          defaultImage: { type: String,  default: "" },
        },
        twitterCards: {
          enabled:    { type: Boolean, default: true },
          siteHandle: { type: String,  default: "" },
        },
        schemaMarkup: {
          enabled: { type: Boolean, default: true },
          type:    { type: String,  default: "Organization" },
        },
      },

      // ── ANALYTICS ──────────────────────────────────────────────────────────
      analytics: {
        analyticsEnabled:      { type: Boolean, default: true },
        trackingID:            { type: String,  default: "" },
        cookieConsentRequired: { type: Boolean, default: true },
      },

      // ── AI ─────────────────────────────────────────────────────────────────
      ai: {
        enabled:         { type: Boolean, default: true },
        defaultProvider: { type: String,  enum: ["openai", "gemini", "custom"], default: "openai" },
        providers: {
          openai: {
            apiKey:  { type: String,  default: "" },
            model:   { type: String,  default: "gpt-4o-mini" },
            enabled: { type: Boolean, default: true },
          },
          gemini: {
            apiKey:  { type: String,  default: "" },
            model:   { type: String,  default: "gemini-1.5-pro" },
            enabled: { type: Boolean, default: false },
          },
          custom: {
            endpoint: { type: String, default: "" },
            apiKey:   { type: String, default: "" },
          },
        },
        features: {
          contentSuggestions:        { type: Boolean, default: true },
          seoSuggestions:            { type: Boolean, default: true },
          autoTitleGeneration:       { type: Boolean, default: true },
          autoDescriptionGeneration: { type: Boolean, default: true },
          chatAssistant:             { type: Boolean, default: true },
        },
      },

      // ── ADVANCED ───────────────────────────────────────────────────────────
      advanced: {
        debugMode:    { type: Boolean, default: false },
        logLevel:     { type: String,  enum: ["error", "warn", "info", "debug"], default: "info" },
        cacheEnabled: { type: Boolean, default: true },
        cacheTTL:     { type: Number,  default: 3600 },
        cdnURL:       { type: String,  default: "" },
        environment:  { type: String,  enum: ["development", "staging", "production"], default: "production" },
      },

      // ── ACROXAJS RUNTIME (Phase 9) ────────────────────────────────────────
      // Flat per-field shape like every section. Every key affects runtime
      // behavior (cache-layers.test.mjs); core contracts stay non-configurable.
      runtime: {
        cacheEnabled:    { type: Boolean, default: true },
        cacheStrategy:   { type: String,  default: "cache-first" },
        cacheTTL:        { type: Number,  default: 60000 },
        cacheSwrGraceMs: { type: Number,  default: 30000 },
        cacheMaxSize:    { type: Number,  default: 200 },
        patchLog:        { type: Boolean, default: true },
        inspector:       { type: Boolean, default: true },
      },

      // ── EMAIL ──────────────────────────────────────────────────────────────
      email: {
        enabled:       { type: Boolean, default: false },
        host:          { type: String,  default: "" },
        port:          { type: Number,  default: 587 },
        username:      { type: String,  default: "" },
        password:      { type: String,  default: "" }, // stored encrypted
        encryption:    { type: String,  enum: ["ssl", "starttls", "none"], default: "starttls" },
        senderName:    { type: String,  default: "" },
        senderAddress: { type: String,  default: "" },
      },

      // ── APPEARANCE ────────────────────────────────────────────────────────
      appearance: {
        defaultTheme: { type: String,  enum: ["light", "dark", "auto"], default: "light" },
        primaryColor: { type: String,  default: "#6366f1" },
        fontFamily:   { type: String,  default: "Inter" },
        layoutStyle:  { type: String,  enum: ["boxed", "full-width", "framed"], default: "boxed" },
        borderRadius: { type: String,  enum: ["none", "sm", "md", "lg", "xl"], default: "md" },
        enableGlass:  { type: Boolean, default: false },
        enableShadows:{ type: Boolean, default: true },
        animation:    { type: String,  enum: ["none", "smooth", "dynamic"], default: "smooth" },
      },

      // ── BACKUP POLICY ──────────────────────────────────────────────────────
      backupPolicy: {
        enabled: { type: Boolean, default: false },

        schedule: {
          interval: {
            type: String,
            enum: ["realtime", "hourly", "daily", "weekly", "custom"],
            default: "daily",
          },
          time:           { type: String, default: "02:00" },
          customInterval: { type: Number, default: 0 },
        },

        targets: {
          local: { type: Boolean, default: true },
          git:   { type: Boolean, default: false },
          cloud: { type: Boolean, default: false },
        },

        includeMedia: { type: Boolean, default: false },

        git: {
          repoURL:     { type: String, default: "" },
          branch:      { type: String, default: "main" },
          token:       { type: String, default: "" }, // stored encrypted (see cryptoUtil)
          authorName:  { type: String, default: "Acroxa CMS" },
          authorEmail: { type: String, default: "cms@acroxa.io" },
        },

        cloud: {
          // Each connection is a fully self-describing credential set for ONE provider.
          // Every provider-specific field lives on the same sub-schema (sparse per type).
          // Secret fields are stored AES-256-GCM encrypted via cryptoUtil.
          connections: {
            type: [
              {
                id:       { type: String, required: true }, // uuid, generated server-side
                provider: {
                  type: String,
                  required: true,
                  enum: [
                    "s3", "r2", "b2", "gdrive", "dropbox", "onedrive", "azure",
                    "gcs", "spaces", "wasabi", "linode", "vultr", "minio",
                    "ftp", "sftp", "webdav", "custom-s3",
                  ],
                },
                name: { type: String, default: "" }, // "Connection Name" field

                // ── S3 / R2 / B2 / Spaces / Wasabi / Linode / Vultr / MinIO / Custom-S3 (shared shape) ──
                bucket:         { type: String, default: "" },
                region:         { type: String, default: "" },
                endpoint:       { type: String, default: "" },
                accessKey:      { type: String, default: "" }, // encrypted
                secretKey:      { type: String, default: "" }, // encrypted
                storageClass:   { type: String, default: "" },
                accountId:      { type: String, default: "" }, // r2
                useSSL:         { type: Boolean, default: true }, // minio / custom-s3
                forcePathStyle: { type: Boolean, default: false }, // custom-s3

                // ── Google Drive ──
                projectId:     { type: String, default: "" },
                rootFolder:    { type: String, default: "" },
                clientId:      { type: String, default: "" },
                clientSecret:  { type: String, default: "" }, // encrypted
                refreshToken:  { type: String, default: "" }, // encrypted

                // ── Dropbox ──
                appKey:    { type: String, default: "" },
                appSecret: { type: String, default: "" }, // encrypted
                folder:    { type: String, default: "" },

                // ── OneDrive / Azure ──
                tenantId:        { type: String, default: "" },
                storageAccount:  { type: String, default: "" },
                container:       { type: String, default: "" },
                accountKey:      { type: String, default: "" }, // encrypted

                // ── GCS ──
                serviceAccountJSON: { type: String, default: "" }, // encrypted
                folderPrefix:       { type: String, default: "" },

                // ── FTP / SFTP / WebDAV ──
                host:        { type: String, default: "" },
                port:        { type: Number, default: 0 },
                username:    { type: String, default: "" },
                password:    { type: String, default: "" }, // encrypted
                privateKey:  { type: String, default: "" }, // encrypted (sftp)
                directory:   { type: String, default: "" },
                passive:     { type: Boolean, default: true }, // ftp
                useTLS:      { type: Boolean, default: false }, // ftp
                url:         { type: String, default: "" }, // webdav server url

                createdAt: { type: Date, default: Date.now },
                updatedAt: { type: Date, default: Date.now },
              },
            ],
            default: [],
          },

          jobs: {
            type: [
              {
                id:           { type: String, required: true }, // uuid
                connectionId: { type: String, default: "" },
                name:         { type: String, default: "" },
                enabled:      { type: Boolean, default: true },
                includeMedia: { type: Boolean, default: true },
                backupPath:   { type: String, default: "" },
                createdAt:    { type: Date, default: Date.now },
                updatedAt:    { type: Date, default: Date.now },
              },
            ],
            default: [],
          },
        },
      },
    },
    { timestamps: true }
  );

  schema.index({ "general.siteName": 1 });

  schema.set("toJSON", {
    transform: (doc, ret) => {
      ret.id = ret._id ? ret._id.toString() : undefined;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });

  return schema;
};

const attachMethods = (Settings) => {
  Settings.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) settings = await this.create({});
    return settings;
  };

  Settings.updateSettings = async function (updateData) {
    // Deep merge each section to avoid overwriting nested objects
    const current = await this.findOne() || {};
    const merged = {};

    function deepMerge(target, source) {
      const result = { ...target };
      for (const key of Object.keys(source)) {
        if (
          source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) &&
          target[key] && typeof target[key] === "object" && !Array.isArray(target[key])
        ) {
          result[key] = deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
      return result;
    }

    for (const [key, value] of Object.entries(updateData)) {
      if (value && typeof value === "object" && !Array.isArray(value) && current[key]) {
        merged[key] = deepMerge(current[key], value);
      } else {
        merged[key] = value;
      }
    }

    return this.findOneAndUpdate(
      {},
      { $set: merged },
      { new: true, upsert: true, runValidators: true }
    );
  };

  Settings.resetToDefaults = async function () {
    await this.deleteMany({});
    return this.create({});
  };

  // Convenience: get routing-relevant settings in one call
  Settings.getRoutingConfig = async function () {
    const s = await this.getSettings();
    return {
      homepage:  s.homepage  || {},
      blogPage:  s.blogPage  || {},
      routing:   s.routing   || {},
    };
  };

  return Settings;
};

const buildModel = () => {
  const schema   = getSchema();
  const Settings = mongoose.model("Settings", schema);
  return attachMethods(Settings);
};

module.exports = { buildModel };
