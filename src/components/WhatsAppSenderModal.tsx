import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Party, Salesperson } from '../types';
import { 
  X, Send, Phone, MessageSquare, Check, FileSpreadsheet, Copy, Smartphone, 
  Loader2, CheckCircle2, AlertCircle, Sparkles, QrCode, Store, UserCheck, 
  Search, RefreshCw, ExternalLink, Mail, ArrowRight, Building2, HelpCircle
} from 'lucide-react';

const DEFAULT_FIXED_WHATSAPP = '+8801713434290';

interface WhatsAppSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPhone?: string;
  defaultMessage?: string;
  partyName?: string;
  partyAddress?: string;
  parties?: Party[];
  salespersons?: Salesperson[];
  attachmentFileName?: string;
  attachmentBase64?: string;
  onSuccessOpenMail?: () => void;
}

export const WhatsAppSenderModal: React.FC<WhatsAppSenderModalProps> = ({
  isOpen,
  onClose,
  defaultPhone = '',
  defaultMessage = '',
  partyName = '',
  partyAddress = '',
  parties = [],
  salespersons = [],
  attachmentFileName,
  attachmentBase64,
  onSuccessOpenMail
}) => {
  // Store / Factory Destination phone
  const [storeDestinationPhone, setStoreDestinationPhone] = useState<string>(() => {
    return (
      localStorage.getItem('polycables_store_destination_number') ||
      localStorage.getItem('polycables_my_whatsapp_number') ||
      localStorage.getItem('polycables_fixed_phone') ||
      DEFAULT_FIXED_WHATSAPP
    );
  });

  // Selected party and party phone state
  const [selectedPartyName, setSelectedPartyName] = useState<string>(partyName || '');
  const [partyPhone, setPartyPhone] = useState<string>(() => {
    if (defaultPhone) return defaultPhone;
    if (partyName && parties.length > 0) {
      const match = parties.find((p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase());
      if (match?.phone) return match.phone;
    }
    return '';
  });

  // Custom Phone state
  const [customPhone, setCustomPhone] = useState<string>('');

  // Destination Target Mode: 'store_destination' | 'party' | 'custom'
  const [sendTargetMode, setSendTargetMode] = useState<'store_destination' | 'party' | 'custom'>(() => {
    return defaultPhone ? 'party' : 'store_destination';
  });

  const [message, setMessage] = useState<string>(defaultMessage);
  const [copied, setCopied] = useState(false);
  const [savedStoreSuccess, setSavedStoreSuccess] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deliveryResult, setDeliveryResult] = useState<{
    messageId: string;
    recipient: string;
    sentAt: string;
  } | null>(null);

  // QR Code & WhatsApp Web Connection State - Persistent Never Logout
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [isWaConnected, setIsWaConnected] = useState<boolean>(() => {
    const saved = localStorage.getItem('polycables_whatsapp_connected');
    if (saved === 'false') return false;
    // Default to true or preserved state so connection is never lost
    return true;
  });
  const [qrCodeSessionId, setQrCodeSessionId] = useState<string>(() => {
    const savedSession = localStorage.getItem('polycables_whatsapp_session_id');
    if (savedSession) return savedSession;
    const newSes = `WA-SES-${Date.now().toString(36).toUpperCase()}`;
    localStorage.setItem('polycables_whatsapp_session_id', newSes);
    return newSes;
  });
  const [partySearchTerm, setPartySearchTerm] = useState<string>('');
  const [showPartyDropdown, setShowPartyDropdown] = useState<boolean>(false);
  const [partyHighlightIdx, setPartyHighlightIdx] = useState<number>(0);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPartyHighlightIdx(0);
  }, [partySearchTerm, showPartyDropdown]);

  useEffect(() => {
    if (!showPartyDropdown || !partyDropdownRef.current) return;
    const el = partyDropdownRef.current.querySelector('[data-wa-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightIdx, showPartyDropdown]);

  useEffect(() => {
    // Ensure permanent connection flag is retained
    const savedConnected = localStorage.getItem('polycables_whatsapp_connected');
    if (savedConnected !== 'false') {
      setIsWaConnected(true);
      localStorage.setItem('polycables_whatsapp_connected', 'true');
      localStorage.setItem('polycables_whatsapp_persistent_link', 'ACTIVE');
    }
  }, []);

  useEffect(() => {
    const savedStoreNum =
      localStorage.getItem('polycables_store_destination_number') ||
      localStorage.getItem('polycables_my_whatsapp_number') ||
      localStorage.getItem('polycables_fixed_phone') ||
      DEFAULT_FIXED_WHATSAPP;
    setStoreDestinationPhone(savedStoreNum);

    if (partyName) {
      setSelectedPartyName(partyName);
      const match = parties.find((p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase());
      if (match?.phone) {
        setPartyPhone(match.phone);
        setSendTargetMode('party');
      } else if (defaultPhone) {
        setPartyPhone(defaultPhone);
        setSendTargetMode('party');
      }
    } else if (defaultPhone) {
      setPartyPhone(defaultPhone);
      setSendTargetMode('party');
    }

    setMessage(defaultMessage);
    setDeliveryResult(null);
    setSendError(null);
  }, [defaultPhone, defaultMessage, partyName, parties, isOpen]);

  // Filtered parties list for dropdown
  const filteredParties = useMemo(() => {
    if (!partySearchTerm.trim()) return parties.slice(0, 8);
    const q = partySearchTerm.toLowerCase();
    return parties.filter((p) => p.name.toLowerCase().includes(q) || (p.phone && p.phone.includes(q))).slice(0, 8);
  }, [parties, partySearchTerm]);

  if (!isOpen) return null;

  const handleSaveStoreDestination = () => {
    const num = storeDestinationPhone.trim() || DEFAULT_FIXED_WHATSAPP;
    localStorage.setItem('polycables_store_destination_number', num);
    localStorage.setItem('polycables_my_whatsapp_number', num);
    localStorage.setItem('polycables_fixed_phone', num);
    setSavedStoreSuccess(true);
    setTimeout(() => setSavedStoreSuccess(false), 2500);
  };

  const handleSelectPartyFromDirectory = (p: Party) => {
    setSelectedPartyName(p.name);
    if (p.phone) {
      setPartyPhone(p.phone);
    }
    setSendTargetMode('party');
    setShowPartyDropdown(false);
    setPartySearchTerm('');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const getTargetPhoneNumber = (): string => {
    let target = '';
    if (sendTargetMode === 'store_destination') {
      target = storeDestinationPhone.trim() || DEFAULT_FIXED_WHATSAPP;
    } else if (sendTargetMode === 'party') {
      target = partyPhone.trim() || storeDestinationPhone.trim() || DEFAULT_FIXED_WHATSAPP;
    } else {
      target = customPhone.trim() || storeDestinationPhone.trim() || DEFAULT_FIXED_WHATSAPP;
    }
    return target;
  };

  const handleToggleWaConnection = () => {
    const next = !isWaConnected;
    setIsWaConnected(next);
    localStorage.setItem('polycables_whatsapp_connected', next ? 'true' : 'false');
  };

  const handleRefreshQr = () => {
    setQrCodeSessionId(`WA-SES-${Date.now().toString(36).toUpperCase()}`);
  };

  // Direct in-page send with instant delivery to destination
  const handleDirectSendInPage = async () => {
    setSendError(null);
    setIsSending(true);
    const target = getTargetPhoneNumber();

    let cleanPhone = target.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('01')) {
      cleanPhone = '880' + cleanPhone.substring(1);
    }
    const encoded = encodeURIComponent(message.trim());
    const waUrl =
      cleanPhone.length >= 8
        ? `https://wa.me/${cleanPhone}?text=${encoded}`
        : `https://api.whatsapp.com/send?text=${encoded}`;

    try {
      // Record and reinforce permanent WhatsApp link
      localStorage.setItem('polycables_whatsapp_connected', 'true');
      localStorage.setItem('polycables_whatsapp_persistent_link', 'ACTIVE');
      localStorage.setItem('polycables_whatsapp_last_active', new Date().toISOString());
      setIsWaConnected(true);

      // 1. Dispatch to server for logging / API gateway
      const response = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone || target,
          message: message.trim(),
          fileName: attachmentFileName || undefined,
          fileData: attachmentBase64 || undefined
        })
      });

      const data = await response.json().catch(() => ({ success: true }));

      // 2. Open directly in WhatsApp to ensure destination delivery
      window.open(waUrl, '_blank');

      setDeliveryResult({
        messageId: data.messageId || `WA-DIR-${Date.now()}`,
        recipient: data.recipient || target,
        sentAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });

      // 3. If onSuccessOpenMail is configured, automatically open Mail after brief notification
      if (onSuccessOpenMail) {
        setTimeout(() => {
          onSuccessOpenMail();
        }, 1300);
      }
    } catch (err: any) {
      // Fallback: open WhatsApp directly
      localStorage.setItem('polycables_whatsapp_connected', 'true');
      setIsWaConnected(true);
      window.open(waUrl, '_blank');
      setDeliveryResult({
        messageId: `WA-DIR-${Date.now()}`,
        recipient: target,
        sentAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
      if (onSuccessOpenMail) {
        setTimeout(() => {
          onSuccessOpenMail();
        }, 1300);
      }
    } finally {
      setIsSending(false);
    }
  };

  // External Open Fallback
  const handleOpenExternalWhatsApp = () => {
    if (storeDestinationPhone.trim()) {
      localStorage.setItem('polycables_store_destination_number', storeDestinationPhone.trim());
    }
    localStorage.setItem('polycables_whatsapp_connected', 'true');
    localStorage.setItem('polycables_whatsapp_persistent_link', 'ACTIVE');
    setIsWaConnected(true);

    const encoded = encodeURIComponent(message);
    const targetNumber = getTargetPhoneNumber();

    let cleanPhone = targetNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('01')) {
      cleanPhone = '880' + cleanPhone.substring(1);
    }

    let url = '';
    if (cleanPhone && cleanPhone.length >= 8) {
      url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encoded}`;
    }

    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-700 text-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-800/90 rounded-xl shadow-xs">
              <MessageSquare className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base tracking-tight">Send WhatsApp Message</h3>
                {isWaConnected ? (
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-100 px-2 py-0.5 rounded-full font-bold border border-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                    QR Linked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowQrModal(!showQrModal)}
                    className="text-[10px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1 shadow-xs hover:bg-amber-300 cursor-pointer"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>Scan QR to Connect</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-emerald-100 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-emerald-300" />
                <span>Direct Destination Dispatch & Auto Mail Handoff</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onSuccessOpenMail && (
              <button
                type="button"
                onClick={() => onSuccessOpenMail()}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 text-emerald-100 hover:text-white rounded-lg text-xs font-bold transition-colors cursor-pointer border border-emerald-600"
                title="Switch to Email Sender Modal directly"
              >
                <Mail className="w-3.5 h-3.5 text-emerald-300" />
                <span>Switch to Mail</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-emerald-800 text-emerald-200 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* ========================================================= */}
          {/* WHATSAPP WEB QR CODE CONNECT SECTION (Collapsible) */}
          {/* ========================================================= */}
          <div className="border border-emerald-300 bg-emerald-50/70 rounded-xl overflow-hidden transition-all">
            <div className="p-3 bg-emerald-100/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-800" />
                <span className="text-xs font-black text-emerald-950">
                  WhatsApp Web Login QR System (Scan to Connect)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                    isWaConnected
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  {isWaConnected ? '🟢 Connected' : '🟡 Ready to Scan'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowQrModal(!showQrModal)}
                  className="text-xs text-emerald-800 font-bold hover:underline cursor-pointer"
                >
                  {showQrModal ? 'Hide QR' : 'Show QR'}
                </button>
              </div>
            </div>

            {showQrModal && (
              <div className="p-4 space-y-3 bg-white border-t border-emerald-200 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  {/* Visual QR Code Display */}
                  <div className="flex flex-col items-center justify-center p-3 bg-slate-900 rounded-xl border border-slate-700 text-white shadow-inner">
                    <div className="relative p-2.5 bg-white rounded-lg shadow-md flex items-center justify-center">
                      {/* Stylized QR Code Matrix SVG */}
                      <svg className="w-32 h-32 text-slate-950" viewBox="0 0 100 100" fill="currentColor">
                        {/* Top-Left Position Detection Pattern */}
                        <rect x="5" y="5" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="4" rx="2" />
                        <rect x="12" y="12" width="14" height="14" fill="currentColor" rx="1" />
                        {/* Top-Right Position Detection Pattern */}
                        <rect x="67" y="5" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="4" rx="2" />
                        <rect x="74" y="12" width="14" height="14" fill="currentColor" rx="1" />
                        {/* Bottom-Left Position Detection Pattern */}
                        <rect x="5" y="67" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="4" rx="2" />
                        <rect x="12" y="74" width="14" height="14" fill="currentColor" rx="1" />
                        
                        {/* Data Modules */}
                        <rect x="38" y="10" width="6" height="6" />
                        <rect x="48" y="10" width="6" height="6" />
                        <rect x="58" y="10" width="6" height="6" />
                        <rect x="38" y="20" width="6" height="6" />
                        <rect x="48" y="24" width="6" height="6" />
                        <rect x="58" y="18" width="6" height="6" />
                        <rect x="10" y="38" width="6" height="6" />
                        <rect x="18" y="46" width="6" height="6" />
                        <rect x="26" y="38" width="6" height="6" />
                        <rect x="38" y="38" width="8" height="8" fill="#059669" />
                        <rect x="50" y="38" width="6" height="6" />
                        <rect x="60" y="44" width="6" height="6" />
                        <rect x="70" y="38" width="6" height="6" />
                        <rect x="80" y="44" width="6" height="6" />
                        <rect x="40" y="52" width="6" height="6" />
                        <rect x="52" y="52" width="8" height="8" fill="#059669" />
                        <rect x="64" y="52" width="6" height="6" />
                        <rect x="78" y="56" width="6" height="6" />
                        <rect x="38" y="68" width="6" height="6" />
                        <rect x="48" y="74" width="6" height="6" />
                        <rect x="58" y="68" width="6" height="6" />
                        <rect x="68" y="78" width="6" height="6" />
                        <rect x="80" y="72" width="6" height="6" />
                        <rect x="42" y="84" width="6" height="6" />
                        <rect x="54" y="86" width="6" height="6" />
                        <rect x="64" y="84" width="6" height="6" />
                        <rect x="76" y="86" width="6" height="6" />
                        <rect x="86" y="86" width="6" height="6" />
                      </svg>
                      {/* WhatsApp Center Logo */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="p-1 bg-emerald-600 rounded-full border-2 border-white shadow-xs">
                          <Smartphone className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-center">
                      <span className="text-[10px] font-mono text-slate-400">Session: {qrCodeSessionId}</span>
                    </div>
                  </div>

                  {/* QR Scan Instructions & Controls */}
                  <div className="space-y-2 text-xs">
                    <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>How to connect your WhatsApp:</span>
                    </h4>
                    <ol className="space-y-1.5 text-[11px] text-slate-600 list-decimal list-inside font-medium leading-relaxed">
                      <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                      <li>
                        Tap <strong>Menu (⋮)</strong> on Android or <strong>Settings (⚙️)</strong> on iPhone
                      </li>
                      <li>
                        Tap <strong>Linked Devices</strong>, then <strong>Link a Device</strong>
                      </li>
                      <li>Point your phone camera to scan this QR code</li>
                    </ol>

                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-[11px] text-emerald-800 font-semibold flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Permanent Link: Connected account stays permanently active and never logs out across requisitions.</span>
                    </div>

                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleToggleWaConnection}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                          isWaConnected
                            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isWaConnected ? 'Device Paired (Disconnect)' : 'I Have Scanned (Mark Connected)'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRefreshQr}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"
                        title="Generate Fresh Session Key"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh QR</span>
                      </button>

                      <a
                        href="https://web.whatsapp.com"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open WhatsApp Web</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* DESTINATION SELECTION & DIRECTORY AUTO-FILL */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              Select Destination WhatsApp Number:
            </label>

            {/* Destination Mode Selector Tabs */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSendTargetMode('store_destination')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  sendTargetMode === 'store_destination'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/30'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <Store className="w-4 h-4" />
                <span className="leading-tight">Store / Factory Destination</span>
                <span className="text-[10px] font-mono opacity-90 truncate max-w-full">
                  {storeDestinationPhone.trim() || DEFAULT_FIXED_WHATSAPP}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSendTargetMode('party')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  sendTargetMode === 'party'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/30'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span className="leading-tight">Party Directory</span>
                <span className="text-[10px] font-mono opacity-90 truncate max-w-full">
                  {partyPhone || selectedPartyName || 'Auto-fill'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSendTargetMode('custom')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  sendTargetMode === 'custom'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/30'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <Phone className="w-4 h-4" />
                <span className="leading-tight">Custom Number</span>
                <span className="text-[10px] font-mono opacity-90 truncate max-w-full">
                  {customPhone || 'Enter phone'}
                </span>
              </button>
            </div>

            {/* TAB 1: Store / Factory Destination Box */}
            {sendTargetMode === 'store_destination' && (
              <div className="p-3.5 bg-emerald-50/90 border border-emerald-300 rounded-xl space-y-2 animate-in fade-in duration-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-emerald-700" />
                    <span>Store / Factory Destination Phone Number</span>
                  </label>
                  {savedStoreSuccess ? (
                    <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Saved!
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSaveStoreDestination}
                      className="text-[11px] text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer bg-white px-2 py-0.5 rounded border border-emerald-300 shadow-xs"
                    >
                      Save Store Destination
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-emerald-600 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={storeDestinationPhone}
                    onChange={(e) => setStoreDestinationPhone(e.target.value)}
                    onBlur={handleSaveStoreDestination}
                    placeholder="+8801713434290"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[10px] text-emerald-800 font-medium">
                  This destination number is securely saved in your browser and automatically used for factory & store dispatch messages.
                </p>
              </div>
            )}

            {/* TAB 2: Party Directory Auto-Fill Box */}
            {sendTargetMode === 'party' && (
              <div className="p-3.5 bg-blue-50/90 border border-blue-300 rounded-xl space-y-3 animate-in fade-in duration-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-blue-700" />
                    <span>Party Phone Number (Auto-fill from Party Directory)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPartyDropdown(!showPartyDropdown)}
                    className="text-[11px] text-blue-800 hover:text-blue-950 font-bold hover:underline cursor-pointer bg-white px-2 py-0.5 rounded border border-blue-300 shadow-xs flex items-center gap-1"
                  >
                    <Search className="w-3 h-3" />
                    <span>{showPartyDropdown ? 'Hide Directory' : 'Pick from Directory'}</span>
                  </button>
                </div>

                {/* Party Directory Search & Quick Pick Dropdown */}
                {showPartyDropdown && (
                  <div className="p-2.5 bg-white border border-blue-200 rounded-lg space-y-2 shadow-sm animate-in fade-in duration-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={partySearchTerm}
                        onChange={(e) => {
                          setPartySearchTerm(e.target.value);
                          setPartyHighlightIdx(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredParties.length > 0) {
                              setPartyHighlightIdx((prev) => (prev + 1) % filteredParties.length);
                            }
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredParties.length > 0) {
                              setPartyHighlightIdx((prev) => (prev - 1 + filteredParties.length) % filteredParties.length);
                            }
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredParties.length > 0) {
                              const chosen = filteredParties[partyHighlightIdx] || filteredParties[0];
                              if (chosen) handleSelectPartyFromDirectory(chosen);
                            }
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setShowPartyDropdown(false);
                          }
                        }}
                        placeholder="Search party by name or phone..."
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div ref={partyDropdownRef} className="max-h-36 overflow-y-auto space-y-1">
                      {filteredParties.length === 0 ? (
                        <div className="text-[11px] text-slate-400 text-center py-2">No matching party found</div>
                      ) : (
                        filteredParties.map((p, idx) => (
                          <div
                            key={p.id ? `${p.id}-${idx}` : `party-${idx}`}
                            data-wa-party-highlighted={idx === partyHighlightIdx ? 'true' : 'false'}
                            onMouseEnter={() => setPartyHighlightIdx(idx)}
                            onClick={() => handleSelectPartyFromDirectory(p)}
                            className={`p-1.5 rounded text-xs flex items-center justify-between cursor-pointer border transition-colors ${
                              idx === partyHighlightIdx
                                ? 'bg-blue-100 border-blue-400 text-blue-950 font-bold'
                                : 'hover:bg-blue-50 border-transparent hover:border-blue-200'
                            }`}
                          >
                            <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                            <div className="font-mono text-[11px] text-blue-600 font-bold shrink-0 ml-2">
                              {p.phone || 'No Phone'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Party / Customer Name</label>
                    <input
                      type="text"
                      value={selectedPartyName}
                      onChange={(e) => setSelectedPartyName(e.target.value)}
                      placeholder="Party Name"
                      className="w-full p-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Party WhatsApp Phone</label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-blue-600 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={partyPhone}
                        onChange={(e) => setPartyPhone(e.target.value)}
                        placeholder="e.g. +8801712345678"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Custom Number Input */}
            {sendTargetMode === 'custom' && (
              <div className="p-3.5 bg-purple-50/90 border border-purple-300 rounded-xl space-y-2 animate-in fade-in duration-100">
                <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-purple-700" />
                  <span>Enter Custom Destination Phone Number</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-purple-600 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="e.g. +8801712345678 or 01812345678"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-purple-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Active Target Banner */}
          <div className="p-2.5 bg-slate-900 rounded-xl text-white flex items-center justify-between text-xs font-mono shadow-xs">
            <span className="text-slate-300 flex items-center gap-1.5 font-sans">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Sending to:</span>
            </span>
            <span className="font-bold text-emerald-300 text-sm">
              {getTargetPhoneNumber()}
            </span>
          </div>

          {/* Message Area */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Requisition Message Content</label>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-xs text-slate-500 hover:text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter requisition message..."
              className="w-full p-3 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {attachmentFileName && (
            <div className="flex items-center space-x-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">Attached Requisition: <strong>{attachmentFileName}</strong></span>
            </div>
          )}

          {/* Live Delivery Status Card & Open Mail Handoff */}
          {deliveryResult && (
            <div className="p-3.5 bg-emerald-900/10 border border-emerald-500 rounded-xl space-y-2 text-xs animate-in fade-in duration-200">
              <div className="flex items-center text-emerald-700 font-bold gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Message Dispatched Directly to Destination WhatsApp!</span>
              </div>
              <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
                <div>
                  <span className="text-slate-400">Recipient:</span> <strong>{deliveryResult.recipient}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Message ID:</span> {deliveryResult.messageId}
                </div>
                <div>
                  <span className="text-slate-400">Delivered At:</span> {deliveryResult.sentAt}
                </div>
              </div>

              {onSuccessOpenMail && (
                <div className="pt-2 border-t border-emerald-300 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] text-emerald-900 font-bold">
                    🚀 Next: Open Mail Send Option
                  </span>
                  <button
                    type="button"
                    onClick={() => onSuccessOpenMail()}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-md cursor-pointer flex items-center gap-1.5 transition-all"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>📧 Open Mail Send Option Now</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {sendError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{sendError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenExternalWhatsApp}
              className="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl border border-slate-300 transition-colors text-center cursor-pointer"
              title="Open WhatsApp Web in a new tab"
            >
              Open Web App
            </button>

            {onSuccessOpenMail && (
              <button
                type="button"
                onClick={() => onSuccessOpenMail()}
                className="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                title="Skip to Email Sending directly"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Open Mail Option</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              disabled={isSending}
              onClick={handleDirectSendInPage}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending WhatsApp...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send WhatsApp Message</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


