import { homeCfg } from "../utils.js";

const DEFAULT_FEATURES = [
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>`,
        title: "Story-first design",
        body: "Typography, rhythm, and hierarchy shaped for long-form reading. Every paragraph feels like the forest: spacious, unhurried, immersive."
    },
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/></svg>`,
        title: "Atmospheric depth",
        body: "Multi-layer parallax, rain particles, and mist overlays create a living visual environment. No two scroll-throughs feel exactly the same."
    },
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>`,
        title: "Production performance",
        body: "GPU-accelerated transforms, SSR-native templates, and reduced-motion accessibility. Beautiful by default. Fast on every device."
    },
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
        title: "CMS-native modular",
        body: "Every section is config-driven. Change colors, fonts, hero content, and layout density from the Acroxa customizer — no code required."
    }
];

export function featuresSection(params) {
    const H = homeCfg(params);
    if (H.showFeatures === false) return "";

    const items = DEFAULT_FEATURES;

    return `
        <section class="rg-section rg-features" aria-labelledby="rg-features-title" data-rg-reveal>
            <div class="rg-container">
                <header class="rg-section-header rg-section-header--center" data-rg-reveal-child>
                    <p class="rg-eyebrow">What we offer</p>
                    <h2 id="rg-features-title" class="rg-section-title">Built for the work that matters</h2>
                    <p class="rg-section-lead">Atmosphere shapes thought. Rainfall Grove gives your content the environment it deserves.</p>
                </header>

                <div class="rg-feature-grid">
                    ${items.map((f, i) => `
                        <article class="rg-card rg-card--feature" data-rg-reveal-child style="--rg-stagger:${i * 80}ms">
                            <div class="rg-card-feature-icon">
                                ${f.icon}
                            </div>
                            <h3 class="rg-card-title">${f.title}</h3>
                            <p class="rg-card-excerpt">${f.body}</p>
                            <div class="rg-card-feature-glow" aria-hidden="true"></div>
                        </article>
                    `).join("")}
                </div>
            </div>
        </section>`;
}
