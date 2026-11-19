import React from 'react';
import logoUrl from './logo.png';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <img 
      src={logoUrl} 
      alt="Poly Cables Logo" 
      className={className} 
      referrerPolicy="no-referrer"
    />
  );
};
