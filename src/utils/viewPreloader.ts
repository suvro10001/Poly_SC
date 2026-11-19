import React from 'react';

export const viewModuleLoaders = {
  builder: () => import('../components/BillInvoiceView').then((m) => ({ default: m.BillInvoiceView })),
  item_directory: () => import('../components/Sheet2ItemManager').then((m) => ({ default: m.Sheet2ItemManager })),
  sales_report: () => import('../components/SalesReportView').then((m) => ({ default: m.SalesReportView })),
  sales_items: () => import('../components/SalesReportItemView').then((m) => ({ default: m.SalesReportItemView })),
  challan_menu: () => import('../components/ChallanManager').then((m) => ({ default: m.ChallanManager })),
  color_exchange: () => import('../components/ColorExchangeManager').then((m) => ({ default: m.ColorExchangeManager })),
  stored_bills: () => import('../components/StoredBillsDirectory').then((m) => ({ default: m.StoredBillsDirectory })),
  party_directory: () => import('../components/PartyDirectory').then((m) => ({ default: m.PartyDirectory })),
  salesperson_directory: () => import('../components/SalespersonDirectory').then((m) => ({ default: m.SalespersonDirectory })),
  returns_menu: () => import('../components/ReturnsManager').then((m) => ({ default: m.ReturnsManager })),
  trash_bin: () => import('../components/Trash').then((m) => ({ default: m.Trash })),
  expense_directory: () => import('../components/ExpenseManager').then((m) => ({ default: m.ExpenseManager })),
  report_dashboard: () => import('../components/ReportDashboard').then((m) => ({ default: m.ReportDashboard })),
  customer_ledger: () => import('../components/CustomerLedger').then((m) => ({ default: m.CustomerLedger })),
  settings: () => import('../components/SettingsView').then((m) => ({ default: m.SettingsView })),
  requisition: () => import('../components/RequisitionPage').then((m) => ({ default: m.RequisitionPage })),
  slip_pad_memo: () => import('../components/SlipPadChallanView').then((m) => ({ default: m.SlipPadChallanView })),
  shortcuts: () => import('../components/KeyboardShortcutsModal').then((m) => ({ default: m.KeyboardShortcutsModal })),
  main_menu: () => import('../components/MainMenuPage').then((m) => ({ default: m.MainMenuPage })),
  ai_sales_forecast: () => import('../components/AISalesForecastModal').then((m) => ({ default: m.AISalesForecastModal })),
  admin_sales_collection_report: () =>
    import('../components/AdminSalesCollectionReportPage').then((m) => ({ default: m.AdminSalesCollectionReportPage })),
  conveyance: () => import('../components/ConveyanceManager').then((m) => ({ default: m.ConveyanceManager })),
  price_history: () => import('../components/PriceUpdateHistoryPage').then((m) => ({ default: m.PriceUpdateHistoryPage })),
  approved_menu: () => import('../components/ApprovedHubPage').then((m) => ({ default: m.ApprovedHubPage })),
} as const satisfies Record<string, () => Promise<{ default: React.ComponentType<any> }>>;

export type ViewLoaderKey = keyof typeof viewModuleLoaders;

const preloadedKeys = new Set<ViewLoaderKey>();

export function preloadViewModule(key: ViewLoaderKey): Promise<unknown> | void {
  if (!key || preloadedKeys.has(key)) return;
  const loader = viewModuleLoaders[key];
  if (!loader) return;
  preloadedKeys.add(key);
  try {
    return loader().catch(() => {
      preloadedKeys.delete(key);
    });
  } catch {
    preloadedKeys.delete(key);
  }
}

const SECTION_LOADER_MAP: Record<string, ViewLoaderKey[]> = {
  approved: ['approved_menu', 'requisition', 'conveyance'],
  sales: ['builder', 'stored_bills', 'challan_menu', 'requisition'],
  collection: ['expense_directory'],
  itemList: ['item_directory', 'price_history'],
  stockReport: ['sales_report'],
  factory: ['item_directory'],
  customerDirectory: ['party_directory', 'customer_ledger'],
  salespersonDirectory: ['salesperson_directory'],
  expenseDirectory: ['expense_directory', 'conveyance'],
  report: ['report_dashboard', 'sales_report', 'sales_items'],
  trash: ['trash_bin'],
  settings: ['settings', 'shortcuts'],
};

export function preloadSectionModules(section: string): void {
  const keys = SECTION_LOADER_MAP[section];
  if (!keys) return;
  keys.forEach((k) => preloadViewModule(k));
}

export function preloadAllViewModules(): void {
  // Intentionally gentle: preload core interactive views only on explicit demand
  // instead of flooding initial boot with all 24 chunks simultaneously.
  const coreKeys: ViewLoaderKey[] = ['builder', 'stored_bills', 'item_directory', 'expense_directory'];
  coreKeys.forEach((k) => preloadViewModule(k));
}
