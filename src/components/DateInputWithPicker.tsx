import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';

interface DateInputWithPickerProps {
  value: string; // in dd.mm.yy format (or YYYY-MM-DD when valueFormat="iso")
  onChange: (val: string) => void;
  valueFormat?: 'ddmmyy' | 'iso';
  theme?: 'light' | 'dark';
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  disabled?: boolean;
  required?: boolean;
  title?: string;
  id?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export const DateInputWithPicker: React.FC<DateInputWithPickerProps> = ({
  value,
  onChange,
  valueFormat = 'ddmmyy',
  theme = 'light',
  placeholder = 'dd.mm.yy',
  className = '',
  inputClassName = '',
  buttonClassName = '',
  disabled = false,
  required = false,
  title = 'Pick Date (dd.mm.yy)',
  id,
  inputRef,
  onKeyDown
}) => {
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isoDraft, setIsoDraft] = useState<string>(() =>
    valueFormat === 'iso'
      ? (value ? formatDateDDMMYY(value) : '')
      : (value ? formatDateDDMMYY(value) || value : '')
  );

  useEffect(() => {
    if (!isFocused) {
      if (valueFormat === 'iso') {
        setIsoDraft(value ? formatDateDDMMYY(value) : '');
      } else {
        setIsoDraft(value ? formatDateDDMMYY(value) || value : '');
      }
    }
  }, [value, valueFormat, isFocused]);

  const handlePickerClick = () => {
    if (disabled) return;
    if (nativePickerRef.current && 'showPicker' in nativePickerRef.current) {
      try {
        (nativePickerRef.current as any).showPicker();
      } catch {
        nativePickerRef.current?.click();
      }
    } else {
      nativePickerRef.current?.click();
    }
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isoVal = e.target.value;
    if (isoVal) {
      const formatted = formatDateDDMMYY(isoVal);
      setIsoDraft(formatted);
      if (valueFormat === 'iso') {
        onChange(isoVal);
      } else {
        onChange(formatted);
      }
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setIsoDraft(nextVal);
    if (valueFormat === 'iso') {
      const trimmed = nextVal.trim();
      if (!trimmed) {
        onChange('');
        return;
      }
      const normalized = formatDateDDMMYY(trimmed);
      if (/^\d{2}\.\d{2}\.\d{2}$/.test(normalized)) {
        const parsedIso = parseDateToISO(normalized);
        if (/^\d{4}-\d{2}-\d{2}$/.test(parsedIso)) {
          onChange(parsedIso);
        }
      }
    } else {
      onChange(nextVal);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (valueFormat === 'iso') {
      const trimmed = isoDraft.trim();
      if (!trimmed) {
        if (value) onChange('');
        setIsoDraft('');
        return;
      }
      const normalized = formatDateDDMMYY(trimmed);
      const parsedIso = parseDateToISO(normalized);
      if (/^\d{4}-\d{2}-\d{2}$/.test(parsedIso)) {
        setIsoDraft(formatDateDDMMYY(parsedIso));
        if (parsedIso !== value) onChange(parsedIso);
      } else {
        setIsoDraft(value ? formatDateDDMMYY(value) : '');
      }
      return;
    }

    const trimmed = (isoDraft || value || '').trim();
    if (trimmed) {
      const formatted = formatDateDDMMYY(trimmed);
      if (formatted) {
        setIsoDraft(formatted);
        if (formatted !== value) {
          onChange(formatted);
        }
      }
    }
  };

  const displayValue = isFocused
    ? isoDraft
    : valueFormat === 'iso'
      ? (value ? formatDateDDMMYY(value) : isoDraft)
      : (value ? formatDateDDMMYY(value) || value : '');
  const isoValue = parseDateToISO(value || isoDraft);

  const defaultInputStyles =
    theme === 'dark'
      ? 'text-cyan-200 bg-[#061520] border-cyan-500/30 placeholder-slate-400 focus:ring-cyan-400 focus:border-cyan-400'
      : 'text-slate-900 bg-white border-slate-300 placeholder-slate-400 focus:ring-blue-500 focus:border-blue-500';

  const disabledStyles =
    theme === 'dark'
      ? 'bg-[#081b28]/60 text-slate-500 cursor-not-allowed'
      : 'bg-slate-100 text-slate-400 cursor-not-allowed';

  const defaultBtnStyles =
    theme === 'dark'
      ? 'text-cyan-300/80 hover:text-white hover:bg-cyan-500/15'
      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100';

  return (
    <div className={`relative inline-flex items-center ${className || 'w-full'}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={displayValue}
        onFocus={() => {
          setIsFocused(true);
          setIsoDraft(displayValue);
        }}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`w-full pr-8 pl-2.5 py-1.5 text-xs font-mono font-bold border rounded-lg focus:ring-1 focus:outline-none transition-all ${defaultInputStyles} ${inputClassName} ${
          disabled ? disabledStyles : ''
        }`}
      />
      <div className="absolute right-1 top-0 bottom-0 flex items-center justify-center">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={handlePickerClick}
          className={`p-1 rounded transition-colors cursor-pointer ${defaultBtnStyles} ${buttonClassName} ${
            disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''
          }`}
          title={title}
        >
          <Calendar className="w-3.5 h-3.5 pointer-events-none" />
        </button>
        <input
          ref={nativePickerRef}
          type="date"
          tabIndex={-1}
          value={isoValue}
          onChange={handleNativeChange}
          disabled={disabled}
          title={title}
          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
        />
      </div>
    </div>
  );
};

