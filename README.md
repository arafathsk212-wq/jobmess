# Campaign Studio

A full-featured email campaign application with LinkedIn OAuth integration, bulk recipient import, and scheduled email sending.

## Features

- **LinkedIn OAuth Login** - Secure OAuth 2.0 authentication with LinkedIn
- **Bulk Recipient Import** - Import recipients from CSV, Excel, TSV, or TXT files
- **Email Validation** - Automatic email validation with MX record checking
- **Campaign Scheduling** - Schedule campaigns for future delivery or send immediately
- **Real-time Progress** - WebSocket-based real-time campaign progress updates
- **Email Tracking** - Track opens and clicks with transparent pixel and link tracking
- **SMTP Integration** - Real email sending via SMTP or preview with Ethereal test accounts
- **Persistent Storage** - SQLite database for campaigns, recipients, and tracking data

## Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

3. Edit `.env` with your configuration:
```env
PORT=3000
APP_BASE_URL=http://localhost:3000

# Admin credentials
ADMIN_USER=admin
ADMIN_PASS=admin123
JWT_SECRET=change-this-to-a-long-random-string-in-prod-32

# LinkedIn OAuth (get from https://www.linkedin.com/developers)
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
LINKEDIN_SCOPES=openid profile email

# SMTP Configuration (optional - uses Ethereal if not configured)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_email@gmail.com

# Default delay between emails (milliseconds)
DEFAULT_DELAY_MS=5000
```

### LinkedIn OAuth Setup

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers)
2. Create a new application
3. Add `http://localhost:3000/api/linkedin/callback` as a redirect URL
4. Copy Client ID and Client Secret to your `.env` file
5. Request scopes: `openid profile email`

### SMTP Setup

For real email sending, configure your SMTP settings. For testing, leave SMTP credentials blank and the app will use Ethereal test accounts with preview URLs.

## Usage

### Start the Server

```bash
npm start
```

The application will be available at `http://localhost:3000`

### Workflow

1. **Login** with admin credentials (default: `admin` / `admin123`)
2. **Connect LinkedIn** via OAuth (optional but recommended)
3. **Import Recipients** from CSV/Excel file:
   - File should contain email addresses
   - Supports columns: firstName, lastName, fullName, company, title
   - Emails are automatically validated with MX record checking
4. **Create Campaign**:
   - Enter campaign name and sender email
   - Set delay between emails (default: 5000ms)
   - Schedule for future or send immediately
   - Use `{{firstName}}`, `{{lastName}}`, etc. for personalization
5. **Monitor Progress** in real-time via WebSocket updates
6. **Track Results** with open and click tracking

### File Format Examples

**CSV Example:**
```csv
firstName,lastName,email,company,title
John,Doe,john@example.com,Acme Corp,Developer
Jane,Smith,jane@example.com,Tech Inc,Manager
```

**Excel Example:**
- First row should contain headers
- Email column is required
- Other columns: firstName, lastName, fullName, company, title

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### LinkedIn OAuth
- `GET /api/linkedin/auth` - Start OAuth flow
- `GET /api/linkedin/callback` - OAuth callback
- `GET /api/linkedin/status` - Get connection status
- `POST /api/linkedin/logout` - Disconnect LinkedIn

### Recipients
- `POST /api/recipients/import` - Import recipients from file

### Campaigns
- `GET /api/campaigns` - List all campaigns
- `GET /api/campaigns/:id` - Get campaign details
- `POST /api/campaigns` - Create new campaign
- `POST /api/campaigns/:id/send-now` - Send immediately
- `POST /api/campaigns/:id/cancel` - Cancel campaign
- `DELETE /api/campaigns/:id` - Delete campaign

### Tracking
- `GET /tracking/pixel/:payload.gif` - Email open tracking pixel
- `GET /tracking/click/:payload` - Link click tracking

## Database Schema

The application uses SQLite with the following tables:
- `users` - User accounts
- `linkedin_sessions` - LinkedIn OAuth sessions
- `imports` - Import history
- `campaigns` - Campaign definitions
- `campaign_logs` - Campaign activity logs
- `campaign_sends` - Individual email sends
- `tracking_events` - Open and click events

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- CSRF protection via same-site cookies
- Helmet.js security headers
- SQL injection prevention via prepared statements
- Rate limiting on email sends

## Troubleshooting

### LinkedIn OAuth Issues
- Ensure redirect URI matches exactly in LinkedIn app settings
- Check that scopes are properly configured
- Verify client ID and secret are correct

### SMTP Issues
- For Gmail, use App Password instead of regular password
- Check firewall settings for SMTP port access
- Verify SMTP credentials are correct
- Use Ethereal for testing if SMTP is unavailable

### Import Issues
- Ensure file format is valid (CSV, Excel, TSV, or TXT)
- Check that email column exists and contains valid emails
- Verify file is not corrupted

## Development

### Project Structure
```
linkedin-mess/
├── server/
│   ├── app.js          # Main Express application
│   ├── auth.js         # Authentication logic
│   ├── config.js       # Configuration management
│   ├── db.js           # Database setup and migrations
│   ├── mailService.js  # Email sending and validation
│   ├── repositories.js # Database access layer
│   ├── scheduler.js    # Campaign scheduling
│   └── data/           # SQLite database files
├── index.html          # Frontend HTML
├── script.js           # Frontend JavaScript
├── styles.css          # Frontend styles
└── package.json        # Dependencies
```

### Adding Features

The codebase is modular and extensible:
- Add new API endpoints in `server/app.js`
- Add database operations in `server/repositories.js`
- Add email features in `server/mailService.js`
- Modify frontend in `script.js` and `styles.css`

## License

ISC

## Support

For issues or questions, please check the troubleshooting section or review the code comments.
