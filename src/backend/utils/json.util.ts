// MariaDB's JSON type is a LONGTEXT alias, so mysql2 returns it as a raw string
// instead of auto-parsing it the way it does for MySQL's native JSON type.
export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
