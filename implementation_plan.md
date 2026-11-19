# Price Circular, Active Rate Invoicing & System Database Records Enhancement

Deliver targeted enhancements to ensure imported items and circulars persist across refreshes, enable full editing, export, and Excel import directly within the circular View Mode with strict `DD.MM.YY` date formatting, guarantee that new bills instantly apply the active price circular rates while preserving past bills, prevent remote sync from reverting restored or imported data, and add sales center inspection to the System Database Records (Live Snapshot).

> [!IMPORTANT]
> **User Confirmed Decisions (Phase 1 Clarifications):**
> 1. **Price List View Mode Excel Import**: Update existing items and add new items with an interactive preview before applying.
> 2. **Active Price Circular Bill Generation**: Past bills remain locked at their historical saved rates; all newly created bills and new item entries instantly adopt the active circular rates.
> 3. **System Database Records (Live Snapshot)**: Display total sales center count, along with sales center code, assigned showroom in-charge, and district details.

---

## 1. Overview & Core Concept

- **What It Does**:
  - **Price Circular & Item Import Persistence**: Imported circulars and items are reliably saved in local storage, IndexedDB, and synchronized directly to Firebase Cloud storage with `priceSnapshots` tracking, preventing remote sync from discarding them.
  - **Circular View Mode (Edit, Download & Excel Import)**: When viewing a price circular list, users can edit rates inline, export the circular as an Excel file, or import an Excel file directly to update and append items with `DD.MM.YY` formatted effective dates.
  - **Instant Active Rate Application for New Bills**: Selecting or changing the active circular immediately updates the active pricing for newly generated invoices without recalculating or altering archived historical invoices.
  - **Persistent Restores & Imports**: Solidifies the synchronization layer so single-module restores, full package restores, and Excel imports immediately update local modification timestamps and cloud state, preventing remote snapshot overwrite.
  - **Sales Center in System Database Records**: Extends the "System Database Records (Live Snapshot)" and Single Module Backup in Settings to include sales centers with an expandable inspector showing code, showroom in-charge, and district details.

- **Target Audience**: Branch managers, accountants, and super administrators managing price revisions, bill generation, and system backups.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Circular View Mode (View, Edit, Export & Excel Import)**:
     - User clicks **View** on any circular in Price Update History.
     - Modal opens displaying the circular header, effective date in `DD.MM.YY` format, and items table.
     - Top action bar includes:
       - **Edit Rates**: Toggles inline numeric inputs for rates with a prominent green **Save Price Changes** button.
       - **Export Excel**: Generates and downloads an Excel spreadsheet of all items in this circular.
       - **Import from Excel**: Opens an import dialog allowing users to upload `.xlsx`/`.xls` files, previews matched and new items, and applies them to this circular and master catalog with one click.
  2. **Active Circular Rate Enforcement in Billing**:
     - When an admin activates a price circular in Price Update History, a custom notification appears and the active catalog rates update immediately.
     - Opening the Invoice / Bill entry screen automatically defaults to the active circular's rates for all new items and pasted lines.
     - Previously stored bills retain their archived rates and totals.
  3. **Restore & Import Retention Guarantee**:
     - Restoring any module (or full backup) registers restored IDs in the active grace cache and syncs immediately to Firestore, ensuring subsequent remote database snapshots preserve the restored data.
  4. **System Database Records (Live Snapshot)**:
     - In **Settings Directory > System Database Records (Live Snapshot)**, a new tile displays `• Sales Centers: [Count]`.
     - Clicking on the tile or viewing details presents a structured modal displaying each sales center's Name, Code, Showroom In-Charge, District, and Status.
     - Under **Single Module Backup**, a `• Sales Centers ([Count])` button is added for 1-click JSON/Excel export.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Excel Import inside Circular View Mode**:
  - *Chosen Approach*: Update existing items matching by code or name and add any new items into the circular, showing a preview modal before committing.
  - *Why*: Prevents accidental loss of existing items while making additions and revisions frictionless.
- **Decision 2: Active Rate Application**:
  - *Chosen Approach*: New bills and newly added items strictly use the active circular rates (or date-matched rates for backdated bills), while existing saved bills remain locked at their stored rates.
  - *Why*: Preserves financial audit integrity for completed transactions while ensuring future billing immediately reflects revised prices.
- **Decision 3: Cloud Sync Anti-Reversion Guard**:
  - *Chosen Approach*: Register all restored/imported IDs in `recentlyCreatedLocalIdsRef`, update `localSliceModifiedAtRef`, pass `_isRestore: true` and the updated slices (`items`, `priceSnapshots`, `branches`, etc.) directly to `scheduleCloudSync`, and ignore stale incoming snapshots within the grace window.
  - *Why*: Eliminates race conditions where an incoming Firestore snapshot overwrites freshly restored or imported local data.

---

## 4. Technical Architecture & Component Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            App.tsx State Hub                                │
│   - items, branches, storedBills, priceSnapshots                           │
│   - scheduleCloudSync(slice, immediate)                                    │
│   - applyIncomingRemoteData (guarded against overwriting fresh restores)    │
└──────────────┬──────────────────────────────┬───────────────────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌────────────────────────────────────────────┐
│   PriceHistoryManager.tsx    │ │           SettingsView.tsx                 │
│  - Active circular tracking  │ │  - System Database Records Live Snapshot   │
│  - ActiveCircularModal:      │ │    (Added Sales Center tile & details)     │
│    * Edit Rates Inline       │ │  - Single Module Backup (Sales Centers)    │
│    * Export to Excel         │ │  - Single Module Restore (Branches/Items)  │
│    * Import from Excel       │ └────────────────────────────────────────────┘
│  - syncs priceSnapshots      │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│     BillInvoiceView.tsx      │
│  - New bills & item pickers  │
│    adopt active circular     │
│  - Stored bills remain safe  │
└──────────────────────────────┘
```

- **Entities & Slices Affected**:
  - `PriceHistoryManager.tsx`: Circular view modal actions (inline edit, download Excel, upload Excel with `DD.MM.YY` date format), syncing `priceSnapshots` to cloud.
  - `PriceExcelImportModal.tsx`: Include `priceSnapshots` in `onSyncCloud` payload and register item IDs in fresh cache.
  - `BillInvoiceView.tsx`: Verify active circular rates are referenced on new bill creation and item selection.
  - `SettingsView.tsx`: Add Sales Center row to System Database Records grid, add modal view for sales center details, and add Single Module Backup for sales centers.
  - `App.tsx`: Include `priceSnapshots` in restore data package and ensure cloud snapshot listeners respect restore timestamps.
