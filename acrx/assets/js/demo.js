import MediaPicker from './components/mediaPicker.js';

// Create demo UI
const main = document.querySelector('.content > .main');

main.innerHTML = `
<div class="media-demo">

    <section class="media-section">
        <h2>Featured Image</h2>

        <button id="featured-image-btn">
            Select Featured Image
        </button>

        <input
            id="featured-image-input"
            type="text"
            placeholder="No image selected"
            readonly
        >

        <img
            id="featured-image-preview"
            src=""
            alt="Preview"
        >
    </section>

    <section class="media-section">
        <h2>Gallery</h2>

        <button id="add-gallery-images-btn">
            Add Gallery Images
        </button>

        <div id="gallery-list"></div>
    </section>

</div>
`;

function addToGalleryList(file) {
    const gallery = document.getElementById('gallery-list');

    const item = document.createElement('div');
    item.className = 'gallery-item';

    if (file.type?.startsWith('image')) {
        item.innerHTML = `
            <img src="${file.url}" alt="${file.name}">
            <span>${file.name}</span>
        `;
    } else if (file.type?.startsWith('video')) {
        item.innerHTML = `
            <video src="${file.url}" controls></video>
            <span>${file.name}</span>
        `;
    } else {
        item.innerHTML = `<span>${file.name}</span>`;
    }

    gallery.appendChild(item);
}

// ── Promise style ────────────────────────────────────────────

document.getElementById('featured-image-btn').addEventListener('click', async () => {
    try {
        const files = await MediaPicker.open({
            title: 'Select Featured Image',
            multiple: false,
            filter: ['image'],
            accept: ['image/jpeg', 'image/png', 'image/webp'],
        });

        const [file] = files;

        document.getElementById('featured-image-preview').src = file.url;
        document.getElementById('featured-image-input').value = file.name;
    } catch {
        // cancelled
    }
});

// ── Callback style ───────────────────────────────────────────

document.getElementById('add-gallery-images-btn').addEventListener('click', () => {

    MediaPicker.open({
        title: 'Add to Gallery',
        multiple: true,
        maxSelection: 10,
        filter: ['image', 'video'],

        onSelect(files) {
            files.forEach(addToGalleryList);
        },

        onCancel() {
            console.log('Gallery picker cancelled');
        },
    });

});

// ── Restricting to a subfolder ───────────────────────────────

async function editAttachment(currentFile) {

    const files = await MediaPicker.open({
        title: 'Change Attachment',
        multiple: false,
        folder: 'documents',
        filter: ['document'],
        initialSelection: currentFile ? [currentFile] : [],
    });

    return files[0];
}