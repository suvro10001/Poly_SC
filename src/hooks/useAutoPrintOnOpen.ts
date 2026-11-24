import { useEffect, useRef } from 'react';

export function useAutoPrintOnOpen(
  isOpen: boolean,
  print: () => void,
  onAfterPrint?: () => void
): void {
  const printRef = useRef(print);
  const onAfterPrintRef = useRef(onAfterPrint);
  printRef.current = print;
  onAfterPrintRef.current = onAfterPrint;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleAfterPrint = () => onAfterPrintRef.current?.();
    window.addEventListener('afterprint', handleAfterPrint);
    const timeoutId = window.setTimeout(() => printRef.current(), 150);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [isOpen]);
}
