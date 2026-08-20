const dns = require('dns').promises;
const nodemailer = require('nodemailer');
const cheerio = require('cheerio');
const juice = require('juice');

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const mxCache = new Map();

async function validateEmail(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return { email: cleanEmail, valid: false, reason: 'Empty email address' };
  if (!EMAIL_REGEX.test(cleanEmail)) return { email: cleanEmail, valid: false, reason: 'Invalid email format/syntax' };

  const parts = cleanEmail.split('@');
  if (parts.length !== 2) return { email: cleanEmail, valid: false, reason: 'Malformed email address' };

  const domain = parts[1];
  if (domain.endsWith('.invalid') || domain.endsWith('.test') || domain.endsWith('.example') || domain === 'bad.email') {
    return { email: cleanEmail, valid: false, reason: 'Test/Non-existent domain extension' };
  }

  if (mxCache.has(domain)) {
    const cached = mxCache.get(domain);
    return { email: cleanEmail, valid: cached.valid, reason: cached.reason, mx: cached.mx };
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DNS lookup timeout')), 4000)
    );
    const mxPromise = dns.resolveMx(domain);
    const records = await Promise.race([mxPromise, timeoutPromise]);

    if (records && records.length > 0) {
      records.sort((a, b) => a.priority - b.priority);
      const primaryMx = records[0].exchange;
      mxCache.set(domain, { valid: true, mx: primaryMx });
      return { email: cleanEmail, valid: true, mx: primaryMx };
    } else {
      mxCache.set(domain, { valid: false, reason: 'No MX records found for domain' });
      return { email: cleanEmail, valid: false, reason: 'No MX records found for domain' };
    }
  } catch (error) {
    const reason = error.code === 'ENOTFOUND'
      ? `Domain "${domain}" does not exist`
      : error.code === 'ENODATA'
        ? `Domain "${domain}" has no mail servers configured`
        : `Mail server lookup failed (${error.message || 'DNS error'})`;
    mxCache.set(domain, { valid: false, reason });
    return { email: cleanEmail, valid: false, reason };
  }
}

async function validateEmailBatch(emails) {
  const results = [];
  const chunkSize = 10;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map((e) => validateEmail(e)));
    results.push(...chunkResults);
  }
  return results;
}

async function createTransporter(config) {
  if (config.provider === 'ethereal' || (!config.pass && !config.smtpPass)) {
    const testAccount = await nodemailer.createTestAccount();
    return {
      isEthereal: true,
      transporter: nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      }),
    };
  }

  const host = config.host || config.smtpHost;
  const port = config.port || config.smtpPort || 587;
  const secure = config.secure !== undefined ? config.secure : port === 465;
  const smtpUser = config.user || config.smtpUser;
  const smtpPass = config.pass || config.smtpPass;

  console.log(`Creating SMTP transporter: host=${host}, port=${port}, secure=${secure}, user=${smtpUser}`);
  
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
    debug: true, // Enable debug logging
    logger: true, // Enable logger
  });

  try {
    console.log('Verifying SMTP connection...');
    await transporter.verify();
    console.log('SMTP connection verified successfully');
    return { transporter, isEthereal: false };
  } catch (error) {
    console.error('SMTP verification failed:', error.message);
    console.error('Full error:', error);
    return { transporter, isEthereal: true };
  }
}

function interpolate(template, data = {}) {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const directVal = data[key];
    if (directVal !== undefined && directVal !== null) return directVal;
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase() === lowerKey) {
        return v !== undefined && v !== null ? v : '';
      }
    }
    return match;
  });
}

function encodeTrackingPayload(payload) {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

function decodeTrackingPayload(encoded) {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function buildTrackingPixel(baseUrl, campaignId, email) {
  const payload = encodeTrackingPayload({ c: campaignId, e: email, t: 'open' });
  return `${baseUrl}/tracking/pixel/${payload}.gif`;
}

function buildTrackingLink(baseUrl, campaignId, email, originalUrl) {
  const payload = encodeTrackingPayload({
    c: campaignId,
    e: email,
    t: 'click',
    u: originalUrl,
  });
  return `${baseUrl}/tracking/click/${payload}`;
}

function inlineAndTrackHtml(baseUrl, campaignId, email, htmlSource, includePixel = true) {
  if (!htmlSource) return { html: '', hasLinks: false };
  let html = htmlSource;

  try {
    if (/<style|<link|style=|<body|<head/i.test(html)) {
      html = juice(html, { removeStyleTags: true, preserveMediaQueries: true, webResources: { images: false } });
    }
  } catch {
    // juice can fail on malformed HTML; fall through with source
  }

  let hasLinks = false;
  try {
    const $ = cheerio.load(html);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (/^https?:\/\//i.test(href)) {
        hasLinks = true;
        $(el).attr('href', buildTrackingLink(baseUrl, campaignId, email, href));
      }
    });

    if (includePixel) {
      const pixelUrl = buildTrackingPixel(baseUrl, campaignId, email);
      const pixelImg = `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none !important;visibility:hidden !important;opacity:0 !important;width:0 !important;height:0 !important;border:0 !important;outline:none !important;" />`;
      if ($('body').length) {
        $('body').append(pixelImg);
      } else {
        $.root().append(pixelImg);
      }
    }

    html = $.html();
  } catch {
    // cheerio error fall through
  }

  return { html, hasLinks };
}

function buildTextUnsubscribe(baseUrl, campaignId, email) {
  return `\n\n---\nTracked by Campaign Studio`;
}

async function sendMail({
  transporter,
  from,
  to,
  subject,
  body,
  bodyType = 'text',
  contactData = {},
  baseUrl = null,
  campaignId = null,
  enableTracking = true,
}) {
  const personalizedSubject = interpolate(subject, contactData);
  const personalizedText = bodyType === 'text' || bodyType === 'both'
    ? interpolate(body, contactData)
    : null;
  const personalizedHtml = bodyType === 'html' || bodyType === 'both'
    ? interpolate(body, contactData)
    : null;

  let textContent = personalizedText;
  let htmlContent = null;
  let trackingApplied = false;

  if (personalizedHtml) {
    const shouldTrack = enableTracking && baseUrl && campaignId;
    const tracked = shouldTrack
      ? inlineAndTrackHtml(baseUrl, campaignId, to, personalizedHtml, true)
      : { html: personalizedHtml, hasLinks: false };
    htmlContent = tracked.html;
    trackingApplied = shouldTrack;
  }

  if (!textContent && !htmlContent) {
    textContent = interpolate(body, contactData);
  }

  if (textContent && enableTracking && baseUrl && campaignId) {
    textContent = textContent.replace(/(https?:\/\/[^\s<>"']+)/gi, (match) => {
      trackingApplied = true;
      return buildTrackingLink(baseUrl, campaignId, to, match);
    });
    textContent += `\n\n${buildTrackingPixel(baseUrl, campaignId, to)}`;
  }

  const mailOptions = {
    from: from || '"Campaign Studio" <noreply@campaign.local>',
    to,
    subject: personalizedSubject,
  };
  if (htmlContent) mailOptions.html = htmlContent;
  if (textContent) mailOptions.text = textContent;

  // Add timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Email sending timeout after 30 seconds')), 30000)
  );
  
  const sendPromise = transporter.sendMail(mailOptions);
  const info = await Promise.race([sendPromise, timeoutPromise]);
  const previewUrl = nodemailer.getTestMessageUrl(info);

  return {
    success: true,
    messageId: info.messageId,
    previewUrl: previewUrl || null,
    to,
    trackingApplied,
  };
}

module.exports = {
  validateEmail,
  validateEmailBatch,
  createTransporter,
  interpolate,
  sendMail,
  buildTrackingPixel,
  buildTrackingLink,
  encodeTrackingPayload,
  decodeTrackingPayload,
  inlineAndTrackHtml,
};
