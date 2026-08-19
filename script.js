const elements = {
  toast: document.getElementById('toast'),
  loginSection: document.getElementById('loginSection'),
  privacySection: document.getElementById('privacySection'),
  dashboardSection: document.getElementById('dashboardSection'),
  loginForm: document.getElementById('loginForm'),
  usernameInput: document.getElementById('usernameInput'),
  passwordInput: document.getElementById('passwordInput'),
  userInfo: document.getElementById('userInfo'),
  userName: document.getElementById('userName'),
  logoutBtn: document.getElementById('logoutBtn'),
  appBaseUrl: document.getElementById('appBaseUrl'),
  defaultDelay: document.getElementById('defaultDelay'),
  linkedinConfigStatus: document.getElementById('linkedinConfigStatus'),
  smtpConfigStatus: document.getElementById('smtpConfigStatus'),
  linkedinConnectionPill: document.getElementById('linkedinConnectionPill'),
  linkedinSummary: document.getElementById('linkedinSummary'),
  linkedinConnectBtn: document.getElementById('linkedinConnectBtn'),
  linkedinRefreshBtn: document.getElementById('linkedinRefreshBtn'),
  linkedinLogoutBtn: document.getElementById('linkedinLogoutBtn'),
  recipientFileInput: document.getElementById('recipientFileInput'),
  importRecipientsBtn: document.getElementById('importRecipientsBtn'),
  clearRecipientsBtn: document.getElementById('clearRecipientsBtn'),
  importSummary: document.getElementById('importSummary'),
  validRecipientCount: document.getElementById('validRecipientCount'),
  invalidRecipientCount: document.getElementById('invalidRecipientCount'),
  validRecipientList: document.getElementById('validRecipientList'),
  invalidRecipientList: document.getElementById('invalidRecipientList'),
  campaignForm: document.getElementById('campaignForm'),
  campaignNameInput: document.getElementById('campaignNameInput'),
  senderEmailInput: document.getElementById('senderEmailInput'),
  delayMsInput: document.getElementById('delayMsInput'),
  scheduleInput: document.getElementById('scheduleInput'),
  subjectInput: document.getElementById('subjectInput'),
  bodyInput: document.getElementById('bodyInput'),
  campaignList: document.getElementById('campaignList'),
  refreshCampaignsBtn: document.getElementById('refreshCampaignsBtn'),
};

const state = {
  config: null,
  linkedin: null,
  validRecipients: [],
  invalidRecipients: [],
  campaigns: [],
  user: null,
  authToken: null,
};

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden', 'error');
  if (isError) {
    elements.toast.classList.add('error');
  }

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 5000);
}

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Invalid date' : parsed.toLocaleString();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function requestJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }

  const response = await fetch(url, {
    headers,
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

function renderConfig() {
  if (!state.config) {
    return;
  }

  elements.appBaseUrl.textContent = state.config.baseUrl;
  elements.defaultDelay.textContent = `${state.config.defaultDelayMs} ms`;
  elements.linkedinConfigStatus.textContent = state.config.linkedin.configured
    ? 'Configured'
    : 'Missing credentials';
  elements.smtpConfigStatus.textContent = state.config.smtp.configured
    ? `${state.config.smtp.host}:${state.config.smtp.port}`
    : 'Using Ethereal previews';
}

function renderLinkedInStatus() {
  const linkedin = state.linkedin;
  const connected = Boolean(linkedin && linkedin.connected);

  elements.linkedinConnectionPill.textContent = connected ? 'Connected' : 'Not Connected';
  elements.linkedinConnectionPill.classList.toggle('running', connected);
  elements.linkedinConnectionPill.classList.toggle('stopped', !connected);
  elements.linkedinConnectBtn.classList.toggle('disabled-link', !state.config?.linkedin.configured);
  elements.linkedinLogoutBtn.disabled = !connected;

  if (!state.config?.linkedin.configured) {
    elements.linkedinSummary.textContent =
      'Add LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI to enable OAuth.';
    return;
  }

  if (!connected) {
    elements.linkedinSummary.textContent =
      'LinkedIn OAuth is configured. Click Connect LinkedIn to authorize the app.';
    return;
  }

  const profileName = linkedin.profile?.name || linkedin.profile?.email || 'LinkedIn member';
  elements.linkedinSummary.textContent = `${profileName} connected on ${formatDate(
    linkedin.connectedAt
  )}.`;
}

function renderRecipientList(target, recipients, emptyText, invalid = false) {
  if (!recipients.length) {
    target.innerHTML = `<li>${emptyText}</li>`;
    return;
  }

  target.innerHTML = recipients
    .slice(0, 12)
    .map((recipient) => {
      const label = recipient.fullName || recipient.email;
      const detail = invalid ? recipient.reason || 'Validation failed' : recipient.mx || 'Ready';
      return `<li class="${invalid ? 'invalid' : 'valid'}">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(recipient.email)}</span>
        <small>${escapeHtml(detail)}</small>
      </li>`;
    })
    .join('');
}

function renderImportedRecipients() {
  elements.validRecipientCount.textContent = String(state.validRecipients.length);
  elements.invalidRecipientCount.textContent = String(state.invalidRecipients.length);

  renderRecipientList(
    elements.validRecipientList,
    state.validRecipients,
    'No valid recipients imported yet.'
  );
  renderRecipientList(
    elements.invalidRecipientList,
    state.invalidRecipients,
    'No invalid recipients flagged.',
    true
  );
}

function renderCampaigns() {
  if (!state.campaigns.length) {
    elements.campaignList.innerHTML =
      '<div class="empty-state">No campaigns yet. Import recipients and save your first campaign.</div>';
    return;
  }

  elements.campaignList.innerHTML = state.campaigns
    .map((campaign) => {
      const actionButtons = [];

      if (campaign.status === 'scheduled' || campaign.status === 'queued') {
        actionButtons.push(
          `<button class="secondary-btn" type="button" data-action="send-now" data-id="${campaign.id}">Send Now</button>`
        );
        actionButtons.push(
          `<button class="danger-btn" type="button" data-action="cancel" data-id="${campaign.id}">Cancel</button>`
        );
      }

      const logs = (campaign.logs || [])
        .slice(-5)
        .map(
          (entry) =>
            `<li><strong>${escapeHtml(entry.level)}</strong> ${escapeHtml(entry.message)} <small>${escapeHtml(
              formatDate(entry.timestamp)
            )}</small></li>`
        )
        .join('');

      return `
        <article class="campaign-card">
          <div class="campaign-card-header">
            <div>
              <h3>${escapeHtml(campaign.name)}</h3>
              <p>${escapeHtml(campaign.subject)}</p>
            </div>
            <span class="status-pill ${campaign.status === 'completed' ? 'running' : 'stopped'}">${escapeHtml(
              campaign.status
            )}</span>
          </div>

          <div class="campaign-meta">
            <span>${campaign.recipients.length} recipients</span>
            <span>Scheduled: ${escapeHtml(formatDate(campaign.scheduledFor))}</span>
            <span>Sent: ${campaign.sentCount || 0}</span>
            <span>Failed: ${campaign.failedCount || 0}</span>
          </div>

          <div class="toolbar">${actionButtons.join('')}</div>
          <ul class="log-list">${logs || '<li>No activity yet.</li>'}</ul>
        </article>
      `;
    })
    .join('');
}

async function refreshConfig() {
  state.config = await requestJson('/api/config/status');
  renderConfig();
}

async function refreshLinkedInStatus() {
  state.linkedin = await requestJson('/api/linkedin/status');
  renderLinkedInStatus();
}

async function refreshCampaigns() {
  const data = await requestJson('/api/campaigns');
  state.campaigns = data.campaigns || [];
  renderCampaigns();
}

function clearImportedRecipients() {
  state.validRecipients = [];
  state.invalidRecipients = [];
  elements.recipientFileInput.value = '';
  elements.importSummary.textContent = 'Recipient list cleared.';
  renderImportedRecipients();
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return window.btoa(binary);
}

async function importRecipients() {
  const file = elements.recipientFileInput.files[0];

  if (!file) {
    showToast('Choose a CSV or Excel file first.', true);
    return;
  }

  elements.importSummary.textContent = `Processing ${file.name}...`;

  try {
    const buffer = await file.arrayBuffer();
    const contentBase64 = arrayBufferToBase64(buffer);
    const result = await requestJson('/api/recipients/import', {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        contentBase64,
      }),
    });

    state.validRecipients = result.validRecipients || [];
    state.invalidRecipients = result.invalidRecipients || [];
    elements.importSummary.textContent = `${result.totalRecipients} recipients found. ${state.validRecipients.length} valid and ${state.invalidRecipients.length} invalid.`;
    renderImportedRecipients();
    showToast('Recipient import completed.');
  } catch (error) {
    elements.importSummary.textContent = error.message;
    showToast(error.message, true);
  }
}

async function submitCampaign(event) {
  event.preventDefault();

  if (!state.validRecipients.length) {
    showToast('Import at least one valid recipient before saving a campaign.', true);
    return;
  }

  try {
    const campaign = await requestJson('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: elements.campaignNameInput.value.trim(),
        senderEmail: elements.senderEmailInput.value.trim(),
        subject: elements.subjectInput.value.trim(),
        body: elements.bodyInput.value.trim(),
        delayMs: Number(elements.delayMsInput.value) || (state.config && state.config.defaultDelayMs),
        scheduledFor: elements.scheduleInput.value
          ? new Date(elements.scheduleInput.value).toISOString()
          : null,
        recipients: state.validRecipients,
      }),
    });

    elements.campaignForm.reset();
    state.campaigns.unshift(campaign.campaign);
    renderCampaigns();
    showToast('Campaign saved.');
    await refreshCampaigns();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleCampaignAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const campaignId = button.dataset.id;

  try {
    if (action === 'send-now') {
      await requestJson(`/api/campaigns/${campaignId}/send-now`, { method: 'POST' });
      showToast('Campaign queued to send now.');
    }

    if (action === 'cancel') {
      await requestJson(`/api/campaigns/${campaignId}/cancel`, { method: 'POST' });
      showToast('Campaign cancelled.');
    }

    await refreshCampaigns();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function disconnectLinkedIn() {
  try {
    await requestJson('/api/linkedin/logout', { method: 'POST' });
    await refreshLinkedInStatus();
    showToast('LinkedIn session cleared.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function login(event) {
  event.preventDefault();

  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value.trim();

  if (!username || !password) {
    showToast('Username and password are required.', true);
    return;
  }

  try {
    const result = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    state.authToken = result.token;
    state.user = result.user;

    elements.userName.textContent = state.user.username;
    elements.userInfo.classList.remove('hidden');
    elements.loginSection.classList.add('hidden');
    elements.dashboardSection.classList.remove('hidden');

    showToast('Login successful.');
    await refreshConfig();
    await refreshLinkedInStatus();
    await refreshCampaigns();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function logout() {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' });
    state.authToken = null;
    state.user = null;

    elements.userInfo.classList.add('hidden');
    elements.loginSection.classList.remove('hidden');
    elements.dashboardSection.classList.add('hidden');
    elements.loginForm.reset();

    showToast('Logged out successfully.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function checkAuth() {
  try {
    const data = await requestJson('/api/auth/me');
    state.user = data.user;
    elements.userName.textContent = state.user.username;
    elements.userInfo.classList.remove('hidden');
    elements.loginSection.classList.add('hidden');
    elements.dashboardSection.classList.remove('hidden');
    return true;
  } catch (error) {
    elements.userInfo.classList.add('hidden');
    elements.loginSection.classList.remove('hidden');
    elements.dashboardSection.classList.add('hidden');
    return false;
  }
}

function checkPrivacyPage() {
  if (window.location.pathname === '/privacy') {
    elements.loginSection.classList.add('hidden');
    elements.dashboardSection.classList.add('hidden');
    elements.privacySection.classList.remove('hidden');
    return true;
  }
  return false;
}

function handleLinkedInQueryString() {
  const params = new URLSearchParams(window.location.search);
  const linkedinStatus = params.get('linkedin');
  const message = params.get('message');

  if (linkedinStatus === 'connected') {
    showToast('LinkedIn connected successfully.');
  }

  if (linkedinStatus === 'error') {
    showToast(message || 'LinkedIn authorization failed.', true);
  }

  if (linkedinStatus) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function initialize() {
  handleLinkedInQueryString();
  renderImportedRecipients();
  renderCampaigns();

  // Check if user is on privacy page
  if (checkPrivacyPage()) {
    return;
  }

  try {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
      await refreshConfig();
      await refreshLinkedInStatus();
      await refreshCampaigns();
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

elements.importRecipientsBtn.addEventListener('click', importRecipients);
elements.clearRecipientsBtn.addEventListener('click', clearImportedRecipients);
elements.campaignForm.addEventListener('submit', submitCampaign);
elements.refreshCampaignsBtn.addEventListener('click', refreshCampaigns);
elements.linkedinRefreshBtn.addEventListener('click', refreshLinkedInStatus);
elements.linkedinLogoutBtn.addEventListener('click', disconnectLinkedIn);
elements.campaignList.addEventListener('click', handleCampaignAction);
elements.loginForm.addEventListener('submit', login);
elements.logoutBtn.addEventListener('click', logout);

initialize();
