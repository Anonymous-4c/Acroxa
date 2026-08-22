import { header }            from "./header.js";
import { footer }            from "./footer.js";
import { sidebar }           from "./sidebar.js";
import { showSidebar, mainGridStyle, layoutCfg } from "./utils.js";
import { heroSection }       from "./components/hero.js";
import { storySection }      from "./components/story.js";
import { featuresSection }   from "./components/features.js";
import { parallaxSection }   from "./components/parallax.js";
import { blogPreviewSection } from "./components/blog-preview.js";
import { ctaSection }        from "./components/cta.js";

export function homepage(params) {
    const show = showSidebar(params, "homepage");
    const L    = layoutCfg(params);
    const pos  = L.sidebar?.position || "right";
    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}

        <!-- Hero: fullscreen atmospheric parallax -->
        ${heroSection(params)}

        <!-- Story: cinematic narrative -->
        ${storySection(params)}

        <!-- Features: grove-themed feature cards -->
        ${featuresSection(params)}

        <!-- Parallax showcase: immersive depth-layer scene -->
        ${parallaxSection(params)}

        <!-- Blog preview: latest dispatches from the grove -->
        ${blogPreviewSection(params)}

        <!-- Closing CTA with atmospheric rain -->
        ${ctaSection(params)}

        ${show ? `
        <main class="rg-main" id="main-content">
            <div class="rg-layout-grid" style="${mainGridStyle(params, "homepage")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="rg-content"></div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>` : ""}

        ${footer(params)}
    `;
}
