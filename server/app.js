const crypto = require('crypto');
const path = require('path');
const http = require('http');

const cors = require('cors');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const XLSX = require('xlsx');
const { WebSocketServer } = require('ws');

const config = require('./config');
const auth = require('./auth');
const { validateEmailBatch, createTransporter, sendMail, decodeTrackingPayload } = require('./mailService');
const CampaignScheduler = require('./scheduler');
const repos = require('./repositories');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const pendingLinkedInStates = new Map();

let jwtSecret;

app.set('trust proxy', true);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.resolve(__dirname, '..'), { index: false }));

const clients = new Set();
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const ws of clients) {
    if (ws.readyState === 1) {
      try { ws.send(msg); } catch {}
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => {
    try { ws.close(); } catch {}
    clients.delete(ws);
  });
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getWorkbookRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  if (rows.length > 0) return rows;
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
  return matrix.map((values, index) => {
    const row = {};
    values.forEach((value, columnIndex) => {
      row[`column_${columnIndex + 1}`] = value;
    });
    row._rowNumber = index + 1;
    return row;
  });
}

function extractContacts(rows) {
  const contactsByEmail = new Map();
  rows.forEach((row, index) => {
    const entries = Object.entries(row || {});
    const rowNumber = Number(row._rowNumber) || index + 2;
    const normalized = {};
    entries.forEach(([key, value]) => {
      normalized[key] = value === null || value === undefined ? '' : String(value).trim();
    });
    const firstName =
      normalized.firstName || normalized.firstname || normalized['first name'] || normalized.given_name || '';
    const lastName =
      normalized.lastName || normalized.lastname || normalized['last name'] || normalized.family_name || '';
    const fullName =
      normalized.name || normalized.fullName || normalized['full name'] || `${firstName} ${lastName}`.trim();
    const company = normalized.company || normalized.organization || normalized.employer || '';
    const title = normalized.title || normalized.role || '';
    entries.forEach(([, value]) => {
      if (value === null || value === undefined) return;
      const matches = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      matches.forEach((emailValue) => {
        const email = emailValue.toLowerCase();
        if (!contactsByEmail.has(email)) {
          contactsByEmail.set(email, { email, firstName, lastName, fullName, company, title, rowNumber });
        }
      });
    });
  });
  return Array.from(contactsByEmail.values());
}

async function runCampaign(campaignId) {
  console.log(`runCampaign called for campaign ${campaignId}`);
  let activeCampaign = repos.getCampaignById(campaignId);
  if (!activeCampaign) {
    console.log(`Campaign ${campaignId} not found`);
    return;
  }

  console.log(`Campaign ${campaignId} status: ${activeCampaign.status}`);
  
  const terminalStates = ['completed', 'cancelled', 'failed'];
  if (terminalStates.includes(activeCampaign.status)) {
    console.log(`Campaign ${campaignId} in terminal state: ${activeCampaign.status}`);
    return;
  }

  console.log(`Starting campaign ${campaignId} with ${activeCampaign.recipients.length} recipients`);
  repos.updateCampaignStatus(campaignId, {
    status: 'sending',
    startedAt: activeCampaign.startedAt || new Date().toISOString(),
  });
  broadcast('campaign:status', { id: campaignId, status: 'sending', startedAt: activeCampaign.startedAt || new Date().toISOString() });

  const transportDetails = await createTransporter({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user,
    pass: config.smtp.pass,
  });

  const useSendGridAPI = transportDetails.useSendGridAPI;
  
  repos.appendCampaignLog(campaignId, {
    level: 'info',
    message: transportDetails.useSendGridAPI
      ? 'Using SendGrid API for email sending (HTTP-based, no SMTP required)'
      : transportDetails.isEthereal
      ? 'Using an Ethereal preview inbox because SMTP credentials are not configured.'
      : `SMTP connection ready. Host: ${config.smtp.host}, Port: ${config.smtp.port}, User: ${config.smtp.user}`,
  });
  broadcast('campaign:log', {
    id: campaignId,
    entry: { level: 'info', message: transportDetails.isEthereal ? 'Using an Ethereal preview inbox.' : `SMTP ready. Host: ${config.smtp.host}`, timestamp: new Date().toISOString() },
  });

  let sentCount = 0;
  let failedCount = 0;
  activeCampaign = repos.getCampaignById(campaignId);

  for (let index = 0; index < activeCampaign.recipients.length; index += 1) {
    const recipient = activeCampaign.recipients[index];
    if (scheduler.shuttingDown) break;

    activeCampaign = repos.getCampaignById(campaignId);
    if (activeCampaign?.status === 'cancelled') break;

    try {
      console.log(`Attempting to send email to ${recipient.email}...`);
      const result = await sendMail({
        transporter: transportDetails.transporter,
        from: config.smtp.from || config.smtp.user || activeCampaign.senderEmail,
        to: recipient.email,
        subject: activeCampaign.subject,
        body: activeCampaign.body,
        bodyType: activeCampaign.bodyType || 'text',
        contactData: recipient,
        baseUrl: config.appBaseUrl,
        campaignId,
        enableTracking: true,
        useSendGridAPI: useSendGridAPI,
      });

      console.log(`Successfully sent email to ${recipient.email}. Message ID: ${result.messageId}`);
      sentCount += 1;
      repos.updateCampaignStatus(campaignId, { sentCount });
      repos.updateSend(campaignId, recipient.email, {
        status: 'sent',
        messageId: result.messageId,
        previewUrl: result.previewUrl,
        sentAt: new Date().toISOString(),
      });
      repos.appendCampaignLog(campaignId, {
        level: 'success',
        message: result.previewUrl
          ? `Sent to ${recipient.email}. Preview: ${result.previewUrl}`
          : `Sent to ${recipient.email}. Message ID: ${result.messageId}`,
      });
      broadcast('campaign:progress', {
        id: campaignId,
        email: recipient.email,
        sentCount,
        failedCount,
        total: activeCampaign.recipients.length,
      });
    } catch (error) {
      console.error(`Failed to send email to ${recipient.email}:`, error);
      failedCount += 1;
      repos.updateCampaignStatus(campaignId, { failedCount });
      repos.updateSend(campaignId, recipient.email, {
        status: 'failed',
        errorMessage: error.message,
      });
      repos.appendCampaignLog(campaignId, {
        level: 'error',
        message: `Failed to send to ${recipient.email}: ${error.message}`,
      });
      broadcast('campaign:progress', {
        id: campaignId,
        email: recipient.email,
        sentCount,
        failedCount,
        total: activeCampaign.recipients.length,
        failed: true,
      });
    }

    if (index < activeCampaign.recipients.length - 1) {
      await wait(activeCampaign.delayMs || config.defaultDelayMs);
    }
  }

  const finalStatus = failedCount > 0 && sentCount === 0 ? 'failed'
    : activeCampaign?.status === 'cancelled' ? 'cancelled'
    : 'completed';
  repos.updateCampaignStatus(campaignId, {
    status: finalStatus,
    completedAt: new Date().toISOString(),
  });
  repos.appendCampaignLog(campaignId, {
    level: 'info',
    message: `Campaign ${finalStatus}. ${sentCount} sent, ${failedCount} failed.`,
  });
  broadcast('campaign:status', {
    id: campaignId,
    status: finalStatus,
    completedAt: new Date().toISOString(),
    sentCount,
    failedCount,
  });
}

const scheduler = new CampaignScheduler({ runCampaign });

app.post('/api/auth/login', (req, res) => {
  const { username, password, remember = true } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }
  const result = auth.loginUser(String(username), String(password), jwtSecret);
  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }
  if (remember) {
    res.cookie('token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: result.expiresIn * 1000,
    });
  }
  res.json({ token: result.token, user: result.user, expiresIn: result.expiresIn });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  const payload = auth.verifyToken(token, jwtSecret);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }
  const { db } = require('./db');
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'User no longer exists.' });
    return;
  }
  res.json({ user: { id: user.id, username: user.username } });
});

function authRequired(req, res, next) {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const cookieToken = req.cookies?.token;
  const token = headerToken || cookieToken;
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const payload = auth.verifyToken(token, jwtSecret || 'dev-secret-change-me-please-32bytes!');
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }
  const { db } = require('./db');
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'User no longer exists.' });
    return;
  }
  req.user = user;
  next();
}

app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    clients: clients.size,
  });
});

app.get('/api/config/status', authRequired, async (req, res) => {
  const linkedinSession = repos.getLinkedInSession(req.user.id);
  res.json({
    port: config.port,
    baseUrl: config.appBaseUrl,
    defaultDelayMs: config.defaultDelayMs,
    linkedin: {
      configured: config.linkedin.isConfigured,
      redirectUri: config.linkedin.redirectUri,
      scopes: config.linkedin.scopes,
      connected: Boolean(linkedinSession),
    },
    smtp: {
      configured: config.smtp.isConfigured,
      host: config.smtp.host || 'Not configured',
      port: config.smtp.port,
      from: config.smtp.from || config.smtp.user || 'Will use Ethereal preview inbox',
      isEthereal: !config.smtp.isConfigured,
    },
  });
});

app.get('/api/linkedin/status', authRequired, async (req, res) => {
  const session = repos.getLinkedInSession(req.user.id);
  res.json({
    configured: config.linkedin.isConfigured,
    connected: Boolean(session),
    profile: session ? session.profile : null,
    connectedAt: session ? session.connectedAt : null,
  });
});

app.get('/api/linkedin/auth', authRequired, (req, res) => {
  if (!config.linkedin.isConfigured) {
    res.status(400).json({
      error: 'LinkedIn OAuth is not configured. Add client credentials to your .env file first.',
    });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingLinkedInStates.set(state, { userId: req.user.id, expires: Date.now() + 10 * 60 * 1000 });

  const url = new URL(config.linkedin.authEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.linkedin.clientId);
  url.searchParams.set('redirect_uri', config.linkedin.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', config.linkedin.scopes.join(' '));

  res.redirect(url.toString());
});

app.get('/api/linkedin/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    res.redirect(`/?linkedin=error&message=${encodeURIComponent(String(errorDescription || error))}`);
    return;
  }

  const entry = pendingLinkedInStates.get(String(state));
  if (!code || !state || !entry || entry.expires < Date.now()) {
    res.redirect('/?linkedin=error&message=Invalid%20OAuth%20state');
    return;
  }
  pendingLinkedInStates.delete(String(state));

  try {
    const tokenResponse = await fetch(config.linkedin.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        client_id: config.linkedin.clientId,
        client_secret: config.linkedin.clientSecret,
        redirect_uri: config.linkedin.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const message = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${message}`);
    }

    const tokens = await tokenResponse.json();
    const userInfoResponse = await fetch(config.linkedin.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      const message = await userInfoResponse.text();
      throw new Error(`User info fetch failed: ${message}`);
    }

    const profile = await userInfoResponse.json();
    repos.saveLinkedInSession(entry.userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null,
      profile,
    });

    res.redirect('/?linkedin=connected');
  } catch (oauthError) {
    res.redirect(`/?linkedin=error&message=${encodeURIComponent(oauthError.message)}`);
  }
});

app.post('/api/linkedin/logout', authRequired, async (req, res) => {
  repos.clearLinkedInSession(req.user.id);
  res.json({ ok: true });
});

app.post('/api/recipients/import', authRequired, async (req, res) => {
  try {
    const { fileName, contentBase64 } = req.body;
    if (!fileName || !contentBase64) {
      res.status(400).json({ error: 'A file name and base64 file content are required.' });
      return;
    }
    const buffer = Buffer.from(contentBase64, 'base64');
    const rows = getWorkbookRows(buffer);
    const contacts = extractContacts(rows);

    if (contacts.length === 0) {
      res.status(400).json({ error: 'No email addresses were found in the uploaded file.' });
      return;
    }

    const validations = await validateEmailBatch(contacts.map((c) => c.email));
    const validationMap = new Map(validations.map((v) => [v.email, v]));

    const recipients = contacts.map((contact) => {
      const validation = validationMap.get(contact.email);
      return {
        ...contact,
        valid: Boolean(validation && validation.valid),
        reason: validation?.reason || '',
        mx: validation?.mx || '',
      };
    });

    const validRecipients = recipients.filter((r) => r.valid);
    const invalidRecipients = recipients.filter((r) => !r.valid);

    repos.recordImport(req.user.id, {
      id: crypto.randomUUID(),
      fileName,
      totalRecipients: recipients.length,
      validRecipients: validRecipients.length,
      invalidRecipients: invalidRecipients.length,
    });

    res.json({ fileName, totalRecipients: recipients.length, validRecipients, invalidRecipients });
  } catch (error) {
    res.status(500).json({ error: `Unable to process file: ${error.message}` });
  }
});

app.get('/api/campaigns', authRequired, async (req, res) => {
  const campaigns = repos.listCampaigns(req.user.id);
  res.json({ campaigns });
});

app.get('/api/campaigns/:id', authRequired, async (req, res) => {
  const campaign = repos.getCampaignById(req.params.id, req.user.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  const sends = repos.listCampaignSends(req.params.id);
  res.json({ campaign, sends });
});

app.get('/api/campaigns/:id/sends', authRequired, async (req, res) => {
  const campaign = repos.getCampaignById(req.params.id, req.user.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  const sends = repos.listCampaignSends(req.params.id);
  res.json({ sends });
});

app.post('/api/campaigns', authRequired, async (req, res) => {
  const { name, senderEmail, subject, body, bodyType = 'text', recipients, scheduledFor, delayMs } = req.body;

  if (!name || !subject || !body) {
    res.status(400).json({ error: 'Campaign name, subject, and body are required.' });
    return;
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    res.status(400).json({ error: 'At least one valid recipient is required.' });
    return;
  }

  // Handle both string emails and recipient objects
  const validRecipients = recipients.map((r) => {
    if (typeof r === 'string') {
      return { email: r };
    }
    return r;
  }).filter((r) => r && r.email);
  
  const scheduleIso = safeIsoDate(scheduledFor) || new Date().toISOString();
  const id = crypto.randomUUID();
  const campaign = {
    id,
    name: String(name).trim(),
    senderEmail: senderEmail ? String(senderEmail).trim() : '',
    subject: String(subject).trim(),
    body: String(body).trim(),
    bodyType: bodyType === 'html' ? 'html' : bodyType === 'both' ? 'both' : 'text',
    recipients: validRecipients,
    status: new Date(scheduleIso).getTime() > Date.now() ? 'scheduled' : 'queued',
    scheduledFor: scheduleIso,
    delayMs: Number(delayMs) > 0 ? Number(delayMs) : config.defaultDelayMs,
  };

  const created = repos.createCampaign(req.user.id, campaign);
  scheduler.schedule(created);
  broadcast('campaigns:new', { id: created.id });

  res.status(201).json({ campaign: created });
});

app.post('/api/campaigns/:id/send-now', authRequired, async (req, res) => {
  const existing = repos.getCampaignById(req.params.id, req.user.id);
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  repos.updateCampaignStatus(existing.id, {
    status: 'queued',
    scheduledFor: new Date().toISOString(),
    completedAt: null,
  });
  const updated = repos.getCampaignById(existing.id);
  scheduler.schedule(updated);
  broadcast('campaign:status', { id: updated.id, status: 'queued', scheduledFor: updated.scheduledFor });
  res.json({ campaign: updated });
});

app.post('/api/campaigns/:id/cancel', authRequired, async (req, res) => {
  const existing = repos.getCampaignById(req.params.id, req.user.id);
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  repos.updateCampaignStatus(existing.id, { status: 'cancelled' });
  scheduler.cancel(existing.id);
  repos.appendCampaignLog(existing.id, { level: 'info', message: 'Cancelled by user.' });
  broadcast('campaign:status', { id: existing.id, status: 'cancelled' });
  res.json({ campaign: repos.getCampaignById(existing.id) });
});

app.delete('/api/campaigns/:id', authRequired, async (req, res) => {
  const existing = repos.getCampaignById(req.params.id, req.user.id);
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  scheduler.cancel(existing.id);
  repos.deleteCampaign(existing.id);
  broadcast('campaigns:deleted', { id: existing.id });
  res.json({ ok: true });
});

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

app.get('/tracking/pixel/:payload.gif', (req, res) => {
  const payload = decodeTrackingPayload(req.params.payload);
  if (payload?.c && payload?.e && payload?.t === 'open') {
    const existing = repos.getCampaignById(payload.c);
    if (existing) {
      const ua = req.headers['user-agent'] || '';
      const uaLower = ua.toLowerCase();
      const isBot = /bot|spider|crawl|preview|proxy|scanner|headless|google|bing|yahoo|baidu|duckduck/i.test(ua)
        || req.headers['x-forwarded-for'] === undefined && req.ip === '::ffff:127.0.0.1';

      if (!isBot) {
        const send = repos.getSend(payload.c, payload.e);
        if (send && !send.openedAt) {
          repos.updateSend(payload.c, payload.e, { openedAt: new Date().toISOString() });
          repos.incrementTracking(payload.c, { opened: true });
          repos.recordTrackingEvent({
            campaignId: payload.c,
            recipientEmail: payload.e,
            eventType: 'open',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] || '',
          });
          broadcast('campaign:tracking', {
            id: payload.c,
            event: 'open',
            email: payload.e,
          });
        }
      }
    }
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(TRANSPARENT_GIF);
});

app.get('/tracking/click/:payload', (req, res) => {
  const payload = decodeTrackingPayload(req.params.payload);
  if (!payload || !payload.c || !payload.e || !payload.u) {
    res.status(400).send('Invalid tracking link.');
    return;
  }
  const existing = repos.getCampaignById(payload.c);
  if (existing) {
    const send = repos.getSend(payload.c, payload.e);
    if (send && !send.clickedAt) {
      repos.updateSend(payload.c, payload.e, { clickedAt: new Date().toISOString() });
      repos.incrementTracking(payload.c, { clicked: true });
    } else if (send) {
      repos.updateSend(payload.c, payload.e, { clickedAt: new Date().toISOString() });
    }
    repos.recordTrackingEvent({
      campaignId: payload.c,
      recipientEmail: payload.e,
      eventType: 'click',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || '',
      linkUrl: payload.u,
    });
    broadcast('campaign:tracking', {
      id: payload.c,
      event: 'click',
      email: payload.e,
      link: payload.u,
    });
  }
  res.redirect(payload.u);
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'index.html'));
});

app.get(/^\/(?!api|tracking).*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'index.html'));
});

async function start() {
  const setup = auth.ensureDefaultUser({
    auth: {
      adminUser: config.auth.adminUser,
      adminPass: config.auth.adminPass,
    },
    jwt: { secret: config.auth.jwtSecret },
  });
  jwtSecret = setup.jwtSecret;

  await scheduler.sync();

  server.listen(config.port, () => {
    console.log('');
    console.log('============================================================');
    console.log('  Campaign Studio is LIVE');
    console.log(`  URL:      ${config.appBaseUrl}`);
    console.log(`  Login:    ${setup.adminUser} / ${process.env.ADMIN_PASS || 'admin123'}`);
    console.log(`  SMTP:     ${config.smtp.isConfigured ? `${config.smtp.host}:${config.smtp.port}` : 'Ethereal (preview only)'}  `);
    console.log(`  LinkedIn: ${config.linkedin.isConfigured ? 'Configured' : 'Add LINKEDIN_CLIENT_ID + SECRET'}`);
    console.log('============================================================');
    console.log('');
  });
}

process.on('SIGINT', () => {
  scheduler.shutdown();
  server.close(() => process.exit(0));
});

start().catch((error) => {
  console.error('Failed to start application', error);
  process.exit(1);
});
