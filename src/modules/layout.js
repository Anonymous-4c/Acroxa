/* ../src/modules/layout.js */
const { renderHead } = require("./head.js");

function renderNullLayout({ head, content, injectScript }) {
  return `
    <!DOCTYPE html>
    <html class="classic" lang="en">
      ${renderHead(head || {})}
      <body class="acrx-body hidden" id="acrx_h">
        ${content || ""}
        ${injectScript || ""}
      </body>
    </html>
  `;
}

function renderFullLayout({ head, header, sidebar, footer, content, injectScript, contentVersion }) {
  // AcroxaJS Phase 6: stamp the committed content-region version so the
  // admin client version-gates op patches from boot (the FIRST post-load
  // update can be an op-level patch, not always a full swap).
  const versionAttr = contentVersion != null
    ? ` data-acrx-content-version="${String(contentVersion)}"`
    : "";
  return `
    <!DOCTYPE html>
    <html class="classic" lang="en">
      ${renderHead(head || {})}
      <body class="acrx-body hidden" id="acrx_h">
        ${header || ""}

        <div class="col-2 open">
          ${sidebar || ""}

          <div class="w70">
            <div class="content">
              <div class="main" id="acrx-content" data-acrx-region="content"${versionAttr}>
                ${content || ""}

                <!-- ✨ Acroxa Footer Section -->
                <div class="acrx-footer" data-acrx-region="footer">
                  <div class="acrx-footer-line"></div>
                  <p class="acrx-footer-text"></p>
                  <div class="acrx-footer-line"></div>
                </div>

              </div>
            </div>
          </div>
        </div>

        ${injectScript || ""}
        ${footer || ""}
      </body>
    </html>
  `;
}

function renderLayout(options) {
  // default layout = full
  const mode = options.layout || "full";
  if (mode === "empty") return renderNullLayout(options);
  return renderFullLayout(options);
}

module.exports = { renderLayout };
