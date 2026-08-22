/**
 * backups.js  —  /acrx/system/backups
 * Handles: export, restore, backup history, scheduled policy config,
 * multi-connection cloud storage (add/edit/delete), and backup jobs
 * that tie a connection to an enable/media/path configuration.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('backup-policy-form');
  const saveBtn = document.getElementById('backup-save-btn');

  if (!form) return;

  // Local cache of connections, kept in sync with the server so the Jobs
  // section's "Connection" dropdown can be rebuilt without a round-trip.
  let _connectionsCache = [];

  /* ────────────────────────────────────────────────────────────────────────
   * Load backup policy (schedule / targets / git)
   * ──────────────────────────────────────────────────────────────────────── */
  try {
    const d  = await System.getBackupPolicy();
    const sc = d.schedule ?? {};
    const tg = d.targets  ?? {};
    const gc = d.git      ?? {};

    System.populateForm(form, {
      backupEnabled:   d.enabled       ?? false,
      backupInterval:  sc.interval     ?? 'daily',
      backupTime:      sc.time         ?? '02:00',
      customInterval:  sc.customInterval ?? 0,
      includeMedia:    d.includeMedia  ?? false,
      targetLocal:     tg.local        ?? true,
      targetGit:       tg.git          ?? false,
      targetCloud:     tg.cloud        ?? false,
      gitRepoURL:      gc.repoURL      ?? '',
      gitBranch:       gc.branch       ?? 'main',
      gitToken:        '',                          // never pre-fill token
      gitAuthorName:   gc.authorName   ?? 'Acroxa CMS',
      gitAuthorEmail:  gc.authorEmail  ?? '',
    });

    if (gc.tokenSet) _showSaved('gitToken');
  } catch (err) {
    System.showToast('Could not load backup policy.', 'error');
    console.error('[Backups] load policy:', err);
  }

  // ── Load backup history, connections, and jobs ───────────────────────────
  await _loadHistory();
  await _loadConnections();
  await _loadJobs();

  // ── Show/hide custom interval field ──────────────────────────────────────
  const backupIntervalWrapper = form.querySelector('[data-dropdown-id="backupInterval"]');
  const intervalHidden  = backupIntervalWrapper?.querySelector('.dropdown-hidden-input');
  const customWrap      = form.querySelector('#customInterval')?.closest('.field');

  function _syncIntervalField() {
    const val = intervalHidden?.value;
    customWrap?.classList.toggle('field-hidden', val !== 'custom');
  }
  intervalHidden?.addEventListener('change', _syncIntervalField);

  // Use event delegation on the dropdown wrapper for dynamically created items
  if (backupIntervalWrapper) {
    backupIntervalWrapper.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
    });
  }

  _syncIntervalField();
  document.getElementById('export-backup-btn')?.addEventListener('click', () => {
    const media = form.querySelector('#includeMedia')?.checked;
    System.downloadBackup(media);
  });

  // ── Import / restore ──────────────────────────────────────────────────────
  document.getElementById('import-backup-btn')?.addEventListener('click', () =>
    document.getElementById('restore-input')?.click()
  );

  document.getElementById('restore-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Restore from this backup? Current settings will be overwritten. This cannot be undone.')) {
      e.target.value = ''; return;
    }
    try {
      const text    = await file.text();
      const payload = JSON.parse(text);
      await System.importBackup(payload);
      System.showToast('Backup restored. Reloading…', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      System.showToast(`Restore failed: ${err.message}`, 'error');
    }
    e.target.value = '';
  });

  // ── Save policy (schedule / targets / git only — cloud handled separately) ─
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      
      const payload = {
        enabled: flat.backupEnabled,
        schedule: {
          interval:       flat.backupInterval,
          time:           flat.backupTime,
          customInterval: Number(flat.customInterval),
        },
        targets: {
          local: flat.targetLocal,
          git:   flat.targetGit,
          cloud: flat.targetCloud,
        },
        includeMedia: flat.includeMedia,
        git: {
          repoURL:     flat.gitRepoURL,
          branch:      flat.gitBranch,
          authorName:  flat.gitAuthorName,
          authorEmail: flat.gitAuthorEmail,
          token:       flat.gitToken || '', // empty string = keep existing (handled server-side)
        },
      };
      const res = await System.updateBackupPolicy(payload);
      System.showToast('Backup policy saved.');

      // Re-mask git token field if one is now set
      if (res?.data?.git?.tokenSet) {
        _showSaved('gitToken');
        const el = form.querySelector('#gitToken');
        if (el) el.value = '';
      }
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
   *  CLOUD CONNECTIONS
   * ══════════════════════════════════════════════════════════════════════ */

  const connFormWrap   = document.getElementById('connection-form-wrap');
  const connFieldsRoot = document.getElementById('connection-fields');
  const providerDropdownWrap = form.querySelector('[data-dropdown-id="cloudProvider"]');
  const providerHiddenInput  = providerDropdownWrap?.querySelector('.dropdown-hidden-input');

  const PROVIDER_ID_MAP = {
    s3:        { connName: 's3ConnectionName',       fields: ['s3Bucket','s3Region','s3AccessKey','s3SecretKey','s3StorageClass'] },
    r2:        { connName: 'r2ConnectionName',        fields: ['r2Bucket','r2AccountId','r2AccessKey','r2SecretKey','r2Endpoint'] },
    b2:        { connName: 'b2ConnectionName',        fields: ['b2Bucket','b2Region','b2KeyId','b2ApplicationKey','b2Endpoint'] },
    gdrive:    { connName: 'gdriveConnectionName',    fields: ['gdriveProjectId','gdriveRootFolder','gdriveClientId','gdriveClientSecret','gdriveRefreshToken'] },
    dropbox:   { connName: 'dropboxConnectionName',   fields: ['dropboxAppKey','dropboxAppSecret','dropboxRefreshToken','dropboxFolder'] },
    onedrive:  { connName: 'onedriveConnectionName',  fields: ['onedriveClientId','onedriveTenantId','onedriveClientSecret','onedriveRefreshToken','onedriveRootFolder'] },
    azure:     { connName: 'azureConnectionName',     fields: ['azureStorageAccount','azureContainer','azureAccountKey','azureEndpoint'] },
    gcs:       { connName: 'gcsConnectionName',       fields: ['gcsBucket','gcsProjectId','gcsServiceAccount','gcsFolderPrefix'] },
    spaces:    { connName: 'spacesConnectionName',    fields: ['spacesName','spacesRegion','spacesAccessKey','spacesSecretKey','spacesEndpoint'] },
    wasabi:    { connName: 'wasabiConnectionName',    fields: ['wasabiBucket','wasabiRegion','wasabiAccessKey','wasabiSecretKey','wasabiEndpoint'] },
    linode:    { connName: 'linodeConnectionName',    fields: ['linodeBucket','linodeRegion','linodeAccessKey','linodeSecretKey','linodeEndpoint'] },
    vultr:     { connName: 'vultrConnectionName',     fields: ['vultrBucket','vultrRegion','vultrAccessKey','vultrSecretKey','vultrEndpoint'] },
    minio:     { connName: 'minioConnectionName',     fields: ['minioBucket','minioEndpoint','minioAccessKey','minioSecretKey','minioSSL'] },
    ftp:       { connName: 'ftpConnectionName',       fields: ['ftpHost','ftpPort','ftpUsername','ftpPassword','ftpDirectory','ftpPassive','ftpTLS'] },
    sftp:      { connName: 'sftpConnectionName',      fields: ['sftpHost','sftpPort','sftpUsername','sftpPassword','sftpPrivateKey','sftpDirectory'] },
    webdav:    { connName: 'webdavConnectionName',    fields: ['webdavUrl','webdavUsername','webdavPassword','webdavFolder'] },
    'custom-s3': { connName: 'customS3ConnectionName', fields: ['customS3Bucket','customS3Region','customS3Endpoint','customS3AccessKey','customS3SecretKey','customS3SSL','customS3PathStyle'] },
  };

  // Maps each provider's prefixed field id → the flat backend field name.
  const PROVIDER_FIELD_KEY_MAP = {
    s3:        { s3Bucket:'bucket', s3Region:'region', s3AccessKey:'accessKey', s3SecretKey:'secretKey', s3StorageClass:'storageClass' },
    r2:        { r2Bucket:'bucket', r2AccountId:'accountId', r2AccessKey:'accessKey', r2SecretKey:'secretKey', r2Endpoint:'endpoint' },
    b2:        { b2Bucket:'bucket', b2Region:'region', b2KeyId:'accessKey', b2ApplicationKey:'secretKey', b2Endpoint:'endpoint' },
    gdrive:    { gdriveProjectId:'projectId', gdriveRootFolder:'rootFolder', gdriveClientId:'clientId', gdriveClientSecret:'clientSecret', gdriveRefreshToken:'refreshToken' },
    dropbox:   { dropboxAppKey:'appKey', dropboxAppSecret:'appSecret', dropboxRefreshToken:'refreshToken', dropboxFolder:'folder' },
    onedrive:  { onedriveClientId:'clientId', onedriveTenantId:'tenantId', onedriveClientSecret:'clientSecret', onedriveRefreshToken:'refreshToken', onedriveRootFolder:'rootFolder' },
    azure:     { azureStorageAccount:'storageAccount', azureContainer:'container', azureAccountKey:'accountKey', azureEndpoint:'endpoint' },
    gcs:       { gcsBucket:'bucket', gcsProjectId:'projectId', gcsServiceAccount:'serviceAccountJSON', gcsFolderPrefix:'folderPrefix' },
    spaces:    { spacesName:'bucket', spacesRegion:'region', spacesAccessKey:'accessKey', spacesSecretKey:'secretKey', spacesEndpoint:'endpoint' },
    wasabi:    { wasabiBucket:'bucket', wasabiRegion:'region', wasabiAccessKey:'accessKey', wasabiSecretKey:'secretKey', wasabiEndpoint:'endpoint' },
    linode:    { linodeBucket:'bucket', linodeRegion:'region', linodeAccessKey:'accessKey', linodeSecretKey:'secretKey', linodeEndpoint:'endpoint' },
    vultr:     { vultrBucket:'bucket', vultrRegion:'region', vultrAccessKey:'accessKey', vultrSecretKey:'secretKey', vultrEndpoint:'endpoint' },
    minio:     { minioBucket:'bucket', minioEndpoint:'endpoint', minioAccessKey:'accessKey', minioSecretKey:'secretKey', minioSSL:'useSSL' },
    ftp:       { ftpHost:'host', ftpPort:'port', ftpUsername:'username', ftpPassword:'password', ftpDirectory:'directory', ftpPassive:'passive', ftpTLS:'useTLS' },
    sftp:      { sftpHost:'host', sftpPort:'port', sftpUsername:'username', sftpPassword:'password', sftpPrivateKey:'privateKey', sftpDirectory:'directory' },
    webdav:    { webdavUrl:'url', webdavUsername:'username', webdavPassword:'password', webdavFolder:'folder' },
    'custom-s3': { customS3Bucket:'bucket', customS3Region:'region', customS3Endpoint:'endpoint', customS3AccessKey:'accessKey', customS3SecretKey:'secretKey', customS3SSL:'useSSL', customS3PathStyle:'forcePathStyle' },
  };

  const SECRET_FIELD_NAMES = {
    s3: ['accessKey','secretKey'], r2: ['accessKey','secretKey'], b2: ['accessKey','secretKey'],
    gdrive: ['clientSecret','refreshToken'], dropbox: ['appSecret','refreshToken'],
    onedrive: ['clientSecret','refreshToken'], azure: ['accountKey'], gcs: ['serviceAccountJSON'],
    spaces: ['accessKey','secretKey'], wasabi: ['accessKey','secretKey'], linode: ['accessKey','secretKey'],
    vultr: ['accessKey','secretKey'], minio: ['accessKey','secretKey'],
    ftp: ['password'], sftp: ['password','privateKey'], webdav: ['password'], 'custom-s3': ['accessKey','secretKey'],
  };

  function _showProviderFields(provider) {
    connFieldsRoot?.querySelectorAll('.provider-fields').forEach(block => {
      block.hidden = block.dataset.provider !== provider;
    });
  }

  function _resetConnectionForm() {
    document.getElementById('connectionEditId').value = '';
    connFieldsRoot?.querySelectorAll('input, textarea').forEach(i => {
      if (i.type === 'checkbox') i.checked = i.id.endsWith('SSL'); // sensible SSL-on default
      else i.value = '';
    });
    // Reset provider dropdown to first option (s3)
    if (providerHiddenInput) providerHiddenInput.value = 's3';
    _showProviderFields('s3');
  }

  providerHiddenInput?.addEventListener('change', () => {
    _showProviderFields(providerHiddenInput.value);
  });

  document.getElementById('add-connection-btn')?.addEventListener('click', () => {
    _resetConnectionForm();
    connFormWrap.hidden = false;
    connFormWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('cancel-connection-btn')?.addEventListener('click', () => {
    connFormWrap.hidden = true;
    _resetConnectionForm();
  });

  document.getElementById('test-connection-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-connection-btn');
    const provider = providerHiddenInput?.value || 's3';
    const map = PROVIDER_ID_MAP[provider];
    const keyMap = PROVIDER_FIELD_KEY_MAP[provider] || {};
    const secretFields = SECRET_FIELD_NAMES[provider] || [];
    const editId = document.getElementById('connectionEditId').value;
    if (!map) { System.showToast('Unknown provider', 'error'); return; }

    btn.disabled = true;
    const span = btn.querySelector('span');
    const originalLabel = span?.textContent;
    if (span) span.textContent = 'Testing…';

    try {
      // Collect current form values
      const flat = { provider };
      map.fields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (!el) return;
        const key = keyMap[fieldId] || fieldId;
        flat[key] = el.type === 'checkbox' ? el.checked : el.value;
      });

      // If every secret field is blank AND we're editing a saved connection,
      // test against the stored (already-encrypted) credentials by id instead —
      // that avoids forcing a re-type of secrets just to run a test.
      const allSecretsBlank = secretFields.every(key => !flat[key]);
      const payload = (editId && allSecretsBlank) ? { id: editId } : flat;

      await System.testConnection(payload);
      System.showToast('Connection successful.', 'success');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      if (span && originalLabel) span.textContent = originalLabel;
    }
  });

  document.getElementById('save-connection-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('save-connection-btn');
    const provider = providerHiddenInput?.value || 's3';
    const map = PROVIDER_ID_MAP[provider];
    const keyMap = PROVIDER_FIELD_KEY_MAP[provider] || {};
    if (!map) { System.showToast('Unknown provider', 'error'); return; }

    const nameEl = document.getElementById(map.connName);
    const flat = { provider, name: nameEl?.value?.trim() || '' };

    map.fields.forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      const key = keyMap[fieldId] || fieldId;
      flat[key] = el.type === 'checkbox' ? el.checked : el.value;
    });

    if (!flat.name) {
      System.showToast('Connection name is required.', 'error');
      return;
    }

    const editId = document.getElementById('connectionEditId').value;

    btn.disabled = true;
    try {
      if (editId) {
        await System.updateConnection(editId, flat);
        System.showToast('Connection updated.');
      } else {
        await System.createConnection(flat);
        System.showToast('Connection added.');
      }
      connFormWrap.hidden = true;
      _resetConnectionForm();
      await _loadConnections();
      await _loadJobs(); // job dropdown options may reference this connection's name
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  async function _loadConnections() {
    const container = document.getElementById('connections-list');
    if (!container) return;
    container.innerHTML = '<p class="text-muted loading-text">Loading…</p>';

    try {
      const list = await System.getConnections();
      _connectionsCache = list;

      if (!list.length) {
        container.innerHTML = '<p class="text-muted">No cloud connections yet. Add one below.</p>';
        return;
      }

      container.innerHTML = '';
      list.forEach(conn => {
        const row = document.createElement('div');
        row.className = 'connection-row backup-row';
        row.innerHTML = `
          <span class="connection-provider"><i class="fa-brands fa-${_escAttr(conn.provider)}"></i> ${_esc(_providerLabel(conn.provider))}</span>
          <span class="connection-name">${_esc(conn.name || '(unnamed)')}</span>
          <span class="connection-target text-muted">${_esc(conn.bucket || conn.host || conn.url || conn.container || '')}</span>
          <div class="connection-row-actions">
            <button class="btn btn-secondary btn-sm" data-edit-conn="${_escAttr(conn.id)}" title="Edit">
              <i class="fa-duotone fa-pen"></i>
            </button>
            <button class="btn btn-danger-ghost btn-sm" data-delete-conn="${_escAttr(conn.id)}" title="Delete">
              <i class="fa-duotone fa-trash"></i>
            </button>
          </div>
        `;
        container.appendChild(row);
      });

      container.querySelectorAll('[data-edit-conn]').forEach(btn => {
        btn.addEventListener('click', () => _editConnection(btn.dataset.editConn));
      });
      container.querySelectorAll('[data-delete-conn]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this connection? Any jobs using it will also be removed.')) return;
          try {
            await System.deleteConnection(btn.dataset.deleteConn);
            System.showToast('Connection deleted.');
            await _loadConnections();
            await _loadJobs();
          } catch (err) {
            System.showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="text-muted">Could not load connections: ${err.message}</p>`;
    }
  }

  function _editConnection(id) {
    const conn = _connectionsCache.find(c => c.id === id);
    if (!conn) return;

    _resetConnectionForm();
    document.getElementById('connectionEditId').value = id;

    if (providerHiddenInput) providerHiddenInput.value = conn.provider;
    _showProviderFields(conn.provider);
    // Update visible dropdown label too
    System.syncDropdowns(form, { cloudProvider: conn.provider });

    const map = PROVIDER_ID_MAP[conn.provider];
    const keyMap = PROVIDER_FIELD_KEY_MAP[conn.provider] || {};
    const secretFields = SECRET_FIELD_NAMES[conn.provider] || [];
    if (!map) return;

    const nameEl = document.getElementById(map.connName);
    if (nameEl) nameEl.value = conn.name || '';

    map.fields.forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      const key = keyMap[fieldId] || fieldId;

      if (secretFields.includes(key)) {
        // Never pre-fill secret value; show a "saved" placeholder if server flagged it set.
        el.value = '';
        if (conn[`${key}Set`]) {
          el.placeholder = '••••••••  (saved — type to replace)';
        }
        return;
      }

      if (el.type === 'checkbox') el.checked = Boolean(conn[key]);
      else el.value = conn[key] ?? '';
    });

    connFormWrap.hidden = false;
    connFormWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _providerLabel(provider) {
    const labels = {
      s3: 'Amazon S3', r2: 'Cloudflare R2', b2: 'Backblaze B2', gdrive: 'Google Drive',
      dropbox: 'Dropbox', onedrive: 'OneDrive', azure: 'Azure Blob Storage', gcs: 'Google Cloud Storage',
      spaces: 'DigitalOcean Spaces', wasabi: 'Wasabi', linode: 'Linode Object Storage',
      vultr: 'Vultr Object Storage', minio: 'MinIO', ftp: 'FTP', sftp: 'SFTP', webdav: 'WebDAV',
      'custom-s3': 'Custom S3 Compatible',
    };
    return labels[provider] || provider;
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  BACKUP JOBS
   * ══════════════════════════════════════════════════════════════════════ */

  const jobFormWrap = document.getElementById('job-form-wrap');
  const jobConnDropdownWrap = document.getElementById('jobConnectionSelectWrap')?.querySelector('[data-dropdown-id="jobConnectionId"]')
    || form.querySelector('[data-dropdown-id="jobConnectionId"]');

  function _rebuildJobConnectionOptions(selected = '') {
    const options = _connectionsCache.map(c => ({ value: c.id, label: `${_providerLabel(c.provider)} — ${c.name || c.id.slice(0, 8)}` }));
    if (!options.length) options.push({ value: '', label: 'No connections available' });

    if (jobConnDropdownWrap) {
      System.setDropdownOptions(jobConnDropdownWrap, options, selected);
    }
  }

  function _resetJobForm() {
    document.getElementById('jobEditId').value = '';
    const nameEl = document.getElementById('jobName');
    const pathEl = document.getElementById('jobBackupPath');
    if (nameEl) nameEl.value = '';
    if (pathEl) pathEl.value = '';
    const enabledEl = document.getElementById('jobEnabled');
    const mediaEl = document.getElementById('jobIncludeMedia');
    if (enabledEl) enabledEl.checked = true;
    if (mediaEl) mediaEl.checked = true;
    _rebuildJobConnectionOptions();
  }

  document.getElementById('add-job-btn')?.addEventListener('click', () => {
    if (!_connectionsCache.length) {
      System.showToast('Add a cloud connection first.', 'warning');
      return;
    }
    _resetJobForm();
    jobFormWrap.hidden = false;
    jobFormWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('cancel-job-btn')?.addEventListener('click', () => {
    jobFormWrap.hidden = true;
    _resetJobForm();
  });

  document.getElementById('save-job-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('save-job-btn');
    const editId = document.getElementById('jobEditId').value;

    const connectionId = jobConnDropdownWrap?.querySelector('.dropdown-hidden-input')?.value || '';
    if (!connectionId) {
      System.showToast('Select a connection for this job.', 'error');
      return;
    }

    const payload = {
      connectionId,
      name: document.getElementById('jobName')?.value?.trim() || '',
      backupPath: document.getElementById('jobBackupPath')?.value || '',
      enabled: document.getElementById('jobEnabled')?.checked ?? true,
      includeMedia: document.getElementById('jobIncludeMedia')?.checked ?? true,
    };

    btn.disabled = true;
    try {
      if (editId) {
        await System.updateJob(editId, payload);
        System.showToast('Job updated.');
      } else {
        await System.createJob(payload);
        System.showToast('Job added.');
      }
      jobFormWrap.hidden = true;
      _resetJobForm();
      await _loadJobs();
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  async function _loadJobs() {
    const container = document.getElementById('jobs-list');
    if (!container) return;
    container.innerHTML = '<p class="text-muted loading-text">Loading…</p>';

    try {
      const jobs = await System.getJobs();

      if (!jobs.length) {
        container.innerHTML = '<p class="text-muted">No backup jobs yet.</p>';
        return;
      }

      container.innerHTML = '';
      jobs.forEach(job => {
        const conn = _connectionsCache.find(c => c.id === job.connectionId);
        const row = document.createElement('div');
        row.className = 'job-row backup-row';
        row.innerHTML = `
          <span class="job-status">
            <i class="fa-duotone fa-circle${job.enabled ? '-check' : ''}" style="color:${job.enabled ? 'var(--accent-success, #22c55e)' : 'var(--color-primary-400)'}"></i>
          </span>
          <span class="job-name">${_esc(job.name || '(unnamed job)')}</span>
          <span class="job-connection text-muted">${_esc(conn ? `${_providerLabel(conn.provider)} — ${conn.name}` : 'Missing connection')}</span>
          <span class="job-path text-muted">${_esc(job.backupPath || '/')}</span>
          <div class="job-row-actions">
            <button class="btn btn-secondary btn-sm" data-edit-job="${_escAttr(job.id)}" title="Edit">
              <i class="fa-duotone fa-pen"></i>
            </button>
            <button class="btn btn-danger-ghost btn-sm" data-delete-job="${_escAttr(job.id)}" title="Delete">
              <i class="fa-duotone fa-trash"></i>
            </button>
          </div>
        `;
        container.appendChild(row);
      });

      container.querySelectorAll('[data-edit-job]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const jobs = await System.getJobs();
          const job = jobs.find(j => j.id === btn.dataset.editJob);
          if (!job) return;

          document.getElementById('jobEditId').value = job.id;
          document.getElementById('jobName').value = job.name || '';
          document.getElementById('jobBackupPath').value = job.backupPath || '';
          document.getElementById('jobEnabled').checked = job.enabled !== false;
          document.getElementById('jobIncludeMedia').checked = job.includeMedia !== false;
          _rebuildJobConnectionOptions(job.connectionId);

          jobFormWrap.hidden = false;
          jobFormWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });

      container.querySelectorAll('[data-delete-job]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this backup job?')) return;
          try {
            await System.deleteJob(btn.dataset.deleteJob);
            System.showToast('Job deleted.');
            await _loadJobs();
          } catch (err) {
            System.showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="text-muted">Could not load jobs: ${err.message}</p>`;
    }
  }

  /* ── History loader ───────────────────────────────────────────────────── */
  async function _loadHistory() {
    const container = document.getElementById('backup-history');
    if (!container) return;
    container.innerHTML = '<p class="text-muted loading-text">Loading…</p>';
    try {
      const res = await System.getBackupHistory();
      const list = res.data ?? [];

      if (!list.length) {
        container.innerHTML = '<p class="text-muted">No backups found yet.</p>';
        return;
      }

      container.innerHTML = '';
      const table = document.createElement('div');
      table.className = 'backup-history-list';
      const mainHeader = document.createElement('div');
      mainHeader.className = 'backup-row backup-header';
      mainHeader.innerHTML = `
          <span class="backup-filename">NAME</span>
          <span class="backup-size text-muted">SIZE</span>
          <span class="backup-date text-muted">DATE</span>
          <span class="backup-actions text-muted">ACTIONS</span>`;
      table.appendChild(mainHeader);
      list.forEach(b => {
        const row = document.createElement('div');
        row.className = 'backup-row';
        row.innerHTML = `
          <span class="backup-filename">${_esc(b.filename)}</span>
          <span class="backup-size text-muted">${(b.size / 1024).toFixed(1)} KB</span>
          <span class="backup-date text-muted">${new Date(b.createdAt).toLocaleString()}</span>
          <div class="backup-row-actions">
            <button class="btn btn-secondary btn-sm" data-download="${_escAttr(b.filename)}" title="Download">
              <i class="fa-duotone fa-download"></i>
            </button>
            <button class="btn btn-danger-ghost btn-sm" data-delete="${_escAttr(b.filename)}" title="Delete">
              <i class="fa-duotone fa-trash"></i>
            </button>
          </div>
        `;
        table.appendChild(row);
      });

      container.appendChild(table);

      container.querySelectorAll('[data-download]').forEach(btn => {
        btn.addEventListener('click', () => System.downloadSavedBackup(btn.dataset.download));
      });

      container.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Delete ${btn.dataset.delete}?`)) return;
          try {
            await System.deleteBackup(btn.dataset.delete);
            System.showToast('Backup deleted.');
            _loadHistory();
          } catch (err) {
            System.showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="text-muted">Could not load history: ${err.message}</p>`;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _showSaved(inputId) {
    const el = form.querySelector(`#${inputId}`);
    if (el) el.placeholder = '••••••••  (saved — type to replace)';
  }

  function _esc(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
  }

  function _escAttr(str) {
    return _esc(str);
  }
});