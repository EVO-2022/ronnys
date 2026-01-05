require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes');
const { ensureSheetsInitialized, syncChemicals, syncInventoryState, syncUsageHistory, isEnabled } = require('./lib/sheets');
const { cleanupOldActivityLogs, getCurrentTime, formatCST } = require('./lib/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// Clean up old activity logs on startup (older than 12 hours)
(async () => {
  try {
    const now = getCurrentTime();
    const nowCST = formatCST(now);
    console.log(`[Startup] Current CST time: ${nowCST}`);
    const deletedCount = await cleanupOldActivityLogs();
    console.log(`✅ Activity log cleanup complete (deleted ${deletedCount} entries)`);
  } catch (e) {
    console.error('❌ Activity log cleanup failed', e.message);
  }
})();

// Force Google Sheets initialization and backfill at startup
if (process.env.GOOGLE_SHEETS_ENABLED === 'true') {
  (async () => {
    try {
      await ensureSheetsInitialized();
      await syncChemicals();
      await syncInventoryState();
      await syncUsageHistory();
      console.log('✅ Google Sheets fully initialized + backfilled');
    } catch (e) {
      console.error('❌ Google Sheets init failed', e.message);
    }
  })();
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', routes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500);
  res.json({ error: err.message || 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (isEnabled()) {
    console.log('[Server] Google Sheets sync is enabled');
  } else {
    console.log('[Server] Google Sheets sync is disabled');
  }
});

