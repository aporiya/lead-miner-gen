/* ═══════════════════════════════════════════════════════
   LEAD MINER — Single Page Application JavaScript
   Tabs: Lead Miner | CSV Files | CSV Viewer (dynamic)
═══════════════════════════════════════════════════════ */

'use strict';

// ─── GLOBAL STATE ─────────────────────────────────────
const State = {
  activeTab: 'miner',
  csrfToken: '',
  isCrawling: false,
  crawlStart: null,
  timerHandle: null,
  lastResult: null,
  viewerTabs: {},
  nextViewerId: 1,
};

// ─── THEME MANAGER ───────────────────────────────────
const Theme = {
  KEY: 'lead-miner-theme',

  init() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => this.toggle());
    this._apply(this.get());
    window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(this.KEY)) {
        this._apply(e.matches ? 'dark' : 'light');
      }
    });
  },

  get() {
    const stored = localStorage.getItem(this.KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  },

  toggle() {
    const next = this.get() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.KEY, next);
    this._apply(next);
  },

  _apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
      const sun = document.getElementById('toggle-sun');
      const moon = document.getElementById('toggle-moon');
      if (sun && moon) {
        if (theme === 'dark') {
          moon.classList.add('active');
          moon.classList.remove('inactive');
          sun.classList.remove('active');
          sun.classList.add('inactive');
        } else {
          sun.classList.add('active');
          sun.classList.remove('inactive');
          moon.classList.remove('active');
          moon.classList.add('inactive');
        }
      }
    }
  },
};

// ─── DOM REFS ──────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const D = {
    dynamicTabs:       $('dynamic-tabs'),
    viewerPanels:      $('viewer-panels'),
    statusDot:         $('status-dot'),
    statusLabel:       $('status-label'),
    minerBadge:        $('miner-running-badge'),
    csvFileCount:      $('csv-file-count'),

    // Miner form
    minerForm:         $('miner-form'),
    startBtn:          $('start-btn'),
    startBtnLabel:     $('start-btn-label'),
    startSpinner:      $('start-spinner'),
    startRocket:       $('start-rocket'),
    gotoFilesBtn:      $('goto-files-btn'),

    // Status card
    crawlCard:         $('crawl-status-card'),
    crawlTitle:        $('crawl-title'),
    crawlMsg:          $('crawl-message'),
    progressBar:       $('progress-bar'),
    progressPct:       $('progress-pct'),
    progressDetail:    $('progress-detail'),
    statLeads:         $('stat-leads'),
    statStatus:        $('stat-status'),
    statTime:          $('stat-time'),
    statusOrb:         $('status-orb'),
    statusActions:     $('status-actions'),
    viewResultBtn:     $('view-result-btn'),
    newSearchBtn:      $('new-search-btn'),

    // CSV Files panel
    refreshBtn:        $('refresh-btn'),
    csvEmpty:          $('csv-empty'),
    csvGrid:           $('csv-grid'),
    goMinerBtn:        $('go-miner-btn'),

    // Toast
    toastContainer:    $('toast-container'),
};

// ─── TAB MANAGER ──────────────────────────────────────
const Tabs = {
    switch(tabId) {
        State.activeTab = tabId;

        // Update nav-tab buttons
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
            btn.setAttribute('aria-selected', btn.dataset.tab === tabId);
        });

        // Update panels
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.classList.toggle('active', p.id === `panel-${tabId}`);
        });
        document.querySelectorAll('.viewer-panel').forEach(p => {
            p.classList.toggle('active', p.id === `viewer-${tabId}`);
        });
    },

    openViewer(filename) {
        // Check if already open
        for (const [tid, data] of Object.entries(State.viewerTabs)) {
            if (data.filename === filename) { this.switch(tid); return; }
        }

        const tabId = `view-${State.nextViewerId++}`;
        State.viewerTabs[tabId] = { filename };

        // Create nav tab button
        const btn = document.createElement('button');
        btn.className = 'nav-tab';
        btn.dataset.tab = tabId;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
        btn.id = `tab-btn-${tabId}`;

        const shortName = filename.length > 22 ? filename.slice(0, 20) + '…' : filename;
        btn.innerHTML = `
            <span class="nav-tab-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
            </span>
            <span class="nav-tab-label">${shortName}</span>
            <button class="nav-tab-close" title="Close tab" aria-label="Close ${filename}">✕</button>
        `;
        btn.querySelector('.nav-tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeViewer(tabId);
        });
        btn.addEventListener('click', () => this.switch(tabId));
        D.dynamicTabs.appendChild(btn);

        // Create panel
        const panel = document.createElement('div');
        panel.className = 'viewer-panel tab-panel';
        panel.id = `viewer-${tabId}`;
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = `
            <div class="viewer-header">
                <div class="viewer-header-left">
                    <button class="btn-ghost" data-back-csv title="Back to CSV Files">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        CSV Files
                    </button>
                    <span class="viewer-filename" title="${filename}">${filename}</span>
                    <span class="badge badge-purple" id="viewer-count-${tabId}">Loading…</span>
                </div>
                <div class="viewer-header-right">
                    <a class="btn-ghost hidden" id="viewer-dl-${tabId}" href="/api/download/${encodeURIComponent(filename)}" download="${filename}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download CSV
                    </a>
                </div>
            </div>
            <div class="viewer-body">
                <div class="table-wrap">
                    <table class="leads-table" id="viewer-table-${tabId}">
                        <colgroup><col><col><col><col><col><col><col></colgroup>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Business Name</th>
                                <th>Contact Person</th>
                                <th>Phone Numbers</th>
                                <th>Emails</th>
                                <th>Website</th>
                                <th>LinkedIn</th>
                            </tr>
                        </thead>
                        <tbody id="viewer-tbody-${tabId}">
                            <tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-3)">Loading data…</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        panel.querySelector('[data-back-csv]').addEventListener('click', () => this.switch('csv-files'));
        D.viewerPanels.appendChild(panel);

        this.switch(tabId);
        CsvViewer.load(tabId, filename);
    },

    closeViewer(tabId) {
        delete State.viewerTabs[tabId];
        document.getElementById(`tab-btn-${tabId}`)?.remove();
        document.getElementById(`viewer-${tabId}`)?.remove();
        if (State.activeTab === tabId) this.switch('csv-files');
    },
};

// ─── CSRF ─────────────────────────────────────────────
const CSRF = {
    async fetch() {
        try {
            const res = await fetch('/api/csrf-token');
            const json = await res.json();
            State.csrfToken = json.token || '';
        } catch {
            State.csrfToken = '';
        }
    },
    get() { return State.csrfToken; },
};

// ─── LEAD MINER ───────────────────────────────────────
const Miner = {
    _timer: null,

    init() {
        D.minerForm.addEventListener('submit', (e) => { e.preventDefault(); this.start(); });
        D.gotoFilesBtn.addEventListener('click', () => Tabs.switch('csv-files'));
        D.viewResultBtn.addEventListener('click', () => this._onViewResult());
        D.newSearchBtn.addEventListener('click', () => this._reset());
    },

    async start() {
        if (State.isCrawling) { Toast.show('A crawl is already running.', 'error'); return; }

        const fd = new FormData(D.minerForm);
        const payload = {
            industry:  (fd.get('industry') || '').trim(),
            location:  (fd.get('location') || '').trim(),
            niche:     (fd.get('niche') || '').trim(),
            num_leads: parseInt(fd.get('num_leads'), 10) || 10,
        };

        if (!payload.industry || !payload.location || !payload.niche) {
            Toast.show('Please fill in all required fields.', 'error'); return;
        }
        if (payload.num_leads < 1 || payload.num_leads > 100) {
            Toast.show('Number of leads must be between 1 and 100.', 'error'); return;
        }

        // Ensure fresh CSRF token
        await CSRF.fetch();
        if (!CSRF.get()) { Toast.show('Could not fetch security token. Reload and try again.', 'error'); return; }

        State.isCrawling = true;
        State.crawlStart = Date.now();
        State.lastResult = null;
        this._setRunning();
        this._startTimer();

        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': CSRF.get(),
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `Server error ${res.status}`);
            }

            const data = await res.json();
            State.lastResult = data;
            this._setDone(data);

        } catch (err) {
            this._setFailed(err.message || 'Crawl failed');
        }
    },

    _setRunning() {
        D.startBtn.disabled = true;
        D.startSpinner.classList.remove('hidden');
        D.startRocket.classList.add('hidden');
        D.startBtnLabel.textContent = 'Crawling…';

        D.crawlCard.classList.remove('hidden');
        D.statusActions.classList.add('hidden');
        D.statusOrb.className = 'status-orb';
        D.crawlTitle.textContent = 'Mining in Progress';
        D.crawlMsg.textContent = 'AI agents are traversing the web to find your leads…';
        D.statStatus.textContent = 'Running';
        D.statLeads.textContent = '—';
        this._setProgress(0, 'Initializing crawl engines…');

        // Global nav status
        D.statusDot.className = 'status-dot running';
        D.statusLabel.textContent = 'Running';
        D.minerBadge.classList.remove('hidden');
    },

    _setDone(data) {
        State.isCrawling = false;
        this._stopTimer();

        const count = data.leads?.length ?? 0;

        D.startBtn.disabled = false;
        D.startSpinner.classList.add('hidden');
        D.startRocket.classList.remove('hidden');
        D.startBtnLabel.textContent = 'Start Crawling';

        D.statusOrb.className = 'status-orb done';
        D.crawlTitle.textContent = 'Extraction Complete';
        D.crawlMsg.textContent = `Successfully extracted ${count} lead${count !== 1 ? 's' : ''}`;
        D.statLeads.textContent = count;
        D.statStatus.textContent = 'Completed';
        this._setProgress(100, 'Done!');

        D.statusDot.className = 'status-dot';
        D.statusLabel.textContent = 'Ready';
        D.minerBadge.classList.add('hidden');
        D.statusActions.classList.remove('hidden');

        Toast.show(`✓ Extracted ${count} leads successfully!`, 'success');
        CsvFiles.load(); // Refresh file list in background
    },

    _setFailed(msg) {
        State.isCrawling = false;
        this._stopTimer();

        D.startBtn.disabled = false;
        D.startSpinner.classList.add('hidden');
        D.startRocket.classList.remove('hidden');
        D.startBtnLabel.textContent = 'Start Crawling';

        D.statusOrb.className = 'status-orb error';
        D.crawlTitle.textContent = 'Extraction Failed';
        D.crawlMsg.textContent = msg;
        D.statStatus.textContent = 'Failed';

        D.statusDot.className = 'status-dot error';
        D.statusLabel.textContent = 'Error';
        D.minerBadge.classList.add('hidden');
        D.statusActions.classList.remove('hidden');
        D.viewResultBtn.classList.add('hidden');

        Toast.show(msg, 'error');
    },

    _reset() {
        D.crawlCard.classList.add('hidden');
        D.viewResultBtn.classList.remove('hidden');
        State.lastResult = null;
    },

    _onViewResult() {
        if (!State.lastResult?.download_url) {
            Tabs.switch('csv-files'); return;
        }
        // Extract filename from download URL
        const url = State.lastResult.download_url;
        const filename = url.split('/').pop();
        if (filename) {
            CsvFiles.load();
            Tabs.openViewer(filename);
        } else {
            Tabs.switch('csv-files');
        }
    },

    _startTimer() {
        this._timer = setInterval(() => {
            const elapsed = Math.round((Date.now() - State.crawlStart) / 1000);
            D.statTime.textContent = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m ${elapsed%60}s`;

            // Animate progress (fake progress up to 90% while waiting)
            const maxFake = 90;
            const fake = Math.min(maxFake, Math.round((elapsed / 240) * maxFake));
            this._setProgress(fake, this._progressMsg(elapsed));
        }, 1000);
    },

    _stopTimer() { clearInterval(this._timer); this._timer = null; },

    _setProgress(pct, detail) {
        D.progressBar.style.width = `${pct}%`;
        D.progressPct.textContent = `${pct}%`;
        D.progressDetail.textContent = detail;
    },

    _progressMsg(sec) {
        if (sec < 15) return 'Initializing crawl engines…';
        if (sec < 40) return 'Discovering target websites…';
        if (sec < 80) return 'Extracting contact data…';
        if (sec < 150) return 'Enriching lead profiles…';
        return 'Finalizing results…';
    },
};

// ─── CSV FILES ────────────────────────────────────────
const CsvFiles = {
    init() {
        D.refreshBtn.addEventListener('click', () => this.load());
        D.goMinerBtn.addEventListener('click', () => Tabs.switch('miner'));
    },

    async load() {
        try {
            const res = await fetch('/api/csv-files');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { files = [] } = await res.json();
            this._render(files);

            // Update count badge
            if (files.length > 0) {
                D.csvFileCount.textContent = files.length;
                D.csvFileCount.classList.remove('hidden');
            } else {
                D.csvFileCount.classList.add('hidden');
            }
        } catch (err) {
            Toast.show(`Failed to load CSV files: ${err.message}`, 'error');
        }
    },

    _render(files) {
        D.csvGrid.innerHTML = '';
        if (!files.length) {
            D.csvEmpty.classList.remove('hidden');
            return;
        }
        D.csvEmpty.classList.add('hidden');
        files.forEach(f => {
            const card = this._card(f);
            D.csvGrid.appendChild(card);
        });
    },

    _card(f) {
        const el = document.createElement('div');
        el.className = 'csv-card';
        const recent = (Date.now() / 1000 - f.modified_at) < 86400;
        el.innerHTML = `
            <div class="csv-card-top">
                <div class="csv-card-ico">📄</div>
                <div class="csv-card-name">${f.filename}</div>
            </div>
            <div class="csv-card-meta">
                <div class="csv-meta-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>${this._dateLabel(f.modified_at)}</span>
                    ${recent ? '<span class="badge badge-green">Recent</span>' : ''}
                </div>
                <div class="csv-meta-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span>${f.record_count} record${f.record_count !== 1 ? 's' : ''}</span>
                    <span class="badge badge-purple">${this._sizeLabel(f.size)}</span>
                </div>
            </div>
        `;
        el.addEventListener('click', () => Tabs.openViewer(f.filename));
        return el;
    },

    _dateLabel(ts) {
        const d = new Date(ts * 1000);
        const diff = (Date.now() - d) / 3600000; // hours
        if (diff < 24) return `Today ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
        if (diff < 48) return `Yesterday ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
        return d.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
    },

    _sizeLabel(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
        return `${(bytes/1048576).toFixed(1)} MB`;
    },
};

// ─── CSV VIEWER ───────────────────────────────────────
const CsvViewer = {
    async load(tabId, filename) {
        const tbody = document.getElementById(`viewer-tbody-${tabId}`);
        const countBadge = document.getElementById(`viewer-count-${tabId}`);
        const dlBtn = document.getElementById(`viewer-dl-${tabId}`);

        try {
            const res = await fetch(`/api/csv-file/${encodeURIComponent(filename)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { data = [] } = await res.json();

            if (countBadge) countBadge.textContent = `${data.length} records`;
            if (dlBtn) dlBtn.classList.remove('hidden');
            this._renderRows(tbody, data);
        } catch (err) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--error)">Error: ${err.message}</td></tr>`;
            Toast.show(`Failed to load ${filename}: ${err.message}`, 'error');
        }
    },

    _renderRows(tbody, data) {
        if (!tbody) return;
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-3)">No records found in this file.</td></tr>';
            return;
        }

        const frag = document.createDocumentFragment();
        data.forEach((row, i) => {
            const name     = row['Business Name']  || row['business_name']  || '—';
            const contact  = row['Contact Person'] || row['contact_person'] || '—';
            const phone    = row['Phone Numbers']  || row['phone_numbers']  || '—';
            const email    = row['Emails']         || row['emails']         || '—';
            const website  = row['Website']        || row['website']        || '';
            const linkedin = row['LinkedIn']       || row['linkedin']       || '';

            const wsHtml = website
                ? `<a href="${website.startsWith('http') ? website : 'https://' + website}" target="_blank" rel="noopener noreferrer">${website}</a>`
                : '—';
            const liHtml = linkedin
                ? `<a href="${linkedin}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>`
                : '—';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td><strong>${name}</strong></td>
                <td>${contact}</td>
                <td>${phone}</td>
                <td>${email}</td>
                <td>${wsHtml}</td>
                <td>${liHtml}</td>
            `;
            frag.appendChild(tr);
        });
        tbody.innerHTML = '';
        tbody.appendChild(frag);
    },
};

// ─── TOAST ────────────────────────────────────────────
const Toast = {
    show(msg, type = 'info', duration = 5000) {
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        const ico = type === 'error' ? '⚠️' : type === 'success' ? '✓' : 'ℹ️';
        el.innerHTML = `<span class="toast-ico">${ico}</span><p class="toast-msg">${msg}</p><button class="toast-close" aria-label="Dismiss">✕</button>`;
        el.querySelector('.toast-close').addEventListener('click', () => el.remove());
        D.toastContainer.appendChild(el);
        setTimeout(() => el.remove(), duration);
    },
};

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Wire permanent tab buttons
  document.getElementById('tab-btn-miner').addEventListener('click', () => Tabs.switch('miner'));
  document.getElementById('tab-btn-csv').addEventListener('click', () => {
    Tabs.switch('csv-files');
    CsvFiles.load();
  });

  // Init modules
  Theme.init();
  Miner.init();
  CsvFiles.init();

    // Pre-fetch CSRF token silently
    CSRF.fetch();

    // Load CSV file list on startup (for the count badge)
    CsvFiles.load();
});
