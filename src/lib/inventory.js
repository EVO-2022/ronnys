/**
 * Convert units (box/bucket/barrel) to gallons for storage
 * Returns the gallon value, or the original value if no conversion (Clean Kit)
 */
function convertUnitsToGallons(chemical, units) {
  if (chemical.gallonsPerUnit) {
    return units * chemical.gallonsPerUnit;
  }
  // No conversion for Clean Kit (no gallonsPerUnit)
  return units;
}

/**
 * Convert gallons back to original units for display
 * Returns the unit count, or the original value if no conversion (Clean Kit)
 */
function convertGallonsToUnits(chemical, gallons) {
  if (chemical.gallonsPerUnit) {
    return gallons / chemical.gallonsPerUnit;
  }
  // No conversion for Clean Kit (stored as boxes)
  return gallons;
}

/**
 * Get the allowed increment for gallon-based inventory
 * Most items use 0.1 gallon increments, box items use their increment
 */
function getGallonIncrement(chemical) {
  if (chemical.gallonsPerUnit) {
    return 0.1; // 0.1 gallon precision
  }
  // For items without gallon conversion (boxes), use their increment
  // Clean Kit: 1.0, Bottles/Triggers/Air Fresheners: 0.25
  return chemical.increment;
}

/**
 * Get the allowed increment for a chemical at a specific location (DEPRECATED - keeping for compatibility)
 * Special case: BUCKET chemicals use 1.0 for shelf and 0.25 for line
 */
function getIncrementForLocation(chemical, location) {
  if (chemical.unit === 'BUCKET' && location === 'LINE') {
    return 0.25;
  }
  return chemical.increment;
}

/**
 * Get allowed locations for a chemical
 */
function getAllowedLocations(chemical) {
  const locations = [];
  if (chemical.trackOnShelf) {
    locations.push('SHELF');
  }
  if (chemical.trackOnLine) {
    locations.push('LINE');
  }
  return locations;
}

/**
 * Check if a gallon quantity is valid for a chemical at a location
 * Inventory is now stored in gallons (except Clean Kit in boxes)
 */
function isValidQuantity(chemical, location, quantity) {
  if (quantity < 0) {
    return false;
  }

  const allowedLocations = getAllowedLocations(chemical);
  if (!allowedLocations.includes(location)) {
    return false;
  }

  const increment = getGallonIncrement(chemical);

  // Check if quantity is a multiple of the increment (with small tolerance for floating point)
  const remainder = quantity % increment;
  return Math.abs(remainder) < 0.001 || Math.abs(remainder - increment) < 0.001;
}

/**
 * Validate gallon quantity for inventory updates
 * Returns { valid: boolean, error?: string }
 */
function validateQuantity(chemical, location, quantity) {
  if (quantity < 0) {
    return { valid: false, error: 'Quantity must be greater than or equal to 0' };
  }

  const allowedLocations = getAllowedLocations(chemical);
  if (!allowedLocations.includes(location)) {
    return { valid: false, error: `Location ${location} is not allowed for this chemical` };
  }

  const increment = getGallonIncrement(chemical);
  const remainder = quantity % increment;
  const isValid = Math.abs(remainder) < 0.001 || Math.abs(remainder - increment) < 0.001;

  if (!isValid) {
    const unit = chemical.gallonsPerUnit ? 'gallon' : 'box';
    const plural = increment !== 1 ? 's' : '';
    const unitText = unit + plural;
    return { valid: false, error: `Quantity must be a multiple of ${increment} ${unitText}` };
  }

  return { valid: true };
}

/**
 * Validate quantity for a request (uses 0.25 for BUCKET, otherwise chemical increment)
 * Returns { valid: boolean, error?: string }
 */
function validateRequestQuantity(chemical, quantity) {
  if (quantity < 0) {
    return { valid: false, error: 'Quantity must be greater than or equal to 0' };
  }

  const increment = chemical.unit === 'BUCKET' ? 0.25 : chemical.increment;
  const remainder = quantity % increment;
  const isValid = Math.abs(remainder) < 0.001 || Math.abs(remainder - increment) < 0.001;

  if (!isValid) {
    return { valid: false, error: `Quantity must be a multiple of ${increment}` };
  }

  return { valid: true };
}

/**
 * Validate that quantity is a whole number (for pickup/request operations)
 * Returns { valid: boolean, error?: string }
 */
function validateWholeQuantity(chemical, location, quantity) {
  if (quantity < 0) {
    return { valid: false, error: 'Quantity must be greater than or equal to 0' };
  }

  const allowedLocations = getAllowedLocations(chemical);
  if (!allowedLocations.includes(location)) {
    return { valid: false, error: `Location ${location} is not allowed for this chemical` };
  }

  // Check if quantity is a whole number (integer)
  if (!Number.isInteger(quantity)) {
    return { valid: false, error: 'Quantity must be a whole number' };
  }

  return { valid: true };
}

/**
 * Check if a chemical is low on inventory based on defined thresholds
 * Returns { isLow: boolean, location: string, threshold: number, current: number }
 */
function checkLowInventory(chemical, inventory) {
  const inv = inventory || { shelfQty: 0, lineQty: 0 };

  // Define thresholds based on chemical name and unit
  let threshold = null;
  let checkLocation = 'shelfQty'; // Default to checking shelf
  let thresholdInGallons = null;

  if (chemical.name === 'Clean Kit') {
    // Clean Kit: less than 2 kits on the line (stored as boxes, not gallons)
    threshold = 2;
    checkLocation = 'lineQty';
    thresholdInGallons = threshold; // No conversion needed for Clean Kit
  } else if (chemical.name === 'Tire Shine') {
    // Tire Shine: less than 30 gallons on the shelf
    threshold = 30;
    thresholdInGallons = threshold;
  } else if (chemical.name === 'RLC' || chemical.name === 'Glass Cleaner') {
    // RLC and Glass Cleaner: less than 5 gallons on the shelf
    threshold = 5;
    thresholdInGallons = threshold;
  } else if (chemical.name.startsWith('Air Freshener')) {
    // Air Fresheners: less than 1 box on the shelf
    threshold = 1;
    // Convert to gallons: 1 box * gallonsPerUnit
    thresholdInGallons = chemical.gallonsPerUnit ? threshold * chemical.gallonsPerUnit : threshold;
  } else if (chemical.name === 'Bottles') {
    // Bottles: equal or less than 0.5 box on the shelf
    threshold = 0.5;
    thresholdInGallons = chemical.gallonsPerUnit ? threshold * chemical.gallonsPerUnit : threshold;
  } else if (chemical.name === 'Bottle Triggers') {
    // Bottle Triggers: less than 0.5 box on the shelf
    threshold = 0.5;
    thresholdInGallons = chemical.gallonsPerUnit ? threshold * chemical.gallonsPerUnit : threshold;
  } else if (chemical.unit === 'BOX' && chemical.gallonsPerUnit === 5) {
    // Everything with a 5 gallon box: less than 2 boxes on the shelf
    threshold = 2;
    thresholdInGallons = threshold * chemical.gallonsPerUnit; // 2 boxes * 5 gallons = 10 gallons
  }

  // If no threshold is defined for this chemical, it's not being monitored
  if (threshold === null || thresholdInGallons === null) {
    return { isLow: false };
  }

  const currentQty = inv[checkLocation];

  // For Bottles, we check <= threshold, for others we check < threshold
  const isLow = chemical.name === 'Bottles'
    ? currentQty <= thresholdInGallons
    : currentQty < thresholdInGallons;

  return {
    isLow,
    location: checkLocation === 'shelfQty' ? 'SHELF' : 'LINE',
    threshold,
    thresholdInGallons,
    current: currentQty,
    chemicalName: chemical.name,
  };
}

module.exports = {
  convertUnitsToGallons,
  convertGallonsToUnits,
  getGallonIncrement,
  getIncrementForLocation,
  getAllowedLocations,
  isValidQuantity,
  validateQuantity,
  validateWholeQuantity,
  validateRequestQuantity,
  checkLowInventory,
};

