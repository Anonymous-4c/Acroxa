/**
 * Default CMS Registries
 * Dynamically populated when input is empty or searched with root terms.
 */
(() => {
  const registerDefaults = () => {
    if (!window.cmdk) return;

    window.cmdk.registerNamespace('/posts', {
      label: 'Posts',
      desc: 'Create, edit, publish, and manage blog posts',
      icon: 'fa-solid fa-newspaper',
      actions: {
        'create': {
          desc: 'Create a new blog post',
          icon: 'fa-solid fa-plus',
          action: () => {
            window.open('/acrx/posts/create', '_blank');
          }
        },
        'manage': {
          desc: 'Manage existing blog posts',
          icon: 'fa-solid fa-list',
          action: () => {
            window.open('/acrx/posts', '_blank');
          }
        }
      }
    });

    window.cmdk.registerNamespace('/pages', {
      label: 'Pages',
      desc: 'Create, edit, and manage CMS pages',
      icon: 'fa-solid fa-file',
      actions: {
        'create': {
          desc: 'Create a new CMS page',
          icon: 'fa-solid fa-plus',
          action: () => {
            window.open('/acrx/pages/create', '_blank');
          }
        },
        'list': {
          desc: 'List all CMS pages',
          icon: 'fa-solid fa-list',
          action: () => {
            window.open('/acrx/pages', '_blank');
          }
        }
      }
    });

    window.cmdk.registerNamespace('/categories', {
      label: 'Categories',
      desc: 'Create, edit, and delete post categories',
      icon: 'fa-solid fa-tag',
      actions: {
        'manage': {
          desc: 'Open category manager',
          icon: 'fa-solid fa-tags',
          action: () => {
            window.open('/acrx/categories', '_blank');
          }
        }
      }
    });

    window.cmdk.registerNamespace('/settings', {
      label: 'Settings',
      desc: 'Manage CMS settings, sections, AI, and maintenance mode',
      icon: 'fa-solid fa-gear',
      actions: {
        'general': {
          desc: 'General Configuration settings',
          icon: 'fa-solid fa-sliders',
          action: () => {
            window.open('/acrx/settings/general', '_blank');
          }
        }
      }
    });


    window.cmdk.registerNamespace('/media', {
      label: 'Media',
      desc: 'Upload, manage, rename, and delete media files',
      icon: 'fa-solid fa-photo-film',
      actions: {
        'library': {
          desc: 'Open the media library panel',
          icon: 'fa-solid fa-images',
          action: () => {
            window.open('/acrx/media', '_blank');
          }
        }
      }
    });

    window.cmdk.registerNamespace('/fonts', {
      label: 'Fonts',
      desc: 'Search, download, inject, and manage Google Fonts',
      icon: 'fa-solid fa-font',
      actions: {
        'manage': {
          desc: 'Open fonts manager',
          icon: 'fa-solid fa-font-awesome',
          action: () => {
            window.open('/acrx/layouts/fonts', '_blank');
          }
        }
      }
    });
  };

  if (window.cmdk) {
    registerDefaults();
  } else {
    const checkInterval = setInterval(() => {
      if (window.cmdk) {
        clearInterval(checkInterval);
        registerDefaults();
      }
    }, 50);
  }
})();