# NetX MVP

Professional matchmaking platform with survey onboarding, smart matching, messaging, and email notifications.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the server
node server.js

# 3. Open in browser
# → http://localhost:3000
```

## Enable Real Email Notifications

By default, email notifications are logged to the console. To send real emails:

1. Use a Gmail account
2. Create an App Password at https://myaccount.google.com/apppasswords
3. Set environment variables before running:

**Windows (Command Prompt):**
```cmd
set NETX_EMAIL_USER=yourname@gmail.com
set NETX_EMAIL_PASS=your_app_password
node server.js
```

**Windows (PowerShell):**
```powershell
$env:NETX_EMAIL_USER="yourname@gmail.com"
$env:NETX_EMAIL_PASS="your_app_password"
node server.js
```

**Mac/Linux:**
```bash
NETX_EMAIL_USER=yourname@gmail.com NETX_EMAIL_PASS=your_app_password node server.js
```

## Access From Other Devices

When the server starts, it prints your local IP address. Any device on the same network can access NetX at that address (e.g., `http://192.168.1.100:3000`).

## How It Works

- **Accounts** are stored in `netx-db.json` (created automatically)
- **Passwords** are hashed with SHA-256 + salt
- **Matching** uses a semantic interest taxonomy (e.g., "NBA fan" matches "Sports fan")
- **Emails** are sent on: registration, new match found, connection accepted, new message received
- **All data** persists in the JSON file — delete `netx-db.json` to reset everything

## Testing Matches

1. Create Account A with interests like "basketball, cooking"
2. Log out
3. Create Account B with interests like "nba, sports, grilling"
4. Both accounts will get email notifications about the match
5. Log into either account to see the match, accept, and message
