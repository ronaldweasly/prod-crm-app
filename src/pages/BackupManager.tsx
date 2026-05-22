import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  createBackupSnapshot,
  getAllBackups,
  exportBackupAsJSON,
  exportBackupAsCSV,
  deleteBackup,
  getBackupMetadata,
  BackupSnapshot,
} from '../sheets/backup';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { toast } from 'sonner';
import { Trash2, Download, RotateCcw, Save } from 'lucide-react';

export default function BackupManager() {
  const { user } = useAuth();
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const [r2Backups, setR2Backups] = useState<{ key: string; lastModified: string; size: number; label: string }[]>([]);
  const [loadingR2, setLoadingR2] = useState(false);
  const [restoringR2Key, setRestoringR2Key] = useState<string | null>(null);
  const [creatingR2Backup, setCreatingR2Backup] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const [restoringLocalId, setRestoringLocalId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBackups();
    fetchR2Backups();
  }, []);

  const loadBackups = () => {
    setBackups(getAllBackups());
  };

  const fetchR2Backups = async () => {
    setLoadingR2(true);
    try {
      const res = await fetch('/api/backup/r2/list', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setR2Backups(data);
      } else {
        toast.error('Failed to load Cloudflare R2 backups');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load Cloudflare R2 backups');
    } finally {
      setLoadingR2(false);
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    try {
      const backup = await createBackupSnapshot(user?.email || 'Manual');
      setBackups([backup, ...backups]);
      toast.success('Backup created successfully');
    } catch (error) {
      toast.error('Failed to create backup');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBackup = (id: string) => {
    if (window.confirm('Are you sure you want to delete this backup?')) {
      deleteBackup(id);
      setBackups(backups.filter(b => b.id !== id));
      toast.success('Backup deleted');
    }
  };

  const handleExportJSON = (backup: BackupSnapshot) => {
    exportBackupAsJSON(backup);
    toast.success('Backup exported as JSON');
  };

  const handleExportCSV = (backup: BackupSnapshot) => {
    exportBackupAsCSV(backup);
    toast.success('Backup exported as CSV');
  };

  const handleRestoreR2 = async (key: string) => {
    if (user?.role !== 'Admin') {
      toast.error('Only Admins can restore backups');
      return;
    }
    if (!window.confirm('WARNING: Restoring will overwrite the current database. Are you sure you want to proceed?')) {
      return;
    }
    setRestoringR2Key(key);
    try {
      const res = await fetch('/api/backup/r2/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'Database successfully restored!');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to restore backup from R2');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to restore backup from R2');
    } finally {
      setRestoringR2Key(null);
    }
  };

  const handleRestoreLocal = async (backup: BackupSnapshot) => {
    if (user?.role !== 'Admin') {
      toast.error('Only Admins can restore backups');
      return;
    }
    if (!window.confirm('WARNING: Restoring will overwrite the current database. Are you sure you want to proceed?')) {
      return;
    }
    setRestoringLocalId(backup.id);
    try {
      const res = await fetch('/api/backup/restore-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotData: backup.sheets || backup,
          label: `Local Browser Backup (${new Date(backup.timestamp).toLocaleDateString()})`
        }),
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Database successfully restored from local backup!');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to restore local backup');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to restore local backup');
    } finally {
      setRestoringLocalId(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (user?.role !== 'Admin') {
      toast.error('Only Admins can restore backups');
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm(`Are you sure you want to restore the database from "${file.name}"? This will overwrite your active database.`)) {
      event.target.value = '';
      return;
    }

    setUploadingFile(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileContent = e.target?.result;
        if (typeof fileContent !== 'string') {
          throw new Error('Could not read backup file');
        }
        const parsed = JSON.parse(fileContent);

        const res = await fetch('/api/backup/restore-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snapshotData: parsed,
            label: `Uploaded File Backup (${file.name})`
          }),
          credentials: 'include',
        });

        if (res.ok) {
          toast.success('Database successfully restored from uploaded backup file!');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to restore database from file');
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || 'Invalid backup file format');
      } finally {
        setUploadingFile(false);
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleCreateR2Backup = async () => {
    if (user?.role !== 'Admin') {
      toast.error('Only Admins can trigger cloud backups');
      return;
    }
    setCreatingR2Backup(true);
    try {
      const res = await fetch('/api/backup/r2', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Cloud backup uploaded to R2 successfully!');
        fetchR2Backups();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to upload cloud backup');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload cloud backup');
    } finally {
      setCreatingR2Backup(false);
    }
  };

  const handleDownloadR2 = async (key: string) => {
    try {
      const res = await fetch(`/api/backup/r2/download?key=${encodeURIComponent(key)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to download backup');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = key.replace(/\//g, '-').replace('.gz', '');
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Cloud backup downloaded successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to download cloud backup');
    }
  };

  // Date filtering logic
  const filteredLocalBackups = backups.filter(b => {
    if (!selectedDate) return true;
    const backupDate = new Date(b.timestamp).toISOString().split('T')[0];
    return backupDate === selectedDate;
  });
  const displayedLocalBackups = selectedDate ? filteredLocalBackups : filteredLocalBackups.slice(0, 3);

  const filteredR2Backups = r2Backups.filter(b => {
    if (!selectedDate) return true;
    const backupDate = new Date(b.lastModified).toISOString().split('T')[0];
    return backupDate === selectedDate;
  });
  const displayedR2Backups = selectedDate ? filteredR2Backups : filteredR2Backups.slice(0, 3);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Backup Management</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Filter by Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
            {selectedDate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate('')}
                className="text-xs"
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <Button
                onClick={handleCreateBackup}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Creating...' : 'Create Backup Now'}
              </Button>

              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                onChange={handleFileUpload}
                disabled={uploadingFile || user?.role !== 'Admin'}
                className="hidden"
              />
              {user?.role === 'Admin' ? (
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  variant="outline"
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {uploadingFile ? 'Restoring...' : 'Restore from JSON File'}
                </Button>
              ) : (
                <span className="text-xs text-gray-400 font-medium bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1">Restore from File (Admin Only)</span>
              )}
            </div>
            <p className="text-sm text-gray-600">
              Auto-backups run hourly. {selectedDate ? `Showing backups for ${selectedDate}.` : 'Showing the 3 most recent backups.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cloud Backups (Cloudflare R2)</CardTitle>
          {user?.role === 'Admin' && (
            <Button
              onClick={handleCreateR2Backup}
              disabled={creatingR2Backup}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {creatingR2Backup ? 'Backing up...' : 'Create Cloud Backup (R2)'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loadingR2 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Loading cloud backups...</p>
          ) : displayedR2Backups.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {r2Backups.length === 0 ? 'No backups found in Cloudflare R2.' : `No cloud backups found for ${selectedDate}.`}
            </p>
          ) : (
            <div className="space-y-3">
              {displayedR2Backups.map((backup) => {
                const date = new Date(backup.lastModified);
                return (
                  <div
                    key={backup.key}
                    className="flex items-center justify-between p-3 border rounded-lg bg-slate-50 hover:bg-slate-100"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm text-slate-700">
                        {backup.label}
                      </p>
                      <p className="text-xs text-slate-500">
                        Key: {backup.key} • Size: {(backup.size / (1024 * 1024)).toFixed(3)} MB
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadR2(backup.key)}
                        title="Download backup"
                      >
                        <Download className="w-4 h-4" />
                      </Button>

                      {user?.role === 'Admin' ? (
                        <Button
                          size="sm"
                          onClick={() => handleRestoreR2(backup.key)}
                          disabled={restoringR2Key !== null}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          {restoringR2Key === backup.key ? 'Restoring...' : 'Restore'}
                        </Button>
                      ) : (
                        <Badge variant="default" className="text-gray-400">
                          Admin Only
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {backups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No backups yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Local Backup History</CardTitle>
          </CardHeader>
          <CardContent>
            {displayedLocalBackups.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                No local backups found for {selectedDate}.
              </p>
            ) : (
              <div className="space-y-3">
                {displayedLocalBackups.map((backup) => {
                  const meta = getBackupMetadata(backup);
                  const date = new Date(backup.timestamp);
                  return (
                    <div
                      key={backup.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 hover:bg-gray-100"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {date.toLocaleDateString()} {date.toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-gray-600">
                          By: {meta.createdBy} • {Object.keys(meta.sheetCounts).length} sheets • ~{(meta.sizeEstimate / 1024).toFixed(1)}KB
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {user?.role === 'Admin' ? (
                          <Button
                            size="sm"
                            onClick={() => handleRestoreLocal(backup)}
                            disabled={restoringLocalId !== null}
                            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            {restoringLocalId === backup.id ? 'Restoring...' : 'Restore'}
                          </Button>
                        ) : (
                          <Badge variant="default" className="text-gray-400">
                            Admin Only
                          </Badge>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExportJSON(backup)}
                          title="Export as JSON"
                        >
                          <Download className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExportCSV(backup)}
                          title="Export as CSV"
                        >
                          <Download className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteBackup(backup.id)}
                          className="text-red-600 hover:text-red-700"
                          title="Delete backup"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              <strong>Note:</strong> Local backups are stored in your browser's local storage. Export to JSON for external storage.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
