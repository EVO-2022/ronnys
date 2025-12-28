/**
 * Get the allowed increment for a chemical at a specific location
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
 * Check if a quantity is valid for a chemical at a location
 */
function isValidQuantity(chemical, location, quantity) {
  if (quantity < 0) {
    return false;
  }

  const allowedLocations = getAllowedLocations(chemical);
  if (!allowedLocations.includes(location)) {
    return false;
  }

  const increment = getIncrementForLocation(chemical, location);
  
  // Check if quantity is a multiple of the increment (with small tolerance for floating point)
  const remainder = quantity % increment;
  return Math.abs(remainder) < 0.001 || Math.abs(remainder - increment) < 0.001;
}

/**
 * Validate quantity for a chemical at a location
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

  const increment = getIncrementForLocation(chemical, location);
  const remainder = quantity % increment;
  const isValid = Math.abs(remainder) < 0.001 || Math.abs(remainder - increment) < 0.001;

  if (!isValid) {
    return { valid: false, error: `Quantity must be a multiple of ${increment}` };
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

module.exports = {
  getIncrementForLocation,
  getAllowedLocations,
  isValidQuantity,
  validateQuantity,
  validateWholeQuantity,
  validateRequestQuantity,
};

