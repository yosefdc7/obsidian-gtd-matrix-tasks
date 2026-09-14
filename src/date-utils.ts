export function isDateTitledNote(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const fileName = filePath.split('/').pop() || '';
  const baseName = fileName.replace(/\.md$/i, '').trim();

  // 1. MMM DD YYYY: e.g. Sep 14 2026, Apr 10 2024
  if (/^[A-Za-z]{3}\s+\d{1,2}\s+\d{4}$/.test(baseName)) return true;
  // 2. MMMM DD, YYYY or MMMM DD YYYY: e.g. September 14, 2026
  if (/^[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*|\s+)\d{4}$/.test(baseName)) return true;
  // 3. ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(baseName)) return true;
  // 4. Day-only inside daily folders (legacy DD): e.g. 14, 01
  if (/^\d{1,2}$/.test(baseName) && filePath.includes('/')) return true;
  // 5. DD MMM YYYY: e.g. 14 Sep 2026
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(baseName)) return true;

  return false;
}
