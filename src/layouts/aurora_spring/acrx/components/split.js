import { homeCfg } from "../utils.js";
import { btnPrimary } from "./buttons.js";

export function splitSection(params) {
    const H = homeCfg(params);
    if (H.showSplit === false) return "";

    const title = H.splitTitle || "Design with intention";
    const body = H.splitBody || "Aurora Spring pairs generous whitespace with a disciplined type scale — so your message stays front and center.";
    const img = H.splitImageUrl || "";
    const cta = { text: H.splitCtaText || "About us", url: H.splitCtaUrl || "/page/about" };

    return `
        <section class="as-section as-split">
            <div class="as-container as-split__grid">
                <div class="as-split__content">
                    <h2 class="as-section-title">${title}</h2>
                    <p class="as-prose">${body}</p>
                    ${btnPrimary(cta.text, cta.url)}
                </div>
                <div class="as-split__media">
                    ${img
                        ? `<img src="${img}" alt="" loading="lazy">`
                        : `<div class="as-split__placeholder" aria-hidden="true"></div>`}
                </div>
            </div>
        </section>`;
}
