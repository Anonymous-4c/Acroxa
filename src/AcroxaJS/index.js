// src/AcroxaJS/index.js — AcroxaJS entry (hybrid migration).
// Exposes frozen contracts now; server/client subsystems land in
// Phase 2+. Delegates to proven src/core/runtime/* — never duplicates it.

"use strict";

const identity = require("./contracts/identity");
const updateProtocol = require("./contracts/update-protocol");
const manifest = require("./contracts/manifest");
const lifecycle = require("./contracts/lifecycle");
const runtimeContracts = require("./contracts/runtime-contracts");

const VERSION = manifest.RUNTIME_VERSION;

function describe() {
  return {
    name: "AcroxaJS",
    version: VERSION,
    contracts: ["identity", "update-protocol", "manifest", "lifecycle", "runtime-contracts"],
    lifecycleEvents: lifecycle.LIFECYCLE_EVENTS.length,
    endpoints: manifest.RUNTIME_ENDPOINTS,
  };
}

module.exports = { VERSION, identity, updateProtocol, manifest, lifecycle, runtimeContracts, describe };
