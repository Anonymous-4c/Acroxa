// src/models/sql/Menu.js
// SQL Menu model — mirrors the Mongo version.
// Items and nested submenus are stored as JSON columns.
// places (slot assignments) stored as JSON array with unique-value enforcement.

const { DataTypes } = require("sequelize");

const buildModel = (sequelize) => {
  const Menu = sequelize.define(
    "Menu",
    {
      id: {
        type:          DataTypes.INTEGER,
        primaryKey:    true,
        autoIncrement: true,
      },

      // Human-readable name shown in the customizer dropdown
      name: {
        type:      DataTypes.STRING(200),
        allowNull: false,
      },

      // URL-friendly identifier
      slug: {
        type:      DataTypes.STRING(200),
        allowNull: false,
        unique:    true,
      },

      // ── SLOT ASSIGNMENT ──────────────────────────────────────────────────
      // JSON array of unique slot names, e.g. ["primary", "footer"]
      // Uniqueness enforced at the service layer.
      places: {
        type:         DataTypes.JSON,
        defaultValue: [],
        get() {
          const raw = this.getDataValue("places");
          if (typeof raw === "string") {
            try { return JSON.parse(raw); } catch { return []; }
          }
          return raw || [];
        },
      },

      // ── MENU ITEMS ───────────────────────────────────────────────────────
      // Stored as JSON. Structure (max depth 2):
      // [ { label, url, icon, order, children: [
      //     { label, url, icon, order, children: [ { label, url, icon, order } ] }
      //   ] } ]
      items: {
        type:         DataTypes.JSON,
        defaultValue: [],
        get() {
          const raw = this.getDataValue("items");
          if (typeof raw === "string") {
            try { return JSON.parse(raw); } catch { return []; }
          }
          return raw || [];
        },
      },

      // Soft-delete / visibility
      active: {
        type:         DataTypes.BOOLEAN,
        defaultValue: true,
      },

      // Optional layout scope (null = global)
      layoutId: {
        type:         DataTypes.STRING(200),
        defaultValue: null,
        allowNull:    true,
      },

      description: {
        type:         DataTypes.TEXT,
        defaultValue: "",
        allowNull:    true,
      },
    },
    {
      tableName:  "menus",
      timestamps: true,
      hooks: {
        // Auto-generate slug from name if not provided
        beforeValidate(instance) {
          if (!instance.slug && instance.name) {
            instance.slug = instance.name
              .toLowerCase()
              .trim()
              .replace(/[^\w\s-]/g, "")
              .replace(/[\s_]+/g, "-")
              .replace(/^-+|-+$/g, "");
          }
        },
        // Enforce unique values in places array
        beforeSave(instance) {
          if (Array.isArray(instance.places)) {
            instance.places = [...new Set(instance.places)];
          }
        },
      },
    }
  );

  // ── Static Methods ─────────────────────────────────────────────────────────

  // Get all active menus
  Menu.getAll = async function (layoutId = null) {
    const where = { active: true };
    if (layoutId) {
      const { Op } = require("sequelize");
      where[Op.or] = [{ layoutId }, { layoutId: null }];
    }
    return this.findAll({ where, order: [["name", "ASC"]] });
  };

  // Get a menu assigned to a specific slot
  Menu.getBySlot = async function (slot, layoutId = null) {
    const all = await this.findAll({ where: { active: true } });
    return (
      all.find((m) => {
        const places = m.places || [];
        if (!places.includes(slot)) return false;
        if (layoutId && m.layoutId && m.layoutId !== layoutId) return false;
        return true;
      }) || null
    );
  };

  // Get multiple slots at once
  Menu.getSlots = async function (slots, layoutId = null) {
    const result = {};
    await Promise.all(
      slots.map(async (slot) => {
        result[slot] = await Menu.getBySlot(slot, layoutId);
      })
    );
    return result;
  };

  // Assign a menu to a slot
  Menu.assignToSlot = async function (menuId, slot) {
    // Remove slot from all other menus
    const others = await this.findAll({ where: { active: true } });
    for (const m of others) {
      if (m.id === menuId) continue;
      const places = (m.places || []).filter((p) => p !== slot);
      if (places.length !== (m.places || []).length) {
        m.places = places;
        await m.save();
      }
    }

    // Add to target menu
    const target = await this.findByPk(menuId);
    if (!target) return null;
    const places = [...new Set([...(target.places || []), slot])];
    target.places = places;
    return target.save();
  };

  // Remove from slot
  Menu.removeFromSlot = async function (menuId, slot) {
    const target = await this.findByPk(menuId);
    if (!target) return null;
    target.places = (target.places || []).filter((p) => p !== slot);
    return target.save();
  };

  // Format items for template rendering
  Menu.formatForTemplate = function (menu) {
    if (!menu) return [];
    const items = menu.items || (typeof menu.getDataValue === "function" ? menu.getDataValue("items") : []);
    return (items || [])
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

module.exports = { buildModel };