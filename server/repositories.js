const { db, jsonParse } = require('./db');
const crypto = require('crypto');

function getLinkedInSession(userId) {
  const row = db.prepare('SELECT * FROM linkedin_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  if (!row) return null;
  return {
    id: row.id,
    connectedAt: row.connected_at,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    profile: jsonParse(row.profile_json, {}),
  };
}

function saveLinkedInSession(userId, { accessToken, refreshToken, tokenExpiresAt, profile }) {
  db.prepare('DELETE FROM linkedin_sessions WHERE user_id = ?').run(userId);
  const info = db.prepare(`
    INSERT INTO linkedin_sessions (user_id, access_token, refresh_token, token_expires_at, profile_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    accessToken || null,
    refreshToken || null,
    tokenExpiresAt || null,
    profile ? JSON.stringify(profile) : null
  );
  return getLinkedInSession(userId);
}

function clearLinkedInSession(userId) {
  db.prepare('DELETE FROM linkedin_sessions WHERE user_id = ?').run(userId);
}

function generateJobHash(job) {
  const hashString = `${job.title}-${job.company}-${job.location}-${job.visaStatus}-${job.employmentType}`;
  return crypto.createHash('md5').update(hashString).digest('hex');
}

function saveJob(job) {
  const jobHash = generateJobHash(job);
  const postedDate = new Date().toISOString().split('T')[0]; // Always use current date
  
  try {
    // Check if job already exists
    const existing = db.prepare('SELECT id FROM jobs WHERE job_hash = ?').get(jobHash);
    
    if (existing) {
      // Update existing job with new timestamp
      db.prepare(`
        UPDATE jobs 
        SET posted_date = ?, updated_at = datetime('now')
        WHERE job_hash = ?
      `).run(postedDate, jobHash);
      console.log(`Updated existing job: ${job.title}`);
    } else {
      // Insert new job
      db.prepare(`
        INSERT INTO jobs 
        (title, company, location, visa_status, employment_type, posted_date, source, email, phone, description, job_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        job.title,
        job.company,
        job.location,
        job.visaStatus,
        job.employmentType,
        postedDate,
        job.source,
        job.email || null,
        job.phone || null,
        job.description || null,
        jobHash
      );
      console.log(`Saved new job: ${job.title}`);
    }
    return true;
  } catch (error) {
    console.error('Error saving job:', error);
    return false;
  }
}

function getJobs(hoursBack = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursBack);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  const rows = db.prepare(`
    SELECT * FROM jobs 
    WHERE posted_date >= ? 
    ORDER BY posted_date DESC, created_at DESC
  `).all(cutoffDateStr);
  
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    visaStatus: row.visa_status,
    employmentType: row.employment_type,
    postedDate: row.posted_date,
    source: row.source,
    email: row.email,
    phone: row.phone,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getJobsByRole(jobRole, hoursBack = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursBack);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  const rows = db.prepare(`
    SELECT * FROM jobs 
    WHERE posted_date >= ? AND title LIKE ?
    ORDER BY posted_date DESC, created_at DESC
  `).all(cutoffDateStr, `%${jobRole}%`);
  
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    visaStatus: row.visa_status,
    employmentType: row.employment_type,
    postedDate: row.posted_date,
    source: row.source,
    email: row.email,
    phone: row.phone,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function deleteOldJobs(hoursToKeep = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursToKeep);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  const result = db.prepare('DELETE FROM jobs WHERE posted_date < ?').run(cutoffDateStr);
  console.log(`Deleted ${result.changes} old jobs older than ${hoursToKeep} hours`);
  return result.changes;
}

function recordImport(userId, { id, fileName, totalRecipients, validRecipients, invalidRecipients }) {
  db.prepare(`
    INSERT INTO imports (id, user_id, file_name, total_recipients, valid_recipients, invalid_recipients)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, fileName, totalRecipients, validRecipients, invalidRecipients);
}

function listCampaigns(userId) {
  const rows = db.prepare(`
    SELECT * FROM campaigns
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(userId);

  return rows.map(mapCampaignRow);
}

function getCampaignById(campaignId, userId) {
  const row = userId
    ? db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(campaignId, userId)
    : db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  return row ? mapCampaignRow(row) : null;
}

function mapCampaignRow(row) {
  const logs = db.prepare(`
    SELECT timestamp, level, message FROM campaign_logs
    WHERE campaign_id = ? ORDER BY datetime(timestamp) DESC LIMIT 30
  `).all(row.id).map((l) => ({ ...l, timestamp: l.timestamp })).reverse();

  const recipients = jsonParse(row.recipients_json, []);

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    senderEmail: row.sender_email,
    subject: row.subject,
    body: row.body,
    bodyType: row.body_type || 'text',
    recipients,
    status: row.status,
    scheduledFor: row.scheduled_for,
    delayMs: row.delay_ms,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    openedCount: row.opened_count,
    clickedCount: row.clicked_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    logs,
  };
}

function listActiveCampaigns() {
  const rows = db.prepare(`
    SELECT * FROM campaigns
    WHERE status IN ('queued', 'scheduled', 'sending')
  `).all();
  return rows.map(mapCampaignRow);
}

function createCampaign(userId, campaign) {
  const {
    id, name, senderEmail, subject, body, bodyType = 'text',
    recipients, status, scheduledFor, delayMs,
  } = campaign;

  db.prepare(`
    INSERT INTO campaigns (
      id, user_id, name, sender_email, subject, body, body_type,
      recipients_json, status, scheduled_for, delay_ms,
      sent_count, failed_count, opened_count, clicked_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, datetime('now'))
  `).run(
    id, userId, name, senderEmail || null, subject, body, bodyType,
    JSON.stringify(recipients), status, scheduledFor, delayMs
  );

  for (const recipient of recipients) {
    db.prepare(`
      INSERT INTO campaign_sends (campaign_id, recipient_email, recipient_json, status)
      VALUES (?, ?, ?, 'pending')
    `).run(id, recipient.email, JSON.stringify(recipient));
  }

  appendCampaignLog(id, { level: 'info', message: `Campaign created for ${recipients.length} recipients.` });
  return getCampaignById(id);
}

function updateCampaignStatus(campaignId, patch) {
  const fields = [];
  const values = [];
  const allowed = ['status', 'scheduled_for', 'started_at', 'completed_at', 'sent_count', 'failed_count', 'opened_count', 'clicked_count'];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      fields.push(`${key === 'scheduledFor' ? 'scheduled_for' : key === 'startedAt' ? 'started_at' : key === 'completedAt' ? 'completed_at' : key === 'sentCount' ? 'sent_count' : key === 'failedCount' ? 'failed_count' : key === 'openedCount' ? 'opened_count' : key === 'clickedCount' ? 'clicked_count' : key} = ?`);
      values.push(patch[key]);
    }
  }
  if (fields.length === 0) return;
  values.push(campaignId);
  db.prepare(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function appendCampaignLog(campaignId, { level, message }) {
  db.prepare(`
    INSERT INTO campaign_logs (campaign_id, timestamp, level, message)
    VALUES (?, datetime('now'), ?, ?)
  `).run(campaignId, level, message);
}

function updateSend(campaignId, email, patch) {
  const fields = [];
  const values = [];
  const map = {
    status: 'status',
    messageId: 'message_id',
    previewUrl: 'preview_url',
    errorMessage: 'error_message',
    sentAt: 'sent_at',
    openedAt: 'opened_at',
    clickedAt: 'clicked_at',
  };
  for (const [k, v] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      fields.push(`${v} = ?`);
      values.push(patch[k]);
    }
  }
  if (fields.length === 0) return;
  values.push(campaignId, email);
  db.prepare(`UPDATE campaign_sends SET ${fields.join(', ')} WHERE campaign_id = ? AND recipient_email = ?`).run(...values);
}

function incrementTracking(campaignId, { opened = false, clicked = false }) {
  if (opened) {
    db.prepare('UPDATE campaigns SET opened_count = opened_count + 1 WHERE id = ?').run(campaignId);
  }
  if (clicked) {
    db.prepare('UPDATE campaigns SET clicked_count = clicked_count + 1 WHERE id = ?').run(campaignId);
  }
}

function recordTrackingEvent({ campaignId, recipientEmail, eventType, ipAddress, userAgent, linkUrl }) {
  db.prepare(`
    INSERT INTO tracking_events (campaign_id, recipient_email, event_type, ip_address, user_agent, link_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(campaignId || null, recipientEmail || null, eventType, ipAddress || null, userAgent || null, linkUrl || null);
}

function getSend(campaignId, email) {
  const row = db.prepare('SELECT * FROM campaign_sends WHERE campaign_id = ? AND recipient_email = ?').get(campaignId, email);
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    recipientEmail: row.recipient_email,
    recipient: jsonParse(row.recipient_json, {}),
    status: row.status,
    messageId: row.message_id,
    previewUrl: row.preview_url,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    clickedAt: row.clicked_at,
  };
}

function listCampaignSends(campaignId) {
  const rows = db.prepare('SELECT * FROM campaign_sends WHERE campaign_id = ? ORDER BY id').all(campaignId);
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    recipientEmail: row.recipient_email,
    recipient: jsonParse(row.recipient_json, {}),
    status: row.status,
    messageId: row.message_id,
    previewUrl: row.preview_url,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    clickedAt: row.clicked_at,
  }));
}

function deleteCampaign(campaignId) {
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
}

module.exports = {
  getLinkedInSession,
  saveLinkedInSession,
  clearLinkedInSession,
  generateJobHash,
  saveJob,
  getJobs,
  getJobsByRole,
  deleteOldJobs,
  recordImport,
  listCampaigns,
  getCampaignById,
  listActiveCampaigns,
  createCampaign,
  updateCampaignStatus,
  appendCampaignLog,
  updateSend,
  incrementTracking,
  getSend,
  listCampaignSends,
  deleteCampaign,
};
