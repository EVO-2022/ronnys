const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { pickupSchema, updateSchema, requestSchema } = require('../lib/validation');
const { validateQuantity, validateWholeQuantity, getAllowedLocations, getIncrementForLocation, convertUnitsToGallons, convertGallonsToUnits, getGallonIncrement, checkLowInventory } = require('../lib/inventory');
const { syncInventoryState, appendActivityLogRow } = require('../lib/sheets');

// GET / - Dashboard
router.get('/', async (req, res, next) => {
  try {
    const chemicals = await prisma.chemical.findMany({
      where: { active: true },
      include: {
        inventory: true,
      },
      // Order will be applied manually based on custom order
    });

    // Fetch activity logs and group by batchId
    const allActivityLogs = await prisma.activityLog.findMany({
      take: 200, // Fetch more to account for grouping
      orderBy: { createdAt: 'desc' },
      include: {
        chemical: {
          select: {
            name: true,
          },
        },
      },
    });

    // Group logs by batchId and keep standalone logs
    const logGroups = new Map();
    const seenBatches = new Set();

    for (const log of allActivityLogs) {
      if (log.batchId && !seenBatches.has(log.batchId)) {
        // First log of this batch - collect all logs in this batch
        const batchLogs = allActivityLogs.filter(l => l.batchId === log.batchId);
        logGroups.set(log.id, { logs: batchLogs, createdAt: log.createdAt });
        seenBatches.add(log.batchId);
      } else if (!log.batchId) {
        // Standalone log (no batchId)
        logGroups.set(log.id, { logs: [log], createdAt: log.createdAt });
      }
      // Skip logs that are part of an already-processed batch
    }

    // Sort by createdAt and take top 50
    const sortedGroups = Array.from(logGroups.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    // Calculate totals
    // Note: Inventory is now stored in gallons (except Clean Kit in boxes)
    let totalGallons = 0;
    let totalBoxes = 0;
    let totalBarrels = 0;
    let totalBuckets = 0;

    chemicals.forEach((chemical) => {
      const inventory = chemical.inventory || { shelfQty: 0, lineQty: 0 };
      const combinedGallons = inventory.shelfQty + inventory.lineQty;

      if (chemical.gallonsPerUnit) {
        // Stored in gallons, convert to units for totals
        totalGallons += combinedGallons;
        const units = convertGallonsToUnits(chemical, combinedGallons);

        if (chemical.unit === 'BOX') {
          totalBoxes += units;
        } else if (chemical.unit === 'BARREL') {
          totalBarrels += units;
        } else if (chemical.unit === 'BUCKET') {
          totalBuckets += units;
        }
      } else {
        // Clean Kit - stored in boxes
        totalBoxes += combinedGallons;
      }
    });

    // Define custom order for chemicals
    const chemicalOrder = [
      'Clean',
      'Nova',
      'Silk',
      'EZ Polish Red',
      'Low PH Shampoo',
      'Prizm Red',
      'Prizm Blue',
      'Prizm Gold',
      null, // Gap separator
      'Clean and Fresh Blast',
      'Tire Shine',
      'Road Rage',
      'Bubblicious',
      'Glass Cleaner',
      'RLC',
      null, // Gap separator
      'Air Freshener - Black Ice',
      'Air Freshener - New Car',
      'Air Freshener - Berry Blast',
      'Air Freshener - Pina Colada',
      'Air Freshener - Cool Water',
      null, // Gap separator
      'Bottles',
      'Bottle Triggers',
    ];

    // Create a map for quick lookup
    const orderMap = new Map();
    chemicalOrder.forEach((name, index) => {
      if (name) {
        orderMap.set(name, index);
      }
    });

    // Sort chemicals by custom order
    const sortedChemicals = [...chemicals].sort((a, b) => {
      const orderA = orderMap.get(a.name);
      const orderB = orderMap.get(b.name);
      
      // If both have defined order, sort by order
      if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
      }
      // If only A has order, A comes first
      if (orderA !== undefined) return -1;
      // If only B has order, B comes first
      if (orderB !== undefined) return 1;
      // If neither has order, maintain original order (or sort alphabetically)
      return a.name.localeCompare(b.name);
    });

    // Prepare chemicals with allowed locations and display values for frontend
    const chemicalsWithRules = sortedChemicals.map((chemical) => {
      const allowedLocations = getAllowedLocations(chemical);
      const shelfIncrement = getGallonIncrement(chemical);
      const lineIncrement = chemical.trackOnLine ? getGallonIncrement(chemical) : null;

      const inv = chemical.inventory || { shelfQty: 0, lineQty: 0 };

      // Format display values (show both gallons and units)
      const formatQty = (gallons) => {
        if (chemical.gallonsPerUnit) {
          const units = convertGallonsToUnits(chemical, gallons);
          const unitLabel = chemical.unit.toLowerCase() + (units !== 1 ? 's' : '');
          return `${gallons.toFixed(1)} gal (${units.toFixed(1)} ${unitLabel})`;
        } else {
          // Clean Kit - stored as boxes
          return `${gallons.toFixed(0)} box${gallons !== 1 ? 'es' : ''}`;
        }
      };

      return {
        ...chemical,
        allowedLocations,
        shelfIncrement,
        lineIncrement,
        shelfQtyDisplay: formatQty(inv.shelfQty),
        lineQtyDisplay: chemical.trackOnLine ? formatQty(inv.lineQty) : 'N/A',
        combinedQtyDisplay: formatQty(inv.shelfQty + inv.lineQty),
      };
    });

    // Format activity log groups for display
    const formattedActivityLogs = sortedGroups.map((group) => {
      const logs = group.logs;
      const firstLog = logs[0];
      const date = new Date(firstLog.createdAt).toLocaleString();
      let message = '';
      let note = firstLog.note;

      if (logs.length === 1) {
        // Single log - format as before
        const log = firstLog;
        const chemicalName = log.chemical.name;

        if (log.type === 'PICKUP') {
          const location = log.location === 'SHELF' ? 'On the Shelf' : 'On the Line';
          message = `${date} - Picked up ${log.addQty} ${chemicalName} (${location})`;
        } else if (log.type === 'UPDATE') {
          const location = log.location === 'SHELF' ? 'On the Shelf' : 'On the Line';
          message = `${date} - Updated ${chemicalName} ${location} to ${log.setQty}`;
        } else if (log.type === 'REQUEST') {
          const qtyText = log.requestQty ? ` (${log.requestQty})` : '';
          message = `${date} - Requested ${chemicalName}${qtyText}`;
        } else {
          message = `${date} - ${log.type} ${chemicalName}`;
        }
      } else {
        // Multiple logs - create consolidated message
        const type = firstLog.type;

        if (type === 'PICKUP') {
          const location = firstLog.location === 'SHELF' ? 'On the Shelf' : 'On the Line';
          const items = logs.map(l => `${l.chemical.name} (${l.addQty})`).join(', ');
          message = `${date} - Picked up chemicals: ${items} (${location})`;
        } else if (type === 'UPDATE') {
          const location = firstLog.location === 'SHELF' ? 'On the Shelf' : 'On the Line';
          const items = logs.map(l => `${l.chemical.name} → ${l.setQty}`).join(', ');
          message = `${date} - Updated inventory (${location}): ${items}`;
        } else if (type === 'REQUEST') {
          const items = logs.map(l => {
            const qtyText = l.requestQty ? ` (${l.requestQty})` : '';
            return `${l.chemical.name}${qtyText}`;
          }).join(', ');
          message = `${date} - Requested: ${items}`;
        } else {
          const items = logs.map(l => l.chemical.name).join(', ');
          message = `${date} - ${type}: ${items}`;
        }
      }

      return {
        id: firstLog.id,
        message,
        note: note,
      };
    });

    // Helper function to generate quantity options for dropdowns
    function generateQuantityOptions(increment, max = 20, excludeZero = false) {
      const options = [];
      for (let i = 0; i <= max; i += increment) {
        // Round to avoid floating point precision issues
        const value = Math.round(i * 100) / 100;
        if (!excludeZero || value > 0) {
          options.push(value);
        }
      }
      return options;
    }

    const { isEnabled: sheetsEnabled } = require('../lib/sheets');

    // Check for open request batch
    const openRequestBatch = await prisma.requestBatch.findFirst({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    // Get last updated timestamp
    // First try to get max updatedAt from InventoryState
    const lastInventoryState = await prisma.inventoryState.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    let lastUpdatedAt = lastInventoryState?.updatedAt || null;

    // If no inventory state, fallback to latest PICKUP or UPDATE activity log
    if (!lastUpdatedAt) {
      const lastActivityLog = await prisma.activityLog.findFirst({
        where: {
          type: {
            in: ['PICKUP', 'UPDATE'],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      lastUpdatedAt = lastActivityLog?.createdAt || null;
    }

    // Format the timestamp
    let lastUpdatedFormatted = '—';
    if (lastUpdatedAt) {
      const now = new Date();
      const updated = new Date(lastUpdatedAt);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const updatedDate = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate());

      const timeStr = updated.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      if (updatedDate.getTime() === today.getTime()) {
        lastUpdatedFormatted = `Today at ${timeStr}`;
      } else if (updatedDate.getTime() === yesterday.getTime()) {
        lastUpdatedFormatted = `Yesterday at ${timeStr}`;
      } else {
        const monthStr = updated.toLocaleDateString('en-US', { month: 'short' });
        const dayStr = updated.getDate();
        lastUpdatedFormatted = `${monthStr} ${dayStr} at ${timeStr}`;
      }
    }

    // Check for low inventory
    const lowInventoryItems = [];
    chemicals.forEach((chemical) => {
      const lowCheck = checkLowInventory(chemical, chemical.inventory);
      if (lowCheck.isLow) {
        // Format the current quantity for display
        let currentDisplay = '';
        if (chemical.gallonsPerUnit) {
          const units = convertGallonsToUnits(chemical, lowCheck.current);
          const unitLabel = chemical.unit.toLowerCase() + (units !== 1 ? 's' : '');
          currentDisplay = `${lowCheck.current.toFixed(1)} gal (${units.toFixed(1)} ${unitLabel})`;
        } else {
          // Clean Kit - stored as boxes
          currentDisplay = `${lowCheck.current.toFixed(0)} box${lowCheck.current !== 1 ? 'es' : ''}`;
        }

        lowInventoryItems.push({
          chemicalName: chemical.name,
          location: lowCheck.location,
          threshold: lowCheck.threshold,
          current: lowCheck.current,
          currentDisplay: currentDisplay,
          unit: chemical.unit,
        });
      }
    });

    res.render('index', {
      chemicals: chemicalsWithRules,
      activityLogs: formattedActivityLogs,
      totals: {
        totalGallons: totalGallons.toFixed(1),
        totalBoxes: totalBoxes.toFixed(1),
        totalBarrels: totalBarrels.toFixed(1),
        totalBuckets: totalBuckets.toFixed(1),
      },
      generateQuantityOptions,
      sheetsEnabled: sheetsEnabled(),
      hasOpenRequest: !!openRequestBatch,
      openRequestBatchId: openRequestBatch?.id || null,
      lastUpdatedFormatted: lastUpdatedFormatted,
      lowInventoryItems: lowInventoryItems,
      hasLowInventory: lowInventoryItems.length > 0,
    });
  } catch (error) {
    next(error);
  }
});

// POST /pickup
router.post('/pickup', async (req, res, next) => {
  try {
    const pickups = req.body.pickups || {};
    const note = req.body.note && req.body.note.trim() !== '' ? req.body.note.trim() : null;
    const errors = [];
    const validPickups = [];

    // First pass: validate all pickups
    for (const [chemicalId, pickupData] of Object.entries(pickups)) {
      // Skip if qty is missing/empty (location always SHELF for pickup)
      if (pickupData.qty === undefined || pickupData.qty === '' || pickupData.qty === null) {
        continue;
      }

      try {
        // Pickup always goes to SHELF
        const location = 'SHELF';
        const validated = pickupSchema.parse({
          chemicalId,
          location: location,
          qty: parseFloat(pickupData.qty),
          note: note || undefined, // Convert null/empty to undefined for Zod
        });

        const chemical = await prisma.chemical.findUnique({
          where: { id: chemicalId },
        });

        if (!chemical) {
          errors.push(`Chemical ${chemicalId} not found`);
          continue;
        }

        // Pickup always uses whole quantities and always goes to SHELF
        const validation = validateWholeQuantity(chemical, location, validated.qty);
        if (!validation.valid) {
          errors.push(`${chemical.name}: ${validation.error}`);
          continue;
        }

        validPickups.push({ chemical, validated, location });
      } catch (error) {
        if (error.name === 'ZodError') {
          errors.push(`${chemicalId}: ${error.errors[0].message}`);
        } else {
          errors.push(`${chemicalId}: ${error.message}`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    if (validPickups.length === 0) {
      return res.redirect('/');
    }

    // Generate batch ID for this transaction
    const crypto = require('crypto');
    const batchId = crypto.randomUUID();

    // Second pass: process all valid pickups with same batchId
    for (const { chemical, validated, location } of validPickups) {
      // Get current inventory or create if doesn't exist
      let inventory = await prisma.inventoryState.findUnique({
        where: { chemicalId: chemical.id },
      });

      if (!inventory) {
        inventory = await prisma.inventoryState.create({
          data: {
            chemicalId: chemical.id,
            shelfQty: 0,
            lineQty: 0,
          },
        });
      }

      // Convert pickup units to gallons (or keep as boxes for Clean Kit)
      const gallonsToAdd = convertUnitsToGallons(chemical, validated.qty);

      // Update inventory by adding quantity to SHELF only
      await prisma.inventoryState.update({
        where: { chemicalId: chemical.id },
        data: {
          shelfQty: inventory.shelfQty + gallonsToAdd,
        },
      });

      // Create activity log with batchId
      const activityLog = await prisma.activityLog.create({
        data: {
          type: 'PICKUP',
          chemicalId: chemical.id,
          location: location,
          addQty: validated.qty,
          note: note,
          batchId: batchId,
        },
      });

      // Record usage history (permanent record for analytics)
      await prisma.usageHistory.create({
        data: {
          chemicalId: chemical.id,
          chemicalName: chemical.name,
          eventType: 'PICKUP',
          quantityGallons: gallonsToAdd,
          quantityUnits: validated.qty,
          unit: chemical.unit,
          location: location,
          note: note,
        },
      });

      // Sync to Google Sheets if enabled
      try {
        await appendActivityLogRow(activityLog.id);
      } catch (error) {
        console.error('[Routes] Error syncing activity log to sheets:', error.message);
      }
    }

    // Sync all inventory state to Google Sheets if enabled
    try {
      await syncInventoryState();
    } catch (error) {
      console.error('[Routes] Error syncing inventory state to sheets:', error.message);
    }

    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

// POST /update
router.post('/update', async (req, res, next) => {
  try {
    const updates = req.body.updates || {};
    const location = req.body.location;
    const note = req.body.note && req.body.note.trim() !== '' ? req.body.note.trim() : null;
    const errors = [];
    const validUpdates = [];

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    // First pass: validate all updates
    for (const [chemicalId, updateData] of Object.entries(updates)) {
      // Skip if qty is missing/empty/dash (no change indicator)
      if (updateData.qty === undefined || updateData.qty === '' || updateData.qty === null || updateData.qty === '-') {
        continue;
      }

      // Skip if qty is not a valid number
      const qtyValue = parseFloat(updateData.qty);
      if (isNaN(qtyValue)) {
        continue;
      }

      try {
        const validated = updateSchema.parse({
          chemicalId,
          location: location,
          qty: qtyValue,
          note: note || undefined, // Convert null to undefined for Zod
        });

        const chemical = await prisma.chemical.findUnique({
          where: { id: chemicalId },
        });

        if (!chemical) {
          errors.push(`Chemical ${chemicalId} not found`);
          continue;
        }

        const validation = validateQuantity(chemical, validated.location, validated.qty);
        if (!validation.valid) {
          errors.push(`${chemical.name}: ${validation.error}`);
          continue;
        }

        validUpdates.push({ chemical, validated });
      } catch (error) {
        if (error.name === 'ZodError') {
          errors.push(`${chemicalId}: ${error.errors[0].message}`);
        } else {
          errors.push(`${chemicalId}: ${error.message}`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    if (validUpdates.length === 0) {
      return res.redirect('/');
    }

    // Generate batch ID for this transaction
    const crypto = require('crypto');
    const batchId = crypto.randomUUID();

    // Second pass: process all valid updates with same batchId
    for (const { chemical, validated } of validUpdates) {
      // Get current inventory or create if doesn't exist
      let inventory = await prisma.inventoryState.findUnique({
        where: { chemicalId: chemical.id },
      });

      if (!inventory) {
        inventory = await prisma.inventoryState.create({
          data: {
            chemicalId: chemical.id,
            shelfQty: 0,
            lineQty: 0,
          },
        });
      }

      // Update inventory by setting absolute quantity
      await prisma.inventoryState.update({
        where: { chemicalId: chemical.id },
        data: {
          shelfQty: validated.location === 'SHELF'
            ? validated.qty
            : inventory.shelfQty,
          lineQty: validated.location === 'LINE'
            ? validated.qty
            : inventory.lineQty,
        },
      });

      // Create activity log with batchId
      const activityLog = await prisma.activityLog.create({
        data: {
          type: 'UPDATE',
          chemicalId: chemical.id,
          location: validated.location,
          setQty: validated.qty,
          note: note,
          batchId: batchId,
        },
      });

      // Sync to Google Sheets if enabled
      try {
        await appendActivityLogRow(activityLog.id);
      } catch (error) {
        console.error('[Routes] Error syncing activity log to sheets:', error.message);
      }
    }

    // Sync all inventory state to Google Sheets if enabled
    try {
      await syncInventoryState();
    } catch (error) {
      console.error('[Routes] Error syncing inventory state to sheets:', error.message);
    }

    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

// POST /request - Create a batch request
router.post('/request', async (req, res, next) => {
  try {
    // Handle JSON body (items array)
    let items = [];
    if (Array.isArray(req.body.items)) {
      items = req.body.items;
    }
    
    const note = req.body.note && req.body.note.trim() !== '' ? req.body.note.trim() : null;
    const errors = [];
    const validItems = [];

    // Validate items (ignore qty <= 0)
    for (const item of items) {
      if (!item.chemicalId) {
        continue;
      }

      const qty = item.qty !== undefined && item.qty !== '' && item.qty !== null
        ? parseFloat(item.qty)
        : 0;

      if (qty <= 0) {
        continue; // Skip zero or negative quantities
      }

      try {
        const chemical = await prisma.chemical.findUnique({
          where: { id: item.chemicalId },
        });

        if (!chemical) {
          errors.push(`Chemical ${item.chemicalId} not found`);
          continue;
        }

        // Validate quantity against increment rules for requests
        // Request must be whole numbers only
        const validation = validateWholeQuantity(chemical, 'SHELF', qty);
        if (!validation.valid) {
          errors.push(`${chemical.name}: ${validation.error}`);
          continue;
        }

        validItems.push({
          chemicalId: chemical.id,
          requestedQty: qty,
        });
      } catch (error) {
        errors.push(`${item.chemicalId}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'No valid items to request' });
    }

    // Create request batch
    const batch = await prisma.requestBatch.create({
      data: {
        status: 'OPEN',
        note: note,
        items: {
          create: validItems.map(item => ({
            chemicalId: item.chemicalId,
            requestedQty: item.requestedQty,
          })),
        },
      },
    });

    // Create a single activity log entry for the batch
    const firstChemical = await prisma.chemical.findUnique({
      where: { id: validItems[0].chemicalId },
    });

    const activityLog = await prisma.activityLog.create({
      data: {
        type: 'REQUEST',
        chemicalId: firstChemical.id,
        note: note ? `RequestBatch:${batch.id} - ${note}` : `RequestBatch:${batch.id}`,
      },
    });

    // Sync to Google Sheets if enabled
    try {
      await appendActivityLogRow(activityLog.id);
    } catch (error) {
      console.error('[Routes] Error syncing activity log to sheets:', error.message);
    }

    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

// GET /requests/open - Get current open request batch
router.get('/requests/open', async (req, res, next) => {
  try {
    const batch = await prisma.requestBatch.findFirst({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            chemical: true,
          },
          where: {
            requestedQty: {
              gt: 0,
            },
          },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ batchId: null });
    }

    res.json({
      batchId: batch.id,
      createdAt: batch.createdAt,
      note: batch.note,
      items: batch.items.map(item => ({
        chemicalId: item.chemicalId,
        chemicalName: item.chemical.name,
        requestedQty: item.requestedQty,
        increment: item.chemical.unit === 'BUCKET' ? 0.25 : item.chemical.increment,
        unit: item.chemical.unit,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /requests/:batchId - Get request batch details
router.get('/requests/:batchId', async (req, res, next) => {
  try {
    const batch = await prisma.requestBatch.findUnique({
      where: { id: req.params.batchId },
      include: {
        items: {
          include: {
            chemical: true,
          },
          where: {
            requestedQty: {
              gt: 0,
            },
          },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Request batch not found' });
    }

    res.json({
      batchId: batch.id,
      status: batch.status,
      createdAt: batch.createdAt,
      fulfilledAt: batch.fulfilledAt,
      note: batch.note,
      items: batch.items.map(item => ({
        chemicalId: item.chemicalId,
        chemicalName: item.chemical.name,
        requestedQty: item.requestedQty,
        pickedUpQty: item.pickedUpQty || 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /requests/fulfill - Fulfill a request batch
router.post('/requests/fulfill', async (req, res, next) => {
  try {
    const { batchId, pickups } = req.body;

    if (!batchId) {
      return res.status(400).json({ error: 'batchId is required' });
    }

    // Get batch and verify it's OPEN
    const batch = await prisma.requestBatch.findUnique({
      where: { id: batchId },
      include: {
        items: {
          include: {
            chemical: true,
          },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Request batch not found' });
    }

    if (batch.status !== 'OPEN') {
      return res.status(400).json({ error: 'Request batch is not open' });
    }

    const errors = [];
    const validPickups = [];

    // Validate pickups (can include requested items and additional items)
    for (const pickup of pickups || []) {
      if (!pickup.chemicalId) {
        continue;
      }

      const qty = pickup.qty !== undefined && pickup.qty !== '' && pickup.qty !== null
        ? parseFloat(pickup.qty)
        : 0;

      if (qty <= 0) {
        continue; // Skip zero quantities
      }

      // Get chemical for validation
      const chemical = await prisma.chemical.findUnique({
        where: { id: pickup.chemicalId },
        include: {
          inventory: true,
        },
      });

      if (!chemical) {
        errors.push(`Chemical ${pickup.chemicalId} not found`);
        continue;
      }

      // Validate whole quantities (pickup always whole)
      const validation = validateWholeQuantity(chemical, 'SHELF', qty);
      if (!validation.valid) {
        errors.push(`${chemical.name}: ${validation.error}`);
        continue;
      }

      validPickups.push({
        chemicalId: pickup.chemicalId,
        qty,
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    if (validPickups.length === 0) {
      // Still mark batch as fulfilled even if no pickups
      await prisma.requestBatch.update({
        where: { id: batchId },
        data: {
          status: 'FULFILLED',
          fulfilledAt: new Date(),
        },
      });
      return res.json({ ok: true });
    }

    // Generate batch ID for this fulfillment transaction
    const crypto = require('crypto');
    const fulfillBatchId = crypto.randomUUID();

    // Process pickups - handle both requested items and additional items
    for (const pickup of validPickups) {
      const chemicalId = pickup.chemicalId;
      const qty = pickup.qty;

      // Find if this is a requested item
      const requestItem = batch.items.find(i => i.chemicalId === chemicalId);

      // Get chemical for validation
      const chemical = await prisma.chemical.findUnique({
        where: { id: chemicalId },
      });

      if (!chemical) {
        continue; // Skip if chemical not found
      }

      // Add to inventory (always SHELF)
      let inventory = await prisma.inventoryState.findUnique({
        where: { chemicalId: chemicalId },
      });

      if (!inventory) {
        inventory = await prisma.inventoryState.create({
          data: {
            chemicalId: chemicalId,
            shelfQty: 0,
            lineQty: 0,
          },
        });
      }

      // Convert pickup units to gallons (or keep as boxes for Clean Kit)
      const gallonsToAdd = convertUnitsToGallons(chemical, qty);

      await prisma.inventoryState.update({
        where: { chemicalId: chemicalId },
        data: {
          shelfQty: inventory.shelfQty + gallonsToAdd,
        },
      });

      // Create activity log with batchId
      const note = requestItem
        ? `Fulfilled from RequestBatch:${batchId}`
        : `Picked up with RequestBatch:${batchId}`;

      const activityLog = await prisma.activityLog.create({
        data: {
          type: 'PICKUP',
          chemicalId: chemicalId,
          location: 'SHELF',
          addQty: qty,
          note: note,
          batchId: fulfillBatchId,
        },
      });

      // Record usage history (permanent record for analytics)
      await prisma.usageHistory.create({
        data: {
          chemicalId: chemicalId,
          chemicalName: chemical.name,
          eventType: 'PICKUP',
          quantityGallons: gallonsToAdd,
          quantityUnits: qty,
          unit: chemical.unit,
          location: 'SHELF',
          note: note,
        },
      });

      // Sync to Google Sheets if enabled
      try {
        await appendActivityLogRow(activityLog.id);
      } catch (error) {
        console.error('[Routes] Error syncing activity log to sheets:', error.message);
      }

      // Update request item pickedUpQty if this was a requested item
      if (requestItem) {
        await prisma.requestItem.update({
          where: { id: requestItem.id },
          data: {
            pickedUpQty: (requestItem.pickedUpQty || 0) + qty,
          },
        });
      }
    }

    // Mark batch as fulfilled
    await prisma.requestBatch.update({
      where: { id: batchId },
      data: {
        status: 'FULFILLED',
        fulfilledAt: new Date(),
      },
    });

    // Sync inventory state to Sheets
    try {
      await syncInventoryState();
    } catch (error) {
      console.error('[Routes] Error syncing inventory state to sheets:', error.message);
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// GET /log/:id - Get activity log details
router.get('/log/:id', async (req, res, next) => {
  try {
    const log = await prisma.activityLog.findUnique({
      where: { id: req.params.id },
      include: {
        chemical: true,
      },
    });

    if (!log) {
      return res.status(404).json({ error: 'Activity log not found' });
    }

    // Build response with only non-empty/non-zero fields
    const response = {
      id: log.id,
      type: log.type,
      chemicalName: log.chemical.name,
      createdAt: log.createdAt,
    };

    if (log.location) {
      response.location = log.location;
    }
    if (log.setQty != null && log.setQty > 0) {
      response.setQty = log.setQty;
    }
    if (log.addQty != null && log.addQty > 0) {
      response.addQty = log.addQty;
    }
    if (log.requestQty != null && log.requestQty > 0) {
      response.requestQty = log.requestQty;
    }
    if (log.note) {
      response.note = log.note;
    }
    if (log.createdBy) {
      response.createdBy = log.createdBy;
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

