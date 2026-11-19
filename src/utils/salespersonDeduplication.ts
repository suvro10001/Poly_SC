import { Salesperson } from '../types';

export function deduplicateSalespersons(list: Salesperson[]): Salesperson[] {
  if (!Array.isArray(list)) return [];

  // Read deleted salespersons records to prevent resurrecting deleted staff
  const deletedSpSet = new Set<string>();
  try {
    const savedDeleted = localStorage.getItem('polycables_deleted_salespersons');
    if (savedDeleted) {
      const parsed = JSON.parse(savedDeleted);
      if (Array.isArray(parsed)) {
        parsed.forEach((x: string) => {
          if (x) {
            deletedSpSet.add(String(x).toLowerCase().trim());
          }
        });
      }
    }
    const trashed = localStorage.getItem('polycables_trashed_users');
    if (trashed) {
      const parsed = JSON.parse(trashed);
      if (Array.isArray(parsed)) {
        parsed.forEach((t: any) => {
          if (t?.id) deletedSpSet.add(String(t.id).toLowerCase().trim());
          if (t?.originalId) deletedSpSet.add(String(t.originalId).toLowerCase().trim());
          if (t?.data?.id) deletedSpSet.add(String(t.data.id).toLowerCase().trim());
          if (t?.data?.code) deletedSpSet.add(String(t.data.code).toLowerCase().trim());
        });
      }
    }
  } catch {}

  const isUserDeleted = (s: Salesperson) => {
    if (!s) return true;
    const idKey = s.id ? String(s.id).toLowerCase().trim() : '';
    if (idKey && deletedSpSet.has(idKey)) return true;
    const codeKey = s.code ? String(s.code).toLowerCase().trim() : '';
    if (codeKey && deletedSpSet.has(codeKey)) return true;
    return false;
  };

  const filtered = list.filter((s) => !isUserDeleted(s));

  // Deduplicate by code (when valid), id, and name
  const result: Salesperson[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();

  for (const sp of filtered) {
    if (!sp) continue;
    const idKey = (sp.id || '').trim().toLowerCase();
    const codeKey = (sp.code || '').trim().toLowerCase();
    const nameKey = (sp.name || '').trim().toLowerCase();

    // Check if we already have this salesperson
    const isCodeMatch = Boolean(codeKey && codeKey !== 'ic' && seenCodes.has(codeKey));
    const isIdMatch = Boolean(idKey && seenIds.has(idKey));
    const isNameMatch = Boolean(nameKey && seenNames.has(nameKey));

    if (isCodeMatch || isIdMatch || isNameMatch) {
      // Merge with existing record if it has missing data
      const existingIdx = result.findIndex((existing) => {
        const eId = (existing.id || '').trim().toLowerCase();
        const eCode = (existing.code || '').trim().toLowerCase();
        const eName = (existing.name || '').trim().toLowerCase();
        return (
          (codeKey && codeKey !== 'ic' && eCode === codeKey) ||
          (idKey && eId === idKey) ||
          (nameKey && eName === nameKey)
        );
      });

      if (existingIdx >= 0) {
        const existing = result[existingIdx];
        result[existingIdx] = {
          ...sp,
          ...existing,
          monthlyTargetSales: existing.monthlyTargetSales || sp.monthlyTargetSales,
          monthlyTargetCollection: existing.monthlyTargetCollection || sp.monthlyTargetCollection,
          monthlyTargetCoils: existing.monthlyTargetCoils || sp.monthlyTargetCoils,
          branchId: existing.branchId || sp.branchId,
          branchName: existing.branchName || sp.branchName,
          role: existing.role || sp.role,
          designation: existing.designation || sp.designation
        };
      }
      continue;
    }

    if (idKey) seenIds.add(idKey);
    if (codeKey && codeKey !== 'ic') seenCodes.add(codeKey);
    if (nameKey) seenNames.add(nameKey);
    result.push(sp);
  }

  return result;
}
