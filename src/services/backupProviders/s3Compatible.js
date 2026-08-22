// src/services/backupProviders/s3Compatible.js
//
// Real upload implementation for every S3-compatible provider:
//   s3, r2, b2, spaces, wasabi, linode, vultr, minio, custom-s3
//
// Each provider only differs in how you derive { endpoint, region, forcePathStyle }
// from the connection record — the actual upload call is identical everywhere
// because they all speak the S3 API.

const {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");
const fs   = require("fs");
const path = require("path");

/**
 * Resolve the { endpoint, region, forcePathStyle } triple for a given
 * connection, based on its provider type. Real AWS S3 needs no custom
 * endpoint at all; every other provider needs one.
 */
function _resolveClientConfig(conn) {
  const provider = conn.provider;

  switch (provider) {
    case "s3":
      // Native AWS — no custom endpoint, path-style not needed.
      return {
        region: conn.region || "us-east-1",
        endpoint: undefined,
        forcePathStyle: false,
      };

    case "r2":
      // Cloudflare R2: https://<accountId>.r2.cloudflarestorage.com
      if (!conn.accountId) throw new Error("Cloudflare R2 connection is missing Account ID");
      return {
        region: "auto",
        endpoint: `https://${conn.accountId}.r2.cloudflarestorage.com`,
        forcePathStyle: false,
      };

    case "b2":
      // Backblaze B2 S3-compatible endpoint, e.g. https://s3.us-west-004.backblazeb2.com
      if (!conn.endpoint) throw new Error("Backblaze B2 connection is missing an Endpoint URL");
      return {
        region: conn.region || "us-west-004",
        endpoint: _ensureScheme(conn.endpoint),
        forcePathStyle: true,
      };

    case "spaces":
      // DigitalOcean Spaces, e.g. https://nyc3.digitaloceanspaces.com
      return {
        region: conn.region || "us-east-1",
        endpoint: conn.endpoint ? _ensureScheme(conn.endpoint) : `https://${conn.region || "nyc3"}.digitaloceanspaces.com`,
        forcePathStyle: false,
      };

    case "wasabi":
      // Wasabi, e.g. https://s3.us-east-1.wasabisys.com
      return {
        region: conn.region || "us-east-1",
        endpoint: conn.endpoint ? _ensureScheme(conn.endpoint) : `https://s3.${conn.region || "us-east-1"}.wasabisys.com`,
        forcePathStyle: false,
      };

    case "linode":
      // Linode Object Storage, e.g. https://us-east-1.linodeobjects.com
      return {
        region: conn.region || "us-east-1",
        endpoint: conn.endpoint ? _ensureScheme(conn.endpoint) : `https://${conn.region || "us-east-1"}.linodeobjects.com`,
        forcePathStyle: false,
      };

    case "vultr":
      // Vultr Object Storage, e.g. https://ewr1.vultrobjects.com
      return {
        region: conn.region || "us-east-1",
        endpoint: conn.endpoint ? _ensureScheme(conn.endpoint) : `https://${conn.region || "ewr1"}.vultrobjects.com`,
        forcePathStyle: false,
      };

    case "minio":
      // Self-hosted — endpoint always required, path-style always required.
      if (!conn.endpoint) throw new Error("MinIO connection is missing an Endpoint URL");
      return {
        region: conn.region || "us-east-1",
        endpoint: _ensureScheme(conn.endpoint, conn.useSSL !== false),
        forcePathStyle: true,
      };

    case "custom-s3":
      if (!conn.endpoint) throw new Error("Custom S3 connection is missing an Endpoint URL");
      return {
        region: conn.region || "us-east-1",
        endpoint: _ensureScheme(conn.endpoint, conn.useSSL !== false),
        forcePathStyle: conn.forcePathStyle === true,
      };

    default:
      throw new Error(`s3Compatible adapter does not support provider "${provider}"`);
  }
}

function _ensureScheme(url, useSSL = true) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${useSSL ? "https" : "http"}://${url}`;
}

/**
 * Build an S3Client for a connection. `creds` must already be decrypted
 * ({ accessKey, secretKey }) — this module never touches encryption directly.
 */
function _buildClient(conn, creds) {
  if (!creds.accessKey || !creds.secretKey) {
    throw new Error(`Missing access key or secret key for ${conn.provider} connection "${conn.name || conn.id}"`);
  }

  const { region, endpoint, forcePathStyle } = _resolveClientConfig(conn);

  return new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId: creds.accessKey,
      secretAccessKey: creds.secretKey,
    },
  });
}

/**
 * Verify a connection actually works by issuing a lightweight HeadBucket call.
 * Used by the "Test Connection" flow before saving/running a job.
 */
async function testConnection(conn, creds) {
  if (!conn.bucket) throw new Error("Bucket name is required");
  const client = _buildClient(conn, creds);
  await client.send(new HeadBucketCommand({ Bucket: conn.bucket }));
  return { ok: true };
}

/**
 * Upload a single string/buffer payload (the backup JSON) to the bucket.
 * Returns { uploaded, provider, bucket, key }.
 */
async function uploadPayload(conn, creds, { filename, content, remotePath = "" }) {
  if (!conn.bucket) throw new Error("Bucket name is required");

  const client = _buildClient(conn, creds);
  const key = path.posix.join(remotePath || "", filename).replace(/^\/+/, "");

  const putParams = {
    Bucket: conn.bucket,
    Key: key,
    Body: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"),
    ContentType: "application/json",
  };
  if (conn.storageClass) putParams.StorageClass = conn.storageClass;

  await client.send(new PutObjectCommand(putParams));

  return { uploaded: true, provider: conn.provider, bucket: conn.bucket, key };
}

/**
 * Upload every file in a local directory (used for includeMedia backups)
 * under `<remotePath>/media/<filename>`. Returns a summary of file counts.
 */
async function uploadDirectory(conn, creds, { localDir, remotePath = "" }) {
  if (!fs.existsSync(localDir)) return { uploaded: true, count: 0 };

  const client = _buildClient(conn, creds);
  const files = (await fs.promises.readdir(localDir, { withFileTypes: true })).filter(f => f.isFile());

  let count = 0;
  for (const file of files) {
    const filePath = path.join(localDir, file.name);
    const key = path.posix.join(remotePath || "", "media", file.name).replace(/^\/+/, "");
    const body = await fs.promises.readFile(filePath);

    await client.send(new PutObjectCommand({
      Bucket: conn.bucket,
      Key: key,
      Body: body,
    }));
    count++;
  }

  return { uploaded: true, count };
}

module.exports = { testConnection, uploadPayload, uploadDirectory, _resolveClientConfig };
