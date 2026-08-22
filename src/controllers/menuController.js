// src/controllers/menuController.js
// Full CRUD for menus + slot assignment management.
// The customizer calls these endpoints to list/assign menus to header/footer slots.

const { getConnection } = require("../core/connect-db");

function getModel() {
  const conn   = getConnection();
  const models = conn.models || conn;
  const Menu   = models.Menu;
  if (!Menu) throw new Error("Menu model not registered");
  return Menu;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _validateDepth(items, depth = 0) {
  if (!Array.isArray(items)) return;
  if (depth >= 2) {
    // Strip children beyond depth 2
    items.forEach((item) => { delete item.children; });
    return;
  }
  items.forEach((item) => {
    if (item.children?.length) {
      _validateDepth(item.children, depth + 1);
    }
  });
}

// ── LIST ──────────────────────────────────────────────────────────────────────

exports.getMenus = async (req, res) => {
  try {
    const Menu    = getModel();
    const { layoutId } = req.query;
    const menus   = await Menu.getAll(layoutId || null);
    res.json({ menus });
  } catch (err) {
    console.error("[MenuController] getMenus:", err);
    res.status(500).json({ error: err.message });
  }
};

// ── SINGLE ────────────────────────────────────────────────────────────────────

exports.getMenu = async (req, res) => {
  try {
    const Menu = getModel();
    const { id } = req.params;

    let menu;
    // Support both ObjectId (mongo) and integer pk (sql)
    if (typeof Menu.findById === "function") {
      menu = await Menu.findById(id).lean();
    } else {
      menu = await Menu.findByPk(id);
    }

    if (!menu) return res.status(404).json({ error: "Menu not found" });
    res.json({ menu });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── BY SLOT ───────────────────────────────────────────────────────────────────

exports.getMenuBySlot = async (req, res) => {
  try {
    const Menu = getModel();
    const { slot, layoutId } = req.query;
    if (!slot) return res.status(400).json({ error: "slot is required" });

    const menu = await Menu.getBySlot(slot, layoutId || null);
    if (!menu) return res.json({ menu: null });

    const items = Menu.formatForTemplate(menu);
    res.json({ menu, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── CREATE ────────────────────────────────────────────────────────────────────

exports.createMenu = async (req, res) => {
  try {
    const Menu = getModel();
    const { name, slug, places, items, layoutId, description } = req.body;

    if (!name) return res.status(400).json({ error: "name is required" });

    // Enforce max depth 2
    const safeItems = items || [];
    _validateDepth(safeItems);

    // Enforce unique places
    const safePlaces = [...new Set(places || [])];

    let menu;
    if (typeof Menu.create === "function") {
      menu = await Menu.create({
        name,
        slug:        slug || undefined,
        places:      safePlaces,
        items:       safeItems,
        layoutId:    layoutId || null,
        description: description || "",
      });
    }

    // Enforce one-menu-per-slot rule for each assigned slot
    for (const slot of safePlaces) {
      await Menu.assignToSlot(
        menu._id?.toString() || menu.id,
        slot
      );
    }

    res.status(201).json({ success: true, menu });
  } catch (err) {
    console.error("[MenuController] createMenu:", err);
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "A menu with that slug already exists" });
    }
    res.status(500).json({ error: err.message });
  }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────

exports.updateMenu = async (req, res) => {
  try {
    const Menu = getModel();
    const { id } = req.params;
    const { name, slug, places, items, layoutId, description, active } = req.body;

    // Enforce max depth 2
    if (items) _validateDepth(items);

    // Enforce unique places
    const safePlaces = places !== undefined ? [...new Set(places)] : undefined;

    let menu;
    if (typeof Menu.findByIdAndUpdate === "function") {
      // Mongoose
      const update = {};
      if (name        !== undefined) update.name        = name;
      if (slug        !== undefined) update.slug        = slug;
      if (safePlaces  !== undefined) update.places      = safePlaces;
      if (items       !== undefined) update.items       = items;
      if (layoutId    !== undefined) update.layoutId    = layoutId;
      if (description !== undefined) update.description = description;
      if (active      !== undefined) update.active      = active;

      menu = await Menu.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
    } else {
      // Sequelize
      menu = await Menu.findByPk(id);
      if (!menu) return res.status(404).json({ error: "Menu not found" });

      if (name        !== undefined) menu.name        = name;
      if (slug        !== undefined) menu.slug        = slug;
      if (safePlaces  !== undefined) menu.places      = safePlaces;
      if (items       !== undefined) menu.items       = items;
      if (layoutId    !== undefined) menu.layoutId    = layoutId;
      if (description !== undefined) menu.description = description;
      if (active      !== undefined) menu.active      = active;

      await menu.save();
    }

    if (!menu) return res.status(404).json({ error: "Menu not found" });

    // Re-enforce one-menu-per-slot for any new slots
    if (safePlaces) {
      for (const slot of safePlaces) {
        await Menu.assignToSlot(menu._id?.toString() || menu.id, slot);
      }
    }

    res.json({ success: true, menu });
  } catch (err) {
    console.error("[MenuController] updateMenu:", err);
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────

exports.deleteMenu = async (req, res) => {
  try {
    const Menu = getModel();
    const { id } = req.params;

    if (typeof Menu.findByIdAndDelete === "function") {
      await Menu.findByIdAndDelete(id);
    } else {
      await Menu.destroy({ where: { id } });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── SLOT ASSIGNMENT ───────────────────────────────────────────────────────────

// POST /api/menus/:id/assign   body: { slot }
exports.assignSlot = async (req, res) => {
  try {
    const Menu = getModel();
    const { id } = req.params;
    const { slot } = req.body;

    if (!slot) return res.status(400).json({ error: "slot is required" });

    const menu = await Menu.assignToSlot(id, slot);
    if (!menu) return res.status(404).json({ error: "Menu not found" });

    res.json({ success: true, menu });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/menus/:id/unassign   body: { slot }
exports.unassignSlot = async (req, res) => {
  try {
    const Menu = getModel();
    const { id } = req.params;
    const { slot } = req.body;

    if (!slot) return res.status(400).json({ error: "slot is required" });

    const menu = await Menu.removeFromSlot(id, slot);
    if (!menu) return res.status(404).json({ error: "Menu not found" });

    res.json({ success: true, menu });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/menus/slots?layoutId=nova-nexus
// Returns all slots defined by the layout's meta.json menuAreas,
// each annotated with which menu (if any) is currently assigned.
exports.getSlots = async (req, res) => {
  try {
    const Menu = getModel();
    const { layoutId } = req.query;

    // Load layout menuAreas from meta.json if layoutId provided
    let knownSlots = ["primary", "footer"]; // sensible defaults
    if (layoutId) {
      try {
        const path = require("path");
        const fs   = require("fs");
        const metaFile = path.join(
          __dirname, "../layouts", layoutId, "meta.json"
        );
        console.log(metaFile)
        if (fs.existsSync(metaFile)) {
          const meta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
          if (Array.isArray(meta.menuAreas) && meta.menuAreas.length) {
            knownSlots = meta.menuAreas;
          }
        }
      } catch (_) {}
    }

    // For each slot, find which menu is assigned
    const slotMap = {};
    await Promise.all(
      knownSlots.map(async (slot) => {
        slotMap[slot] = await Menu.getBySlot(slot, layoutId || null);
      })
    );

    // Also return all menus for the dropdown
    const allMenus = await Menu.getAll(layoutId || null);

    res.json({ slots: knownSlots, assignments: slotMap, menus: allMenus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/menus/slots/assign   body: { slot, menuId, layoutId? }
// Convenience endpoint — assigns a menu to a slot in one call.
exports.assignMenuToSlot = async (req, res) => {
  try {
    const Menu = getModel();
    const { slot, menuId, layoutId } = req.body;

    if (!slot)   return res.status(400).json({ error: "slot is required" });
    if (!menuId) return res.status(400).json({ error: "menuId is required" });

    const menu = await Menu.assignToSlot(menuId, slot);
    if (!menu) return res.status(404).json({ error: "Menu not found" });

    res.json({ success: true, slot, menu });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};