import { header } from "./header.js";
import { footer } from "./footer.js";

export function error404(params) {
    return `
        ${header(params)}
        <main class="rg-main" id="main-content">
            <div class="rg-404">
                <!-- Atmospheric background for 404 -->
                <div class="rg-404__atmosphere" aria-hidden="true">
                    <div class="rg-404__mist"></div>
                    <svg class="rg-404__trees" viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M0,220 L40,140 L80,200 L120,100 L160,180 L200,130 L240,190 L280,100 L320,160 L360,130 L400,180 L440,100 L480,160 L520,130 L560,180 L600,100 L640,160 L680,130 L720,190 L760,100 L800,170 L840,130 L880,190 L920,110 L960,170 L1000,130 L1040,190 L1080,100 L1120,160 L1160,130 L1200,190 L1240,100 L1280,160 L1320,130 L1360,190 L1400,110 L1440,160 L1440,300 L0,300 Z" fill="currentColor"/>
                    </svg>
                </div>

                <div class="rg-container rg-404__content">
                    <p class="rg-404__code" aria-hidden="true">404</p>
                    <h1 class="rg-404__title">Lost in the grove</h1>
                    <p class="rg-404__message">
                        The path you followed doesn't lead anywhere — perhaps the mist shifted,
                        or the page has moved deeper into the forest.
                    </p>
                    <div class="rg-404__actions">
                        <a href="/" class="rg-btn rg-btn--primary rg-btn--lg">
                            Find my way home
                        </a>
                        <a href="/blog" class="rg-btn rg-btn--ghost rg-btn--lg">Browse the grove</a>
                    </div>
                </div>
            </div>
        </main>
        ${footer(params)}
    `;
}
