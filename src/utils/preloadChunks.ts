/**
 * Fast route-chunk preloading and hover/focus prefetching.
 * Warms all 24 React.lazy route modules in small staggered batches without blocking UI clicks,
 * and allows instant targeted prefetching on menu hover/focus/touch.
 */

type ChunkImporter = () => Promise<unknown>;

const importBillInvoiceView: ChunkImporter = () => import('../components/BillInvoiceView');
const importSheet2ItemManager: ChunkImporter = () => import('../components/Sheet2ItemManager');
const importSalesReportView: ChunkImporter = () => import('../components/SalesReportView');
const importSalesReportItemView: ChunkImporter = () => import('../components/SalesReportItemView');
const importChallanManager: ChunkImporter = () => import('../components/ChallanManager');
const importColorExchangeManager: ChunkImporter = () => import('../components/ColorExchangeManager');
const importStoredBillsDirectory: ChunkImporter = () => import('../components/StoredBillsDirectory');
const importPartyDirectory: ChunkImporter = () => import('../components/PartyDirectory');
const importSalespersonDirectory: ChunkImporter = () => import('../components/SalespersonDirectory');
const importReturnsManager: ChunkImporter = () => import('../components/ReturnsManager');
const importTrash: ChunkImporter = () => import('../components/Trash');
const importExpenseManager: ChunkImporter = () => import('../components/ExpenseManager');
const importReportDashboard: ChunkImporter = () => import('../components/ReportDashboard');
const importCustomerLedger: ChunkImporter = () => import('../components/CustomerLedger');
const importSettingsView: ChunkImporter = () => import('../components/SettingsView');
const importRequisitionPage: ChunkImporter = () => import('../components/RequisitionPage');
const importSlipPadChallanView: ChunkImporter = () => import('../components/SlipPadChallanView');
const importKeyboardShortcutsModal: ChunkImporter = () => import('../components/KeyboardShortcutsModal');
const importMainMenuPage: ChunkImporter = () => import('../components/MainMenuPage');
const importAISalesForecastModal: ChunkImporter = () => import('../components/AISalesForecastModal');
const importAdminSalesCollectionReportPage: ChunkImporter = () => import('../components/AdminSalesCollectionReportPage');
const importConveyanceManager: ChunkImporter = () => import('../components/ConveyanceManager');
const importPriceUpdateHistoryPage: ChunkImporter = () => import('../components/PriceUpdateHistoryPage');
const importApproveExpenseHub: ChunkImporter = () => import('../components/ApproveExpenseHub');

const ROUTE_IMPORTERS: Record<string, ChunkImporter[]> = {
  builder: [importBillInvoiceView],
  bill: [importBillInvoiceView],
  item_directory: [importSheet2ItemManager, importPriceUpdateHistoryPage],
  sales_report: [importSalesReportView],
  sales_items: [importSalesReportItemView],
  challan_menu: [importChallanManager],
  challan: [importChallanManager],
  color_exchange: [importColorExchangeManager],
  stored_bills: [importStoredBillsDirectory],
  party_directory: [importPartyDirectory],
  salesperson_directory: [importSalespersonDirectory],
  returns_menu: [importReturnsManager],
  returns: [importReturnsManager],
  trash_bin: [importTrash],
  expense: [importExpenseManager],
  expense_directory: [importExpenseManager],
  expense_entry: [importExpenseManager],
  collection: [importExpenseManager],
  collection_entry: [importExpenseManager],
  collection_list: [importExpenseManager],
  cash_in_hand: [importExpenseManager],
  cheque_in_hand: [importExpenseManager],
  deposit_history: [importExpenseManager],
  report: [importReportDashboard],
  report_dashboard: [importReportDashboard],
  customer_ledger: [importCustomerLedger],
  settings: [importSettingsView],
  allowance_settings: [importSettingsView],
  requisition: [importRequisitionPage],
  factory: [importRequisitionPage],
  slip_pad_memo: [importSlipPadChallanView],
  shortcuts: [importKeyboardShortcutsModal],
  main_menu: [importMainMenuPage, importAISalesForecastModal],
  ai_sales_forecast: [importAISalesForecastModal],
  admin_sales_collection_report: [importAdminSalesCollectionReportPage],
  conveyance: [importConveyanceManager],
  price_history: [importPriceUpdateHistoryPage],
  approved_menu: [importApproveExpenseHub, importRequisitionPage, importConveyanceManager],
  // MainMenuPage card aliases
  import_history: [importSheet2ItemManager],
  expense_manager: [importExpenseManager],
  monthly_expense: [importExpenseManager]
};

const SECTION_IMPORTERS: Record<string, ChunkImporter[]> = {
  approved: [importApproveExpenseHub, importRequisitionPage, importConveyanceManager],
  sales: [
    importBillInvoiceView,
    importChallanManager,
    importRequisitionPage,
    importColorExchangeManager,
    importStoredBillsDirectory,
    importReturnsManager
  ],
  collection: [importExpenseManager],
  itemList: [importSheet2ItemManager, importPriceUpdateHistoryPage],
  customerDirectory: [importPartyDirectory, importCustomerLedger],
  salespersonDirectory: [importSalespersonDirectory],
  expenseDirectory: [importExpenseManager, importConveyanceManager, importApproveExpenseHub],
  factory: [importRequisitionPage],
  report: [
    importReportDashboard,
    importSalesReportView,
    importSalesReportItemView,
    importAISalesForecastModal
  ],
  settings: [importSettingsView, importTrash]
};

const ALL_IMPORTERS: ChunkImporter[] = [
  importAdminSalesCollectionReportPage,
  importMainMenuPage,
  importBillInvoiceView,
  importStoredBillsDirectory,
  importChallanManager,
  importExpenseManager,
  importSheet2ItemManager,
  importPartyDirectory,
  importCustomerLedger,
  importRequisitionPage,
  importReportDashboard,
  importSalesReportView,
  importSalesReportItemView,
  importPriceUpdateHistoryPage,
  importReturnsManager,
  importColorExchangeManager,
  importConveyanceManager,
  importApproveExpenseHub,
  importSalespersonDirectory,
  importSettingsView,
  importTrash,
  importSlipPadChallanView,
  importAISalesForecastModal,
  importKeyboardShortcutsModal
];

const triggeredImporters = new Set<ChunkImporter>();
let hasPreloaded = false;

function runImporter(loader: ChunkImporter) {
  if (triggeredImporters.has(loader)) return;
  triggeredImporters.add(loader);
  loader().catch(() => {
    triggeredImporters.delete(loader);
  });
}

export const prefetchRouteChunk = (tab?: string | null) => {
  if (!tab || typeof window === 'undefined') return;
  const loaders = ROUTE_IMPORTERS[tab];
  if (loaders) {
    loaders.forEach(runImporter);
  }
};

export const prefetchSectionChunks = (section?: string | null) => {
  if (!section || typeof window === 'undefined') return;
  const loaders = SECTION_IMPORTERS[section];
  if (loaders) {
    loaders.forEach(runImporter);
  }
};

export const preloadAllAppChunks = () => {
  if (hasPreloaded || typeof window === 'undefined') return;
  hasPreloaded = true;

  const scheduleIdle: (cb: () => void) => void =
    typeof (window as any).requestIdleCallback === 'function'
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 250 })
      : (cb) => setTimeout(cb, 45);

  const BATCH_SIZE = 4;
  let offset = 0;

  const loadNextBatch = () => {
    const batch = ALL_IMPORTERS.slice(offset, offset + BATCH_SIZE);
    offset += BATCH_SIZE;
    batch.forEach(runImporter);
    if (offset < ALL_IMPORTERS.length) {
      setTimeout(() => scheduleIdle(loadNextBatch), 55);
    }
  };

  setTimeout(() => scheduleIdle(loadNextBatch), 60);
};
