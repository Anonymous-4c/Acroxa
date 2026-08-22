export function section(params) {
    const {
        title = '',
        subtitle = '',
        content = '',
        background = 'transparent',
        padding = 'var(--space-12) var(--space-6)',
        className = ''
    } = params;

    return `
        <section class="nn-section ${className}" style="
            padding: ${padding};
            background: ${background};
            position: relative;
            overflow: hidden;
        ">
            <div class="container" style="
                max-width: 1400px;
                margin: 0 auto;
            ">
                ${title ? `
                    <div class="nn-section-header" style="
                        text-align: center;
                        margin-bottom: var(--space-8);
                    ">
                        <h2 class="slide-up" style="
                            font-size: clamp(var(--font-3xl), 5vw, var(--font-5xl));
                            font-weight: var(--font-bold);
                            background: linear-gradient(135deg, #00f0ff, #7c3aed);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            background-clip: text;
                            margin-bottom: var(--space-4);
                        ">
                            ${title}
                        </h2>
                        ${subtitle ? `
                            <p class="slide-up delay-150" style="
                                font-size: var(--font-lg);
                                color: rgba(255, 255, 255, 0.6);
                                max-width: 700px;
                                margin: 0 auto;
                            ">
                                ${subtitle}
                            </p>
                        ` : ''}
                    </div>
                ` : ''}

                <div class="nn-section-content">
                    ${content}
                </div>
            </div>
        </section>
    `;
}