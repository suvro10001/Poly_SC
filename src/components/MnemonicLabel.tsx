import React from 'react';

interface MnemonicLabelProps {
  label: string;
  mnemonic?: string;
  className?: string;
  underlineClassName?: string;
  showHotkeyBadge?: boolean;
  hotkeyPrefix?: string;
}

/**
 * MnemonicLabel
 * Formats a menu item label with an underlined accelerator hotkey letter
 * Example: MnemonicLabel label="Create New Bill" mnemonic="N" -> "Create <u>N</u>ew Bill"
 */
export const MnemonicLabel: React.FC<MnemonicLabelProps> = ({
  label,
  mnemonic,
  className = '',
  underlineClassName = 'underline decoration-amber-400 decoration-2 font-black underline-offset-2 text-amber-300 group-hover:text-amber-200',
  showHotkeyBadge = false,
  hotkeyPrefix = 'Alt+'
}) => {
  if (!mnemonic || mnemonic.length === 0) {
    return <span className={className}>{label}</span>;
  }

  const charToFind = mnemonic[0].toLowerCase();
  const lowerLabel = label.toLowerCase();
  const index = lowerLabel.indexOf(charToFind);

  if (index === -1) {
    return (
      <span className={`inline-flex items-center space-x-1 ${className}`}>
        <span>{label}</span>
        {showHotkeyBadge && (
          <span className="text-[9px] font-mono font-bold text-amber-400 bg-slate-800 px-1 py-0.2 rounded border border-slate-700 ml-1">
            {hotkeyPrefix}{mnemonic.toUpperCase()}
          </span>
        )}
      </span>
    );
  }

  const before = label.slice(0, index);
  const matchedChar = label.slice(index, index + 1);
  const after = label.slice(index + 1);

  return (
    <span className={`inline-flex items-center ${className}`}>
      <span>
        {before}
        <span className={underlineClassName} title={`Shortcut: ${hotkeyPrefix}${mnemonic.toUpperCase()}`}>
          {matchedChar}
        </span>
        {after}
      </span>
      {showHotkeyBadge && (
        <span className="text-[9px] font-mono font-bold text-amber-400/90 bg-slate-950/80 px-1 py-0.2 rounded border border-amber-500/30 ml-1.5 shrink-0">
          {hotkeyPrefix}{mnemonic.toUpperCase()}
        </span>
      )}
    </span>
  );
};
