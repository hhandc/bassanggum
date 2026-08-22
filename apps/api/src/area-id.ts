import { createHash } from 'node:crypto';

/** Short stable identifier suitable for the public /areas/:areaId route. */
export function publicAreaId(actionZoneId: string): string {
  return `area-${createHash('sha256').update(actionZoneId).digest('hex').slice(0, 24)}`;
}
