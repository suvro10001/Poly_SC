
import React from 'react';
import { Button } from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-6 z-[200] backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md p-8 shadow-2xl rounded-none border-t-[8px] border-red-600">
        <h3 className="text-2xl font-black uppercase tracking-tighter mb-4 text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 font-bold uppercase mb-8 leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-4">
          <Button 
            type="button" 
            onClick={onCancel} 
            variant="outline" 
            className="rounded-none font-black text-xs px-8 uppercase border-slate-200"
          >
            {cancelText}
          </Button>
          <Button 
            type="button" 
            onClick={onConfirm} 
            variant={variant === 'danger' ? 'danger' : 'primary'}
            className="rounded-none font-black text-xs px-10 py-3 uppercase tracking-widest shadow-lg"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
