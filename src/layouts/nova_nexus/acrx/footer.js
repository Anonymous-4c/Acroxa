export function footer(params) {
    const currentYear = new Date().getFullYear();
    
    return `
        <footer class="nn-footer glass" style="
            background: rgba(10, 10, 20, 0.9);
            backdrop-filter: blur(20px);
            border-top: 1px solid rgba(0, 240, 255, 0.2);
            margin-top: var(--space-16);
            position: relative;
            overflow: hidden;
        ">
            <div class="nn-footer-glow" style="
                position: absolute;
                top: -50%;
                left: 50%;
                transform: translateX(-50%);
                width: 80%;
                height: 100%;
                background: radial-gradient(ellipse, rgba(0, 240, 255, 0.1), transparent);
                pointer-events: none;
            "></div>

            <div class="container" style="
                max-width: 1400px;
                margin: 0 auto;
                padding: var(--space-12) var(--space-6);
                position: relative;
                z-index: 1;
            ">
                <div class="grid-cols-3 gap-8 md:grid-cols-3 sm:grid-cols-1" style="
                    display: grid;
                    gap: var(--space-8);
                ">
                    <div class="nn-footer-section slide-up">
                        <h3 style="
                            font-size: var(--font-xl);
                            font-weight: var(--font-bold);
                            margin-bottom: var(--space-4);
                            color: #00f0ff;
                            text-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
                        ">
                            ${params.site_title || 'Nova Nexus'}
                        </h3>
                        <p style="
                            color: rgba(255, 255, 255, 0.6);
                            line-height: var(--line-relaxed);
                            font-size: var(--font-sm);
                        ">
                            ${params.site_description || 'A futuristic CMS layout powered by Acroxa. Built for the future of web design.'}
                        </p>
                    </div>

                    <div class="nn-footer-section slide-up delay-150">
                        <h4 style="
                            font-size: var(--font-lg);
                            font-weight: var(--font-semibold);
                            margin-bottom: var(--space-4);
                            color: rgba(255, 255, 255, 0.9);
                        ">
                            Quick Links
                        </h4>
                        <ul style="
                            list-style: none;
                            padding: 0;
                            margin: 0;
                            display: flex;
                            flex-direction: column;
                            gap: var(--space-2);
                        ">
                            ${['Home', 'About', 'Blog', 'Contact'].map(link => `
                                <li>
                                    <a href="/${link.toLowerCase()}" style="
                                        color: rgba(255, 255, 255, 0.6);
                                        text-decoration: none;
                                        font-size: var(--font-sm);
                                        transition: all var(--duration-base) var(--ease-out);
                                        display: inline-block;
                                    " onmouseover="
                                        this.style.color = '#00f0ff';
                                        this.style.transform = 'translateX(4px)';
                                    " onmouseout="
                                        this.style.color = 'rgba(255, 255, 255, 0.6)';
                                        this.style.transform = 'translateX(0)';
                                    ">
                                        ${link}
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <div class="nn-footer-section slide-up delay-250">
                        <h4 style="
                            font-size: var(--font-lg);
                            font-weight: var(--font-semibold);
                            margin-bottom: var(--space-4);
                            color: rgba(255, 255, 255, 0.9);
                        ">
                            Connect
                        </h4>
                        <div class="flex gap-4" style="
                            display: flex;
                            gap: var(--space-4);
                        ">
                            ${['Twitter', 'GitHub', 'LinkedIn'].map(social => `
                                <a href="#" class="nn-social-link" style="
                                    width: 40px;
                                    height: 40px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    background: rgba(0, 240, 255, 0.1);
                                    border: 1px solid rgba(0, 240, 255, 0.3);
                                    border-radius: var(--radius-md);
                                    color: #00f0ff;
                                    text-decoration: none;
                                    font-size: var(--font-xs);
                                    font-weight: var(--font-bold);
                                    transition: all var(--duration-base) var(--ease-out);
                                " onmouseover="
                                    this.style.background = 'rgba(0, 240, 255, 0.2)';
                                    this.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.5)';
                                    this.style.transform = 'translateY(-4px)';
                                " onmouseout="
                                    this.style.background = 'rgba(0, 240, 255, 0.1)';
                                    this.style.boxShadow = 'none';
                                    this.style.transform = 'translateY(0)';
                                ">
                                    ${social.charAt(0)}
                                </a>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="nn-footer-bottom" style="
                    margin-top: var(--space-8);
                    padding-top: var(--space-6);
                    border-top: 1px solid rgba(0, 240, 255, 0.1);
                    text-align: center;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: var(--font-sm);
                ">
                    <p>&copy; ${currentYear} ${params.site_title || 'Nova Nexus'}. Built with Acroxa CMS.</p>
                </div>
            </div>
        </footer>

        <style>
            @media (max-width: 768px) {
                .nn-footer .grid-cols-3 {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    `;
}