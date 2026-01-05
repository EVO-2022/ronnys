const prisma = require('./prisma');

/**
 * Format a Date object in CST timezone for display
 */
function formatCST(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Get current UTC time (all database operations use UTC)
 */
function getCurrentTime() {
  return new Date();
}

/**
 * Get UTC time from 12 hours ago
 */
function get12HoursAgo() {
  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));
  return twelveHoursAgo;
}

/**
 * Clean up activity log entries older than 12 hours
 * Note: Database uses UTC, but we display times in CST
 * Returns the number of deleted entries
 */
async function cleanupOldActivityLogs() {
  try {
    const cutoffTime = get12HoursAgo();
    const cutoffTimeCST = formatCST(cutoffTime);

    console.log(`[Cleanup] Deleting activity logs older than ${cutoffTimeCST} CST`);

    const result = await prisma.activityLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffTime,
        },
      },
    });

    console.log(`[Cleanup] Deleted ${result.count} activity log entries`);
    return result.count;
  } catch (error) {
    console.error('[Cleanup] Error cleaning up activity logs:', error.message);
    throw error;
  }
}

module.exports = {
  getCurrentTime,
  get12HoursAgo,
  cleanupOldActivityLogs,
  formatCST,
};
