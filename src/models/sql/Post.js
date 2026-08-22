const { DataTypes } = require("sequelize");
const { ContentSchema } = require("./shared/contentSchema");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "post")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

// Create a Revision snapshot after each Post save.
// Reads the Revision model from the same sequelize instance (passed via models arg).
const createRevisionSnapshot = async (instance, options) => {
  try {
    const Revision = instance.sequelize.models.Revision;
    if (!Revision) return;
    const last = await Revision.findOne({
      where: { documentId: instance.id, documentType: "post" },
      order: [["revisionNumber", "DESC"]],
    });
    const nextNum = last ? last.revisionNumber + 1 : 1;
    await Revision.create({
      documentId: instance.id,
      documentType: "post",
      content: instance.content,
      title: instance.title,
      status: instance.status,
      revisionNumber: nextNum,
      summary: options?.revisionSummary || null,
      createdBy: instance.authorId,
    });
    // Enforce max revisions (default 10) — delete oldest beyond limit.
    const maxRev = 10;
    const all = await Revision.findAll({
      where: { documentId: instance.id, documentType: "post" },
      order: [["revisionNumber", "ASC"]],
    });
    if (all.length > maxRev) {
      const toDelete = all.slice(0, all.length - maxRev);
      await Revision.destroy({ where: { id: toDelete.map((r) => r.id) } });
    }
  } catch (e) {
    // Never let revision creation break the save.
    console.warn("[Revision] snapshot failed:", e.message);
  }
};

const applySharedLogic = (instance) => {
  if (!instance.slug && instance.title) {
    instance.slug = instance.title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  if (instance.content?.raw) {
    const words = instance.content.raw
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    instance.readingTime = Math.ceil(words / 200);
  }
};

const buildModel = (sequelize) => {
  const Post = sequelize.define(
    "Post",
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

      authorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      categories: {
        type: DataTypes.JSON,
        allowNull: true,
      },

      status: {
        type: DataTypes.ENUM(
          "draft",
          "scheduled",
          "published",
          "archived",
          "trashed"
        ),
        defaultValue: "draft",
      },

      publishDate: DataTypes.DATE,

      publishAt: DataTypes.DATE,

      featuredImage: DataTypes.STRING,

      featuredImageAlt: DataTypes.STRING,

      metaTitle: DataTypes.STRING,

      metaDescription: DataTypes.TEXT,

      focusKeyword: DataTypes.STRING,

      keywords: DataTypes.JSON,

      canonicalUrl: DataTypes.STRING,

      ogTitle: DataTypes.STRING,

      ogDescription: DataTypes.TEXT,

      ogImage: DataTypes.STRING,

      seoReport: {
        type: DataTypes.JSON,
        defaultValue: {
          score: 0,
          scoreParts: {},
          suggestions: [],
          wordCount: 0,
        },
      },

      isPillarContent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      pillarParentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      allowComments: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      noIndex: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      noFollow: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      views: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      likes: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      readingTime: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      ...getExtensions(),
    },
    {
      tableName: "posts",
      timestamps: true,

      hooks: {
        beforeValidate: applySharedLogic,
        afterSave: createRevisionSnapshot,
        afterCreate: createRevisionSnapshot,
      },
    }
  );

  Post.findPublished = () =>
    Post.findAll({
      where: {
        status: "published",
      },
    });

  Post.prototype.recalculateReadingTime = function () {
    applySharedLogic(this);
    return this.readingTime;
  };

  Post.prototype.deriveContent = function (
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

    applySharedLogic(this);

    return this;
  };

  Post.associate = (models) => {
    Post.belongsTo(models.User, {
      as: "authorData",
      foreignKey: "authorId",
    });

    Post.belongsToMany(models.Category, {
      through: "PostCategories",
      foreignKey: "postId",
    });

    Post.belongsToMany(models.Tag, {
      through: "PostTags",
      foreignKey: "postId",
      otherKey: "tagId",
    });

    Post.hasMany(Post, {
      as: "clusterPosts",
      foreignKey: "pillarParentId",
    });

    Post.belongsTo(Post, {
      as: "pillarPost",
      foreignKey: "pillarParentId",
    });
  };

  return Post;
};

module.exports = {
  buildModel,
};