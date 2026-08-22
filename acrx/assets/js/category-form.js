/* ../acrx/assets/js/category-form.js */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("category-form");
  const backBtn = document.querySelector(".btn-cancel");

  // ---------- BACK BUTTON ----------
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }

  // ---------- FORM SUBMIT ----------
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = form.name.value.trim();
      const slug = form.slug.value.trim();
      const description = form.description.value.trim();

      if (!name) return alert("Category name is required");

      const payload = { name, slug, description };

      try {
        const isEdit = !!form.dataset.editId;
        const url = isEdit
          ? `/acr/api/categories/${form.dataset.editId}`
          : "/acr/api/categories";

        const method = isEdit ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("acroxa_token")}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          alert(`Category ${isEdit ? "updated" : "created"} successfully`);
          window.location.href = "/acrx/categories";
        } else {
          alert(data.message || "Something went wrong");
        }
      } catch (err) {
        console.error(err);
        alert("Error submitting form");
      }
    });
  }
});
