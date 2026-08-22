import { footerMenuItems } from "./utils.js";

export function footer(params) {
    const year  = new Date().getFullYear();
    const title = params.site_title || "Rainfall Grove";
    const desc  = params.site_description || "An immersive space for long-form writing and visual storytelling — built on Acroxa.";
    const links = footerMenuItems(params);

    const half = Math.ceil(links.length / 2) || 1;
    const col1 = links.slice(0, half);
    const col2 = links.slice(half);

    const navCol = (heading, items) => `
        <div class="rg-footer__col">
            <h3 class="rg-footer__heading">${heading}</h3>
            <ul class="rg-footer__links">
                ${items.map(item => `<li><a href="${item.url || item.link || "#"}">${item.label}</a></li>`).join("")}
            </ul>
        </div>`;

    return `
        <footer class="rg-footer" role="contentinfo">
            <!-- Atmospheric top border -->
            <div class="rg-footer__mist" aria-hidden="true"></div>

            <div class="rg-container rg-footer__grid">
                <!-- Brand -->
                <div class="rg-footer__brand">
                    <a href="/" class="rg-brand rg-brand--footer">
                        <span class="rg-brand__mark" aria-hidden="true">${(title.charAt(0) || "R").toUpperCase()}</span>
                        <span class="rg-brand__text">${title}</span>
                    </a>
                    <p class="rg-footer__tagline">${desc}</p>
                    <p class="rg-footer__bio-note">
                        Every great forest begins with a single seed.
                        So does every great story.
                    </p>
                </div>

                <!-- Nav columns -->
                ${navCol("Explore",  col1.length ? col1 : [{ label: "Home", url: "/" }, { label: "Blog", url: "/blog" }])}
                ${navCol("Navigate", col2.length ? col2 : [{ label: "About", url: "/page/about" }, { label: "Contact", url: "/page/contact" }])}

                <!-- Newsletter -->
                <div class="rg-footer__col">
                    <h3 class="rg-footer__heading">Stay connected</h3>
                    <p class="rg-footer__newsletter-note">Occasional dispatches from the grove. No noise.</p>
                    <form class="rg-form" action="#" method="post" onsubmit="return false;">
                        <div class="rg-field">
                            <label for="rg-footer-email" class="rg-label">Email address</label>
                            <input
                                id="rg-footer-email"
                                type="email"
                                name="email"
                                class="rg-input"
                                placeholder="you@example.com"
                                autocomplete="email">
                        </div>
                        <button type="submit" class="rg-btn rg-btn--secondary rg-btn--full">Subscribe</button>
                    </form>
                </div>
            </div>

            <div class="rg-container rg-footer__bottom">
                <span>© ${year} ${title}. All rights reserved.</span>
                <span class="rg-footer__credit">
                    Grown on <a href="https://www.acroxa.com">Acroxa</a>
                </span>
            </div>
        </footer>
        </div><!-- /.rg-site-shell -->
    `;
}
