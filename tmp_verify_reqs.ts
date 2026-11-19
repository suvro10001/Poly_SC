import assert from 'node:assert/strict';

// Mock minimal localStorage before importing modules that touch localStorage
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};

import { billMatchesBranch, filterBillsForUser, partyMatchesBranch } from './src/utils/branchAccess';
import { deduplicateParties } from './src/utils/partyDeduplication';
import { groupItemsByCategoryOrder } from './src/utils/searchHelper';
import { AuthUser, BranchLocation, Item, Party, Salesperson, StoredBill } from './src/types';

// Branches & Salespersons fixtures
const branches: BranchLocation[] = [
  { id: 'branch-1', name: 'Madhupur', code: 'MP', address: '', phone: '', isMainBranch: true } as any,
  { id: 'branch-2', name: 'Gazipur', code: 'GP', address: '', phone: '' } as any,
  { id: 'branch-3', name: 'Tangail', code: 'TG', address: '', phone: '' } as any
];

const salespersons: Salesperson[] = [
  { id: 'sp-1', name: 'Rahim', code: 'S-01', branchId: 'branch-2', branchName: 'Gazipur', phone: '' } as any,
  { id: 'sp-2', name: 'Karim', code: 'S-02', branchId: 'branch-3', branchName: 'Tangail', phone: '' } as any
];

const parties: Party[] = [
  { id: 'p-gp', name: 'Bismillah Electric', address: 'Gazipur Bazar', phone: '01711111111', branchId: 'branch-2', branchName: 'Gazipur', salesmanCode: 'S-01', salespersonName: 'Rahim' } as any,
  { id: 'p-tg', name: 'Bismillah Electric', address: 'Tangail Stand', phone: '01722222222', branchId: 'branch-3', branchName: 'Tangail', salesmanCode: 'S-02', salespersonName: 'Karim' } as any,
  { id: 'p-same-sc-diff-mkt-1', name: 'Maa Hardware', address: 'Station Rd', phone: '01733333333', branchId: 'branch-2', branchName: 'Gazipur', salesmanCode: 'S-01', salespersonName: 'Rahim' } as any,
  { id: 'p-same-sc-diff-mkt-2', name: 'Maa Hardware', address: 'Station Rd', phone: '01744444444', branchId: 'branch-2', branchName: 'Gazipur', salesmanCode: 'S-02', salespersonName: 'Karim' } as any
];

// --- REQ 1: Sales Center Wise Stored Bills Visibility (non-Madhupur centers with generic/center bill prefixes) ---
const billGazipurGenericPrefix: StoredBill = {
  id: 'b-gp-1',
  billNo: 'INV-01',
  branchId: 'branch-2',
  branchName: 'Gazipur',
  header: { partyId: 'p-gp', partyName: 'Bismillah Electric', billNo: 'INV-01', salesmanCode: 'S-01', salespersonName: 'Rahim', branchId: 'branch-2', branchName: 'Gazipur', date: '18.11.26' },
  lines: [],
  totals: { totalAmount: 1000, netPayable: 1000 }
} as any;

const billGazipurNoHeaderBranchWithPrefix: StoredBill = {
  id: 'b-gp-2',
  billNo: 'GP-105',
  header: { partyName: 'Bismillah Electric', billNo: 'GP-105', salesmanCode: 'S-01', salespersonName: 'Rahim', date: '18.11.26' },
  lines: [],
  totals: { totalAmount: 2000, netPayable: 2000 }
} as any;

assert.equal(billMatchesBranch(billGazipurGenericPrefix, 'branch-2', branches, salespersons, parties), true, 'Req1: Gazipur bill with INV-01 prefix should match Gazipur');
assert.equal(billMatchesBranch(billGazipurNoHeaderBranchWithPrefix, 'branch-2', branches, salespersons, parties), true, 'Req1: Gazipur bill with GP-105 prefix should match Gazipur');

// --- REQ 2: Party Scoped to Sales Center ---
assert.equal(partyMatchesBranch(parties[0], 'branch-2', branches, salespersons), true, 'Req2: Gazipur party matches Gazipur');
assert.equal(partyMatchesBranch(parties[0], 'branch-3', branches, salespersons), false, 'Req2: Gazipur party must NOT match Tangail');

// Even if a bill was accidentally stamped or lacks branchId, party belonging to Tangail must NOT appear in Gazipur!
const billBelongingToTangailParty: StoredBill = {
  id: 'b-tg-1',
  billNo: 'INV-99',
  header: { partyId: 'p-tg', partyName: 'Bismillah Electric', billNo: 'INV-99', salesmanCode: 'S-02', salespersonName: 'Karim', date: '18.11.26' },
  lines: [],
  totals: { totalAmount: 5000, netPayable: 5000 }
} as any;

assert.equal(billMatchesBranch(billBelongingToTangailParty, 'branch-3', branches, salespersons, parties), true, 'Req2: Tangail party bill matches Tangail');
assert.equal(billMatchesBranch(billBelongingToTangailParty, 'branch-2', branches, salespersons, parties), false, 'Req2: Tangail party bill must NOT show in Gazipur');

// Regional admin / Accounts admin scoping via filterBillsForUser
const gazipurAdmin: AuthUser = { id: 'u-gp', username: 'gp_admin', role: 'admin', branchId: 'branch-2', branchName: 'Gazipur' } as any;
const accountsAdmin: AuthUser = { id: 'u-acc', username: 'accounts', role: 'accounts_admin' } as any;

const filteredForGp = filterBillsForUser([billGazipurGenericPrefix, billBelongingToTangailParty], gazipurAdmin, branches, salespersons, parties);
assert.equal(filteredForGp.length, 1, 'Req2: Gazipur admin only sees Gazipur party bills');
assert.equal(filteredForGp[0].id, 'b-gp-1');

const filteredForAcc = filterBillsForUser([billGazipurGenericPrefix, billBelongingToTangailParty], accountsAdmin, branches, salespersons, parties);
assert.equal(filteredForAcc.length, 2, 'Req1: Accounts admin sees all bills when not restricted');

// --- REQ 3: Allow Same Party Name When Marketing Person Differs ---
const dupTestParties: Party[] = [
  parties[2], // Maa Hardware + Rahim (S-01)
  parties[3], // Maa Hardware + Karim (S-02)
  { id: 'p-true-dup', name: 'Maa Hardware', address: 'Station Rd', phone: '01733333333', branchId: 'branch-2', branchName: 'Gazipur', salesmanCode: 'S-01', salespersonName: 'Rahim' } as any
];

const deduped = deduplicateParties(dupTestParties);
assert.equal(deduped.uniqueParties.length, 2, 'Req3: Two parties with same name + different marketing persons MUST BOTH be kept');
assert.equal(deduped.duplicateIdMap['p-true-dup'], 'p-same-sc-diff-mkt-1', 'Req3: Exact same name + same marketing person merges cleanly');
assert.equal(deduped.duplicateIdMap['p-same-sc-diff-mkt-2'], undefined, 'Req3: Party with different marketing person is NOT remapped as duplicate');

// --- REQ 4: Group Item Search Results by Category List Order ---
const customOrder = ['BYM', 'Telephone Cable', 'BYA'];
localStorage.setItem('polycables_ordered_categories', JSON.stringify(customOrder));
localStorage.setItem('polycables_category_numbers', JSON.stringify({ bym: 1, 'telephone cable': 2, bya: 3 }));

const sampleItems: Item[] = [
  { id: 'i1', name: '1.5 RM BYA', category: 'BYA', rate: 100 } as any,
  { id: 'i2', name: '2 Pair Telephone Cable', category: 'Telephone Cable', rate: 200 } as any,
  { id: 'i3', name: '2.5 RM BYM', category: 'BYM', rate: 300 } as any,
  { id: 'i4', name: '4.0 RM BYA', category: 'BYA', rate: 400 } as any
];

const grouped = groupItemsByCategoryOrder(sampleItems, customOrder);
assert.deepEqual(
  grouped.groups.map((g) => g.category),
  ['BYM', 'Telephone Cable', 'BYA'],
  'Req4: Groups must follow user configured category list order'
);
assert.deepEqual(
  grouped.orderedItems.map((i) => i.id),
  ['i3', 'i2', 'i1', 'i4'],
  'Req4: Flattened orderedItems must follow group order'
);
const allFlatIndices = grouped.groups.flatMap((g) => g.items.map((x) => x.flatIndex));
assert.deepEqual(allFlatIndices, [0, 1, 2, 3], 'Req4: flatIndex must be contiguous 0..N-1');

console.log('ALL 4 REQUIREMENT ASSERTIONS PASSED!');
