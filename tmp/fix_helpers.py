with open('src/components/ExpenseManager.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove the mistakenly added helpers near top (line 428)
bad_snippet = '''  // Calculated Net Balance for Statement
  const computedNetBalance = totalCollectionSum - totalExpenseSum;

  // Export Statement to CSV / Excel
  const handleExportExcel = () => {
    try {
      const rows: string[][] = [
        ['POLY CABLES INDUSTRIES LTD.'],
        ['Head Office: 28, Dilkusha C/A, Dhaka-1000'],
        ['Statement of Expenditure & Collection'],
        [`Account: ${reportEntity}`, `Period: ${monthRange}`],
        [],
        ['SALES & COLLECTION SUMMARY'],
        ['Net Sales', `৳${totalNetSaleSum.toLocaleString('en-IN')}`],
        ['Total Collections', `৳${totalCollectionSum.toLocaleString('en-IN')}`],
        ['Bank Deposited', `৳${totalBankDepositedSum.toLocaleString('en-IN')}`],
        ['Net Balance (Collections - Expenses)', `৳${computedNetBalance.toLocaleString('en-IN')}`],
        [],
        ['SL#', 'Expense Head', 'Amount (৳)']
      ];

      DEFAULT_EXPENSE_HEADS.forEach((head, idx) => {
        const amt = expenseHeadTotals[head] || 0;
        rows.push([String(idx + 1), head, amt > 0 ? String(amt) : '0']);
      });

      rows.push(['', 'Total Expenses', String(totalExpenseSum)]);

      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Expense_Statement_${reportEntity.replace(/\\s+/g, '_')}_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotify('success', 'Expense statement exported successfully.');
    } catch (e) {
      console.error(e);
      showNotify('error', 'Failed to export expense statement.');
    }
  };'''

text = text.replace(bad_snippet, '')

# 2. Insert helpers right before the main return (line 3726)
target = '  return (\n    <div className="space-y-6 font-sans">\n      {/* Top Banner Navigation */}'

helpers = '''  // Calculated Net Balance for Statement
  const computedNetBalance = totalCollectionSum - totalExpenseSum;

  // Export Statement to CSV / Excel
  const handleExportExcel = () => {
    try {
      const rows: string[][] = [
        ['POLY CABLES INDUSTRIES LTD.'],
        ['Head Office: 28, Dilkusha C/A, Dhaka-1000'],
        ['Statement of Expenditure & Collection'],
        [`Account: ${reportEntity}`, `Period: ${monthRange}`],
        [],
        ['SALES & COLLECTION SUMMARY'],
        ['Net Sales', `৳${totalNetSaleSum.toLocaleString('en-IN')}`],
        ['Total Collections', `৳${totalCollectionSum.toLocaleString('en-IN')}`],
        ['Bank Deposited', `৳${totalBankDepositedSum.toLocaleString('en-IN')}`],
        ['Net Balance (Collections - Expenses)', `৳${computedNetBalance.toLocaleString('en-IN')}`],
        [],
        ['SL#', 'Expense Head', 'Amount (৳)']
      ];

      DEFAULT_EXPENSE_HEADS.forEach((head, idx) => {
        const amt = expenseHeadTotals[head] || 0;
        rows.push([String(idx + 1), head, amt > 0 ? String(amt) : '0']);
      });

      rows.push(['', 'Total Expenses', String(totalExpenseSum)]);

      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Expense_Statement_${reportEntity.replace(/\\s+/g, '_')}_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotify('success', 'Expense statement exported successfully.');
    } catch (e) {
      console.error(e);
      showNotify('error', 'Failed to export expense statement.');
    }
  };

'''

if target in text:
    text = text.replace(target, helpers + target, 1)
    print("Replaced main return target successfully")
else:
    print("Target not found!")

with open('src/components/ExpenseManager.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
