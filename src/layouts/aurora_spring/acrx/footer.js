import { footerMenuItems } from "./utils.js";

export function footer(params) {
    const year = new Date().getFullYear();
    const title = params.site_title || "Aurora Spring";
    const desc = params.site_description || "A premium light-theme layout for content-driven websites — built on Acroxa.";
    const links = footerMenuItems(params);
    const col = (heading, items) => `
        <div>
            <h3 class="as-footer__heading">${heading}</h3>
            <ul class="as-footer__links">
                ${items.map(item => `<li><a href="${item.url || item.link || "#"}">${item.label}</a></li>`).join("")}
            </ul>
        </div>`;

    const half = Math.ceil(links.length / 2) || 1;
    const col1 = links.slice(0, half);
    const col2 = links.slice(half);

    return `
        <footer class="as-footer" role="contentinfo">
            <div class="as-container as-footer__grid">
                <div class="as-footer__brand">
                    <a href="/" class="as-brand">
                        <span class="as-brand__mark" aria-hidden="true">${(title.charAt(0) || "A").toUpperCase()}</span>
                        <span class="as-brand__text">${title}</span>
                    </a>
                    <p>${desc}</p>
                </div>
                ${col("Explore", col1.length ? col1 : [{ label: "Home", url: "/" }, { label: "Blog", url: "/blog" }])}
                ${col("Company", col2.length ? col2 : [{ label: "About", url: "/page/about" }, { label: "Contact", url: "/page/contact" }])}
                <div>
                    <h3 class="as-footer__heading">Newsletter</h3>
                    <p style="font-size:0.9375rem;color:var(--as-text-muted);margin:0 0 0.75rem;">Occasional updates. No noise.</p>
                    <form class="as-form" action="#" method="post" onsubmit="return false;">
                        <div class="as-field">
                            <label for="as-footer-email">Email</label>
                            <input id="as-footer-email" type="email" name="email" placeholder="you@example.com" autocomplete="email">
                        </div>
                        <button type="submit" class="as-btn as-btn--secondary" style="width:100%;margin-top:0.5rem;">Subscribe</button>
                    </form>
                </div>
            </div>
            <div class="as-container as-footer__bottom">
                <span>© ${year} ${title}. All rights reserved.</span>
                <span>Powered by <a href="https://www.acroxa.com" class="as-link-arrow" style="font-size:inherit;">Acroxa</a></span>
            </div>
        </footer>
        </div><!-- /.as-site-shell -->
    `;
}
