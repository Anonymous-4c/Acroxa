import { homeCfg, layoutCfg } from "../utils.js";

export function heroSection(params) {
    const H   = homeCfg(params);
    const L   = layoutCfg(params);
    const eyebrow  = H.heroEyebrow  || "Welcome to the grove";
    const title    = H.heroTitle    || params.site_title || "Where stories take root";
    const subtitle = H.heroSubtitle || params.site_description || "An immersive space for long-form writing, visual storytelling, and ideas that deserve room to breathe.";
    const cta1     = { text: H.ctaPrimaryText   || "Enter the grove",  url: H.ctaPrimaryUrl   || "/blog" };
    const cta2     = { text: H.ctaSecondaryText || "Our story",        url: H.ctaSecondaryUrl || "/page/about" };
    const rainLevel = L.rainIntensity || "medium";
    const rainCount = { light: 60, medium: 120, heavy: 200 }[rainLevel] || 120;
    const parallaxEnabled = L.heroParallax !== false;

    // Generate CSS rain drops (pure CSS animation, no canvas)
    // These are lightweight absolutely-positioned divs animated with CSS
    const rainDrops = Array.from({ length: rainCount }, (_, i) => {
        const left     = Math.random() * 100;
        const delay    = (Math.random() * 8).toFixed(2);
        const duration = (0.8 + Math.random() * 1.2).toFixed(2);
        const opacity  = (0.2 + Math.random() * 0.5).toFixed(2);
        const width    = (0.5 + Math.random() * 1).toFixed(1);
        const height   = (12 + Math.random() * 20).toFixed(0);
        return `<div class="rg-rain-drop" style="left:${left.toFixed(1)}%;animation-delay:-${delay}s;animation-duration:${duration}s;opacity:${opacity};width:${width}px;height:${height}px;"></div>`;
    }).join("");

    return `
        <section class="rg-hero" aria-labelledby="rg-hero-title" data-rg-parallax="${parallaxEnabled}">
            <!-- Layer 1: Sky gradient background -->
            <div class="rg-hero__layer rg-hero__layer--sky" aria-hidden="true"></div>

            <!-- Layer 2: Distant forest silhouettes -->
            <div class="rg-hero__layer rg-hero__layer--forest-far" aria-hidden="true" data-parallax-speed="0.15">
                <svg class="rg-hero__tree-line rg-hero__tree-line--far" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0,180 L30,120 L60,160 L90,80 L120,140 L150,100 L180,150 L210,90 L240,130 L270,70 L300,120 L330,110 L360,80 L390,140 L420,100 L450,120 L480,70 L510,130 L540,90 L570,110 L600,80 L630,140 L660,100 L690,120 L720,70 L750,130 L780,100 L810,80 L840,140 L870,110 L900,90 L930,120 L960,70 L990,140 L1020,100 L1050,130 L1080,80 L1110,110 L1140,90 L1170,140 L1200,100 L1230,120 L1260,80 L1290,130 L1320,110 L1350,90 L1380,140 L1410,100 L1440,120 L1440,220 L0,220 Z" fill="currentColor"/>
                </svg>
            </div>

            <!-- Layer 3: Near forest canopy -->
            <div class="rg-hero__layer rg-hero__layer--forest-near" aria-hidden="true" data-parallax-speed="0.3">
                <svg class="rg-hero__tree-line rg-hero__tree-line--near" viewBox="0 0 1440 280" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0,220 L20,160 L40,200 L60,120 L80,180 L100,100 L120,160 L140,80 L160,150 L180,120 L200,90 L220,160 L240,130 L260,80 L280,150 L300,100 L320,140 L340,60 L360,130 L380,100 L400,150 L420,80 L440,140 L460,100 L480,60 L500,140 L520,100 L540,160 L560,90 L580,140 L600,80 L620,160 L640,110 L660,80 L680,150 L700,100 L720,140 L740,60 L760,130 L780,100 L800,160 L820,90 L840,140 L860,80 L880,160 L900,110 L920,80 L940,150 L960,100 L980,140 L1000,60 L1020,130 L1040,100 L1060,160 L1080,90 L1100,140 L1120,80 L1140,160 L1160,110 L1180,80 L1200,150 L1220,100 L1240,140 L1260,60 L1280,130 L1300,100 L1320,160 L1340,90 L1360,140 L1380,80 L1400,150 L1420,110 L1440,120 L1440,280 L0,280 Z" fill="currentColor"/>
                </svg>
            </div>

            <!-- Layer 4: Rain particles (CSS-driven) -->
            <div class="rg-rain" aria-hidden="true">
                ${rainDrops}
            </div>

            <!-- Layer 5: Mist / atmospheric overlay -->
            <div class="rg-hero__layer rg-hero__layer--mist" aria-hidden="true"></div>
            <div class="rg-hero__layer rg-hero__layer--mist-ground" aria-hidden="true"></div>

            <!-- Hero content -->
            <div class="rg-container rg-hero__content" data-parallax-speed="0.05">
                <p class="rg-eyebrow rg-hero__eyebrow">${eyebrow}</p>
                <h1 id="rg-hero-title" class="rg-hero__title">${title}</h1>
                <p class="rg-hero__subtitle">${subtitle}</p>
                <div class="rg-hero__actions">
                    <a href="${cta1.url}" class="rg-btn rg-btn--primary rg-btn--lg">
                        ${cta1.text}
                        <svg class="rg-btn__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                    </a>
                    <a href="${cta2.url}" class="rg-btn rg-btn--ghost rg-btn--lg">${cta2.text}</a>
                </div>

                <!-- Scroll indicator -->
                <div class="rg-hero__scroll-hint" aria-hidden="true">
                    <span class="rg-hero__scroll-line"></span>
                    <span class="rg-hero__scroll-text">Scroll</span>
                </div>
            </div>
        </section>`;
}
