/**
 * Backup Service — Facade.
 *
 * Re-exports public API from the backup/ subdirectory.
 * No business logic belongs in this file.
 */
export { createBackup, getBackupStatus, restoreFromBackup } from './backup/backupCore.ts';
export { reEncryptAllBackups } from './backup/backupEncryptionService.ts';
export { verifyDatabaseIntegrity } from './backup/backupIntegrityService.ts';
export { getBackupDirectory } from './backup/backupLifecycleService.ts';
