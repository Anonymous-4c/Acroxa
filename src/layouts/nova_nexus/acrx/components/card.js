export function card(params) {
    const post = params.post;
    const index = params.index || 0;
    const animated = params.animated !== false;
    const delay = index * 100;

    return `
        <article class="nn-card ${animated ? 'fade-in' : ''}" style="
            background: rgba(10, 10, 20, 0.5);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 240, 255, 0.2);
            border-radius: var(--radius-lg);
            overflow: hidden;
            transition: all var(--duration-base) var(--ease-out);
            cursor: pointer;
            position: relative;
            ${animated ? `animation-delay: ${delay}ms;` : ''}
        " onmouseover="
            this.style.transform = 'translateY(-8px)';
            this.style.borderColor = '#00f0ff';
            this.style.boxShadow = '0 20px 60px rgba(0, 240, 255, 0.3)';
        " onmouseout="
            this.style.transform = 'translateY(0)';
            this.style.borderColor = 'rgba(0, 240, 255, 0.2)';
            this.style.boxShadow = 'none';
        " onclick="window.location.href='/post/${post.slug}'">
            ${post.image ? `
                <div class="nn-card-image" style="
                    position: relative;
                    width: 100%;
                    height: 250px;
                    overflow: hidden;
                ">
                    <img src="${post.image}" alt="${post.title}" style="
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        transition: transform var(--duration-slow) var(--ease-out);
                    " onmouseover="
                        this.style.transform = 'scale(1.1)';
                    " onmouseout="
                        this.style.transform = 'scale(1)';
                    ">
                    <div style="
                        position: absolute;
                        inset: 0;
                        background: linear-gradient(180deg, transparent, rgba(10, 10, 20, 0.9));
                    "></div>

                    ${post.category ? `
                        <span style="
                            position: absolute;
                            top: var(--space-4);
                            left: var(--space-4);
                            padding: var(--space-2) var(--space-4);
                            background: rgba(0, 240, 255, 0.2);
                            backdrop-filter: blur(10px);
                            border: 1px solid rgba(0, 240, 255, 0.4);
                            border-radius: var(--radius-full);
                            color: #00f0ff;
                            font-size: var(--font-xs);
                            font-weight: var(--font-semibold);
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                        ">
                            ${post.category}
                        </span>
                    ` : ''}
                </div>
            ` : ''}

            <div class="nn-card-content" style="
                padding: var(--space-6);
            ">
                ${post.date ? `
                    <div class="nn-card-meta" style="
                        display: flex;
                        align-items: center;
                        gap: var(--space-2);
                        margin-bottom: var(--space-3);
                        color: rgba(255, 255, 255, 0.5);
                        font-size: var(--font-xs);
                    ">
                        <span>${post.date}</span>
                        ${post.read_time ? `
                            <span>•</span>
                            <span>${post.read_time} min read</span>
                        ` : ''}
                    </div>
                ` : ''}

                <h3 style="
                    font-size: var(--font-xl);
                    font-weight: var(--font-bold);
                    color: rgba(255, 255, 255, 0.95);
                    margin-bottom: var(--space-3);
                    line-height: var(--line-tight);
                    transition: color var(--duration-base) var(--ease-out);
                " onmouseover="
                    this.style.color = '#00f0ff';
                " onmouseout="
                    this.style.color = 'rgba(255, 255, 255, 0.95)';
                ">
                    ${post.title}
                </h3>

                ${post.excerpt ? `
                    <p style="
                        color: rgba(255, 255, 255, 0.6);
                        line-height: var(--line-relaxed);
                        font-size: var(--font-sm);
                        margin-bottom: var(--space-4);
                    ">
                        ${post.excerpt}
                    </p>
                ` : ''}

                <div class="nn-card-footer" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: var(--space-4);
                    border-top: 1px solid rgba(0, 240, 255, 0.1);
                ">
                    <a href="/post/${post.slug}" style="
                        color: #00f0ff;
                        text-decoration: none;
                        font-size: var(--font-sm);
                        font-weight: var(--font-semibold);
                        display: inline-flex;
                        align-items: center;
                        gap: var(--space-2);
                        transition: all var(--duration-base) var(--ease-out);
                    " onmouseover="
                        this.style.textShadow = '0 0 15px rgba(0, 240, 255, 0.8)';
                        this.querySelector('span').style.transform = 'translateX(4px)';
                    " onmouseout="
                        this.style.textShadow = 'none';
                        this.querySelector('span').style.transform = 'translateX(0)';
                    " onclick="event.stopPropagation()">
                        Read More
                        <span style="
                            transition: transform var(--duration-base) var(--ease-out);
                        ">→</span>
                    </a>

                    ${post.author ? `
                        <div style="
                            display: flex;
                            align-items: center;
                            gap: var(--space-2);
                        ">
                            <div style="
                                width: 24px;
                                height: 24px;
                                border-radius: 50%;
                                background: linear-gradient(135deg, #00f0ff, #7c3aed);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: var(--font-xs);
                                font-weight: var(--font-bold);
                                color: white;
                            ">
                                ${post.author.charAt(0)}
                            </div>
                            <span style="
                                font-size: var(--font-xs);
                                color: rgba(255, 255, 255, 0.5);
                            ">
                                ${post.author}
                            </span>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Neon border effect on hover -->
            <div style="
                position: absolute;
                inset: -1px;
                background: linear-gradient(135deg, #00f0ff, #7c3aed, #ec4899);
                border-radius: var(--radius-lg);
                opacity: 0;
                transition: opacity var(--duration-base) var(--ease-out);
                z-index: -1;
                pointer-events: none;
            " class="nn-card-glow"></div>
        </article>

        <style>
            .nn-card:hover .nn-card-glow {
                opacity: 0.3;
            }
        </style>
    `;
}