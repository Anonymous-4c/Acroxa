// src/controllers/mediaController.js

const path   = require("path");
const fs     = require("fs");
const multer = require("multer");
const sharp  = require("sharp");

// ─── Directories ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../../pub-dist/uploads");
const pubDir = path.join(__dirname, "../../pub-dist");
const thumbDir  = path.join(uploadDir, "thumbs");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(thumbDir))  fs.mkdirSync(thumbDir,  { recursive: true });

// ─── Naming helpers ───────────────────────────────────────────────────────────

async function _getMediaNaming() {
  try {
    const getSettingsModel = require("../core/getSettingsModel");
    const Settings = await getSettingsModel();
    const doc = await Settings.findOne({}).lean();
    return doc?.content?.mediaNaming ?? "uuid";
  } catch {
    return "uuid";
  }
}

function _applyNaming(originalName, strategy) {
  const parsed = path.parse(originalName);
  const ext    = parsed.ext.toLowerCase();

  if (strategy === "uuid") {
    const { randomUUID } = require("crypto");
    return randomUUID() + ext;
  }

  if (strategy === "slug") {
    const slug = parsed.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return (slug || "file") + ext;
  }

  return originalName; // "original"
}

// ─── Filename collision helper ─────────────────────────────────────────────────
function getAvailableFilename(originalName, targetDir = uploadDir) {
  const parsed   = path.parse(originalName);
  const baseName = parsed.name;
  const ext      = parsed.ext;
  let candidate  = originalName;
  let counter    = 1;

  while (fs.existsSync(path.join(targetDir, candidate))) {
    candidate = `${baseName} (${counter})${ext}`;
    counter++;
    if (counter > 1000) throw new Error("Too many filename conflicts - aborting");
  }
  return candidate;
}

// ─── Multer ───────────────────────────────────────────────────────────────────
const multerInstance = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => {
      try {
        cb(null, `__tmp_${Date.now()}_${file.originalname}`);
      } catch (err) {
        cb(err);
      }
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ─── MIME / extension helpers ─────────────────────────────────────────────────
function isImageExt(ext) {
  return [".jpg",".jpeg",".png",".webp",".gif",".tiff",".avif"].includes(ext.toLowerCase());
}

function isAudioExt(ext) {
  return [".mp3",".wav",".ogg",".oga",".m4a",".aac",".flac",".opus",".mid",".midi"].includes(ext.toLowerCase());
}

function isVideoExt(ext) {
  return [".mp4",".webm",".ogv",".mov",".avi",".mkv",".flv",".wmv",".3gp"].includes(ext.toLowerCase());
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();

  if ([".jpg",".jpeg",".jpe"].includes(ext)) return "image/jpeg";
  if (ext === ".png")  return "image/png";
  if (ext === ".gif")  return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp")  return "image/bmp";
  if (ext === ".svg")  return "image/svg+xml";
  if (ext === ".ico")  return "image/x-icon";
  if (ext === ".avif") return "image/avif";
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";

  if (ext === ".mp4")  return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if ([".ogg",".ogv"].includes(ext)) return "video/ogg";
  if (ext === ".mov")  return "video/quicktime";
  if (ext === ".avi")  return "video/x-msvideo";
  if (ext === ".mkv")  return "video/x-matroska";
  if (ext === ".flv")  return "video/x-flv";
  if (ext === ".wmv")  return "video/x-ms-wmv";
  if (ext === ".3gp")  return "video/3gpp";

  if (ext === ".mp3")  return "audio/mpeg";
  if (ext === ".wav")  return "audio/wav";
  if ([".ogg",".oga"].includes(ext)) return "audio/ogg";
  if (ext === ".m4a")  return "audio/mp4";
  if (ext === ".aac")  return "audio/aac";
  if (ext === ".flac") return "audio/flac";
  if ([".mid",".midi"].includes(ext)) return "audio/midi";

  if (ext === ".pdf")  return "application/pdf";
  if (ext === ".txt")  return "text/plain";
  if ([".html",".htm"].includes(ext)) return "text/html";
  if (ext === ".css")  return "text/css";
  if ([".js",".mjs"].includes(ext))  return "text/javascript";
  if (ext === ".json") return "application/json";
  if (ext === ".csv")  return "text/csv";
  if (ext === ".xml")  return "application/xml";
  if ([".md",".markdown"].includes(ext)) return "text/markdown";

  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === ".doc")  return "application/msword";
  if (ext === ".xls")  return "application/vnd.ms-excel";
  if (ext === ".ppt")  return "application/vnd.ms-powerpoint";

  if (ext === ".odt")  return "application/vnd.oasis.opendocument.text";
  if (ext === ".ods")  return "application/vnd.oasis.opendocument.spreadsheet";
  if (ext === ".odp")  return "application/vnd.oasis.opendocument.presentation";

  if (ext === ".zip")  return "application/zip";
  if (ext === ".rar")  return "application/vnd.rar";
  if (ext === ".7z")   return "application/x-7z-compressed";
  if (ext === ".tar")  return "application/x-tar";
  if ([".gz",".tgz"].includes(ext)) return "application/gzip";

  if (ext === ".woff")  return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".ttf")   return "font/ttf";
  if (ext === ".otf")   return "font/otf";
  if (ext === ".eot")   return "application/vnd.ms-fontobject";

  return "application/octet-stream";
}

// ─── Album art extraction from audio files ────────────────────────────────────
// Uses music-metadata (pure JS, no native deps) to pull embedded cover art.
// Falls back gracefully if the package is absent or the file has no art.
// Called only at UPLOAD time and REGEN time — never on list requests.

async function _extractAlbumArt(filePath, thumbBaseName) {
  try {
    // music-metadata is a lightweight pure-JS library — require lazily so the
    // controller still boots if it hasn't been installed yet.
    const mm = require("music-metadata");
    const meta = await mm.parseFile(filePath, { duration: false, skipCovers: false });
    const cover = mm.selectCover(meta.common.picture);
    if (!cover) return null;

    const thumbName = thumbBaseName + ".jpg";
    const thumbPath = path.join(thumbDir, thumbName);

    await sharp(cover.data)
      .resize({ width: 320, height: 320, fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    return `/uploads/thumbs/${thumbName}`;
  } catch {
    // music-metadata not installed, file unreadable, or no embedded art — silent skip
    return null;
  }
}

// ─── Thumbnail upload endpoint ────────────────────────────────────────────────
async function handleThumbnailUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No thumbnail file provided" });
    }

    const tempPath       = path.join(uploadDir, req.file.filename);
    const finalThumbName = getAvailableFilename(req.file.filename, thumbDir);
    const thumbPath      = path.join(thumbDir, finalThumbName);

    await sharp(tempPath)
      .resize({ width: 320, height: 180, fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    fs.unlinkSync(tempPath);

    return res.json({
      success:  true,
      thumbUrl: `/uploads/thumbs/${finalThumbName}`,
      filename: finalThumbName,
      message:  "Thumbnail uploaded and processed successfully",
    });
  } catch (err) {
    console.error("[media] Thumbnail upload error:", err);
    return res.status(500).json({ success: false, message: "Failed to process thumbnail", error: err.message });
  }
}

// ─── Main upload handler ───────────────────────────────────────────────────────
async function handleUpload(req, res) {
  try {
    const uploadType = (
      req.query.uploadtype         ||
      req.body?.uploadtype         ||
      req.headers["x-upload-type"] ||
      "auto"
    ).toLowerCase();

    let mode = uploadType;
    if (uploadType === "auto") {
      const size = parseInt(req.headers["content-length"] || "0");
      mode = size > 50 * 1024 * 1024 ? "stream" : "normal";
    }

    const namingStrategy =
      req.headers["x-media-naming"] ||
      req.body?.mediaNaming          ||
      await _getMediaNaming();

    // ── NORMAL ────────────────────────────────────────────────────────────────
    if (mode === "normal") {
      if (!req.files?.length) {
        return res.status(400).json({ success: false, message: "No files" });
      }

      const processed = [];

      for (const file of req.files) {
        const tempPath  = path.join(uploadDir, file.filename);
        const namedBase = _applyNaming(file.originalname, namingStrategy);
        const finalName = getAvailableFilename(namedBase);
        const finalPath = path.join(uploadDir, finalName);

        fs.renameSync(tempPath, finalPath);

        const mime       = getMimeType(finalName);
        const ext        = path.extname(finalName).toLowerCase();
        const thumbBase  = path.parse(finalName).name;
        let   thumbUrl   = null;
        let   albumArtUrl = null;

        if (mime.startsWith("image/")) {
          const thumbPath = path.join(thumbDir, finalName);
          try {
            await sharp(finalPath)
              .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
              .toFile(thumbPath);
            thumbUrl = `/uploads/thumbs/${finalName}`;
          } catch (_) {}

        } else if (isAudioExt(ext)) {
          // Extract embedded album art → save as thumb
          albumArtUrl = await _extractAlbumArt(finalPath, thumbBase);
          thumbUrl    = albumArtUrl;

        }
        // Videos: frontend generates thumb client-side on upload; server does not
        // block the response waiting for ffmpeg. thumbUrl stays null for video.

        processed.push({
          name: finalName,
          url:  `/uploads/${finalName}`,
          thumb: thumbUrl,
          album_art_url: albumArtUrl,
          type: mime,
        });
      }

      return res.json({ success: true, mode, files: processed });
    }

    // ── STREAM ────────────────────────────────────────────────────────────────
    if (mode === "stream") {
      const rawName = req.headers["x-file-name"];
      if (!rawName) {
        return res.status(400).json({ success: false, message: "Missing name" });
      }

      const namedBase = _applyNaming(decodeURIComponent(rawName), namingStrategy);
      const safeName  = getAvailableFilename(namedBase);
      const filePath  = path.join(uploadDir, safeName);

      const writeStream = fs.createWriteStream(filePath);
      req.pipe(writeStream);

      writeStream.on("finish", async () => {
        const mime      = getMimeType(safeName);
        const ext       = path.extname(safeName).toLowerCase();
        const thumbBase = path.parse(safeName).name;
        let   thumbUrl  = null;
        let   albumArtUrl = null;

        if (mime.startsWith("image/")) {
          const thumbPath = path.join(thumbDir, safeName);
          try {
            await sharp(filePath)
              .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
              .toFile(thumbPath);
            thumbUrl = `/uploads/thumbs/${safeName}`;
          } catch (_) {}

        } else if (isAudioExt(ext)) {
          albumArtUrl = await _extractAlbumArt(filePath, thumbBase);
          thumbUrl    = albumArtUrl;
        }

        return res.json({
          success: true,
          mode,
          file: {
            name: safeName,
            url:  `/uploads/${safeName}`,
            thumb: thumbUrl,
            album_art_url: albumArtUrl,
            type: mime,
          },
        });
      });

      writeStream.on("error", () =>
        res.status(500).json({ success: false, message: "Stream failed" })
      );

      return;
    }

    // ── CHUNK ─────────────────────────────────────────────────────────────────
    if (mode === "chunk") {
      const { fileId, chunkIndex, totalChunks, fileName } = req.body;

      if (!fileId || chunkIndex === undefined || !totalChunks || !fileName) {
        return res.status(400).json({ success: false, message: "Missing chunk data" });
      }

      const chunkDir = path.join(uploadDir, "_chunks", fileId);
      if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

      const chunkFile = req.files?.[0];
      if (!chunkFile) {
        return res.status(400).json({ success: false, message: "No chunk" });
      }

      const chunkPath = path.join(chunkDir, String(chunkIndex));
      fs.writeFileSync(chunkPath, fs.readFileSync(chunkFile.path));
      try { fs.unlinkSync(chunkFile.path); } catch (_) {}

      if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
        const namedBase = _applyNaming(fileName, namingStrategy);
        const finalName = getAvailableFilename(namedBase);
        const finalPath = path.join(uploadDir, finalName);

        const writeStream = fs.createWriteStream(finalPath);
        for (let i = 0; i < totalChunks; i++) {
          const part = path.join(chunkDir, String(i));
          if (!fs.existsSync(part)) {
            return res.status(500).json({ success: false, message: `Missing chunk ${i}` });
          }
          writeStream.write(fs.readFileSync(part));
        }
        writeStream.end();
        fs.rmSync(chunkDir, { recursive: true, force: true });

        const mime      = getMimeType(finalName);
        const ext       = path.extname(finalName).toLowerCase();
        const thumbBase = path.parse(finalName).name;
        let   thumbUrl  = null;
        let   albumArtUrl = null;

        if (mime.startsWith("image/")) {
          const thumbPath = path.join(thumbDir, finalName);
          try {
            await sharp(finalPath)
              .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
              .toFile(thumbPath);
            thumbUrl = `/uploads/thumbs/${finalName}`;
          } catch (_) {}

        } else if (isAudioExt(ext)) {
          albumArtUrl = await _extractAlbumArt(finalPath, thumbBase);
          thumbUrl    = albumArtUrl;
        }

        return res.json({
          success: true,
          mode,
          file: {
            name: finalName,
            url:  `/uploads/${finalName}`,
            thumb: thumbUrl,
            album_art_url: albumArtUrl,
            type: mime,
          },
        });
      }

      return res.json({ success: true, message: `Chunk ${chunkIndex}` });
    }

    return res.status(400).json({ success: false, message: "Invalid upload mode" });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── List media ───────────────────────────────────────────────────────────────
// Now returns album_art_url as a first-class field alongside thumb.
// Resolution order for thumb:
//   1. /thumbs/<exact filename>
//   2. /thumbs/<basename>.jpg  (album art saved with .jpg ext)
//   3. /uploads/<filename>     (image serving itself — images only)
//   4. null

const thumbCachePath = path.join(pubDir, "thumb-cache.json");

/* ─────────────────────────────────────────────────────────────
   CACHE HELPERS
───────────────────────────────────────────────────────────── */

function ensureThumbCache() {
  if (!fs.existsSync(thumbCachePath)) {
    fs.writeFileSync(thumbCachePath, JSON.stringify({}, null, 2), "utf8");
  }
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true });
  }
}

function loadThumbCache() {
  ensureThumbCache();

  try {
    return JSON.parse(fs.readFileSync(thumbCachePath, "utf8"));
  } catch (err) {
    console.error("[media] Cache corrupted, resetting:", err);
    fs.writeFileSync(thumbCachePath, JSON.stringify({}, null, 2), "utf8");
    return {};
  }
}

function saveThumbCache(cache) {
  ensureThumbCache();
  fs.writeFileSync(thumbCachePath, JSON.stringify(cache, null, 2), "utf8");
}

/* ─────────────────────────────────────────────────────────────
   LIST MEDIA (USES CACHE + AUTO FIX MISSING THUMBS)
───────────────────────────────────────────────────────────── */

async function listMedia(req, res) {
  try {
    if (!fs.existsSync(uploadDir)) {
      return res.json({ success: true, files: [] });
    }

    const cache = loadThumbCache();
    const items = [];

    const files = fs.readdirSync(uploadDir).filter(name =>
      name !== "thumbs" &&
      name !== "thumb-cache.json" &&
      !name.startsWith(".") &&
      !name.startsWith("__tmp_") &&
      !name.startsWith("_chunks")
    );
      const filteredFiles = [];

      for (const name of files) {
        const filePath = path.join(uploadDir, name);

        let stat;
        try {
          stat = fs.statSync(filePath);
        } catch (err) {
          continue;
        }

        // 🚫 SKIP DIRECTORIES
        if (stat.isDirectory()) continue;

        filteredFiles.push(name);
      }
    for (const name of filteredFiles) {

      const filePath = path.join(uploadDir, name);
      const stats = fs.statSync(filePath);

      const mime = getMimeType(name);
      const ext = path.extname(name).toLowerCase();
      const baseName = path.parse(name).name;

      const thumbExactPath = path.join(thumbDir, name);
      const thumbJpgPath = path.join(thumbDir, `${baseName}.jpg`);

      let thumb = null;
      let thumbInfo = cache[name] || null;

      /* ───────── EXISTING THUMB CHECK ───────── */

      if (fs.existsSync(thumbExactPath)) {
        thumb = `/uploads/thumbs/${name}`;
      }

      else if (fs.existsSync(thumbJpgPath)) {
        thumb = `/uploads/thumbs/${baseName}.jpg`;
      }

      /* ───────── AUTO REPAIR IMAGE ───────── */

      else if (mime.startsWith("image/") && ext !== ".svg") {

        try {
          await sharp(filePath)
            .resize({
              width: 320,
              height: 320,
              fit: "inside",
              withoutEnlargement: true
            })
            .toFile(thumbExactPath);

          thumb = `/uploads/thumbs/${name}`;

          thumbInfo = {
            status: "generated",
            thumb,
            type: "image",
            updated: Date.now(),
            sourceModified: stats.mtimeMs
          };

        } catch (err) {
          thumbInfo = {
            status: "failed",
            reason: err.message,
            type: "image"
          };
        }
      }

      /* ───────── AUTO REPAIR AUDIO ───────── */

      else if (mime.startsWith("audio/")) {

        try {
          const artUrl = await _extractAlbumArt(filePath, baseName);

          if (artUrl) {
            thumb = artUrl;

            thumbInfo = {
              status: "generated",
              thumb,
              type: "audio",
              updated: Date.now(),
              sourceModified: stats.mtimeMs
            };

          } else {
            thumbInfo = {
              status: "skipped",
              reason: "no embedded art",
              type: "audio"
            };
          }

        } catch (err) {
          thumbInfo = {
            status: "failed",
            reason: err.message,
            type: "audio"
          };
        }
      }

      /* ───────── SVG ───────── */

      else if (ext === ".svg") {
        thumbInfo = {
          status: "skipped",
          reason: "svg does not require thumbnail",
          type: "image"
        };
      }

      /* ───────── OTHER FILES ───────── */

      else {
        thumbInfo = {
          status: "skipped",
          reason: "not image or audio",
          type: "other"
        };
      }

      /* ───────── IMAGE FALLBACK ───────── */

      if (!thumb && mime.startsWith("image/")) {
        thumb = `/uploads/${name}`;
      }

      /* ───────── AUDIO ART RULE ───────── */

      let album_art_url = null;

      if (
        mime.startsWith("audio/") &&
        thumb &&
        thumb.includes("/uploads")
      ) {
        album_art_url = thumb;
      }

      /* ───────── SAVE CACHE ───────── */

      cache[name] = {
        ...thumbInfo,
        thumb: thumbInfo?.thumb || thumb,
        updated: Date.now(),
        sourceModified: stats.mtimeMs
      };

      items.push({
        name,
        originalName: name,
        url: `/uploads/${name}`,
        thumb,
        album_art_url,

        thumbnail_status: thumbInfo?.status || "unknown",
        thumbnail_reason: thumbInfo?.reason || null,

        type: mime,
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    }

    saveThumbCache(cache);

    return res.json({
      success: true,
      files: items
    });

  } catch (err) {
    console.error("[media] List media error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to read media",
      error: err.message
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   REGENERATE THUMBS (FULL CACHE SYNC)
───────────────────────────────────────────────────────────── */

async function regenerateThumbs(req, res) {
  try {
    if (!fs.existsSync(uploadDir)) {
      return res.status(400).json({
        success: false,
        message: "Upload dir missing"
      });
    }

    const cache = loadThumbCache();
    const results = [];

    const files = fs.readdirSync(uploadDir).filter(name =>
      name !== "thumbs" &&
      name !== "thumb-cache.json" &&
      !name.startsWith(".") &&
      !name.startsWith("__tmp_") &&
      !name.startsWith("_chunks")
    );

    for (const name of files) {

      const ext = path.extname(name).toLowerCase();
      const filePath = path.join(uploadDir, name);
      const thumbBase = path.parse(name).name;
      const stats = fs.statSync(filePath);

      try {

        /* ───────── SVG ───────── */
        if (ext === ".svg") {
          cache[name] = {
            status: "skipped",
            reason: "svg does not require thumbnail",
            type: "image",
            updated: Date.now(),
            sourceModified: stats.mtimeMs
          };

          results.push({ name, skipped: true, reason: "svg" });
          continue;
        }

        /* ───────── IMAGE ───────── */
        if (isImageExt(ext)) {

          const thumbPath = path.join(thumbDir, name);

          await sharp(filePath)
            .resize({
              width: 320,
              height: 320,
              fit: "inside",
              withoutEnlargement: true
            })
            .toFile(thumbPath);

          const thumbUrl = `/uploads/thumbs/${name}`;

          cache[name] = {
            status: "generated",
            thumb: thumbUrl,
            type: "image",
            updated: Date.now(),
            sourceModified: stats.mtimeMs
          };

          results.push({ name, ok: true, type: "image" });
          continue;
        }

        /* ───────── AUDIO ───────── */
        if (isAudioExt(ext)) {

          const artUrl = await _extractAlbumArt(filePath, thumbBase);

          if (artUrl) {

            cache[name] = {
              status: "generated",
              thumb: artUrl,
              type: "audio",
              updated: Date.now(),
              sourceModified: stats.mtimeMs
            };

            results.push({ name, ok: true, type: "audio" });

          } else {

            cache[name] = {
              status: "skipped",
              reason: "no embedded art",
              type: "audio",
              updated: Date.now(),
              sourceModified: stats.mtimeMs
            };

            results.push({ name, skipped: true, reason: "no art" });
          }

          continue;
        }

        /* ───────── OTHER ───────── */

        cache[name] = {
          status: "skipped",
          reason: "not image or audio",
          type: "other",
          updated: Date.now(),
          sourceModified: stats.mtimeMs
        };

        results.push({ name, skipped: true });

      } catch (err) {

        cache[name] = {
          status: "failed",
          reason: err.message,
          type: "unknown",
          updated: Date.now(),
          sourceModified: stats.mtimeMs
        };

        results.push({ name, ok: false, error: err.message });
      }
    }

    saveThumbCache(cache);

    const succeeded = results.filter(r => r.ok).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.ok && !r.skipped).length;

    return res.json({
      success: true,
      message: `Done — ${succeeded} regenerated, ${skipped} skipped, ${failed} failed.`,
      results
    });

  } catch (err) {
    console.error("[media] Regenerate thumbs error:", err);

    return res.status(500).json({
      success: false,
      message: "Regeneration failed",
      error: err.message
    });
  }
}
// ─── Rename ───────────────────────────────────────────────────────────────────
async function handleRename(req, res) {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.status(400).json({ success: false, message: "Missing file names" });
    }

    const oldPath = path.join(uploadDir, oldName);
    const newPath = path.join(uploadDir, newName);

    if (!fs.existsSync(oldPath))  return res.status(404).json({ success: false, message: "File not found" });
    if (fs.existsSync(newPath))   return res.status(409).json({ success: false, message: "New file name already exists" });

    fs.renameSync(oldPath, newPath);

    // Rename exact thumb if it exists
    const oldThumbExact = path.join(thumbDir, oldName);
    const newThumbExact = path.join(thumbDir, newName);
    if (fs.existsSync(oldThumbExact)) fs.renameSync(oldThumbExact, newThumbExact);

    // Also rename .jpg variant (album art / video frame)
    const oldThumbJpg = path.join(thumbDir, path.parse(oldName).name + ".jpg");
    const newThumbJpg = path.join(thumbDir, path.parse(newName).name + ".jpg");
    if (fs.existsSync(oldThumbJpg)) fs.renameSync(oldThumbJpg, newThumbJpg);

    return res.json({ success: true, message: "File renamed successfully" });
  } catch (err) {
    console.error("[media] Rename error:", err);
    return res.status(500).json({ success: false, message: "Rename failed" });
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function handleDelete(req, res) {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, message: "Missing filename" });
    }

    const filePath      = path.join(uploadDir, filename);
    const thumbExact    = path.join(thumbDir,  filename);
    const thumbJpg      = path.join(thumbDir,  path.parse(filename).name + ".jpg");

    if (fs.existsSync(filePath))   fs.unlinkSync(filePath);
    if (fs.existsSync(thumbExact)) fs.unlinkSync(thumbExact);
    if (fs.existsSync(thumbJpg))   fs.unlinkSync(thumbJpg);

    return res.json({ success: true, message: "File deleted successfully" });
  } catch (err) {
    console.error("[media] Delete error:", err);
    return res.status(500).json({ success: false, message: "Delete failed" });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  multerInstance,
  handleUpload,
  listMedia,
  regenerateThumbs,
  handleThumbnailUpload,
  handleDelete,
  handleRename,
};