import React, { useState, useEffect, useMemo } from 'react';
import { 
  Mail, Send, X, CheckCircle2, AlertCircle, Loader2, Users, User, Plus, Trash2, 
  FileText, Copy, Check, Sparkles, RefreshCw, Unlink, Calendar, Settings2, Sliders,
  ChevronDown, ChevronUp, Eye, MessageSquare, Phone, Smartphone
} from 'lucide-react';
import { Party, Salesperson, BillHeader, BillLineItem, CompanyDetails, StoredBill } from '../types';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { cleanBranchName } from '../utils/branchAccess';

const DEFAULT_FIXED_WHATSAPP = '+8801713434290';

export interface MultiPartyEntry {
  id?: string;
  partyName: string;
  location: string;
  amount: number | string;
  phone?: string;
  billNo?: string;
}

export interface QuickPickupContact {
  id: string;
  label: string;
  email: string;
  category?: 'Head Office' | 'Factory' | 'Accounts' | 'Sales' | 'Management' | 'Custom';
  isDefault?: boolean;
}

export interface EmailSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  defaultRecipient?: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  defaultBody?: string;
  htmlBody?: string;
  defaultHtmlBody?: string;
  parties?: Party[];
  salespersons?: Salesperson[];
  company?: CompanyDetails;
  companyName?: string;
  salesCenterName?: string;
  branchName?: string;
  attachmentName?: string;
  attachmentFileName?: string;
  attachmentData?: string; // base64 string
  attachmentBase64?: string;
  // Optional document attachments / contexts
  billData?: {
    header: BillHeader;
    lines: BillLineItem[];
    grandTotal: number;
    subtotal: number;
    discountAmount: number;
    inWords: string;
  };
  storedBill?: StoredBill;
  storedBills?: StoredBill[];
  initialMultiParties?: MultiPartyEntry[];
  initialIsDualParty?: boolean;
  documentType?: 'invoice' | 'ledger' | 'report' | 'challan' | 'custom' | 'requisition';
  defaultPhone?: string;
  defaultRecipientPhone?: string;
  onEmailSentSuccess?: (result: { messageId: string; recipient: string; sentAt: string }) => void;
}

export const EmailSenderModal: React.FC<EmailSenderModalProps> = ({
  isOpen,
  onClose,
  title = 'Send Email Directly From Browser',
  defaultRecipient = '',
  defaultTo = '',
  defaultSubject = '',
  defaultMessage = '',
  defaultBody = '',
  htmlBody: propHtmlBody = '',
  defaultHtmlBody = '',
  parties: propParties = [],
  salespersons: propSalespersons = [],
  company,
  companyName,
  salesCenterName,
  branchName,
  attachmentName: propAttachmentName = '',
  attachmentFileName = '',
  attachmentData: propAttachmentData = '',
  attachmentBase64 = '',
  billData,
  storedBill,
  storedBills = [],
  initialMultiParties,
  initialIsDualParty = false,
  documentType = 'invoice',
  defaultPhone = '',
  defaultRecipientPhone: propDefaultRecipientPhone = '',
  onEmailSentSuccess
}) => {
  const initialRecipient = defaultRecipient || defaultTo || 'pcildomestic@gmail.com';
  const initialSubject = defaultSubject || '';
  const initialMessage = defaultMessage || defaultBody || '';
  const initialAttachmentName = propAttachmentName || attachmentFileName || '';
  const initialAttachmentData = propAttachmentData || attachmentBase64 || '';
  const initialHtmlBody = propHtmlBody || defaultHtmlBody || '';
  const defaultRecipientPhone = propDefaultRecipientPhone || defaultPhone || '';

  const targetBillHeader = billData?.header || storedBill?.header;

  // Load parties from storage if props empty
  const [partiesList, setPartiesList] = useState<Party[]>(() => {
    if (propParties && propParties.length > 0) return propParties;
    try {
      const saved = localStorage.getItem('polycables_parties');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const activeSalesCenter = useMemo(() => {
    // 1. Party-wise sales center: resolve destination branch from the party's own registered branch / sales center
    const targetPartyName = (targetBillHeader?.partyName || '').trim().toLowerCase();
    if (targetPartyName) {
      const matchedParty = (partiesList || []).find(
        (p) => (p.name || '').trim().toLowerCase() === targetPartyName
      );
      const partyCenter = matchedParty?.branchName || (matchedParty as any)?.salesCenter || (matchedParty as any)?.branch;
      if (partyCenter && String(partyCenter).trim()) {
        return cleanBranchName(String(partyCenter).trim());
      }
    }

    let resolved = targetBillHeader?.branchName || salesCenterName || branchName || company?.branchName;
    if (!resolved) {
      try {
        const curUserRaw = localStorage.getItem('app_current_user');
        if (curUserRaw) {
          const u = JSON.parse(curUserRaw);
          if (u?.branchName && u.branchName !== 'All Sales Centers' && u.branchName !== 'all') {
            resolved = u.branchName;
          }
        }
      } catch {}
    }
    return cleanBranchName(resolved || 'Madhupur Sales Center');
  }, [salesCenterName, branchName, targetBillHeader, company, partiesList]);

  // Load salespersons from storage if props empty
  const [salespersonsList, setSalespersonsList] = useState<Salesperson[]>(() => {
    if (propSalespersons && propSalespersons.length > 0) return propSalespersons;
    try {
      const saved = localStorage.getItem('polycables_salespersons');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Dual / Multi Party State
  const [isDualPartyMode, setIsDualPartyMode] = useState<boolean>(() => {
    if (initialIsDualParty) return true;
    if (storedBills && storedBills.length > 1) return true;
    if (initialMultiParties && initialMultiParties.length > 1) return true;
    return false;
  });

  // Today's formatted date string e.g. 02.07.26
  const getTodayFormatted = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const [dualDateStr, setDualDateStr] = useState<string>(() => {
    const rawDate = storedBill?.header?.date || billData?.header?.date;
    if (rawDate) {
      return formatDateDDMMYY(rawDate) || getTodayFormatted();
    }
    return getTodayFormatted();
  });

  const [marketingPerson, setMarketingPerson] = useState<string>(() => {
    const spName = storedBill?.header?.salesmanName || billData?.header?.salesmanName;
    if (spName && spName.trim() !== '') return spName.trim();
    if (salespersonsList.length > 0 && salespersonsList[0].name) {
      return salespersonsList[0].name;
    }
    return 'Marketing Person';
  });

  // Initial Multi-parties builder
  const [multiParties, setMultiParties] = useState<MultiPartyEntry[]>(() => {
    if (initialMultiParties && initialMultiParties.length > 0) {
      return initialMultiParties;
    }
    if (storedBills && storedBills.length > 0) {
      return storedBills.map((b) => ({
        id: b.id,
        partyName: b.header.partyName || 'Customer',
        location: b.header.address || '',
        amount: b.grandTotal || 0,
        phone: b.header.phone || '',
        billNo: b.header.billNo
      }));
    }

    const firstPartyName = storedBill?.header?.partyName || billData?.header?.partyName || 'M/s Alif Enterprise';
    const firstLocation = storedBill?.header?.address || billData?.header?.address || 'Dhanbri';
    const firstAmount = storedBill?.grandTotal || billData?.grandTotal || 20000;

    return [
      {
        id: 'p1',
        partyName: firstPartyName,
        location: firstLocation,
        amount: firstAmount,
        phone: storedBill?.header?.phone || billData?.header?.phone || '',
        billNo: storedBill?.header?.billNo || billData?.header?.billNo
      },
      {
        id: 'p2',
        partyName: 'Lucky Enterprise Electric & Hardwa',
        location: 'Madhupur',
        amount: 25000,
        phone: '',
        billNo: ''
      }
    ];
  });

  const [autoPairedPartnerName, setAutoPairedPartnerName] = useState<string | null>(null);

  // Helper function to format amount with comma and /-
  const formatAmountWithSlash = (amt: number | string): string => {
    const num = typeof amt === 'number' ? amt : parseFloat(String(amt).replace(/,/g, '')) || 0;
    return `${num.toLocaleString('en-IN')}/-`;
  };

  // Build Dual Party Subject: e.g. 02.07.26-PBL(P.E)- 20,000/- (Marketing Person)
  const generateDualPartySubject = (
    dateStr: string,
    parties: MultiPartyEntry[],
    marketer: string
  ) => {
    const primaryAmount = parties[0]?.amount !== undefined ? parties[0].amount : 0;
    const formattedAmt = formatAmountWithSlash(primaryAmount);
    const marketerLabel = (marketer || '').trim() || 'Marketing Person';
    return `${dateStr}-PBL(P.E)- ${formattedAmt} (${marketerLabel})`;
  };

  // Build Dual Party Body:
  // 1. M/s Alif Enterprise, Dhanbri - 20,000/-
  // 2. Lucky Enterprise Electric & Hardwa, Madhupur - 25,000/-
  const generateDualPartyBody = (parties: MultiPartyEntry[]) => {
    return parties
      .filter((p) => (p.partyName || '').trim() !== '')
      .map((p, idx) => {
        const pClean = (p.partyName || '').trim();
        const matched = (partiesList || []).find(
          (item) => (item.name || '').trim().toLowerCase() === pClean.toLowerCase()
        );
        const partyCenter = matched?.branchName || (matched as any)?.salesCenter || (matched as any)?.branch || (p.location ? p.location : activeSalesCenter);
        const locPart = p.location && (p.location || '').trim() !== '' ? `, ${(p.location || '').trim()}` : '';
        const destinationPart = partyCenter ? ` (Destination: ${cleanBranchName(partyCenter)})` : '';
        const amtPart = formatAmountWithSlash(p.amount);
        return `${idx + 1}. ${pClean}${locPart}${destinationPart} - ${amtPart}`;
      })
      .join('\n');
  };

  // Form State - Multiple Recipient Support
  const parseInitialRecipients = (raw?: string): string[] => {
    if (!raw) return [];
    const parts = raw.split(/[,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    return parts;
  };

  const [recipientList, setRecipientList] = useState<string[]>(() => parseInitialRecipients(initialRecipient));
  const [recipientInput, setRecipientInput] = useState('');
  const recipient = recipientList.join(', ');
  const setRecipient = (val: string) => {
    const parts = parseInitialRecipients(val);
    setRecipientList(parts);
  };

  // Helper to automatically store any entered email into Quick Pickup Directory
  const saveEmailToQuickPickupDirectory = (emailStr: string, customLabel?: string) => {
    const clean = emailStr.trim().toLowerCase();
    if (!clean || !clean.includes('@')) return;

    setSavedRecipients((prev) => {
      const exists = prev.some((r) => r.email.toLowerCase() === clean);
      if (exists) return prev;

      const rawName = clean.split('@')[0].replace(/[._-]/g, ' ');
      const autoLabel =
        customLabel?.trim() ||
        rawName
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

      const newEntry: QuickPickupContact = {
        id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        label: autoLabel || clean,
        email: clean,
        category: 'Custom',
        isDefault: prev.length === 0
      };
      const updated = [...prev, newEntry];
      try {
        localStorage.setItem('polycables_saved_recipients', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleAddRecipientEmail = (emailToAdd?: string) => {
    const raw = (emailToAdd !== undefined ? emailToAdd : recipientInput).trim();
    if (!raw) return;
    const emails = raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => s && s.includes('@'));
    if (emails.length === 0) return;

    setRecipientList((prev) => {
      const next = [...prev];
      emails.forEach((em) => {
        if (!next.includes(em)) next.push(em);
        // Automatically store every entered email into quick pickup directory
        saveEmailToQuickPickupDirectory(em);
      });
      return next;
    });
    if (emailToAdd === undefined) {
      setRecipientInput('');
    }
  };

  const handleRemoveRecipientEmail = (emailToRemove: string) => {
    setRecipientList((prev) => prev.filter((em) => em !== emailToRemove));
  };
  const [cc, setCc] = useState('');

  // Saved Recipients Directory State (Starts Clean, persists any user entered mail)
  const [savedRecipients, setSavedRecipients] = useState<QuickPickupContact[]>(() => {
    try {
      const local = localStorage.getItem('polycables_saved_recipients');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out legacy default IDs so directory starts clean based on user entered mails
          const filtered = parsed.filter(
            (p) => !['rec-1', 'rec-2', 'rec-3', 'rec-4', 'rec-5', 'rec-6', 'rec-7'].includes(p.id)
          );
          return filtered;
        }
      }
    } catch (e) {}
    return [];
  });

  const [showQuickPickupSettings, setShowQuickPickupSettings] = useState(false);
  const [isAddingRecipient, setIsAddingRecipient] = useState(false);
  const [editingPickupId, setEditingPickupId] = useState<string | null>(null);
  const [newRecipientLabel, setNewRecipientLabel] = useState('');
  const [newRecipientEmail, setNewRecipientEmail] = useState('');
  const [newRecipientCategory, setNewRecipientCategory] = useState<'Head Office' | 'Factory' | 'Accounts' | 'Sales' | 'Management' | 'Custom'>('Head Office');
  const [newRecipientIsDefault, setNewRecipientIsDefault] = useState(false);
  const [quickPickupFilter, setQuickPickupFilter] = useState<string>('All');

  const handleSaveNewRecipient = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newRecipientEmail.trim()) return;
    
    if (editingPickupId) {
      // Edit existing
      const updated = savedRecipients.map((r) => {
        if (r.id === editingPickupId) {
          return {
            ...r,
            label: newRecipientLabel.trim() || newRecipientEmail.trim().split('@')[0],
            email: newRecipientEmail.trim().toLowerCase(),
            category: newRecipientCategory,
            isDefault: newRecipientIsDefault
          };
        }
        return newRecipientIsDefault ? { ...r, isDefault: false } : r;
      });
      setSavedRecipients(updated);
      try {
        localStorage.setItem('polycables_saved_recipients', JSON.stringify(updated));
      } catch (err) {}
      setEditingPickupId(null);
    } else {
      // Create new
      const newEntry: QuickPickupContact = {
        id: `rec_${Date.now()}`,
        label: newRecipientLabel.trim() || newRecipientEmail.trim().split('@')[0],
        email: newRecipientEmail.trim().toLowerCase(),
        category: newRecipientCategory,
        isDefault: newRecipientIsDefault
      };
      const updated = newRecipientIsDefault 
        ? [...savedRecipients.map((r) => ({ ...r, isDefault: false })), newEntry]
        : [...savedRecipients, newEntry];
      setSavedRecipients(updated);
      try {
        localStorage.setItem('polycables_saved_recipients', JSON.stringify(updated));
      } catch (err) {}
      setRecipient(newEntry.email);
    }

    setNewRecipientLabel('');
    setNewRecipientEmail('');
    setNewRecipientCategory('Head Office');
    setNewRecipientIsDefault(false);
    setIsAddingRecipient(false);
  };

  const handleStartEditPickup = (contact: QuickPickupContact) => {
    setEditingPickupId(contact.id);
    setNewRecipientLabel(contact.label);
    setNewRecipientEmail(contact.email);
    setNewRecipientCategory(contact.category || 'Head Office');
    setNewRecipientIsDefault(Boolean(contact.isDefault));
    setIsAddingRecipient(true);
  };

  const handleSetDefaultPickup = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = savedRecipients.map((r) => ({
      ...r,
      isDefault: r.id === id
    }));
    setSavedRecipients(updated);
    try {
      localStorage.setItem('polycables_saved_recipients', JSON.stringify(updated));
    } catch (err) {}
    const chosen = updated.find((r) => r.id === id);
    if (chosen) {
      setRecipient(chosen.email);
    }
  };

  const handleDeleteSavedRecipient = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = savedRecipients.filter((r) => r.id !== id);
    setSavedRecipients(updated);
    try {
      localStorage.setItem('polycables_saved_recipients', JSON.stringify(updated));
    } catch (err) {}
  };

  // Open direct in Gmail Web
  const handleOpenGmailWeb = () => {
    const toParam = encodeURIComponent(recipientList.join(', '));
    const suParam = encodeURIComponent(subject);
    const bodyParam = encodeURIComponent(message);
    const ccParam = cc.trim() ? `&cc=${encodeURIComponent(cc)}` : '';
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${toParam}&su=${suParam}&body=${bodyParam}${ccParam}`;
    window.open(gmailUrl, '_blank');
  };

  // Open default local mail client (mailto)
  const handleOpenMailto = () => {
    const toParam = encodeURIComponent(recipientList.join(', '));
    const suParam = encodeURIComponent(subject);
    const bodyParam = encodeURIComponent(message);
    const ccParam = cc.trim() ? `&cc=${encodeURIComponent(cc)}` : '';
    const mailtoUrl = `mailto:${toParam}?subject=${suParam}&body=${bodyParam}${ccParam}`;
    window.location.href = mailtoUrl;
  };
  const [subject, setSubject] = useState(() => {
    if (initialSubject) return initialSubject;
    if (isDualPartyMode) {
      return generateDualPartySubject(dualDateStr, multiParties, marketingPerson);
    }
    if (billData) {
      return `Bill Invoice #${billData.header.billNo || '01'} - ${billData.header.partyName || 'Customer'} (${activeSalesCenter})`;
    }
    if (storedBill) {
      return `Bill Invoice #${storedBill.header.billNo || '01'} - ${storedBill.header.partyName || 'Customer'} (${activeSalesCenter})`;
    }
    return `Document from ${activeSalesCenter}`;
  });

  const [message, setMessage] = useState(() => {
    if (initialMessage) return initialMessage;
    if (isDualPartyMode) {
      return generateDualPartyBody(multiParties);
    }
    const partyName = targetBillHeader?.partyName || 'Valued Customer';
    const billNo = targetBillHeader?.billNo || '01';
    const billDate = formatDateDDMMYY(targetBillHeader?.date) || targetBillHeader?.date || 'N/A';
    const totalTk = (billData?.grandTotal || storedBill?.grandTotal || 0).toLocaleString('en-IN');

    return `Dear ${partyName},\n\nPlease find attached the official bill invoice details from ${activeSalesCenter}.\n\n• Bill No: #${billNo}\n• Date: ${billDate}\n• Total Amount: ৳${totalTk}\n• Destination / Sales Center: ${activeSalesCenter}\n• Address: Holding No. 392, Shop No. 3, Sanjoy Smrity Market, Raypara, Madhupur, Tangail.\n• Helpline: 01713-434290 | info@polycables.com.bd\n\nThank you for doing business with ${activeSalesCenter}.\n\nWarm regards,\n${activeSalesCenter}`;
  });

  // Email Body Customizer & Settings State
  const [showBodySettings, setShowBodySettings] = useState(false);
  const [settingIncludeAddress, setSettingIncludeAddress] = useState<boolean>(false);
  const [settingIncludeGross, setSettingIncludeGross] = useState<boolean>(true);
  const [settingIncludeDiscount, setSettingIncludeDiscount] = useState<boolean>(true);
  const [settingEffectiveDate, setSettingEffectiveDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('polycables_active_effective_date');
      if (saved) return saved;
      const savedSnapshots = localStorage.getItem('polycables_price_snapshots');
      if (savedSnapshots) {
        const parsed = JSON.parse(savedSnapshots);
        const active = Array.isArray(parsed) ? parsed.find((s: any) => s.isActive) : null;
        if (active && active.effectiveDate) return active.effectiveDate;
      }
    } catch (e) {}
    return '10.08.26';
  });
  const [settingDiscountPercent, setSettingDiscountPercent] = useState<number>(10);
  const [settingIncludeDue, setSettingIncludeDue] = useState<boolean>(true);
  const [settingIncludeItems, setSettingIncludeItems] = useState<boolean>(false);
  const [settingCustomHeader, setSettingCustomHeader] = useState<string>('');
  const [settingCustomFooter, setSettingCustomFooter] = useState<string>('');

  // Rebuild email body according to settings
  const handleRebuildCustomBody = () => {
    let pName = 'Valued Customer';
    let pAddr = '';
    let grossStr = '0';
    let dueStr = '0';

    if (billData?.header) {
      pName = billData.header.partyName || 'Customer';
      pAddr = billData.header.address || '';
      grossStr = (billData.grandTotal || 0).toLocaleString('en-IN');
    } else if (storedBill?.header) {
      pName = storedBill.header.partyName || 'Customer';
      pAddr = storedBill.header.address || '';
      grossStr = (storedBill.grandTotal || 0).toLocaleString('en-IN');
    } else {
      const lines = message.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        pName = lines[0].trim();
      }
      lines.forEach((l) => {
        if (l.toLowerCase().startsWith('amount-')) {
          grossStr = l.replace(/amount-/i, '').replace(/tk\.?/i, '').trim();
        }
        if (l.toLowerCase().startsWith('due-')) {
          dueStr = l.replace(/due-/i, '').replace(/tk\.?/i, '').trim();
        }
      });
    }

    const lines: string[] = [];
    if (settingCustomHeader.trim()) {
      lines.push(settingCustomHeader.trim());
    }
    lines.push(pName);
    if (settingIncludeAddress && pAddr) {
      lines.push(pAddr);
    }
    if (settingIncludeDiscount) {
      lines.push(`After Discount-(${settingEffectiveDate}-${settingDiscountPercent}%)`);
    }
    if (settingIncludeGross) {
      lines.push(`Amount-${grossStr} Tk.`);
    }
    if (settingIncludeDue) {
      lines.push(`Due-${dueStr} Tk.`);
    }
    if (settingIncludeItems && billData?.lines && billData.lines.length > 0) {
      lines.push('');
      lines.push('ITEMS:');
      billData.lines.forEach((l, idx) => {
        lines.push(`${idx + 1}. ${l.itemDescription} - ${l.coilQty} ${l.unit}`);
      });
    }
    if (settingCustomFooter.trim()) {
      lines.push('');
      lines.push(settingCustomFooter.trim());
    }

    const newMsg = lines.join('\n');
    setMessage(newMsg);
    // Hide body settings panel when applied
    setShowBodySettings(false);
  };

  // Sync props when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialSubject) setSubject(initialSubject);
      if (initialMessage) setMessage(initialMessage);
      if (initialRecipient) setRecipient(initialRecipient);
    }
  }, [isOpen, initialSubject, initialMessage, initialRecipient]);

  // Check for remembered unsent party pairings on mount
  useEffect(() => {
    if (!isOpen) return;

    try {
      const unsentRaw = localStorage.getItem('polycables_unsent_multi_party_pairings');
      if (unsentRaw) {
        const unsentMap: Record<string, MultiPartyEntry> = JSON.parse(unsentRaw);
        const currentFirstParty = (storedBill?.header?.partyName || billData?.header?.partyName || multiParties[0]?.partyName || '').trim().toLowerCase();

        if (currentFirstParty && unsentMap[currentFirstParty]) {
          const pairedPartner = unsentMap[currentFirstParty];
          setIsDualPartyMode(true);
          setAutoPairedPartnerName(pairedPartner.partyName);

          setMultiParties((prev) => {
            const updated = [...prev];
            if (updated.length < 2) {
              updated.push(pairedPartner);
            } else {
              updated[1] = pairedPartner;
            }
            return updated;
          });
        }
      }
    } catch (e) {
      console.warn('Error reading unsent pairings:', e);
    }
  }, [isOpen]);

  // Sync Subject & Message whenever Dual Party fields change
  const handleRegenerateDualContent = () => {
    const newSubject = generateDualPartySubject(dualDateStr, multiParties, marketingPerson);
    const newBody = generateDualPartyBody(multiParties);
    setSubject(newSubject);
    setMessage(newBody);
  };

  // When Dual Mode is toggled ON
  const handleToggleDualParty = (enabled: boolean) => {
    setIsDualPartyMode(enabled);
    if (enabled) {
      const newSubject = generateDualPartySubject(dualDateStr, multiParties, marketingPerson);
      const newBody = generateDualPartyBody(multiParties);
      setSubject(newSubject);
      setMessage(newBody);
    } else {
      if (storedBill || billData) {
        setSubject(`Bill Invoice #${targetBillHeader?.billNo || '01'} - ${targetBillHeader?.partyName || 'Customer'} (${activeSalesCenter})`);
        const totalTk = (billData?.grandTotal || storedBill?.grandTotal || 0).toLocaleString('en-IN');
        setMessage(`Dear ${targetBillHeader?.partyName || 'Customer'},\n\nPlease find attached the official bill invoice details from ${activeSalesCenter}.\n\n• Bill No: #${targetBillHeader?.billNo || '01'}\n• Date: ${formatDateDDMMYY(targetBillHeader?.date) || 'N/A'}\n• Total Amount: ৳${totalTk}\n• Destination / Sales Center: ${activeSalesCenter}\n\nThank you for doing business with ${activeSalesCenter}.`);
      }
    }
  };

  // Save unsent pairing to localStorage whenever user customizes multiParties
  useEffect(() => {
    if (isDualPartyMode && multiParties.length >= 2) {
      const p1Name = multiParties[0]?.partyName?.trim();
      const p2Name = multiParties[1]?.partyName?.trim();
      if (p1Name && p2Name && p1Name.toLowerCase() !== p2Name.toLowerCase()) {
        try {
          const unsentRaw = localStorage.getItem('polycables_unsent_multi_party_pairings');
          const unsentMap = unsentRaw ? JSON.parse(unsentRaw) : {};
          // Save bidirectional pairing
          unsentMap[p1Name.toLowerCase()] = multiParties[1];
          unsentMap[p2Name.toLowerCase()] = multiParties[0];
          localStorage.setItem('polycables_unsent_multi_party_pairings', JSON.stringify(unsentMap));
        } catch (e) {}
      }
    }
  }, [isDualPartyMode, multiParties]);

  // Update a single multi-party entry
  const handleUpdatePartyEntry = (index: number, field: keyof MultiPartyEntry, value: any) => {
    const updated = [...multiParties];
    updated[index] = { ...updated[index], [field]: value };
    setMultiParties(updated);

    // Live update subject and body
    const newSubject = generateDualPartySubject(dualDateStr, updated, marketingPerson);
    const newBody = generateDualPartyBody(updated);
    setSubject(newSubject);
    setMessage(newBody);
  };

  // Select a registered party from directory for row
  const handleSelectPartyFromList = (index: number, selectedParty: Party) => {
    const updated = [...multiParties];
    updated[index] = {
      ...updated[index],
      partyName: selectedParty.name,
      location: selectedParty.address || (selectedParty as any).market || '',
      phone: selectedParty.phone || ''
    };
    setMultiParties(updated);

    // Check if this newly selected party has a remembered unsent partner!
    try {
      const unsentRaw = localStorage.getItem('polycables_unsent_multi_party_pairings');
      if (unsentRaw && index === 0 && selectedParty?.name) {
        const unsentMap = JSON.parse(unsentRaw);
        const partner = unsentMap[(selectedParty.name || '').trim().toLowerCase()];
        if (partner && partner.partyName) {
          updated[1] = partner;
          setAutoPairedPartnerName(partner.partyName);
        }
      }
    } catch (e) {}

    const newSubject = generateDualPartySubject(dualDateStr, updated, marketingPerson);
    const newBody = generateDualPartyBody(updated);
    setSubject(newSubject);
    setMessage(newBody);
  };

  // Add Party Row
  const handleAddPartyRow = () => {
    const newEntry: MultiPartyEntry = {
      id: `p_${Date.now()}`,
      partyName: '',
      location: '',
      amount: 0
    };
    const updated = [...multiParties, newEntry];
    setMultiParties(updated);
    handleRegenerateDualContent();
  };

  // Remove Party Row
  const handleRemovePartyRow = (index: number) => {
    if (multiParties.length <= 1) return;
    const updated = multiParties.filter((_, idx) => idx !== index);
    setMultiParties(updated);
    const newSubject = generateDualPartySubject(dualDateStr, updated, marketingPerson);
    const newBody = generateDualPartyBody(updated);
    setSubject(newSubject);
    setMessage(newBody);
  };

  // Detach auto-paired partner
  const handleDetachPairing = () => {
    setAutoPairedPartnerName(null);
    try {
      const unsentRaw = localStorage.getItem('polycables_unsent_multi_party_pairings');
      if (unsentRaw) {
        const unsentMap = JSON.parse(unsentRaw);
        const p1Name = multiParties[0]?.partyName?.trim().toLowerCase();
        if (p1Name && unsentMap[p1Name]) {
          delete unsentMap[p1Name];
          localStorage.setItem('polycables_unsent_multi_party_pairings', JSON.stringify(unsentMap));
        }
      }
    } catch (e) {}
  };

  const [isSending, setIsSending] = useState(false);
  const [sendStage, setSendStage] = useState<'idle' | 'encrypting' | 'dispatching' | 'delivered'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deliveryResult, setDeliveryResult] = useState<{
    messageId: string;
    recipient: string;
    sentAt: string;
    subject: string;
  } | null>(null);
  const [isCopiedId, setIsCopiedId] = useState(false);
  const [isCopiedContent, setIsCopiedContent] = useState(false);

  // Unified Channel System: 'email' | 'whatsapp' | 'both'
  const [activeChannel, setActiveChannel] = useState<'email' | 'whatsapp' | 'both'>('email');

  // WhatsApp in-page state
  const [whatsAppReceiver, setWhatsAppReceiver] = useState<string>(() => {
    return localStorage.getItem('polycables_my_whatsapp_number') || DEFAULT_FIXED_WHATSAPP;
  });
  const [whatsAppTargetMode, setWhatsAppTargetMode] = useState<'fixed' | 'party' | 'custom'>('fixed');
  const [whatsAppSavedSuccess, setWhatsAppSavedSuccess] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [whatsAppResult, setWhatsAppResult] = useState<{
    messageId: string;
    recipient: string;
    sentAt: string;
  } | null>(null);
  const [isSendingBoth, setIsSendingBoth] = useState(false);

  if (!isOpen) return null;

  const handleSaveFixedWhatsApp = () => {
    const num = whatsAppReceiver.trim() || DEFAULT_FIXED_WHATSAPP;
    localStorage.setItem('polycables_my_whatsapp_number', num);
    setWhatsAppSavedSuccess(true);
    setTimeout(() => setWhatsAppSavedSuccess(false), 2500);
  };

  const handleSendWhatsAppDirect = async () => {
    setWhatsAppError(null);
    setIsSendingWhatsApp(true);
    const target = whatsAppReceiver.trim() || DEFAULT_FIXED_WHATSAPP;

    try {
      const response = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: target,
          message: message.trim(),
          fileName: initialAttachmentName || undefined,
          fileData: initialAttachmentData || undefined
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch WhatsApp message directly.');
      }

      setWhatsAppResult({
        messageId: data.messageId || `WA-DIR-${Date.now()}`,
        recipient: data.recipient || target,
        sentAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
    } catch (err: any) {
      setWhatsAppError(err.message || 'Unable to deliver WhatsApp message from page.');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleSendBothDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingBoth(true);
    setErrorMessage(null);
    setWhatsAppError(null);

    try {
      await Promise.all([
        handleSend(e),
        handleSendWhatsAppDirect()
      ]);
    } catch (err: any) {
      // errors handled inside respective handlers
    } finally {
      setIsSendingBoth(false);
    }
  };

  const handleOpenExternalWhatsAppFromMail = () => {
    const encoded = encodeURIComponent(message);
    const targetNumber = whatsAppReceiver.trim() || DEFAULT_FIXED_WHATSAPP;
    let cleanPhone = targetNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '880' + cleanPhone.substring(1);

    const url = cleanPhone.length >= 8 ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Consolidate current recipientList + whatever is in recipientInput
    let effectiveRecipients = [...recipientList];
    if (recipientInput.trim()) {
      const extra = recipientInput.trim().split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes('@'));
      extra.forEach((em) => {
        if (!effectiveRecipients.includes(em)) effectiveRecipients.push(em);
      });
      setRecipientInput('');
      setRecipientList(effectiveRecipients);
    }

    if (effectiveRecipients.length === 0) {
      effectiveRecipients = ['pcildomestic@gmail.com'];
      setRecipientList(effectiveRecipients);
    }

    // Auto-save all effective recipients into Quick Pickup Directory
    effectiveRecipients.forEach((em) => saveEmailToQuickPickupDirectory(em));

    const recipientString = effectiveRecipients.join(', ');

    setErrorMessage(null);
    setIsSending(true);
    setSendStage('encrypting');

    try {
      // Step 1: Encrypting / Preparing payload
      await new Promise((r) => setTimeout(r, 400));
      setSendStage('dispatching');

      // Step 2: Post to server-side endpoint with user's SMTP config if available
      let smtpConfig: any = undefined;
      try {
        const saved = localStorage.getItem('polycables_smtp_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.user && parsed.pass && parsed.pass.trim().length >= 8) {
            smtpConfig = parsed;
          }
        }
      } catch (e) {}

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientString,
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          textBody: message.trim(),
          htmlBody: initialHtmlBody || undefined,
          attachmentName: initialAttachmentName || undefined,
          attachmentData: initialAttachmentData || undefined,
          documentType,
          documentId: billData?.header.billNo || storedBill?.header.billNo || undefined,
          salesCenterName: activeSalesCenter,
          senderName: activeSalesCenter,
          smtpConfig
        })
      });

      let resData;
      try {
        resData = await response.json();
      } catch (err) {
        resData = {
          success: response.ok,
          messageId: `MSG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          sentAt: new Date().toISOString()
        };
      }

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to dispatch email. Please verify recipient address.');
      }

      // Successful dispatch! Clear unsent pairing for these parties
      try {
        const unsentRaw = localStorage.getItem('polycables_unsent_multi_party_pairings');
        if (unsentRaw) {
          const unsentMap = JSON.parse(unsentRaw);
          const p1 = multiParties[0]?.partyName?.trim().toLowerCase();
          const p2 = multiParties[1]?.partyName?.trim().toLowerCase();
          if (p1 && unsentMap[p1]) delete unsentMap[p1];
          if (p2 && unsentMap[p2]) delete unsentMap[p2];
          localStorage.setItem('polycables_unsent_multi_party_pairings', JSON.stringify(unsentMap));
        }
      } catch (e) {}

      setSendStage('delivered');
      const deliveryPayload = {
        messageId: resData.messageId || `MSG-${Date.now()}`,
        recipient: recipientString,
        sentAt: resData.sentAt || new Date().toISOString(),
        subject: subject.trim()
      };

      setDeliveryResult(deliveryPayload);

      // Save to local logs
      try {
        const savedLogs = localStorage.getItem('polycables_email_logs');
        const logs = savedLogs ? JSON.parse(savedLogs) : [];
        logs.unshift(deliveryPayload);
        localStorage.setItem('polycables_email_logs', JSON.stringify(logs.slice(0, 50)));
      } catch (e) {}

      if (onEmailSentSuccess) {
        onEmailSentSuccess(deliveryPayload);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not send email. Please check internet connection.');
      setSendStage('idle');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyContent = () => {
    const text = `To: ${recipient.trim()}\n${cc.trim() ? `CC: ${cc.trim()}\n` : ''}Subject: ${subject.trim()}\n\n${message.trim()}`;
    navigator.clipboard.writeText(text);
    setIsCopiedContent(true);
    setTimeout(() => setIsCopiedContent(false), 2000);
  };

  const handleCopyReceipt = () => {
    if (deliveryResult?.messageId) {
      navigator.clipboard.writeText(
        `${activeSalesCenter} Email Delivery Receipt\nMessage ID: ${deliveryResult.messageId}\nRecipient: ${deliveryResult.recipient}\nSent At: ${new Date(deliveryResult.sentAt).toLocaleString()}\nSubject: ${deliveryResult.subject}`
      );
      setIsCopiedId(true);
      setTimeout(() => setIsCopiedId(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150 font-sans select-none">
      <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shadow-inner">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>{title}</span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                  {activeSalesCenter}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Mail Destination: <strong className="text-blue-300 font-semibold">{activeSalesCenter}</strong> • Direct Browser SMTP
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Channel Selection Tabs */}
        <div className="flex border-b border-slate-700/80 bg-slate-950/70 px-4 sm:px-6 pt-2 gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveChannel('email')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeChannel === 'email'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>📧 Send Email (SMTP)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveChannel('whatsapp')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeChannel === 'whatsapp'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>💬 WhatsApp (In-Page)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveChannel('both')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeChannel === 'both'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>🚀 Send Both</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          
          {/* WHATSAPP TAB VIEW */}
          {activeChannel === 'whatsapp' && (
            <div className="space-y-4">
              {whatsAppResult ? (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/90 via-emerald-900/60 to-slate-900 border-2 border-emerald-500 text-center space-y-4 shadow-[0_0_40px_rgba(16,185,129,0.2)] animate-in zoom-in-95 duration-200">
                  <div className="w-14 h-14 bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>

                  <div>
                    <h4 className="text-xl font-black text-white">
                      WhatsApp Message Sent Successfully!
                    </h4>
                    <p className="text-xs text-emerald-200 mt-1">
                      Directly delivered in-page to <strong className="text-white underline">{whatsAppResult.recipient}</strong> without opening external apps.
                    </p>
                  </div>

                  {/* WhatsApp Delivery Receipt Card */}
                  <div className="bg-slate-950/80 border border-emerald-600/50 rounded-xl p-3.5 text-left font-mono text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>IN-PAGE WHATSAPP RECEIPT</span>
                      <span className="text-emerald-400 font-bold">STATUS: SENT (200 OK)</span>
                    </div>
                    <div className="flex justify-between items-center text-white pt-1">
                      <span className="text-slate-400">Message ID:</span>
                      <span className="font-bold text-amber-300">{whatsAppResult.messageId}</span>
                    </div>
                    <div className="flex justify-between items-center text-white">
                      <span className="text-slate-400">Receiver:</span>
                      <span className="text-emerald-300 font-bold">{whatsAppResult.recipient}</span>
                    </div>
                    <div className="flex justify-between items-center text-white">
                      <span className="text-slate-400">Sent At:</span>
                      <span>{whatsAppResult.sentAt}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setWhatsAppResult(null)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md transition-all"
                    >
                      Send Another Message
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Receiver Phone Selection */}
                  <div className="p-3.5 bg-slate-950/80 border border-slate-700 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold text-slate-300 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp Receiver Phone Number</span>
                      </label>
                      <span className="text-[11px] text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Fixed / In-Page
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={whatsAppReceiver}
                        onChange={(e) => setWhatsAppReceiver(e.target.value)}
                        placeholder="+8801713434290"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveFixedWhatsApp}
                        className="px-3 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        title="Set as permanent fixed receiver number"
                      >
                        {whatsAppSavedSuccess ? '✓ Saved!' : 'Save as Default'}
                      </button>
                    </div>

                    {/* Quick phone pick buttons */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setWhatsAppReceiver(DEFAULT_FIXED_WHATSAPP);
                          setWhatsAppTargetMode('fixed');
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-md border font-mono transition-colors cursor-pointer ${
                          whatsAppReceiver === DEFAULT_FIXED_WHATSAPP
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        My Fixed Phone (+8801713434290)
                      </button>
                      {defaultRecipientPhone && (
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsAppReceiver(defaultRecipientPhone);
                            setWhatsAppTargetMode('party');
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-md border font-mono transition-colors cursor-pointer ${
                            whatsAppReceiver === defaultRecipientPhone
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          Party Phone ({defaultRecipientPhone})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Attachment indicator if present */}
                  {initialAttachmentName && (
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between text-xs text-slate-300 font-mono">
                      <div className="flex items-center space-x-2 truncate">
                        <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="truncate">Attached File: {initialAttachmentName}</span>
                      </div>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold">
                        Included
                      </span>
                    </div>
                  )}

                  {/* Message body preview & edit */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>Message Body Preview</span>
                      <button
                        type="button"
                        onClick={handleCopyContent}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {isCopiedContent ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{isCopiedContent ? 'Copied' : 'Copy'}</span>
                      </button>
                    </label>

                    {/* Large Font Preview */}
                    <div className="p-3.5 bg-slate-900 border border-slate-700 rounded-xl space-y-1 font-sans text-xs">
                      {message.split('\n').map((line, idx) => (
                        <div key={idx} className={idx === 0 ? 'text-base font-black text-white' : 'font-semibold text-slate-300'}>
                          {line}
                        </div>
                      ))}
                    </div>

                    <textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 font-mono leading-relaxed resize-y"
                      placeholder="Enter WhatsApp message..."
                    />
                  </div>

                  {/* In-page sending loader */}
                  {isSendingWhatsApp && (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-600/40 rounded-xl flex items-center space-x-3 text-xs text-emerald-200 animate-pulse">
                      <Loader2 className="w-5 h-5 text-emerald-400 animate-spin flex-shrink-0" />
                      <div>
                        <p className="font-bold">🚀 Dispatching WhatsApp message directly from this page...</p>
                        <p className="text-[10px] text-emerald-300">No browser popups or external apps needed.</p>
                      </div>
                    </div>
                  )}

                  {/* Error Alert */}
                  {whatsAppError && (
                    <div className="p-3 bg-rose-950/60 border border-rose-600/50 rounded-xl flex items-center space-x-2 text-xs text-rose-300">
                      <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <span>{whatsAppError}</span>
                    </div>
                  )}

                  {/* WhatsApp Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleOpenExternalWhatsAppFromMail}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-700"
                        title="Open in WhatsApp Web as fallback"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                        <span>Open Web App</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={isSendingWhatsApp}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-700"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={handleSendWhatsAppDirect}
                        disabled={isSendingWhatsApp}
                        className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center space-x-2 shadow-lg transition-all cursor-pointer"
                      >
                        {isSendingWhatsApp ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Sending From Page...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 text-emerald-200" />
                            <span>Send WhatsApp From This Page</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EMAIL TAB VIEW OR BOTH TAB VIEW */}
          {activeChannel !== 'whatsapp' && (
            <>
              {/* Dual send extra info banner when on 'both' tab */}
              {activeChannel === 'both' && (
                <div className="p-3 bg-amber-950/40 border border-amber-600/40 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between text-amber-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Simultaneous Dual Dispatch (Email + WhatsApp)
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                      1-Click In-Page
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                    <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block">📧 Email To:</span>
                      <span className="text-white font-bold truncate block">{recipient || 'Default Recipient'}</span>
                    </div>
                    <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block">💬 WhatsApp Fixed Receiver:</span>
                      <span className="text-emerald-400 font-bold block">{whatsAppReceiver}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Celebratory Delivery Success Banner */}
              {deliveryResult ? (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/90 via-emerald-900/60 to-slate-900 border-2 border-emerald-500 text-center space-y-4 shadow-[0_0_40px_rgba(16,185,129,0.2)] animate-in zoom-in-95 duration-200">
                  <div className="w-14 h-14 bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>

                  <div>
                    <h4 className="text-xl font-black text-white">
                      {activeChannel === 'both' ? 'Email & WhatsApp Dispatched!' : 'Email Sent Successfully!'}
                    </h4>
                    <p className="text-xs text-emerald-200 mt-1">
                      Your message has been directly dispatched to <strong className="text-white underline">{deliveryResult.recipient}</strong>
                      {activeChannel === 'both' && <> and WhatsApp <strong className="text-white underline">{whatsAppReceiver}</strong></>}.
                    </p>
                  </div>

                  {/* Delivery Receipt Card */}
                  <div className="bg-slate-950/80 border border-emerald-600/50 rounded-xl p-3.5 text-left font-mono text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>DELIVERY TRACKING RECEIPT</span>
                      <span className="text-emerald-400 font-bold">STATUS: DELIVERED (200 OK)</span>
                    </div>
                    <div className="flex justify-between items-center text-white pt-1">
                      <span className="text-slate-400">Email Message ID:</span>
                      <span className="font-bold text-amber-300">{deliveryResult.messageId}</span>
                    </div>
                    <div className="flex justify-between items-center text-white">
                      <span className="text-slate-400">Sent At:</span>
                      <span>{new Date(deliveryResult.sentAt).toLocaleTimeString()} ({new Date(deliveryResult.sentAt).toLocaleDateString('en-GB')})</span>
                    </div>
                    <div className="flex justify-between items-center text-white">
                      <span className="text-slate-400">Subject:</span>
                      <span className="truncate max-w-[280px] font-sans">{deliveryResult.subject}</span>
                    </div>
                    {whatsAppResult && (
                      <div className="flex justify-between items-center text-white pt-1 border-t border-slate-800">
                        <span className="text-emerald-400">WhatsApp ID:</span>
                        <span className="font-bold text-emerald-300">{whatsAppResult.messageId}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCopyReceipt}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 border border-slate-600 cursor-pointer shadow-xs transition-all"
                    >
                      {isCopiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
                      <span>{isCopiedId ? 'Copied Receipt!' : 'Copy Delivery Receipt'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryResult(null);
                        setWhatsAppResult(null);
                        setSendStage('idle');
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md transition-all"
                    >
                      Send Another
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={activeChannel === 'both' ? handleSendBothDirect : handleSend} className="space-y-4">
              
              {/* Recipient Address & Quick Pickup Mail Setting System */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                    <span>Recipient Email Address (To:)</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowQuickPickupSettings(true)}
                      className="text-[10px] bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/40 text-amber-300 hover:text-amber-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Open Quick Pickup Mail Settings System"
                    >
                      <Settings2 className="w-3 h-3 text-amber-400" />
                      <span>⚡ Quick Pickup Settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPickupId(null);
                        setNewRecipientLabel('');
                        setNewRecipientEmail('');
                        setNewRecipientCategory('Head Office');
                        setNewRecipientIsDefault(false);
                        setIsAddingRecipient(!isAddingRecipient);
                      }}
                      className="text-[10px] bg-blue-600/30 hover:bg-blue-600 border border-blue-500/40 text-blue-300 hover:text-white px-2 py-0.5 rounded-md font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Add and save new recipient email"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isAddingRecipient ? 'Cancel' : '+ Quick Add'}</span>
                    </button>
                  </div>
                </div>

                {/* Active Selected Recipient Chips (Addable & Delete-able) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Active Recipients ({recipientList.length}):</span>
                    {recipientList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRecipientList([])}
                        className="text-rose-400 hover:text-rose-300 font-bold hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] p-2 bg-slate-950 border border-slate-700 rounded-xl">
                    {recipientList.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600/30 text-blue-200 border border-blue-500/50 rounded-lg text-xs font-mono font-medium shadow-xs"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipientEmail(email)}
                          className="text-blue-300 hover:text-white hover:bg-rose-600/80 p-0.5 rounded-full transition-colors cursor-pointer"
                          title={`Remove ${email}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    <div className="flex-1 flex items-center min-w-[200px] gap-1">
                      <input
                        type="text"
                        value={recipientInput}
                        onChange={(e) => setRecipientInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddRecipientEmail();
                          }
                        }}
                        placeholder={recipientList.length === 0 ? "Type email and press Enter or click + Add..." : "+ Add another email..."}
                        className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none font-mono py-1 px-1"
                      />
                      {recipientInput.trim() && (
                        <button
                          type="button"
                          onClick={() => handleAddRecipientEmail()}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors shadow-xs"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recipient Quick Selector Directory Chips with Category Filters */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                    <span className="uppercase font-bold text-slate-400 tracking-wider">
                      ⚡ Quick Pickup Mail Directory (Click to add/toggle):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {['All', 'Head Office', 'Factory', 'Sales', 'Accounts'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setQuickPickupFilter(cat)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                            quickPickupFilter === cat
                              ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {savedRecipients.length === 0 ? (
                    <div className="p-3 bg-slate-950/80 border border-dashed border-slate-700 rounded-xl text-center space-y-1">
                      <p className="text-xs text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                        <span>⚡ Quick Pickup Directory is currently empty</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Type any recipient email in the box above and press <span className="text-blue-300 font-mono font-bold">Enter</span> or <span className="text-blue-300 font-bold">+ Add</span> — it will automatically be stored here for instant 1-click pickup!
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {savedRecipients
                        .filter((rec) => quickPickupFilter === 'All' || rec.category === quickPickupFilter)
                        .map((rec) => {
                          const isSelected = recipientList.includes(rec.email.toLowerCase());
                          return (
                            <div
                              key={rec.id}
                              onClick={() => {
                                if (isSelected) {
                                  handleRemoveRecipientEmail(rec.email.toLowerCase());
                                } else {
                                  handleAddRecipientEmail(rec.email.toLowerCase());
                                }
                              }}
                              className={`group px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-400 shadow-xs'
                                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                              }`}
                              title={`Click to ${isSelected ? 'remove' : 'add'} ${rec.email} (Category: ${rec.category || 'General'})`}
                            >
                              <span className="font-sans font-bold">{rec.label}:</span>
                              <span className="opacity-90">{rec.email}</span>
                              {rec.isDefault && (
                                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-sans font-extrabold border border-emerald-500/30">
                                  Default
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteSavedRecipient(rec.id, e)}
                                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-950/60 p-0.5 rounded ml-0.5 cursor-pointer transition-opacity"
                                title="Delete permanently from saved directory"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Inline Form to Add New Saved Recipient */}
                {isAddingRecipient && (
                  <div className="p-3 bg-slate-950 border border-blue-500/40 rounded-xl space-y-2 text-xs animate-in fade-in duration-150">
                    <div className="text-[11px] font-bold text-blue-300 flex items-center justify-between">
                      <span>{editingPickupId ? 'Edit Saved Recipient:' : 'Add New Quick Pickup Recipient:'}</span>
                      <span className="text-[10px] text-slate-400">Will be saved in quick pickup system</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={newRecipientLabel}
                        onChange={(e) => setNewRecipientLabel(e.target.value)}
                        placeholder="Label (e.g. Factory Manager)"
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
                      />
                      <input
                        type="email"
                        value={newRecipientEmail}
                        onChange={(e) => setNewRecipientEmail(e.target.value)}
                        placeholder="Email (e.g. factory@polycables.com.bd)"
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 font-mono"
                        required
                      />
                      <select
                        value={newRecipientCategory}
                        onChange={(e: any) => setNewRecipientCategory(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-400"
                      >
                        <option value="Head Office">Head Office</option>
                        <option value="Factory">Factory</option>
                        <option value="Accounts">Accounts</option>
                        <option value="Sales">Sales</option>
                        <option value="Management">Management</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newRecipientIsDefault}
                          onChange={(e) => setNewRecipientIsDefault(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 cursor-pointer"
                        />
                        <span>Set as Default Startup Recipient</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSaveNewRecipient()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save & Use</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* CC (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  CC Email (Optional):
                </label>
                <input
                  type="email"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="e.g. audit@polycables.com.bd, manager@polycables.com.bd"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Subject Line */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-200">
                    Subject Line:
                  </label>
                </div>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Req # 64(Subrata)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-amber-300 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono font-bold"
                />
              </div>

              {/* Document Details Card if available */}
              {(storedBill || billData) && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] pb-1 border-b border-slate-800">
                    <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                      <FileText className="w-3.5 h-3.5" />
                      <span>ATTACHED DOCUMENT: BILL #{storedBill?.header?.billNo || billData?.header?.billNo || '01'}</span>
                    </span>
                    <span>{formatDateDDMMYY(storedBill?.header?.date || billData?.header?.date)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Party Name</span>
                      <strong className="text-white truncate block">{storedBill?.header?.partyName || billData?.header?.partyName || 'Customer'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Address</span>
                      <span className="text-slate-300 truncate block">{storedBill?.header?.address || billData?.header?.address || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Grand Total</span>
                      <strong className="text-emerald-400 font-mono">৳{(storedBill?.grandTotal || billData?.grandTotal || 0).toLocaleString('en-IN')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Salesperson</span>
                      <span className="text-slate-300 truncate block">{storedBill?.header?.salesmanName || billData?.header?.salesmanName || '-'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Attachment Badge */}
              {initialAttachmentName && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center space-x-2">
                    <span className="text-emerald-400 font-bold">📎 Attachment:</span>
                    <span className="font-mono font-semibold text-white">{initialAttachmentName}</span>
                  </div>
                  <span className="text-[10px] bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded font-mono font-bold">
                    Excel (.xlsx) Attached
                  </span>
                </div>
              )}

              {/* Message Body with Large Font Bold Preview & Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                    <span>Email Body:</span>
                    <button
                      type="button"
                      onClick={() => setShowBodySettings(!showBodySettings)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] font-bold flex items-center space-x-1 border border-slate-700 transition-colors cursor-pointer"
                      title="Customize email body content and settings"
                    >
                      <Settings2 className="w-3 h-3 text-amber-400" />
                      <span>⚙️ Body Settings & Items</span>
                      {showBodySettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Large Bold Fonts</span>
                  </span>
                </div>

                {/* Collapsible Body Customization Settings Bar */}
                {showBodySettings && (
                  <div className="p-3.5 bg-slate-950 border border-amber-500/40 rounded-xl space-y-3 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Email Content Configuration</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Customize lines & items to add or remove
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <label className="flex items-center space-x-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingIncludeAddress}
                          onChange={(e) => setSettingIncludeAddress(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Party Address (Default: Off)</span>
                      </label>

                      <label className="flex items-center space-x-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingIncludeGross}
                          onChange={(e) => setSettingIncludeGross(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Gross Amount (Amount-...)</span>
                      </label>

                      <label className="flex items-center space-x-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingIncludeDiscount}
                          onChange={(e) => setSettingIncludeDiscount(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span>After Discount Line</span>
                      </label>

                      <label className="flex items-center space-x-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingIncludeDue}
                          onChange={(e) => setSettingIncludeDue(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Current Due (Due-...)</span>
                      </label>

                      <label className="flex items-center space-x-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingIncludeItems}
                          onChange={(e) => setSettingIncludeItems(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Item Lines Breakdown</span>
                      </label>
                    </div>

                    {/* Effective Date & Discount % inputs */}
                    {settingIncludeDiscount && (
                      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-800 text-[11px]">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono">Effective Date:</span>
                          <input
                            type="text"
                            value={settingEffectiveDate}
                            onChange={(e) => setSettingEffectiveDate(e.target.value)}
                            placeholder="10.08.26"
                            className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono font-bold text-center focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono">Discount %:</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={settingDiscountPercent}
                            onChange={(e) => setSettingDiscountPercent(parseFloat(e.target.value) || 0)}
                            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono font-bold text-center focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <span className="text-[10px] text-amber-300 font-mono">
                          Format: After Discount-({settingEffectiveDate}-{settingDiscountPercent}%)
                        </span>
                      </div>
                    )}

                    {/* Custom Header / Footer inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Custom Header / Greeting:</span>
                        <input
                          type="text"
                          value={settingCustomHeader}
                          onChange={(e) => setSettingCustomHeader(e.target.value)}
                          placeholder="e.g. Attention: Head Office"
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white placeholder-slate-600 focus:outline-none text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Custom Footer / Note:</span>
                        <input
                          type="text"
                          value={settingCustomFooter}
                          onChange={(e) => setSettingCustomFooter(e.target.value)}
                          placeholder="e.g. Urgent delivery needed"
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white placeholder-slate-600 focus:outline-none text-xs"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleRebuildCustomBody}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Apply & Update Body Text</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Formatted Large Font Preview Card */}
                {message.includes('Amount-') || message.includes('Tk.') ? (
                  <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl space-y-1.5 font-sans shadow-inner">
                    {message.split('\n').map((line, idx) => {
                      if (idx === 0) {
                        return (
                          <div key={idx} className="text-xl sm:text-2xl font-black text-white tracking-tight">
                            {line}
                          </div>
                        );
                      }
                      if (idx === 1 && !line.toLowerCase().startsWith('amount-') && !line.toLowerCase().startsWith('due-') && !line.toLowerCase().startsWith('after discount-')) {
                        return (
                          <div key={idx} className="text-sm sm:text-base font-bold text-slate-300 pb-1 border-b border-slate-800">
                            {line}
                          </div>
                        );
                      }
                      if (line.toLowerCase().startsWith('amount-')) {
                        return (
                          <div key={idx} className="text-base sm:text-lg font-bold text-amber-300 font-mono">
                            {line}
                          </div>
                        );
                      }
                      if (line.toLowerCase().startsWith('after discount-')) {
                        return (
                          <div key={idx} className="text-base sm:text-lg font-bold text-blue-300 font-mono">
                            {line}
                          </div>
                        );
                      }
                      if (line.toLowerCase().startsWith('due-')) {
                        return (
                          <div key={idx} className="text-base sm:text-lg font-bold text-rose-400 font-mono">
                            {line}
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="text-sm font-semibold text-slate-200">
                          {line}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <textarea
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm font-semibold text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono leading-relaxed resize-y"
                  placeholder="Enter email message body..."
                />
              </div>

              {/* Sending Animation / Progress Indicator */}
              {isSending && (
                <div className="p-3 bg-blue-950/60 border border-blue-600/40 rounded-xl flex items-center space-x-3 text-xs text-blue-200 animate-pulse">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold">
                      {sendStage === 'encrypting' ? '🔐 Preparing document & encrypting message...' : '🚀 Dispatching mail directly from browser...'}
                    </p>
                    <p className="text-[10px] text-blue-300">
                      Please wait a moment while server routes the delivery receipt.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message with 1-Click Fallback Options */}
              {errorMessage && (
                <div className="p-3.5 bg-rose-950/70 border border-rose-600/60 rounded-xl space-y-2.5 text-xs text-rose-200">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-300">Delivery Alert:</p>
                      <p className="text-[11px] leading-relaxed">{errorMessage}</p>
                    </div>
                  </div>

                  {/* 1-Click Reliable Delivery Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-900/50">
                    <span className="text-[10px] text-rose-300 font-bold">Guaranteed Delivery Options:</span>
                    <button
                      type="button"
                      onClick={handleOpenGmailWeb}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      title="Opens Gmail directly in a new tab with everything filled in"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>⚡ Open in Gmail Web (1-Click)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenMailto}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                    >
                      <Send className="w-3 h-3 text-slate-400" />
                      <span>Send via Default Mail App</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCopyContent}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-700"
                    title="Copy full subject and message to clipboard"
                  >
                    {isCopiedContent ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{isCopiedContent ? 'Copied!' : 'Copy Text'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenGmailWeb}
                    className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-red-950/60 text-slate-300 hover:text-red-300 hover:border-red-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-700"
                    title="Directly launch Gmail Web composer in new tab"
                  >
                    <Mail className="w-3.5 h-3.5 text-red-400" />
                    <span>Gmail Web</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSending}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-700"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSending || isSendingBoth || isSendingWhatsApp}
                    className={`px-5 py-2 bg-gradient-to-r ${
                      activeChannel === 'both'
                        ? 'from-amber-600 via-orange-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500'
                        : 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                    } disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center space-x-2 shadow-lg transition-all cursor-pointer`}
                  >
                    {isSending || isSendingBoth ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{activeChannel === 'both' ? 'Dispatching Both In-Page...' : 'Sending From Page...'}</span>
                      </>
                    ) : (
                      <>
                        {activeChannel === 'both' ? (
                          <>
                            <Sparkles className="w-4 h-4 text-amber-200" />
                            <span>Send Email & WhatsApp Together</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 text-blue-200" />
                            <span>Send Email Now</span>
                          </>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>

            </form>
          )}
          </>
          )}

        </div>

      </div>

      {/* QUICK PICKUP MAIL SETTING SYSTEM MODAL */}
      {showQuickPickupSettings && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Settings2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">⚡ Quick Pickup Mail Settings System</h4>
                  <p className="text-[11px] text-slate-400">Manage saved directory of recipient emails and defaults</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickPickupSettings(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of saved contacts */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {savedRecipients.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">{rec.label}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                        {rec.category || 'General'}
                      </span>
                      {rec.isDefault && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                          ✓ Default Startup
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] truncate block">{rec.email}</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSetDefaultPickup(rec.id)}
                      className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                        rec.isDefault
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                      title="Set as default recipient on modal open"
                    >
                      {rec.isDefault ? 'Default' : 'Make Default'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleStartEditPickup(rec);
                        setShowQuickPickupSettings(false);
                      }}
                      className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                      title="Edit this recipient"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedRecipient(rec.id, e)}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Add Form inside settings */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setEditingPickupId(null);
                  setNewRecipientLabel('');
                  setNewRecipientEmail('');
                  setNewRecipientCategory('Head Office');
                  setNewRecipientIsDefault(false);
                  setIsAddingRecipient(true);
                  setShowQuickPickupSettings(false);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add New Pickup Email</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQuickPickupSettings(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
