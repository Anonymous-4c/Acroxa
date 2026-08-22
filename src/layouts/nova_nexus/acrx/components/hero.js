export function hero(params) {
    const hero = params.hero || {
        title: 'Welcome to Nova Nexus',
        subtitle: 'Experience the future of web design with cutting-edge glassmorphism and neon aesthetics.',
        cta_primary: { text: 'Get Started', url: '/get-started' },
        cta_secondary: { text: 'Learn More', url: '/about' }
    };

    return `
        <section class="nn-hero" style="
            position: relative;
            min-height: 60vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-16) var(--space-6);
            overflow: hidden;
            background: radial-gradient(ellipse at top, rgba(0, 240, 255, 0.15), transparent),
                        radial-gradient(ellipse at bottom, rgba(124, 58, 237, 0.15), transparent);
        ">
            <!-- Animated Background Elements -->
            <div class="nn-hero-bg" style="
                position: absolute;
                inset: 0;
                pointer-events: none;
            ">
                ${[1, 2, 3, 4, 5].map((i) => `
                    <div style="
                        position: absolute;
                        width: ${100 + i * 50}px;
                        height: ${100 + i * 50}px;
                        border: 1px solid rgba(0, 240, 255, ${0.1 - i * 0.01});
                        border-radius: 50%;
                        top: ${Math.random() * 100}%;
                        left: ${Math.random() * 100}%;
                        animation: float ${10 + i * 2}s ease-in-out infinite;
                    "></div>
                `).join('')}
            </div>

            <div class="nn-hero-content" style="
                max-width: 900px;
                text-align: center;
                position: relative;
                z-index: 1;
            ">
                <h1 class="scale-up" style="
                    font-size: clamp(var(--font-4xl), 8vw, var(--font-7xl));
                    font-weight: var(--font-extrabold);
                    background: linear-gradient(135deg, #00f0ff, #7c3aed, #ec4899);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin-bottom: var(--space-6);
                    line-height: var(--line-tight);
                    text-shadow: 0 0 80px rgba(0, 240, 255, 0.5);
                    letter-spacing: -0.02em;
                ">
                    ${hero.title}
                </h1>

                <p class="fade-in delay-150" style="
                    font-size: clamp(var(--font-lg), 2vw, var(--font-2xl));
                    color: rgba(255, 255, 255, 0.7);
                    margin-bottom: var(--space-8);
                    line-height: var(--line-relaxed);
                    max-width: 700px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    ${hero.subtitle}
                </p>

                <div class="nn-hero-actions fade-in delay-250" style="
                    display: flex;
                    gap: var(--space-4);
                    justify-content: center;
                    flex-wrap: wrap;
                ">
                    <a href="${hero.cta_primary.url}" style="
                        display: inline-flex;
                        align-items: center;
                        padding: var(--space-4) var(--space-8);
                        background: linear-gradient(135deg, #00f0ff, #7c3aed);
                        border: none;
                        border-radius: var(--radius-md);
                        color: white;
                        text-decoration: none;
                        font-weight: var(--font-semibold);
                        font-size: var(--font-lg);
                        transition: all var(--duration-base) var(--ease-out);
                    " onmouseover="
                        this.style.transform = 'translateY(-4px) scale(1.05)';
                        this.style.boxShadow = '0 20px 50px rgba(0, 240, 255, 0.5)';
                    " onmouseout="
                        this.style.transform = 'translateY(0) scale(1)';
                        this.style.boxShadow = 'none';
                    ">
                        ${hero.cta_primary.text}
                    </a>

                    <a href="${hero.cta_secondary.url}" style="
                        display: inline-flex;
                        align-items: center;
                        padding: var(--space-4) var(--space-8);
                        background: rgba(0, 240, 255, 0.1);
                        border: 1px solid rgba(0, 240, 255, 0.3);
                        backdrop-filter: blur(10px);
                        border-radius: var(--radius-md);
                        color: #00f0ff;
                        text-decoration: none;
                        font-weight: var(--font-semibold);
                        font-size: var(--font-lg);
                        transition: all var(--duration-base) var(--ease-out);
                    " onmouseover="
                        this.style.background = 'rgba(0, 240, 255, 0.2)';
                        this.style.boxShadow = '0 0 30px rgba(0, 240, 255, 0.4)';
                        this.style.transform = 'translateY(-2px)';
                    " onmouseout="
                        this.style.background = 'rgba(0, 240, 255, 0.1)';
                        this.style.boxShadow = 'none';
                        this.style.transform = 'translateY(0)';
                    ">
                        ${hero.cta_secondary.text}
                    </a>
                </div>

                <div class="nn-hero-scroll" style="
                    margin-top: var(--space-12);
                    animation: bounce 2s ease-in-out infinite;
                ">
                    <div style="
                        width: 24px;
                        height: 40px;
                        border: 2px solid rgba(0, 240, 255, 0.5);
                        border-radius: var(--radius-full);
                        padding: 4px;
                        margin: 0 auto;
                    ">
                        <div style="
                            width: 4px;
                            height: 8px;
                            background: #00f0ff;
                            border-radius: var(--radius-full);
                            margin: 0 auto;
                            animation: scroll 1.5s ease-in-out infinite;
                        "></div>
                    </div>
                </div>
            </div>
        </section>

        <style>
            @keyframes float {
                0%, 100% {
                    transform: translateY(0) rotate(0deg);
                }
                50% {
                    transform: translateY(-20px) rotate(180deg);
                }
            }

            @keyframes scroll {
                0%, 100% {
                    transform: translateY(0);
                    opacity: 1;
                }
                50% {
                    transform: translateY(12px);
                    opacity: 0.5;
                }
            }
        </style>
    `;
}