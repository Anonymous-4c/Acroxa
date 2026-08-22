import { card } from "./card.js";

export function grid(params) {
    const posts = params.posts || [];
    
    return `
        <div class="nn-grid" style="
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: var(--space-6);
            margin-bottom: var(--space-8);
        ">
            ${posts.map((post, index) => card({ 
                post, 
                index,
                animated: true 
            })).join('')}
        </div>

        <style>
            @media (max-width: 768px) {
                .nn-grid {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    `;
}