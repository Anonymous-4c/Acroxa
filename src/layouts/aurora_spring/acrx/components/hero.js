import { homeCfg } from "../utils.js";
import { btnPrimary, btnSecondary } from "./buttons.js";

export function heroSection(params) {
    const H = homeCfg(params);
    const title = H.heroTitle || params.site_title || "Build something remarkable";
    const subtitle = H.heroSubtitle || params.site_description || "A refined, content-first experience for modern websites — powered by Acroxa.";
    const cta1 = { text: H.ctaPrimaryText || "Explore blog", url: H.ctaPrimaryUrl || "/blog" };
    const cta2 = { text: H.ctaSecondaryText || "Learn more", url: H.ctaSecondaryUrl || "/page/about" };
    const media = H.heroMediaUrl || "";

    return `
        <section class="as-section as-hero" aria-labelledby="as-hero-title">
            <div class="as-container as-hero__grid">
                <div class="as-hero__content">
                    ${H.heroEyebrow ? `<p class="as-eyebrow">${H.heroEyebrow}</p>` : `<p class="as-eyebrow">Welcome</p>`}
                    <h1 id="as-hero-title" class="as-hero__title">${title}</h1>
                    <p class="as-hero__subtitle">${subtitle}</p>
                    <div class="as-hero__actions">
                        ${btnPrimary(cta1.text, cta1.url)}
                        ${btnSecondary(cta2.text, cta2.url)}
                    </div>
                </div>
                ${media ? `
                    <div class="as-hero__media">
                        <img src="${media}" alt="" loading="eager">
                    </div>
                ` : `
                    <div class="as-hero__media as-hero__media--placeholder" aria-hidden="true">
                        <div class="as-hero__frame"></div>
                    </div>
                `}
            </div>
        </section>`;
}
