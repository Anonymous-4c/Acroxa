document.addEventListener("DOMContentLoaded", () => {
	if (!document.querySelector('link[href*="font-awesome"]')) {
		const fa = document.createElement('link');
		fa.rel = 'stylesheet';
		fa.href = '/acrx/assets/css/ad-media-player.css';
		document.head.appendChild(fa);
	}
    const UploadEngine = {
    queue: [],
    active: new Map(),
    paused: false,
    concurrency: 3,

    add(task) {
        this.queue.push(task);
        this.run();
    },

    pause() {
        this.paused = true;
    },

    resume() {
        this.paused = false;
        this.run();
    },

    async run() {
        if (this.paused) return;

        while (this.active.size < this.concurrency && this.queue.length) {
        const task = this.queue.shift();
        this.execute(task);
        }
    },

    async execute(task) {
        const id = task.id;
        this.active.set(id, true);

        try {
        await task.run((p) => task.onProgress?.(p));
        task.onComplete?.();
        } catch (e) {
        task.onFail?.(e);

        // retry system
        if ((task.retries || 0) < 2) {
            task.retries = (task.retries || 0) + 1;
            this.queue.push(task);
        }
        }

        this.active.delete(id);
        this.run();
    }
    };
	const uploadBtn = document.getElementById("upload-btn");
	const uploadInput = document.getElementById("upload-input");
	const mediaGrid = document.getElementById("media-grid");
	const searchInput = document.getElementById("search-media");
	const regenThumbsBtn = document.getElementById("regen-thumbs-btn");
	const playerModal = document.createElement('div');
	playerModal.id = 'acr-media-player-modal';
	playerModal.innerHTML = `
    <div class="acr-modal-wrap" id="acr-modal-wrap">
      <button class="acr-modal-close" id="acr-modal-close"><i class="fas fa-times"></i></button>
      <div class="acr-modal-player" id="acr-modal-player"></div>
      <div class="acr-modal-infobar" id="acr-modal-infobar" style="display:none">
        <div class="acr-mi-icon" id="acr-mi-icon"><i class="fas fa-file"></i></div>
        <div class="acr-mi-meta">
          <div class="acr-mi-name" id="acr-mi-name">—</div>
          <div class="acr-mi-details" id="acr-mi-details">—</div>
        </div>
        <div class="acr-mi-actions">
          <button class="acr-mi-btn acr-btn-copy"   id="acr-mi-copy">  <i class="fas fa-link"></i>   Copy Link</button>
          <button class="acr-mi-btn acr-btn-rename"  id="acr-mi-rename"><i class="fas fa-pen"></i>    Rename</button>
          <button class="acr-mi-btn acr-btn-dl"      id="acr-mi-dl">   <i class="fas fa-download"></i>Download</button>
          <button class="acr-mi-btn acr-btn-del"     id="acr-mi-del">  <i class="fas fa-trash"></i>   Delete</button>
        </div>
      </div>
    </div>
  `;
	document.body.appendChild(playerModal);
	const renameOverlay = document.createElement('div');
	renameOverlay.className = 'acr-rename-overlay';
	renameOverlay.innerHTML = `
    <div class="acr-rename-box">
      <div class="acr-rename-title"><i class="fas fa-pen"></i> Rename File</div>
      <div class="acr-rename-sub" id="acr-ren-sub">Enter a new name for the file.</div>
      <input class="acr-rename-input" id="acr-ren-input" type="text" placeholder="New filename..." autocomplete="off" spellcheck="false">
      <div class="acr-rename-error" id="acr-ren-err"></div>
      <div class="acr-rename-actions">
        <button class="acr-rename-cancel"  id="acr-ren-cancel">Cancel</button>
        <button class="acr-rename-confirm" id="acr-ren-ok">Rename</button>
      </div>
    </div>
  `;
	document.body.appendChild(renameOverlay);
		let deleteConfirmCleanup = null; 
	const modalPlayer = document.getElementById('acr-modal-player');
	const infoBar = document.getElementById('acr-modal-infobar');
	const miIcon = document.getElementById('acr-mi-icon');
	const miName = document.getElementById('acr-mi-name');
	const miDetails = document.getElementById('acr-mi-details');
	const miCopy = document.getElementById('acr-mi-copy');
	const miRename = document.getElementById('acr-mi-rename');
	const miDl = document.getElementById('acr-mi-dl');
	const miDel = document.getElementById('acr-mi-del');
	const renInput = document.getElementById('acr-ren-input');
	const renErr = document.getElementById('acr-ren-err');
	const renOk = document.getElementById('acr-ren-ok');
	const renCancel = document.getElementById('acr-ren-cancel');
	const renSub = document.getElementById('acr-ren-sub');
	let currentFile = null;
	let activeAudio = null;
	playerModal.addEventListener('click', (e) => {
		if (e.target === playerModal) closePlayerModal();
	});
	document.getElementById('acr-modal-close').addEventListener('click', closePlayerModal);
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			if (renameOverlay.classList.contains('open')) closeRenamePopup();
			else if (playerModal.classList.contains('open')) closePlayerModal();
		}
	});

// Duration must match the longest CSS closing transition (acr-closing)
const MODAL_CLOSE_DURATION = 260; // ms

/**
 * Kicks off the closing animation, then does the real teardown
 * once the transition finishes.  Safe to call multiple times.
 */
function closePlayerModal() {
  if (!playerModal.classList.contains('open')) return;

  // Prevent double-triggers while animating out
  if (playerModal.classList.contains('acr-closing')) return;

  // Clean up delete-confirm state if active
  if (deleteConfirmCleanup) deleteConfirmCleanup();

  // Trigger CSS exit animation
  playerModal.classList.add('acr-closing');

  setTimeout(() => {
    // Hard-remove both classes now that animation is done
    playerModal.classList.remove('open', 'acr-closing');

    // Tear down media
    playerModal.querySelectorAll('video').forEach(m => {
      m.pause();
      m.src = '';
    });
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.src = '';
      activeAudio = null;
    }

    modalPlayer.innerHTML = '';
    infoBar.style.display = 'none';
    currentFile = null;
  }, MODAL_CLOSE_DURATION);
}
function revealModal() {
  // If a close animation is in flight, abort it cleanly first
  playerModal.classList.remove('acr-closing');

  // Ensure display:flex is active (the .open class sets this)
  // but hold opacity/transform at their "hidden" values for one frame
  // so the browser registers the transition start point.
  playerModal.classList.add('open');

  // Force the browser to acknowledge the starting state before
  // applying the end state (prevents the transition from being skipped)
  void playerModal.offsetWidth; // intentional reflow
}

// Helper - splits filename into name + extension (extension includes the dot)
function splitNameAndExt(filename) {
    if (!filename) return { name: '', ext: '' };
    const lastDot = filename.lastIndexOf('.');
    if (lastDot <= 0) return { name: filename, ext: '' }; // no extension or .hiddenfile
    return {
        name: filename.substring(0, lastDot),
        ext: filename.substring(lastDot)   // includes the dot
    };
}

function openRenamePopup(file) {
    const { name, ext } = splitNameAndExt(file.name);
    
    // Store extension in a place we can access later (you can also use a data attribute or closure)
    renInput.dataset.originalExt = ext;
    
    renInput.value = name;               // only the name part
    renErr.innerHTML = '';
    renSub.textContent = `Current name: ${file.name}`;
    renOk.disabled = false;
    renameOverlay.classList.add('open');
    
    setTimeout(() => {
        renInput.focus();
        renInput.select();
    }, 80);
}

function closeRenamePopup() {
    renameOverlay.classList.remove('open');
    renErr.innerHTML = '';
    // Optional: clean up
    delete renInput.dataset.originalExt;
}

renCancel.addEventListener('click', closeRenamePopup);
renameOverlay.addEventListener('click', (e) => {
    if (e.target === renameOverlay) closeRenamePopup();
});

renInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRename();
    renErr.innerHTML = '';
});

renOk.addEventListener('click', doRename);

async function doRename() {
    const baseName = renInput.value.trim();
    const originalExt = renInput.dataset.originalExt || '';

    if (!baseName) {
        showRenErr('Please enter a filename.');
        return;
    }

    const newFullName = baseName + originalExt;
    
    if (newFullName === currentFile.name) {
        showRenErr('That is already the current name.');
        return;
    }

    // Still block completely invalid characters (Windows-style restrictions)
    if (/[\\/:*?"<>|]/.test(newFullName)) {
        showRenErr('<i class="fas fa-triangle-exclamation"></i> Name contains invalid characters.');
        return;
    }

    renOk.disabled = true;
    renOk.textContent = 'Renaming...';

    try {
        const res = await authFetch("/acr/api/media/rename-file", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                oldName: currentFile.name,
                newName: newFullName
            })
        });

        const data = await res.json();
        if (data.success) {
            const gridItem = document.querySelector(`[data-filename="${CSS.escape(currentFile.name)}"]`);
            if (gridItem) {
                gridItem.dataset.name = newFullName;
                gridItem.dataset.filename = newFullName;
                const infoEl = gridItem.querySelector('.info');
                if (infoEl) infoEl.textContent = newFullName;
            }

            currentFile.name = newFullName;
            miName.textContent = newFullName;
            miDetails.textContent = buildDetails(currentFile);
            miIcon.innerHTML = `<i class="fas ${getFileIconClass(getExt(newFullName), currentFile.type||'')}"></i>`;

            closeRenamePopup();
        } else {
            showRenErr(data.message || 'Rename failed.');
        }
    } catch (err) {
        showRenErr('Network error: ' + err.message);
    }

    renOk.disabled = false;
    renOk.textContent = 'Rename';
}

function showRenErr(msg) {
    renErr.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${msg}`;
}

function getExt(filename) {
    return (filename || '').split('.').pop().toLowerCase();
}

	function getFileIconClass(ext, mime = '') {
		if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'mid', 'midi'].includes(ext)) return 'fa-music';
		if (['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'flv', 'wmv', '3gp'].includes(ext)) return 'fa-film';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) return 'fa-image';
		if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(ext)) return 'fa-file-zipper';
		if (ext === 'pdf') return 'fa-file-pdf';
		if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
		if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-file-excel';
		if (['ppt', 'pptx'].includes(ext)) return 'fa-file-powerpoint';
		if (['txt', 'md', 'markdown', 'log', 'json', 'xml', 'yaml', 'yml'].includes(ext)) return 'fa-file-lines';
		if (['html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx', 'vue', 'php', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs'].includes(ext)) return 'fa-code';
		if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) return 'fa-font';
		if (['iso', 'dmg', 'img', 'bin', 'exe', 'msi', 'apk', 'deb', 'rpm'].includes(ext)) return 'fa-compact-disc';
		return 'fa-file';
	}

	function formatSize(bytes) {
		if (!bytes || isNaN(bytes)) return null;
		bytes = parseInt(bytes, 10);
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 ** 3) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
		return (bytes / (1024 ** 3)).toFixed(2) + ' GB';
	}

	function buildDetails(f) {
		const ext = getExt(f.name).toUpperCase();
		const type = (f.type || ext || 'Unknown').toUpperCase();
		const rawBytes = f.bytes || f.size_bytes || null;
		const sizeStr = rawBytes ? formatSize(rawBytes) : (f.size ? formatSize(parseInt(f.size)) || f.size : null);
		const parts = [];
		if (type) parts.push(type);
		if (sizeStr) parts.push(sizeStr);
		return parts.join('  •  ') || '—';
	}

	function isVideo(ext, type = '') {
		return type.startsWith('video') || ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'flv', 'wmv', '3gp'].includes(ext);
	}

	function isAudio(ext, type = '') {
		return type.startsWith('audio') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'oga', 'opus', 'mid', 'midi'].includes(ext);
	}

	function isImage(ext, type = '') {
		return type.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext);
	}

	function authFetch(url, options = {}) {
		const token = localStorage.getItem("acroxa_token");
		options.headers = {
			...options.headers,
			Authorization: token ? `Bearer ${token}` : ""
		};
		return fetch(url, options);
	}

function getAccentColor(img) {
	if (!img.complete || img.naturalWidth === 0) {
		return 'var(--accent-500)';
	}

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d', { willReadFrequently: true });

	canvas.width = 64;
	canvas.height = 64;

	try {
		ctx.drawImage(img, 0, 0, 64, 64);

		const data = ctx.getImageData(0, 0, 64, 64).data;

		const buckets = new Map();

		for (let i = 0; i < data.length; i += 4) {
			let r = data[i];
			let g = data[i + 1];
			let b = data[i + 2];
			let a = data[i + 3];

			if (a < 120) continue;

			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);

			const saturation = max - min;
			const brightness = (r + g + b) / 3;

			// Skip dull / too dark / too bright
			if (saturation < 35) continue;
			if (brightness < 40) continue;
			if (brightness > 240) continue;

			// Quantize
			r = Math.round(r / 24) * 24;
			g = Math.round(g / 24) * 24;
			b = Math.round(b / 24) * 24;

			const key = `${r},${g},${b}`;

			buckets.set(key, (buckets.get(key) || 0) + saturation * 2);
		}

		if (!buckets.size) {
			return 'var(--accent-500)';
		}

		let bestColor = null;
		let bestScore = -1;

		for (const [color, score] of buckets) {
			if (score > bestScore) {
				bestScore = score;
				bestColor = color;
			}
		}

		const [r, g, b] = bestColor.split(',').map(Number);

		return `rgb(${r}, ${g}, ${b})`;

	} catch {
		return 'var(--accent-500)';
	}
}

	function rgbToHsl(r, g, b) {
		r /= 255;
		g /= 255;
		b /= 255;
		const max = Math.max(r, g, b),
			min = Math.min(r, g, b);
		let h, s, l = (max + min) / 2;
		if (max === min) {
			h = s = 0;
		} else {
			const d = max - min;
			s = l > .5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
			h /= 6;
		}
		return [h, s, l];
	}

	function hslToRgb(h, s, l) {
		let r, g, b;
		if (s === 0) {
			r = g = b = l;
		} else {
			const q = l < .5 ? l * (1 + s) : l + s - l * s,
				p = 2 * l - q;
			r = hue2rgb(p, q, h + 1 / 3);
			g = hue2rgb(p, q, h);
			b = hue2rgb(p, q, h - 1 / 3);
		}
		return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	}

	function hue2rgb(p, q, t) {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	}

	function applyAccentToItem(item, img) {
		const c = getAccentColor(img);
		item.style.setProperty('--accent', c);
		const m = c.match(/\d+/g);
		if (m) item.style.setProperty('--accent-rgb', `${m[0]},${m[1]},${m[2]}`);
	}
	async function generateVideoThumbnail(url) {
		return new Promise(resolve => {
			const v = document.createElement('video');
			v.crossOrigin = "anonymous";
			v.preload = "metadata";
			v.muted = true;
			v.src = url;
			let t = setTimeout(() => resolve(null), 15000);
			v.onloadedmetadata = () => {
				v.currentTime = Math.min(3, v.duration - .5 || 3);
			};
			v.onseeked = () => {
				clearTimeout(t);
				try {
					const c = document.createElement('canvas');
					c.width = v.videoWidth || 640;
					c.height = v.videoHeight || 360;
					c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
					resolve(c.toDataURL('image/jpeg', .85));
				} catch {
					resolve(null);
				}
			};
			v.onerror = () => {
				clearTimeout(t);
				resolve(null);
			};
		});
	}
	async function loadJsMediaTags() {
		if (window.jsmediatags) return true;
		return new Promise((res, rej) => {
			const s = document.createElement('script');
			s.src = "https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js";
			s.onload = () => setTimeout(() => window.jsmediatags ? res(true) : rej(), 500);
			s.onerror = rej;
			document.head.appendChild(s);
		}).catch(() => false);
	}
	async function generateAudioThumbnail(url) {
		const ok = await loadJsMediaTags();
		if (!ok) return null;
		return new Promise(resolve => {
			fetch(url, {
				mode: 'cors'
			}).then(r => {
				if (!r.ok) throw 0;
				return r.blob();
			}).then(blob => {
				jsmediatags.read(blob, {
					onSuccess: tag => {
						if (tag.tags?.picture) {
							const {
								format,
								data
							} = tag.tags.picture;
							let b64 = '';
							for (let i = 0; i < data.length; i++) b64 += String.fromCharCode(data[i]);
							b64 = btoa(b64);
							const mime = format.startsWith('image/') ? format : `image/${format}`;
							resolve(`data:${mime};base64,${b64}`);
						} else resolve(null);
					},
					onError: () => resolve(null)
				});
			}).catch(() => resolve(null));
		});
	}
// ─── Global state ─────────────────────────────────────────────────────────────
let currentFilmstripTranslate = 0;

// ─── Helpers (unchanged) ─────────────────────────────────────────────────────
function getVisibleItems() {
  return Array.from(
    document.querySelectorAll('#media-grid .media-item:not([style*="display: none"])')
  );
}

function navigateGallery(direction) {
  const items = getVisibleItems();
  if (items.length < 2) return;

  const currentIndex = items.findIndex(
    el => el.dataset.filename === currentFile?.name
  );
  if (currentIndex === -1) return;

  const nextIndex = (currentIndex + direction + items.length) % items.length;
  const nextItem  = items[nextIndex];

  const fileData = {
    name  : nextItem.dataset.filename,
    url   : nextItem.dataset.url,
    type  : nextItem.dataset.type,
    size  : nextItem.dataset.size || ''
  };

  // ── Slide animation wraps only the media swap, not the whole modal ────────
  animateMediaTransition(direction, () => {
    // Everything openPlayerModal normally does, minus the modal reveal
    _loadMediaIntoModal(fileData);
  });
}

// ─── addModalNavigation (unchanged logic, keep your existing version) ─────────
function addModalNavigation() {
  let existingNav = playerModal.querySelector('.acr-modal-nav');
  if (existingNav) existingNav.remove();
  const navContainer = document.createElement('div');
  navContainer.innerHTML = `
    <div class="acr-modal-nav">
      <button class="nav-prev" aria-label="Previous media">‹</button>
      <button class="nav-next" aria-label="Next media">›</button>
    </div>`;
  const nav = navContainer.firstElementChild;
  document.getElementById('acr-modal-wrap').appendChild(nav);
  nav.querySelector('.nav-prev').addEventListener('click', () => navigateGallery(-1));
  nav.querySelector('.nav-next').addEventListener('click', () => navigateGallery(+1));
  addFilmstrip();
}

function addFilmstrip() {
  const existingStrip = playerModal.querySelector('.acr-modal-filmstrip');
  if (existingStrip) existingStrip.remove();

  const visibleItems = getVisibleItems();
  if (visibleItems.length < 2) return;

  const strip   = document.createElement('div');
  strip.className = 'acr-modal-filmstrip';

  const wrapper = document.createElement('div');
  wrapper.className        = 'filmstrip-wrapper';
  wrapper.style.transform  = `translateX(${currentFilmstripTranslate}px)`;
  wrapper.style.transition = 'none';   // NO flash on re-insert
  wrapper.style.willChange = 'transform';

  const spacerL = document.createElement('div');
  const spacerR = document.createElement('div');
  spacerL.className = 'filmstrip-spacer filmstrip-spacer-l';
  spacerR.className = 'filmstrip-spacer filmstrip-spacer-r';
  wrapper.appendChild(spacerL);

  let activeIndex = -1;

  visibleItems.forEach((itemEl, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (itemEl.dataset.filename === currentFile?.name) {
      thumb.classList.add('active');
      activeIndex = index;
    }

    const imgSrc = itemEl.querySelector('img')?.src || '';
    thumb.innerHTML = imgSrc
      ? `<img src="${imgSrc}" alt="" loading="lazy">`
      : `<div style="width:100%;height:100%;background:#222;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;">
           <i class="fas ${getFileIconClass(getExt(itemEl.dataset.filename))}"></i>
         </div>`;

    thumb.addEventListener('click', () => {
      // Determine direction relative to current active
      const currentIdx = visibleItems.findIndex(el => el.dataset.filename === currentFile?.name);
      const clickedIdx = index;
      const dir = clickedIdx >= currentIdx ? 1 : -1;

      animateMediaTransition(dir, () => {
        _loadMediaIntoModal({
          name : itemEl.dataset.filename,
          url  : itemEl.dataset.url,
          type : itemEl.dataset.type,
          size : itemEl.dataset.size || ''
        });
      });
    });

    wrapper.appendChild(thumb);
  });

  wrapper.appendChild(spacerR);
  strip.appendChild(wrapper);

  const modalWrap = document.getElementById('acr-modal-wrap');
  if (infoBar?.parentNode) {
    infoBar.parentNode.insertBefore(strip, infoBar);
  } else {
    modalWrap.appendChild(strip);
  }

  requestAnimationFrame(() => {
    const thumbEls  = wrapper.querySelectorAll('.thumb');
    if (!thumbEls.length) return;

    const thumbW    = thumbEls[0].offsetWidth;
    const THUMB_GAP = 12;
    const halfStrip = strip.offsetWidth / 2;
    const spacerPx  = Math.max(0, halfStrip - thumbW / 2 - THUMB_GAP);

    spacerL.style.cssText = `flex-shrink:0;width:${spacerPx}px;`;
    spacerR.style.cssText = `flex-shrink:0;width:${spacerPx}px;`;

    // Bake spacers into layout before measuring
    void wrapper.offsetWidth;

    initFilmstripScrolling(strip, wrapper, activeIndex);
  });
}

// ─── REPLACED: centerActiveThumb — geometry-based, no index math ─────────────
function centerActiveThumb(strip, wrapper, activeIndex) {
  const thumbs = wrapper.querySelectorAll('.thumb');
  if (!thumbs.length || activeIndex < 0 || activeIndex >= thumbs.length) return;

  const activeThumb = thumbs[activeIndex];

  // getBoundingClientRect gives us real rendered positions
  const stripRect = strip.getBoundingClientRect();
  const thumbRect = activeThumb.getBoundingClientRect();

  const stripCenter = stripRect.left + stripRect.width  / 2;
  const thumbCenter = thumbRect.left + thumbRect.width  / 2;

  // How far the thumb center is from the strip center, given the current translate
  const delta = thumbCenter - stripCenter;

  // Clamp so we never over-scroll past the ends
  const maxScroll = Math.max(0, wrapper.scrollWidth - strip.offsetWidth);
  const rawTarget = currentFilmstripTranslate - delta;
  currentFilmstripTranslate = Math.max(-maxScroll, Math.min(0, rawTarget));

  wrapper.style.transition = 'transform 0.42s cubic-bezier(0.25, 0.1, 0.25, 1)';
  wrapper.style.transform  = `translateX(${currentFilmstripTranslate}px)`;
}

// ─── REPLACED: initFilmstripScrolling — momentum + snap ──────────────────────
function initFilmstripScrolling(strip, wrapper, activeIndex) {
  // Center active item right away (layout is settled)
  centerActiveThumb(strip, wrapper, activeIndex);

  let isDragging         = false;
  let pointerStartX      = 0;
  let translateAtDragStart = 0;

  // Velocity tracking
  let velocity       = 0;
  let lastX          = 0;
  let lastTimestamp  = 0;
  let rafId          = null;

  const FRICTION     = 0.88;   // multiply velocity per frame on release
  const MIN_VELOCITY = 0.4;    // px/frame below which we snap
  const THUMB_GAP    = 12;

  function clamp(v) {
    const maxScroll = Math.max(0, wrapper.scrollWidth - strip.offsetWidth);
    return Math.max(-maxScroll, Math.min(0, v));
  }

  // Find the thumb whose center is closest to the strip center
  function snapToNearest() {
    const thumbs     = wrapper.querySelectorAll('.thumb');
    const stripCX    = strip.offsetWidth / 2;
    let   bestIdx    = 0;
    let   bestDist   = Infinity;

    thumbs.forEach((t, i) => {
      // thumb left relative to wrapper, then adjust for current translate
      const thumbLocalCenter = t.offsetLeft + t.offsetWidth / 2 + currentFilmstripTranslate;
      const dist = Math.abs(thumbLocalCenter - stripCX);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    });

    // Re-use geometry centering for precision
    const stripRect = strip.getBoundingClientRect();
    const thumbRect = thumbs[bestIdx].getBoundingClientRect();
    const delta = (thumbRect.left + thumbRect.width / 2) - (stripRect.left + stripRect.width / 2);
    const maxScroll = Math.max(0, wrapper.scrollWidth - strip.offsetWidth);
    currentFilmstripTranslate = clamp(currentFilmstripTranslate - delta);

    wrapper.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)';
    wrapper.style.transform  = `translateX(${currentFilmstripTranslate}px)`;
  }

  function runMomentum() {
    if (Math.abs(velocity) < MIN_VELOCITY) {
      snapToNearest();
      return;
    }
    currentFilmstripTranslate = clamp(currentFilmstripTranslate + velocity);
    velocity *= FRICTION;
    wrapper.style.transition = 'none';
    wrapper.style.transform  = `translateX(${currentFilmstripTranslate}px)`;
    rafId = requestAnimationFrame(runMomentum);
  }

  function stopMomentum() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ── Mouse drag ────────────────────────────────────────────────────────────
  strip.addEventListener('mousedown', e => {
    stopMomentum();
    isDragging          = true;
    pointerStartX       = e.pageX;
    translateAtDragStart = currentFilmstripTranslate;
    lastX               = e.pageX;
    lastTimestamp       = performance.now();
    velocity            = 0;
    wrapper.style.transition = 'none';
    strip.style.cursor  = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const now   = performance.now();
    const dt    = Math.max(1, now - lastTimestamp);
    velocity    = ((e.pageX - lastX) / dt) * 16; // normalise to ~60fps frame
    lastX       = e.pageX;
    lastTimestamp = now;

    currentFilmstripTranslate = clamp(translateAtDragStart + (e.pageX - pointerStartX));
    wrapper.style.transform  = `translateX(${currentFilmstripTranslate}px)`;
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging          = false;
    strip.style.cursor  = 'grab';
    rafId = requestAnimationFrame(runMomentum);
  });

  // ── Mouse wheel ───────────────────────────────────────────────────────────
  strip.addEventListener('wheel', e => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    stopMomentum();
    velocity = -(e.deltaY > 0 ? 6 : -6);
    rafId    = requestAnimationFrame(runMomentum);
  }, { passive: false });

  // ── Touch ─────────────────────────────────────────────────────────────────
  let touchStartX          = 0;
  let touchTranslateStart  = 0;
  let touchLastX           = 0;
  let touchLastTime        = 0;

  strip.addEventListener('touchstart', e => {
    stopMomentum();
    touchStartX         = e.touches[0].clientX;
    touchTranslateStart = currentFilmstripTranslate;
    touchLastX          = touchStartX;
    touchLastTime       = performance.now();
    velocity            = 0;
    wrapper.style.transition = 'none';
  }, { passive: true });

  strip.addEventListener('touchmove', e => {
    const now = performance.now();
    const dt  = Math.max(1, now - touchLastTime);
    velocity  = ((e.touches[0].clientX - touchLastX) / dt) * 16;
    touchLastX    = e.touches[0].clientX;
    touchLastTime = now;

    currentFilmstripTranslate = clamp(
      touchTranslateStart + (e.touches[0].clientX - touchStartX)
    );
    wrapper.style.transform = `translateX(${currentFilmstripTranslate}px)`;
  }, { passive: true });

  strip.addEventListener('touchend', () => {
    rafId = requestAnimationFrame(runMomentum);
  });
}
let _suppressFilmstripRebuild = false;

function _loadMediaIntoModal(fileData) {
  if (activeAudio) { activeAudio.pause(); activeAudio.src = ''; activeAudio = null; }
  modalPlayer.querySelectorAll('video').forEach(m => { m.pause(); m.src = ''; });

  currentFile = { ...fileData };
  modalPlayer.innerHTML = '';

  const ext  = getExt(fileData.name);
  const type = (fileData.type || '').toLowerCase();

  if      (isVideo(ext, type)) modalPlayer.appendChild(buildVideoPlayer(fileData.url, fileData.name));
  else if (isAudio(ext, type)) modalPlayer.appendChild(buildAudioPlayer(fileData.url, fileData.name));
  else if (isImage(ext, type)) {
    const img = document.createElement('img');
    img.src = fileData.url; img.alt = fileData.name; img.className = 'acr-img-preview';
    modalPlayer.appendChild(img);
  } else {
    const p = document.createElement('div');
    p.className = 'acr-generic-panel';
    p.innerHTML = `<div class="acr-gp-icon"><i class="fas ${getFileIconClass(ext,type)}"></i></div><h3>${fileData.name}</h3>`;
    modalPlayer.appendChild(p);
  }

  miIcon.innerHTML      = `<i class="fas ${getFileIconClass(ext, type)}"></i>`;
  miName.textContent    = fileData.name;
  miDetails.textContent = buildDetails(fileData);
  infoBar.style.display = '';

  miCopy.onclick = () => {
    navigator.clipboard.writeText(fileData.url || '').then(() => {
      const orig = miCopy.innerHTML;
      miCopy.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => miCopy.innerHTML = orig, 1800);
    });
  };
  miDl.onclick     = () => { const a = document.createElement('a'); a.href = fileData.url; a.download = fileData.name; a.click(); };
  miRename.onclick = () => openRenamePopup(currentFile);
  miDel.onclick    = () => confirmDeleteInline();

  // Only rebuild filmstrip when NOT inside an animation swap
  if (!_suppressFilmstripRebuild) {
    addFilmstrip();
  }
}
    function confirmDeleteInline() {
        if (miDel.dataset.confirming === "true") return;

        miDel.dataset.confirming = "true";
        const originalHTML = miDel.innerHTML;
        const originalClass = miDel.className;

        miDel.innerHTML = `
            <i class="fas fa-check"></i> 
            <span style="margin-left: 5px; font-size: 12.5px;">Confirm Delete</span>
        `;
        miDel.style.background = "rgba(185, 28, 28, 0.25)";
        miDel.style.color = "#ef4444";
        miDel.style.border = "1px solid rgba(239, 68, 68, 0.35)";

        const cancelBtn = document.createElement('button');
        cancelBtn.className = "acr-mi-btn";
        cancelBtn.innerHTML = `<i class="fas fa-times"></i>`;
        cancelBtn.style.background = "var(--accent-500-a30)";
        cancelBtn.style.color = "var(--color-primary-1000)";
        cancelBtn.style.marginLeft = "8px";

        miDel.parentNode.insertBefore(cancelBtn, miDel.nextSibling);

        function cleanup() {
            miDel.innerHTML = originalHTML;
            miDel.className = originalClass;
            miDel.style.background = "";
            miDel.style.color = "";
            miDel.style.border = "";
            delete miDel.dataset.confirming;

            if (cancelBtn && cancelBtn.parentNode) {
                cancelBtn.parentNode.removeChild(cancelBtn);
            }

            deleteConfirmCleanup = null;
            miDel.onclick = () => confirmDeleteInline();
        }

        deleteConfirmCleanup = cleanup;

        async function executeDelete() {
            cleanup();
            try {
                const res = await authFetch("/acr/api/media/delete-file", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: currentFile.name })
                });
                const data = await res.json();
                console.log("Delete response:", data);
                if (data.success) {
                    document.querySelector(`[data-filename="${CSS.escape(currentFile.name)}"]`)?.remove();
                    closePlayerModal();
                    window.System.showToast(`${data.message}`, "success");
                    // window.System.showToast("File deleted successfully.", "success");
                    console.log("Delete successful:", data.message);
                } else {
                    alert(data.message || "Delete failed.");
                }
            } catch (err) {
                alert("Delete error: " + err.message);
            }
        }

        miDel.onclick = executeDelete;
        cancelBtn.onclick = cleanup;

        const escHandler = (e) => {
            if (e.key === "Escape") {
                cleanup();
                document.removeEventListener("keydown", escHandler);
            }
        };
        document.addEventListener("keydown", escHandler, { once: true });
    }
/**
 * Full open — loads media AND reveals the modal.
 */
function openPlayerModal(fileData) {
  if (deleteConfirmCleanup) deleteConfirmCleanup();

  _loadMediaIntoModal(fileData);

  if (!playerModal.classList.contains('open')) {
    revealModal();   // from the previous animation step
  }
}
const SLIDE_DURATION = 320;
let _slideInFlight = false;
let _pendingFilmstripRebuild = false;

function animateMediaTransition(direction, swapFn) {
  if (_slideInFlight) {
    _finishSlideImmediately();
  }
  _slideInFlight = true;

  const container = modalPlayer;

  // Snapshot current height before touching anything
  const containerH = container.offsetHeight;

  // ── 1. Move outgoing children into ghost ──────────────────────────────────
  const ghost = document.createElement('div');
  ghost.className = 'acr-player-slide';
  ghost.setAttribute('data-slide-role', 'ghost');
  ghost.style.cssText = `
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    will-change: transform, opacity;
    transition: transform ${SLIDE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1),
                opacity   ${SLIDE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1);
  `;

  // Grab children BEFORE swapFn clears them
  const outgoingChildren = Array.from(container.children);
  if (!outgoingChildren.length) {
    swapFn();
    _slideInFlight = false;
    return;
  }
  outgoingChildren.forEach(c => ghost.appendChild(c));
  container.appendChild(ghost);

  // Lock height so container doesn't collapse
  container.style.height    = containerH + 'px';
  container.style.position  = 'relative';
  container.style.overflow  = 'hidden';

  // ── 2. Run swapFn but suppress filmstrip rebuild during animation ─────────
  _suppressFilmstripRebuild = true;
  swapFn();  // calls _loadMediaIntoModal → sets currentFile, builds player, skips addFilmstrip
  _suppressFilmstripRebuild = false;

  // ── 3. Wrap fresh children in incoming slide ──────────────────────────────
  const enterFrom = direction > 0 ? '100%' : '-100%';
  const exitTo    = direction > 0 ? '-100%' : '100%';

  const incoming = document.createElement('div');
  incoming.className = 'acr-player-slide';
  incoming.setAttribute('data-slide-role', 'incoming');
  incoming.style.cssText = `
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    will-change: transform, opacity;
    transform: translateX(${enterFrom});
    opacity: 0;
    transition: transform ${SLIDE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1),
                opacity   ${SLIDE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1);
  `;

  const freshChildren = Array.from(container.children).filter(c => c !== ghost);
  freshChildren.forEach(c => incoming.appendChild(c));
  container.appendChild(incoming);

  // ── 4. Force reflow — browser must register start state ──────────────────
  void container.offsetWidth;

  // ── 5. Trigger animation ──────────────────────────────────────────────────
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ghost.style.transform = `translateX(${exitTo})`;
      ghost.style.opacity   = '0';
      incoming.style.transform = 'translateX(0)';
      incoming.style.opacity   = '1';
      incoming.style.pointerEvents = 'auto';
    });
  });

  // ── 6. Cleanup ────────────────────────────────────────────────────────────
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;

    // Unwrap incoming back into container
    Array.from(incoming.children).forEach(c => container.appendChild(c));
    incoming.remove();
    ghost.remove();

    // Restore container sizing
    container.style.height   = '';
    container.style.position = '';
    container.style.overflow = '';

    _slideInFlight = false;

    // NOW rebuild filmstrip safely, after DOM is clean
    addFilmstrip();
  };

  incoming.addEventListener('transitionend', () => cleanup(), { once: true });
  setTimeout(cleanup, SLIDE_DURATION + 80);  // fallback
}

function _finishSlideImmediately() {
  const container = modalPlayer;
  const incoming  = container.querySelector('[data-slide-role="incoming"]');
  const ghost     = container.querySelector('[data-slide-role="ghost"]');

  if (incoming) {
    incoming.style.transition = 'none';
    incoming.style.transform  = 'translateX(0)';
    incoming.style.opacity    = '1';
    Array.from(incoming.children).forEach(c => container.appendChild(c));
    incoming.remove();
  }
  if (ghost) ghost.remove();

  container.style.height   = '';
  container.style.position = '';
  container.style.overflow = '';
  _slideInFlight = false;
}
document.addEventListener('keydown', function (e) {
    if (!playerModal.classList.contains('open')) return;

    // Ignore if user is typing in input or rename overlay is open
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' ||
        document.querySelector('.acr-rename-overlay.open')) {
        return;
    }

    if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateGallery(+1);
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateGallery(-1);
    }
});
// ==================== MOBILE SWIPE SUPPORT ====================
let touchStartX = 0;

playerModal.addEventListener('touchstart', e => {
    if (!playerModal.classList.contains('open')) return;
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

playerModal.addEventListener('touchend', e => {
    if (!playerModal.classList.contains('open')) return;
    const touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > 80) {
        if (diff > 0) navigateGallery(+1);  // swipe left → next
        else navigateGallery(-1);           // swipe right → previous
    }
}, { passive: true });
function buildVideoPlayer(url, filename) {
  const id = 'vp_' + Date.now();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="acr-video-player acr-glass" id="${id}">
      <video id="${id}_v" playsinline></video>
      <div class="acr-vp-overlay" id="${id}_ov"><i class="fas fa-play"></i></div>
      <div class="acr-vp-loading"  id="${id}_ld"><i class="fas fa-spinner fa-spin"></i></div>
      <div class="acr-vp-stats"    id="${id}_st"></div>
      <div class="acr-vp-controls" id="${id}_co">
        <div class="acr-vp-progress-wrap acr-glass" id="${id}_pw">
          <div class="acr-vp-buffered"  id="${id}_bf"></div>
          <div class="acr-vp-progress"  id="${id}_pr"></div>
          <div class="acr-vp-handle"    id="${id}_ph"></div>
        </div>
        <div class="acr-vp-times"><span id="${id}_ct">0:00</span><span id="${id}_du">0:00</span></div>
        <div class="acr-vp-bottom acr-glass">
          <button id="${id}_pl"><i class="fas fa-play"></i></button>
          <button id="${id}_sb"><i class="fas fa-backward"></i></button>
          <button id="${id}_sf"><i class="fas fa-forward"></i></button>
          <div class="acr-vp-vol-wrap" id="${id}_vw">
            <button id="${id}_mu"><i class="fas fa-volume-high"></i></button>
            <div class="acr-vp-vol-slider acr-glass" id="${id}_vs">
              <div class="acr-vp-vol-fill"   id="${id}_vf"></div>
              <div class="acr-vp-vol-handle" id="${id}_vh"></div>
            </div>
          </div>
          <div class="acr-vp-drop" id="${id}_sp">
            <button title="Speed"><i class="fas fa-tachometer-alt"></i></button>
            <div class="acr-vp-drop-menu acr-glass">
              ${[.25,.5,.75,1,1.25,1.5,1.75,2].map(s=>`<div class="acr-vp-ditem${s===1?' acr-sel':''}" data-speed="${s}">${s===1?'Normal':s+'×'}</div>`).join('')}
            </div>
          </div>
          <button id="${id}_th" title="Theater"><i class="fas fa-expand"></i></button>
          <button id="${id}_pp" title="PiP"><i class="fas fa-external-link-alt"></i></button>
          <button id="${id}_fs" title="Fullscreen"><i class="fas fa-expand-arrows-alt"></i></button>
        </div>
      </div>
      <div class="acr-ctx-menu acr-glass" id="${id}_cx">
        <div class="acr-ctx-item" id="${id}_cd"><i class="fas fa-download"></i> Download</div>
        <div class="acr-ctx-item" id="${id}_cl"><i class="fas fa-repeat"></i> Loop <span id="${id}_ls">(Off)</span></div>
        <div class="acr-ctx-item acr-has-sub"><i class="fas fa-tachometer-alt"></i> Speed
          <div class="acr-submenu">${[.25,.5,.75,1,1.25,1.5,1.75,2].map(s=>`<div class="acr-vp-ditem${s===1?' acr-sel':''}" data-speed="${s}">${s===1?'1×':s+'×'}</div>`).join('')}</div>
        </div>
        <div class="acr-ctx-item" id="${id}_cp"><i class="fas fa-external-link-alt"></i> Picture-in-Picture</div>
        <div class="acr-ctx-item" id="${id}_cu"><i class="fas fa-copy"></i> Copy Video URL</div>
        <div class="acr-ctx-item" id="${id}_cs"><i class="fas fa-chart-bar"></i> Toggle Stats</div>
      </div>
    </div>`;

  const player  = wrap.firstElementChild;
  const vid     = player.querySelector(`#${id}_v`);
  const ov      = player.querySelector(`#${id}_ov`);
  const controls= player.querySelector(`#${id}_co`);   // ← whole controls wrapper
  const pw      = player.querySelector(`#${id}_pw`);
  const pr      = player.querySelector(`#${id}_pr`);
  const bf      = player.querySelector(`#${id}_bf`);
  const ph      = player.querySelector(`#${id}_ph`);
  const ct      = player.querySelector(`#${id}_ct`);
  const du      = player.querySelector(`#${id}_du`);
  const pl      = player.querySelector(`#${id}_pl`);
  const st      = player.querySelector(`#${id}_st`);
  const cx      = player.querySelector(`#${id}_cx`);
  const vw      = player.querySelector(`#${id}_vw`);
  const vs      = player.querySelector(`#${id}_vs`);
  const vf      = player.querySelector(`#${id}_vf`);
  const vh      = player.querySelector(`#${id}_vh`);
  const mu      = player.querySelector(`#${id}_mu`);
  const spDrop  = player.querySelector(`#${id}_sp`);

  let loop = false, showStats = false, dragging = false,
      wasPlaying = false, statsInt = null, inactTimer = null;

  const amb = document.createElement('canvas');
  const fmt = s => (!s || isNaN(s)) ? '0:00'
    : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;

  // ── Auto-hide helpers ────────────────────────────────────────────────────
  function showControls() {
    controls.style.opacity = '1';
    controls.style.pointerEvents = 'auto';
    player.style.cursor = 'default';
  }
  function hideControls() {
    // Don't hide while a dropdown is open or volume slider is expanded
    if (player.querySelector('.acr-vp-drop.acr-open')) return;
    if (vw.classList.contains('acr-expanded')) return;
    if (dragging) return;
    controls.style.opacity = '0';
    controls.style.pointerEvents = 'none';
    player.style.cursor = 'none';
  }
  function resetHide() {
    showControls();
    clearTimeout(inactTimer);
    inactTimer = setTimeout(hideControls, 1000);
  }

  // Inline transition so we don't need extra CSS rules
  controls.style.transition = 'opacity .3s ease';

  // Show controls whenever the mouse moves inside the player
  player.addEventListener('mousemove', resetHide);
  player.addEventListener('mouseenter', resetHide);
  player.addEventListener('mouseleave', () => {
    clearTimeout(inactTimer);
    hideControls();
  });
  player.addEventListener('touchstart', resetHide, { passive: true });

  // Keep controls visible while the user is over them
  controls.addEventListener('mouseenter', () => {
    clearTimeout(inactTimer);
    showControls();
  });
  controls.addEventListener('mouseleave', resetHide);

  resetHide();

  // ── Ambient glow ─────────────────────────────────────────────────────────
  function ambientGlow() {
    if (!vid.videoWidth) return;
    amb.width = vid.videoWidth; amb.height = vid.videoHeight;
    const c = amb.getContext('2d');
    c.drawImage(vid, 0, 0, amb.width, amb.height);
    const d = c.getImageData(0, 0, amb.width, amb.height).data;
    let r=0,g=0,b=0,n=0;
    for (let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
    if (n) player.style.boxShadow=`0 0 40px rgb(${~~(r/n)},${~~(g/n)},${~~(b/n)})`;
  }

  // ── Video events ─────────────────────────────────────────────────────────
  vid.addEventListener('timeupdate', () => {
    const p = (vid.currentTime / vid.duration) * 100 || 0;
    pr.style.width = `${p}%`;
    ph.style.left  = `${p}%`;
    ct.textContent = fmt(vid.currentTime);
    ambientGlow();
  });
  vid.addEventListener('progress', () => {
    if (vid.buffered.length) bf.style.width=`${(vid.buffered.end(0)/vid.duration)*100||0}%`;
  });
  vid.addEventListener('waiting', ()  => player.classList.add('acr-buffering'));
  vid.addEventListener('playing', ()  => player.classList.remove('acr-buffering'));
  vid.addEventListener('ended',   ()  => { pl.innerHTML='<i class="fas fa-play"></i>'; if(loop) vid.play(); });
  vid.addEventListener('loadedmetadata', () => {
    vid.volume = parseFloat(localStorage.getItem('volume')) || .5;
    vid.playbackRate = parseFloat(localStorage.getItem('speed')) || 1;
    du.textContent = fmt(vid.duration);
    updateVolUI();
    const vW=vid.videoWidth, vH=vid.videoHeight;
    if (vW && vH) player.style.aspectRatio=`${vW}/${vH}`;
  });
  vid.src = url;

  // ── Toggle play ──────────────────────────────────────────────────────────
  function togglePlay() {
    if (vid.paused || vid.ended) { vid.play(); ov.innerHTML='<i class="fas fa-play"></i>'; }
    else { vid.pause(); ov.innerHTML='<i class="fas fa-pause"></i>'; }
    ov.classList.add('show');
    setTimeout(() => ov.classList.remove('show'), 500);
    pl.innerHTML = vid.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
    resetHide();
  }

  // ── Click on VIDEO AREA only (not on controls) ───────────────────────────
  player.addEventListener('click', e => {
    // Ignore if click was inside the controls wrapper or context menu
    if (e.target.closest('.acr-vp-controls') || e.target.closest('.acr-vp-controls svg') || e.target.closest('.acr-ctx-menu')) return;
    togglePlay();
  });

  // Double-tap / double-click seek or fullscreen
  vid.addEventListener('dblclick', e => {
    const r=vid.getBoundingClientRect(), x=e.clientX-r.left;
    if      (x < r.width/3)   vid.currentTime -= 10;
    else if (x > r.width*2/3) vid.currentTime += 10;
    else {
      if (document.fullscreenElement) document.exitFullscreen();
      else player.requestFullscreen().catch(()=>{});
    }
  });

  // ── Volume UI ────────────────────────────────────────────────────────────
  function updateVolUI() {
    const v = vid.volume;
    vf.style.width = `${v*100}%`;
    vh.style.left  = `${v*100}%`;
    mu.innerHTML = (vid.muted || v===0) ? '<i class="fas fa-volume-mute"></i>'
                 : v < .3              ? '<i class="fas fa-volume-low"></i>'
                                       : '<i class="fas fa-volume-high"></i>';
  }

  // ── Progress bar drag ────────────────────────────────────────────────────
  pw.addEventListener('pointerdown', e => {
    wasPlaying = !vid.paused && !vid.ended;
    if (wasPlaying) vid.pause();
    dragging = true;
    pw.classList.add('acr-dragging');
    const seek = ev => {
      const r=pw.getBoundingClientRect(), px=ev.clientX||ev.touches?.[0]?.clientX;
      vid.currentTime = Math.max(0, Math.min((px-r.left)/r.width*vid.duration, vid.duration));
    };
    seek(e);
    const mm = ev => { if(dragging) seek(ev); };
    const mu2 = () => {
      dragging=false; pw.classList.remove('acr-dragging');
      if (wasPlaying) vid.play().catch(()=>{});
      resetHide();
      document.removeEventListener('pointermove',mm);
      document.removeEventListener('pointerup',mu2);
    };
    document.addEventListener('pointermove', mm);
    document.addEventListener('pointerup',   mu2);
    e.preventDefault();
  });

  pw.addEventListener('touchstart', e => {
    wasPlaying = !vid.paused && !vid.ended;
    if (wasPlaying) vid.pause();
    dragging = true;
    pw.classList.add('acr-dragging');
    const seek = ev => {
      const r=pw.getBoundingClientRect(), px=ev.touches?.[0]?.clientX;
      if (px!==undefined) vid.currentTime=Math.max(0,Math.min((px-r.left)/r.width*vid.duration,vid.duration));
    };
    seek(e);
    const mm = ev => { seek(ev); ev.preventDefault(); };
    const mu2 = () => {
      dragging=false; pw.classList.remove('acr-dragging');
      if (wasPlaying) vid.play().catch(()=>{});
      resetHide();
      document.removeEventListener('touchmove',mm);
      document.removeEventListener('touchend',mu2);
    };
    document.addEventListener('touchmove',mm,{passive:false});
    document.addEventListener('touchend',mu2);
    e.preventDefault();
  }, {passive:false});

  pw.addEventListener('click', e => {
    if (dragging) return;
    const r=pw.getBoundingClientRect();
    const t=(e.clientX-r.left)/r.width*vid.duration;
    if (!isNaN(t)) {
      const wp = !vid.paused && !vid.ended;
      vid.currentTime = Math.max(0,Math.min(t,vid.duration));
      if (wp) vid.play().catch(()=>{});
    }
  });

  // ── Volume slider ────────────────────────────────────────────────────────
  let vht;
  vw.addEventListener('mouseenter', () => { clearTimeout(vht); vht=setTimeout(()=>vw.classList.add('acr-expanded'),150); });
  vw.addEventListener('mouseleave', () => { clearTimeout(vht); vw.classList.remove('acr-expanded'); resetHide(); });

  vs.addEventListener('pointerdown', e => {
    if (!vw.classList.contains('acr-expanded')) return;
    const dv = ev => {
      const r=vs.getBoundingClientRect();
      let v=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width));
      vid.volume=v; localStorage.setItem('volume',v); updateVolUI();
    };
    dv(e);
    document.addEventListener('pointermove',dv);
    document.addEventListener('pointerup',()=>document.removeEventListener('pointermove',dv),{once:true});
    e.preventDefault();
  });

  // ── Buttons ──────────────────────────────────────────────────────────────
  pl.onclick = () => togglePlay();
  mu.onclick = () => { vid.muted=!vid.muted; updateVolUI(); };
  player.querySelector(`#${id}_sb`).onclick = () => vid.currentTime -= 10;
  player.querySelector(`#${id}_sf`).onclick = () => vid.currentTime += 10;
  player.querySelector(`#${id}_pp`).onclick = () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else vid.requestPictureInPicture().catch(()=>{});
  };
  player.querySelector(`#${id}_fs`).onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else player.requestFullscreen().catch(()=>{});
  };
  player.querySelector(`#${id}_th`).onclick = () => player.classList.toggle('theater');

  // ── Speed dropdown ───────────────────────────────────────────────────────
  spDrop.querySelector('button').addEventListener('click', e => {
    const wasOpen = spDrop.classList.contains('acr-open');
    player.querySelectorAll('.acr-vp-drop').forEach(d=>d.classList.remove('acr-open'));
    if (!wasOpen) { spDrop.classList.add('acr-open'); showControls(); clearTimeout(inactTimer); }
    e.stopPropagation();
  });
  spDrop.querySelectorAll('.acr-vp-ditem').forEach(it => it.addEventListener('click', () => {
    const s=parseFloat(it.dataset.speed);
    vid.playbackRate=s; localStorage.setItem('speed',s);
    spDrop.querySelectorAll('.acr-vp-ditem').forEach(i=>i.classList.remove('acr-sel'));
    it.classList.add('acr-sel');
    spDrop.classList.remove('acr-open');
    resetHide();
  }));
  document.addEventListener('click', e => {
    if (!e.target.closest('.acr-vp-drop')) {
      player.querySelectorAll('.acr-vp-drop').forEach(d=>d.classList.remove('acr-open'));
    }
  });

  // ── Right-click context menu ─────────────────────────────────────────────
  function showCtx(x,y) {
    const r=player.getBoundingClientRect();
    let l=x-r.left, t=y-r.top;
    const mw=cx.offsetWidth||230, mh=cx.offsetHeight||200;
    if (l+mw>r.width) l=r.width-mw-10;
    if (t+mh>r.height) t=r.height-mh-10;
    l=Math.max(10,l); t=Math.max(10,t);
    cx.style.left=l+'px'; cx.style.top=t+'px';
    cx.classList.add('acr-open');
    showControls(); clearTimeout(inactTimer);
    cx.querySelectorAll('.acr-has-sub').forEach(p=>{
      const sub=p.querySelector('.acr-submenu');
      if (!sub) return;
      p.addEventListener('mouseenter',()=>{
        const sr=sub.getBoundingClientRect(), pr2=player.getBoundingClientRect();
        p.classList.toggle('acr-re', sr.right>pr2.right+10);
      });
    });
  }
  player.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e.clientX,e.clientY); });
  let lpt;
  player.addEventListener('touchstart', e => { lpt=setTimeout(()=>showCtx(e.touches[0].clientX,e.touches[0].clientY),500); },{passive:true});
  player.addEventListener('touchmove',  ()=>clearTimeout(lpt),{passive:true});
  player.addEventListener('touchend',   ()=>clearTimeout(lpt));
  document.addEventListener('click', e => { if(!e.target.closest('.acr-ctx-menu')) cx.classList.remove('acr-open'); });

  player.querySelector(`#${id}_cd`).onclick = () => { const a=document.createElement('a'); a.href=url; a.download=filename||'video.mp4'; a.click(); };
  player.querySelector(`#${id}_cl`).onclick = () => { loop=!loop; player.querySelector(`#${id}_ls`).textContent=loop?'(On)':'(Off)'; };
  player.querySelector(`#${id}_cp`).onclick = () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else vid.requestPictureInPicture().catch(()=>{});
  };
  player.querySelector(`#${id}_cu`).onclick = () => navigator.clipboard.writeText(url);
  player.querySelector(`#${id}_cs`).onclick = () => {
    showStats=!showStats; st.classList.toggle('show',showStats);
    if (showStats) {
      clearInterval(statsInt);
      statsInt=setInterval(()=>{
        st.innerHTML=`<strong>Stats</strong><br>Time:${fmt(vid.currentTime)}/${fmt(vid.duration)}<br>Speed:${vid.playbackRate}×<br>Vol:${(vid.volume*100).toFixed(0)}%<br>Res:${vid.videoWidth||'?'}×${vid.videoHeight||'?'}<br>Buf:${bf.style.width||'0%'}`;
      },800);
    } else clearInterval(statsInt);
  };

  // Speed items in ctx sub-menu
  cx.querySelectorAll('.acr-submenu .acr-vp-ditem[data-speed]').forEach(it=>it.addEventListener('click',e=>{
    e.stopImmediatePropagation();
    const s=parseFloat(it.dataset.speed);
    vid.playbackRate=s; localStorage.setItem('speed',s);
    spDrop.querySelectorAll('.acr-vp-ditem').forEach(i=>i.classList.toggle('acr-sel',parseFloat(i.dataset.speed)===s));
    cx.classList.remove('acr-open'); resetHide();
  }));

  // ── Keyboard shortcuts (only while this modal is open) ───────────────────
  const kh = e => {
    if (!playerModal.classList.contains('open')) return;
    if (e.target.tagName==='INPUT') return;
    // Let arrow-left/right fall through to gallery navigation
    switch(e.key.toLowerCase()) {
      case ' ': case 'k': e.preventDefault(); togglePlay(); break;
      case 'f':
        if (document.fullscreenElement) document.exitFullscreen();
        else player.requestFullscreen().catch(()=>{});
        break;
      case 'j': vid.currentTime -= 10; break;
      case 'l': vid.currentTime += 10; break;
      case 'arrowup':   e.preventDefault(); vid.volume=Math.min(1,vid.volume+.1); updateVolUI(); break;
      case 'arrowdown': e.preventDefault(); vid.volume=Math.max(0,vid.volume-.1); updateVolUI(); break;
      case 'm': vid.muted=!vid.muted; updateVolUI(); break;
      // ArrowLeft / ArrowRight are intentionally NOT handled here
      // so the gallery-navigation listener can catch them.
    }
    resetHide();
  };
  document.addEventListener('keydown', kh);
  playerModal.addEventListener('click', e => {
    if (e.target===playerModal || e.target.closest('#acr-modal-close')) {
      document.removeEventListener('keydown',kh);
      clearInterval(statsInt);
    }
  },{once:true});

  return player;
}

	function buildAudioPlayer(url, filename) {
		const id = 'ap_' + Date.now();
		const wrap = document.createElement('div');
		wrap.innerHTML = `
      <div class="acr-audio-player" id="${id}">
        <div class="acr-ap-album-wrap">
          <img id="${id}_art" class="acr-ap-art" src="https://picsum.photos/id/870/300/300" alt="Art" crossorigin="anonymous">
        </div>
        <div class="acr-ap-tonearm" id="${id}_ta">
          <div class="acr-ap-arm"></div>
          <div class="acr-ap-needle"></div>
        </div>
        <div class="acr-ap-info">
          <h2 id="${id}_ti">${filename.replace(/\.[^/.]+$/,'')}</h2>
          <p  id="${id}_ar">Loading tags...</p>
        </div>
        <div class="acr-ap-wave-wrap" id="${id}_ww">
          <canvas id="${id}_cv"></canvas>
          <div class="acr-ap-playhead" id="${id}_hd"></div>
          <div class="acr-ap-tooltip" id="${id}_tp">0:00</div>
        </div>
        <div class="acr-ap-times"><span id="${id}_ct">0:00</span><span id="${id}_du">0:00</span></div>
        <div class="acr-ap-controls">
          <button id="${id}_sh" title="Shuffle"><i class="fas fa-random"></i></button>
          <button id="${id}_sb" title="Back 10s"><i class="fas fa-backward"></i></button>
          <button id="${id}_pl" title="Play"><i class="fas fa-play"></i></button>
          <button id="${id}_sf" title="Fwd 10s"><i class="fas fa-forward"></i></button>
          <button id="${id}_lp" title="Loop"><i class="fas fa-redo"></i></button>
          <button id="${id}_dl" title="Download"><i class="fas fa-download"></i></button>
          <div class="acr-ap-vol-wrap" id="${id}_vw">
            <button id="${id}_mu" title="Mute"><i class="fas fa-volume-high"></i></button>
            <div class="acr-ap-vol-slider" id="${id}_vs">
              <div class="acr-ap-vol-fill"   id="${id}_vf"></div>
              <div class="acr-ap-vol-handle" id="${id}_vh"></div>
            </div>
          </div>
          <div class="acr-ap-sp-drop" id="${id}_sp">
            <button title="Speed"><i class="fas fa-tachometer-alt"></i></button>
            <div class="acr-ap-sp-menu">
              ${[.5,.75,1,1.25,1.5,2].map(s=>`<div class="acr-ap-sitem${s===1?' acr-sel':''}" data-speed="${s}">${s===1?'1.0×':s+'×'}</div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
		const player = wrap.firstElementChild;
		const art = player.querySelector(`#${id}_art`);
		const head = player.querySelector(`#${id}_hd`);
		const ww = player.querySelector(`#${id}_ww`);
		const canvas = player.querySelector(`#${id}_cv`);
		const ctx2 = canvas.getContext('2d');
		const tip = player.querySelector(`#${id}_tp`);
		const ct = player.querySelector(`#${id}_ct`);
		const du = player.querySelector(`#${id}_du`);
		const plBtn = player.querySelector(`#${id}_pl`);
		const lpBtn = player.querySelector(`#${id}_lp`);
		const vw = player.querySelector(`#${id}_vw`);
		const vs = player.querySelector(`#${id}_vs`);
		const vf = player.querySelector(`#${id}_vf`);
		const vh = player.querySelector(`#${id}_vh`);
		const mu = player.querySelector(`#${id}_mu`);
		const spDrop = player.querySelector(`#${id}_sp`);
		const audio = new Audio();
		audio.crossOrigin = 'anonymous';
		activeAudio = audio;
		let actx = null,
			analyser = null,
			src = null,
			peaks = [],
			loop = false;
		const fmt = s => (!s || isNaN(s)) ? '0:00' : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;

		function initActx() {
			if (actx) return;
			actx = new(window.AudioContext || window.webkitAudioContext)();
			analyser = actx.createAnalyser();
			analyser.fftSize = 128;
			src = actx.createMediaElementSource(audio);
			src.connect(analyser);
			analyser.connect(actx.destination);
		}

		function drawWave() {
			const w = canvas.width,
				h = canvas.height;
			ctx2.clearRect(0, 0, w, h);
			if (!peaks.length) return;
			const bw = w / peaks.length;
			ctx2.fillStyle = 'rgba(255,255,255,.85)';
			ctx2.shadowBlur = 12;
			ctx2.shadowColor = '#00ffff';
			for (let i = 0; i < peaks.length; i++) {
				const bh = peaks[i] * h * 1.6;
				ctx2.fillRect(i * bw + 2, h / 2 - bh / 2, bw - 4, bh);
			}
		}

		function resizeCv() {
			const r = ww.getBoundingClientRect();
			canvas.width = r.width || 380;
			canvas.height = r.height || 88;
			drawWave();
		}
		new ResizeObserver(resizeCv).observe(ww);
		async function genWave(blob) {
			initActx();
			try {
				const buf = await blob.arrayBuffer();
				const ab = await actx.decodeAudioData(buf);
				const raw = ab.getChannelData(0);
				const S = 120,
					B = Math.floor(raw.length / S);
				peaks = [];
				for (let i = 0; i < S; i++) {
					let s = 0;
					for (let j = 0; j < B; j++) s += Math.abs(raw[i * B + j]);
					peaks.push(s / B);
				}
				resizeCv();
			} catch {
				peaks = Array(120).fill(0).map(() => Math.random() * .9 + .2);
				resizeCv();
			}
		}
		peaks = Array(120).fill(0).map(() => Math.random() * .9 + .2);
		resizeCv();
		async function loadAudio() {
			try {
				const resp = await fetch(url, {
					mode: 'cors'
				});
				if (!resp.ok) throw 0;
				const blob = await resp.blob();
				audio.src = URL.createObjectURL(blob);
				genWave(blob);
				const readTags = b => {
					if (!window.jsmediatags) return;
					jsmediatags.read(b, {
						onSuccess: tag => {
							if (tag.tags.title) player.querySelector(`#${id}_ti`).textContent = tag.tags.title;
							player.querySelector(`#${id}_ar`).textContent = tag.tags.artist || 'Unknown Artist';
							if (tag.tags.picture) {
								const {
									format,
									data
								} = tag.tags.picture;
								let b64 = '';
								for (let i = 0; i < data.length; i++) b64 += String.fromCharCode(data[i]);
								b64 = btoa(b64);
								const mime = format.startsWith('image/') ? format : `image/${format}`;
								art.src = `data:${mime};base64,${b64}`;
							}
						},
						onError: () => {
							player.querySelector(`#${id}_ar`).textContent = 'Unknown Artist';
						}
					});
				};
				const ok = await loadJsMediaTags();
				if (ok) readTags(blob);
				else {
					player.querySelector(`#${id}_ar`).textContent = 'Unknown Artist';
				}
			} catch {
				audio.src = url;
				player.querySelector(`#${id}_ar`).textContent = 'Unknown Artist';
			}
		}
		loadAudio();
		audio.addEventListener('timeupdate', () => {
			const p = audio.duration ? audio.currentTime / audio.duration : 0;
			head.style.left = `${p*100}%`;
			ct.textContent = fmt(audio.currentTime);
		});
		audio.addEventListener('loadedmetadata', () => {
			du.textContent = fmt(audio.duration);
			audio.volume = parseFloat(localStorage.getItem('volume')) || .7;
			updateVol();
		});
		audio.addEventListener('ended', () => {
			if (loop) {
				audio.currentTime = 0;
				audio.play();
			} else {
				player.classList.remove('acr-playing');
				plBtn.innerHTML = '<i class="fas fa-play"></i>';
			}
		});

		function updateVol() {
			const v = audio.volume;
			vf.style.width = `${v*100}%`;
			vh.style.left = `${v*100}%`;
			mu.innerHTML = (v === 0 || audio.muted) ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-high"></i>';
		}

		function togglePlay() {
			initActx();
			if (actx.state === 'suspended') actx.resume();
			if (audio.paused) {
				audio.play();
				player.classList.add('acr-playing');
				plBtn.innerHTML = '<i class="fas fa-pause"></i>';
			} else {
				audio.pause();
				player.classList.remove('acr-playing');
				plBtn.innerHTML = '<i class="fas fa-play"></i>';
			}
		}
		let wvDrag = false;
		const seekW = e => {
			const r = ww.getBoundingClientRect();
			const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
			if (audio.duration) audio.currentTime = p * audio.duration;
		};
		ww.addEventListener('click', seekW);
		ww.addEventListener('mousedown', e => {
			wvDrag = true;
			seekW(e);
		});
		document.addEventListener('mousemove', e => {
			if (wvDrag) seekW(e);
		});
		document.addEventListener('mouseup', () => wvDrag = false);
		ww.addEventListener('mousemove', e => {
			const r = ww.getBoundingClientRect();
			const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
			tip.style.left = `${e.clientX-r.left}px`;
			tip.textContent = fmt(p * (audio.duration || 0));
		});
		let vht;
		vw.addEventListener('mouseenter', () => {
			clearTimeout(vht);
			vht = setTimeout(() => vw.classList.add('acr-expanded'), 150);
		});
		vw.addEventListener('mouseleave', () => {
			clearTimeout(vht);
			vw.classList.remove('acr-expanded');
		});
		vs.addEventListener('pointerdown', e => {
			const dv = ev => {
				const r = vs.getBoundingClientRect();
				let v = (ev.clientX - r.left) / r.width;
				v = Math.max(0, Math.min(1, v));
				audio.volume = v;
				localStorage.setItem('volume', v);
				updateVol();
			};
			dv(e);
			document.addEventListener('pointermove', dv);
			document.addEventListener('pointerup', () => document.removeEventListener('pointermove', dv), {
				once: true
			});
			e.preventDefault();
		});
		plBtn.onclick = () => togglePlay();
		mu.onclick = () => {
			audio.muted = !audio.muted;
			updateVol();
		};
		player.querySelector(`#${id}_sb`).onclick = () => audio.currentTime -= 10;
		player.querySelector(`#${id}_sf`).onclick = () => audio.currentTime += 10;
		player.querySelector(`#${id}_sh`).onclick = () => {};
		lpBtn.onclick = () => {
			loop = !loop;
			lpBtn.classList.toggle('acr-active', loop);
		};
		player.querySelector(`#${id}_dl`).onclick = () => {
			const a = document.createElement('a');
			a.href = url;
			a.download = filename || 'audio.mp3';
			a.click();
		};
		spDrop.querySelector('button').onclick = () => spDrop.classList.toggle('acr-open');
		document.addEventListener('click', e => {
			if (!e.target.closest(`#${id}_sp`)) spDrop.classList.remove('acr-open');
		});
		spDrop.querySelectorAll('.acr-ap-sitem').forEach(it => it.onclick = () => {
			const s = parseFloat(it.dataset.speed);
			audio.playbackRate = s;
			localStorage.setItem('speed', s);
			spDrop.querySelectorAll('.acr-ap-sitem').forEach(i => i.classList.toggle('acr-sel', parseFloat(i.dataset.speed) === s));
			spDrop.classList.remove('acr-open');
		});
		const kh = e => {
			if (!playerModal.classList.contains('open') || e.target.tagName === 'INPUT') return;
			if (e.code === 'Space') {
				e.preventDefault();
				togglePlay();
			}
			if (e.key === 'ArrowRight') audio.currentTime += 10;
			if (e.key === 'ArrowLeft') audio.currentTime -= 10;
			if (e.key === 'ArrowUp') {
				audio.volume = Math.min(1, audio.volume + .1);
				updateVol();
			}
			if (e.key === 'ArrowDown') {
				audio.volume = Math.max(0, audio.volume - .1);
				updateVol();
			}
			if (e.key.toLowerCase() === 'm') {
				audio.muted = !audio.muted;
				updateVol();
			}
		};
		document.addEventListener('keydown', kh);
		playerModal.addEventListener('click', e => {
			if (e.target === playerModal || e.target.closest('#acr-modal-close')) document.removeEventListener('keydown', kh);
		}, {
			once: true
		});
		audio.volume = parseFloat(localStorage.getItem('volume')) || .7;
		updateVol();
		lpBtn.classList.toggle('acr-active', loop);
		return player;
	}
async function createMediaItem(f) {
    const ext = getExt(f.name);
    const type = (f.type || '').toLowerCase();

    const item = document.createElement('div');
    item.className = 'media-item generating';
    item.dataset.name = f.name;
    item.dataset.filename = f.name;
    item.dataset.url = f.url;
    item.dataset.type = type;
    item.dataset.size = f.size || '';
    item.dataset.orientation = 'unknown';
    item.dataset.aspect = '1';

    const icon = getFileIconClass(ext, type);

    item.innerHTML = `
        <div class="file-icon">
            <i class="fa-solid ${icon} fa-spin"></i>
        </div>
        <div class="info">
            <span class="info-inner">${f.name}</span>
        </div>
    `;

    let thumbSrc = null;
    let isReal = false;

    if (type.startsWith('image') && f.thumb) {
        thumbSrc = f.thumb;
        isReal = true;
    } else if (isVideo(ext, type)) {
        if (f.thumb && f.thumb.includes('/thumbs/')) {
            thumbSrc = f.thumb;
            isReal = true;
        } else {
            thumbSrc = await generateVideoThumbnail(f.url);
        }
    } else if (isAudio(ext, type)) {
        if (f.thumb && f.thumb.includes('/thumbs/')) {
            thumbSrc = f.thumb;
            isReal = true;
        } else {
            thumbSrc = await generateAudioThumbnail(f.url);
        }
    }

    if (thumbSrc) {

        item.innerHTML = `
            <img src="${thumbSrc}" alt="${f.name}">
            <div class="info">
                <span class="info-inner">${f.name}</span>
            </div>
        `;

        if (isReal) {

            await new Promise(resolve => {

                const preload = new Image();

                const finish = () => {

                    const img = item.querySelector("img");

                    applyAccentToItem(item, preload);

                    const w = preload.naturalWidth;
                    const h = preload.naturalHeight;

                    if (w && h) {
                        const asp = w / h;

                        let ori = "square";

                        if (asp > 1.1) ori = "landscape";
                        else if (asp < 0.9) ori = "portrait";

                        item.dataset.orientation = ori;
                        item.dataset.aspect = asp.toFixed(2);
                    }

                    item.classList.remove("generating");

                    resolve();
                };

                preload.onload = finish;

                preload.onerror = () => {
                    item.innerHTML = `
                        <div class="file-icon">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="info">
                            <span class="info-inner">${f.name}</span>
                        </div>
                    `;

                    item.classList.remove("generating");
                    resolve();
                };

                // Never hang forever
                setTimeout(() => {
                    console.warn("Image preload timeout:", thumbSrc);
                    resolve();
                }, 5000);

                preload.src = thumbSrc;

                if (preload.complete && preload.naturalWidth > 0) {
                    finish();
                }

            });

        } else {
            item.classList.remove("generating");
        }

    } else {

        item.innerHTML = `
            <div class="file-icon">
                <i class="fa-solid ${icon}"></i>
            </div>
            <div class="info">
                <span class="info-inner">${f.name}</span>
            </div>
        `;

        item.classList.remove("generating");
    }

    item.addEventListener("click", () => openPlayerModal(f));

    return item;
}
function applyScrollingLabel(item, filename) {
    const info = item.querySelector('.info');
    if (!info) return;

    info.innerHTML = `<span class="info-inner">${filename}</span>`;
    const inner = info.querySelector('.info-inner');

    // Measure after a brief paint so widths are available
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const containerW = info.offsetWidth;
            const textW = inner.scrollWidth;
            const overflow = textW - containerW;

            if (overflow > 4) {
                // Roughly 60px/s scroll speed
                const duration = Math.max(2, overflow / 60).toFixed(2);
                inner.classList.add('scrollable');
                inner.style.setProperty('--scroll-dist', `-${overflow}px`);
                inner.style.setProperty('--scroll-duration', `${duration}s`);
                info.style.setProperty('--scroll-dist', `-${overflow}px`);
                info.style.setProperty('--scroll-duration', `${duration}s`);
            }
        });
    });
}
	// Add this helper function near your other utility functions
async function uploadThumbnail(dataUrl, originalFilename) {
    try {
        // Convert data URL to blob
        const res = await fetch(dataUrl);
        const blob = await res.blob();

        // Use the same base name as the original file, but with .jpg extension
        const baseName = originalFilename.replace(/\.[^/.]+$/, '');
        const thumbFilename = baseName + '.jpg';

        const fd = new FormData();
        fd.append('thumbnail', blob, thumbFilename);

        const uploadRes = await authFetch('/acr/api/media/upload-thumb', {
            method: 'POST',
            body: fd
        });

        const data = await uploadRes.json();
        if (data.success) return data.thumbUrl;
    } catch (err) {
        console.warn('[thumb upload] Failed:', err);
    }
    return null;
}
	// Disable or enable all media filter buttons
	function disableFilterButtons(disabled) {
		const buttons = document.querySelectorAll('.media-filters button');
		buttons.forEach(btn => {
			btn.disabled = disabled;
			
			// Optional: add visual feedback (opacity + cursor)
			if (disabled) {
				btn.style.opacity = '0.6';
				btn.style.cursor = 'not-allowed';
			} else {
				btn.style.opacity = '1';
				btn.style.cursor = 'pointer';
			}
		});
	}
function initAnimation() {
    const s1 = document.getElementById("s1");
    const s2 = document.getElementById("s2");
    const s3 = document.getElementById("s3");
    const SIZE = 200;
    const GAP = 14;
    const SQ = Math.round((SIZE - GAP) / 2);
    let phase = 0;

    function setState(p) {
      const stateIndex = p % 18;
      const states = [() => {
        s1.style.left = "0px";
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SIZE}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s3.style.left = `${SQ + GAP}px`;
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s1.style.left = "0px";
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s3.style.left = "0px";
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SIZE}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s1.style.left = "0px";
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s3.style.left = "0px";
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s1.style.left = "0px";
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SIZE}px`;
        s3.style.left = "0px";
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s1.style.left = "0px";
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s3.style.left = "0px";
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s1.style.left = "0px";
        s1.style.top = "0px";
        s1.style.width = `${SIZE}px`;
        s1.style.height = `${SQ}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s3.style.left = "0px";
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s1.style.left = `${SQ + GAP}px`;
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s3.style.left = "0px";
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SIZE}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
      }, () => {
        s3.style.left = "0px";
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
        s2.style.left = "0px";
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SIZE}px`;
        s2.style.height = `${SQ}px`;
        s1.style.left = `${SQ + GAP}px`;
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
      }, () => {
        s3.style.left = "0px";
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
        s2.style.left = "0px";
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s1.style.left = `${SQ + GAP}px`;
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
      }, () => {
        s3.style.left = "0px";
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
        s1.style.left = `${SQ + GAP}px`;
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SIZE}px`;
        s2.style.left = "0px";
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
      }, () => {
        s3.style.left = "0px";
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
        s1.style.left = `${SQ + GAP}px`;
        s1.style.top = `${SQ + GAP}px`;
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s2.style.left = "0px";
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
      }, () => {
        s3.style.left = "0px";
        s3.style.top = "0px";
        s3.style.width = `${SIZE}px`;
        s3.style.height = `${SQ}px`;
        s1.style.left = `${SQ + GAP}px`;
        s1.style.top = `${SQ + GAP}px`;
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s2.style.left = "0px";
        s2.style.top = `${SQ + GAP}px`;
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
      }, () => {
        s3.style.left = `${SQ + GAP}px`;
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
        s2.style.left = "0px";
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SIZE}px`;
        s1.style.left = `${SQ + GAP}px`;
        s1.style.top = `${SQ + GAP}px`;
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
      }, () => {
        s2.style.left = "0px";
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s1.style.left = "0px";
        s1.style.top = `${SQ + GAP}px`;
        s1.style.width = `${SIZE}px`;
        s1.style.height = `${SQ}px`;
        s3.style.left = `${SQ + GAP}px`;
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s2.style.left = "0px";
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s1.style.left = "0px";
        s1.style.top = `${SQ + GAP}px`;
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s3.style.left = `${SQ + GAP}px`;
        s3.style.top = "0px";
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s1.style.left = "0px";
        s1.style.top = `${SQ + GAP}px`;
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s3.style.left = `${SQ + GAP}px`;
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s1.style.left = "0px";
        s1.style.top = `${SQ + GAP}px`;
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SQ}px`;
        s3.style.left = `${SQ + GAP}px`;
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }, () => {
        s1.style.left = "0px";
        s1.style.top = "0px";
        s1.style.width = `${SQ}px`;
        s1.style.height = `${SIZE}px`;
        s2.style.left = `${SQ + GAP}px`;
        s2.style.top = "0px";
        s2.style.width = `${SQ}px`;
        s2.style.height = `${SQ}px`;
        s3.style.left = `${SQ + GAP}px`;
        s3.style.top = `${SQ + GAP}px`;
        s3.style.width = `${SQ}px`;
        s3.style.height = `${SQ}px`;
      }];
      states[stateIndex]();
    }
    async function animate() {
      while (true) {
        phase++;
        setState(phase);
        await new Promise(r => setTimeout(r, 100));
      }
    }
    setState(0);
    setTimeout(() => animate(), 1);
  }
async function loadMedia(filter = 'all') {
    disableFilterButtons(true);

    mediaGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem;">
                            <div class="container" id="container">
                              <div class="shape s1" id="s1">
                                <span class="corner tl">
                                  <i></i>
                                </span>
                                <span class="corner tr">
                                  <i></i>
                                </span>
                                <span class="corner bl">
                                  <i></i>
                                </span>
                                <span class="corner br">
                                  <i></i>
                                </span>
                              </div> 
                              <div class="shape s2" id="s2">
                                <span class="corner tl">
                                  <i></i>
                                </span>
                                <span class="corner tr">
                                  <i></i>
                                </span>
                                <span class="corner bl">
                                  <i></i>
                                </span>
                                <span class="corner br">
                                  <i></i>
                                </span>
                              </div> 
                              <div class="shape s3" id="s3">
                                <span class="corner tl">
                                  <i></i>
                                </span>
                                <span class="corner tr">
                                  <i></i>
                                </span>
                                <span class="corner bl">
                                  <i></i>
                                </span>
                                <span class="corner br">
                                  <i></i>
                                </span>
                              </div>
                            </div>
                          </div>`;

    setTimeout(initAnimation, 20);

    try {
        const res = await authFetch("/acr/api/media/files");
        const data = await res.json();

        let files = Array.isArray(data.files) ? data.files : [];

        files.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));

        const documentMimeStarts = [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.oasis.opendocument.text',
            'application/vnd.oasis.opendocument.spreadsheet',
            'application/vnd.oasis.opendocument.presentation',
            'application/pdf',
            'text/plain'
        ];

        let filtered = files;

        if (filter !== 'all') {
            if (filter === 'doc') {
                filtered = files.filter(f =>
                    documentMimeStarts.some(prefix =>
                        (f.type || '').toLowerCase().startsWith(prefix)
                    )
                );
            } else {
                filtered = files.filter(f =>
                    (f.type || '').toLowerCase().startsWith(filter)
                );
            }
        }

        if (!filtered.length) {
            const isEmpty = files.length === 0;

            mediaGrid.innerHTML = `
                <div style="
                    grid-column:1/-1;
                    display:flex;
                    flex-direction:column;
                    align-items:center;
                    justify-content:center;
                    padding:5rem 2rem;
                    gap:16px;
                    color:var(--color-primary-1000-a40);
                    font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;
                    text-align:center;
                ">
                    <i class="fa-solid ${isEmpty ? 'fa-photo-film' : 'fa-filter-circle-xmark'}"
                       style="font-size:3.5rem;opacity:.5;"></i>

                    <div>
                        <div style="font-size:1.1rem;font-weight:600;margin-bottom:6px;color:var(--color-primary-1000-a60);">
                            ${isEmpty ? 'No media files found' : 'No files match this filter'}
                        </div>

                        <div style="font-size:.875rem;">
                            ${
                                isEmpty
                                    ? 'Your library is empty — click <strong>Upload</strong> to add photos, videos, or audio.'
                                    : 'Try selecting a different category or upload new files.'
                            }
                        </div>
                    </div>

                    ${
                        isEmpty
                            ? `
                        <button onclick="document.getElementById('upload-btn').click()" style="
                            margin-top:8px;
                            padding:10px 22px;
                            border-radius:10px;
                            border:none;
                            background:var(--accent-500-a30);
                            color:var(--color-primary-1000);
                            font-size:.9rem;
                            font-weight:600;
                            cursor:pointer;
                            display:flex;
                            align-items:center;
                            gap:8px;
                            transition:background .2s;
                        "
                        onmouseover="this.style.background='var(--accent-500-a50)'"
                        onmouseout="this.style.background='var(--accent-500-a30)'">
                            <i class="fa-solid fa-upload"></i>
                            Upload Media
                        </button>`
                            : ''
                    }
                </div>
            `;

            return;
        }

        const tempItems = [];

        for (const file of filtered) {
            const item = await createMediaItem(file);
            if (item) tempItems.push(item);
        }

        tempItems.sort((a, b) => {
            const order = {
                landscape: 1,
                square: 2,
                portrait: 3,
                unknown: 4
            };

            const ao = order[a.dataset.orientation] || 4;
            const bo = order[b.dataset.orientation] || 4;

            if (ao !== bo) return ao - bo;

            const aa = parseFloat(a.dataset.aspect) || 1;
            const ba = parseFloat(b.dataset.aspect) || 1;

            if (a.dataset.orientation === 'landscape') return ba - aa;
            if (a.dataset.orientation === 'portrait') return aa - ba;

            return 0;
        });

        const fragment = document.createDocumentFragment();

        tempItems.forEach((item, index) => {
            item.style.opacity = "0";
            item.style.transform = "scale(.8) translateY(20px)";
            item.style.transition =
                `all .35s cubic-bezier(.34,1.56,.64,1) ${index * 20}ms`;

            fragment.appendChild(item);
        });

        mediaGrid.innerHTML = "";
        mediaGrid.appendChild(fragment);

        tempItems.forEach(item => {
            applyScrollingLabel(item, item.dataset.name);
        });

        requestAnimationFrame(() => {
            tempItems.forEach(item => {
                item.style.opacity = "1";
                item.style.transform = "scale(1) translateY(0)";
            });
        });

    } catch (err) {
        console.error(err);

        mediaGrid.innerHTML = `
            <div style="
                grid-column:1/-1;
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                padding:5rem;
            ">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <div>Failed to load media</div>
                <div>${err.message}</div>
            </div>
        `;
    } finally {
        disableFilterButtons(false);
    }
}
function normalizeFilename(name) {
  return name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
	uploadBtn?.addEventListener("click", () => uploadInput?.click());
uploadInput?.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const cards = new Map();

  // ---------------- UI ----------------
  files.forEach(file => {
    const ph = document.createElement("div");
    ph.className = "media-item uploading";

    ph.innerHTML = `
      <div class="uploading-overlay">
        <div class="progress-text">0%</div>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
      </div>

      <div class="file-icon">
        <i class="fa-solid fa-spinner fa-spin"></i>
      </div>

      <div class="info">${file.name}</div>
    `;

    mediaGrid.prepend(ph);
    cards.set(file, ph);
  });

  // ---------------- SETTINGS ----------------
  const settingsRes = await authFetch("/acr/api/system/content");
  const settingsData = await settingsRes.json();

  const uploadStrategy = settingsData?.data?.uploadStrategy || "auto";
  const mediaNaming = settingsData?.data?.mediaNaming || "auto";

  disableFilterButtons(true);

  // ---------------- PROGRESS ----------------
  function updateProgress(card, percent) {
    const text = card.querySelector(".progress-text");
    const fill = card.querySelector(".progress-fill");

    const safe = Math.min(100, Math.max(0, percent));

    if (text) text.innerText = `${safe}%`;
    if (fill) fill.style.width = `${safe}%`;
  }

  // ---------------- XHR ----------------
  function uploadWithProgress(url, options, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open(options.method || "POST", url);

      if (options.headers) {
        Object.entries(options.headers).forEach(([k, v]) => {
          xhr.setRequestHeader(k, v);
        });
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve(xhr.responseText);
        }
      };

      xhr.onerror = reject;
      xhr.send(options.body);
    });
  }
  
  // =====================================================
  // 🔵 STREAM MODE
  // =====================================================
  if (uploadStrategy === "stream" || uploadStrategy === "auto") {

    for (const file of files) {
      const card = cards.get(file);

      await uploadWithProgress(
        `/acr/api/media/upload?uploadtype=stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-file-name": normalizeFilename(encodeURIComponent(file.name)),
            "x-upload-type": "stream",
            "x-media-naming": mediaNaming
          },
          body: file
        },
        (p) => updateProgress(card, p)
      );
    }
  }

  // =====================================================
  // 🟣 CHUNK MODE
  // =====================================================
else if (uploadStrategy === "chunk") {

  for (const file of files) {

    const card = cards.get(file);
    const fileId = crypto.randomUUID();

    UploadStore.save(fileId, {
      name: normalizeFilename(file.name),
      size: file.size,
      status: "uploading"
    });

    UploadEngine.add({
      id: fileId,

      run: () => uploadChunkParallel(file, fileId, card),

      onProgress: (p) => {
        updateProgress(card, p);
        UploadStore.save(fileId, { progress: p });
      },

      onComplete: () => {
        UploadStore.remove(fileId);
      },

      onFail: (err) => {
        console.error("upload failed", err);
      },

      retries: 0
    });
  }
}

  // ---------------- REFRESH ----------------
  loadMedia(
    document.querySelector(".media-filters button.active")?.dataset.filter || "all"
  );
});
const UploadStore = {
  save(id, data) {
    const all = JSON.parse(localStorage.getItem("uploads") || "{}");
    all[id] = data;
    localStorage.setItem("uploads", JSON.stringify(all));
  },

  getAll() {
    return JSON.parse(localStorage.getItem("uploads") || "{}");
  },

  remove(id) {
    const all = this.getAll();
    delete all[id];
    localStorage.setItem("uploads", JSON.stringify(all));
  }
};
function uploadChunkParallel(file, fileId, card, chunkSize = 1 * 1024 * 1024) {

  const totalChunks = Math.ceil(file.size / chunkSize);
  let uploadedChunks = new Set();

  return new Promise((resolve, reject) => {

    const startChunk = (i) => {

      if (i >= totalChunks) {
        resolve();
        return;
      }

      const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize);

      const fd = new FormData();
      fd.append("media", chunk);
      fd.append("fileId", fileId);
      fd.append("chunkIndex", i);
      fd.append("totalChunks", totalChunks);
      fd.append("fileName", normalizeFilename(file.name));
      fd.append("mediaNaming", mediaNaming);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/acr/api/media/upload?uploadtype=chunk");

      xhr.onload = () => {
        uploadedChunks.add(i);

        const percent = Math.round((uploadedChunks.size / totalChunks) * 100);
        updateProgress(card, percent);

        startChunk(i + UploadEngine.concurrency);
      };

      xhr.onerror = reject;
      xhr.send(fd);
    };

    // start parallel workers
    for (let i = 0; i < UploadEngine.concurrency; i++) {
      startChunk(i);
    }
  });
}function pauseUploads() {
  UploadEngine.pause();
}

function resumeUploads() {
  UploadEngine.resume();
}
window.addEventListener("load", () => {
  const saved = UploadStore.getAll();

  for (const id in saved) {
    const data = saved[id];

    console.log("Resumable upload found:", data);

    // optional UI restore
    // show "resume upload" button or auto-requeue
  }
});
	document.querySelectorAll(".media-filters button").forEach(btn => {
		btn.addEventListener("click", () => {
			document.querySelector(".media-filters button.active")?.classList.remove("active");
			btn.classList.add("active");
			loadMedia(btn.dataset.filter || "all");
		});
	});
	searchInput?.addEventListener("input", () => {
		const q = searchInput.value.toLowerCase().trim();
		document.querySelectorAll(".media-item").forEach(el => {
			el.style.display = el.dataset.name?.toLowerCase().includes(q) ? "" : " none";
		});
	});
	regenThumbsBtn?.addEventListener("click", async () => {
		if (!confirm("Regenerate server thumbnails?")) return;
		try {
			const res = await authFetch("/acr/api/media/regenerate-thumbs", {
				method: "POST"
			});
			const data = await res.json();
			alert(data.message || "Done!");
			loadMedia(document.querySelector(".media-filters button.active")?.dataset.filter || "all");
		} catch (err) {
			alert("Failed: " + err.message);
		}
	});
	loadMedia();
});