// src/models/mongo/Menu.js
// Menu model — supports nested submenus (max depth 2) and named slot assignment.
// A single menu can be assigned to multiple slots (e.g. "primary", "footer").
// The layout config references menus by their _id assigned to a slot.

const mongoose = require("mongoose");

// ── Menu Item (recursive, max depth 2 enforced at service level) ──────────────

const MenuItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    url:   { type: String, default: "#",   trim: true },

    // Optional icon class (Font Awesome etc.)
    icon:     { type: String, default: "" },

    // Order within parent
    order:    { type: Number, default: 0 },

    // Depth-1 children (sub-menu items)
    // Each child can have its own children array = depth 2 max
    children: [
      {
        label:    { type: String, required: true, trim: true },
        url:      { type: String, default: "#", trim: true },
        icon:     { type: String, default: "" },
        order:    { type: Number, default: 0 },

        // Depth-2 children (grandchild level — max depth)
        children: [
          {
            label:  { type: String, required: true, trim: true },
            url:    { type: String, default: "#", trim: true },
            icon:   { type: String, default: "" },
            order:  { type: Number, default: 0 },
          },
        ],
      },
    ],
  },
  { _id: true }
);

// ── Menu Schema ───────────────────────────────────────────────────────────────

const getSchema = () => {
  const schema = new mongoose.Schema(
    {
      // Human-readable name shown in the customizer dropdown
      name: {
        type:     String,
        required: true,
        trim:     true,
      },

      // URL-friendly identifier auto-generated from name if not provided
      slug: {
        type:   String,
        unique: true,
        trim:   true,
      },

      // ── SLOT ASSIGNMENT ────────────────────────────────────────────────────
      // A menu can be assigned to multiple named slots simultaneously.
      // Valid slot names are defined by the layout's meta.json `menuAreas` array.
      // Example: ["primary", "footer"]
      // Uniqueness is enforced at the application layer (one menu per slot).
      places: {
        type:    [String],
        default: [],
        validate: {
          validator(arr) {
            // All values must be unique strings
            return Array.isArray(arr) && new Set(arr).size === arr.length;
          },
          message: "places must contain unique slot names",
        },
      },

      // The actual navigation items
      items: [MenuItemSchema],

      // Soft-delete / visibility
      active: {
        type:    Boolean,
        default: true,
      },

      // Which layout this menu belongs to (optional — global menus have no layoutId)
      layoutId: {
        type:    String,
        default: null,
      },

      description: {
        type:    String,
        default: "",
      },
    },
    { timestamps: true }
  );

  // ── Indexes ────────────────────────────────────────────────────────────────
  schema.index({ slug:     1 });
  schema.index({ places:   1 });
  schema.index({ layoutId: 1 });
  schema.index({ active:   1 });

  // ── Auto-slug on save ──────────────────────────────────────────────────────
  schema.pre("save", function (next) {
    if (!this.slug) {
      this.slug = this.name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
    next();
  });

  // ── toJSON cleanup ─────────────────────────────────────────────────────────
  schema.set("toJSON", {
    transform: (doc, ret) => {
      ret.id = ret._id?.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });

  return schema;
};

// ── Static Methods ─────────────────────────────────────────────────────────────

const attachMethods = (Menu) => {
  // Get all active menus
  Menu.getAll = async function (layoutId = null) {
    const q = { active: true };
    if (layoutId) q.$or = [{ layoutId }, { layoutId: null }];
    return this.find(q).sort({ name: 1 }).lean();
  };

  // Get a menu by its slot name (e.g. "primary", "footer")
  Menu.getBySlot = async function (slot, layoutId = null) {
    const q = { places: slot, active: true };
    if (layoutId) q.$or = [{ layoutId }, { layoutId: null }];
    return this.findOne(q).lean();
  };

  // Get multiple slots at once → returns { primary: menuDoc, footer: menuDoc }
  Menu.getSlots = async function (slots, layoutId = null) {
    const result = {};
    await Promise.all(
      slots.map(async (slot) => {
        result[slot] = await Menu.getBySlot(slot, layoutId);
      })
    );
    return result;
  };

  // Assign a menu to a slot, removing any previous assignment to that slot
  Menu.assignToSlot = async function (menuId, slot) {
    // Remove slot from all other menus first (one menu per slot rule)
    await this.updateMany(
      { _id: { $ne: menuId }, places: slot },
      { $pull: { places: slot } }
    );
    // Add slot to this menu if not already present
    return this.findByIdAndUpdate(
      menuId,
      { $addToSet: { places: slot } },
      { new: true }
    );
  };

  // Remove a menu from a slot
  Menu.removeFromSlot = async function (menuId, slot) {
    return this.findByIdAndUpdate(
      menuId,
      { $pull: { places: slot } },
      { new: true }
    );
  };

  // Format a menu's items for use in layout templates
  Menu.formatForTemplate = function (menu) {
    if (!menu) return [];
    return (menu.items || [])
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((item) => ({
        label:    item.label,
        url:      item.url || "#",
        icon:     item.icon  || "",
        children: (item.children || [])
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((child) => ({
            label:    child.label,
            url:      child.url || "#",
            icon:     child.icon  || "",
            children: (child.children || [])
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((gc) => ({
                label:  gc.label,
                url:    gc.url || "#",

                icon:   gc.icon  || "",
              })),
          })),
      }));
  };

  return Menu;
};

// ── Build & Export ─────────────────────────────────────────────────────────────

const buildModel = () => {
  const schema = getSchema();
  const Menu   = mongoose.model("Menu", schema);
  return attachMethods(Menu);
};

module.exports = { buildModel };