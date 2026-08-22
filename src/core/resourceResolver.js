// src/core/resourceResolver.js
const { getConnection } = require("./connect-db");

// detect db type
function getDbType(conn) {
  if (conn?.define) return "sequelize";
  if (conn?.modelNames || conn?.models) return "mongoose";
  return "unknown";
}

// map resourceKey → model name
const resourceMap = {
  post: "Post",
  page: "Page",
  category: "Category",
  // future:
  // comment: "Comment",
  // user: "User"
};

async function getResourceById(resourceKey, id, options = {}) {
  const conn = getConnection();
  const dbType = getDbType(conn);

  const modelName = resourceMap[resourceKey];
  if (!modelName) {
    throw new Error(`Invalid resourceKey: ${resourceKey}`);
  }

  const Model = conn.models[modelName];
  if (!Model) {
    throw new Error(`Model not found: ${modelName}`);
  }

  let resource;

  // ======================
  // SEQUELIZE
  // ======================
  if (dbType === "sequelize") {
    resource = await Model.findByPk(id, {
      include: [
        {
          association: "authorData",
          attributes: ["id", "username", "fullName", "avatar"],
        },
      ],
      ...options,
    });

    if (!resource) return null;

    // normalize author
    const plain = resource.toJSON();
    plain.author = plain.authorData;
    delete plain.authorData;

    return plain;
  }

  // ======================
  // MONGOOSE
  // ======================
  if (dbType === "mongoose") {
    resource = await Model.findById(id)
      .populate("author", "username fullName avatar")
      .lean();

    return resource || null;
  }

  throw new Error("Unknown database type");
}

module.exports = { getResourceById };