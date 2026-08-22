import { homeCfg, postCard } from "../utils.js";

export function blogPreviewSection(params) {
    const H = homeCfg(params);
    if (H.showBlogPreview === false) return "";

    const posts = (params.posts || []).slice(0, H.blogPreviewCount || 3);
    if (!posts.length) return "";

    const title = H.blogPreviewTitle || "From the blog";
    const subtitle = H.blogPreviewSubtitle || "Latest writing, guides, and updates.";

    const cards = posts.map((p, i) => postCard(p, { featured: i === 0 })).join("");

    return `
        <section class="as-section as-blog-preview" aria-labelledby="as-blog-preview-title">
            <div class="as-container">
                <header class="as-section-header">
                    <div>
                        <h2 id="as-blog-preview-title" class="as-section-title">${title}</h2>
                        <p class="as-section-lead">${subtitle}</p>
                    </div>
                    <a href="/blog" class="as-link-arrow">View all posts</a>
                </header>
                <div class="as-post-grid as-post-grid--preview">
                    ${cards}
                </div>
            </div>
        </section>`;
}
