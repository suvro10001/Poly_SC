import { useEffect, useRef } from 'react';

export function useAutoPrintOnOpen(
  isOpen: boolean,
  print: () => void,
  onAfterPrint?: () => void,
  autoPrint = true
): void {
  const printRef = useRef(print);
  const onAfterPrintRef = useRef(onAfterPrint);
  printRef.current = print;
  onAfterPrintRef.current = onAfterPrint;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleAfterPrint = () => onAfterPrintRef.current?.();
    window.addEventListener('afterprint', handleAfterPrint);
    const timeoutId = autoPrint ? window.setTimeout(() => printRef.current(), 150) : undefined;

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [isOpen, autoPrint]);
}
