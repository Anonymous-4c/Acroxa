const { DataTypes } = require("sequelize");
const { ContentSchema } = require("./shared/contentSchema");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "page")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

const applySharedLogic = (instance) => {
  if (!instance.slug && instance.title) {
    instance.slug = instance.title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }
};

const buildModel = (sequelize) => {
  const Page = sequelize.define(
    "Page",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      content: ContentSchema,

      customCSS: {
        type: DataTypes.TEXT,
      },

      excerpt: DataTypes.TEXT,

      status: {
        type: DataTypes.ENUM(
          "draft",
          "published",
          "scheduled",
          "archived",
          "trashed"
        ),
        defaultValue: "draft",
      },

      template: {
        type: DataTypes.STRING,
        defaultValue: "default",
      },

      parentId: {
        type: DataTypes.INTEGER,
      },

      order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      showInMenu: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      featuredImage: DataTypes.STRING,

      authorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      publishDate: DataTypes.DATE,

      publishAt: DataTypes.DATE,

      metaTitle: DataTypes.STRING,
      metaDescription: DataTypes.TEXT,
      focusKeyword: DataTypes.STRING,

      keywords: DataTypes.JSON,

      canonicalUrl: DataTypes.STRING,

      ogTitle: DataTypes.STRING,
      ogDescription: DataTypes.TEXT,
      ogImage: DataTypes.STRING,

      noIndex: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      noFollow: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      password: DataTypes.STRING,

      views: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      ...getExtensions(),
    },
    {
      tableName: "pages",
      timestamps: true,
      hooks: {
        beforeValidate: applySharedLogic,
      },
    }
  );

  Page.findPublished = () =>
    Page.findAll({
      where: {
        status: "published",
      },
    });

  Page.prototype.recalculateSlug = function () {
    applySharedLogic(this);
    return this.slug;
  };

  Page.prototype.deriveContent = function (
    alphaJson,
    renderedHtml,
    plainText
  ) {
    const current = this.content || {};

    this.content = {
      json: alphaJson ?? current.json ?? null,
      html: renderedHtml ?? current.html ?? "",
      raw: plainText ?? current.raw ?? "",
      conditionalJS: current.conditionalJS ?? null,
    };

    return this;
  };

  Page.associate = (models) => {
    Page.belongsTo(models.User, {
      as: "authorData",
      foreignKey: "authorId",
    });

    Page.belongsTo(Page, {
      as: "parentPage",
      foreignKey: "parentId",
    });

    Page.hasMany(Page, {
      as: "childPages",
      foreignKey: "parentId",
    });

    Page.belongsToMany(models.Tag, {
      through: "PageTags",
      foreignKey: "pageId",
      otherKey: "tagId",
    });
  };

  return Page;
};

module.exports = {
  buildModel,
};