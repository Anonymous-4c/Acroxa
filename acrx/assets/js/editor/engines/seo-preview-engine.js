// acrx/assets/js/editor/engines/seo-preview-engine.js
//
// ENGINE 31 — SEO Preview Engine (headless).
// Analysis stays in the SEO engine; this engine shapes structured preview
// data — search-result and social-card models — for the future UI to render
// (Google-like results, Open Graph / Twitter cards, ...).

export const SEO_PREVIEW_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "seo-preview";

const SOCIAL_LIMITS = Object.freeze({
  facebook: { title: 60, description: 200, image: "1200x630" },
  twitter: { title: 70, description: 200, image: "1200x628" },
  linkedin: { title: 60, description: 300, image: "1200x627" },
  generic: { title: 60, description: 200, image: "1200x630" },
});

function truncate(text, max) {
  const t = String(text || "");
  if (t.length <= max) return { text: t, truncated: false };
  return { text: t.slice(0, max - 1).trimEnd() + "…", truncated: true };
}

export function buildSearchPreview(input = {}) {
  const title = truncate(input.title || input.metaTitle || "Untitled", 60);
  const description = truncate(input.description || input.metaDescription || "", 160);
  const url = String(input.url || input.canonical || input.slug || "");
  return {
    kind: "search",
    title: title.text,
    titleTruncated: title.truncated,
    url,
    displayUrl: url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    description: description.text,
    descriptionTruncated: description.truncated,
    breadcrumbs: Array.isArray(input.breadcrumbs) ? [...input.breadcrumbs] : [],
    favicon: input.favicon || null,
    date: input.date || null,
  };
}

export function buildSocialPreview(platform, input = {}) {
  const limits = SOCIAL_LIMITS[platform] || SOCIAL_LIMITS.generic;
  const meta = input.metadata || input;
  const title = truncate(meta.ogTitle || meta.twitterTitle || meta.title || meta.metaTitle || "Untitled", limits.title);
  const description = truncate(meta.ogDescription || meta.twitterDescription || meta.description || meta.metaDescription || "", limits.description);
  return {
    kind: "social",
    platform,
    title: title.text,
    titleTruncated: title.truncated,
    description: description.text,
    descriptionTruncated: description.truncated,
    image: meta.ogImage || meta.twitterImage || meta.featuredImage || null,
    imageRecommended: limits.image,
    url: meta.canonical || meta.url || "",
    card: platform === "twitter" ? (meta.twitterCard || "summary_large_image") : null,
    siteName: meta.siteName || null,
  };
}

export function buildAllPreviews(input = {}) {
  return {
    search: buildSearchPreview(input.search || input),
    social: {
      facebook: buildSocialPreview("facebook", input),
      twitter: buildSocialPreview("twitter", input),
      linkedin: buildSocialPreview("linkedin", input),
    },
  };
}

export function createSEOPreviewEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return SEO_PREVIEW_ENGINE_VERSION; },
    search: buildSearchPreview,
    social: buildSocialPreview,
    all: buildAllPreviews,
    limits: JSON.parse(JSON.stringify(SOCIAL_LIMITS)),
  };
}

export default createSEOPreviewEngine;
