import { homeCfg } from "../utils.js";

const DEFAULT_FEATURES = [
    { title: "Content-first", body: "Typography, spacing, and hierarchy designed for clarity and long-form reading." },
    { title: "Modular sections", body: "Reusable blocks compose homepages, landing pages, and marketing flows with ease." },
    { title: "Production ready", body: "SSR-friendly templates, minimal JavaScript, and framework-native integration." }
];

export function featuresSection(params) {
    const H = homeCfg(params);
    if (H.showFeatures === false) return "";

    const items = DEFAULT_FEATURES;
    const title = H.featuresTitle || "Built for modern publishing";
    const subtitle = H.featuresSubtitle || "Everything you need for a polished public site — without visual noise.";

    return `
        <section class="as-section as-features" aria-labelledby="as-features-title">
            <div class="as-container">
                <header class="as-section-header as-section-header--center">
                    <h2 id="as-features-title" class="as-section-title">${title}</h2>
                    <p class="as-section-lead">${subtitle}</p>
                </header>
                <div class="as-feature-grid">
                    ${items.map((f, i) => `
                        <article class="as-card as-card--feature">
                            <span class="as-feature-index">${String(i + 1).padStart(2, "0")}</span>
                            <h3 class="as-card-title">${f.title}</h3>
                            <p class="as-card-excerpt">${f.body}</p>
                        </article>
                    `).join("")}
                </div>
            </div>
        </section>`;
}
