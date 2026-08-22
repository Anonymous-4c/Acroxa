import { header } from "./header.js";
import { footer } from "./footer.js";

export function error404(params) {
    return `
        ${header(params)}

        <main class="nn-404 flex-col-center fade-in" style="
            min-height: 70vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-8) var(--space-6);
            text-align: center;
            position: relative;
            overflow: hidden;
        ">
            <div class="nn-404-bg" style="
                position: absolute;
                inset: 0;
                background: radial-gradient(ellipse at center, rgba(0, 240, 255, 0.1), transparent);
                pointer-events: none;
            "></div>

            <div class="nn-404-content" style="
                position: relative;
                z-index: 1;
                max-width: 600px;
            ">
                <div class="nn-404-code scale-up" style="
                    font-size: clamp(6rem, 15vw, 12rem);
                    font-weight: var(--font-extrabold);
                    background: linear-gradient(135deg, #00f0ff, #7c3aed, #ec4899);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    line-height: 1;
                    margin-bottom: var(--space-4);
                    text-shadow: 0 0 80px rgba(0, 240, 255, 0.5);
                    animation: pulse 2s ease-in-out infinite;
                ">
                    404
                </div>

                <h1 class="slide-up" style="
                    font-size: clamp(var(--font-2xl), 4vw, var(--font-4xl));
                    font-weight: var(--font-bold);
                    color: rgba(255, 255, 255, 0.9);
                    margin-bottom: var(--space-4);
                ">
                    Page Not Found
                </h1>

                <p class="slide-up delay-150" style="
                    font-size: var(--font-lg);
                    color: rgba(255, 255, 255, 0.6);
                    line-height: var(--line-relaxed);
                    margin-bottom: var(--space-8);
                ">
                    Looks like you've ventured into uncharted territory. The page you're looking for doesn't exist in this dimension.
                </p>

                <div class="nn-404-actions slide-up delay-250" style="
                    display: flex;
                    gap: var(--space-4);
                    justify-content: center;
                    flex-wrap: wrap;
                ">
                    <a href="/" style="
                        display: inline-flex;
                        align-items: center;
                        padding: var(--space-4) var(--space-8);
                        background: linear-gradient(135deg, #00f0ff, #7c3aed);
                        border: none;
                        border-radius: var(--radius-md);
                        color: white;
                        text-decoration: none;
                        font-weight: var(--font-semibold);
                        font-size: var(--font-base);
                        transition: all var(--duration-base) var(--ease-out);
                    " onmouseover="
                        this.style.transform = 'translateY(-4px)';
                        this.style.boxShadow = '0 15px 40px rgba(0, 240, 255, 0.4)';
                    " onmouseout="
                        this.style.transform = 'translateY(0)';
                        this.style.boxShadow = 'none';
                    ">
                        Go Home
                    </a>

                    <button onclick="history.back()" style="
                        display: inline-flex;
                        align-items: center;
                        padding: var(--space-4) var(--space-8);
                        background: rgba(0, 240, 255, 0.1);
                        border: 1px solid rgba(0, 240, 255, 0.3);
                        border-radius: var(--radius-md);
                        color: #00f0ff;
                        font-weight: var(--font-semibold);
                        font-size: var(--font-base);
                        cursor: pointer;
                        transition: all var(--duration-base) var(--ease-out);
                    " onmouseover="
                        this.style.background = 'rgba(0, 240, 255, 0.2)';
                        this.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.4)';
                    " onmouseout="
                        this.style.background = 'rgba(0, 240, 255, 0.1)';
                        this.style.boxShadow = 'none';
                    ">
                        Go Back
                    </button>
                </div>

                <div class="nn-404-decoration" style="
                    margin-top: var(--space-12);
                    display: flex;
                    justify-content: center;
                    gap: var(--space-4);
                ">
                    ${[1, 2, 3].map((i) => `
                        <div style="
                            width: 8px;
                            height: 8px;
                            background: rgba(0, 240, 255, 0.5);
                            border-radius: 50%;
                            animation: pulse ${1 + i * 0.2}s ease-in-out infinite;
                            box-shadow: 0 0 20px rgba(0, 240, 255, 0.8);
                        "></div>
                    `).join('')}
                </div>
            </div>
        </main>

        ${footer(params)}

        <style>
            @keyframes pulse {
                0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                }
                50% {
                    opacity: 0.8;
                    transform: scale(1.02);
                }
            }
        </style>
    `;
}