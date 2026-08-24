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
  
  // Landing page elements
  landingPage: document.getElementById('landingPage'),
  jobSourcingOption: document.getElementById('jobSourcingOption'),
  mailOption: document.getElementById('mailOption'),
  
  // Job sourcing section elements
  jobSourcingSection: document.getElementById('jobSourcingSection'),
  backToLandingJob: document.getElementById('backToLandingJob'),
  jobRoleInput: document.getElementById('jobRoleInput'),
  searchJobs: document.getElementById('searchJobs'),
  clearJobs: document.getElementById('clearJobs'),
  searchProgress: document.getElementById('searchProgress'),
  searchProgressBar: document.getElementById('searchProgressBar'),
  searchProgressText: document.getElementById('searchProgressText'),
  
  // Job results section elements
  jobResultsSection: document.getElementById('jobResultsSection'),
  backToJobSearch: document.getElementById('backToJobSearch'),
  jobResultsContainer: document.getElementById('jobResultsContainer'),
  
  // Mail section elements
  mailSection: document.getElementById('mailSection'),
  backToLandingMail: document.getElementById('backToLandingMail'),
  emailSubject: document.getElementById('emailSubject'),
  emailBody: document.getElementById('emailBody'),
  proceedToUpload: document.getElementById('proceedToUpload'),
  uploadSection: document.getElementById('uploadSection'),
  emailFileInput: document.getElementById('emailFileInput'),
  validateEmails: document.getElementById('validateEmails'),
  validationResults: document.getElementById('validationResults'),
  validEmailCount: document.getElementById('validEmailCount'),
  invalidEmailCount: document.getElementById('invalidEmailCount'),
  validEmailList: document.getElementById('validEmailList'),
  invalidEmailList: document.getElementById('invalidEmailList'),
  sendBulkEmails: document.getElementById('sendBulkEmails'),
  emailProgress: document.getElementById('emailProgress'),
  emailProgressBar: document.getElementById('emailProgressBar'),
  emailProgressText: document.getElementById('emailProgressText'),
};

const state = {
  config: null,
  linkedin: null,
  validRecipients: [],
  invalidRecipients: [],
  campaigns: [],
  user: null,
  authToken: null,
  validEmails: [],
  invalidEmails: [],
  linkedinConnected: false,
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

// Navigation functions
function showLandingPage() {
  elements.landingPage.classList.remove('hidden');
  elements.jobSourcingSection.classList.add('hidden');
  elements.jobResultsSection.classList.add('hidden');
  elements.mailSection.classList.add('hidden');
}

function showJobSourcingSection() {
  elements.landingPage.classList.add('hidden');
  elements.jobSourcingSection.classList.remove('hidden');
  elements.jobResultsSection.classList.add('hidden');
  elements.mailSection.classList.add('hidden');
}

function showJobResultsSection() {
  elements.landingPage.classList.add('hidden');
  elements.jobSourcingSection.classList.add('hidden');
  elements.jobResultsSection.classList.remove('hidden');
  elements.mailSection.classList.add('hidden');
}

function showMailSection() {
  elements.landingPage.classList.add('hidden');
  elements.jobSourcingSection.classList.add('hidden');
  elements.jobResultsSection.classList.add('hidden');
  elements.mailSection.classList.remove('hidden');
}

// Job Sourcing functions
async function searchJobs() {
  const jobRole = elements.jobRoleInput.value.trim();
  
  if (!jobRole) {
    showToast('Please enter a job role keyword.', true);
    return;
  }
  
  try {
    elements.searchProgress.classList.remove('hidden');
    elements.searchProgressBar.style.width = '33%';
    elements.searchProgressText.textContent = 'Searching job portals...';
    
    const response = await requestJson('/api/jobs/search', {
      method: 'POST',
      body: JSON.stringify({ jobRole }),
    });
    
    elements.searchProgressBar.style.width = '66%';
    elements.searchProgressText.textContent = 'Processing results...';
    
    if (response.jobs && response.jobs.length > 0) {
      elements.searchProgressBar.style.width = '100%';
      displayJobResults(response.jobs);
      showJobResultsSection();
      showToast(`Found ${response.jobs.length} job opportunities.`);
    } else {
      showToast('No jobs found matching your criteria.', true);
    }
    
    elements.searchProgress.classList.add('hidden');
  } catch (error) {
    showToast(error.message, true);
    elements.searchProgress.classList.add('hidden');
  }
}

async function clearJobs() {
  if (!confirm('Are you sure you want to clear all jobs from the database?')) {
    return;
  }
  
  try {
    const response = await requestJson('/api/jobs/clear', {
      method: 'POST',
    });
    
    showToast(`Cleared ${response.jobsDeleted} jobs from database.`);
    elements.jobResultsContainer.innerHTML = '<p class="muted-text">Database cleared. Search for new jobs to populate the database.</p>';
  } catch (error) {
    showToast(error.message, true);
  }
}

function displayJobResults(jobs) {
  elements.jobResultsContainer.innerHTML = jobs.map(job => `
    <div class="job-card">
      <h3>${escapeHtml(job.title)}</h3>
      <div class="job-details">
        <p><strong>Company:</strong> ${escapeHtml(job.company)}</p>
        <p><strong>Location:</strong> ${escapeHtml(job.location)}</p>
        <p><strong>Visa Status:</strong> ${escapeHtml(job.visaStatus)}</p>
        <p><strong>Employment Type:</strong> ${escapeHtml(job.employmentType)}</p>
        <p><strong>Posted:</strong> ${escapeHtml(job.postedDate)}</p>
        <p><strong>Source:</strong> ${escapeHtml(job.source)}</p>
        <p><strong>Email:</strong> ${job.email && job.email !== 'Not Provided' ? `<a href="mailto:${escapeHtml(job.email)}">${escapeHtml(job.email)}</a>` : 'Not Provided'}</p>
        <p><strong>Phone:</strong> ${job.phone && job.phone !== 'Not Provided' ? `<a href="tel:${escapeHtml(job.phone)}">${escapeHtml(job.phone)}</a>` : 'Not Provided'}</p>
        ${job.skills && job.skills.length > 0 ? `<p><strong>Skills:</strong> ${escapeHtml(job.skills.join(', '))}</p>` : ''}
        <p><strong>Description:</strong> ${escapeHtml(job.description)}</p>
      </div>
    </div>
  `).join('');
}

// Email functions
function proceedToUpload() {
  const subject = elements.emailSubject.value.trim();
  const body = elements.emailBody.value.trim();
  
  if (!subject || !body) {
    showToast('Please enter both subject and body.', true);
    return;
  }
  
  elements.uploadSection.classList.remove('hidden');
}

async function validateEmails() {
  const file = elements.emailFileInput.files[0];
  if (!file) {
    showToast('Please upload a file first.', true);
    return;
  }

  try {
    // Convert file to base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      
      const response = await requestJson('/api/recipients/import', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          contentBase64: base64,
        }),
      });
      
      state.validEmails = response.validRecipients || [];
      state.invalidEmails = response.invalidRecipients || [];
      
      elements.validEmailCount.textContent = state.validEmails.length;
      elements.invalidEmailCount.textContent = state.invalidEmails.length;
      
      elements.validEmailList.innerHTML = state.validEmails
        .map(recipient => `<li>${escapeHtml(recipient.email || recipient)}</li>`)
        .join('');
      
      elements.invalidEmailList.innerHTML = state.invalidEmails
        .map(recipient => `<li>${escapeHtml(recipient.email || recipient)}</li>`)
        .join('');
      
      elements.validationResults.classList.remove('hidden');
      showToast(`Found ${state.validEmails.length} valid and ${state.invalidEmails.length} invalid emails.`);
    };
    reader.onerror = () => {
      showToast('Failed to read file.', true);
    };
  } catch (error) {
    showToast(error.message, true);
  }
}

async function sendBulkEmails() {
  if (state.validEmails.length === 0) {
    showToast('No valid emails to send.', true);
    return;
  }

  const subject = elements.emailSubject.value.trim();
  const body = elements.emailBody.value.trim();
  
  try {
    elements.emailProgress.classList.remove('hidden');
    showToast('Creating email campaign and starting to send...');
    
    // Extract email addresses from recipient objects
    const emailAddresses = state.validEmails.map(r => r.email || r);
    
    const response = await requestJson('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bulk Email Campaign',
        senderEmail: 'arafathshaik121@gmail.com',
        delayMs: 5000,
        subject,
        body,
        recipients: emailAddresses,
      }),
    });
    
    if (response.campaign) {
      showToast('Campaign created! Email sending has started in the background.');
      // Start polling for campaign progress
      const campaignId = response.campaign.id;
      pollCampaignProgress(campaignId, emailAddresses.length);
    } else {
      showToast('Campaign creation failed. Check Railway logs.', true);
    }
    
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
    elements.emailProgress.classList.add('hidden');
  }
}

async function pollCampaignProgress(campaignId, totalEmails) {
  try {
    const pollInterval = setInterval(async () => {
      try {
        const data = await requestJson(`/api/campaigns/${campaignId}`);
        const campaign = data.campaign;
        
        // Get send status
        const sendsData = await requestJson(`/api/campaigns/${campaignId}/sends`);
        const sentCount = sendsData.sends.filter(s => s.status === 'sent').length;
        const failedCount = sendsData.sends.filter(s => s.status === 'failed').length;
        
        const progress = Math.round((sentCount / totalEmails) * 100);
        elements.emailProgressBar.style.width = `${progress}%`;
        elements.emailProgressText.textContent = `${sentCount} / ${totalEmails} emails sent (${failedCount} failed)`;
        
        if (campaign.status === 'completed' || sentCount >= totalEmails) {
          clearInterval(pollInterval);
          if (failedCount > 0) {
            showToast(`Campaign completed. ${sentCount} sent, ${failedCount} failed.`);
          } else {
            showToast('All emails sent successfully!');
          }
        }
        
        if (campaign.status === 'failed') {
          clearInterval(pollInterval);
          showToast('Campaign failed. Check logs for details.', true);
        }
      } catch (error) {
        console.error('Error polling campaign progress:', error);
      }
    }, 2000);
    
    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000);
    
  } catch (error) {
    showToast('Error tracking campaign progress', true);
  }
}

async function initialize() {
  // Check if user is on privacy page
  if (checkPrivacyPage()) {
    return;
  }

  try {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
      showLandingPage();
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

// Event listeners for new UI
elements.jobSourcingOption.addEventListener('click', showJobSourcingSection);
elements.mailOption.addEventListener('click', showMailSection);
elements.backToLandingJob.addEventListener('click', showLandingPage);
elements.backToJobSearch.addEventListener('click', showJobSourcingSection);
elements.backToLandingMail.addEventListener('click', showLandingPage);
elements.searchJobs.addEventListener('click', searchJobs);
elements.clearJobs.addEventListener('click', clearJobs);
elements.proceedToUpload.addEventListener('click', proceedToUpload);
elements.validateEmails.addEventListener('click', validateEmails);
elements.sendBulkEmails.addEventListener('click', sendBulkEmails);

// Keep existing event listeners
elements.loginForm.addEventListener('submit', login);
elements.logoutBtn.addEventListener('click', logout);

initialize();
