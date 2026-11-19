import React from 'react';
import { AuthUser, BranchLocation, CompanyDetails, Item } from '../types';
import { PriceHistoryManager } from './PriceHistoryManager';

export interface PriceUpdateHistoryPageProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  onOpenBulkUpdateModal?: () => void;
  company?: CompanyDetails;
  branches?: BranchLocation[];
  currentUser?: AuthUser | null;
  onBack?: () => void;
  onClose?: () => void;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
}

export const PriceUpdateHistoryPage: React.FC<PriceUpdateHistoryPageProps> = ({
  items,
  setItems,
  onOpenBulkUpdateModal,
  company,
  branches,
  onBack,
  onClose,
  onSyncCloud
}) => {
  return (
    <PriceHistoryManager
      items={items}
      setItems={setItems}
      onOpenBulkUpdateModal={onOpenBulkUpdateModal}
      company={company}
      branches={branches}
      onBack={onBack}
      onClose={onClose}
      onSyncCloud={onSyncCloud}
    />
  );
};

export default PriceUpdateHistoryPage;
