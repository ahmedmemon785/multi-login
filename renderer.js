'use strict';

const PRESETS = [
  { name: 'WhatsApp',  url: 'https://web.whatsapp.com',       emoji: '💬' },
  { name: 'Discord',   url: 'https://discord.com/app',        emoji: '🎮' },
  { name: 'Stripe',    url: 'https://dashboard.stripe.com',   emoji: '💳' },
  { name: 'Gmail',     url: 'https://mail.google.com',        emoji: '📧' },
  { name: 'GitHub',    url: 'https://github.com',             emoji: '🐙' },
  { name: 'Slack',     url: 'https://app.slack.com',          emoji: '💼' },
  { name: 'Notion',    url: 'https://www.notion.so',          emoji: '📝' },
  { name: 'X/Twitter', url: 'https://x.com',                  emoji: '🐦' },
  { name: 'Linear',    url: 'https://linear.app',             emoji: '📐' },
  { name: 'Figma',     url: 'https://www.figma.com',          emoji: '🎨' },
  { name: 'Jira',      url: 'https://id.atlassian.com',       emoji: '🗂️' },
  { name: 'Custom',    url: '',                                emoji: '🔗' },
];

const EXPANDED_W  = 250;
const COLLAPSED_W = 60;

let sites           = [];
let activeSiteId    = null;
let activeSessionId = null;
let collapsed       = false;
const loadingSet    = new Set(); // session IDs currently loading

// ── Helpers ──────────────────────────────────────────────────

function faviconUrl(url) {
  try {
    const { origin } = new URL(url);
    return `${origin}/favicon.ico`;
  } catch { return null; }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'info', ms = 3500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.cssText = 'transition:opacity .25s,transform .25s;opacity:0;transform:translateY(6px)';
    setTimeout(() => t.remove(), 260);
  }, ms);
}

// ── Simple modal ─────────────────────────────────────────────

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalDesc    = document.getElementById('modal-desc');
const modalInput   = document.getElementById('modal-input');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel  = document.getElementById('modal-cancel');
let resolveModal   = null;

function openModal(title, desc, opts = {}) {
  const { mode = 'input', defaultValue = '', confirmLabel = 'Confirm' } = opts;
  modalTitle.textContent    = title;
  modalDesc.textContent     = desc;
  modalConfirm.textContent  = confirmLabel;
  modalConfirm.disabled     = false;
  if (mode === 'confirm') {
    modalInput.style.display = 'none';
  } else {
    modalInput.style.display = '';
    modalInput.value = defaultValue;
    modalConfirm.disabled = !defaultValue.trim();
    setTimeout(() => { modalInput.focus(); modalInput.select(); }, 30);
  }
  modalOverlay.classList.remove('hidden');
  window.api.hideView();
  return new Promise(r => { resolveModal = r; });
}

function closeModal(val) {
  modalOverlay.classList.add('hidden');
  modalInput.style.display = '';
  window.api.showView();
  if (resolveModal) { resolveModal(val ?? null); resolveModal = null; }
}

modalConfirm.addEventListener('click', () => {
  if (modalInput.style.display === 'none') { closeModal(true); return; }
  const v = modalInput.value.trim();
  if (v) closeModal(v); else modalInput.focus();
});
modalCancel.addEventListener('click', () => closeModal(null));
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(null); });
modalInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  modalConfirm.click();
  if (e.key === 'Escape') closeModal(null);
});
modalInput.addEventListener('input', () => { modalConfirm.disabled = !modalInput.value.trim(); });

// ── Add-Site modal ───────────────────────────────────────────

const addSiteOverlay = document.getElementById('add-site-overlay');
const presetGrid     = document.getElementById('preset-grid');
const siteUrlInput   = document.getElementById('site-url-input');
const siteNameInput  = document.getElementById('site-name-input');
const addSiteConfirm = document.getElementById('add-site-confirm');
const addSiteCancel  = document.getElementById('add-site-cancel');
let resolveAddSite   = null;

function buildPresetGrid() {
  presetGrid.innerHTML = '';
  PRESETS.forEach(p => {
    const btn  = document.createElement('button');
    btn.className   = 'preset-btn';
    btn.dataset.url = p.url;
    const fav  = p.url ? faviconUrl(p.url) : null;
    const icon = fav
      ? `<img class="preset-icon" src="${fav}" alt="" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><span class="preset-icon-fb" style="display:none">${p.emoji}</span>`
      : `<span class="preset-icon-fb">${p.emoji}</span>`;
    btn.innerHTML = `${icon}<span>${esc(p.name)}</span>`;
    btn.addEventListener('click', () => {
      presetGrid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (p.url) siteUrlInput.value = p.url;
      if (!siteNameInput.value.trim() && p.name !== 'Custom') siteNameInput.value = p.name;
      p.name === 'Custom' ? siteUrlInput.focus() : siteNameInput.focus();
      validateAdd();
    });
    presetGrid.appendChild(btn);
  });
}

function validateAdd() {
  addSiteConfirm.disabled = !(siteUrlInput.value.trim().startsWith('http') && siteNameInput.value.trim());
}

function openAddSiteModal() {
  siteUrlInput.value = ''; siteNameInput.value = '';
  addSiteConfirm.disabled = true;
  presetGrid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
  addSiteOverlay.classList.remove('hidden');
  window.api.hideView();
  return new Promise(r => { resolveAddSite = r; });
}

function closeAddSiteModal(val) {
  addSiteOverlay.classList.add('hidden');
  window.api.showView();
  if (resolveAddSite) { resolveAddSite(val ?? null); resolveAddSite = null; }
}

addSiteConfirm.addEventListener('click', () => {
  const url = siteUrlInput.value.trim(), name = siteNameInput.value.trim();
  if (url && name) closeAddSiteModal({ url, name });
});
addSiteCancel.addEventListener('click', () => closeAddSiteModal(null));
addSiteOverlay.addEventListener('click', e => { if (e.target === addSiteOverlay) closeAddSiteModal(null); });
siteUrlInput.addEventListener('input', validateAdd);
siteNameInput.addEventListener('input', validateAdd);
[siteUrlInput, siteNameInput].forEach(inp => inp.addEventListener('keydown', e => {
  if (e.key === 'Enter')  addSiteConfirm.click();
  if (e.key === 'Escape') closeAddSiteModal(null);
}));

buildPresetGrid();

// ── Render sidebar ───────────────────────────────────────────

function renderSidebar() {
  const list = document.getElementById('site-list');
  list.innerHTML = '';

  for (const site of sites) {
    const group = document.createElement('div');
    group.className = 'site-group';

    // Site header row
    const fav  = faviconUrl(site.url);
    const iconHtml = fav
      ? `<img class="site-favicon" src="${fav}" alt="" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><span class="site-favicon-fb" style="display:none">${esc(site.name[0])}</span>`
      : `<span class="site-favicon-fb">${esc(site.name[0])}</span>`;

    const header = document.createElement('div');
    header.className = 'site-header' + (site.id === activeSiteId ? ' active-site' : '');
    header.title = site.name;
    header.innerHTML = `
      ${iconHtml}
      <span class="site-name">${esc(site.name)}</span>
      <span class="site-header-actions">
        <button class="icon-btn add-sess-btn" title="Add session">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>
          </svg>
        </button>
        <button class="icon-btn rename-site-btn" title="Rename site">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn danger remove-site-btn" title="Remove site">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </span>`;

    header.addEventListener('click', e => {
      if (!e.target.closest('.site-header-actions')) activateSite(site.id);
    });
    header.querySelector('.add-sess-btn').addEventListener('click', e => {
      e.stopPropagation(); addSession(site.id);
    });
    header.querySelector('.rename-site-btn').addEventListener('click', e => {
      e.stopPropagation(); renameSite(site.id, site.name);
    });
    header.querySelector('.remove-site-btn').addEventListener('click', e => {
      e.stopPropagation(); removeSite(site.id);
    });

    group.appendChild(header);

    // Session list
    const sessionsEl = document.createElement('div');
    sessionsEl.className = 'session-list';

    for (const sess of site.sessions) {
      const item = document.createElement('div');
      const isActive  = sess.id === activeSessionId;
      const isLoading = loadingSet.has(sess.id);
      const isMuted   = !!sess.muted;
      item.className = 'session-item'
        + (isActive  ? ' active'  : '')
        + (isLoading ? ' loading' : '')
        + (isMuted   ? ' muted'   : '');
      item.dataset.sessionId = sess.id;

      // Mute icon — bell-slash when muted, bell when not
      const muteIcon = isMuted
        ? `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/>
            <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
           </svg>`;

      item.innerHTML = `
        <span class="session-dot"></span>
        <span class="session-label">${esc(sess.label)}</span>
        <span class="session-actions">
          <button class="icon-btn reload-sess-btn" title="Reload (Ctrl+R)">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/>
            </svg>
          </button>
          <button class="icon-btn mute-btn" title="${isMuted ? 'Unmute' : 'Mute'} notifications">${muteIcon}</button>
          <button class="icon-btn rename-sess-btn" title="Rename">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn danger remove-sess-btn" title="Remove">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </span>`;

      item.addEventListener('click', e => {
        if (!e.target.closest('.session-actions')) selectSession(site.id, sess.id);
      });
      item.addEventListener('dblclick', e => {
        if (!e.target.closest('.session-actions')) renameSession(sess.id, sess.label);
      });
      item.querySelector('.reload-sess-btn').addEventListener('click', async e => {
        e.stopPropagation();
        // Switch to this session first if not active, then reload
        if (sess.id !== activeSessionId) await selectSession(site.id, sess.id);
        window.api.reloadSession();
      });
      item.querySelector('.mute-btn').addEventListener('click', async e => {
        e.stopPropagation();
        const nowMuted = await window.api.toggleMute(sess.id);
        sess.muted = nowMuted;
        renderSidebar();
      });
      item.querySelector('.rename-sess-btn').addEventListener('click', e => {
        e.stopPropagation(); renameSession(sess.id, sess.label);
      });
      item.querySelector('.remove-sess-btn').addEventListener('click', e => {
        e.stopPropagation(); removeSession(site.id, sess.id);
      });

      sessionsEl.appendChild(item);
    }

    // Add-session hint row
    const addRow = document.createElement('div');
    addRow.className = 'add-session-row';
    addRow.innerHTML = `
      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
      <span class="add-sess-text">Add session</span>`;
    addRow.addEventListener('click', () => addSession(site.id));
    sessionsEl.appendChild(addRow);

    group.appendChild(sessionsEl);

    // Wire collapsed flyout for this site group (uses shared flyoutHideTimer)
    group.addEventListener('mouseenter', () => {
      if (!collapsed) return;
      clearTimeout(flyoutHideTimer);
      const rect = group.getBoundingClientRect();
      populateFlyout(site, rect.top);
    });
    group.addEventListener('mouseleave', () => {
      if (!collapsed) return;
      flyoutHideTimer = setTimeout(hideFlyout, 150);
    });

    list.appendChild(group);
  }

  // Show / hide empty state
  const emptyEl = document.getElementById('empty-state');
  emptyEl.style.display = sites.length === 0 ? 'flex' : 'none';
}

// ── Collapsed flyout ─────────────────────────────────────────

const flyoutEl = document.getElementById('collapsed-flyout');
let flyoutHideTimer;

flyoutEl.addEventListener('mouseenter', () => clearTimeout(flyoutHideTimer));
flyoutEl.addEventListener('mouseleave', () => { flyoutHideTimer = setTimeout(hideFlyout, 150); });

function hideFlyout() { flyoutEl.style.display = 'none'; }

function populateFlyout(site, topPx) {
  flyoutEl.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'flyout-site-label';
  title.textContent = site.name;
  flyoutEl.appendChild(title);

  for (const sess of site.sessions) {
    const item = document.createElement('div');
    item.className = 'flyout-sess-item' + (sess.id === activeSessionId ? ' active' : '');
    item.innerHTML = `
      <span class="flyout-initial">${esc(sess.label[0] || '?')}</span>
      <span class="flyout-sess-label">${esc(sess.label)}</span>`;
    item.addEventListener('click', e => {
      e.stopPropagation();
      hideFlyout();
      selectSession(site.id, sess.id);
    });
    flyoutEl.appendChild(item);
  }

  // Position: right of the 60px sidebar, aligned to hovered group top
  flyoutEl.style.display = 'block';
  flyoutEl.style.left    = '60px';
  flyoutEl.style.top     = `${topPx}px`;

  // Clamp to viewport bottom
  const flyH = flyoutEl.offsetHeight;
  const maxTop = window.innerHeight - flyH - 8;
  if (topPx > maxTop) flyoutEl.style.top = `${maxTop}px`;
}

// ── Operations ───────────────────────────────────────────────

async function activateSite(siteId) {
  activeSiteId = siteId;
  const site   = sites.find(s => s.id === siteId);
  if (site?.sessions.length > 0 && activeSessionId == null) {
    await selectSession(siteId, site.sessions[0].id);
  } else {
    renderSidebar();
  }
}

async function selectSession(siteId, sessionId) {
  activeSiteId    = siteId;
  activeSessionId = sessionId;
  await window.api.switchSession(siteId, sessionId);
  renderSidebar();
}

async function addSite() {
  const result = await openAddSiteModal();
  if (!result) return;
  const site = await window.api.addSite(result.name, result.url);
  sites.push(site);
  activeSiteId    = site.id;
  activeSessionId = null;
  renderSidebar();
  // Auto-add first session
  await addSession(site.id, true);
}

async function renameSite(siteId, current) {
  const name = await openModal('Rename Site', 'Enter a new name for this site.',
    { mode: 'input', defaultValue: current, confirmLabel: 'Rename' });
  if (!name || name === current) return;
  await window.api.renameSite(siteId, name);
  const site = sites.find(s => s.id === siteId);
  if (site) site.name = name;
  renderSidebar();
}

async function removeSite(siteId) {
  const site  = sites.find(s => s.id === siteId);
  const ok    = await openModal('Remove Site',
    `Remove "${site?.name || 'this site'}" and all its sessions? Saved logins stay on disk.`,
    { mode: 'confirm', confirmLabel: 'Remove' });
  if (!ok) return;
  await window.api.removeSite(siteId);
  sites = sites.filter(s => s.id !== siteId);
  if (activeSiteId === siteId) {
    activeSiteId = null; activeSessionId = null;
    if (sites.length > 0) await activateSite(sites[0].id);
    else renderSidebar();
  } else {
    renderSidebar();
  }
}

async function addSession(siteId, silent = false) {
  let label;
  if (silent) {
    // When auto-adding after site creation, use a default label
    label = 'Main';
  } else {
    label = await openModal('Add Session',
      'Give this session a label (e.g. Work, Personal).',
      { mode: 'input', confirmLabel: 'Add' });
    if (!label) return;
  }
  const session = await window.api.addSession(siteId, label);
  const site    = sites.find(s => s.id === siteId);
  if (site) site.sessions.push(session);
  await selectSession(siteId, session.id);
}

async function renameSession(sessionId, current) {
  const label = await openModal('Rename Session', 'Enter a new label.',
    { mode: 'input', defaultValue: current, confirmLabel: 'Rename' });
  if (!label || label === current) return;
  await window.api.renameSession(sessionId, label);
  for (const site of sites) {
    const s = site.sessions.find(s => s.id === sessionId);
    if (s) { s.label = label; break; }
  }
  renderSidebar();
}

async function removeSession(siteId, sessionId) {
  const site  = sites.find(s => s.id === siteId);
  const sess  = site?.sessions.find(s => s.id === sessionId);
  const ok    = await openModal('Remove Session',
    `Remove "${sess?.label || 'this session'}"? Saved login stays on disk.`,
    { mode: 'confirm', confirmLabel: 'Remove' });
  if (!ok) return;
  await window.api.removeSession(sessionId);
  if (site) site.sessions = site.sessions.filter(s => s.id !== sessionId);
  if (activeSessionId === sessionId) {
    const next = site?.sessions[0];
    activeSessionId = next?.id || null;
    await window.api.switchSession(siteId, activeSessionId || null);
  }
  renderSidebar();
}

// ── Collapse toggle ──────────────────────────────────────────

document.getElementById('collapse-btn').addEventListener('click', () => {
  collapsed = !collapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', collapsed);
  window.api.setSidebarWidth(collapsed ? COLLAPSED_W : EXPANDED_W);
});

// ── Loading dot updates ──────────────────────────────────────

window.api.onSessionActivated((siteId, sessionId) => {
  activeSiteId    = siteId;
  activeSessionId = sessionId;
  renderSidebar();
});

window.api.onSessionLoading((sessionId, isLoading) => {
  if (isLoading) loadingSet.add(sessionId);
  else loadingSet.delete(sessionId);

  // Update just the affected session dot without full re-render
  const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
  if (item) {
    item.classList.toggle('loading', isLoading);
  }
});

// ── Boot ─────────────────────────────────────────────────────

document.getElementById('add-site-btn').addEventListener('click', addSite);

// ── Reload shortcuts ─────────────────────────────────────────

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    if (e.shiftKey) window.api.hardReloadSession();
    else            window.api.reloadSession();
  }
});

(async function boot() {
  const cfg = await window.api.getConfig();
  sites = cfg.sites || [];
  // Pick first session of first site automatically
  if (sites.length > 0) {
    activeSiteId    = sites[0].id;
    const firstSess = sites[0].sessions[0];
    activeSessionId = firstSess?.id || null;
    renderSidebar();
    if (activeSessionId) {
      await window.api.switchSession(activeSiteId, activeSessionId);
    }
  } else {
    renderSidebar(); // shows empty state
  }
})();
