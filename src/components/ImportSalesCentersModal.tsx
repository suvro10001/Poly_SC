import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  Building2,
  MapPin,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { BranchLocation, Salesperson } from '../types';
import {
  parseXLSXToBranches,
  downloadSimpleBranchTemplateXLSX,
  downloadBranchTemplateXLSX
} from '../utils/xlsxBranchHelper';

interface ImportSalesCentersModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: BranchLocation[];
  onSaveBranches: (branches: BranchLocation[]) => void;
  salespersons?: Salesperson[];
}

export const ImportSalesCentersModal: React.FC<ImportSalesCentersModalProps> = ({
  isOpen,
  onClose,
  branches,
  onSaveBranches,
  salespersons = []
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<{
    importedBranches: BranchLocation[];
    mergedBranches: BranchLocation[];
    addedCount: number;
    updatedCount: number;
  } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSelectedFile(file);
    setIsProcessing(true);

    try {
      const result = await parseXLSXToBranches(file, branches, salespersons);
      if (!result.importedBranches || result.importedBranches.length === 0) {
        setErrorMsg('No valid sales center records found in the uploaded file. Please verify column headers (Name, Address).');
        setParsedData(null);
      } else {
        setParsedData({
          importedBranches: result.importedBranches,
          mergedBranches: result.mergedBranches,
          addedCount: result.addedCount,
          updatedCount: result.updatedCount
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse Excel file. Please ensure valid .xlsx or .xls format.');
      setParsedData(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleConfirmImport = () => {
    if (!parsedData) return;

    let finalBranches: BranchLocation[];
    if (importMode === 'replace') {
      finalBranches = parsedData.importedBranches;
    } else {
      finalBranches = parsedData.mergedBranches;
    }

    onSaveBranches(finalBranches);
    setSuccessMsg(`Successfully imported ${parsedData.importedBranches.length} sales center(s)!`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const resetState = () => {
    setSelectedFile(null);
    setParsedData(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500/20 p-2 rounded-xl text-amber-400 border border-amber-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Import Sales Centers & Addresses from Excel
              </h2>
              <p className="text-[11px] text-slate-300">
                Bulk upload sales center names, showroom addresses, and contact details from .xlsx or .xls file
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs text-slate-700">
          {/* Instructions and Template Downloads */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-amber-950 text-xs">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Supported Format: 2-Column (Name + Address) or Full Template</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                You can upload a simple Excel with column headers <strong>"Sales Center Name"</strong> and <strong>"Address"</strong>.
                Existing sales centers with matching names will have their addresses updated.
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={downloadSimpleBranchTemplateXLSX}
                className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer text-xs"
                title="Download simple Excel file with Sales Center Name and Address"
              >
                <Download className="w-3.5 h-3.5 text-amber-700" />
                <span>Simple Template (Name + Address)</span>
              </button>
              <button
                type="button"
                onClick={downloadBranchTemplateXLSX}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer text-xs"
                title="Download complete showroom template with all fields"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Full Template</span>
              </button>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          {!parsedData && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-amber-500 bg-amber-50/70 scale-[0.99]'
                  : 'border-slate-300 hover:border-amber-400 bg-slate-50/60 hover:bg-amber-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 mb-3 text-amber-600">
                <Upload className="w-7 h-7 animate-pulse" />
              </div>
              <p className="font-extrabold text-slate-800 text-sm">
                Click to browse or drag & drop Excel file here
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Supports Microsoft Excel (.xlsx, .xls) and CSV spreadsheets
              </p>
              {isProcessing && (
                <div className="mt-3 flex items-center space-x-2 text-amber-700 font-bold text-xs bg-amber-100 px-3 py-1 rounded-full">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Reading and analyzing spreadsheet...</span>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Message */}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center space-x-2 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedData && (
            <div className="space-y-3">
              {/* Summary Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-slate-900 text-xs">
                    File: <span className="text-blue-700 font-mono">{selectedFile?.name}</span>
                  </span>
                  <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md text-[11px] border border-amber-300">
                    {parsedData.importedBranches.length} Rows Detected
                  </span>
                  <span className="bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-md text-[11px] border border-emerald-300">
                    +{parsedData.addedCount} New Outlets
                  </span>
                  {parsedData.updatedCount > 0 && (
                    <span className="bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-md text-[11px] border border-blue-300">
                      {parsedData.updatedCount} Existing to Update
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="font-bold text-slate-600">Mode:</span>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-semibold text-slate-800">Merge with Existing ({branches.length})</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span className="font-semibold text-rose-800">Replace All</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={resetState}
                    className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-900 text-white font-bold sticky top-0 uppercase text-[10px] tracking-wide">
                    <tr>
                      <th className="py-2 px-3 w-10 text-center">SL#</th>
                      <th className="py-2 px-3 min-w-[180px]">Sales Center / Showroom Name</th>
                      <th className="py-2 px-3 min-w-[220px]">Address / Location</th>
                      <th className="py-2 px-3 w-28 text-center">Branch Type</th>
                      <th className="py-2 px-3 w-32">In-Charge</th>
                      <th className="py-2 px-3 w-20 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white font-medium">
                    {parsedData.importedBranches.map((item, idx) => {
                      const isExisting = branches.some(
                        (b) => b.name.trim().toLowerCase() === item.name.trim().toLowerCase()
                      );
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 text-center font-mono text-slate-500 font-bold">{idx + 1}</td>
                          <td className="py-2 px-3 font-extrabold text-slate-900">
                            <div className="flex items-center space-x-1.5">
                              <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>{item.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            <div className="flex items-center space-x-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{item.address || <span className="text-slate-400 italic">No address provided</span>}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.type === 'head_office' ? 'Head Office' : item.type === 'power_market' ? 'Power Market' : 'Showroom'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-800 font-semibold">
                            {item.inChargeName ? (
                              <span className="text-emerald-700 font-bold">{item.inChargeName}</span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isExisting ? (
                              <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-blue-200">
                                Update
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-emerald-200">
                                New
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {parsedData && (
            <button
              type="button"
              onClick={handleConfirmImport}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs transition-all shadow-md flex items-center space-x-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                Confirm & Import {parsedData.importedBranches.length} Sales Center(s)
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
