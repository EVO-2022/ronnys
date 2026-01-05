# Google Sheets Backup Configuration

## Current Status
- ✅ Google Sheets sync is **enabled** in `.env`
- ✅ Service account JSON path is configured
- ❌ **GOOGLE_SHEET_ID is NOT set** (required to enable sync)

## What Gets Synced to Sheets
The application syncs three tabs to Google Sheets:

1. **chemicals** - All chemical definitions
2. **inventory_state** - Current inventory levels
3. **activity_log** - Activity log entries (appended as they happen)
4. **usage_history** - NEW: Historical usage tracking for charts and cost analysis

## Setup Instructions

### 1. Create a Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it "Ronny's Car Wash - Inventory Backup"
4. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
   ```

### 2. Share with Service Account
1. Open the service account JSON file: `./secrets/google-service-account.json`
2. Find the `client_email` field (looks like: `xxxxx@xxxxx.iam.gserviceaccount.com`)
3. Share your Google Sheet with this email address (Editor access)

### 3. Update .env File
Add your Sheet ID to `.env`:
```
GOOGLE_SHEET_ID="YOUR_SHEET_ID_HERE"
```

### 4. Restart the Application
```bash
# The service will automatically restart via systemd
pkill -f "node src/server.js"
```

## Daily Backup Strategy

### Manual Backup (Current)
To manually backup, you can:
1. Go to your Google Sheet
2. File → Make a copy
3. Name it with the date: "Ronny's Inventory Backup - YYYY-MM-DD"

### Automated Daily Backup (Recommended)
To set up automated daily backups using Google Apps Script:

1. Open your Google Sheet
2. Extensions → Apps Script
3. Replace the code with:

```javascript
function createDailyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = Utilities.formatDate(new Date(), "CST", "yyyy-MM-dd");
  var backupName = "Ronny's Inventory Backup - " + today;

  // Create a copy in the same folder
  var file = DriveApp.getFileById(ss.getId());
  var folder = file.getParents().next();
  var backup = file.makeCopy(backupName, folder);

  Logger.log("Created backup: " + backupName);
}
```

4. Save the script
5. Click the clock icon (Triggers)
6. Add trigger:
   - Function: `createDailyBackup`
   - Event source: Time-driven
   - Time of day timer: Choose your preferred time (e.g., 2am-3am CST)

This will create a dated copy of your sheet every day automatically.

## What Data is Preserved

### Activity Logs (Temporary - 12 hours)
- Activity logs are **deleted after 12 hours** (CST)
- This keeps the UI clean and focused on recent activity
- Before deletion, data is synced to Google Sheets (if configured)

### Usage History (Permanent)
- **NEW**: Usage history is stored permanently in the database
- Tracks all pickups with quantities and costs
- Will NOT be deleted by the cleanup process
- Can be used for:
  - Usage charts and analytics
  - Cost tracking over time
  - Trend analysis
  - Budget forecasting

## Verifying Sync

After setup, restart the app and check the logs:
```bash
journalctl -u ronnys -f
```

You should see:
```
✅ Google Sheets headers ensured
[Sheets] Synced X chemicals
[Sheets] Synced X inventory states
✅ Google Sheets fully initialized + backfilled
```

If you see errors, check:
1. GOOGLE_SHEET_ID is correct
2. Service account has Editor access to the sheet
3. Service account JSON file is valid
