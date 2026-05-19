/**
 * Activity Logging System
 * Tracks all data modifications for audit trail
 */

export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'EXPORT' | 'DOWNLOAD' | 'FAILURE';

export interface ActivityLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: ActivityAction;
  sheet: string;
  recordId: string;
  recordName?: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  details?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
}

const ACTIVITY_LOG_STORAGE = 'solar_crm_activity_logs';
const MAX_LOG_ENTRIES = 5000;

/**
 * Log an activity
 */
export function logActivity(activity: Omit<ActivityLog, 'id' | 'timestamp'>): ActivityLog {
  const log: ActivityLog = {
    ...activity,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  // Add browser info
  if (!activity.userAgent) {
    log.userAgent = navigator.userAgent;
  }

  // Persist to central backend audit trail
  fetch('/api/activity-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activity),
    credentials: 'include',
  }).catch((err) => {
    console.error('Failed to save activity log to backend, saving locally:', err);
    saveActivityLog(log);
  });

  return log;
}

/**
 * Log a data modification
 */
export function logDataModification(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  sheet: string,
  recordId: string,
  userId: string,
  userEmail: string,
  changes?: { field: string; oldValue: any; newValue: any }[],
  recordName?: string
) {
  return logActivity({
    userId,
    userEmail,
    action,
    sheet,
    recordId,
    recordName,
    changes,
    status: 'success',
  });
}

/**
 * Log an error/failure
 */
export function logActivityFailure(
  action: ActivityAction,
  sheet: string,
  recordId: string,
  userId: string,
  userEmail: string,
  errorMessage: string
) {
  return logActivity({
    userId,
    userEmail,
    action,
    sheet,
    recordId,
    status: 'failed',
    errorMessage,
  });
}

/**
 * Save activity log to storage (fallback only)
 */
function saveActivityLog(activity: ActivityLog) {
  try {
    const logs = getAllActivityLogs();
    logs.push(activity);

    // Trim to keep max entries
    const trimmed = logs.slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(ACTIVITY_LOG_STORAGE, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save activity log:', error);
  }
}

/**
 * Get all activity logs
 */
export function getAllActivityLogs(): ActivityLog[] {
  try {
    const logs = localStorage.getItem(ACTIVITY_LOG_STORAGE);
    return logs ? JSON.parse(logs) : [];
  } catch (error) {
    console.error('Failed to retrieve activity logs:', error);
    return [];
  }
}

/**
 * Get activity logs for a specific user
 */
export function getUserActivityLogs(userEmail: string): ActivityLog[] {
  const logs = getAllActivityLogs();
  return logs.filter(log => log.userEmail.toLowerCase() === userEmail.toLowerCase());
}

/**
 * Get activity logs for a specific record
 */
export function getRecordActivityLogs(sheet: string, recordId: string): ActivityLog[] {
  const logs = getAllActivityLogs();
  return logs.filter(log => log.sheet === sheet && log.recordId === recordId).reverse();
}

/**
 * Get activity logs for a specific sheet
 */
export function getSheetActivityLogs(sheet: string): ActivityLog[] {
  const logs = getAllActivityLogs();
  return logs.filter(log => log.sheet === sheet).reverse();
}

/**
 * Filter activity logs
 */
export function filterActivityLogs(
  filters: {
    userId?: string;
    sheet?: string;
    action?: ActivityAction;
    status?: 'success' | 'failed';
    startDate?: Date;
    endDate?: Date;
  }
): ActivityLog[] {
  let logs = getAllActivityLogs();

  if (filters.userId) {
    logs = logs.filter(log => log.userEmail.toLowerCase() === filters.userId!.toLowerCase());
  }

  if (filters.sheet) {
    logs = logs.filter(log => log.sheet === filters.sheet);
  }

  if (filters.action) {
    logs = logs.filter(log => log.action === filters.action);
  }

  if (filters.status) {
    logs = logs.filter(log => log.status === filters.status);
  }

  if (filters.startDate) {
    const startTime = filters.startDate.getTime();
    logs = logs.filter(log => new Date(log.timestamp).getTime() >= startTime);
  }

  if (filters.endDate) {
    const endTime = filters.endDate.getTime();
    logs = logs.filter(log => new Date(log.timestamp).getTime() <= endTime);
  }

  return logs.reverse();
}

/**
 * Get activity stats
 */
export function getActivityStats(days: number = 7) {
  const logs = getAllActivityLogs();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentLogs = logs.filter(log => new Date(log.timestamp) >= cutoffDate);

  const stats = {
    total: recentLogs.length,
    byAction: {} as Record<ActivityAction, number>,
    bySheet: {} as Record<string, number>,
    byUser: {} as Record<string, number>,
    successful: 0,
    failed: 0,
  };

  for (const log of recentLogs) {
    stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
    stats.bySheet[log.sheet] = (stats.bySheet[log.sheet] || 0) + 1;
    stats.byUser[log.userEmail] = (stats.byUser[log.userEmail] || 0) + 1;

    if (log.status === 'success') {
      stats.successful++;
    } else {
      stats.failed++;
    }
  }

  return stats;
}

/**
 * Export activity logs as CSV
 */
export function exportActivityLogsAsCSV(logs?: ActivityLog[]) {
  const logsToExport = logs || getAllActivityLogs();

  let csv = 'Timestamp,User,Email,Action,Sheet,Record ID,Record Name,Status,Error,Changes\n';

  for (const log of logsToExport) {
    const changes = log.changes
      ? log.changes.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`).join('; ')
      : '';

    csv += [
      log.timestamp,
      escapeCSVField(log.userEmail.split('@')[0] || 'Unknown'),
      escapeCSVField(log.userEmail),
      log.action,
      log.sheet,
      log.recordId,
      escapeCSVField(log.recordName || ''),
      log.status,
      escapeCSVField(log.errorMessage || ''),
      escapeCSVField(changes),
    ]
      .map(field => (typeof field === 'string' ? escapeCSVField(field) : field))
      .join(',') + '\n';
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export activity logs as JSON
 */
export function exportActivityLogsAsJSON(logs?: ActivityLog[]) {
  const logsToExport = logs || getAllActivityLogs();
  const json = JSON.stringify(logsToExport, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity_logs_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Clear old activity logs (keep only recent)
 */
export function cleanupOldActivityLogs(keepDays: number = 90) {
  const logs = getAllActivityLogs();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const kept = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
  localStorage.setItem(ACTIVITY_LOG_STORAGE, JSON.stringify(kept));

  return logs.length - kept.length;
}

/**
 * Helper to escape CSV fields
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Get human-readable action description
 */
export function getActionDescription(action: ActivityAction): string {
  const descriptions: Record<ActivityAction, string> = {
    CREATE: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
    VIEW: 'Viewed',
    EXPORT: 'Exported',
    DOWNLOAD: 'Downloaded',
    FAILURE: 'Failed operation',
  };
  return descriptions[action] || action;
}

/**
 * Get display color for action
 */
export function getActionColor(action: ActivityAction): string {
  const colors: Record<ActivityAction, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    VIEW: 'bg-gray-100 text-gray-800',
    EXPORT: 'bg-purple-100 text-purple-800',
    DOWNLOAD: 'bg-indigo-100 text-indigo-800',
    FAILURE: 'bg-red-100 text-red-800',
  };
  return colors[action] || 'bg-gray-100 text-gray-800';
}
