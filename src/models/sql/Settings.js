// src/models/sql/Settings.js

const { DataTypes } = require("sequelize");

const JSON_SECTIONS = [
  "general", "localization", "system", "security",
  "api", "plugins", "content",
  "homepage", "blogPage", "routing",
  "seo", "analytics", "ai", "advanced", "backupPolicy",
  "email", "appearance",
  "runtime",
];

const buildModel = (sequelize) => {
  const Settings = sequelize.define(
    "Settings",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      general: {
        type: DataTypes.JSON,
        defaultValue: {
          siteName: "Acroxa CMS", siteTagline: "", siteDescription: "",
          siteLogo: "", siteFavicon: "", siteURL: "https://example.com", adminEmail: "",
        },
      },

      localization: {
        type: DataTypes.JSON,
        defaultValue: { language: "en", timezone: "UTC", dateFormat: "DD/MM/YYYY", timeFormat: "24h", currency: "USD" },
      },

      system: {
        type: DataTypes.JSON,
        defaultValue: {
          maintenanceMode: false, registrationEnabled: true, defaultUserRole: "user",
          contentModerationRequired: false, autoSaveInterval: 30, paginationLimit: 10,
        },
      },

      security: {
        type: DataTypes.JSON,
        defaultValue: {
          loginAttemptsLimit: 5, sessionTimeout: 3600, twoFactorEnabled: false,
          passwordPolicy: { minLength: 8, requireNumbers: true, requireSymbols: false, requireUppercase: true },
          allowedIPs: [], corsOrigins: ["*"],
        },
      },

      api: {
        type: DataTypes.JSON,
        defaultValue: {
          apiEnabled: true, apiRateLimit: 100, webhookURLs: [],
          thirdPartyKeys: { googleAnalytics: "", stripe: "", openai: "", gemini: "" },
        },
      },

      plugins: {
        type: DataTypes.JSON,
        defaultValue: { enabledPlugins: [], pluginAutoUpdate: true, pluginConfig: {} },
      },

      content: {
        type: DataTypes.JSON,
        defaultValue: {
          defaultPostStatus: "draft",
          allowComments: true,
          postsPerPage: 10,
          uploadStrategy: "auto",
          storageDriver: "local",
          autoOrganizeMedia: true,
          mediaNaming: "uuid",
          imageOptimization: { enabled: true, quality: 80, formats: ["webp"] },
          versioning: { enabled: true, maxRevisions: 10 },
          autosave: { enabled: true, interval: 30 },
        },
      },

      // ── HOMEPAGE ─────────────────────────────────────────────────────────
      // Controls what renders at /
      homepage: {
        type: DataTypes.JSON,
        defaultValue: {
          // "posts"   → posts archive
          // "page"    → specific page rendered as homepage
          // "landing" → landing page rendered as homepage
          mode: "posts",
          pageId: null,
          template: "homepage",
        },
      },

      // ── BLOG PAGE ─────────────────────────────────────────────────────────
      // Designates a page whose slug becomes the blog archive route
      blogPage: {
        type: DataTypes.JSON,
        defaultValue: {
          enabled: false,
          pageId: null,
          template: "blog",
          postsPerPage: 10,
        },
      },

      // ── ROUTING ───────────────────────────────────────────────────────────
      routing: {
        type: DataTypes.JSON,
        defaultValue: {
          postPrefix: "post",
          categoryPrefix: "category",
          pagePrefix: "",
          enablePrettyURLs: true,
          permalinkStructure: "/:postPrefix/:slug",
          landingPagePrefix: "landing",
        },
      },

      seo: {
        type: DataTypes.JSON,
        defaultValue: {
          metaTitle: "", metaDescription: "", metaKeywords: "",
          enableSitemap: true, enableRobotsTxt: true, canonicalURL: true,
          openGraph: { enabled: true, defaultImage: "" },
          twitterCards: { enabled: true, siteHandle: "" },
          schemaMarkup: { enabled: true, type: "Organization" },
        },
      },

      analytics: {
        type: DataTypes.JSON,
        defaultValue: { analyticsEnabled: true, trackingID: "", cookieConsentRequired: true },
      },

      ai: {
        type: DataTypes.JSON,
        defaultValue: {
          enabled: true, defaultProvider: "openai",
          providers: {
            openai: { apiKey: "", model: "gpt-4o-mini", enabled: true },
            gemini: { apiKey: "", model: "gemini-1.5-pro", enabled: false },
            custom: { endpoint: "", apiKey: "" },
          },
          features: {
            contentSuggestions: true, seoSuggestions: true,
            autoTitleGeneration: true, autoDescriptionGeneration: true, chatAssistant: true,
          },
        },
      },

      advanced: {
        type: DataTypes.JSON,
        defaultValue: {
          debugMode: false, logLevel: "info", cacheEnabled: true,
          cacheTTL: 3600, cdnURL: "", environment: "production",
        },
      },

      // AcroxaJS runtime (Phase 9) — flat shape like every section.
      // Every key affects runtime behavior (cache-layers.test.mjs);
      // core identity/protocol/boot paths stay non-configurable.
      runtime: {
        type: DataTypes.JSON,
        defaultValue: {
          cacheEnabled: true, cacheStrategy: "cache-first", cacheTTL: 60000,
          cacheSwrGraceMs: 30000, cacheMaxSize: 200,
          patchLog: true, inspector: true,
        },
      },

      backupPolicy: {
        type: DataTypes.JSON,
        defaultValue: {
          enabled: false,

          schedule: {
            interval: "daily",
            time: "02:00",
            customInterval: 0,
          },

          targets: {
            local: true,
            git: false,
            cloud: false,
          },

          includeMedia: false,

          git: {
            repoURL: "",
            branch: "main",
            token: "", // stored encrypted
            authorName: "Acroxa CMS",
            authorEmail: "cms@acroxa.io",
          },

          cloud: {
            connections: [],
            jobs: []
          }
        }
      },

      email: {
        type: DataTypes.JSON,
        defaultValue: {
          enabled: false,
          host: "",
          port: 587,
          username: "",
          password: "",
          encryption: "starttls",
          senderName: "",
          senderAddress: "",
        },
      },

      appearance: {
        type: DataTypes.JSON,
        defaultValue: {
          defaultTheme: "light",
          primaryColor: "#6366f1",
          fontFamily: "Inter",
          layoutStyle: "boxed",
          borderRadius: "md",
          enableGlass: false,
          enableShadows: true,
          animation: "smooth",
        },
      },
    },
    { tableName: "settings", timestamps: true }
  );

  // ── Static Methods ──────────────────────────────────────────────────────────

  Settings.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) settings = await this.create({});
    return settings;
  };

  Settings.updateSettings = async function (updateData) {
    let settings = await this.findOne();
    if (!settings) return this.create(updateData);

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

    for (const section of JSON_SECTIONS) {
      if (updateData[section] !== undefined) {
        settings[section] = deepMerge(settings[section] || {}, updateData[section]);
        settings.changed(section, true);
      }
    }

    return settings.save();
  };

  Settings.resetToDefaults = async function () {
    await this.destroy({ where: {}, truncate: true });
    return this.create({});
  };

  Settings.getRoutingConfig = async function () {
    const s = await this.getSettings();
    return {
      homepage: s.homepage || {},
      blogPage: s.blogPage || {},
      routing:  s.routing  || {},
    };
  };

  return Settings;
};

module.exports = { buildModel };