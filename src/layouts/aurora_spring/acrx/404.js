import { header } from "./header.js";
import { footer } from "./footer.js";
import { btnPrimary, btnSecondary } from "./components/buttons.js";

export function error404(params) {
    return `
        ${header(params)}
        <main class="as-main" id="main-content">
            <div class="as-container as-404">
                <p class="as-404__code" aria-hidden="true"><span>4</span>0<span>4</span></p>
                <h1 class="as-404__title">Page not found</h1>
                <p class="as-404__message">
                    The page you’re looking for doesn’t exist or may have been moved.
                </p>
                <div class="as-404__actions">
                    ${btnPrimary("Back to home", "/")}
                    ${btnSecondary("View blog", "/blog")}
                </div>
            </div>
        </main>
        ${footer(params)}
    `;
}
