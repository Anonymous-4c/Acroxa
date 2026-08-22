import { header } from "./header.js";
import { footer } from "./footer.js";

export function error404(params) {
    // Two main long diagonals on 8x8 board (0-based index)
    const mainDiagonal = new Set();   // Top-left to bottom-right  (light gold)
    const antiDiagonal = new Set();   // Top-right to bottom-left (dark gold)

    for (let i = 0; i < 64; i++) {
        const row = Math.floor(i / 8);
        const col = i % 8;

        // Main diagonal: row === col  (e.g., 0,9,18,27,36,45,54,63)
        if (row === col) {
            mainDiagonal.add(i);
        }

        // Anti-diagonal: row + col === 7  (e.g., 7,14,21,28,35,42,49,56)
        if (row + col === 7) {
            antiDiagonal.add(i);
        }
    }

    const boardCells = Array.from({ length: 64 }, (_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        
        const isLight = (row + col) % 2 === 1;   // Standard chess light/dark square

        const isMainDiagonal = mainDiagonal.has(i);
        const isAntiDiagonal = antiDiagonal.has(i);

        let extraClass = '';

        if (isMainDiagonal) {
            extraClass = 'gold';     // Light golden diagonal
        } else if (isAntiDiagonal) {
            extraClass = 'gold light-gold';                // Dark golden diagonal
        } else if (isLight) {
            extraClass = 'light';
        }

        return `<div class="error-cell ${extraClass}"></div>`;
    }).join('');

    return `
        ${header(params)}
        <main class="site-main no-sidebar" style="display:block;">
            <div class="error-page fade-up">
                <div class="error-board">
                    ${boardCells}
                </div>

                <div class="error-code"><span>4</span>0<span>4</span></div>
                <p class="error-message">
                    The page you're looking for has been taken off the board.
                </p>
                <div style="display:flex; gap:1rem; flex-wrap:wrap; justify-content:center;">
                    <a href="/" class="btn btn-primary">♟ Back to Home</a>
                    <a href="/blog" class="btn btn-secondary">View Blog</a>
                </div>
            </div>
        </main>
        ${footer(params)}
    `;
}