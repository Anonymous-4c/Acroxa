// src/views/createUser.js
// Dedicated Create User page — admin only, full layout.

const { el, Toggle } = require("./lib/framework");

// ── Meta registration ────────────────────────────────────────────────────────
module.exports.meta = [
  {
    path: "/acrx/users/create",
    render: "renderCreateUser",
    title: "Create User - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-users.css"
    ],
    js: [],
    layout: "full",
    // header/sidebar/footer inherited from "full" layout in the route loader
  }
];

// ── Renderer ─────────────────────────────────────────────────────────────────
function renderCreateUser(req, res) {
  const roleOptions = [
    { label: "User",      value: "user"      },
    { label: "Author",    value: "author"    },
    { label: "Editor",    value: "editor"    },
    { label: "SEO",       value: "seo"       },
    { label: "Designer",  value: "designer"  },
    { label: "Developer", value: "developer" }
  ];

  const statusOptions = [
    { label: "Active",    value: "active"    },
    { label: "Suspended", value: "suspended" }
  ];

  const field = (id, label, type = "text", placeholder = "") =>
    el("div", { class: "field" },
      el("label", { for: id }, label),
      el("input", { type, id, name: id, placeholder: placeholder || label })
    );

  const textarea = (id, label, placeholder = "") =>
    el("div", { class: "field" },
      el("label", { for: id }, label),
      el("textarea", { id, name: id, rows: "3", placeholder: placeholder || label })
    );

  const sectionRequired = el("fieldset", {},
    el("legend", {}, "Account"),
    field("username",        "Username"),
    field("email",           "Email",            "email"),
    field("password",        "Password",         "password"),
    field("confirmPassword", "Confirm Password", "password")
  );

  const sectionRole = el("fieldset", {},
    el("legend", {}, "Role & Status"),
    el("div", { class: "field" },
      el("label", {}, "Role"),
      el("select", { id: "role", name: "role" },
        ...roleOptions.map(o => el("option", { value: o.value }, o.label))
      )
    ),
    el("div", { class: "field" },
      el("label", {}, "Account Status"),
      el("select", { id: "accountStatus", name: "accountStatus" },
        ...statusOptions.map(o => el("option", { value: o.value }, o.label))
      )
    )
  );

  const sectionProfile = el("fieldset", {},
    el("legend", {}, "Profile"),
    field("fullName",   "Full Name"),
    field("jobTitle",   "Job Title"),
    field("phone",      "Phone",      "tel"),
    field("location",   "Location"),
    field("department", "Department"),
    field("website",    "Website",    "url"),
    textarea("bio", "Bio", "Short bio…")
  );

  const sectionSocial = el("fieldset", {},
    el("legend", {}, "Social Links"),
    field("socialTwitter",  "Twitter / X"),
    field("socialLinkedin", "LinkedIn"),
    field("socialGithub",   "GitHub"),
    field("socialWebsite",  "Personal Website", "url")
  );

  const sectionSkills = el("fieldset", {},
    el("legend", {}, "Skills"),
    el("div", { class: "field" },
      el("label", { for: "skills" }, "Skills (comma-separated)"),
      el("input", { type: "text", id: "skills", name: "skills",
        placeholder: "e.g. JavaScript, SEO, Design" })
    )
  );

  const profilePicField = el("fieldset", {},
    el("legend", {}, "Profile Picture"),
    el("div", { class: "field" },
      el("input", { type: "file", id: "profilePicFile", name: "profilePicFile", accept: "image/*" })
    ),
    el("div", { id: "profilePreview", style: "margin-top:8px;" })
  );

  const submitBtn = el("div", { class: "field" },
    el("button", { id: "createBtn", type: "button" }, "Create User")
  );

  const resultPre = el("pre", { id: "out",
    style: "white-space:pre-wrap;word-break:break-all;margin-top:1rem;" });

  const form = el("form", { id: "createUserForm" },
    sectionRequired,
    sectionRole,
    sectionProfile,
    sectionSocial,
    sectionSkills,
    profilePicField,
    submitBtn
  );

  const script = `<script>
(function () {
  const picInput   = document.getElementById("profilePicFile");
  const picPreview = document.getElementById("profilePreview");

  picInput?.addEventListener("change", () => {
    const file = picInput.files[0];
    if (!file) { picPreview.innerHTML = ""; return; }
    const url = URL.createObjectURL(file);
    picPreview.innerHTML =
      '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:50%;">';
  });

  document.getElementById("createBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("createBtn");
    const out  = document.getElementById("out");
    btn.disabled    = true;
    btn.textContent = "Creating…";
    out.textContent = "";

    const formData = new FormData(document.getElementById("createUserForm"));

    // Skills: comma string → repeated array entries
    const skillsRaw = formData.get("skills") || "";
    formData.delete("skills");
    skillsRaw.split(",").map(s => s.trim()).filter(Boolean)
      .forEach(s => formData.append("skills[]", s));

    // Social links → JSON string
    const socialLinks = {
      twitter:  formData.get("socialTwitter")  || "",
      linkedin: formData.get("socialLinkedin") || "",
      github:   formData.get("socialGithub")   || "",
      website:  formData.get("socialWebsite")  || ""
    };
    ["socialTwitter","socialLinkedin","socialGithub","socialWebsite"]
      .forEach(k => formData.delete(k));
    formData.append("socialLinks", JSON.stringify(socialLinks));

    try {
      const res = await fetch("/acr/api/create-user", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      const data = await res.json();
      out.textContent = JSON.stringify(data, null, 2);
      if (data.success) {
        document.getElementById("createUserForm").reset();
        picPreview.innerHTML = "";
      }
    } catch (err) {
      out.textContent = "Connection error: " + err.message;
    } finally {
      btn.disabled    = false;
      btn.textContent = "Create User";
    }
  });
})();
</script>`;

  return el("div", { style: "max-width:640px;margin:0 auto;padding:2rem 1rem;" },
    el("h2", {}, "Create User"),
    form,
    resultPre,
    script
  );
}

module.exports.renderCreateUser = renderCreateUser;