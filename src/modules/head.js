/* ../src/modules/head.js */

function renderHead({
  title = "Acroxa Admin",
  styles = [],
  scripts = [],
  meta = [],
  mainjs = true,
  maincss = true,
}) {
  // Helper to render attributes from object or boolean-true shorthand
  const renderAttrs = (obj) => {
    if (!obj || typeof obj !== "object") return "";
    return Object.entries(obj)
      .map(([key, value]) => {
        if (value === true) return key; // e.g., defer: true → defer
        if (value === false || value == null) return ""; // skip false/null
        return `${key}="${escapeHtml(String(value))}"`;
      })
      .filter(Boolean)
      .join(" ");
  };
  const loader = `
  

      `;
  
  // Simple HTML escape for safety (since we're building HTML strings)
  const escapeHtml = (str) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  // Render <link> tags (support string or object)
  const styleTags = styles
    .map((style) => {
      if (typeof style === "string") {
        return `<link rel="stylesheet" href="${escapeHtml(style)}">`;
      }
      const attrs = renderAttrs(style);
      // Ensure href is present for objects
      if (!style.href) {
        console.warn("Style object missing 'href':", style);
        return "";
      }
      return `<link ${attrs}>`;
    })
    .join("\n      ");

  // Render <script> tags (support string or object)
  const scriptTags = scripts
    .map((script) => {
      if (typeof script === "string") {
        return `<script src="${escapeHtml(script)}"></script>`;
      }
      const attrs = renderAttrs(script);
      if (!script.src) {
        console.warn("Script object missing 'src':", script);
        return "";
      }
      return `<script ${attrs}></script>`;
    })
    .join("\n      ");
    let maincssfiles = [];
    const css =        `<link rel="stylesheet" href="/acrx/assets/css/ad-c.css">
      <link rel="stylesheet" href="/acrx/assets/css/ad-ds.css">
      <link rel="stylesheet" href="/acrx/assets/css/ad-st.css">
      <link rel="stylesheet" href="/acrx/assets/css/ad-ps.css">`;
      if (maincss == true)
         maincssfiles = css;

  return `
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
            <script src="/acrx/assets/js/loader.js"></script>
<link rel="icon" href="/acrx/assets/images/iconLight.svg" media="(prefers-color-scheme: light)">
<link rel="icon" href="/acrx/assets/images/icon.svg" media="(prefers-color-scheme: dark)">

      <!-- Default CSS -->
      ${maincssfiles}
      <link rel="stylesheet" href="/acrx/assets/css/root.css">
      <link rel="stylesheet" href="/acrx/assets/css/all.css">
      <link rel="stylesheet" href="/acrx/assets/css/sharp-regular.css">
      
      <script src="/acrx/assets/js/utils.js"></script>
      <script src="/acrx/assets/js/all.js"></script>
      
      <script src="http://localhost:35729/livereload.js"></script>
      ${mainjs ? `<script src="/acrx/assets/js/main.js"></script>` : ""}
      <script src="/acrx/assets/js/system/_shared.js"></script>



      <!-- Extra Meta -->
      ${meta
        .map((tag) => {
          if (typeof tag === "string") return `<meta ${tag}>`;
          const attrs = renderAttrs(tag);
          return `<meta ${attrs}>`;
        })
        .join("\n      ")}

      <!-- Page-specific Styles -->
      ${styleTags}

      <!-- Page-specific Scripts -->
      ${scriptTags}
            <script type="module" src="/acrx/assets/js/init.js"></script>
    </head>
  `.trim();
}

module.exports = { renderHead };