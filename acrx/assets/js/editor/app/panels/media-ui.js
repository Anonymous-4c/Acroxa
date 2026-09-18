// acrx/assets/js/editor/app/panels/media-ui.js
//
// Media integration reusing the existing MediaPicker component
// (acrx/assets/js/components/mediaPicker.js). Single-image, multi-image and
// post/SEO entry points. File shape from the media API: { url, name, ... }.

let ctx = null;
let pickerModule = null;

export function initMedia(shared) {
  ctx = shared;
}

async function picker() {
  if (!pickerModule) {
    pickerModule = await import("../../../components/mediaPicker.js");
  }
  return pickerModule.MediaPicker || pickerModule.default;
}

function fileUrl(file) {
  return file.url || file.path || file.src || "";
}

export async function pickForBlock(blockId, key, kind = "image", multiple = false) {
  try {
    const MediaPicker = await picker();
    const accept = kind === "image" ? ["image/*"] : kind === "video" ? ["video/*"] : kind === "audio" ? ["audio/*"] : ["*"];
    const files = await MediaPicker.open({ filter: [kind === "image" ? "image" : kind], accept, multiple, title: "Select media" });
    if (!files || files.length === 0) return;
    if (multiple || key === "images") {
      const block = ctx.getBlock(blockId);
      const existing = Array.isArray(block.data.images) ? block.data.images : [];
      const urls = files.map(fileUrl).filter(Boolean);
      ctx.setBlockData(blockId, { images: [...existing, ...urls] }, { record: true, label: "Add images" });
    } else {
      const url = fileUrl(files[0]);
      if (!url) return;
      const patch = { [key]: url };
      if (key === "src" && kind === "image" && !ctx.getBlock(blockId).data.alt && files[0].name) {
        patch.alt = files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      }
      ctx.setBlockData(blockId, patch, { record: true, label: "Set media" });
    }
    ctx.afterStructuralChange({ select: blockId, focus: false });
  } catch (err) {
    if (err && err.message !== "cancelled") ctx.toast(err.message || "Media picker failed", "error");
  }
}

export async function pickForPost() {
  try {
    const MediaPicker = await picker();
    const files = await MediaPicker.open({ filter: ["image"], accept: ["image/*"], title: "Featured image" });
    if (files && files[0] && fileUrl(files[0])) {
      ctx.setPost({ featuredImage: fileUrl(files[0]), featuredImageAlt: files[0].name || "" });
    }
  } catch (err) {
    if (err && err.message !== "cancelled") ctx.toast(err.message || "Media picker failed", "error");
  }
}

export async function pickForSeo() {
  try {
    const MediaPicker = await picker();
    const files = await MediaPicker.open({ filter: ["image"], accept: ["image/*"], title: "Social image" });
    if (files && files[0] && fileUrl(files[0])) {
      ctx.setSeo({ ogImage: fileUrl(files[0]) });
    }
  } catch (err) {
    if (err && err.message !== "cancelled") ctx.toast(err.message || "Media picker failed", "error");
  }
}

export default { initMedia, pickForBlock, pickForPost, pickForSeo };
