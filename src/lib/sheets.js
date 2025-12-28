const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const prisma = require('./prisma');

let authClient = null;
let sheets = null;
let sheetId = null;
let initialized = false;

/**
 * Check if Google Sheets sync is enabled
 */
function isEnabled() {
  return process.env.GOOGLE_SHEETS_ENABLED === 'true';
}

/**
 * Helper function to convert null/undefined to empty string
 */
function empty(v) {
  return v === null || v === undefined ? '' : v;
}

/**
 * Initialize Google Sheets authentication
 */
async function initializeAuth() {
  if (!isEnabled()) {
    return false;
  }

  const jsonPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH;
  if (!jsonPath) {
    console.error('[Sheets] GOOGLE_SERVICE_ACCOUNT_JSON_PATH not set');
    return false;
  }

  const fullPath = path.resolve(process.cwd(), jsonPath);
  
  try {
    if (!fs.existsSync(fullPath)) {
      console.error(`[Sheets] Service account file not found: ${fullPath}`);
      return false;
    }

    const credentials = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    
    authClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    await authClient.authorize();
    
    sheets = google.sheets({ version: 'v4', auth: authClient });
    sheetId = process.env.GOOGLE_SHEET_ID;

    if (!sheetId) {
      console.error('[Sheets] GOOGLE_SHEET_ID not set');
      return false;
    }

    console.log('[Sheets] Authentication successful');
    return true;
  } catch (error) {
    console.error('[Sheets] Authentication failed:', error.message);
    return false;
  }
}

/**
 * Get or initialize the Sheets client
 */
async function getSheetsClient() {
  if (!sheets) {
    const authSuccess = await initializeAuth();
    if (!authSuccess) {
      throw new Error('Failed to initialize Sheets client');
    }
  }
  return sheets;
}

/**
 * Ensure sheets are initialized with correct headers
 */
async function ensureSheetsInitialized() {
  if (!isEnabled()) {
    return;
  }

  const sheets = await getSheetsClient();

  const headers = {
    chemicals: [
      'id', 'name', 'unit', 'increment', 'trackOnShelf', 'trackOnLine',
      'gallonsPerUnit', 'active', 'createdAt', 'updatedAt'
    ],
    inventory_state: [
      'chemicalId', 'chemicalName', 'shelfQty', 'lineQty',
      'combinedQty', 'gallonsTotal', 'updatedAt'
    ],
    activity_log: [
      'id', 'type', 'chemicalId', 'chemicalName', 'location',
      'setQty', 'addQty', 'requestQty', 'note', 'createdBy', 'createdAt'
    ],
  };

  for (const [sheetName, headerRow] of Object.entries(headers)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });
  }

  console.log('✅ Google Sheets headers ensured');
}

/**
 * Sync all chemicals to the chemicals tab
 */
async function syncChemicals() {
  if (!isEnabled()) {
    return;
  }

  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  try {
    const chemicals = await prisma.chemical.findMany({
      orderBy: { name: 'asc' },
    });

    const rows = chemicals.map(chem => [
      empty(chem.id),
      empty(chem.name),
      empty(chem.unit),
      empty(chem.increment),
      empty(chem.trackOnShelf),
      empty(chem.trackOnLine),
      empty(chem.gallonsPerUnit),
      empty(chem.active),
      chem.createdAt ? chem.createdAt.toISOString() : '',
      chem.updatedAt ? chem.updatedAt.toISOString() : '',
    ]);

    // Clear existing data (except header) and write new data
    // Clear a large range first, then write new data
    if (rows.length > 0 || true) {
      const clearRange = `chemicals!A2:J1000`;
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: clearRange,
      });
    }

    // Write new data
    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'chemicals!A2',
        valueInputOption: 'RAW',
        resource: { values: rows },
      });
    }

    console.log(`[Sheets] Synced ${rows.length} chemicals`);
  } catch (error) {
    console.error('[Sheets] Error syncing chemicals:', error.message);
  }
}

/**
 * Sync all inventory state to the inventory_state tab
 */
async function syncInventoryState() {
  if (!isEnabled()) {
    return;
  }

  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  try {
    const inventories = await prisma.inventoryState.findMany({
      include: {
        chemical: true,
      },
    });

    const rows = inventories.map(inv => {
      const combinedQty = (inv.shelfQty ?? 0) + (inv.lineQty ?? 0);
      const gallonsTotal = inv.chemical?.gallonsPerUnit
        ? combinedQty * inv.chemical.gallonsPerUnit
        : '';

      return [
        empty(inv.chemicalId),
        empty(inv.chemical?.name),
        empty(inv.shelfQty),
        empty(inv.lineQty),
        empty(combinedQty),
        empty(gallonsTotal),
        inv.updatedAt ? inv.updatedAt.toISOString() : '',
      ];
    });

    // Clear existing data (except header) and write new data
    // Clear a large range first, then write new data
    if (rows.length > 0 || true) {
      const clearRange = `inventory_state!A2:G1000`;
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: clearRange,
      });
    }

    // Write new data
    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'inventory_state!A2',
        valueInputOption: 'RAW',
        resource: { values: rows },
      });
    }

    console.log(`[Sheets] Synced ${rows.length} inventory states`);
  } catch (error) {
    console.error('[Sheets] Error syncing inventory state:', error.message);
  }
}

/**
 * Append a single activity log row
 */
async function appendActivityLogRow(logId) {
  if (!isEnabled()) {
    return;
  }

  try {
    const sheets = await getSheetsClient();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const log = await prisma.activityLog.findUnique({
      where: { id: logId },
      include: {
        chemical: true,
      },
    });

    if (!log) {
      console.warn(`[Sheets] Activity log ${logId} not found`);
      return;
    }

    // Convert all values using empty() helper
    const row = [
      empty(log.id),
      empty(log.type),
      empty(log.chemicalId),
      empty(log.chemical?.name),
      empty(log.location),
      empty(log.setQty),
      empty(log.addQty),
      empty(log.requestQty),
      empty(log.note),
      empty(log.createdBy),
      log.createdAt ? log.createdAt.toISOString() : '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'activity_log!A:A',
      valueInputOption: 'RAW',
      resource: { values: [row] },
    });

    console.log(`[Sheets] Appended activity log ${logId}`);
  } catch (error) {
    console.error('[Sheets] Error appending activity log:', error.message);
  }
}

module.exports = {
  isEnabled,
  ensureSheetsInitialized,
  syncChemicals,
  syncInventoryState,
  appendActivityLogRow,
  getSheetsClient,
  empty,
};
