import os

# First, let's fix the directory tab period buttons in the code before the report section
with open('src/components/ExpenseManager.tsx', 'r', encoding='utf-8') as f:
    orig = f.read()

# Let's inspect directory tab period button area
dir_pos = orig.find("{/* 3. EXPENSE DIRECTORY LOG */}")
rep_pos = orig.find("{/* 4. EXPENSE STATEMENT REPORT")

dir_section = orig[dir_pos:rep_pos]

# Let's fix className in dir_section
fixed_dir_section = dir_section.replace(
    'periodPreset === \'this_month\' ? \'bg-amber-500 text-slate-950 border-amber-400 shadow-xs\' : \'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700\'',
    'periodPreset === "this_month" ? "bg-amber-500 text-slate-950 border-amber-400 shadow-xs" : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"'
)

# Let's cleanly define the entire directory tab filter bar and content
fixed_dir_block = '''{/* 3. EXPENSE DIRECTORY LOG */}
      {activeTab === 'directory' && (
        <div className="space-y-3 font-sans">
          {/* Header Banner */}
          <div className="bg-slate-900 text-white rounded-xl p-3 sm:p-4 shadow-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-lg border border-indigo-500/40">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">Expense Directory & Transaction Log</h3>
                <p className="text-xs text-slate-400">Expense Vouchers, Petty Cash & Ledger Archive ({filteredExpenses.length} Records)</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setActiveTab('entry')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ New Expense</span>
              </button>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-600 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                  title="Back to Previous View"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-300" />
                  <span>Back</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-200 bg-rose-950 hover:bg-rose-900 hover:text-white border border-rose-700 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                  title="Close View"
                >
                  <X className="w-4 h-4 text-rose-300" />
                  <span>Close</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar (Matches Stock Report Layout & Styling) */}
          <div className="bg-slate-800 text-white rounded-xl shadow-md border border-slate-700/80 p-2.5 sm:p-3 space-y-2">
            {/* Row 1: Account, Category, Search, Reset, Total Filtered */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              {/* Account / Entity Filter */}
              <div className="flex items-center space-x-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700">
                <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
                  Account:
                </label>
                <select
                  value={filterEntity}
                  onChange={(e) => setFilterEntity(e.target.value)}
                  className="bg-slate-800 text-indigo-300 font-bold border border-slate-600 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Accounts</option>
                  <option value="Madhupur Sales Center">Madhupur Sales Center</option>
                  {salespersons.map((sp) => (
                    <option key={sp.id} value={sp.name}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Expense Category Filter */}
              <div className="flex items-center space-x-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700">
                <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
                  Category:
                </label>
                <select
                  value={filterExpenseCategory}
                  onChange={(e) => setFilterExpenseCategory(e.target.value)}
                  className="bg-slate-800 text-emerald-300 font-bold border border-slate-600 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer max-w-[180px] truncate"
                >
                  <option value="all">All Categories ({DEFAULT_EXPENSE_HEADS.length})</option>
                  {DEFAULT_EXPENSE_HEADS.map((head) => (
                    <option key={head} value={head}>
                      {head}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Box */}
              <div className="relative flex-1 min-w-[170px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search head, remarks, amount..."
                  className="w-full pl-8 pr-7 py-1 text-xs bg-slate-900 text-white placeholder-slate-400 border border-slate-600 rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Reset Filters */}
              {(Boolean(search) || filterEntity !== 'Madhupur Sales Center' || filterExpenseCategory !== 'all' || periodPreset !== 'this_month') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterEntity('Madhupur Sales Center');
                    setFilterExpenseCategory('all');
                    handleSelectPeriodPreset('this_month');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/70 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Reset search and filters to default"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>Reset</span>
                </button>
              )}

              {/* Filtered Total Badge */}
              <div className="ml-auto flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-700 text-xs">
                <span className="text-slate-400 font-bold">Total Filtered:</span>
                <span className="text-rose-400 font-extrabold text-sm font-mono">
                  ৳{filteredExpenses.reduce((a, b) => a + b.amount, 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Row 2: Period Selection, Quick Presets & Inline Custom Range */}
            <div className="pt-1.5 border-t border-slate-700/80 flex items-center space-x-2 flex-wrap gap-y-1.5">
              <div className="flex items-center space-x-1.5 bg-slate-900/90 p-1 px-2 rounded-lg border border-slate-700">
                <label className="text-slate-300 font-bold flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs">Period:</span>
                </label>

                {/* Quick Period Buttons */}
                <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('this_month')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'this_month'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Current Month (01.${runningMm}.${runningYy} - ${runningLastDay}.${runningMm}.${runningYy})`}
                  >
                    This Month
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('15_days_1')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === '15_days_1'
                        ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`15 Days First Half (01.${runningMm}.${runningYy} - 15.${runningMm}.${runningYy})`}
                  >
                    15 Days (01-15)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('15_days_2')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === '15_days_2'
                        ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`15 Days Second Half (16.${runningMm}.${runningYy} - ${runningLastDay}.${runningMm}.${runningYy})`}
                  >
                    15 Days (16-${runningLastDay})
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('last_month')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'last_month'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Last Month (01.${prevMm}.${prevYy} - ${prevLastDay}.${prevMm}.${prevYy})`}
                  >
                    Last Month
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('this_year')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'this_year'
                        ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Current Year (${runningYyyy})`}
                  >
                    This Year
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('last_year')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'last_year'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Last Year (${runningYyyy - 1})`}
                  >
                    Last Year
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('all')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'all'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title="All Records"
                  >
                    All
                  </button>
                </div>
              </div>

              {/* Custom Date Range Picker */}
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
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
'''

# Replace directory section up to the table
table_pos = orig.find("{directoryView === 'expenses' ? (", dir_pos)
code_before_table = orig[:dir_pos]
code_table_and_rest = orig[table_pos:rep_pos]

code_before_report = code_before_table + fixed_dir_block + code_table_and_rest

# Now ensure helper calculations are present in the top section
if 'const computedNetBalance =' not in code_before_report:
    # Add computedNetBalance and handleExportExcel before return (
    ret_pos = code_before_report.find("return (")
    helpers_to_add = '''
  // Calculated Net Balance for Statement
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
    code_before_report = code_before_report[:ret_pos] + helpers_to_add + "\n  " + code_before_report[ret_pos:]

# Now assemble full file
statement_and_modals_jsx = '''{/* 4. EXPENSE STATEMENT REPORT */}
      {activeTab === 'report' && (
        <div className="space-y-4">
          {/* FILTER BAR - Matches Stock Report Style Exactly */}
          <div className="bg-slate-800 text-white rounded-xl shadow-md border border-slate-700/80 p-2.5 sm:p-3 space-y-2 print:hidden">
            {/* Row 1: Account, Search/Category, Reset, Summary Badges & Action Buttons */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-2 justify-between">
              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                {/* Account / Entity Filter */}
                <div className="flex items-center space-x-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700">
                  <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
                    Account:
                  </label>
                  <select
                    value={filterEntity}
                    onChange={(e) => setFilterEntity(e.target.value)}
                    className="bg-slate-800 text-indigo-300 font-bold border border-slate-600 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="Madhupur Sales Center">Madhupur Sales Center</option>
                    {salespersons.map((sp) => (
                      <option key={sp.id} value={sp.name}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reset Filters Button */}
                {(filterEntity !== 'Madhupur Sales Center' || periodPreset !== 'this_month') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterEntity('Madhupur Sales Center');
                      handleSelectPeriodPreset('this_month');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/70 rounded-lg transition-colors cursor-pointer shadow-2xs"
                    title="Reset filters to default"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                    <span>Reset</span>
                  </button>
                )}

                {/* KPI Summary Badges */}
                <div className="hidden lg:flex items-center space-x-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700 text-[11px]">
                  <span className="text-slate-400 font-bold">Net Sale:</span>
                  <span className="text-blue-400 font-bold font-mono">৳{totalNetSaleSum.toLocaleString('en-IN')}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400 font-bold">Collection:</span>
                  <span className="text-emerald-400 font-bold font-mono">৳{totalCollectionSum.toLocaleString('en-IN')}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400 font-bold">Expense:</span>
                  <span className="text-rose-400 font-bold font-mono">৳{totalExpenseSum.toLocaleString('en-IN')}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400 font-bold">Net Balance:</span>
                  <span className={`font-black font-mono ${computedNetBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    ৳{computedNetBalance.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
                  title="Export Statement to Excel"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">Export Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintReport}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95"
                  title="Print Expense Statement Report"
                >
                  <Printer className="w-4 h-4 text-white" />
                  <span>Print Expense Report</span>
                </button>

                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-200 bg-slate-900 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                    title="Back to Previous View"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-300" />
                    <span>Back</span>
                  </button>
                )}

                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-200 bg-rose-950 hover:bg-rose-900 hover:text-white border border-rose-700 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                    title="Close View"
                  >
                    <X className="w-4 h-4 text-rose-300" />
                    <span>Close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Period Selection, Quick Presets & Inline Custom Range */}
            <div className="pt-1.5 border-t border-slate-700/80 flex items-center space-x-2 flex-wrap gap-y-1.5">
              <div className="flex items-center space-x-1.5 bg-slate-900/90 p-1 px-2 rounded-lg border border-slate-700">
                <label className="text-slate-300 font-bold flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs">Period:</span>
                </label>

                {/* Quick Period Buttons */}
                <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('this_month')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'this_month'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Current Month (01.${runningMm}.${runningYy} - ${runningLastDay}.${runningMm}.${runningYy})`}
                  >
                    This Month
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('15_days_1')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === '15_days_1'
                        ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`15 Days First Half (01.${runningMm}.${runningYy} - 15.${runningMm}.${runningYy})`}
                  >
                    15 Days (01-15)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('15_days_2')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === '15_days_2'
                        ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`15 Days Second Half (16.${runningMm}.${runningYy} - ${runningLastDay}.${runningMm}.${runningYy})`}
                  >
                    15 Days (16-${runningLastDay})
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('last_month')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'last_month'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Last Month (01.${prevMm}.${prevYy} - ${prevLastDay}.${prevMm}.${prevYy})`}
                  >
                    Last Month
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('this_year')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'this_year'
                        ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Current Year (${runningYyyy})`}
                  >
                    This Year
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('last_year')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'last_year'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={`Last Year (${runningYyyy - 1})`}
                  >
                    Last Year
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPeriodPreset('all')}
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                      periodPreset === 'all'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title="All Records"
                  >
                    All
                  </button>
                </div>
              </div>

              {/* Custom Date Range Picker */}
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
              </div>
            </div>
          </div>

          {/* Statement Document Container */}
          <div
            id="expense-statement-report-content"
            ref={reportPrintRef}
            className="bg-white p-6 sm:p-8 rounded-xl shadow-lg border border-slate-200 text-black max-w-4xl mx-auto space-y-6 font-sans print:p-0 print:border-none print:shadow-none print:m-0"
          >
            {/* Header */}
            <div className="text-center border-b border-black pb-4">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
                POLY CABLES INDUSTRIES LTD.
              </h1>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mt-0.5">
                Head Office: 28, Dilkusha C/A, Dhaka-1000
              </p>
              <h2 className="text-base font-extrabold uppercase text-black mt-2 underline decoration-2 underline-offset-4">
                Statement of Expenditure & Collection
              </h2>
              <div className="flex flex-wrap items-center justify-between mt-3 text-xs font-bold text-slate-900 border-t border-slate-300 pt-2">
                <div className="flex items-center space-x-1">
                  <span className="text-slate-600">Account:</span>
                  <span className="font-extrabold font-mono text-black">{reportEntity}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-slate-600">Period:</span>
                  <span className="font-extrabold font-mono text-black">{monthRange}</span>
                </div>
              </div>
            </div>

            {/* Statement Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 border-b border-black pb-6">
              {/* Left Column: Sales & Collections */}
              <div className="md:col-span-5 space-y-4 border-r border-slate-200 md:pr-4">
                <div className="border border-black rounded p-3 bg-slate-50 space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1">
                    Sales Summary
                  </h4>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700">Net Sales:</span>
                    <span className="font-mono font-extrabold text-black">
                      {totalNetSaleSum > 0 ? `৳${totalNetSaleSum.toLocaleString('en-IN')}` : '৳0'}
                    </span>
                  </div>
                </div>

                <div className="border border-black rounded p-3 bg-slate-50 space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1">
                    Collection Summary
                  </h4>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700">Total Collection:</span>
                    <span className="font-mono font-extrabold text-black">
                      ৳{totalCollectionSum.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-200">
                    <span className="text-slate-700">Bank Deposited:</span>
                    <span className="font-mono font-extrabold text-emerald-800">
                      ৳{totalBankDepositedSum.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="border-2 border-black rounded p-3 bg-slate-100 space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1">
                    Net Balance
                  </h4>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700">Collections - Expenses:</span>
                    <span className={`font-mono font-black text-sm ${computedNetBalance >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                      ৳{computedNetBalance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Expense Table */}
              <div className="md:col-span-7">
                <table className="w-full text-xs text-black border-collapse">
                  <thead>
                    <tr className="border-b border-black bg-slate-100 font-bold uppercase text-[10px]">
                      <th className="p-1.5 border-r border-black text-center w-8">SL#</th>
                      <th className="p-1.5 border-r border-black text-left">Expense Head</th>
                      <th className="p-1.5 text-right w-24">Amount (৳)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEFAULT_EXPENSE_HEADS.map((head, idx) => {
                      const amt = expenseHeadTotals[head] || 0;
                      return (
                        <tr key={head} className="border-b border-slate-300 h-6 hover:bg-slate-50">
                          <td className="p-1 border-r border-black text-center text-[10px]">{idx + 1}</td>
                          <td className="p-1 border-r border-black text-left text-[11px] font-medium">{head}</td>
                          <td className="p-1 text-right text-[11px] font-bold font-mono">
                            {amt > 0 ? amt.toLocaleString('en-IN') : ''}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-black bg-slate-100 font-bold text-black h-7">
                      <td colSpan={2} className="p-1.5 text-right uppercase text-[11px] font-extrabold border-r border-black">
                        Total Expenses
                      </td>
                      <td className="p-1.5 text-right text-xs font-black font-mono">
                        ৳{totalExpenseSum.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature Block */}
            <div className="grid grid-cols-3 gap-8 text-center pt-12 pb-4 text-xs font-bold text-black uppercase tracking-wider">
              <div>
                <div className="border-t border-black pt-1 max-w-[140px] mx-auto">Prepared By</div>
              </div>
              <div>
                <div className="border-t border-black pt-1 max-w-[140px] mx-auto">Accounts / Audit</div>
              </div>
              <div>
                <div className="border-t border-black pt-1 max-w-[140px] mx-auto">DGM / Director</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINT PREVIEW MODAL */}
      {showReportPrintPreviewModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 overflow-y-auto p-4 flex justify-center print:p-0 print:bg-white print:static">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-700 overflow-hidden my-6 print:m-0 print:border-none print:shadow-none print:rounded-none">
            <div className="bg-slate-900 text-white p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 no-print">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowReportPrintPreviewModal(false)}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-slate-700"
                  title="Go Back"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-300" />
                  <span>Back</span>
                </button>
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-extrabold tracking-wide uppercase">
                    Expense Statement Report - Print Preview ({reportEntity})
                  </h3>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportPrintPreviewModal(false)}
                  className="flex items-center space-x-1.5 bg-rose-600/80 hover:bg-rose-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <X className="w-4 h-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-8 bg-white text-black overflow-x-auto">
              <div className="text-center border-b border-black pb-4">
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
                  POLY CABLES INDUSTRIES LTD.
                </h1>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mt-0.5">
                  Head Office: 28, Dilkusha C/A, Dhaka-1000
                </p>
                <h2 className="text-base font-extrabold uppercase text-black mt-2 underline decoration-2 underline-offset-4">
                  Statement of Expenditure & Collection
                </h2>
                <div className="flex flex-wrap items-center justify-between mt-3 text-xs font-bold text-slate-900 border-t border-slate-300 pt-2">
                  <div>
                    <span className="text-slate-600">Account:</span>{' '}
                    <span className="font-extrabold font-mono text-black">{reportEntity}</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Period:</span>{' '}
                    <span className="font-extrabold font-mono text-black">{monthRange}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 border-b border-black py-6">
                <div className="md:col-span-5 space-y-4 border-r border-slate-200 md:pr-4">
                  <div className="border border-black rounded p-3 bg-slate-50 space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1">
                      Sales Summary
                    </h4>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-700">Net Sales:</span>
                      <span className="font-mono font-extrabold text-black">
                        {totalNetSaleSum > 0 ? `৳${totalNetSaleSum.toLocaleString('en-IN')}` : '৳0'}
                      </span>
                    </div>
                  </div>

                  <div className="border border-black rounded p-3 bg-slate-50 space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1">
                      Collection Summary
                    </h4>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-700">Total Collection:</span>
                      <span className="font-mono font-extrabold text-black">
                        ৳{totalCollectionSum.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-200">
                      <span className="text-slate-700">Bank Deposited:</span>
                      <span className="font-mono font-extrabold text-emerald-800">
                        ৳{totalBankDepositedSum.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="border-2 border-black rounded p-3 bg-slate-100 space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1">
                      Net Balance
                    </h4>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-700">Collections - Expenses:</span>
                      <span className={`font-mono font-black text-sm ${computedNetBalance >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                        ৳{computedNetBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-7">
                  <table className="w-full text-xs text-black border-collapse">
                    <thead>
                      <tr className="border-b border-black bg-slate-100 font-bold uppercase text-[10px]">
                        <th className="p-1.5 border-r border-black text-center w-8">SL#</th>
                        <th className="p-1.5 border-r border-black text-left">Expense Head</th>
                        <th className="p-1.5 text-right w-24">Amount (৳)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEFAULT_EXPENSE_HEADS.map((head, idx) => {
                        const amt = expenseHeadTotals[head] || 0;
                        return (
                          <tr key={head} className="border-b border-slate-300 h-6">
                            <td className="p-1 border-r border-black text-center text-[10px]">{idx + 1}</td>
                            <td className="p-1 border-r border-black text-left text-[11px] font-medium">{head}</td>
                            <td className="p-1 text-right text-[11px] font-bold font-mono">
                              {amt > 0 ? amt.toLocaleString('en-IN') : ''}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-black bg-slate-100 font-bold text-black h-7">
                        <td colSpan={2} className="p-1.5 text-right uppercase text-[11px] font-extrabold border-r border-black">
                          Total Expenses
                        </td>
                        <td className="p-1.5 text-right text-xs font-black font-mono">
                          ৳{totalExpenseSum.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-8 text-center pt-12 pb-4 text-xs font-bold text-black uppercase tracking-wider">
                <div>
                  <div className="border-t border-black pt-1 max-w-[140px] mx-auto">Prepared By</div>
                </div>
                <div>
                  <div className="border-t border-black pt-1 max-w-[140px] mx-auto">Accounts / Audit</div>
                </div>
                <div>
                  <div className="border-t border-black pt-1 max-w-[140px] mx-auto">DGM / Director</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Confirm Deletion</h3>
                <p className="text-xs text-slate-500 font-medium">This action cannot be undone.</p>
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
              Are you sure you want to permanently delete this {deleteConfirmTarget.type === 'expense' ? 'expense voucher' : 'collection MR'}
              {deleteConfirmTarget.label ? ` (${deleteConfirmTarget.label})` : ''}
              {deleteConfirmTarget.amount ? ` worth ৳${deleteConfirmTarget.amount.toLocaleString('en-IN')}` : ''}?
            </div>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirmTarget.type === 'expense') {
                    handleDeleteExpense(deleteConfirmTarget.id);
                  } else if (deleteConfirmTarget.type === 'collection') {
                    handleDeleteCollection(deleteConfirmTarget.id);
                  } else if (deleteConfirmTarget.type === 'bankDeposit') {
                    setBankDeposits(bankDeposits.filter((d) => d.id !== deleteConfirmTarget.id));
                    showNotify('success', 'Bank deposit entry deleted.');
                  }
                  setDeleteConfirmTarget(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-md"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLECTION DUPLICATE CONFIRMATION MODAL */}
      {collectionDupConfirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-amber-300 space-y-4">
            <div className="flex items-center space-x-3 text-amber-700">
              <div className="p-3 bg-amber-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Duplicate Cash Collection Detected</h3>
                <p className="text-xs text-slate-500 font-medium">
                  An identical collection record was found in the database.
                </p>
              </div>
            </div>
            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-2 text-xs">
              <div className="font-extrabold text-amber-900 text-xs">
                ⚠️ Warning: {collectionDupConfirmModal.dupInfo.reason}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-500 font-bold block">Party Name:</span>
                  <span className="font-black text-slate-800">{collectionDupConfirmModal.pendingCollection.partyName}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Collection Date:</span>
                  <span className="font-mono font-bold text-slate-800">{formatDateDDMMYY(collectionDupConfirmModal.pendingCollection.date)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Amount:</span>
                  <span className="font-mono font-extrabold text-emerald-800 text-sm">৳{collectionDupConfirmModal.pendingCollection.amount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Existing MR#:</span>
                  <span className="font-mono font-bold text-amber-900">{collectionDupConfirmModal.dupInfo.matchingCollection?.mrNo || 'N/A'}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCollectionDupConfirmModal(null)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel / Correction
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = collectionDupConfirmModal.pendingCollection;
                  setCollectionDupConfirmModal(null);
                  const updated = [pending, ...collections];
                  setCollections(updated);
                  const nextMr = computeNextMrNo(updated);
                  setMrNo(nextMr);
                  setMrAmount('');
                  setMrChequeNo('');
                  setMrRemarks('');
                  setMrPartyName('');
                  setCustomPartyName('');
                  showNotify('success', `Collection MR (${pending.mrNo}) saved.`);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors cursor-pointer shadow-md"
              >
                Confirm & Save Duplicate Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT DUPLICATE REVIEW & RESOLUTION MODAL */}
      {excelImportDupModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-amber-300 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center space-x-3 text-amber-700 flex-none">
              <div className="p-3 bg-amber-100 rounded-xl">
                <FileSpreadsheet className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Excel Import: {excelImportDupModal.duplicateRecords.length} Duplicate Records Found
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {excelImportDupModal.uniqueRecords.length} unique records ready to import, {excelImportDupModal.duplicateRecords.length} duplicate records detected.
                </p>
              </div>
            </div>
            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 text-xs text-amber-900">
              <p className="font-bold">
                The following records already exist in your collection records (same Date, Party, and Amount):
              </p>
            </div>
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60">
              {excelImportDupModal.duplicateRecords.map((item, i) => (
                <div key={i} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-800">{item.record.partyName || "Unknown Party"}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Date: {formatDateDDMMYY(item.record.date)} • MR: {item.record.mrNo || "N/A"} • {item.reason}
                    </div>
                  </div>
                  <div className="font-mono font-extrabold text-amber-800 text-sm">
                    ৳{Number(item.record.amount || 0).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-slate-200 flex-none">
              <button
                type="button"
                onClick={() => setExcelImportDupModal(null)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel Import
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = [...excelImportDupModal.uniqueRecords, ...collections];
                  setCollections(updated);
                  setExcelImportDupModal(null);
                  showNotify("success", `Imported ${excelImportDupModal.uniqueRecords.length} non-duplicate records successfully!`);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-black text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors cursor-pointer border border-emerald-300"
              >
                Skip Duplicates ({excelImportDupModal.uniqueRecords.length} Records)
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = [...excelImportDupModal.allRecords, ...collections];
                  setCollections(updated);
                  setExcelImportDupModal(null);
                  showNotify("success", `Imported all ${excelImportDupModal.allRecords.length} records including duplicates.`);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors cursor-pointer shadow-md"
              >
                Import All Anyway ({excelImportDupModal.allRecords.length} Records)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseManager;
'''

full_new_content = code_before_report + statement_and_modals_jsx

with open('src/components/ExpenseManager.tsx', 'w', encoding='utf-8') as f:
    f.write(full_new_content)

print('Assembled successfully!')
