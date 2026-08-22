const mongoose = require("mongoose");
const { ContentSchema } = require("./shared/contentSchema");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "page")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

const applySharedLogic = (doc) => {
  if (!doc.slug && doc.title) {
    doc.slug = doc.title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }
};

const getSchema = () => {
  const schema = new mongoose.Schema(
    {
      title: {
        type: String,
        required: true,
        trim: true,
      },

      slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },

      content: {
        type: ContentSchema,
        default: () => ({}),
      },

      customCSS: {
        type: String,
        default: "",
      },

      excerpt: String,

      status: {
        type: String,
        enum: [
          "draft",
          "published",
          "scheduled",
          "archived",
          "trashed",
        ],
        default: "draft",
      },

      template: {
        type: String,
        default: "default",
      },

      parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Page",
        default: null,
      },

      order: {
        type: Number,
        default: 0,
      },

      showInMenu: {
        type: Boolean,
        default: true,
      },

      featuredImage: String,

      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      publishDate: Date,

      publishAt: Date,

      metaTitle: String,

      metaDescription: String,

      focusKeyword: String,

      keywords: [String],

      canonicalUrl: String,

      ogTitle: String,

      ogDescription: String,

      ogImage: String,

      noIndex: {
        type: Boolean,
        default: false,
      },

      noFollow: {
        type: Boolean,
        default: false,
      },

      password: {
        type: String,
        select: false,
      },

      views: {
        type: Number,
        default: 0,
      },

      tags: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Tag",
        },
      ],

      ...getExtensions(),
    },
    {
      timestamps: true,
      strictPopulate: false,
    }
  );

  schema.index(
    {
      title: "text",
      "content.raw": "text",
      tags: "text",
    },
    {
      name: "page_text_search",
    }
  );

  schema.pre("save", function (next) {
    applySharedLogic(this);
    next();
  });

  schema.set("toJSON", {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });

  return schema;
};

const attachMethods = (Page) => {
  Page.findPublished = () =>
    Page.find({
      status: "published",
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
    this.content = {
      json:
        alphaJson ??
        this.content?.json ??
        null,

      html:
        renderedHtml ??
        this.content?.html ??
        "",

      raw:
        plainText ??
        this.content?.raw ??
        "",

      conditionalJS:
        this.content?.conditionalJS ??
        null,
    };

    return this;
  };

  return Page;
};

const buildModel = () => {
  const schema = getSchema();
  const Page = mongoose.model("Page", schema);
  return attachMethods(Page);
};

module.exports = {
  buildModel,
};