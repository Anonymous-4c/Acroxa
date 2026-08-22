import { homeCfg } from "../utils.js";
import { btnPrimary, btnGhost } from "./buttons.js";

export function ctaBannerSection(params) {
    const H = homeCfg(params);
    if (H.showCtaBanner === false) return "";

    const title = H.ctaBannerTitle || "Ready to publish your next story?";
    const body = H.ctaBannerBody || "Start with a homepage built from modular sections — then grow into blog, pages, and more.";
    const primary = { text: H.ctaBannerPrimaryText || "View blog", url: H.ctaBannerPrimaryUrl || "/blog" };
    const secondary = { text: H.ctaBannerSecondaryText || "Contact", url: H.ctaBannerSecondaryUrl || "/page/contact" };

    return `
        <section class="as-section as-cta-banner">
            <div class="as-container">
                <div class="as-cta-banner__inner">
                    <div>
                        <h2 class="as-cta-banner__title">${title}</h2>
                        <p class="as-cta-banner__body">${body}</p>
                    </div>
                    <div class="as-cta-banner__actions">
                        ${btnPrimary(primary.text, primary.url)}
                        ${btnGhost(secondary.text, secondary.url)}
                    </div>
                </div>
            </div>
        </section>`;
}
