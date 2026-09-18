// Seed script - run after DB connection is established
async function seedWidgetsAndPatterns() {
  const { getConnection } = require("./core/connect-db");
  
  // Wait for connection
  let conn;
  for (let i = 0; i < 20; i++) {
    try {
      conn = getConnection();
      if (conn && conn.models) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (!conn || !conn.models) {
    console.log("DB not ready for seeding");
    return;
  }
  
  const models = conn.models;
  
  if (!models.Widget || !models.Pattern) {
    console.log("Widget/Pattern models not available");
    return;
  }
  
  console.log("Seeding widgets and patterns...");
  
  // Seed widgets
  const widgetData = [
    { name: 'Paragraph', slug: 'paragraph', type: 'paragraph', category: 'text', icon: 'align-left', status: 'active', isGlobal: true },
    { name: 'Heading', slug: 'heading', type: 'heading', category: 'text', icon: 'heading', status: 'active', isGlobal: true },
    { name: 'Image', slug: 'image', type: 'image', category: 'media', icon: 'image', status: 'active', isGlobal: true },
    { name: 'Button', slug: 'button', type: 'button', category: 'interactive', icon: 'square', status: 'active', isGlobal: true },
    { name: 'Container', slug: 'container', type: 'container', category: 'layout', icon: 'box', status: 'active', isGlobal: true },
    { name: 'Columns', slug: 'columns', type: 'columns', category: 'layout', icon: 'columns', status: 'active', isGlobal: true },
    { name: 'Hero', slug: 'hero', type: 'hero', category: 'content', icon: 'star', status: 'active', isGlobal: true },
    { name: 'CTA', slug: 'cta', type: 'cta', category: 'content', icon: 'bullhorn', status: 'active', isGlobal: true },
    { name: 'Divider', slug: 'divider', type: 'divider', category: 'layout', icon: 'minus', status: 'active', isGlobal: true },
    { name: 'Spacer', slug: 'spacer', type: 'spacer', category: 'layout', icon: 'arrows-up-down', status: 'active', isGlobal: true },
    { name: 'Card', slug: 'card', type: 'card', category: 'content', icon: 'id-card', status: 'active', isGlobal: true },
    { name: 'Video', slug: 'video', type: 'video', category: 'media', icon: 'video', status: 'active', isGlobal: true },
    { name: 'Gallery', slug: 'gallery', type: 'gallery', category: 'media', icon: 'images', status: 'active', isGlobal: true },
    { name: 'Alert', slug: 'alert', type: 'alert', category: 'content', icon: 'triangle-exclamation', status: 'active', isGlobal: true },
    { name: 'Table', slug: 'table', type: 'table', category: 'content', icon: 'table', status: 'active', isGlobal: true },
    { name: 'Code Block', slug: 'code-block', type: 'code-block', category: 'text', icon: 'code', status: 'active', isGlobal: true },
    { name: 'Blockquote', slug: 'blockquote', type: 'blockquote', category: 'text', icon: 'quote-left', status: 'active', isGlobal: true },
    { name: 'FAQ', slug: 'faq', type: 'faq', category: 'content', icon: 'circle-question', status: 'active', isGlobal: true },
    { name: 'Accordion', slug: 'accordion', type: 'accordion', category: 'interactive', icon: 'chevron-down', status: 'active', isGlobal: true },
    { name: 'Tabs', slug: 'tabs', type: 'tabs', category: 'interactive', icon: 'folder', status: 'active', isGlobal: true },
  ];
  
  for (const w of widgetData) {
    const existing = await models.Widget.findOne({ slug: w.slug });
    if (!existing) {
      await models.Widget.create(w);
      console.log('Created widget:', w.name);
    }
  }
  
  // Seed patterns
  const patternData = [
    { name: 'Hero Section', slug: 'hero-section', type: 'hero', category: 'hero', status: 'active', content: { nodes: [], html: '', settings: {} } },
    { name: 'Two Column Layout', slug: 'two-column', type: 'columns', category: 'layout', status: 'active', content: { nodes: [], html: '', settings: {} } },
    { name: 'CTA Box', slug: 'cta-box', type: 'cta', category: 'cta', status: 'active', content: { nodes: [], html: '', settings: {} } },
    { name: 'Feature Grid', slug: 'feature-grid', type: 'grid', category: 'layout', status: 'active', content: { nodes: [], html: '', settings: {} } },
    { name: 'Pricing Table', slug: 'pricing-table', type: 'pricing', category: 'pricing', status: 'active', content: { nodes: [], html: '', settings: {} } },
    { name: 'FAQ Section', slug: 'faq-section', type: 'faq', category: 'faq', status: 'active', content: { nodes: [], html: '', settings: {} } },
  ];
  
  for (const p of patternData) {
    const existing = await models.Pattern.findOne({ slug: p.slug });
    if (!existing) {
      await models.Pattern.create(p);
      console.log('Created pattern:', p.name);
    }
  }

  // AcroxaJS fixture page (Phase 8): a real visitor page carrying an
  // interactive widget so visitor target-patching/hydration is proven on a
  // seeded page (not just the echo roundtrip). Skipped until setup has a
  // user (author is required by the Page model).
  try {
    const existingFixture = await models.Page.findOne({ slug: "acroxajs-fixture" });
    if (!existingFixture) {
      const user = await models.User.findOne({});
      if (user) {
        await models.Page.create({
          title: "AcroxaJS Runtime Fixture",
          slug: "acroxajs-fixture",
          status: "published",
          template: "default",
          showInMenu: false,
          author: user._id,
          content: {
            json: {
              blocks: [
                {
                  id: "fixture-heading",
                  type: "heading",
                  data: { level: 2 },
                  content: [{ type: "text", text: "AcroxaJS Runtime Fixture" }],
                },
                {
                  id: "fixture-tabs",
                  type: "tabs",
                  data: {
                    tabs: [
                      { label: "Overview", content: "<p>Interactive tabs widget rendered by AcroxaJS with deterministic identity.</p>" },
                      { label: "Runtime", content: "<p>This widget is a live patch target carrying data-acrx-id and generation.</p>" },
                    ],
                  },
                  content: [],
                },
              ],
              blockOrder: ["fixture-heading", "fixture-tabs"],
            },
            html: "",
            raw: "",
            conditionalJS: null,
          },
        });
        console.log('Created fixture page: acroxajs-fixture');
      }
    }
  } catch (e) {
    console.log("Fixture page seed skipped:", e.message);
  }

  console.log('Seeding complete!');
}

module.exports = { seedWidgetsAndPatterns };