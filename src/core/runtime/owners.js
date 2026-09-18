// src/core/runtime/owners.js
// File -> owner attribution for change propagation.
// Maps a changed file to the runtime owner (plugin/layout/module/core)
// so hot-reload can dispose only that owner's registrations.

"use strict";

const path = require("path");

const fileToOwner = new Map(); // absPath -> owner
const ownerToFiles = new Map(); // owner -> Set<absPath>

function normalize(p) {
  try { return path.resolve(String(p)); } catch (_) { return String(p); }
}

function attributeFile(file, owner) {
  const abs = normalize(file);
  const o = String(owner || "core");
  fileToOwner.set(abs, o);
  if (!ownerToFiles.has(o)) ownerToFiles.set(o, new Set());
  ownerToFiles.get(o).add(abs);
  return abs;
}

function ownerOf(file) {
  const abs = normalize(file);
  if (fileToOwner.has(abs)) return fileToOwner.get(abs);
  const lower = abs.toLowerCase();
  const sep = path.sep;
  // Heuristics for unattributed files (layouts, views, routes, plugins).
  let m = lower.match(new RegExp(`\\${sep}layouts\\${sep}([^\\${sep}]+)`));
  if (m) return `layout:${m[1]}`;
  if (lower.includes(`${sep}views${sep}`)) return "core:views";
  if (lower.includes(`${sep}routes${sep}`)) return "core:routes";
  if (lower.includes(`${sep}plugins${sep}`)) {
    m = lower.match(new RegExp(`\\${sep}plugins\\${sep}([^\\${sep}]+)`));
    if (m) return `extension:${m[1]}`;
    return "extension:unknown";
  }
  if (lower.includes(`${sep}extensions${sep}`)) {
    m = lower.match(new RegExp(`\\${sep}extensions\\${sep}([^\\${sep}]+)`));
    if (m) return `extension:${m[1]}`;
  }
  return "core";
}

function filesOf(owner) {
  return ownerToFiles.has(owner) ? [...ownerToFiles.get(owner)] : [];
}

function forgetFile(file) {
  const abs = normalize(file);
  const o = fileToOwner.get(abs);
  if (o && ownerToFiles.has(o)) {
    ownerToFiles.get(o).delete(abs);
    if (!ownerToFiles.get(o).size) ownerToFiles.delete(o);
  }
  fileToOwner.delete(abs);
}

module.exports = { attributeFile, ownerOf, filesOf, forgetFile };
