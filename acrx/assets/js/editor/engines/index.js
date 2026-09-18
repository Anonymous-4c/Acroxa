// acrx/assets/js/editor/engines/index.js
//
// Headless editor-engine layer — single entry point re-exporting every engine
// plus the runtime orchestrator. Engines stay independently importable; this
// index is convenience only and introduces no coupling.

export { createEditor, RUNTIME_VERSION } from "./editor-runtime.js";

export { createSchemaRegistry, schemaRegistry, defineSchema, validateValue, applyDefaultsToValue, createSchemaError, isSchemaError, SchemaError, FieldTypes, SCHEMA_ENGINE_VERSION } from "./schema-engine.js";
export { createEventBus, EVENT_BUS_VERSION } from "./event-bus.js";
export { createDocument, loadDocument, cloneDocument, DOCUMENT_SCHEMA_VERSION } from "./document-engine.js";
export { createSerializationEngine, stableSort, stableStringify, ENVELOPE_FORMAT, ENVELOPE_VERSION } from "./serialization-engine.js";
export { createValidationEngine } from "./validation-engine.js";

export { createBlockEngine, kindOf as blockKindOf } from "./block-engine.js";
export { createWidgetDefinitionEngine } from "./widget-definition-engine.js";
export { createWidgetSettingsEngine } from "./widget-settings-engine.js";
export { createWidgetStateEngine } from "./widget-state-engine.js";
export { createConstraintEngine } from "./constraint-engine.js";

export { createSelectionEngine } from "./selection-engine.js";
export { createCommandEngine } from "./command-engine.js";
export { createTransactionEngine } from "./transaction-engine.js";
export { createHistoryEngine } from "./history-engine.js";
export { createFocusEngine } from "./focus-engine.js";
export { createKeyboardEngine, normalizeCombo } from "./keyboard-engine.js";

export { createRichTextEngine, textNode, normalizeContent as normalizeInline, normalizeContent, plainText, plainLength, slice as sliceInline, insertTextAt, deleteRange, applyMark, removeMark, marksAt, splitAt, toHTML as inlineToHTML, fromInlineHTML, toMarkdown as inlineToMarkdown, MARKS, MARK_COMPAT, conflictingMarks, canApplyMark } from "./rich-text-engine.js";
export { createClipboardEngine, sanitizeHTML, htmlToText, INTERNAL_MIME } from "./clipboard-engine.js";
export { createTableEngine, createTable, getCell, setCell, insertRow, deleteRow, insertColumn, deleteColumn, mergeCells, splitCell, normalizeTable, validateTable, cellRangeSelection, navigateCell } from "./table-engine.js";
export { createLinkEngine, classifyLink, normalizeUrl, buildRel, validateLink, createLink, serializeLink } from "./link-engine.js";
export { createMediaEngine, mediaKind, detectEmbed, buildSrcSet, sizesFor, validateMedia, normalizeMedia } from "./media-engine.js";
export { createAssetEngine, validateAsset } from "./asset-engine.js";

export { createLayoutEngine, normalizeLayout, normalizeSpacing, validateLayout, layoutToCSSProperties, canContainLayout, createRow } from "./layout-engine.js";
export { createStyleEngine, normalizeColor, normalizeLength, normalizeStyle, mergeStyles, styleToCSS, styleToCSSProperties, validateStyle } from "./style-engine.js";
export { createResponsiveEngine, breakpointForWidth, resolveValue as resolveResponsive, isResponsiveValue, setOverride as setResponsiveOverride, normalizeResponsive, validateResponsive, resolveTree, BREAKPOINTS } from "./responsive-engine.js";
export { createRenderer, el, escapeHtml } from "./renderer-engine.js";
export { createWidgetRendererRegistry } from "./widget-renderer-registry.js";
export { createPreviewEngine, DEVICE_PRESETS } from "./preview-engine.js";

export { createLayersEngine } from "./layers-engine.js";
export { createSearchEngine } from "./search-engine.js";
export { createOutlineEngine } from "./outline-engine.js";

export { createMetadataEngine, normalizeMetadata, validateMetadata, mergeMetadata, robotsContent, toHeadTags, METADATA_FIELDS } from "./metadata-engine.js";
export { createSEOEngine, analyzeSEO } from "./seo-engine.js";
export { createSEOPreviewEngine, buildSearchPreview, buildSocialPreview, buildAllPreviews } from "./seo-preview-engine.js";
export { createAccessibilityEngine, checkAccessibility, contrastRatio } from "./accessibility-engine.js";
export { createPerformanceEngine, analyzePerformance } from "./performance-engine.js";

export { createComponentEngine } from "./component-engine.js";
export { createTemplateEngine, listVariables as listTemplateVariables, substituteVariables } from "./template-engine.js";
export { createVariableEngine, listVariables, interpolate } from "./variable-engine.js";
export { createFormEngine } from "./form-engine.js";

export { createPluginEngine } from "./plugin-engine.js";
export { createImportExportEngine, htmlToNodes, markdownToNodes, nodesToMarkdown, nodesToText } from "./import-export-engine.js";
export { createHtmlExportEngine, stripEditorArtifacts, minifyHtml } from "./html-export-engine.js";

export { createEditorState } from "./editor-state-engine.js";
export { createAIEngine, estimateTokens } from "./ai-engine.js";
export { createSyncEngine } from "./sync-engine.js";
