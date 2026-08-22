/* ../src/modules/sidebar.js */
const fs = require("fs");
const path = require("path");

function renderSidebar(user, currentPath = "") {
  const menuPath = path.join(__dirname, "../../config/menu.json");
  let menuData;

  try {
    menuData = JSON.parse(fs.readFileSync(menuPath, "utf-8"));
  } catch (err) {
    console.error("Failed to load menu.json:", err);
    menuData = { main: [], extra: [] };
  }

  const userRole = user?.role || "user";


if (global.CMS && global.CMS.registered?.menus?.length) {

  
  const filteredMenus = global.CMS.registered.menus.filter(item => {
    if (!item.allowedRoles || item.allowedRoles.length === 0) return true;
    return userRole && item.allowedRoles.includes(userRole);
  });

  
  filteredMenus.sort((a, b) => (a.order || 10) - (b.order || 10));

  
  for (const item of filteredMenus) {
    if (item.parent) {
      let parentItem = findMenuItem(menuData.main, item.parent);

      if (parentItem) {
        parentItem.submenu = parentItem.submenu || [];

        parentItem.submenu.push({
          label: item.label,
          link: item.link,
          icon: normalizeIcon(item.icon),
          plugin: item.plugin,
          order: item.order || 10,
        });

        
        parentItem.submenu.sort((a, b) => (a.order || 10) - (b.order || 10));
      } else {
        console.warn(`⚠️ Parent menu "${item.parent}" not found for ${item.label}`);
      }

    } else {
      menuData.main.push({
        label: item.label,
        icon: normalizeIcon(item.icon),
        link: item.link,
        plugin: item.plugin,
        order: item.order || 10,
      });
    }
  }

  
  menuData.main.sort((a, b) => (a.order || 10) - (b.order || 10));
}

  let html = `
  <div class="w30 acroxa-sidebar wrap-sidebar">
  <sidebar class="w30 acroxa-sidebar" id="sidebar">
    <div class="d-flex flex-col sidebar acroxa-sidebar-container">
      <e class="branding tabs acroxa-branding">
<svg
   width="80px"
   height="80px"
   viewBox="0 0 1000 1000"
   version="1.1"
   id="svg1"
   xml:space="preserve"
   xmlns:xlink="http://www.w3.org/1999/xlink"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg"><defs
     id="defs1"><linearGradient
       id="linearGradient20"><stop
         style="stop-color:#50b3e6;stop-opacity:1;"
         offset="0"
         id="stop20" /><stop
         style="stop-color:#ffffff;stop-opacity:1;"
         offset="1"
         id="stop21" /></linearGradient><linearGradient
       id="linearGradient18"><stop
         style="stop-color:#69b6de;stop-opacity:1;"
         offset="0"
         id="stop18" /><stop
         style="stop-color:#ffffff;stop-opacity:1;"
         offset="0.84533054"
         id="stop19" /></linearGradient><linearGradient
       id="linearGradient15"><stop
         style="stop-color:#abdbf3;stop-opacity:1;"
         offset="0"
         id="stop15" /><stop
         style="stop-color:#ffffff;stop-opacity:1;"
         offset="0.39432177"
         id="stop16" /></linearGradient><linearGradient
       id="linearGradient13"><stop
         style="stop-color:#ffffff;stop-opacity:1;"
         offset="0"
         id="stop13" /><stop
         style="stop-color:#70cfff;stop-opacity:1;"
         offset="1"
         id="stop14" /></linearGradient><linearGradient
       id="linearGradient10"><stop
         style="stop-color:#a7e1fe;stop-opacity:1;"
         offset="0"
         id="stop10" /><stop
         style="stop-color:#c3ebff;stop-opacity:1;"
         offset="1"
         id="stop11" /></linearGradient><linearGradient
       xlink:href="#linearGradient10"
       id="linearGradient11"
       x1="25.140039"
       y1="961.46045"
       x2="464.57697"
       y2="684.33533"
       gradientUnits="userSpaceOnUse" /><linearGradient
       xlink:href="#linearGradient13"
       id="linearGradient14"
       x1="119.62395"
       y1="845.11768"
       x2="513.92291"
       y2="571.47205"
       gradientUnits="userSpaceOnUse" /><linearGradient
       xlink:href="#linearGradient15"
       id="linearGradient16"
       x1="384.32697"
       y1="584.39825"
       x2="609.07471"
       y2="179.81903"
       gradientUnits="userSpaceOnUse" /><linearGradient
       xlink:href="#linearGradient18"
       id="linearGradient19"
       x1="584.97595"
       y1="308.97635"
       x2="844.23773"
       y2="705.11273"
       gradientUnits="userSpaceOnUse" /><linearGradient
       xlink:href="#linearGradient20"
       id="linearGradient21"
       x1="564.29675"
       y1="453.8772"
       x2="707.53827"
       y2="696.13635"
       gradientUnits="userSpaceOnUse" /></defs><g
     id="layer1"><path
       id="rect6"
       style="display:inline;fill:url(#linearGradient14);stroke-width:0.29095"
       d="m 207.34223,697.13311 413.74719,-1.50694 c -6.02271,11.6332 -15.17585,24.15801 -27.96688,39.89317 -48.9384,59.51636 -121.15908,57.68519 -190.46699,58.662 l -70.9913,-1.27279 -169.34122,0.41341 c -27.61761,2.1931 -53.24572,14.27334 -81.576717,31.37972 C 56.123254,839.56919 28.881998,856.46863 6.4339869,892.0813 L 83.579137,763.49995 C 118.94409,715.51714 166.34373,700.0157 207.34223,697.13311 Z" /><path
       id="rect8"
       style="display:inline;fill:#f0f5fb;fill-opacity:1;stroke-width:0.265857"
       d="m 790.64406,262.29973 c 28.38359,-0.18111 96.20811,7.75933 140.12232,51.42051 39.84336,38.15142 64.13168,88.93689 64.25595,144.5759 H 790.56531 Z" /><path
       id="rect9"
       style="display:inline;fill:#a4dffd;fill-opacity:1;stroke-width:0.264583"
       d="m 790.74036,339.82422 c 17.99078,-0.5154 57.6339,2.47357 90.12369,34.10645 23.8357,23.2191 34.54503,51.1173 34.51986,84.33593 H 790.74036 Z" /><path
       id="rect10"
       style="display:inline;fill:url(#linearGradient11);stroke-width:0.264583"
       d="m 156.97909,792.78827 219.53686,-2.48047 c 0,0 56.84639,1.71647 107.54116,-2.03233 73.67232,-4.61153 115.86387,-55.44594 137.0645,-92.63317 L 562.7588,798.48421 c -35.44047,64.09183 -83.32815,87.77443 -124.12357,93.69492 L 6.4494434,892.06951 C 58.65648,806.74351 131.85112,795.53129 156.97909,792.78827 Z" /><path
       id="rect19"
       style="display:inline;fill:url(#linearGradient21);stroke-width:0.264999"
       d="M 513.2895,368.90381 549.97658,334.4863 705.88461,588.55807 887.50193,891.00978 781.3857,891.35777 661.03503,690.43429 489.06152,406.99971 Z" /><path
       id="rect18"
       style="display:inline;fill:url(#linearGradient19);stroke-width:0.264999"
       d="m 549.08791,337.73157 79.8939,-56.54732 170.82227,278.3278 198.67074,331.3996 -113.73159,0.28856 z" /><path
       id="rect14"
       style="display:inline;mix-blend-mode:normal;fill:url(#linearGradient16);stroke-width:0.264583"
       d="M 292.55955,413.97523 501.05469,64.078773 C 547.10411,141.19082 592.05982,217.93698 637.65608,295.31721 563.46304,309.12836 535.17916,366.0151 499.7436,424.9709 L 373.00803,635.82682 C 340.31656,569.26277 263.91387,493.81367 292.55955,413.97523 Z" /><path
       id="rect21"
       style="display:inline;fill:#2e81ac;fill-opacity:0.53815264;stroke-width:0.264999"
       d="m 637.6626,295.3161 c 0.007,0.0335 0.0176,0.0424 0.0259,0.0556 -17.53035,9.16194 -52.16056,40.88638 -76.05511,88.63542 -18.34513,36.6595 -18.83972,76.61312 -16.4249,116.1981 l -21.94469,-36.8684 -23.24045,-38.76113 c 21.64466,-40.41856 39.2231,-65.52064 57.48765,-84.84541 14.55734,-15.40237 29.34544,-27.33767 51.65936,-36.12427 6.14268,-2.41882 12.99602,-4.6177 20.47207,-6.52738 2.67428,-0.56234 5.33046,-1.27601 8.02013,-1.76254 z" /></g></svg>
      </e>
      <e class="icon-brand branding tabs acroxa-icon-brand" style="display: none;">A</e>
      <e class="tabs acroxa-tabs acroxa-search-wrapper">
        <search class="sc-lx acroxa-search">
          <input type="text" id="src_acroxa" placeholder="Search" class="acroxa-search-input">
          <div class="icon acroxa-search-icon svg-inline--fa fa-magnifying-glass acroxa-icon icon">
            <i class="fa-duotone fa-magnifying-glass acroxa-icon icon" aria-hidden="true"></i>
          </div>
        </search>
        <div class="src-lx-sug sug-lx-wrap">
          <div class="src-sug" id="src_sug_list"></div>
        </div>
      </e>
    </div>
    <menu class="menu-side main-menu d-flex flex-col acroxa-main-menu">
      <div class="menu-side main-menu d-flex flex-col acroxa-menu-group">`;

  
  menuData.main.forEach(item => {
    const allowed = !item.allowedRoles || item.allowedRoles.includes(userRole);
    if (!allowed) return;

    const icon = normalizeIcon(item.icon);
    const isActive = currentPath === item.link || currentPath.startsWith(item.link + "/") || currentPath.startsWith(item.link + "?");

    if (item.submenu && item.submenu.length > 0) {
      const filteredSubmenu = item.submenu.filter(sub => 
        !sub.allowedRoles || sub.allowedRoles.includes(userRole)
      );

      if (filteredSubmenu.length === 0) return;

      const hasActiveSub = filteredSubmenu.some(sub => 
        currentPath === sub.link || currentPath.startsWith(sub.link + "/") || currentPath.startsWith(sub.link + "?")
      );

      html += `
        <div class="item has-sub acroxa-item acroxa-has-sub ${hasActiveSub || isActive ? 'active' : ''}" data-link="${item.link}">
          <i class="accent fa-duotone fa ${icon} icon acroxa-icon"></i>
          <span class="acroxa-label">${item.label}</span>
          <div class="submenu d-flex flex-col acroxa-submenu">
            <div class="submenu d-flex flex-col acroxa-submenu-inner">
              ${filteredSubmenu.map(sub => {
                const subActive = currentPath === sub.link || currentPath.startsWith(sub.link + "/") || currentPath.startsWith(sub.link + "?");
                return `<a href="${sub.link}" class="sub-item acroxa-sub-item ${subActive ? 'active' : ''}">${sub.label}</a>`;
              }).join("")}
            </div>
          </div>
        </div>`;
    } else {
      html += `
        <a href="${item.link}" class="item acroxa-item ${isActive ? 'active' : ''}">
          <i class="accent fa-duotone fa ${icon} icon acroxa-icon"></i>
          <span class="acroxa-label">${item.label}</span>
        </a>`;
    }
  });

  html += `
      </div>
    </menu>`;

  
  if (menuData.extra && menuData.extra.length > 0) {
    html += `
    <menu class="menu-side d-flex flex-col est acroxa-extra-menu">`;
    menuData.extra.forEach(item => {
      const allowed = !item.allowedRoles || item.allowedRoles.includes(userRole);
      if (allowed && userRole !== "user") {
        const icon = normalizeIcon(item.icon);
        const isActive = currentPath === item.link || currentPath.startsWith(item.link + "/") || currentPath.startsWith(item.link + "?");
        html += `
        <a href="${item.link}" class="item acroxa-extra-item ${isActive ? 'active' : ''}">
          <i class="accent fa-duotone fa ${icon} icon acroxa-icon"></i>
          <span class="acroxa-label">${item.label}</span>
        </a>`;
      }
    });
    html += `</menu>`;
  }

  html += `
  </sidebar></div>`;
  return html;
}

/* ✅ Helper: recursive search for parent menu */
function findMenuItem(menuArray, label) {
  for (const item of menuArray) {
    if (item.label === label) return item;
    if (item.submenu) {
      const found = findMenuItem(item.submenu, label);
      if (found) return found;
    }
  }
  return null;
}

/* ✅ Auto add fa- prefix if missing */
function normalizeIcon(icon) {
  if (!icon) return "fa-circle";
  if (icon.startsWith("fa-")) return icon;
  return `fa-${icon}`;
}

module.exports = { renderSidebar };