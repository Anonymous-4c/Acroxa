import { shellAttrs, menuItems, renderMenuTree } from "./utils.js";

export function header(params) {
    const items = menuItems(params);
    const logo = params.site_logo;
    const title = params.site_title || "Aurora Spring";
    const initial = (title.charAt(0) || "A").toUpperCase();

    return `
        <header class="acrx-header">
        
        </header>
    `;
}
