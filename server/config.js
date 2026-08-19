const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const port = asNumber(process.env.PORT, 3000);
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
const linkedinRedirectUri =
  process.env.LINKEDIN_REDIRECT_URI || `${appBaseUrl}/api/linkedin/callback`;
const linkedinScopes = (process.env.LINKEDIN_SCOPES || 'openid profile email')
  .split(/\s+/)
  .map((scope) => scope.trim())
  .filter(Boolean);

const config = {
  port,
  appBaseUrl,
  defaultDelayMs: asNumber(process.env.DEFAULT_DELAY_MS, 5000),
  auth: {
    adminUser: process.env.ADMIN_USER || 'admin',
    adminPass: process.env.ADMIN_PASS || 'admin123',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me-please-32bytes!',
    jwtTtlSec: asNumber(process.env.JWT_TTL_SEC, 7 * 24 * 60 * 60),
  },
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: linkedinRedirectUri,
    scopes: linkedinScopes,
    authEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoEndpoint: 'https://api.linkedin.com/v2/userinfo',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: asNumber(process.env.SMTP_PORT, 587),
    secure: asBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
};

config.linkedin.isConfigured = Boolean(
  config.linkedin.clientId && config.linkedin.clientSecret && config.linkedin.redirectUri
);

config.smtp.isConfigured = Boolean(
  config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.pass
);

module.exports = config;
