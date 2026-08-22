document.addEventListener("DOMContentLoaded", () => {
  const module = document.createElement('script');
  module.type = 'module';
  module.src = '/acrx/assets/js/menuManager.js';
  module.onload = () => console.info('[menus] module loaded');
  module.onerror = (err) => console.error('[menus] module load error', err);
  document.body.appendChild(module);  
})