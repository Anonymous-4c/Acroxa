import { homeCfg } from "../utils.js";

const DEFAULT_TESTIMONIALS = [
    { quote: "Clean, fast, and effortless to customize. Exactly what we wanted for our marketing site.", name: "Alex Morgan", role: "Head of Marketing" },
    { quote: "The layout system feels premium out of the box — our content finally reads the way it should.", name: "Jordan Lee", role: "Editor in Chief" },
    { quote: "We shipped a polished homepage in hours, not weeks. The section blocks are a huge win.", name: "Sam Rivera", role: "Founder" }
];

export function testimonialsSection(params) {
    const H = homeCfg(params);
    if (H.showTestimonials === false) return "";

    const title = H.testimonialsTitle || "Loved by content teams";

    return `
        <section class="as-section as-testimonials" aria-labelledby="as-testimonials-title">
            <div class="as-container">
                <header class="as-section-header as-section-header--center">
                    <h2 id="as-testimonials-title" class="as-section-title">${title}</h2>
                </header>
                <div class="as-testimonial-grid">
                    ${DEFAULT_TESTIMONIALS.map(t => `
                        <blockquote class="as-card as-card--quote">
                            <p class="as-quote">“${t.quote}”</p>
                            <footer>
                                <cite class="as-quote-author">${t.name}</cite>
                                <span class="as-quote-role">${t.role}</span>
                            </footer>
                        </blockquote>
                    `).join("")}
                </div>
            </div>
        </section>`;
}
