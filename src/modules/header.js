/* ../src/modules/header.js */

const { el } = require("../views/lib/framework");

function normalizeIcon(icon) {
  if (!icon) return "fa-circle";
  if (icon.startsWith("fa-")) return icon;
  return `fa-${icon}`;
}

function renderPluginItems() {
  const items = global.CMS?.registered?.topbar || [];

  // no user role available here – show everything, filter on client if needed
  const filtered = items.sort((a, b) => (a.order || 10) - (b.order || 10));

  return filtered
    .map((item) => {
      const label = item.label || "Item";
      const icon = normalizeIcon(item.icon);
      const link = item.action || "#";

      return el(
        "a",
        {
          href: link,
          class: `
          item acroxa-item
          ${item.hiddenOnMobile ? "hide-mobile" : ""}
          ${item.hiddenOnTablet ? "hide-tablet" : ""}
        `.trim(),
        },
        el("i", {
          class: `icon fa-duotone ${icon} acroxa-icon`,
        }),
        el("span", {}, label)
      );
    })
    .join("");
}

function renderPluginDropdown() {
  return el(
    "div",
    {
      class: "plugin-dropdown-menu acroxa-more-dropdown",
    },
    renderPluginItems()
  );
}

const cmdkIcon = `
<svg class="acroxa-icon icon" width="80px" height="80px" viewBox="0 0 1000 1000" version="1.1" id="svg1" xml:space="preserve" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">
  <defs id="defs1">
    <linearGradient id="linearGradient20">
      <stop style="stop-color:#50b3e6;stop-opacity:1;" offset="0" id="stop20"></stop>
      <stop style="stop-color:#ffffff;stop-opacity:1;" offset="1" id="stop21"></stop>
    </linearGradient>
    <linearGradient id="linearGradient18">
      <stop style="stop-color:#69b6de;stop-opacity:1;" offset="0" id="stop18"></stop>
      <stop style="stop-color:#ffffff;stop-opacity:1;" offset="0.84533054" id="stop19"></stop>
    </linearGradient>
    <linearGradient id="linearGradient15">
      <stop style="stop-color:#abdbf3;stop-opacity:1;" offset="0" id="stop15"></stop>
      <stop style="stop-color:#ffffff;stop-opacity:1;" offset="0.39432177" id="stop16"></stop>
    </linearGradient>
    <linearGradient id="linearGradient13">
      <stop style="stop-color:#ffffff;stop-opacity:1;" offset="0" id="stop13"></stop>
      <stop style="stop-color:#70cfff;stop-opacity:1;" offset="1" id="stop14"></stop>
    </linearGradient>
    <linearGradient id="linearGradient10">
      <stop style="stop-color:#a7e1fe;stop-opacity:1;" offset="0" id="stop10"></stop>
      <stop style="stop-color:#c3ebff;stop-opacity:1;" offset="1" id="stop11"></stop>
    </linearGradient>
    <linearGradient xlink:href="#linearGradient10" id="linearGradient11" x1="25.140039" y1="961.46045" x2="464.57697" y2="684.33533" gradientUnits="userSpaceOnUse"></linearGradient>
    <linearGradient xlink:href="#linearGradient13" id="linearGradient14" x1="119.62395" y1="845.11768" x2="513.92291" y2="571.47205" gradientUnits="userSpaceOnUse"></linearGradient>
    <linearGradient xlink:href="#linearGradient15" id="linearGradient16" x1="384.32697" y1="584.39825" x2="609.07471" y2="179.81903" gradientUnits="userSpaceOnUse"></linearGradient>
    <linearGradient xlink:href="#linearGradient18" id="linearGradient19" x1="584.97595" y1="308.97635" x2="844.23773" y2="705.11273" gradientUnits="userSpaceOnUse"></linearGradient>
    <linearGradient xlink:href="#linearGradient20" id="linearGradient21" x1="564.29675" y1="453.8772" x2="707.53827" y2="696.13635" gradientUnits="userSpaceOnUse"></linearGradient>
  </defs>
  <g id="layer1">
    <path id="rect6" style="display:inline;fill:url(#linearGradient14);stroke-width:0.29095" d="m 207.34223,697.13311 413.74719,-1.50694 c -6.02271,11.6332 -15.17585,24.15801 -27.96688,39.89317 -48.9384,59.51636 -121.15908,57.68519 -190.46699,58.662 l -70.9913,-1.27279 -169.34122,0.41341 c -27.61761,2.1931 -53.24572,14.27334 -81.576717,31.37972 C 56.123254,839.56919 28.881998,856.46863 6.4339869,892.0813 L 83.579137,763.49995 C 118.94409,715.51714 166.34373,700.0157 207.34223,697.13311 Z"></path>
    <path id="rect8" style="display:inline;fill:#f0f5fb;fill-opacity:1;stroke-width:0.265857" d="m 790.64406,262.29973 c 28.38359,-0.18111 96.20811,7.75933 140.12232,51.42051 39.84336,38.15142 64.13168,88.93689 64.25595,144.5759 H 790.56531 Z"></path>
    <path id="rect9" style="display:inline;fill:#a4dffd;fill-opacity:1;stroke-width:0.264583" d="m 790.74036,339.82422 c 17.99078,-0.5154 57.6339,2.47357 90.12369,34.10645 23.8357,23.2191 34.54503,51.1173 34.51986,84.33593 H 790.74036 Z"></path>
    <path id="rect10" style="display:inline;fill:url(#linearGradient11);stroke-width:0.264583" d="m 156.97909,792.78827 219.53686,-2.48047 c 0,0 56.84639,1.71647 107.54116,-2.03233 73.67232,-4.61153 115.86387,-55.44594 137.0645,-92.63317 L 562.7588,798.48421 c -35.44047,64.09183 -83.32815,87.77443 -124.12357,93.69492 L 6.4494434,892.06951 C 58.65648,806.74351 131.85112,795.53129 156.97909,792.78827 Z"></path>
    <path id="rect19" style="display:inline;fill:url(#linearGradient21);stroke-width:0.264999" d="M 513.2895,368.90381 549.97658,334.4863 705.88461,588.55807 887.50193,891.00978 781.3857,891.35777 661.03503,690.43429 489.06152,406.99971 Z"></path>
    <path id="rect18" style="display:inline;fill:url(#linearGradient19);stroke-width:0.264999" d="m 549.08791,337.73157 79.8939,-56.54732 170.82227,278.3278 198.67074,331.3996 -113.73159,0.28856 z"></path>
    <path id="rect14" style="display:inline;mix-blend-mode:normal;fill:url(#linearGradient16);stroke-width:0.264583" d="M 292.55955,413.97523 501.05469,64.078773 C 547.10411,141.19082 592.05982,217.93698 637.65608,295.31721 563.46304,309.12836 535.17916,366.0151 499.7436,424.9709 L 373.00803,635.82682 C 340.31656,569.26277 263.91387,493.81367 292.55955,413.97523 Z"></path>
    <path id="rect21" style="display:inline;fill:#2e81ac;fill-opacity:0.53815264;stroke-width:0.264999" d="m 637.6626,295.3161 c 0.007,0.0335 0.0176,0.0424 0.0259,0.0556 -17.53035,9.16194 -52.16056,40.88638 -76.05511,88.63542 -18.34513,36.6595 -18.83972,76.61312 -16.4249,116.1981 l -21.94469,-36.8684 -23.24045,-38.76113 c 21.64466,-40.41856 39.2231,-65.52064 57.48765,-84.84541 14.55734,-15.40237 29.34544,-27.33767 51.65936,-36.12427 6.14268,-2.41882 12.99602,-4.6177 20.47207,-6.52738 2.67428,-0.56234 5.33046,-1.27601 8.02013,-1.76254 z"></path>
  </g>
</svg>
`;

const DEFAULT_AVATAR = "/acrx/assets/images/default-avatar.png";

function renderProfileDropdown() {
  return el(
    "div",
    {
      class: "profile-dropdown-menu acroxa-profile-dropdown",
      id: "profile-dropdown",
    },

    // Header / user info (filled by frontend JS)
    el(
      "div",
      { class: "profile-dropdown__header" },
      el("img", {
        class: "profile-dropdown__avatar",
        src: DEFAULT_AVATAR,
        alt: "User",
        width: "40",
        height: "40",
      }),
      el(
        "div",
        { class: "profile-dropdown__meta" },
        el("div", { class: "profile-dropdown__name" }, "—"),
        el("div", { class: "profile-dropdown__role" }, "—"),
        el("div", { class: "profile-dropdown__email" }, "")
      )
    ),

    // Mini stats (filled by frontend JS)
    el(
      "div",
      { class: "profile-dropdown__stats" },
      el(
        "div",
        { class: "profile-stat" },
        el("span", { class: "profile-stat__value" }, "0"),
        el("span", { class: "profile-stat__label" }, "Posts")
      ),
      el(
        "div",
        { class: "profile-stat" },
        el("span", { class: "profile-stat__value" }, "0"),
        el("span", { class: "profile-stat__label" }, "Published")
      ),
      el(
        "div",
        { class: "profile-stat" },
        el("span", { class: "profile-stat__value" }, "0"),
        el("span", { class: "profile-stat__label" }, "Drafts")
      ),
      el(
        "div",
        { class: "profile-stat" },
        el("span", { class: "profile-stat__value" }, "0"),
        el("span", { class: "profile-stat__label" }, "Pages")
      ),
      el(
        "div",
        { class: "profile-stat" },
        el("span", { class: "profile-stat__value" }, "0"),
        el("span", { class: "profile-stat__label" }, "Categories")
      )
    ),

    // Actions
    el(
      "div",
      { class: "profile-dropdown__actions" },
      el(
        "a",
        {
          href: "/acrx/profile",
          class: "profile-dropdown__item",
        },
        el("i", { class: "icon fa-duotone fa-user-circle acroxa-icon" }),
        el("span", {}, "Profile")
      ),
      el(
        "a",
        {
          href: "/acrx/notifications",
          class: "profile-dropdown__item",
        },
        el("i", { class: "icon fa-duotone fa-bell acroxa-icon" }),
        el("span", {}, "Notifications")
      ),
      el(
        "a",
        {
          href: "/acrx/logout",
          class: "profile-dropdown__item profile-dropdown__item--danger",
        },
        el("i", {
          class: "icon fa-duotone fa-right-from-bracket acroxa-icon",
        }),
        el("span", {}, "Logout")
      )
    )
  );
}

function renderHeader() {
  return el(
    "div",
    { class: "header acroxa-header" },

    el(
      "div",
      { class: "top-bar acroxa-top-bar" },

      // LEFT — only hamburger + Preview
      el(
        "div",
        { class: "top-left d-flex flex-row" },

        el(
          "a",
          {
            href: "#",
            class: "hamburger item acroxa-hamburger acroxa-item tooltip",
            dataTitle: "Toggle sidebar ( Ctrl + . )",
          },
          el("i", {
            class: "icon fa-duotone fa-sidebar acroxa-icon",
          })
        ),

        el(
          "menu",
          { class: "d-flex flex-row acroxa-menu acroxa-left-menu" },

          el(
            "a",
            {
              href: "/",
              target: "_blank",
              class: "item acroxa-item",
            },
            el("i", {
              class: "icon fa-duotone fa-compass acroxa-icon",
            }),
            el("span", {}, "Preview")
          )
        )
      ),

      // CENTER
      el(
        "div",
        { class: "top-center" },

        el(
          "div",
          {
            class: "cmdk-trigger acroxa-cmdk-trigger",
            id: "cmd-pallete-wrap",
            role: "combobox",
            ariaExpanded: "false",
            ariaHaspopup: "listbox",
          },

          el("div", { class: "cmdk-trigger__icon" }, cmdkIcon),

          el(
            "div",
            { class: "cmdk-input-wrap" },
            el("span", {
              contenteditable: "true",
              class: "cmdk-editor",
              role: "textbox",
              ariaMultiline: "false",
              spellcheck: "false",
              autocomplete: "off",
              dataPlaceholder: "Search",
              dataEmpty: "true",
            })
          ),

          el(
            "div",
            { class: "cmdk-shortcut-wrap" },
            el("kbd", { class: "cmdk-shortcut" }, " Ctrl K ")
          ),

          el(
            "div",
            { class: "cmdk-wrap" },

            el("div", {
              class: "cmdk-dropdown",
              style: "display: block;",
            }),

            el(
              "div",
              { class: "cmdk-footer" },

              el(
                "div",
                { class: "cmdk-footer__hint" },
                el("kbd", {}, "↑↓"),
                " navigate"
              ),

              el(
                "div",
                { class: "cmdk-footer__hint" },
                el("kbd", {}, "↵"),
                " execute"
              ),

              el(
                "div",
                { class: "cmdk-footer__hint" },
                el("kbd", {}, "Tab"),
                " autocomplete"
              ),

              el(
                "div",
                { class: "cmdk-footer__hint" },
                el("kbd", {}, "Esc"),
                " close"
              )
            )
          ),

          el("div", {
            class: "cmdk-status",
            style: "display: none;",
          })
        )
      ),

      // RIGHT — notifications + profile avatar + plugin menu
      el(
        "div",
        { class: "top-right d-flex flex-row" },

        // Plugin / more menu button
        el(
          "button",
          {
            class: "plugin-dropdown-btn item acroxa-item tooltip",
            dataTitle: "Toggle Menu ( Ctrl + M )",
            type: "button",
          },
          el("i", {
            class: "icon fa-solid fa-ellipsis acroxa-icon",
          })
        ),
        // Profile avatar button (filled by frontend JS)
        el(
          "button",
          {
            class: "profile-btn item acroxa-item tooltip",
            dataTitle: "Profile",
            id: "profile-btn",
            type: "button",
          },
          el("img", {
            class: "profile-btn__avatar",
            src: DEFAULT_AVATAR,
            alt: "User",
            width: "28",
            height: "28",
          })
        )
      )
    ),

    el("script", { src: "/acrx/assets/js/cmdk/index.js" }),

    renderPluginDropdown(),
    renderProfileDropdown()
  );
}

module.exports = { renderHeader };