// src/layouts/zenith/acrx/renderContent.js
// Shared content renderer for Zenith layout templates
// Uses widgetRenderer for JSON widget trees, falls back to HTML/raw

import { renderDocument, extractTextFromDocument } from "../../framework/widgetRenderer.js";

export function renderContent(data) {
  if (!data) return "";

  // Priority 1: JSON widget content (source of truth from editor)
  if (data.editorContent) {
    const ctx = {
      author: data.author || data.post?.author || null,
      latestPosts: data.recent_posts || [],
      device: "desktop",
    };
    return renderDocument(data.editorContent, ctx);
  }

  // Priority 2: Pre-rendered HTML
  if (data.contentHtml) return data.contentHtml;

  // Priority 3: Pre-rendered post object content (already formatted)
  if (data.post?.editorJson) {
    return renderDocument(data.post.editorJson, { author: data.post.author || null });
  }

  // Priority 4: Page object
  if (data.page?.editorJson) {
    return renderDocument(data.page.editorJson);
  }

  // Priority 5: Plain content string
  if (data.content) return data.content;
  if (data.post?.content) return data.post.content;
  if (data.page?.content) return data.page.content;

  return "";
}

export function getPlainText(data) {
  if (data.editorContent) {
    return extractTextFromDocument(data.editorContent);
  }
  if (data.contentRaw) return data.contentRaw;
  if (data.post?.contentRaw) return data.post.contentRaw;
  if (data.page?.contentRaw) return data.page.contentRaw;
  if (data.contentHtml) return data.contentHtml.replace(/<[^>]*>/g, " ").trim();
  return "";
}