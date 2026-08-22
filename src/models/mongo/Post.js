const mongoose = require("mongoose");
const { ContentSchema } = require("./shared/contentSchema");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "post")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

// Create a Revision snapshot after each Post save (Mongo variant).
const createRevisionSnapshot = async function (doc) {
  try {
    const Revision = doc.model ? doc.model("Revision") : mongoose.model("Revision");
    if (!Revision) return;
    const last = await Revision.findOne({ documentId: doc._id, documentType: "post" })
      .sort({ revisionNumber: -1 })
      .exec();
    const nextNum = last ? last.revisionNumber + 1 : 1;
    await Revision.create({
      documentId: doc._id,
      documentType: "post",
      content: doc.content,
      title: doc.title,
      status: doc.status,
      revisionNumber: nextNum,
      createdBy: doc.author || null,
    });
    // Enforce max revisions.
    const maxRev = 10;
    const all = await Revision.find({ documentId: doc._id, documentType: "post" })
      .sort({ revisionNumber: 1 })
      .exec();
    if (all.length > maxRev) {
      const toDelete = all.slice(0, all.length - maxRev);
      await Revision.deleteMany({ _id: { $in: toDelete.map((r) => r._id) } });
    }
  } catch (e) {
    console.warn("[Revision] snapshot failed:", e.message);
  }
};

const applySharedLogic = (doc) => {
  if (!doc.slug && doc.title) {
    doc.slug = doc.title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  if (doc.content?.raw) {
    const words = doc.content.raw.trim().split(/\s+/).filter(Boolean).length;
    doc.readingTime = Math.ceil(words / 200);
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

      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      categories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
      ],

      tags: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Tag",
        },
      ],

      status: {
        type: String,
        enum: [
          "draft",
          "scheduled",
          "published",
          "archived",
          "trashed",
        ],
        default: "draft",
      },

      publishDate: Date,

      publishAt: Date,

      featuredImage: String,

      featuredImageAlt: String,

      metaTitle: String,

      metaDescription: String,

      focusKeyword: String,

      keywords: [String],

      canonicalUrl: String,

      ogTitle: String,

      ogDescription: String,

      ogImage: String,

      seoReport: {
        score: Number,
        scoreParts: Object,
        suggestions: [String],
        wordCount: Number,
      },

      isPillarContent: {
        type: Boolean,
        default: false,
      },

      pillarParent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },

      allowComments: {
        type: Boolean,
        default: true,
      },

      noIndex: {
        type: Boolean,
        default: false,
      },

      noFollow: {
        type: Boolean,
        default: false,
      },

      views: {
        type: Number,
        default: 0,
      },

      likes: {
        type: Number,
        default: 0,
      },

      readingTime: {
        type: Number,
        default: 0,
      },

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
      name: "post_text_search",
    }
  );

  schema.pre("save", function (next) {
    applySharedLogic(this);
    next();
  });

  schema.post("save", function (doc) {
    // fire-and-forget; never blocks the save response
    createRevisionSnapshot(doc);
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

const attachMethods = (Post) => {
  Post.findPublished = () =>
    Post.find({
      status: "published",
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

    applySharedLogic(this);

    return this;
  };

  return Post;
};

const buildModel = () => {
  const schema = getSchema();
  const Post = mongoose.model("Post", schema);
  return attachMethods(Post);
};

module.exports = {
  buildModel,
};