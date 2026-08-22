import { homeCfg } from "../utils.js";

export function ctaSection(params) {
    const H = homeCfg(params);
    if (H.showCta === false) return "";

    const title    = H.ctaTitle    || "Step into the grove";
    const subtitle = H.ctaSubtitle || "Start reading. Start writing. Find your signal in the noise.";
    const primary  = { text: H.ctaPrimaryText   || "Enter the grove",  url: H.ctaPrimaryUrl   || "/blog" };
    const secondary = { text: H.ctaSecondaryText || "Our story",        url: H.ctaSecondaryUrl || "/page/about" };

    return `
        <section class="rg-section rg-cta" aria-labelledby="rg-cta-title" data-rg-reveal>
            <!-- Atmospheric rain overlay in CTA -->
            <div class="rg-cta__rain" aria-hidden="true">
                <div class="rg-rain rg-rain--cta"></div>
            </div>
            <!-- Mist -->
            <div class="rg-cta__mist-top"    aria-hidden="true"></div>
            <div class="rg-cta__mist-bottom" aria-hidden="true"></div>

            <div class="rg-container rg-cta__content" data-rg-reveal-child>
                <p class="rg-eyebrow rg-eyebrow--light">Begin here</p>
                <h2 id="rg-cta-title" class="rg-cta__title">${title}</h2>
                <p class="rg-cta__subtitle">${subtitle}</p>
                <div class="rg-cta__actions">
                    <a href="${primary.url}" class="rg-btn rg-btn--primary rg-btn--lg rg-btn--glow">
                        ${primary.text}
                        <svg class="rg-btn__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                    </a>
                    <a href="${secondary.url}" class="rg-btn rg-btn--ghost rg-btn--lg">${secondary.text}</a>
                </div>
            </div>
        </section>`;
}
