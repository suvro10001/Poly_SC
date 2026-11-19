with open('src/components/ExpenseManager.tsx', 'r') as f:
    content = f.read()

# 1. keywords in handleImportCollectionsXlsx
t1 = '''        // Exact date and amount keywords to prevent collisions
        const dateKeywords = [
          'collectiondate', 'mrdate', 'txdate', 'voucherdate', 'entrydate', 'passdate', 'date', 'dt', 'তারিখ', 'দিন'
        ];'''

r1 = '''        // Exact date and amount keywords to prevent collisions
        const dateKeywords = [
          'collectiondate', 'colldate', 'mrdate', 'txdate', 'voucherdate', 'entrydate', 'passdate', 'date', 'dt', 'তারিখ', 'দিন'
        ];
        const depositDateKeywords = [
          'depositdate', 'depdate', 'depositedate', 'bankdate', 'জমারতারিখ', 'ব্যাংকজমা'
        ];'''

assert t1 in content, 't1 not found'
content = content.replace(t1, r1, 1)

# 2. findVal and parsedDate
t2 = '''          const rawDate = findVal(dateKeywords);
          const rawMrNo = findVal(mrNoKeywords, ['date', 'amount', 'party']);'''

r2 = '''          const rawDate = findVal(dateKeywords);
          const rawDepositDate = findVal(depositDateKeywords);
          const rawMrNo = findVal(mrNoKeywords, ['date', 'amount', 'party']);'''

assert t2 in content, 't2 not found'
content = content.replace(t2, r2, 1)

t3 = '''          const parsedDate = parseExcelDateToISO(rawDate);'''
r3 = '''          const parsedCollectionDate = parseExcelDateToISO(rawDate);
          const parsedDepositDate = parseExcelDateToISO(rawDepositDate) || parsedCollectionDate;
          const parsedDate = parsedCollectionDate;'''

assert t3 in content, 't3 not found'
content = content.replace(t3, r3, 1)

# 3. newDep in handleImportCollectionsXlsx
t4 = '''            const newDep: BankDeposit = {
              id: newDepId,
              depositDate: parsedDate,
              entityName: targetCenterName,'''

r4 = '''            const newDep: BankDeposit = {
              id: newDepId,
              date: parsedCollectionDate || parsedDate,
              depositDate: parsedDepositDate || parsedDate,
              entityName: targetCenterName,'''

assert t4 in content, 't4 not found'
content = content.replace(t4, r4, 1)

# 4. newRecords depositDate
t5 = '''            depositDate: isBankDepositAuto ? parsedDate : undefined,'''
r5 = '''            depositDate: isBankDepositAuto ? (parsedDepositDate || parsedDate) : undefined,'''

assert t5 in content, 't5 not found'
content = content.replace(t5, r5, 1)

# 5. Table rows displaying date in Deposit History (both occurrences)
t6 = '''<td className="py-1.5 px-2.5 font-mono font-medium text-slate-600 whitespace-nowrap">{formatDateDDMMYY(dep.date)}</td>'''
r6 = '''<td className="py-1.5 px-2.5 font-mono font-medium text-slate-600 whitespace-nowrap">{formatDateDDMMYY(dep.date || (dep as any).collectionDate || dep.depositDate)}</td>'''

assert t6 in content, 't6 not found'
content = content.replace(t6, r6) # Replace both occurrences

# 6. sortedBankDeposits sorting
t7 = '''      } else if (depositSortCol === 'date') {
        const aIso = parseDateToISO(a.date) || '';
        const bIso = parseDateToISO(b.date) || '';
        cmp = aIso.localeCompare(bIso);
      } else if (depositSortCol === 'depositeDate') {
        const aIso = parseDateToISO(a.depositDate || a.date) || '';
        const bIso = parseDateToISO(b.depositDate || b.date) || '';
        cmp = aIso.localeCompare(bIso);'''

r7 = '''      } else if (depositSortCol === 'date') {
        const aIso = parseDateToISO(a.date || a.depositDate) || '';
        const bIso = parseDateToISO(b.date || b.depositDate) || '';
        cmp = aIso.localeCompare(bIso);
      } else if (depositSortCol === 'depositeDate') {
        const aIso = parseDateToISO(a.depositDate || a.date) || '';
        const bIso = parseDateToISO(b.depositDate || b.date) || '';
        cmp = aIso.localeCompare(bIso);'''

assert t7 in content, 't7 not found'
content = content.replace(t7, r7, 1)

# 7. handleSelectPeriodPreset 'all'
t8 = '''    } else if (p === 'all') {
      setStartDate('01.01.2026');
      setEndDate(formatDateDDMMYY(new Date()));
    }'''

r8 = '''    } else if (p === 'all') {
      setStartDate('');
      setEndDate('');
    }'''

assert t8 in content, 't8 not found'
content = content.replace(t8, r8, 1)

# 8. filteredExpenses date filtering
t9 = '''      let matchesDate = true;
      if (startDate && endDate) {
        const expIso = parseDateToISO(e.date);
        const startIso = parseDateToISO(startDate);
        const endIso = parseDateToISO(endDate);
        if (expIso && startIso && endIso) {
          matchesDate = expIso >= startIso && expIso <= endIso;
        }
      }'''

r9 = '''      let matchesDate = true;
      const startIso = parseDateToISO(startDate);
      const endIso = parseDateToISO(endDate);
      const expIso = parseDateToISO(e.date) || parseDateToISO(e.monthRange?.split(/\\s*(?:to|-)\\s*/i)[0]) || parseDateToISO(e.createdAt);
      if (startIso && expIso && expIso < startIso) matchesDate = false;
      if (endIso && expIso && expIso > endIso) matchesDate = false;
      if ((startIso || endIso) && !expIso) matchesDate = false;
      if (!matchesDate) return false;'''

assert t9 in content, 't9 not found'
content = content.replace(t9, r9, 1)

# 9. entityExpenses date filtering
t10 = '''  const entityExpenses = expenses.filter((e) => {
    const eIso = parseDateToISO(e.date);
    if (startIso && endIso && eIso) {
      if (eIso < startIso || eIso > endIso) return false;
    }'''

r10 = '''  const entityExpenses = expenses.filter((e) => {
    const eIso = parseDateToISO(e.date) || parseDateToISO(e.monthRange?.split(/\\s*(?:to|-)\\s*/i)[0]) || parseDateToISO(e.createdAt);
    if (startIso && eIso && eIso < startIso) return false;
    if (endIso && eIso && eIso > endIso) return false;
    if ((startIso || endIso) && !eIso) return false;'''

assert t10 in content, 't10 not found'
content = content.replace(t10, r10, 1)

# 10. entityCollections date filtering
t11 = '''  const entityCollections = collections.filter((c) => {
    const cIso = parseDateToISO(c.date);
    if (startIso && endIso && cIso) {
      if (cIso < startIso || cIso > endIso) return false;
    }'''

r11 = '''  const entityCollections = collections.filter((c) => {
    const cIso = parseDateToISO(c.date || c.depositDate);
    if (startIso && cIso && cIso < startIso) return false;
    if (endIso && cIso && cIso > endIso) return false;
    if ((startIso || endIso) && !cIso) return false;'''

assert t11 in content, 't11 not found'
content = content.replace(t11, r11, 1)

# 11. entityBankDeposits date filtering
t12 = '''  const entityBankDeposits = bankDeposits.filter((d) => {
    const dIso = parseDateToISO(d.date);
    if (startIso && endIso && dIso) {
      if (dIso < startIso || dIso > endIso) return false;
    }'''

r12 = '''  const entityBankDeposits = bankDeposits.filter((d) => {
    const dIso = parseDateToISO(d.date || d.depositDate);
    if (startIso && dIso && dIso < startIso) return false;
    if (endIso && dIso && dIso > endIso) return false;
    if ((startIso || endIso) && !dIso) return false;'''

assert t12 in content, 't12 not found'
content = content.replace(t12, r12, 1)

# 12. totalNetSaleSum date filtering
t13 = '''  const totalNetSaleSum = storedBills.reduce((acc, bill) => {
    const bDateStr = bill.header?.date || bill.savedAt || '';
    const bIso = parseDateToISO(bDateStr);
    if (startIso && endIso && bIso) {
      if (bIso < startIso || bIso > endIso) return acc;
    }'''

r13 = '''  const totalNetSaleSum = storedBills.reduce((acc, bill) => {
    const bDateStr = bill.header?.date || bill.savedAt || '';
    const bIso = parseDateToISO(bDateStr);
    if (startIso && bIso && bIso < startIso) return acc;
    if (endIso && bIso && bIso > endIso) return acc;
    if ((startIso || endIso) && !bIso) return acc;'''

assert t13 in content, 't13 not found'
content = content.replace(t13, r13, 1)

# 13. renderExpenseReportSheet depositMap BankDeposits
t14 = '''    // 1. All Bank Deposits
    entityBankDeposits.forEach((d) => {
      const bTag = (d.bankName === 'H/O' || d.displayTag === 'H/O')
        ? 'H/O'
        : getBankAndAccountShortTag(d.bankName, (d as any).accountName, d.displayTag) || d.displayTag || d.bankName || 'PBL(PE)';
      const isoDate = parseDateToISO(d.date) || d.date || '';
      const key = `${isoDate}___${bTag.trim()}`;
      const existing = depositMap.get(key);
      if (existing) {
        existing.amount += (Number(d.amount) || 0);
      } else {
        depositMap.set(key, {
          date: formatDateDDMMYY(d.date),
          rawDate: isoDate,
          bankName: bTag.trim(),
          amount: Number(d.amount) || 0
        });
      }'''

r14 = '''    // 1. All Bank Deposits
    entityBankDeposits.forEach((d) => {
      const bTag = (d.bankName === 'H/O' || d.displayTag === 'H/O')
        ? 'H/O'
        : getBankAndAccountShortTag(d.bankName, (d as any).accountName, d.displayTag) || d.displayTag || d.bankName || 'PBL(PE)';
      const isoDate = parseDateToISO(d.date || d.depositDate) || d.date || d.depositDate || '';
      const key = `${isoDate}___${bTag.trim()}`;
      const existing = depositMap.get(key);
      if (existing) {
        existing.amount += (Number(d.amount) || 0);
      } else {
        depositMap.set(key, {
          date: formatDateDDMMYY(d.date || d.depositDate),
          rawDate: isoDate,
          bankName: bTag.trim(),
          amount: Number(d.amount) || 0
        });
      }'''

assert t14 in content, 't14 not found'
content = content.replace(t14, r14, 1)

# 14. Sheet Month line
t15 = '''            <div className="text-left w-1/3">
              <span>Month:&nbsp;{formatDateShortYY(startDate)} to {formatDateShortYY(endDate)}</span>
            </div>'''

r15 = '''            <div className="text-left w-1/3">
              <span>Month:&nbsp;{startDate && endDate ? `${formatDateShortYY(startDate)} to ${formatDateShortYY(endDate)}` : startDate ? `From ${formatDateShortYY(startDate)}` : endDate ? `To ${formatDateShortYY(endDate)}` : 'All Records'}</span>
            </div>'''

assert t15 in content, 't15 not found'
content = content.replace(t15, r15, 1)

# 15. Export Excel Month line
t16 = '''        [`Month: ${formatDateShortYY(startDate)} to ${formatDateShortYY(endDate)}`, '', `Name: ${displayName}`, '', '', `Name: ${displayCenterName}`],'''
r16 = '''        [`Month: ${startDate && endDate ? `${formatDateShortYY(startDate)} to ${formatDateShortYY(endDate)}` : 'All Records'}`, '', `Name: ${displayName}`, '', '', `Name: ${displayCenterName}`],'''

assert t16 in content, 't16 not found'
content = content.replace(t16, r16, 1)

# 16. Custom Date Range Inputs in Expense Report tab
t17 = '''              {/* Custom Date Range Picker */}
              <div className="flex items-center space-x-1 bg-slate-900/90 p-1 px-2 rounded-lg border border-slate-700">
                <span className="text-[11px] font-bold text-slate-300">From:</span>
                <input
                  type="text"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onBlur={() => {
                    if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-slate-800 text-amber-300 font-mono font-bold border border-slate-600 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-amber-500"
                />
                <input
                  type="date"
                  value={parseDateToISO(startDate)}
                  onChange={(e) => {
                    if (e.target.value) {
                      setStartDate(formatDateDDMMYY(e.target.value));
                      setPeriodPreset('custom');
                    }
                  }}
                  className="p-0.5 border border-slate-700 rounded text-xs bg-slate-800 text-white cursor-pointer w-6 h-6 shrink-0"
                  title="Pick Start Date"
                />

                <span className="text-[11px] font-bold text-slate-300 ml-1">To:</span>
                <input
                  type="text"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onBlur={() => {
                    if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-slate-800 text-amber-300 font-mono font-bold border border-slate-600 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-amber-500"
                />
                <input
                  type="date"
                  value={parseDateToISO(endDate)}
                  onChange={(e) => {
                    if (e.target.value) {
                      setEndDate(formatDateDDMMYY(e.target.value));
                      setPeriodPreset('custom');
                    }
                  }}
                  className="p-0.5 border border-slate-700 rounded text-xs bg-slate-800 text-white cursor-pointer w-6 h-6 shrink-0"
                  title="Pick End Date"
                />
              </div>'''

r17 = '''              {/* Custom Date Range Picker */}
              <div className="flex items-center space-x-1 bg-slate-900/90 p-1 px-2 rounded-lg border border-slate-700">
                <span className="text-[11px] font-bold text-slate-300">From:</span>
                <input
                  type="text"
                  value={startDate}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onFocus={(e) => (e.target as HTMLInputElement).select()}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                    }
                  }}
                  onBlur={() => {
                    if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-slate-800 text-amber-300 font-mono font-bold border border-slate-600 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-amber-500"
                />
                <input
                  type="date"
                  value={parseDateToISO(startDate)}
                  onChange={(e) => {
                    if (e.target.value) {
                      setStartDate(formatDateDDMMYY(e.target.value));
                      setPeriodPreset('custom');
                    }
                  }}
                  className="p-0.5 border border-slate-700 rounded text-xs bg-slate-800 text-white cursor-pointer w-6 h-6 shrink-0"
                  title="Pick Start Date"
                />

                <span className="text-[11px] font-bold text-slate-300 ml-1">To:</span>
                <input
                  type="text"
                  value={endDate}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onFocus={(e) => (e.target as HTMLInputElement).select()}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                    }
                  }}
                  onBlur={() => {
                    if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-slate-800 text-amber-300 font-mono font-bold border border-slate-600 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-amber-500"
                />
                <input
                  type="date"
                  value={parseDateToISO(endDate)}
                  onChange={(e) => {
                    if (e.target.value) {
                      setEndDate(formatDateDDMMYY(e.target.value));
                      setPeriodPreset('custom');
                    }
                  }}
                  className="p-0.5 border border-slate-700 rounded text-xs bg-slate-800 text-white cursor-pointer w-6 h-6 shrink-0"
                  title="Pick End Date"
                />
              </div>'''

assert t17 in content, 't17 not found'
content = content.replace(t17, r17, 1)

# 17. Auto-set current month when opening report tab if dates are empty
t18 = '''  useEffect(() => {
    if (activeTab === 'collection_entry' || initialMode === 'collection_entry') {
      setMrEntity(defaultCollectionAssignedEntity);
    }
  }, [activeTab, initialMode, defaultCollectionAssignedEntity]);'''

r18 = '''  useEffect(() => {
    if (activeTab === 'report' || initialMode === 'report') {
      if (!startDate && !endDate && periodPreset !== 'all') {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        setStartDate(formatDateDDMMYY(first));
        setEndDate(formatDateDDMMYY(last));
        setPeriodPreset('this_month');
      }
    }
  }, [activeTab, initialMode, startDate, endDate, periodPreset]);

  useEffect(() => {
    if (activeTab === 'collection_entry' || initialMode === 'collection_entry') {
      setMrEntity(defaultCollectionAssignedEntity);
    }
  }, [activeTab, initialMode, defaultCollectionAssignedEntity]);'''

assert t18 in content, 't18 not found'
content = content.replace(t18, r18, 1)

with open('src/components/ExpenseManager.tsx', 'w') as f:
    f.write(content)
print('Successfully updated ExpenseManager.tsx!')
