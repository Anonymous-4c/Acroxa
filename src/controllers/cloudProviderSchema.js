// src/controllers/cloudProviderSchema.js
//
// Single source of truth describing which fields belong to which cloud provider,
// and which of those fields are secrets that must be encrypted at rest and never
// echoed back to the client in plaintext.
//
// Used by backupController.js (encrypt on write / redact on read) — the frontend
// has its own copy of "which fields to show per provider" driven by the DOM
// (data-provider wrappers) but this is the backend's authority on secrecy.

const PROVIDER_FIELDS = {
  s3:        { plain: ["name", "bucket", "region", "storageClass"], secret: ["accessKey", "secretKey"] },
  r2:        { plain: ["name", "bucket", "accountId", "endpoint"], secret: ["accessKey", "secretKey"] },
  b2:        { plain: ["name", "bucket", "region", "endpoint"], secret: ["accessKey", "secretKey"] },
  gdrive:    { plain: ["name", "projectId", "rootFolder", "clientId"], secret: ["clientSecret", "refreshToken"] },
  dropbox:   { plain: ["name", "appKey", "folder"], secret: ["appSecret", "refreshToken"] },
  onedrive:  { plain: ["name", "clientId", "tenantId", "rootFolder"], secret: ["clientSecret", "refreshToken"] },
  azure:     { plain: ["name", "storageAccount", "container", "endpoint"], secret: ["accountKey"] },
  gcs:       { plain: ["name", "bucket", "projectId", "folderPrefix"], secret: ["serviceAccountJSON"] },
  spaces:    { plain: ["name", "bucket", "region", "endpoint"], secret: ["accessKey", "secretKey"] },
  wasabi:    { plain: ["name", "bucket", "region", "endpoint"], secret: ["accessKey", "secretKey"] },
  linode:    { plain: ["name", "bucket", "region", "endpoint"], secret: ["accessKey", "secretKey"] },
  vultr:     { plain: ["name", "bucket", "region", "endpoint"], secret: ["accessKey", "secretKey"] },
  minio:     { plain: ["name", "bucket", "endpoint", "useSSL"], secret: ["accessKey", "secretKey"] },
  ftp:       { plain: ["name", "host", "port", "username", "directory", "passive", "useTLS"], secret: ["password"] },
  sftp:      { plain: ["name", "host", "port", "username", "directory"], secret: ["password", "privateKey"] },
  webdav:    { plain: ["name", "url", "username", "folder"], secret: ["password"] },
  "custom-s3": { plain: ["name", "bucket", "region", "endpoint", "useSSL", "forcePathStyle"], secret: ["accessKey", "secretKey"] },
};

const ALL_PROVIDERS = Object.keys(PROVIDER_FIELDS);

function getProviderFields(provider) {
  return PROVIDER_FIELDS[provider] || { plain: ["name"], secret: [] };
}

function getSecretFieldNames(provider) {
  return getProviderFields(provider).secret;
}

module.exports = { PROVIDER_FIELDS, ALL_PROVIDERS, getProviderFields, getSecretFieldNames };
