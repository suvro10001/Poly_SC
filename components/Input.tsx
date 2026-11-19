
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      <input 
        className={`px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium placeholder:text-slate-400 ${error ? 'border-red-500' : 'border-slate-200'}`}
        {...props}
      />
      {error && <span className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{error}</span>}
    </div>
  );
};
