import { CollectionMR, BankDeposit, ExpenseEntry } from '../types';
import { parseDateToISO } from './dateUtils';

export function generateMonthEndHoAutoDeposits(
  collections: CollectionMR[],
  userBankDeposits: BankDeposit[],
  deletedAutoDepositIds: string[] = [],
  expenses: ExpenseEntry[] = []
): BankDeposit[] {
  // Exclude legacy per-expense H/O deposits, auto-deposits, and any Head Office (Sales Center Monthly Expenses)
  // entry that was created without an entered party name.
  const nonAutoDeposits = userBankDeposits.filter((d) => {
    if ((d as any).isAutoDeposit) return false;
    if (d.id.startsWith('auto-ho-deposit-')) return false;
    if (d.id.startsWith('auto-ho-expense-')) return false;
    if ((d as any).isExpenseHoDeposit) return false;
    if ((d as any).expenseId) return false;

    const cust = (d.customerName || '').trim();
    const party = (d.partyName || '').trim();
    const acct = (d.accountName || '').trim();
    const isHoMonthlyExpenseLabel =
      cust === 'Head Office (Sales Center Monthly Expenses)' ||
      acct === 'Head Office Expense Settlement';

    if (isHoMonthlyExpenseLabel) {
      const hasEnteredParty =
        Boolean(party) &&
        party !== 'Head Office (Sales Center Monthly Expenses)' &&
        party !== 'Head Office';
      if (!hasEnteredParty) {
        return false;
      }
    }

    return true;
  });

  // Find all YYYY-MM months where expenses explicitly have a fundingPartyName entered
  const monthsSet = new Set<string>();

  expenses.forEach((e) => {
    const enteredParty = (e.fundingPartyName || '').trim();
    // Strict rule: if not entered any party name, NEVER goes to deposit total expense to H/O
    if (
      e.date &&
      enteredParty &&
      enteredParty !== 'Head Office (Sales Center Monthly Expenses)' &&
      enteredParty !== 'Head Office'
    ) {
      const iso = parseDateToISO(e.date);
      if (iso && iso.length >= 7) {
        monthsSet.add(iso.substring(0, 7));
      }
    }
  });

  if (monthsSet.size === 0) return nonAutoDeposits;

  const sortedMonths = Array.from(monthsSet).sort();
  const autoDeposits: BankDeposit[] = [];

  for (const monthStr of sortedMonths) {
    const autoExpenseId = `auto-ho-expense-${monthStr}`;

    // Skip if already explicitly adjusted via Monthly Expense Party Adjustment (dep-adj-*)
    const alreadyAdjustedInDeposits = nonAutoDeposits.some(
      (d) => d.id.startsWith('dep-adj-') && (d.remarks || '').includes(`(${monthStr})`)
    );
    if (alreadyAdjustedInDeposits) {
      continue;
    }

    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthNumStr, 10);

    // Only past ended months generate month-end auto H/O deposit
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (monthStr >= currentMonthStr) {
      continue;
    }

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDayDateStr = `${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`;

    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const nextMonth01Str = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Strictly include ONLY expenses where a valid party name was entered
    if (!deletedAutoDepositIds.includes(autoExpenseId)) {
      const monthExpenses = expenses.filter((e) => {
        const iso = parseDateToISO(e.date) || e.date;
        const matchesMonth = iso && iso.startsWith(monthStr) && iso <= lastDayDateStr;
        const enteredParty = (e.fundingPartyName || '').trim();
        const hasParty =
          Boolean(enteredParty) &&
          enteredParty !== 'Head Office (Sales Center Monthly Expenses)' &&
          enteredParty !== 'Head Office';
        return matchesMonth && hasParty;
      });

      const totalMonthExpenseAmount = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      if (totalMonthExpenseAmount > 0 && monthExpenses.length > 0) {
        const entityName = monthExpenses[0]?.entityName || 'Madhupur Sales Center';
        const partyNames = Array.from(
          new Set(monthExpenses.map((e) => (e.fundingPartyName || '').trim()).filter(Boolean))
        ).join(', ');

        if (partyNames) {
          autoDeposits.push({
            id: autoExpenseId,
            date: nextMonth01Str,
            entityName,
            customerName: partyNames,
            partyName: partyNames,
            customerAddress: 'Head Office Expense Settlement',
            marketingPerson: entityName,
            bankName: 'H/O',
            accountName: 'Head Office',
            bankShortCode: 'H/O',
            accountShortCode: 'H/O',
            displayTag: 'H/O',
            depositDate: nextMonth01Str,
            amount: totalMonthExpenseAmount,
            remarks: `Auto-deposit to Head Office on 1st of month for ${monthStr} Sales Center expenses (${partyNames})`,
            emailSent: true,
            isAutoDeposit: true
          });
        }
      }
    }
  }

  return [...autoDeposits, ...nonAutoDeposits];
}
