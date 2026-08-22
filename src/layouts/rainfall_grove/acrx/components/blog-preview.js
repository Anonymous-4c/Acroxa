import { homeCfg, postCard } from "../utils.js";

export function blogPreviewSection(params) {
    const H = homeCfg(params);
    if (H.showBlogPreview === false) return "";

    const posts = (params.posts || []).slice(0, parseInt(H.blogPreviewCount, 10) || 3);
    if (!posts.length) return "";

    const [featured, ...rest] = posts;

    return `
        <section class="rg-section rg-blog-preview" aria-labelledby="rg-blog-preview-title" data-rg-reveal>
            <div class="rg-container">
                <header class="rg-section-header" data-rg-reveal-child>
                    <div>
                        <p class="rg-eyebrow">From the grove</p>
                        <h2 id="rg-blog-preview-title" class="rg-section-title">Latest dispatches</h2>
                    </div>
                    <a href="/blog" class="rg-link-arrow">View all stories →</a>
                </header>

                <div class="rg-blog-preview-layout" data-rg-reveal-child>
                    ${featured ? `
                    <!-- Featured: large card -->
                    <div class="rg-blog-preview__featured">
                        ${postCard(featured, { featured: true })}
                    </div>` : ""}

                    ${rest.length ? `
                    <!-- Secondary cards -->
                    <div class="rg-blog-preview__secondary">
                        ${rest.map(p => postCard(p, { featured: false })).join("")}
                    </div>` : ""}
                </div>
            </div>
        </section>`;
}
