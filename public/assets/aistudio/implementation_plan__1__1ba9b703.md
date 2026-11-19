# Poly ERP System Comprehensive Upgrade & Cyber Teal Glassy Theme

An architectural blueprint and execution plan to transform Poly Cables ERP with the authentic Cyber Teal Glassy visual identity (matching `style.jpeg`), a 6-theme engine in Settings, 22-entity single & bulk backup/restore with instant feedback, two-tier Expense Approval in the Approved Hub, item conflict resolution and interactive Excel mapping, role and designation cleanup, sequential Back-stack navigation, and zero-latency menu performance.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during Phase 1 interactive interview and govern this implementation:
>
> - **Theme Palette**: The system will support **Cyber Teal (Active Default from `style.jpeg`)**, **Glassy Neon**, **Midnight Slate**, **Ocean Navy**, **Emerald Dark**, and **Classic Dark Slate**. A Theme Selector in Settings will persist user preference and dynamically restyle all menus, navigation, headers, tables, and modal cards.
> - **Item Mismatch Resolver**: When importing items from Excel, if an incoming item does not exact-match existing master items, a **Side-by-side mismatch dialog with search and item picker** will open, preventing duplicate or conflicted items.
> - **Sequential Back Navigation**: The global Back button will maintain a **Sequential history stack**, navigating back through previously visited views step-by-step and finally returning to the Dashboard. The Close (X) button directly jumps to the Dashboard.

---

## 1. Overview & Core Concept

- **What It Delivers**:
  1. **Cyber Teal Glassy Design System**: Implements the deep cyan-teal glassy dark aesthetic shown in the user's uploaded reference (`style.jpeg`), featuring frosted glass card surfaces, glowing cyan/pink/amber borders, pill tabs, and high-contrast metric displays.
  2. **Multi-Theme Engine in Settings**: Introduces 6 selectable themes (`cyber_teal`, `glassy_neon`, `midnight_slate`, `ocean_navy`, `emerald_dark`, `classic_dark_slate`) applied synchronously across all views via dynamic CSS variables and Tailwind theme bindings.
  3. **Comprehensive 22-Entity Backup & Restore**: Full JSON packaging and single-entity selective restore for all 22 requested data stores (Invoices, Challan, Requisition, Colour Exchange, Returns, Collection List, Cash In Hand, Cheque In Hand, Deposit History, Items, Special Item with auto price recalculation, Categories, Price Update History, Factory Import, Customers with Statement, Sales Reps, Sales Center List, Expenses, Conveyance, Banks, Accounts Name, Trashed). Features big green centered 1-second auto-closing success banners.
  4. **Universal 1-Second Centered Success Toast**: Instant, bold green centered modal alert after saving/updating bills, collections, deposits, and challans, automatically closing after 1000ms and transitioning to a fresh new entry mode.
  5. **Approved Hub Expense Workflow (`Approve Expense`)**: Adds a dedicated "Approve Expense" view under the "Approved" sidebar menu. Displays sales center-wise vouchers with a mandatory two-tier workflow: Showroom In-Charge approves first, followed by Regional/Accounts Admin final approval.
  6. **Item Master Safety & Excel Conflict Matcher**:
     - Allows deleting individual Price Update History records.
     - Protects against duplicate or misspelled item creation with fuzzy comparison.
     - View Items allows Excel upload, inline table editing, and side-by-side mismatch mapping on import.
  7. **Role & Designation Alignment**:
     - Removes "Marketing Representative" from roles.
     - Renames "Accountant" to "Accountant sales center".
     - Removes generic "Admin"; preserves "Admin (Regional)" and "Admin (Accounts)".
     - "Admin (Accounts)" has zero sales/collection targets, no showroom selection required during registration, and is excluded from marketing performance rankings.
     - "Super Admin" role creation is restricted strictly to the `suvroadmin` master account.
     - Fixes user list table to display the actual selected designation rather than mismatched role tags.
  8. **Zero-Latency Startup & Menu Transitions**: Eliminates all blocking computations, long interval loops, or synchronous blocking calls so that clicking any menu item switches views instantly with zero delay.
  9. **Approved History Delivery Color Boxes**: Ensures Approved History and Delivery requisition lines display color-wise coils breakdown with dedicated color input boxes matching Requisition entry.
  10. **Restyled Monthly Expense Page**: Overhauls Monthly Expense view into the Cyber Teal Glassy design with high-density tabular analytics.

---

## 2. User Experience & Visual Design

### A. Theme System Tokens & Glassy Aesthetic (Matching `style.jpeg`)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Poly ERP Cyber Teal Visual Hierarchy                                   │
├────────────────────────────────────────────────────────────────────────┤
│ • Canvas Background: #081620 to #0b1f2d with subtle cyan radial glow   │
│ • Glass Containers:  bg-[#0c2333]/85 backdrop-blur-md border-cyan-500/25│
│ • Accent Cards:                                                        │
│     - Top Marketing:    border-purple-400/60 shadow-[0_0_20px_#a855f726]│
│     - Top Sales Center: border-cyan-400/60 shadow-[0_0_20px_#06b6d426]  │
│     - Top Customer:     border-pink-500/60 shadow-[0_0_20px_#ec489926]  │
│ • Navigation Sidebar: bg-[#081824] border-r border-cyan-900/50         │
│ • Active Menu State:  bg-cyan-500/20 text-cyan-200 border-cyan-400/50  │
│ • Metric Figures:     font-mono tabular-nums text-cyan-300 font-bold   │
└────────────────────────────────────────────────────────────────────────┘
```

- **6 Theme Presets**:
  1. `cyber_teal`: Deep cyan canvas, cyan/purple/pink glass cards, glowing accents (Default matching image).
  2. `glassy_neon`: High-translucency frosted glass with neon emerald and magenta halos.
  3. `midnight_slate`: Charcoal `#0f172a` slate with subtle steel-blue borders.
  4. `ocean_navy`: Rich sapphire navy `#07152b` with crisp azure highlights.
  5. `emerald_dark`: Deep pine `#061a14` with vivid mint and gold accents.
  6. `classic_dark_slate`: Utilitarian neutral dark `#111827` with amber and emerald accents.

### B. Interactive Action & Success Feedback
- **Centered Giant Green Banner**:
  - Triggers on: Bill Save/Update, Collection MR Save, Collection-to-Deposit, Challan Save.
  - Display: Centered on screen, dark frosted backdrop, `text-2xl font-black text-emerald-300 bg-emerald-950/90 border-2 border-emerald-400 p-6 rounded-2xl shadow-[0_0_40px_rgba(52,211,153,0.4)]`.
  - Auto-closes in **1000ms** via `setTimeout` and immediately resets the view to fresh entry mode.

### C. Sequential Back & Close Navigation
- **History Stack**: Maintained in `App.tsx` as an array of visited view states `[{ tab, subTab, options }]`.
- **Back Button**: Pops the last entry from stack to restore the immediate predecessor view; reaches `dashboard` when stack is exhausted.
- **Close Button (X)**: Clears history and transitions straight to the main `dashboard`.

---

## 3. Key Product Decisions & Trade-Offs

### A. Two-Tier Expense Approval Architecture
- **Problem**: Showroom petty expenses must be validated by the local In-Charge before regional/accounts administration releases or posts them.
- **Solution**:
  - `ExpenseEntry` schema tracks `inChargeApproved` (boolean + approver + timestamp) and `adminApproved` (boolean + approver + timestamp).
  - Showroom In-Charge sees pending expenses for their assigned showroom and clicks "Verify & In-Charge Approve".
  - Admin (Regional / Accounts) views In-Charge verified vouchers and clicks "Final Admin Approve".
  - Clean status badge progression: `Pending In-Charge` $\to$ `In-Charge Approved` $\to$ `Admin Approved`.

### B. Item Master & Excel Mismatch Resolver
- **Problem**: Misspelled item names in Excel uploads create duplicate items and price confusion.
- **Solution**:
  - Pre-import parser normalizes item strings and scans existing items using Levenshtein distance and substring scoring.
  - If any row has $<100\%$ confidence match, opens the **Side-by-side mismatch dialog**:
    - Left column: Incoming Excel item name, quantity, unit.
    - Center/Right column: Suggested master items with quick "Map to Existing" search picker, or explicit "Create as New Master Item" button.
    - Prevents accidental duplicates and ensures historical price circular linkages hold.

### C. Comprehensive 22-Entity Backup/Restore Package
- **Packaging**: Standardized JSON envelope `polycables_backup_v2` storing all 22 collections.
- **Single vs. All Restore**:
  - Users can click "Restore Complete System" or select any of the 22 modules individually via modal checkboxes.
  - Special Items recalculate active circular prices immediately upon restore.
  - Trashed items and ledger records are restored with proper parent IDs.

---

## 4. Technical Architecture & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App.tsx (Root Controller)                       │
│  - Active Theme State: 'cyber_teal' | 'glassy_neon' | 'ocean_navy' ... │
│  - Navigation History Stack: ViewState[]                               │
│  - Centered Giant Green Success Modal Controller                       │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
      ┌─────────────┴─────────────┐    ┌─────────────┴─────────────┐
      ▼                           ▼    ▼                           ▼
┌──────────────┐          ┌──────────────┐ ┌───────────────┐ ┌───────────────┐
│ Navbar.tsx   │          │ Sidebar.tsx  │ │ MainMenu.tsx  │ │SettingsView.ts│
│ 1-Row Glass  │          │ Approved Hub │ │ Cyber Glass   │ │ Theme Engine  │
│ Top Control  │          │  ├ Requisit. │ │ Top Marketing │ │ 22-Entity B/R │
│ (No Copilot) │          │  ├ Conveyan. │ │ Top Sales Ctr │ │ Single Restore│
│              │          │  └ Exp. Appr.│ │ Top Party     │ │ 1s Toast      │
└──────────────┘          └──────────────┘ └───────────────┘ └───────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│ ExpenseManager   │    │ ItemManager.tsx  │    │ RequisitionPage.tsx│
│  - Quick Entry   │    │  - View/Upload   │    │  - Color boxes in  │
│  - Monthly Sheet │    │  - Mismatch Dial.│    │    Approved &      │
│  - Approve Hub   │    │  - Delete Hist.  │    │    Delivery        │
└──────────────────┘    └──────────────────┘    └────────────────────┘
```

---

## 5. Execution Steps

1. **Theme Engine & Global Styles (`src/index.css`, `src/types.ts`)**:
   - Define CSS root variables and utility classes for `cyber_teal`, `glassy_neon`, `midnight_slate`, `ocean_navy`, `emerald_dark`, and `classic_dark_slate`.
   - Wire theme persistence in `localStorage` (`polycables_active_theme`).
2. **Navigation Bar, Sidebar & Back-Stack (`src/App.tsx`, `Sidebar.tsx`, `Navbar.tsx`)**:
   - Implement `pushNavHistory` / `popNavHistory` for continuous back navigation.
   - Restyle Sidebar and Navbar into the Cyber Teal glass theme.
   - Add `expense_approved` under the Approved sidebar section.
   - Verify complete absence of any copilot references.
3. **Dashboard Restyling (`src/components/MainMenuPage.tsx`)**:
   - Apply the three glowing cards (Top Marketing, Top Sales Center, Top Party) and KPI metrics to mirror `style.jpeg`.
4. **Approved Hub: Expense Approval (`src/components/ExpenseManager.tsx`)**:
   - Build the "Approve Expense" component supporting showroom filtering and In-Charge $\to$ Admin two-step approvals.
   - Restyle Monthly Expense into high-density cyber-glass analytics.
5. **Item Directory & Mismatch Dialog (`src/components/ItemManager.tsx`, `ItemPriceUpdateModal.tsx`)**:
   - Add delete handler for individual Price Update History records.
   - Implement Excel upload with side-by-side mismatch mapping dialog before committing new records.
6. **22-Entity Backup & Restore Engine (`src/components/SettingsView.tsx`, `autoBackupManager.ts`)**:
   - Expand `BackupDataPackage` to include all 22 required entities.
   - Add Single Restore and Full Restore with the 1-second auto-closing success modal.
7. **User Roles, Designations & Accounts Admin Rules (`src/components/LoginPage.tsx`, `SalespersonDirectory.tsx`)**:
   - Remove "Marketing Representative", rename "Accountant sales center", and remove generic "Admin".
   - Restrict Super Admin creation to `suvroadmin`.
   - Disable target assignments and showroom requirements for "Admin (Accounts)".
8. **Delivery Color Boxes in Requisition (`src/components/RequisitionPage.tsx`)**:
   - Render color-wise editable delivery boxes matching Requisition entry.
9. **Universal 1-Second Centered Success Toast (`src/App.tsx`, `BillGenerator.tsx`, etc.)**:
   - Standardize instant feedback modal and auto-reset to new entry mode.
10. **Build & Lint Verification**:
    - Execute `compile_applet` and `lint_applet` simultaneously to ensure zero regressions.
