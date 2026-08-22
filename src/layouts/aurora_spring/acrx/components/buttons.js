export function btnPrimary(text, url, extraClass = "") {
    return `<a href="${url || "#"}" class="as-btn as-btn--primary ${extraClass}">${text}</a>`;
}

export function btnSecondary(text, url, extraClass = "") {
    return `<a href="${url || "#"}" class="as-btn as-btn--secondary ${extraClass}">${text}</a>`;
}

export function btnGhost(text, url, extraClass = "") {
    return `<a href="${url || "#"}" class="as-btn as-btn--ghost ${extraClass}">${text}</a>`;
}
