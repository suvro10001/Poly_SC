import { useEffect, useRef } from 'react';

export function useAutoPrintOnOpen(
  isOpen: boolean,
  print: () => void,
  autoPrint = true
): void {
  const printRef = useRef(print);
  printRef.current = print;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    let printDialogOpen = false;
    let ignoreEscapeUntil = 0;
    const handleBeforePrint = () => {
      printDialogOpen = true;
    };
    const handleAfterPrint = () => {
      printDialogOpen = false;
      ignoreEscapeUntil = Date.now() + 1000;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!printDialogOpen && Date.now() >= ignoreEscapeUntil)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    window.addEventListener('keydown', handleKeyDown, true);
    const timeoutId = autoPrint ? window.setTimeout(() => printRef.current(), 150) : undefined;

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, autoPrint]);
}
