import React, { useState, useMemo, useEffect } from 'react';
import {
  Requisition,
  BranchLocation,
  Item,
  Salesperson,
  RequisitionStage,
  BranchType,
  RequisitionLineItem,
  AuditLogEntry
} from '../types';
import { isUnwantedSalesCenter } from '../utils/branchAccess';
import {
  ShieldCheck,
  Building2,
  FileCheck2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  Printer,
  ChevronRight,
  AlertCircle,
  Truck,
  FileText,
  UserCheck,
  Layers,
  ArrowRight,
  Info,
  Check,
  X,
  History,
  CornerDownRight,
  Shield,
  Factory
} from 'lucide-react';
import { PolyCablesBanner } from './PolyCablesBanner';
import { defaultCompany } from '../data/defaultData';
import { formatDateDDMMYY } from '../utils/dateUtils';

interface AuditDirectoryProps {
  requisitions: Requisition[];
  setRequisitions: React.Dispatch<React.SetStateAction<Requisition[]>>;
  branches: BranchLocation[];
  setBranches: React.Dispatch<React.SetStateAction<BranchLocation[]>>;
  items: Item[];
  salespersons: Salesperson[];
  onDispatchToFactoryChallan?: (req: Requisition) => void;
}

export const AuditDirectory: React.FC<AuditDirectoryProps> = ({
  requisitions,
  setRequisitions,
  branches,
  setBranches,
  items,
  salespersons,
  onDispatchToFactoryChallan
}) => {
  // Tabs: 'requisitions' (Workflow / Queue), 'audit_queue' (Audit Directory focus), 'branches' (Showroom & In-Charge Setup), 'analytics'
  const [activeTab, setActiveTab] = useState<'audit_queue' | 'all_requisitions' | 'branches' | 'new_requisition'>('audit_queue');
  
  const cleanSortedBranches = useMemo(() => {
    return branches
      .filter(b => !isUnwantedSalesCenter(b))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [branches]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  
  // Active selected Requisition for Detail / Action Modal
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
  const [viewDetailModal, setViewDetailModal] = useState(false);
  const [approvalActionModal, setApprovalActionModal] = useState<{
    req: Requisition;
    actionType: 'incharge_approve' | 'approver_approve' | 'audit_approve' | 'factory_dispatch' | 'reject' | 'request_revision';
  } | null>(null);
  const [actionComments, setActionComments] = useState('');
  const [actionActorName, setActionActorName] = useState('');
  const [auditVerificationNo, setAuditVerificationNo] = useState('');
  
  // Branch Management Modal
  const [editingBranch, setEditingBranch] = useState<BranchLocation | null>(null);
  const [branchModalOpen, setBranchModalOpen] = useState(false);

  // New Requisition Form State
  const [formBranchId, setFormBranchId] = useState<string>(cleanSortedBranches[0]?.id || branches[0]?.id || '');

  useEffect(() => {
    if (cleanSortedBranches.length > 0 && !cleanSortedBranches.some((b) => b.id === formBranchId)) {
      setFormBranchId(cleanSortedBranches[0].id);
    }
  }, [cleanSortedBranches, formBranchId]);
  const [formCreatorName, setFormCreatorName] = useState('Showroom Associate');
  const [formUrgency, setFormUrgency] = useState<'normal' | 'urgent' | 'emergency'>('normal');
  const [formRemarks, setFormRemarks] = useState('');
  const [formLines, setFormLines] = useState<RequisitionLineItem[]>([
    {
      id: `rline-${Date.now()}-1`,
      itemId: items[0]?.id || '',
      itemCode: items[0]?.code || '',
      itemName: items[0]?.name || '',
      sizeSpec: items[0]?.sizeSpec || '',
      unit: items[0]?.unit || 'Coils',
      category: items[0]?.category || 'BYA',
      currentStock: items[0]?.openingStock || 0,
      requestedQty: 10,
      approvedQty: 10,
      rate: items[0]?.rate || 0,
      amount: (items[0]?.rate || 0) * 10,
      remarks: ''
    }
  ]);

  // Selected Branch in creation form
  const currentFormBranch = useMemo(() => {
    return branches.find(b => b.id === formBranchId) || branches[0];
  }, [branches, formBranchId]);

  // Handle adding line in New Requisition Form
  const handleAddFormLine = () => {
    const firstItem = items[0];
    setFormLines(prev => [
      ...prev,
      {
        id: `rline-${Date.now()}-${prev.length + 1}`,
        itemId: firstItem?.id || '',
        itemCode: firstItem?.code || '',
        itemName: firstItem?.name || '',
        sizeSpec: firstItem?.sizeSpec || '',
        unit: firstItem?.unit || 'Coils',
        category: firstItem?.category || 'BYA',
        currentStock: firstItem?.openingStock || 0,
        requestedQty: 5,
        approvedQty: 5,
        rate: firstItem?.rate || 0,
        amount: (firstItem?.rate || 0) * 5,
        remarks: ''
      }
    ]);
  };

  const handleRemoveFormLine = (index: number) => {
    if (formLines.length === 1) return;
    setFormLines(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleFormLineItemChange = (index: number, itemId: string) => {
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    setFormLines(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        itemId: it.id,
        itemCode: it.code,
        itemName: it.name,
        sizeSpec: it.sizeSpec,
        unit: it.unit,
        category: it.category,
        currentStock: it.openingStock,
        rate: it.rate,
        amount: (copy[index].requestedQty || 0) * it.rate
      };
      return copy;
    });
  };

  const handleFormLineQtyChange = (index: number, qty: number) => {
    setFormLines(prev => {
      const copy = [...prev];
      const validQty = Math.max(0, qty);
      copy[index] = {
        ...copy[index],
        requestedQty: validQty,
        approvedQty: validQty,
        amount: validQty * (copy[index].rate || 0)
      };
      return copy;
    });
  };

  // Submit New Requisition with Automatic Route Decision:
  // - Showroom -> stage: 'pending_incharge' (needs in-charge approval)
  // - Head Office / Power Market -> stage: 'pending_approver' (bypasses in-charge)
  const handleCreateRequisitionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFormBranch) return;

    const isShowroom = currentFormBranch.type === 'showroom';
    const initialStage: RequisitionStage = isShowroom ? 'pending_incharge' : 'pending_approver';
    
    // Generate reqNo
    const count = requisitions.length + 1;
    const reqNo = `REQ-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;

    const totalQty = formLines.reduce((sum, l) => sum + (l.requestedQty || 0), 0);
    const totalAmt = formLines.reduce((sum, l) => sum + (l.amount || 0), 0);

    const initialLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: formCreatorName || 'Associate',
      actorRole: 'associate',
      action: isShowroom
        ? 'Requisition Created & Sent to Showroom In-Charge'
        : 'Requisition Created & Sent directly to Approver (Power Market / H.O)',
      fromStage: 'draft',
      toStage: initialStage,
      comments: formRemarks || (isShowroom ? 'Awaiting In-Charge confirmation' : 'Direct to Approver')
    };

    const newReq: Requisition = {
      id: `req-${Date.now()}`,
      reqNo,
      date: new Date().toISOString().split('T')[0],
      branchId: currentFormBranch.id,
      branchName: currentFormBranch.name,
      branchType: currentFormBranch.type,
      needsInChargeApproval: isShowroom,
      createdByUserId: 'user-current',
      createdByName: formCreatorName,
      createdByRole: isShowroom ? 'Showroom Associate' : 'Branch Staff',
      inChargeId: currentFormBranch.inChargeId,
      inChargeName: currentFormBranch.inChargeName,
      approverId: currentFormBranch.approverId,
      approverName: currentFormBranch.approverName,
      stage: initialStage,
      urgency: formUrgency,
      remarks: formRemarks,
      lines: formLines,
      totalRequestedQty: totalQty,
      totalApprovedQty: totalQty,
      totalAmount: totalAmt,
      auditLogs: [initialLog],
      savedAt: new Date().toISOString()
    };

    setRequisitions(prev => [newReq, ...prev]);
    setActiveTab(isShowroom ? 'all_requisitions' : 'all_requisitions');
    setSelectedReq(newReq);
    setViewDetailModal(true);
    setFormRemarks('');
  };

  // Workflow State Transitions
  const handleExecuteAction = () => {
    if (!approvalActionModal) return;
    const { req, actionType } = approvalActionModal;
    const timestamp = new Date().toISOString();

    let nextStage: RequisitionStage = req.stage;
    let actionLabel = '';
    let actorRole: AuditLogEntry['actorRole'] = 'admin';

    const updatedReq: Requisition = { ...req, updatedAt: timestamp };

    if (actionType === 'incharge_approve') {
      nextStage = 'pending_approver';
      actionLabel = 'Showroom In-Charge Approved';
      actorRole = 'in_charge';
      updatedReq.inChargeApprovalDate = timestamp;
      updatedReq.inChargeComments = actionComments || 'Approved by Showroom In-Charge';
    } else if (actionType === 'approver_approve') {
      nextStage = 'in_audit'; // GOES TO AUDIT DIRECTORY!
      actionLabel = 'Assigned Approver Approved → Sent to Audit Directory';
      actorRole = 'approver';
      updatedReq.approverApprovalDate = timestamp;
      updatedReq.approverComments = actionComments || 'Quantities approved by Approver. Forwarded to Audit Directory.';
    } else if (actionType === 'audit_approve') {
      nextStage = 'sent_to_factory'; // AUDIT APPROVES → GOES TO FACTORY!
      actionLabel = 'Audit Directory Approved → Forwarded to Factory';
      actorRole = 'auditor';
      updatedReq.auditApprovalDate = timestamp;
      const verNo = auditVerificationNo.trim() || `AUD-VER-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
      updatedReq.auditVerificationNumber = verNo;
      updatedReq.auditComments = actionComments || 'Audit inspection passed. Cleared for factory dispatch.';
      updatedReq.factoryStatus = 'pending_dispatch';
    } else if (actionType === 'factory_dispatch') {
      nextStage = 'factory_dispatched';
      actionLabel = 'Factory Dispatched Goods';
      actorRole = 'factory';
      updatedReq.factoryStatus = 'dispatched';
      updatedReq.factoryDispatchDate = timestamp;
    } else if (actionType === 'reject') {
      nextStage = 'rejected';
      actionLabel = 'Requisition Rejected';
      actorRole = 'admin';
    } else if (actionType === 'request_revision') {
      nextStage = 'revision_requested';
      actionLabel = 'Revision Requested';
      actorRole = 'auditor';
    }

    updatedReq.stage = nextStage;

    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp,
      actorName: actionActorName || (actorRole === 'in_charge' ? req.inChargeName || 'In-Charge' : actorRole === 'approver' ? req.approverName || 'Approver' : actorRole === 'auditor' ? 'Audit Directorate' : 'Manager'),
      actorRole,
      action: actionLabel,
      fromStage: req.stage,
      toStage: nextStage,
      comments: actionComments
    };

    updatedReq.auditLogs = [...(updatedReq.auditLogs || []), newLog];

    setRequisitions(prev => prev.map(r => r.id === req.id ? updatedReq : r));
    setApprovalActionModal(null);
    setSelectedReq(updatedReq);
    setActionComments('');
    setActionActorName('');
    setAuditVerificationNo('');
  };

  // Branch Save / Edit
  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;

    if (editingBranch.id) {
      setBranches(prev => prev.map(b => b.id === editingBranch.id ? editingBranch : b));
    } else {
      const newB: BranchLocation = {
        ...editingBranch,
        id: `branch-${Date.now()}`
      };
      setBranches(prev => [...prev, newB]);
    }
    setBranchModalOpen(false);
    setEditingBranch(null);
  };

  // Filtered Requisitions
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter(r => {
      const matchSearch =
        r.reqNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.createdByName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.inChargeName && r.inChargeName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchBranch = selectedBranchFilter === 'all' || r.branchId === selectedBranchFilter;
      const matchStage = selectedStageFilter === 'all' || r.stage === selectedStageFilter;

      return matchSearch && matchBranch && matchStage;
    });
  }, [requisitions, searchTerm, selectedBranchFilter, selectedStageFilter]);

  // Requisitions Waiting in Audit Directory
  const auditQueueRequisitions = useMemo(() => {
    return requisitions.filter(r => r.stage === 'in_audit');
  }, [requisitions]);

  const getStageBadge = (stage: RequisitionStage) => {
    switch (stage) {
      case 'pending_incharge':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
            <Clock className="w-3 h-3 mr-1" /> 1. In-Charge Review
          </span>
        );
      case 'pending_approver':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <UserCheck className="w-3 h-3 mr-1" /> 2. Approver Assigned
          </span>
        );
      case 'in_audit':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse">
            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-purple-400" /> 3. IN AUDIT DIRECTORY
          </span>
        );
      case 'sent_to_factory':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Factory className="w-3 h-3 mr-1" /> 4. Approved & At Factory
          </span>
        );
      case 'factory_dispatched':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-teal-500/10 text-teal-300 border border-teal-500/30">
            <Truck className="w-3 h-3 mr-1" /> Factory Dispatched
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </span>
        );
      case 'revision_requested':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <AlertCircle className="w-3 h-3 mr-1" /> Revision Requested
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{stage}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="cyber-glass-card rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2.5 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-purple-900/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  Audit Directory & Requisition Approvals
                  <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono">
                    Poly Cables Ind. Ltd.
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Multi-tier requisition governance: Associate ➔ Showroom In-Charge ➔ Assigned Approver ➔ Audit Directory ➔ Factory Dispatch.
                </p>
              </div>
            </div>

            {/* Rule Explanatory Tag */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="bg-slate-800/90 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <strong>Showrooms:</strong> Require Showroom In-Charge approval first
              </span>
              <span className="bg-slate-800/90 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <strong>Head Office & Power Market:</strong> No in-charge needed (direct to Approver)
              </span>
              <span className="bg-purple-950/80 text-purple-200 px-2.5 py-1 rounded-lg border border-purple-800/60 flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <strong>Audit Directory:</strong> Final audit clearance before Factory Dispatch
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setActiveTab('new_requisition')}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Requisition</span>
            </button>
            <button
              onClick={() => setActiveTab('branches')}
              className="bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-amber-400" />
              <span>Branch & In-Charge Setup</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 border-t border-slate-800/80 pt-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('audit_queue')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'audit_queue'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Audit Directory Queue</span>
            {auditQueueRequisitions.length > 0 && (
              <span className="bg-purple-950 text-purple-200 border border-purple-400/40 text-[10px] px-2 py-0.2 rounded-full font-mono font-black">
                {auditQueueRequisitions.length} PENDING
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('all_requisitions')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'all_requisitions'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Requisitions Workflow</span>
            <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {requisitions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('branches')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'branches'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Showrooms & In-Charges</span>
            <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {branches.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('new_requisition')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'new_requisition'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Create Requisition</span>
          </button>
        </div>
      </div>

      {/* 1. AUDIT DIRECTORY QUEUE VIEW */}
      {activeTab === 'audit_queue' && (
        <div className="space-y-4">
          <div className="bg-purple-950/30 border border-purple-800/40 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    Audit Directory Approval Gate
                  </h2>
                  <p className="text-xs text-purple-300/80">
                    Requisitions approved by Approvers arrive here for final auditing. Once Audit approves, the order is cleared and sent directly to the Factory.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black font-mono text-purple-300">
                  {auditQueueRequisitions.length}
                </div>
                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                  Pending Audit Clearance
                </div>
              </div>
            </div>
          </div>

          {auditQueueRequisitions.length === 0 ? (
            <div className="cyber-glass-card rounded-2xl p-12 text-center">
              <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-300">Audit Directory Queue is Clear</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                There are no requisitions currently awaiting audit sign-off. As approvers sign off requisitions, they will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {auditQueueRequisitions.map(req => (
                <div
                  key={req.id}
                  className="bg-slate-900 border-2 border-purple-600/40 hover:border-purple-500 rounded-2xl p-5 shadow-xl transition-all space-y-4 relative"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-black font-mono text-purple-300">{req.reqNo}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          req.urgency === 'emergency' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                          req.urgency === 'urgent' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {req.urgency}
                        </span>
                      </div>
                      <h4 className="text-base font-extrabold text-white mt-1">{req.branchName}</h4>
                      <p className="text-xs text-slate-400">Date: {formatDateDDMMYY(req.date)}</p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-400">Total Value</div>
                      <div className="text-base font-black font-mono text-emerald-400">
                        ৳ {(req.totalAmount ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-400">{req.totalRequestedQty} Coils / Units</div>
                    </div>
                  </div>

                  {/* Flow Trace */}
                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>Initiator: <strong>{req.createdByName}</strong></span>
                      <span>Branch: <strong className="capitalize">{req.branchType.replace('_', ' ')}</strong></span>
                    </div>
                    {req.needsInChargeApproval && (
                      <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>In-Charge Signed: <strong>{req.inChargeName}</strong></span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-blue-400 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approver Signed: <strong>{req.approverName}</strong></span>
                    </div>
                  </div>

                  {/* Item Breakdown Preview */}
                  <div className="border border-slate-800/80 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-white/[0.06] text-cyan-200 text-[10px] uppercase font-mono">
                        <tr>
                          <th className="py-1.5 px-3">Item / Size</th>
                          <th className="py-1.5 px-3 text-right">Current Stk</th>
                          <th className="py-1.5 px-3 text-right">Req Qty</th>
                          <th className="py-1.5 px-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.08] text-slate-300 text-[11px]">
                        {req.lines.map(line => (
                          <tr key={line.id}>
                            <td className="py-1.5 px-3 font-medium">
                              {line.itemName}
                              {line.sizeSpec && <span className="text-slate-500 ml-1">({line.sizeSpec})</span>}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-slate-400">{line.currentStock ?? '-'}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-white">{line.requestedQty} {line.unit}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-emerald-400">৳{(line.amount ?? 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Audit Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        setSelectedReq(req);
                        setViewDetailModal(true);
                      }}
                      className="flex-1 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Full Audit File</span>
                    </button>

                    <button
                      onClick={() => {
                        setApprovalActionModal({
                          req,
                          actionType: 'audit_approve'
                        });
                        setActionActorName('Chief Auditor (Audit Directorate)');
                        setAuditVerificationNo(`AUD-VER-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                        setActionComments('Stock verified against physical audits and showroom monthly quota. Approved for Factory production/dispatch.');
                      }}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-900/30 transition-all cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Audit Approve ➔ Send to Factory</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. ALL REQUISITIONS WORKFLOW DIRECTORY */}
      {activeTab === 'all_requisitions' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="cyber-glass-card rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1 w-full relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search requisition #, branch, showroom in-charge, initiator..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full cyber-glass-input rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={selectedBranchFilter}
                onChange={e => setSelectedBranchFilter(e.target.value)}
                className="cyber-glass-input text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Branches</option>
                {cleanSortedBranches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              <select
                value={selectedStageFilter}
                onChange={e => setSelectedStageFilter(e.target.value)}
                className="cyber-glass-input text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Stages</option>
                <option value="pending_incharge">1. Pending In-Charge</option>
                <option value="pending_approver">2. Pending Approver</option>
                <option value="in_audit">3. In Audit Directory</option>
                <option value="sent_to_factory">4. Approved & At Factory</option>
                <option value="factory_dispatched">Factory Dispatched</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="cyber-glass-card rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white/[0.06] text-cyan-200 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Req # & Date</th>
                    <th className="py-3 px-4">Branch / Showroom</th>
                    <th className="py-3 px-4">Initiator / Role</th>
                    <th className="py-3 px-4">In-Charge Status</th>
                    <th className="py-3 px-4">Approver</th>
                    <th className="py-3 px-4">Current Stage</th>
                    <th className="py-3 px-4 text-right">Total Coils</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.08] text-xs text-slate-300">
                  {filteredRequisitions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No requisitions found matching the criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRequisitions.map(req => (
                      <tr key={req.id} className="hover:bg-white/[0.05] transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-purple-300">{req.reqNo}</div>
                          <div className="text-[10px] text-slate-500">{formatDateDDMMYY(req.date)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{req.branchName}</div>
                          <div className="text-[10px] text-slate-400 capitalize flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-amber-400" />
                            {req.branchType.replace('_', ' ')}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-200">{req.createdByName}</div>
                          <div className="text-[10px] text-slate-500">{req.createdByRole || 'Staff'}</div>
                        </td>
                        <td className="py-3 px-4">
                          {!req.needsInChargeApproval ? (
                            <span className="text-[11px] text-slate-400 italic">Not required (H.O / Power Mkt)</span>
                          ) : req.inChargeApprovalDate ? (
                            <div className="text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{req.inChargeName}</span>
                            </div>
                          ) : (
                            <div className="text-amber-400 font-medium flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pending {req.inChargeName}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-300 font-medium">{req.approverName || 'Not Assigned'}</div>
                          {req.approverApprovalDate && (
                            <span className="text-[10px] text-blue-400 font-mono">Approved</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {getStageBadge(req.stage)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                          {req.totalRequestedQty}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          ৳{(req.totalAmount ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedReq(req);
                                setViewDetailModal(true);
                              }}
                              className="p-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 rounded-lg transition-colors cursor-pointer"
                              title="View Requisition & Logs"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Contextual Action Button depending on current stage */}
                            {req.stage === 'pending_incharge' && (
                              <button
                                onClick={() => {
                                  setApprovalActionModal({
                                    req,
                                    actionType: 'incharge_approve'
                                  });
                                  setActionActorName(req.inChargeName || 'Showroom In-Charge');
                                  setActionComments('Showroom stock shortage verified. Recommended for approver sign-off.');
                                }}
                                className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-2 py-1 rounded-lg text-[10px] cursor-pointer"
                                title="Showroom In-Charge Approve"
                              >
                                In-Charge Approve
                              </button>
                            )}

                            {req.stage === 'pending_approver' && (
                              <button
                                onClick={() => {
                                  setApprovalActionModal({
                                    req,
                                    actionType: 'approver_approve'
                                  });
                                  setActionActorName(req.approverName || '');
                                  setActionComments('Approved quantities within allocation. Forwarded to Audit Directory.');
                                }}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 py-1 rounded-lg text-[10px] cursor-pointer"
                                title="Approver Sign-off"
                              >
                                Approver Sign ➔ Audit
                              </button>
                            )}

                            {req.stage === 'in_audit' && (
                              <button
                                onClick={() => {
                                  setApprovalActionModal({
                                    req,
                                    actionType: 'audit_approve'
                                  });
                                  setActionActorName('Chief Auditor');
                                  setAuditVerificationNo(`AUD-VER-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                                  setActionComments('Audit clearance granted.');
                                }}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-2 py-1 rounded-lg text-[10px] cursor-pointer shadow-xs"
                                title="Audit Directory Approve"
                              >
                                Audit ➔ Factory
                              </button>
                            )}

                            {req.stage === 'sent_to_factory' && (
                              <button
                                onClick={() => {
                                  setApprovalActionModal({
                                    req,
                                    actionType: 'factory_dispatch'
                                  });
                                  setActionActorName('Factory Dispatch Officer');
                                  setActionComments('Production & loading complete. Dispatched via truck.');
                                }}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded-lg text-[10px] cursor-pointer"
                                title="Mark as Factory Dispatched"
                              >
                                Factory Dispatch
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. SHOWROOMS & IN-CHARGE DIRECTORY SETUP */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="cyber-glass-card rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                Branch Location & In-Charge Setup
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Every Showroom is manually assigned an In-Charge. Head Office and Power Market branches do not require an in-charge.
              </p>
            </div>

            <button
              onClick={() => {
                setEditingBranch({
                  id: '',
                  name: '',
                  type: 'showroom',
                  inChargeId: salespersons[0]?.id || '',
                  inChargeName: salespersons[0]?.name || '',
                  approverName: '',
                  address: '',
                  phone: '',
                  isActive: true
                });
                setBranchModalOpen(true);
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Branch / Showroom</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cleanSortedBranches.map(branch => {
              const isShowroom = branch.type === 'showroom';
              return (
                <div
                  key={branch.id}
                  className="cyber-glass-card rounded-2xl p-5 hover:border-slate-700 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        branch.type === 'showroom' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        branch.type === 'power_market' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                        'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}>
                        {branch.type.replace('_', ' ')}
                      </span>
                      <h3 className="text-base font-bold text-white mt-1.5">{branch.name}</h3>
                      {branch.address && <p className="text-xs text-slate-400 mt-0.5">{branch.address}</p>}
                    </div>

                    <button
                      onClick={() => {
                        setEditingBranch(branch);
                        setBranchModalOpen(true);
                      }}
                      className="p-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 rounded-lg transition-colors cursor-pointer"
                      title="Edit Branch & In-Charge"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* In-Charge Details Box */}
                  <div className="bg-white/[0.04] border border-white/[0.12] rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium">In-Charge Requirement:</span>
                      {isShowroom ? (
                        <span className="text-amber-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Mandatory
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Not Required</span>
                      )}
                    </div>

                    {isShowroom && (
                      <div className="border-t border-slate-800/60 pt-2">
                        <div className="text-[11px] text-slate-400">Assigned In-Charge:</div>
                        <div className="font-bold text-emerald-400 text-sm">{branch.inChargeName || 'Not Assigned'}</div>
                        {branch.inChargePhone && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{branch.inChargePhone}</div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-slate-800/60 pt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Assigned Approver:</span>
                      <span className="text-blue-300 font-bold">{branch.approverName || 'Not Assigned'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. CREATE NEW REQUISITION FORM */}
      {activeTab === 'new_requisition' && (
        <form onSubmit={handleCreateRequisitionSubmit} className="space-y-6">
          <div className="cyber-glass-card rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-400" />
                  Initiate Cable Requisition
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select branch. Showrooms will route to their designated In-Charge first; Head Office & Power Market will route directly to Approver.
                </p>
              </div>
            </div>

            {/* Branch Selection & Requisition Meta */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Requisition Branch / Showroom *
                </label>
                <select
                  value={formBranchId}
                  onChange={e => setFormBranchId(e.target.value)}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  required
                >
                  {cleanSortedBranches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.type.replace('_', ' ').toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Initiator / Associate Name *
                </label>
                <input
                  type="text"
                  value={formCreatorName}
                  onChange={e => setFormCreatorName(e.target.value)}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  placeholder="e.g. Kabir Associate"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Priority / Urgency
                </label>
                <select
                  value={formUrgency}
                  onChange={e => setFormUrgency(e.target.value as any)}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="normal">Normal (Routine Restock)</option>
                  <option value="urgent">Urgent (High Demand)</option>
                  <option value="emergency">Emergency (Contract / Project Order)</option>
                </select>
              </div>
            </div>

            {/* Workflow Routing Indicator Notice */}
            {currentFormBranch && (
              <div className={`p-4 rounded-xl text-xs border ${
                currentFormBranch.type === 'showroom'
                  ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                  : 'bg-blue-950/30 border-blue-800/50 text-blue-200'
              }`}>
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <Info className="w-4 h-4" />
                  Routing Plan for {currentFormBranch.name}:
                </div>
                {currentFormBranch.type === 'showroom' ? (
                  <p>
                    Because this is a <strong>Showroom</strong>, submission will go first to designated In-Charge:{' '}
                    <strong className="text-amber-300">{currentFormBranch.inChargeName || 'Showroom In-Charge'}</strong>. Once approved, it routes to Approver ➔ Audit Directory ➔ Factory.
                  </p>
                ) : (
                  <p>
                    Because this is <strong>{currentFormBranch.type.replace('_', ' ').toUpperCase()}</strong>, no Showroom In-Charge is required. Submission goes directly to Approver:{' '}
                    <strong className="text-blue-300">{currentFormBranch.approverName || 'Assigned Approver'}</strong> ➔ Audit Directory ➔ Factory.
                  </p>
                )}
              </div>
            )}

            {/* Requisition Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Requisition Line Items (Cables & Wire Specifications)</h3>
                <button
                  type="button"
                  onClick={handleAddFormLine}
                  className="bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Add Cable Item</span>
                </button>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-white/[0.06] text-cyan-200 text-[10px] uppercase font-mono">
                    <tr>
                      <th className="py-2.5 px-3">SL</th>
                      <th className="py-2.5 px-3">Select Master Cable Item</th>
                      <th className="py-2.5 px-3 text-right">Current Live Stock</th>
                      <th className="py-2.5 px-3 text-right">Req. Quantity</th>
                      <th className="py-2.5 px-3 text-right">Unit Rate (৳)</th>
                      <th className="py-2.5 px-3 text-right">Est. Amount (৳)</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.08] text-xs">
                    {formLines.map((line, idx) => (
                      <tr key={line.id} className="bg-slate-900/60">
                        <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <select
                            value={line.itemId}
                            onChange={e => handleFormLineItemChange(idx, e.target.value)}
                            className="w-full cyber-glass-input rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          >
                            {items.map(it => (
                              <option key={it.id} value={it.id}>
                                [{it.code}] {it.name} {it.sizeSpec ? `— ${it.sizeSpec}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                          {line.currentStock ?? 0} {line.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="1"
                            value={line.requestedQty}
                            onChange={e => handleFormLineQtyChange(idx, parseInt(e.target.value, 10) || 0)}
                            className="w-24 cyber-glass-input rounded-lg px-2 py-1 text-right text-xs text-white font-mono font-bold focus:outline-none"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                          {(line.rate ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                          ৳{(line.amount ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFormLine(idx)}
                            disabled={formLines.length === 1}
                            className="p-1 text-rose-400 hover:text-rose-300 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/[0.05] text-white font-bold">
                    <tr>
                      <td colSpan={3} className="py-3 px-4 text-right uppercase tracking-wider font-mono">
                        Grand Total:
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-300">
                        {formLines.reduce((s, l) => s + (l.requestedQty || 0), 0)} Coils / Units
                      </td>
                      <td></td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 text-sm">
                        ৳{formLines.reduce((s, l) => s + (l.amount || 0), 0).toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Requisition Purpose / Remarks
              </label>
              <textarea
                value={formRemarks}
                onChange={e => setFormRemarks(e.target.value)}
                placeholder="Mention reasons for requirement, specific dealer commitments, or project deadlines..."
                rows={2}
                className="w-full cyber-glass-input rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('all_requisitions')}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-purple-900/30 flex items-center gap-2 cursor-pointer transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Submit Requisition</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* DETAIL / AUDIT LOG MODAL */}
      {viewDetailModal && selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="cyber-glass-card rounded-2xl w-full max-w-4xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-white font-mono">{selectedReq.reqNo}</h2>
                  {getStageBadge(selectedReq.stage)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedReq.branchName} • Created on {formatDateDDMMYY(selectedReq.date)}
                </p>
              </div>

              <button
                onClick={() => setViewDetailModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Workflow Progress Bar */}
            <div className="bg-white/[0.04] border border-white/[0.12] rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Lifecycle Progression
              </h3>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {/* Step 1 */}
                <div className={`p-2.5 rounded-xl border ${
                  selectedReq.stage !== 'draft' ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  <div className="font-bold">1. Initiation</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{selectedReq.createdByName}</div>
                </div>

                {/* Step 2 */}
                <div className={`p-2.5 rounded-xl border ${
                  !selectedReq.needsInChargeApproval ? 'bg-slate-800/50 border-slate-700 text-slate-400 italic' :
                  selectedReq.inChargeApprovalDate ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' :
                  selectedReq.stage === 'pending_incharge' ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 animate-pulse' :
                  'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  <div className="font-bold">2. In-Charge</div>
                  <div className="text-[10px] mt-0.5">
                    {!selectedReq.needsInChargeApproval ? 'Bypassed (H.O)' : selectedReq.inChargeApprovalDate ? 'Approved' : 'Pending'}
                  </div>
                </div>

                {/* Step 3 */}
                <div className={`p-2.5 rounded-xl border ${
                  selectedReq.approverApprovalDate ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' :
                  selectedReq.stage === 'pending_approver' ? 'bg-blue-950/40 border-blue-500/50 text-blue-300 animate-pulse' :
                  'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  <div className="font-bold">3. Approver</div>
                  <div className="text-[10px] mt-0.5">
                    {selectedReq.approverApprovalDate ? 'Approved' : selectedReq.stage === 'pending_approver' ? 'In Review' : 'Waiting'}
                  </div>
                </div>

                {/* Step 4 */}
                <div className={`p-2.5 rounded-xl border ${
                  selectedReq.auditApprovalDate ? 'bg-purple-950/60 border-purple-500/60 text-purple-200' :
                  selectedReq.stage === 'in_audit' ? 'bg-purple-950/40 border-purple-500/50 text-purple-300 animate-pulse' :
                  'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  <div className="font-bold">4. Audit Directory</div>
                  <div className="text-[10px] mt-0.5">
                    {selectedReq.auditApprovalDate ? 'Cleared ➔ Factory' : selectedReq.stage === 'in_audit' ? 'In Audit Gate' : 'Waiting'}
                  </div>
                </div>
              </div>
            </div>

            {/* Line items table */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Requisition Items</h3>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.06] text-cyan-200 text-[10px] uppercase font-mono">
                    <tr>
                      <th className="py-2 px-3">Item Name</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3 text-right">Req. Qty</th>
                      <th className="py-2 px-3 text-right">Rate</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.08] text-slate-300">
                    {selectedReq.lines.map(l => (
                      <tr key={l.id}>
                        <td className="py-2 px-3 font-semibold text-white">{l.itemName} ({l.sizeSpec || l.itemCode})</td>
                        <td className="py-2 px-3 text-slate-400">{l.category || '-'}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-300">{l.requestedQty} {l.unit}</td>
                        <td className="py-2 px-3 text-right font-mono">৳{(l.rate ?? 0).toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">৳{(l.amount ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/[0.06] font-bold">
                    <tr>
                      <td colSpan={2} className="py-2.5 px-3 text-right">Totals:</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-300">{selectedReq.totalRequestedQty} Coils</td>
                      <td></td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400 text-sm">৳{(selectedReq.totalAmount ?? 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Audit Trail Log History */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <History className="w-4 h-4 text-purple-400" />
                Audit Trail & Signature Timeline
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedReq.auditLogs?.map(log => (
                  <div key={log.id} className="bg-white/[0.04] border border-white/[0.12] rounded-xl p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-300">{log.action}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-300 text-[11px]">
                      Actor: <strong className="text-white">{log.actorName}</strong> ({log.actorRole})
                    </div>
                    {log.comments && (
                      <p className="text-[11px] text-slate-400 italic bg-slate-900/60 p-2 rounded-lg mt-1 border border-slate-800">
                        "{log.comments}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer modal actions */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <button
                onClick={() => setViewDetailModal(false)}
                className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
              >
                Close
              </button>

              {/* Context Action */}
              {selectedReq.stage === 'in_audit' && (
                <button
                  onClick={() => {
                    setViewDetailModal(false);
                    setApprovalActionModal({
                      req: selectedReq,
                      actionType: 'audit_approve'
                    });
                    setActionActorName('Chief Auditor');
                    setAuditVerificationNo(`AUD-VER-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                    setActionComments('Audit verified. Cleared for Factory Dispatch.');
                  }}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Audit Clearance ➔ Send to Factory</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL ACTION MODAL */}
      {approvalActionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="cyber-glass-card rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                Confirm Workflow Transition
              </h3>
              <button
                onClick={() => setApprovalActionModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <p>Requisition: <strong className="text-purple-300 font-mono">{approvalActionModal.req.reqNo}</strong></p>
              <p>Branch: <strong>{approvalActionModal.req.branchName}</strong></p>
              <p>Total Value: <strong className="text-emerald-400 font-mono">৳{approvalActionModal.req.totalAmount.toLocaleString()}</strong></p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Actor Name / Signer Designation *
                </label>
                <input
                  type="text"
                  value={actionActorName}
                  onChange={e => setActionActorName(e.target.value)}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              {approvalActionModal.actionType === 'audit_approve' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Audit Verification / Clearance Ref #
                  </label>
                  <input
                    type="text"
                    value={auditVerificationNo}
                    onChange={e => setAuditVerificationNo(e.target.value)}
                    className="w-full cyber-glass-input rounded-xl px-3 py-2 text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-500"
                    placeholder="e.g. AUD-VER-2026-089"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Audit / Approval Remarks & Comments
                </label>
                <textarea
                  value={actionComments}
                  onChange={e => setActionComments(e.target.value)}
                  className="w-full cyber-glass-input rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setApprovalActionModal(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteAction}
                className="bg-purple-600 hover:bg-purple-500 text-white font-black px-5 py-2 rounded-xl text-xs shadow-lg cursor-pointer"
              >
                Confirm & Sign Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BRANCH EDIT MODAL */}
      {branchModalOpen && editingBranch && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveBranch} className="cyber-glass-card rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingBranch.id ? 'Edit Branch Location' : 'Add New Branch Location'}
              </h3>
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Branch Name *</label>
                <input
                  type="text"
                  value={editingBranch.name}
                  onChange={e => setEditingBranch({ ...editingBranch, name: e.target.value })}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Branch Type *</label>
                <select
                  value={editingBranch.type}
                  onChange={e => setEditingBranch({ ...editingBranch, type: e.target.value as BranchType })}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                >
                  <option value="showroom">Showroom (Requires In-Charge)</option>
                  <option value="head_office">Head Office (No In-Charge)</option>
                  <option value="power_market">Power Market (No In-Charge)</option>
                  <option value="other">Other Outlet</option>
                </select>
              </div>

              {editingBranch.type === 'showroom' && (
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Manually Assign In-Charge *</label>
                  <select
                    value={editingBranch.inChargeId || ''}
                    onChange={e => {
                      const sp = salespersons.find(s => s.id === e.target.value);
                      setEditingBranch({
                        ...editingBranch,
                        inChargeId: sp?.id || '',
                        inChargeName: sp ? `${sp.name} (${sp.code})` : '',
                        inChargePhone: sp?.phone || ''
                      });
                    }}
                    className="w-full cyber-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="">-- Select In-Charge --</option>
                    {salespersons.map(sp => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} [{sp.code}] - {sp.phone}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-300 mb-1">Assigned Approver</label>
                <input
                  type="text"
                  value={editingBranch.approverName || ''}
                  onChange={e => setEditingBranch({ ...editingBranch, approverName: e.target.value })}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  placeholder="Enter Approver Name"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  value={editingBranch.address || ''}
                  onChange={e => setEditingBranch({ ...editingBranch, address: e.target.value })}
                  className="w-full cyber-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Save Branch
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
