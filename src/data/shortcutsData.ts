export interface ShortcutItem {
  id: string;
  category: 'Tabs & Navigation' | 'Billing & Invoicing' | 'Directories & Reports' | 'Financial & Collections' | 'System & Utilities';
  keys: string[];
  macKeys?: string[];
  description: string;
  badge?: string;
}

export const KEYBOARD_SHORTCUTS: ShortcutItem[] = [
  // Tabs & Navigation
  {
    id: 'ctrl-click-menu',
    category: 'Tabs & Navigation',
    keys: ['Ctrl', 'Click Menu'],
    macKeys: ['⌘ Cmd', 'Click Menu'],
    description: 'Open in new tab',
    badge: 'Crucial'
  },
  {
    id: 'new-tab',
    category: 'Tabs & Navigation',
    keys: ['Alt', 'T'],
    macKeys: ['⌥ Option', 'T'],
    description: 'Open new blank tab',
    badge: 'Popular'
  },
  {
    id: 'close-tab',
    category: 'Tabs & Navigation',
    keys: ['Alt', 'W'],
    macKeys: ['⌥ Option', 'W'],
    description: 'Close current active tab'
  },
  {
    id: 'prev-tab',
    category: 'Tabs & Navigation',
    keys: ['Alt', '['],
    macKeys: ['⌥ Option', '['],
    description: 'Switch to previous tab'
  },
  {
    id: 'next-tab',
    category: 'Tabs & Navigation',
    keys: ['Alt', ']'],
    macKeys: ['⌥ Option', ']'],
    description: 'Switch to next tab'
  },
  {
    id: 'nav-dashboard',
    category: 'Tabs & Navigation',
    keys: ['Alt', '1'],
    macKeys: ['⌥ Option', '1'],
    description: 'Go to Executive Dashboard'
  },
  {
    id: 'nav-invoicer',
    category: 'Tabs & Navigation',
    keys: ['Alt', '2'],
    macKeys: ['⌥ Option', '2'],
    description: 'Go to Bill Invoicer'
  },
  {
    id: 'nav-challan',
    category: 'Tabs & Navigation',
    keys: ['Alt', '3'],
    macKeys: ['⌥ Option', '3'],
    description: 'Go to Delivery Challan'
  },
  {
    id: 'nav-items',
    category: 'Tabs & Navigation',
    keys: ['Alt', '4'],
    macKeys: ['⌥ Option', '4'],
    description: 'Go to Master Item Directory'
  },
  {
    id: 'nav-parties',
    category: 'Tabs & Navigation',
    keys: ['Alt', '5'],
    macKeys: ['⌥ Option', '5'],
    description: 'Go to Customer Directory'
  },
  {
    id: 'nav-stored-bills',
    category: 'Tabs & Navigation',
    keys: ['Alt', '6'],
    macKeys: ['⌥ Option', '6'],
    description: 'Go to Stored Bills'
  },
  {
    id: 'nav-stock-report',
    category: 'Tabs & Navigation',
    keys: ['Alt', '7'],
    macKeys: ['⌥ Option', '7'],
    description: 'Go to Sales & Stock Report'
  },
  {
    id: 'nav-customer-ledger',
    category: 'Tabs & Navigation',
    keys: ['Alt', '8'],
    macKeys: ['⌥ Option', '8'],
    description: 'Go to Customer Ledger'
  },
  {
    id: 'nav-settings',
    category: 'Tabs & Navigation',
    keys: ['Alt', '9'],
    macKeys: ['⌥ Option', '9'],
    description: 'Go to System Settings'
  },

  // Billing & Invoicing
  {
    id: 'printer-auto-config',
    category: 'Billing & Invoicing',
    keys: ['Alt', 'A'],
    macKeys: ['⌥ Option', 'A'],
    description: 'Auto-Configure Printer'
  },
  {
    id: 'new-bill',
    category: 'Billing & Invoicing',
    keys: ['Alt', 'N'],
    macKeys: ['⌥ Option', 'N'],
    description: 'Create new blank bill',
    badge: 'Alt+N'
  },
  {
    id: 'save-bill',
    category: 'Billing & Invoicing',
    keys: ['Ctrl', 'S'],
    macKeys: ['⌘ Cmd', 'S'],
    description: 'Save active bill',
    badge: 'Ctrl+S'
  },
  {
    id: 'print-invoice',
    category: 'Billing & Invoicing',
    keys: ['Ctrl', 'P'],
    macKeys: ['⌘ Cmd', 'P'],
    description: 'Print Invoice / Pad'
  },
  {
    id: 'email-invoice',
    category: 'Billing & Invoicing',
    keys: ['Alt', 'E'],
    macKeys: ['⌥ Option', 'E'],
    description: 'Send invoice email'
  },
  {
    id: 'cancel-bill',
    category: 'Billing & Invoicing',
    keys: ['Alt', 'C'],
    macKeys: ['⌥ Option', 'C'],
    description: 'Reset / Clear bill form'
  },

  // Financial & Collections
  {
    id: 'quick-expense',
    category: 'Financial & Collections',
    keys: ['Alt', 'E'],
    macKeys: ['⌥ Option', 'E'],
    description: 'Quick Expense Entry'
  },
  {
    id: 'quick-collection',
    category: 'Financial & Collections',
    keys: ['Alt', 'C'],
    macKeys: ['⌥ Option', 'C'],
    description: 'Quick Money Receipt'
  },
  {
    id: 'cash-in-hand',
    category: 'Financial & Collections',
    keys: ['Alt', '0'],
    macKeys: ['⌥ Option', '0'],
    description: 'View Cash in Hand'
  },

  // System & Utilities
  {
    id: 'show-shortcuts',
    category: 'System & Utilities',
    keys: ['Shift', '?'],
    macKeys: ['Shift', '?'],
    description: 'Open Shortcuts guide'
  },
  {
    id: 'f1-help',
    category: 'System & Utilities',
    keys: ['F1'],
    macKeys: ['F1'],
    description: 'Quick Help'
  },
  {
    id: 'escape-modal',
    category: 'System & Utilities',
    keys: ['Esc'],
    macKeys: ['Esc'],
    description: 'Close popup or cancel'
  }
];
