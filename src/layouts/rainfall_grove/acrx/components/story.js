import { homeCfg } from "../utils.js";

export function storySection(params) {
    const H     = homeCfg(params);
    const title = H.storyTitle || "A quiet place to think";
    const body  = H.storyBody  || "In the space between the trees, clarity arrives. Rainfall Grove is built for writers and makers who believe that atmosphere shapes thought — and that the right environment can unlock the work that matters most.";

    return `
        <section class="rg-section rg-story" aria-labelledby="rg-story-title" data-rg-reveal>
            <div class="rg-container rg-story__inner">
                <!-- Decorative left gutter: rainfall line -->
                <div class="rg-story__rain-gutter" aria-hidden="true">
                    <div class="rg-story__rain-line"></div>
                    <div class="rg-story__rain-line rg-story__rain-line--2"></div>
                    <div class="rg-story__rain-line rg-story__rain-line--3"></div>
                </div>

                <div class="rg-story__content" data-rg-reveal-child>
                    <p class="rg-eyebrow">Our philosophy</p>
                    <h2 id="rg-story-title" class="rg-section-title rg-story__title">${title}</h2>
                    <div class="rg-story__body">
                        <p class="rg-story__lead">${body}</p>
                    </div>

                    <div class="rg-story__stats">
                        <div class="rg-stat" data-rg-reveal-child>
                            <span class="rg-stat__number">∞</span>
                            <span class="rg-stat__label">Stories waiting</span>
                        </div>
                        <div class="rg-stat" data-rg-reveal-child>
                            <span class="rg-stat__number">1</span>
                            <span class="rg-stat__label">Place to start</span>
                        </div>
                        <div class="rg-stat" data-rg-reveal-child>
                            <span class="rg-stat__number">0</span>
                            <span class="rg-stat__label">Noise</span>
                        </div>
                    </div>
                </div>

                <!-- Decorative atmospheric panel -->
                <div class="rg-story__visual" aria-hidden="true" data-rg-reveal-child>
                    <div class="rg-story__frame">
                        <div class="rg-story__frame-mist"></div>
                        <!-- SVG trees inside the frame -->
                        <svg class="rg-story__frame-trees" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <!-- Ground fog -->
                            <ellipse cx="200" cy="270" rx="200" ry="30" fill="currentColor" opacity="0.3"/>
                            <!-- Tree 1 (far) -->
                            <rect x="60" y="140" width="8" height="130" rx="2" fill="currentColor" opacity="0.4"/>
                            <polygon points="64,50 30,145 98,145" fill="currentColor" opacity="0.4"/>
                            <polygon points="64,85 35,145 93,145" fill="currentColor" opacity="0.3"/>
                            <!-- Tree 2 (mid) -->
                            <rect x="180" y="110" width="12" height="160" rx="2" fill="currentColor" opacity="0.6"/>
                            <polygon points="186,20 140,115 232,115" fill="currentColor" opacity="0.6"/>
                            <polygon points="186,55 144,115 228,115" fill="currentColor" opacity="0.5"/>
                            <polygon points="186,85 148,115 224,115" fill="currentColor" opacity="0.4"/>
                            <!-- Tree 3 (far right) -->
                            <rect x="310" y="150" width="7" height="120" rx="2" fill="currentColor" opacity="0.35"/>
                            <polygon points="314,60 282,155 346,155" fill="currentColor" opacity="0.35"/>
                            <polygon points="314,95 285,155 343,155" fill="currentColor" opacity="0.28"/>
                            <!-- Rain streaks -->
                            <line x1="50" y1="0" x2="44" y2="80" stroke="currentColor" stroke-width="1" opacity="0.15"/>
                            <line x1="120" y1="0" x2="114" y2="90" stroke="currentColor" stroke-width="0.8" opacity="0.12"/>
                            <line x1="220" y1="0" x2="214" y2="70" stroke="currentColor" stroke-width="1" opacity="0.18"/>
                            <line x1="290" y1="0" x2="284" y2="85" stroke="currentColor" stroke-width="0.8" opacity="0.13"/>
                            <line x1="360" y1="0" x2="354" y2="75" stroke="currentColor" stroke-width="1" opacity="0.16"/>
                        </svg>
                        <div class="rg-story__frame-overlay"></div>
                    </div>
                </div>
            </div>
        </section>`;
}
