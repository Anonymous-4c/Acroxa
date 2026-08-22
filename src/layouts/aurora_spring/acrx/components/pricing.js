import { homeCfg } from "../utils.js";
import { btnPrimary, btnSecondary } from "./buttons.js";

const PLANS = [
    { name: "Starter", price: "$0", desc: "For personal sites and experiments.", features: ["Core templates", "Blog & pages", "Email support"] },
    { name: "Pro", price: "$29", desc: "For growing teams and brands.", features: ["All sections", "Custom accent", "Priority support"], featured: true },
    { name: "Enterprise", price: "Custom", desc: "For large-scale publishing.", features: ["Dedicated setup", "SLA", "Custom blocks"] }
];

export function pricingSection(params) {
    const H = homeCfg(params);
    if (H.showPricing !== true) return "";

    const title = H.pricingTitle || "Simple, transparent pricing";
    const subtitle = H.pricingSubtitle || "Optional preview — enable in layout settings when you need it.";

    return `
        <section class="as-section as-pricing" aria-labelledby="as-pricing-title">
            <div class="as-container">
                <header class="as-section-header as-section-header--center">
                    <h2 id="as-pricing-title" class="as-section-title">${title}</h2>
                    <p class="as-section-lead">${subtitle}</p>
                </header>
                <div class="as-pricing-grid">
                    ${PLANS.map(plan => `
                        <article class="as-card as-card--pricing${plan.featured ? " as-card--pricing-featured" : ""}">
                            <h3 class="as-card-title">${plan.name}</h3>
                            <p class="as-pricing-price">${plan.price}<span>/mo</span></p>
                            <p class="as-card-excerpt">${plan.desc}</p>
                            <ul class="as-pricing-features">
                                ${plan.features.map(f => `<li>${f}</li>`).join("")}
                            </ul>
                            ${plan.featured
                                ? btnPrimary("Get started", "/page/contact")
                                : btnSecondary("Contact sales", "/page/contact")}
                        </article>
                    `).join("")}
                </div>
            </div>
        </section>`;
}
