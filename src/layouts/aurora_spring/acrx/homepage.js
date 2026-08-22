import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";
import { showSidebar, mainGridStyle, layoutCfg } from "./utils.js";
import { heroSection } from "./components/hero.js";
import { featuresSection } from "./components/features.js";
import { splitSection } from "./components/split.js";
import { logosSection } from "./components/logos.js";
import { testimonialsSection } from "./components/testimonials.js";
import { ctaBannerSection } from "./components/cta-banner.js";
import { blogPreviewSection } from "./components/blog-preview.js";
import { pricingSection } from "./components/pricing.js";

export function homepage(params) {
    const show = showSidebar(params, "homepage");
    const L = layoutCfg(params);
    const pos = L.sidebar?.position || "right";
    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}

        ${heroSection(params)}
        ${featuresSection(params)}
        ${splitSection(params)}
        ${logosSection(params)}
        ${testimonialsSection(params)}
        ${ctaBannerSection(params)}
        ${blogPreviewSection(params)}
        ${pricingSection(params)}

        ${show ? `
        <main class="as-main" id="main-content">
            <div class="as-layout-grid" style="${mainGridStyle(params, "homepage")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="as-content"></div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>` : ""}

        ${footer(params)}
    `;
}
