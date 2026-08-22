const fs = require("fs");
const path = require("path");

function loadMenu() {
  const menuPath = path.join(__dirname, "../../config/menu.json");
  return JSON.parse(fs.readFileSync(menuPath, "utf-8"));
}

// 🔍 recursive search
function findByPath(items, pathToMatch) {
  for (const item of items) {
    if (item.link === pathToMatch) return item;

    if (item.submenu) {
      const found = findByPath(item.submenu, pathToMatch);
      if (found) return found;
    }
  }
  return null;
}

// 🎯 MAIN FUNCTION
function getAllowedRolesByPath(reqPath) {
  const menu = loadMenu();

  const allItems = [
    ...(menu.main || []),
    ...(menu.extra || [])
  ];

  const found = findByPath(allItems, reqPath);

  return found?.allowedRoles || null; // null = no restriction
}

module.exports = { getAllowedRolesByPath };