require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes');
const { ensureSheetsInitialized, syncChemicals, syncInventoryState, isEnabled } = require('./lib/sheets');

const app = express();
const PORT = process.env.PORT || 3000;

// Force Google Sheets initialization and backfill at startup
if (process.env.GOOGLE_SHEETS_ENABLED === 'true') {
  (async () => {
    try {
      await ensureSheetsInitialized();
      await syncChemicals();
      await syncInventoryState();
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

