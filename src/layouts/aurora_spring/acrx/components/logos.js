import { homeCfg } from "../utils.js";

const DEFAULT_LOGOS = ["Northwind", "Brightline", "Studio 42", "Harbor", "Plainform", "Cedar"];

export function logosSection(params) {
    const H = homeCfg(params);
    if (H.showLogos === false) return "";

    const title = H.logosTitle || "Trusted by teams who care about craft";

    return `
        <section class="as-section as-logos" aria-label="Trusted brands">
            <div class="as-container">
                <p class="as-logos__label">${title}</p>
                <ul class="as-logos__list">
                    ${DEFAULT_LOGOS.map(name => `<li>${name}</li>`).join("")}
                </ul>
            </div>
        </section>`;
}
