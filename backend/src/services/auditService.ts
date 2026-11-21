/**
 * The audit log service. Its read and write sides live in services/audit/ (auditQuery.ts and
 * auditWrite.ts) so each stays under the line cap; every caller keeps importing from here.
 */
export { getTotalCount, query } from './audit/auditQuery.ts';
export { actorFields, log } from './audit/auditWrite.ts';
