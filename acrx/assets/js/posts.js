/* ../acrx/assets/js/posts.js */

document.addEventListener("DOMContentLoaded", () => {
    const POSTS_API = '/acr/api/posts';
    const CATEGORIES_API = '/acr/api/categories';   // ← Update this if your endpoint is different

    const wrap = document.querySelector('.ttc-pis-wrap');
    const counter = document.querySelector('.p-n-m');
    const container = document.querySelector(".ttc-pis");
    const categoryDropdownWrap = document.querySelector("#category-filter .wrap-menu-dp");

    if (!wrap || !container || !categoryDropdownWrap) {
        console.warn("Required DOM elements not found");
        return;
    }

    let allPostsData = [];
    let allCategories = [];
    let filters = { status: "all", category: "all" };
    let sortState = { col: null, dir: null };
    let perPage = 10;
    let currentPage = 1;

    // ─── Helpers ────────────────────────────────────────

    function seoScore(p) {
        let v = 50;
        if (p.metaTitle) v += 10;
        if (p.metaDescription) v += 10;
        if (p.focusKeyword) v += 10;
        if (p.keywords?.length) v += 10;
        if (p.ogImage) v += 10;
        return Math.min(v, 100);
    }

    function createRow(p) {
        console.log("Creating row for post:", p);
        const statusColor = 
            p.status === 'published' ? 'green' :
            p.status === 'draft'     ? 'orange' : 'red';

        const el = document.createElement('div');
        el.className = 'ttc-pis';
        el.innerHTML = `
            <div class="ttc-pi">
                <label class="box-cbx" data-id="${p.id || p._id}" for="cbx-${p.id || p._id}">
                    <div class="cbx"><i class="icon fa-solid fa-check"></i></div>
                    <input type="checkbox"  id="cbx-${p.id || p._id}" style="display:none;">
                </label>
                <div class="acrx-itn name name-post">
                    ${p.title || 'Untitled'}
                    <button class="edit-title"><i class="fa-solid fa-pen-to-square"></i></button>
                </div>
                <div class="acrx-itn status status-post" data-="${statusColor}">
                    ${p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                </div>
                <div class="acrx-itn taxonomies taxonomies-post">
                    ${(p.categories || []).map(c => c.name).join(', ') || '—'}
                </div>
                <div class="acrx-itn date date-post">
                    ${new Date(p.publishDate).toLocaleDateString()}
                </div>
                <div class="acrx-itn tags tags-post">
                    ${(p.tags || []).join(', ') || '—'}
                </div>
                <div class="acrx-itn seosc seosc-post">
                    ${seoScore(p)}/100
                </div>
                <div class="acrx-itn actions actions-post">
                    <button class="btn-act"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-act"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-act"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        return el;
    }

    // ─── Main Render Function ───────────────────────────

    function render() {
        let data = [...allPostsData];

        // Filter by status
        if (filters.status !== "all") {
            data = data.filter(p => p.status.toLowerCase() === filters.status);
        }

        // Filter by category
        if (filters.category !== "all") {
            data = data.filter(p =>
                (p.categories || []).some(c => 
                    (c.slug || c.name || '').toLowerCase() === filters.category
                )
            );
        }

        // Sort
        if (sortState.col) {
            data.sort((a, b) => {
                let A, B;
                switch (sortState.col) {
                    case "name":     
                        A = (a.title || '').toLowerCase(); 
                        B = (b.title || '').toLowerCase(); 
                        break;
                    case "status":   
                        A = a.status.toLowerCase(); 
                        B = b.status.toLowerCase(); 
                        break;
                    case "categories": 
                        A = (a.categories?.map(c => c.name).join(',') || '').toLowerCase(); 
                        B = (b.categories?.map(c => c.name).join(',') || '').toLowerCase(); 
                        break;
                    case "dated":    
                        A = new Date(a.publishDate); 
                        B = new Date(b.publishDate); 
                        break;
                    case "tags":     
                        A = (a.tags?.join(',') || '').toLowerCase(); 
                        B = (b.tags?.join(',') || '').toLowerCase(); 
                        break;
                    case "seo":      
                        A = seoScore(a); 
                        B = seoScore(b); 
                        break;
                    default: 
                        return 0;
                }

                if (sortState.col === "seo" || sortState.col === "dated") {
                    return sortState.dir === "asc" ? A - B : B - A;
                }
                return sortState.dir === "asc"
                    ? A.localeCompare(B)
                    : B.localeCompare(A);
            });
        }

        // Pagination
        const total = data.length;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        if (currentPage > totalPages) currentPage = totalPages || 1;

        const start = (currentPage - 1) * perPage;
        const pagedData = data.slice(start, start + perPage);

        // Render posts
        container.innerHTML = '';
        pagedData.forEach(post => {
            container.appendChild(createRow(post));
        });

        // Update UI
        counter.textContent = total;
        const pageInfo = document.querySelector(".page-info");
        if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

        initInlineEdit();
    }

    // ─── Dynamic Categories ─────────────────────────────

    function populateCategories() {
        categoryDropdownWrap.innerHTML = '';

        // Always show "All" option
        const allBtn = document.createElement('button');
        allBtn.className = 'dropdown-item';
        allBtn.dataset.cat = 'all';
        allBtn.textContent = 'All';
        categoryDropdownWrap.appendChild(allBtn);

        // Add categories from API (if any)
        if (allCategories.length === 0) {
            // If no categories, only "All" remains - as requested
            return;
        }

        allCategories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'dropdown-item';
            btn.dataset.cat = (cat.slug || cat.name || 'unknown').toLowerCase();
            btn.textContent = cat.name || 'Unnamed Category';
            categoryDropdownWrap.appendChild(btn);
        });
    }

    function attachCategoryListeners() {
        const items = categoryDropdownWrap.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            // Remove old listeners to avoid duplicates
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);

            newItem.addEventListener('click', () => {
                filters.category = newItem.dataset.cat || 'all';
                currentPage = 1;
                const menu = newItem.closest(".dropdown-menu");
                if (menu) menu.classList.remove("active");
                render();
            });
        });
    }

    // ─── Inline Title Edit ──────────────────────────────

    function initInlineEdit() {
        document.querySelectorAll(".edit-title").forEach(btn => {
            btn.addEventListener("click", function handler(e) {
                e.stopImmediatePropagation();
                const nameDiv = btn.closest(".name-post");
                const oldText = nameDiv.firstChild.textContent.trim();

                const input = document.createElement("input");
                input.value = oldText;
                nameDiv.innerHTML = '';
                nameDiv.appendChild(input);
                input.focus();

                function save() {
                    const newTitle = input.value.trim() || 'Untitled';
                    nameDiv.innerHTML = `${newTitle} <button class="edit-title"><i class="fa-solid fa-pen-to-square"></i></button>`;
                    initInlineEdit(); // re-bind
                }

                input.addEventListener("blur", save);
                input.addEventListener("keydown", e => {
                    if (e.key === "Enter") save();
                    if (e.key === "Escape") {
                        nameDiv.innerHTML = `${oldText} <button class="edit-title"><i class="fa-solid fa-pen-to-square"></i></button>`;
                        initInlineEdit();
                    }
                });
            }, { once: true });
        });
    }

    // ─── Sorting ────────────────────────────────────────

    function setupSorting() {
        const headers = {
            name:       document.querySelector(".ttc-ph .name"),
            status:     document.querySelector(".ttc-ph .status"),
            categories: document.querySelector(".ttc-ph .categories"),
            dated:      document.querySelector(".ttc-ph .dated"),
            tags:       document.querySelector(".ttc-ph .tags"),
            seo:        document.querySelector(".ttc-ph .seo-sc"),
        };

        Object.entries(headers).forEach(([key, el]) => {
            if (!el) return;
            el.addEventListener("click", () => {
                if (sortState.col === key) {
                    if (sortState.dir === "asc") sortState.dir = "desc";
                    else if (sortState.dir === "desc") sortState = { col: null, dir: null };
                    else sortState.dir = "asc";
                } else {
                    sortState = { col: key, dir: "asc" };
                }
                currentPage = 1;
                render();
                updateSortIcons(el, key);
            });
        });
    }

    function updateSortIcons(clickedHeader, activeCol) {
        document.querySelectorAll(".ttc-ph > div").forEach(h => {
            h.classList.remove("sorted-asc", "sorted-desc");
            const icon = h.querySelector(".sort-icon");
            if (icon) icon.remove();
        });

        if (sortState.col === activeCol && sortState.dir) {
            const icon = document.createElement("i");
            icon.className = `sort-icon fa-solid ${sortState.dir === "asc" ? "fa-arrow-up" : "fa-arrow-down"}`;
            clickedHeader.appendChild(icon);
            clickedHeader.classList.add(sortState.dir === "asc" ? "sorted-asc" : "sorted-desc");
        }
    }

    // ─── Data Fetching ──────────────────────────────────

    async function loadData() {
        try {
            // First load categories
            const catResponse = await fetch(CATEGORIES_API);
            if (catResponse.ok) {
                const catJson = await catResponse.json();
                if (catJson.success && Array.isArray(catJson.categories)) {
                    allCategories = catJson.categories;
                }
            }

            populateCategories();
            attachCategoryListeners();

            // Then load posts
            const postResponse = await fetch(POSTS_API);
            if (postResponse.ok) {
                const postJson = await postResponse.json();
                if (postJson.success) {
                    allPostsData = postJson.posts || [];
                    counter.textContent = allPostsData.length;
                }
            }

            render();
            setupSorting();

        } catch (error) {
            console.error("Failed to load data:", error);
            
            // Fallback - at least show All option and try to load posts
            populateCategories();
            attachCategoryListeners();

            // Try loading posts anyway
            try {
                const postResponse = await fetch(POSTS_API);
                if (postResponse.ok) {
                    const postJson = await postResponse.json();
                    if (postJson.success) {
                        allPostsData = postJson.posts || [];
                        counter.textContent = allPostsData.length;
                    }
                }
                render();
                setupSorting();
            } catch (postErr) {
                console.error("Posts fetch also failed:", postErr);
            }
        }
    }

    // ─── Event Listeners ────────────────────────────────

    // Create new post buttons
    document.querySelectorAll(".button-pst").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-link");
            if (target) window.location.href = target;
        });
    });

    // Status tabs
    document.querySelectorAll(".pages").forEach(tab => {
        tab.addEventListener("click", () => {
            filters.status = tab.dataset.showSid?.toLowerCase() || "all";
            currentPage = 1;
            document.querySelectorAll(".pages").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            render();
        });
    });

    // Per-page selector: update perPage on item click (centralized dropdown handles open/close)
    document.querySelectorAll(".num-exp .pp-dropdown-item").forEach(item => {
        item.addEventListener("click", () => {
            perPage = parseInt(item.dataset.value, 10) || 10;
            currentPage = 1;
            const ppCount = document.querySelector(".p-n-m");
            if (ppCount) ppCount.textContent = perPage;
            render();
        });
    });

    // Pagination
    document.querySelector(".prev")?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            render();
        }
    });

    document.querySelector(".next")?.addEventListener("click", () => {
        currentPage++;
        render();
    });

    // Start the app
    loadData();
});