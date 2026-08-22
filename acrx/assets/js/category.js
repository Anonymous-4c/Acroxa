/* ../acrx/assets/js/category.js */
document.addEventListener("DOMContentLoaded", () => {
  const tableWrap = document.querySelector(".category-ttc");
  if (!tableWrap) return;

  const rows = [...tableWrap.querySelectorAll(".ttc-pi")];
  const pageInfo = document.querySelector(".page-info");
  const searchInput = document.querySelector("#category-search");
  const dropdownToggle = document.querySelector(".pp-dropdown-toggle");
  const dropdownMenu = document.querySelector(".pp-dropdown-menu");
  const dropdownItems = document.querySelectorAll(".pp-dropdown-item");
  const perPageDisplay = document.querySelector(".num-exp .p-n-m");

  let currentSort = { col: null, dir: "asc" };
  let currentFilter = "all";
  let perPage = 10;
  let currentPage = 1;

  // ---------- Helpers ----------
  const parseCount = (row) => parseInt(row.querySelector(".count-cat")?.innerText.trim()) || 0;

  const getCell = (row, key) => {
    switch (key) {
      case "name": return row.querySelector(".name-cat")?.textContent.trim().toLowerCase() || "";
      case "slug": return row.querySelector(".slug-cat")?.textContent.trim().toLowerCase() || "";
      case "count": return parseCount(row);
      default: return "";
    }
  };

  // ---------- Highlight Helper ----------
  const highlightText = (element, query) => {
    if (!element || !query) return;
    const text = element.textContent;
    const regex = new RegExp(`(${query})`, "gi");
    const newHTML = text.replace(regex, `<mark class="highlight">$1</mark>`);
    element.innerHTML = newHTML;
  };

  function render() {
    let filtered = rows.slice();
    const q = searchInput?.value.trim().toLowerCase() || "";

    // Filter Tabs
    if (currentFilter === "active") filtered = filtered.filter(r => parseCount(r) > 0);
    if (currentFilter === "empty") filtered = filtered.filter(r => parseCount(r) === 0);

    // Search
    if (q) {
      filtered = filtered.filter(r =>
        getCell(r, "name").includes(q) ||
        getCell(r, "slug").includes(q) ||
        (r.querySelector(".desc-cat")?.innerText.toLowerCase().includes(q))
      );
    }

    // Sorting
    if (currentSort.col) {
      const { col, dir } = currentSort;
      const factor = dir === "asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const A = getCell(a, col);
        const B = getCell(b, col);
        if (col === "count") return (A - B) * factor;
        return A.localeCompare(B) * factor;
      });
    }

    // Pagination
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const visible = filtered.slice(start, end);

    // Render visible rows
    tableWrap.querySelectorAll(".ttc-pis.generated").forEach(e => e.remove());
    const wrapper = document.createElement("div");
    wrapper.className = "ttc-pis generated";

    visible.forEach(r => {
      const nameEl = r.querySelector(".name-cat");
      const slugEl = r.querySelector(".slug-cat");
      const descEl = r.querySelector(".desc-cat");

      if (nameEl) nameEl.innerHTML = nameEl.textContent;
      if (slugEl) slugEl.innerHTML = slugEl.textContent;

      // --- Fix description ---
      if (descEl) {
        const text = descEl.textContent.trim();
        descEl.innerHTML = `<p class="desc-inner">${text}</p>`;
      }

      // --- Apply highlighting ---
      if (q) {
        highlightText(nameEl, q);
        highlightText(slugEl, q);
        const innerDesc = r.querySelector(".desc-inner");
        highlightText(innerDesc, q);
      }

      wrapper.appendChild(r);
    });

    tableWrap.appendChild(wrapper);

    // Page Info
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    // Header Sort Icons
    document.querySelectorAll(".ttc-ph > div").forEach(h => {
      h.classList.remove("sorted-asc", "sorted-desc");
      h.querySelector(".sort-icon")?.remove();
    });

    if (currentSort.col) {
      const header = document.querySelector(`.ttc-ph .${currentSort.col}`);
      if (header) {
        const icon = document.createElement("i");
        icon.className = `sort-icon fa-solid ${currentSort.dir === "asc" ? "fa-arrow-up" : "fa-arrow-down"}`;
        header.classList.add(currentSort.dir === "asc" ? "sorted-asc" : "sorted-desc");
        header.appendChild(icon);
      }
    }
  }


  // ---------- Header Sorting ----------
  document.querySelectorAll(".ttc-ph > div").forEach(header => {
    const sortableCols = ["name", "slug", "count"];
    const col = sortableCols.find(c => header.classList.contains(c));
    if (!col) return;

    header.style.cursor = "pointer";
    header.addEventListener("click", () => {
      if (currentSort.col === col) {
        currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
      } else {
        currentSort = { col, dir: "asc" };
      }
      render();
    });
  });

  // ---------- Filter Tabs ----------
  document.querySelectorAll(".pages").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.showSid || "all";
      document.querySelectorAll(".pages").forEach(b => b.classList.toggle("active", b === btn));
      currentPage = 1;
      render();
    });
  });

  // ---------- Pagination ----------
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

  // ---------- Search ----------
  searchInput?.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  // Per-page selector: update perPage on item click (centralized dropdown handles open/close)
  dropdownItems.forEach(item => {
    item.addEventListener("click", () => {
      perPage = parseInt(item.dataset.value);
      perPageDisplay.textContent = perPage;
      currentPage = 1;
      render();
    });
  });

  render();
});
