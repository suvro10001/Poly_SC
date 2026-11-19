import './utils/safeStorage';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ChallanProvider } from './context/ChallanContext';
import { installGlobalExcelPrintInterceptor } from './utils/excelPrintHelper';

installGlobalExcelPrintInterceptor();

if (typeof window !== 'undefined') {
  try {
    const origError = console.error;
    console.error = (...args: any[]) => {
      const text = args
        .map((a) => (typeof a === 'string' ? a : a?.message || (typeof a === 'object' ? JSON.stringify(a) : String(a || ''))))
        .join(' ');
      if (
        text.includes('resource-exhausted') ||
        text.includes('Quota limit exceeded') ||
        text.includes('maximum backoff delay') ||
        text.includes('Free daily write units per project') ||
        text.includes('QuotaExceededError') ||
        text.includes('exceeded the quota')
      ) {
        return;
      }
      origError.apply(console, args);
    };

    // Global resilience against QuotaExceededError on localStorage
    if (typeof Storage !== 'undefined' && Storage.prototype && Storage.prototype.setItem) {
      const origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        try {
          origSetItem.call(this, key, value);
        } catch (err: any) {
          if (
            err?.name === 'QuotaExceededError' ||
            err?.code === 22 ||
            err?.number === -2147024882 ||
            String(err?.message || '').includes('exceeded the quota')
          ) {
            console.warn(`[Storage Quota Protected] Failed to write key "${key}". Freeing expendable cache...`);
            try {
              const expendables = [
                'polycables_stored_bills_cache',
                'polycables_pdf_cache',
                'polycables_print_preview_cache',
                'polycables_temp_backup',
                'polycables_auto_draft'
              ];
              expendables.forEach((k) => {
                try { this.removeItem(k); } catch (_) {}
              });
              origSetItem.call(this, key, value);
            } catch (_) {
              // Silently handle quota limit without throwing uncaught exceptions to React
            }
          } else {
            throw err;
          }
        }
      };
    }

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      const msg = reason?.message || String(reason || '');
      if (
        reason?.code === 'resource-exhausted' ||
        reason?.name === 'QuotaExceededError' ||
        msg.includes('resource-exhausted') ||
        msg.includes('Quota limit exceeded') ||
        msg.includes('Free daily write units per project') ||
        msg.includes('QuotaExceededError') ||
        msg.includes('exceeded the quota')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });

    window.addEventListener('error', (event) => {
      const msg = event?.message || '';
      if (
        msg.includes('resource-exhausted') ||
        msg.includes('Quota limit exceeded') ||
        msg.includes('Free daily write units per project') ||
        msg.includes('QuotaExceededError') ||
        msg.includes('exceeded the quota')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });
  } catch {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChallanProvider>
      <App />
    </ChallanProvider>
  </StrictMode>,
);


