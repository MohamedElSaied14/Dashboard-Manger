"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { apiRequest } from "../../utils/api";
import { apiUpload } from "../../utils/apiUpload";
import { UploadProgressBar, useUploadProgress } from "../../components/ui/UploadProgressBar";
import { compressImageForUpload } from "../../utils/compressImage";
import { cloudinaryThumbnail } from "../../utils/cloudinary";
import { notify } from "../../utils/notify";
import ClientBrandVerification from "./ClientBrandVerification";
import {
  Upload,
  Sparkles,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trash2,
  Edit2,
  X,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface DesignReferencesTabProps {
  clientId: string;
}

const statusBadgeColor: Record<string, string> = {
  uploaded: "#eef2ff",
  analyzing: "#fef3c7",
  ready_for_review: "#dbeafe",
  partially_approved: "#e0f2fe",
  approved: "#d1fae5",
  rejected: "#fee2e2",
  failed: "#f3f4f6",
};

const statusTextColor: Record<string, string> = {
  uploaded: "#4f46e5",
  analyzing: "#d97706",
  ready_for_review: "#2563eb",
  partially_approved: "#0284c7",
  approved: "#059669",
  rejected: "#dc2626",
  failed: "#4b5563",
};

function extractHexColors(value: unknown): string[] {
  const matches = JSON.stringify(value ?? "").match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
  return [...new Set(matches.map((color) => color.toUpperCase()))];
}

function GuidelineValue({
  label,
  value,
  accent,
  showColors,
}: {
  label: string;
  value: unknown;
  accent: string;
  showColors: boolean;
}) {
  const colors = showColors ? extractHexColors(value) : [];
  return (
    <div style={{ display: "grid", gap: "5px", marginTop: "5px" }}>
      <b style={{ fontSize: "11px" }}>{label}:</b>
      {colors.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
          {colors.map((color) => (
            <div
              key={color}
              title={color}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 7px 4px 4px",
                border: "1px solid #dedee8",
                borderRadius: "8px",
                background: "#fff",
              }}
            >
              <span
                aria-label={`Color ${color}`}
                style={{
                  width: "24px",
                  height: "24px",
                  flex: "0 0 24px",
                  borderRadius: "6px",
                  backgroundColor: color,
                  border: "1px solid rgba(0,0,0,.18)",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,.35)",
                }}
              />
              <code style={{ color: accent, fontSize: "10px", fontWeight: 800 }}>{color}</code>
            </div>
          ))}
        </div>
      ) : (
        <span style={{ color: accent, overflowWrap: "anywhere" }}>{JSON.stringify(value)}</span>
      )}
    </div>
  );
}

export default function DesignReferencesTab({ clientId }: DesignReferencesTabProps) {
  const { lang, user } = useAuthStore();
  const queryClient = useQueryClient();
  const isRtl = lang === "ar";

  // Active reference ID selection
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);

  // Upload Reference Modal / Form state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [userContext, setUserContext] = useState("");

  // Review screen states (local workspace stored in Zustand-like/React state for edits)
  const [reviewTab, setReviewTab] = useState<"colors" | "typography" | "layout" | "imagery" | "suggestions" | "history">("colors");
  const [editingBriefIdx, setEditingBriefIdx] = useState<number | null>(null);
  const [editingGuidelineIdx, setEditingGuidelineIdx] = useState<number | null>(null);
  const [editingInstIdx, setEditingInstIdx] = useState<number | null>(null);
  const [editingAvoidIdx, setEditingAvoidIdx] = useState<number | null>(null);
  
  const [draftSuggestions, setDraftSuggestions] = useState<any>(null);
  const [draftHumanNotes, setDraftHumanNotes] = useState("");

  // Bilingual translation
  const dict = {
    en: {
      title: "AI Design Reference Analyzer",
      subtitle: "Upload visual references, analyze brand directions, and manage guideline updates with human override.",
      uploadBtn: "Upload Reference Image",
      uploadModalTitle: "Upload Design Reference",
      selectImage: "Select JPEG, PNG, or WEBP reference (Max 10MB)",
      notesLabel: "Context Notes (Optional)",
      notesPlaceholder: "What did the client like? Which elements should be repeated or ignored?",
      cancel: "Cancel",
      submit: "Submit and Upload",
      noReferences: "No design references uploaded yet.",
      selectPrompt: "Select a design reference from the list to view visual analysis and suggestions.",
      status: "Status",
      uploadedBy: "Uploaded by",
      analyzing: "AI is analyzing image. Please wait...",
      failed: "Analysis failed. Please try again.",
      retryBtn: "Retry Analysis",
      runAnalysisBtn: "Start AI Analysis",
      originalImage: "Original Image",
      humanNotes: "Human Review Notes",
      humanNotesPlaceholder: "Add context or instructions for the design team...",
      approveApply: "Approve & Apply to Client Profile",
      saveReview: "Save Review Draft",
      deleteRef: "Delete Reference",
      acceptAll: "Accept All",
      rejectAll: "Reject All",
      confidence: "Confidence",
      conflict: "Conflict Detected",
      needsReview: "Needs Review",
      current: "Current value",
      suggested: "Suggested value",
      reason: "Reason",
      section: "Section",
      field: "Field",
      instructionsTitle: "Design Instructions",
      avoidTitle: "Things to Avoid",
      editValue: "Edit Suggested Value",
      historyTitle: "Guideline Modification History",
      rollbackBtn: "Rollback",
      appliedOn: "Applied on",
      by: "by",
      originalFile: "Original File",
      viewGuidelines: "View Client Guidelines",
      adminNotice: "Only Admins and Account Managers can apply updates to client profiles.",
      unreviewedWarning: "Review low-confidence suggestions or conflicts before applying.",
    },
    ar: {
      title: "محلل المرجع البصري بالذكاء الاصطناعي",
      subtitle: "ارفع صور الهام أو مراجع معتمدة، وحلّل عناصر التصميم بالذكاء الاصطناعي مع إمكانية المراجعة والتعديل قبل حفظها.",
      uploadBtn: "رفع صورة مرجعية",
      uploadModalTitle: "رفع مرجع تصميم جديد",
      selectImage: "اختر صورة JPG أو PNG أو WEBP (الحد الأقصى 10 ميجا)",
      notesLabel: "ملاحظات وتوجيهات (اختياري)",
      notesPlaceholder: "ما الذي أعجب العميل في هذا التصميم؟ ما العناصر التي يجب تكرارها أو تجاهلها؟",
      cancel: "إلغاء",
      submit: "رفع وحفظ",
      noReferences: "لم يتم رفع أي مراجع تصميم بعد.",
      selectPrompt: "اختر صورة مرجعية من القائمة لعرض التحليل والاقتراحات المستخرجة.",
      status: "الحالة",
      uploadedBy: "تم الرفع بواسطة",
      analyzing: "جاري تحليل الصورة بالذكاء الاصطناعي. فضلاً انتظر...",
      failed: "فشل التحليل البصري. يرجى المحاولة مرة أخرى.",
      retryBtn: "إعادة التحليل",
      runAnalysisBtn: "بدء التحليل بالذكاء الاصطناعي",
      originalImage: "الصورة الأصلية",
      humanNotes: "ملاحظات المراجع البشري",
      humanNotesPlaceholder: "أضف ملاحظات توضيحية لفريق التصميم...",
      approveApply: "اعتماد وتطبيق على ملف العميل",
      saveReview: "حفظ مسودة المراجعة",
      deleteRef: "حذف المرجع",
      acceptAll: "قبول الكل",
      rejectAll: "رفض الكل",
      confidence: "الثقة",
      conflict: "يوجد تعارض",
      needsReview: "يحتاج مراجعة",
      current: "القيمة الحالية",
      suggested: "القيمة المقترحة",
      reason: "السبب",
      section: "القسم",
      field: "الحقل",
      instructionsTitle: "تعليمات التصميم الموصى بها",
      avoidTitle: "عناصر يجب تجنبها",
      editValue: "تعديل القيمة المقترحة",
      historyTitle: "سجل التعديلات والموافقات",
      rollbackBtn: "تراجع (Rollback)",
      appliedOn: "تم التطبيق في",
      by: "بواسطة",
      originalFile: "الملف الأصلي",
      viewGuidelines: "عرض إرشادات الهوية الحالية",
      adminNotice: "فقط مدير الحساب والمسؤول يمكنهم تطبيق التعديلات على ملف العميل.",
      unreviewedWarning: "يرجى مراجعة العناصر منخفضة الثقة أو المتعارضة أولاً.",
    },
  };

  const t = dict[lang === "ar" ? "ar" : "en"];

  // Queries
  const { data: references = [], isLoading: loadingRefs } = useQuery({
    queryKey: ["design-references", clientId],
    queryFn: () => apiRequest(`/clients/${clientId}/design-references`),
    enabled: !!clientId,
    refetchInterval: (query: any) => {
      const data = query?.state?.data;
      const hasAnalyzing = Array.isArray(data) && data.some((r: any) => r.status === "uploaded" || r.status === "analyzing");
      return hasAnalyzing ? 3000 : false;
    },
  });

  const { data: histories = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["client-history", clientId],
    queryFn: () => apiRequest(`/clients/${clientId}/history`),
    enabled: !!clientId,
  });

  const selectedRef = references.find((r: any) => r._id === selectedRefId);

  // Initialize draft review states when a reference is selected
  useEffect(() => {
    if (selectedRef) {
      // Deep copy suggestions and setup approved flags if missing
      const suggs = selectedRef.suggestions
        ? JSON.parse(JSON.stringify(selectedRef.suggestions))
        : { clientBrief: [], brandGuidelines: [], designInstructions: [], thingsToAvoid: [] };

      // Initialize default approved state based on confidence
      const initApproved = (arr: any[]) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item) => ({
          ...item,
          approved: item.approved !== undefined ? item.approved : (item.confidence ? item.confidence >= 75 : true),
        }));
      };

      suggs.clientBrief = initApproved(suggs.clientBrief);
      suggs.brandGuidelines = initApproved(suggs.brandGuidelines);
      suggs.designInstructions = initApproved(suggs.designInstructions);
      suggs.thingsToAvoid = initApproved(suggs.thingsToAvoid);

      // If user had previously selected/saved reviews, load them
      if (selectedRef.selectedSuggestions) {
        const prev = selectedRef.selectedSuggestions;
        const mergeSaved = (target: any[], saved: any[], keyField: string) => {
          if (!Array.isArray(target) || !Array.isArray(saved)) return target;
          return target.map((item) => {
            const savedItem = saved.find((s) => s[keyField] === item[keyField]);
            if (savedItem) {
              return { ...item, approved: savedItem.approved, suggestedValue: savedItem.suggestedValue ?? item.suggestedValue, instruction: savedItem.instruction ?? item.instruction, avoidItem: savedItem.avoidItem ?? item.avoidItem };
            }
            return item;
          });
        };

        suggs.clientBrief = mergeSaved(suggs.clientBrief, prev.clientBrief ?? [], "suggestedValue");
        suggs.brandGuidelines = mergeSaved(suggs.brandGuidelines, prev.brandGuidelines ?? [], "field");
        suggs.designInstructions = mergeSaved(suggs.designInstructions, prev.designInstructions ?? [], "instruction");
        suggs.thingsToAvoid = mergeSaved(suggs.thingsToAvoid, prev.thingsToAvoid ?? [], "avoidItem");
      }

      setDraftSuggestions(suggs);
      setDraftHumanNotes(selectedRef.humanNotes ?? "");
    } else {
      setDraftSuggestions(null);
      setDraftHumanNotes("");
    }
  }, [selectedRef]);

  // Mutations
  const referenceUploadProgress = useUploadProgress();
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) return;
      const preparedFile = await compressImageForUpload(uploadFile);
      const formData = new FormData();
      formData.append("file", preparedFile);
      if (userContext.trim()) formData.append("userContext", userContext.trim());

      return apiUpload<any>(`/clients/${clientId}/design-references`, {
        body: formData,
        onProgress: referenceUploadProgress.onProgress,
      });
    },
    onSuccess: (newRef: any) => {
      referenceUploadProgress.reset();
      queryClient.invalidateQueries({ queryKey: ["design-references", clientId] });
      setUploadFile(null);
      setUserContext("");
      setShowUploadModal(false);
      if (newRef?._id) {
        setSelectedRefId(newRef._id);
        // Automatically run analysis
        analyzeMutation.mutate(newRef._id);
      }
    },
    onError: (err: any) => {
      referenceUploadProgress.reset();
      notify(err?.message || "Upload failed", "error");
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/clients/${clientId}/design-references/${id}/analyze`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-references", clientId] });
    },
    onError: (err: any) => {
      notify(err?.message || "Analysis failed", "error");
    },
  });

  const saveReviewMutation = useMutation({
    mutationFn: (data: { selectedSuggestions: any; humanNotes: string }) =>
      apiRequest(`/clients/${clientId}/design-references/${selectedRefId}/review`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-references", clientId] });
      notify(lang === "ar" ? "تم حفظ مراجعتك بنجاح!" : "Review changes saved successfully!", "success");
    },
    onError: (err: any) => {
      notify(err?.message || "Failed to save review", "error");
    },
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/clients/${clientId}/design-references/${selectedRefId}/apply`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-references", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client-history", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] }); // update briefs/guidelines
      notify(lang === "ar" ? "تم تطبيق التعديلات وتحديث ملف العميل!" : "Brand Guidelines & Brief updated successfully!", "success");
    },
    onError: (err: any) => {
      notify(err?.message || "Failed to apply modifications", "error");
    },
  });

  const referenceDecisionMutation = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      apiRequest(`/clients/${clientId}/design-references/${selectedRefId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          humanNotes: draftHumanNotes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-references", clientId] });
    },
    onError: (err: any) => {
      notify(err?.message || (lang === "ar" ? "فشل حفظ القرار" : "Failed to save decision"), "error");
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (historyId: string) =>
      apiRequest(`/clients/${clientId}/history/${historyId}/rollback`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-history", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      notify(lang === "ar" ? "تم التراجع عن التعديل وإرجاع القيمة السابقة!" : "Successfully rolled back client profile guidelines!", "success");
    },
    onError: (err: any) => {
      notify(err?.message || "Rollback failed", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/clients/${clientId}/design-references/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-references", clientId] });
      setSelectedRefId(null);
    },
    onError: (err: any) => {
      notify(err?.message || "Delete failed", "error");
    },
  });

  // Check if current user can apply guidelines
  const canApply = user?.role === "admin" || user?.role === "manager";
  const isReviewable =
    selectedRef?.status === "ready_for_review" ||
    selectedRef?.status === "partially_approved";

  // Check if there are unreviewed low confidence or conflicts
  const hasUnreviewedConflicts = () => {
    if (!draftSuggestions) return false;
    // Return true if any item has confidence < 65 or is marked as conflict and approved is checked but not double checked
    // or if we simply check if any conflict exists in selected suggestions
    const conflicts = selectedRef?.analysis?.conflicts ?? [];
    return conflicts.length > 0 && selectedRef.status === "ready_for_review";
  };

  // Helper toggle functions
  // Helper toggle functions
  const toggleBriefApproval = (index: number) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        clientBrief: prev.clientBrief.map((item: any, idx: number) =>
          idx === index ? { ...item, approved: !item.approved } : item
        ),
      };
    });
  };

  const toggleGuidelineApproval = (index: number) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        brandGuidelines: prev.brandGuidelines.map((item: any, idx: number) =>
          idx === index ? { ...item, approved: !item.approved } : item
        ),
      };
    });
  };

  const toggleInstApproval = (index: number) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        designInstructions: prev.designInstructions.map((item: any, idx: number) =>
          idx === index ? { ...item, approved: !item.approved } : item
        ),
      };
    });
  };

  const toggleAvoidApproval = (index: number) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        thingsToAvoid: prev.thingsToAvoid.map((item: any, idx: number) =>
          idx === index ? { ...item, approved: !item.approved } : item
        ),
      };
    });
  };

  const handleEditBrief = (index: number, val: string) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        clientBrief: prev.clientBrief.map((item: any, idx: number) =>
          idx === index ? { ...item, suggestedValue: val } : item
        ),
      };
    });
  };

  const handleEditGuideline = (index: number, val: any) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        brandGuidelines: prev.brandGuidelines.map((item: any, idx: number) =>
          idx === index ? { ...item, suggestedValue: val } : item
        ),
      };
    });
  };

  const handleEditInst = (index: number, val: string) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        designInstructions: prev.designInstructions.map((item: any, idx: number) =>
          idx === index ? { ...item, instruction: val } : item
        ),
      };
    });
  };

  const handleEditAvoid = (index: number, val: string) => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        thingsToAvoid: prev.thingsToAvoid.map((item: any, idx: number) =>
          idx === index ? { ...item, avoidItem: val } : item
        ),
      };
    });
  };

  const handleAcceptAll = () => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      const setAllTrue = (arr: any[]) => Array.isArray(arr) ? arr.map(i => ({ ...i, approved: true })) : [];
      return {
        ...prev,
        clientBrief: setAllTrue(prev.clientBrief),
        brandGuidelines: setAllTrue(prev.brandGuidelines),
        designInstructions: setAllTrue(prev.designInstructions),
        thingsToAvoid: setAllTrue(prev.thingsToAvoid),
      };
    });
  };

  const handleRejectAll = () => {
    setDraftSuggestions((prev: any) => {
      if (!prev) return prev;
      const setAllFalse = (arr: any[]) => Array.isArray(arr) ? arr.map(i => ({ ...i, approved: false })) : [];
      return {
        ...prev,
        clientBrief: setAllFalse(prev.clientBrief),
        brandGuidelines: setAllFalse(prev.brandGuidelines),
        designInstructions: setAllFalse(prev.designInstructions),
        thingsToAvoid: setAllFalse(prev.thingsToAvoid),
      };
    });
  };

  const handleSaveReview = () => {
    saveReviewMutation.mutate({
      selectedSuggestions: draftSuggestions,
      humanNotes: draftHumanNotes,
    });
  };

  const handleApproveAndApply = async () => {
    if (hasUnreviewedConflicts() && !confirm(lang === "ar" ? "تنبيه: يوجد تعارضات لم يتم التحقق منها. هل تريد المتابعة وتطبيق الهوية؟" : "Warning: Unresolved conflicts exist. Do you still want to apply?")) {
      return;
    }
    // Save draft first
    await saveReviewMutation.mutateAsync({
      selectedSuggestions: draftSuggestions,
      humanNotes: draftHumanNotes,
    });
    // Apply changes
    applyMutation.mutate();
  };

  return (
    <div style={{ marginTop: "20px" }}>
      <ClientBrandVerification clientId={clientId} editable={canApply} />

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>{t.title}</h2>
          <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0, lineHeight: 1.5 }}>{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          style={{
            background: "linear-gradient(135deg, #6d64ff, #554be9)",
            border: 0,
            color: "#fff",
            padding: "10px 18px",
            borderRadius: "12px",
            fontWeight: 750,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 4px 12px rgba(85, 75, 233, 0.2)",
          }}
        >
          <Upload size={16} />
          <span>{t.uploadBtn}</span>
        </button>
      </header>

      {/* Main split work layout */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", alignItems: "start" }}>
        
        {/* Left Column: Reference images list */}
        <section className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {loadingRefs ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "30px" }}>
              <RefreshCw className="animate-spin" size={24} color="#655cf6" />
            </div>
          ) : references.length === 0 ? (
            <div style={{ padding: "40px 10px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
              {t.noReferences}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "680px", overflowY: "auto" }}>
              {references.map((ref: any) => (
                <div
                  key={ref._id}
                  onClick={() => setSelectedRefId(ref._id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px",
                    borderRadius: "14px",
                    border: ref._id === selectedRefId ? "2px solid #655cf6" : "1px solid #eeeef5",
                    background: ref._id === selectedRefId ? "#f8f7ff" : "#fff",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <img
                    src={cloudinaryThumbnail(ref.imageUrl, 220)}
                    alt={ref.originalFileName}
                    style={{ width: "56px", height: "56px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eee" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: "12.5px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {ref.originalFileName}
                    </b>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: statusBadgeColor[ref.status] ?? "#eee",
                          color: statusTextColor[ref.status] ?? "#333",
                        }}
                      >
                        {ref.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Review Workspace / Split screen */}
        <section>
          {!selectedRef ? (
            <article className="card" style={{ padding: "80px 20px", textAlign: "center", color: "var(--muted)", fontSize: "13.5px" }}>
              <Sparkles size={36} color="#655cf6" style={{ margin: "0 auto 12px", opacity: 0.6 }} />
              <p>{t.selectPrompt}</p>
            </article>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              
              {/* Reference Header Status Bar */}
              <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", padding: "18px 24px" }}>
                <div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 850, margin: 0 }}>{selectedRef.originalFileName}</h3>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: 800,
                        background: statusBadgeColor[selectedRef.status] ?? "#eee",
                        color: statusTextColor[selectedRef.status] ?? "#333",
                      }}
                    >
                      {selectedRef.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: "12px", margin: "4px 0 0" }}>
                    {t.uploadedBy} <b>{selectedRef.uploadedBy?.name ?? "Designer"}</b> · {new Date(selectedRef.createdAt).toLocaleString()}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {selectedRef.status === "uploaded" && (
                    <button
                      onClick={() => analyzeMutation.mutate(selectedRef._id)}
                      disabled={analyzeMutation.isPending}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "10px",
                        border: 0,
                        background: "#655cf6",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Sparkles size={14} />
                      {analyzeMutation.isPending ? "..." : t.runAnalysisBtn}
                    </button>
                  )}

                  {selectedRef.status === "failed" && (
                    <button
                      onClick={() => analyzeMutation.mutate(selectedRef._id)}
                      disabled={analyzeMutation.isPending}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "10px",
                        border: 0,
                        background: "#dc2626",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <RefreshCw size={14} />
                      {analyzeMutation.isPending ? "..." : t.retryBtn}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (confirm(lang === "ar" ? "هل أنت متأكد من حذف هذا المرجع البصري؟" : "Are you sure you want to delete this reference?")) {
                        deleteMutation.mutate(selectedRef._id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "1px solid #fecaca",
                      background: "#fee2e2",
                      color: "#dc2626",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title={t.deleteRef}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {selectedRef.status === "analyzing" && (
                <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px" }}>
                  <RefreshCw className="animate-spin" size={32} color="#655cf6" style={{ marginBottom: "16px" }} />
                  <p style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink)" }}>{t.analyzing}</p>
                </div>
              )}

              {selectedRef.status === "failed" && (
                <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", color: "#dc2626" }}>
                  <AlertTriangle size={32} style={{ marginBottom: "12px" }} />
                  <p style={{ fontWeight: 700, fontSize: "14px" }}>{t.failed}</p>
                </div>
              )}

              {/* Side-by-Side Analysis Workspace */}
              {(selectedRef.status !== "uploaded" && selectedRef.status !== "analyzing" && selectedRef.status !== "failed") && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "20px", alignItems: "start" }}>
                  
                  {/* Left Column Workspace: original reference details & user context */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div className="card" style={{ padding: "16px" }}>
                      <h4 style={{ fontSize: "13px", fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>
                        {t.originalImage}
                      </h4>
                      <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid #e9e9f2" }}>
                        <img
                          src={cloudinaryThumbnail(selectedRef.imageUrl, 900)}
                          alt={selectedRef.originalFileName}
                          style={{ width: "100%", height: "auto", display: "block" }}
                        />
                        <a
                          href={selectedRef.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            position: "absolute",
                            bottom: "10px",
                            right: isRtl ? "auto" : "10px",
                            left: isRtl ? "10px" : "auto",
                            background: "rgba(25, 23, 44, 0.7)",
                            color: "#fff",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          <ExternalLink size={12} />
                          <span>View Full</span>
                        </a>
                      </div>

                      {selectedRef.userContext && (
                        <div style={{ marginTop: "14px", background: "#f8f9fa", borderRadius: "10px", padding: "12px", fontSize: "12.5px", lineHeight: 1.5, color: "#3f3c56" }}>
                          <b style={{ color: "var(--ink)", display: "block", marginBottom: "4px" }}>
                            {lang === "ar" ? "ملاحظة الموظف عند الرفع:" : "Note from uploader:"}
                          </b>
                          "{selectedRef.userContext}"
                        </div>
                      )}
                    </div>

                    {/* Safety notice for Prompt Injection */}
                    <div className="card" style={{ background: "#f5f6ff", border: "1px solid #dcd6ff", color: "#554be9", padding: "14px", display: "flex", gap: "10px" }}>
                      <Sparkles size={20} style={{ flexShrink: 0, color: "#655cf6" }} />
                      <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
                        {lang === "ar" ? (
                          <>
                            <b>حماية أمنية تلقائية:</b> تم تجاهل أي نصوص داخل الصورة كأوامر برمجية لحماية النظام من الاختراق اللغوي (Prompt Injection).
                          </>
                        ) : (
                          <>
                            <b>Automatic Security Baseline:</b> Text labels inside the design image were treated purely as visual elements to block potential prompt injection exploits.
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column Workspace: AI response tabs */}
                  <div className="card" style={{ padding: "0" }}>
                    
                    {/* Tabs navigation */}
                    <div style={{ display: "flex", background: "#f8f9fa", borderBottom: "1px solid #eeeef5", borderTopLeftRadius: "20px", borderTopRightRadius: "20px", overflowX: "auto" }}>
                      {(["colors", "typography", "layout", "imagery", "suggestions", "history"] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setReviewTab(tab)}
                          style={{
                            padding: "14px 18px",
                            border: 0,
                            background: "none",
                            fontSize: "13px",
                            fontWeight: 700,
                            color: reviewTab === tab ? "#554be9" : "#6c757d",
                            borderBottom: reviewTab === tab ? "3px solid #554be9" : "3px solid transparent",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            textTransform: "capitalize",
                          }}
                        >
                          {lang === "ar" ? (
                            tab === "colors" ? "الألوان" :
                            tab === "typography" ? "الخطوط" :
                            tab === "layout" ? "التكوين" :
                            tab === "imagery" ? "الرسوميات" :
                            tab === "suggestions" ? "الاقتراحات" : "سجل التعديلات"
                          ) : tab}
                        </button>
                      ))}
                    </div>

                    {/* Tab contents */}
                    <div style={{ padding: "20px", minHeight: "360px" }}>
                      
                      {/* COLORS TAB */}
                      {reviewTab === "colors" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          {selectedRef.analysis?.colors?.map((col: any, i: number) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #f8f9fa", paddingBottom: "12px" }}>
                              <span
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "50%",
                                  background: col.hex,
                                  border: "1px solid #e9e9f2",
                                  boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                                }}
                              />
                              <div style={{ flex: 1 }}>
                                <b style={{ fontSize: "13px", display: "block" }}>{col.name}</b>
                                <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                                  {col.usage} · {col.approximatePercentage}% utilization
                                </span>
                              </div>
                              <code style={{ background: "#f3f4f6", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>
                                {col.hex}
                              </code>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* TYPOGRAPHY TAB */}
                      {reviewTab === "typography" && selectedRef.analysis?.typography && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                          <div>
                            <b style={{ fontSize: "13px", color: "var(--muted)", textTransform: "uppercase" }}>Heading Style:</b>
                            <p style={{ margin: "4px 0 12px", fontSize: "13px", lineHeight: 1.5 }}>
                              {selectedRef.analysis.typography.headingStyle}
                            </p>
                          </div>
                          <div>
                            <b style={{ fontSize: "13px", color: "var(--muted)", textTransform: "uppercase" }}>Body Style:</b>
                            <p style={{ margin: "4px 0 12px", fontSize: "13px", lineHeight: 1.5 }}>
                              {selectedRef.analysis.typography.bodyStyle}
                            </p>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "10px" }}>
                            <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "12px" }}>
                              <b style={{ fontSize: "12px", display: "block", marginBottom: "6px", color: "#554be9" }}>Arabic Suggestions</b>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {selectedRef.analysis.typography.arabicFontSuggestions?.map((f: string) => (
                                  <span key={f} style={{ background: "#fff", border: "1px solid #e9e9f2", borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 600 }}>{f}</span>
                                ))}
                              </div>
                            </div>
                            <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "12px" }}>
                              <b style={{ fontSize: "12px", display: "block", marginBottom: "6px", color: "#554be9" }}>English Suggestions</b>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {selectedRef.analysis.typography.englishFontSuggestions?.map((f: string) => (
                                  <span key={f} style={{ background: "#fff", border: "1px solid #e9e9f2", borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 600 }}>{f}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* LAYOUT TAB */}
                      {reviewTab === "layout" && selectedRef.analysis?.layout && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          {Object.entries(selectedRef.analysis.layout).map(([key, val]: any) => (
                            <div key={key} style={{ borderBottom: "1px solid #f8f9fa", paddingBottom: "10px" }}>
                              <b style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>{key}:</b>
                              <p style={{ margin: "2px 0 0", fontSize: "13px", lineHeight: 1.4 }}>{val}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* IMAGERY & GRAPHICS TAB */}
                      {reviewTab === "imagery" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <h4 style={{ fontSize: "12px", fontWeight: 800, color: "#554be9", margin: "0 0 4px" }}>Imagery Direction</h4>
                            {selectedRef.analysis?.imagery && Object.entries(selectedRef.analysis.imagery).map(([key, val]: any) => (
                              <div key={key}>
                                <b style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase" }}>{key}:</b>
                                <p style={{ margin: "1px 0 0", fontSize: "12.5px" }}>{val}</p>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <h4 style={{ fontSize: "12px", fontWeight: 800, color: "#554be9", margin: "0 0 4px" }}>Graphic Elements</h4>
                            {selectedRef.analysis?.graphicElements && Object.entries(selectedRef.analysis.graphicElements).map(([key, val]: any) => (
                              <div key={key}>
                                <b style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase" }}>{key}:</b>
                                <p style={{ margin: "1px 0 0", fontSize: "12.5px" }}>{val}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SUGGESTIONS / ACTIONS TAB */}
                      {reviewTab === "suggestions" && draftSuggestions && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                          
                          {/* Toggle Options */}
                          <div style={{ display: "flex", gap: "8px", alignSelf: "flex-end" }}>
                            <button
                              onClick={handleAcceptAll}
                              style={{ padding: "4px 10px", background: "#ecfdf5", border: "1px solid #10b981", color: "#047857", borderRadius: "8px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                            >
                              {t.acceptAll}
                            </button>
                            <button
                              onClick={handleRejectAll}
                              style={{ padding: "4px 10px", background: "#fef2f2", border: "1px solid #ef4444", color: "#b91c1c", borderRadius: "8px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                            >
                              {t.rejectAll}
                            </button>
                          </div>

                          {/* 1. Client Brief suggestions */}
                          {draftSuggestions.clientBrief?.length > 0 && (
                            <div>
                              <h4 style={{ borderBottom: "2px solid #554be9", paddingBottom: "6px", fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>
                                1. Client Brief Changes
                              </h4>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {draftSuggestions.clientBrief.map((item: any, idx: number) => (
                                  <div key={idx} style={{ background: "#f8f9fa", borderLeft: "4px solid #4f46e5", padding: "12px", borderRadius: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                    <input type="checkbox" checked={item.approved} onChange={() => toggleBriefApproval(idx)} style={{ marginTop: "4px" }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {editingBriefIdx === idx ? (
                                        <input
                                          type="text"
                                          value={item.suggestedValue}
                                          onChange={(e) => handleEditBrief(idx, e.target.value)}
                                          onBlur={() => setEditingBriefIdx(null)}
                                          autoFocus
                                          style={{ width: "100%", padding: "6px", border: "1px solid #655cf6", borderRadius: "6px", fontSize: "12.5px" }}
                                        />
                                      ) : (
                                        <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 700 }}>{item.suggestedValue}</p>
                                      )}
                                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>{t.reason}: {item.reason}</p>
                                      <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                                        <span style={{ fontSize: "10px", background: "#e0e7ff", color: "#4f46e5", padding: "2px 6px", borderRadius: "10px" }}>
                                          Confidence: {item.confidence}%
                                        </span>
                                      </div>
                                    </div>
                                    <button onClick={() => setEditingBriefIdx(idx)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}>
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Brand Guidelines suggestions */}
                          {draftSuggestions.brandGuidelines?.length > 0 && (
                            <div>
                              <h4 style={{ borderBottom: "2px solid #554be9", paddingBottom: "6px", fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>
                                2. Brand Guidelines
                              </h4>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {draftSuggestions.brandGuidelines.map((item: any, idx: number) => (
                                  <div key={idx} style={{ background: "#f8f9fa", borderLeft: "4px solid #10b981", padding: "12px", borderRadius: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                    <input type="checkbox" checked={item.approved} onChange={() => toggleGuidelineApproval(idx)} style={{ marginTop: "4px" }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ fontSize: "10px", fontWeight: 800, color: "#10b981", textTransform: "uppercase" }}>{item.section} &gt; {item.field}</span>
                                      {editingGuidelineIdx === idx ? (
                                        <input
                                          type="text"
                                          value={Array.isArray(item.suggestedValue) ? item.suggestedValue.join(", ") : item.suggestedValue}
                                          onChange={(e) => {
                                            const val = item.field === "allowedColors" || item.field === "allowedFonts"
                                              ? e.target.value.split(",").map((s: string) => s.trim())
                                              : e.target.value;
                                            handleEditGuideline(idx, val);
                                          }}
                                          onBlur={() => setEditingGuidelineIdx(null)}
                                          autoFocus
                                          style={{ width: "100%", padding: "6px", border: "1px solid #655cf6", borderRadius: "6px", fontSize: "12.5px" }}
                                        />
                                      ) : (
                                        <div style={{ fontSize: "12.5px", fontWeight: 700, marginTop: "2px", display: "grid", gap: "5px" }}>
                                          <GuidelineValue
                                            label={t.current}
                                            value={item.currentValue}
                                            accent="#777"
                                            showColors={String(item.field).toLowerCase().includes("color")}
                                          />
                                          <GuidelineValue
                                            label={t.suggested}
                                            value={item.suggestedValue}
                                            accent="#059669"
                                            showColors={String(item.field).toLowerCase().includes("color")}
                                          />
                                        </div>
                                      )}
                                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>{t.reason}: {item.reason}</p>
                                    </div>
                                    <button onClick={() => setEditingGuidelineIdx(idx)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}>
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. Design Instructions suggestions */}
                          {draftSuggestions.designInstructions?.length > 0 && (
                            <div>
                              <h4 style={{ borderBottom: "2px solid #554be9", paddingBottom: "6px", fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>
                                3. {t.instructionsTitle}
                              </h4>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {draftSuggestions.designInstructions.map((item: any, idx: number) => (
                                  <div key={idx} style={{ background: "#f8f9fa", borderLeft: "4px solid #f59e0b", padding: "12px", borderRadius: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                    <input type="checkbox" checked={item.approved} onChange={() => toggleInstApproval(idx)} style={{ marginTop: "4px" }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {editingInstIdx === idx ? (
                                        <input
                                          type="text"
                                          value={item.instruction}
                                          onChange={(e) => handleEditInst(idx, e.target.value)}
                                          onBlur={() => setEditingInstIdx(null)}
                                          autoFocus
                                          style={{ width: "100%", padding: "6px", border: "1px solid #655cf6", borderRadius: "6px", fontSize: "12.5px" }}
                                        />
                                      ) : (
                                        <div>
                                          <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 700 }}>{item.instruction}</p>
                                          {item.instructionAr && (
                                            <p dir="rtl" style={{ margin: "5px 0 0", fontSize: "12px", color: "#7c4a03", fontWeight: 600 }}>
                                              {item.instructionAr}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>{t.reason}: {item.reason}</p>
                                    </div>
                                    <button onClick={() => setEditingInstIdx(idx)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}>
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 4. Things to Avoid suggestions */}
                          {draftSuggestions.thingsToAvoid?.length > 0 && (
                            <div>
                              <h4 style={{ borderBottom: "2px solid #554be9", paddingBottom: "6px", fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>
                                4. {t.avoidTitle}
                              </h4>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {draftSuggestions.thingsToAvoid.map((item: any, idx: number) => (
                                  <div key={idx} style={{ background: "#f8f9fa", borderLeft: "4px solid #ef4444", padding: "12px", borderRadius: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                    <input type="checkbox" checked={item.approved} onChange={() => toggleAvoidApproval(idx)} style={{ marginTop: "4px" }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {editingAvoidIdx === idx ? (
                                        <input
                                          type="text"
                                          value={item.avoidItem}
                                          onChange={(e) => handleEditAvoid(idx, e.target.value)}
                                          onBlur={() => setEditingAvoidIdx(null)}
                                          autoFocus
                                          style={{ width: "100%", padding: "6px", border: "1px solid #655cf6", borderRadius: "6px", fontSize: "12.5px" }}
                                        />
                                      ) : (
                                        <div>
                                          <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 700, color: "#c53030" }}>{item.avoidItem}</p>
                                          {item.avoidItemAr && (
                                            <p dir="rtl" style={{ margin: "5px 0 0", fontSize: "12px", color: "#991b1b", fontWeight: 600 }}>
                                              {item.avoidItemAr}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>{t.reason}: {item.reason}</p>
                                    </div>
                                    <button onClick={() => setEditingAvoidIdx(idx)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}>
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Human Review Notes text area */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
                            <label style={{ fontSize: "12.5px", fontWeight: 700 }}>{t.humanNotes}</label>
                            <textarea
                              value={draftHumanNotes}
                              onChange={(e) => setDraftHumanNotes(e.target.value)}
                              readOnly={!canApply}
                              placeholder={t.humanNotesPlaceholder}
                              style={{ minHeight: "70px", padding: "10px", border: "1px solid #e9e9f2", borderRadius: "10px", outline: "none", fontSize: "12.5px" }}
                            />
                          </div>

                          {/* Submit Actions */}
                          {canApply && isReviewable ? (
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                            <button
                              onClick={handleSaveReview}
                              disabled={saveReviewMutation.isPending}
                              style={{
                                padding: "10px 16px",
                                border: "1px solid #655cf6",
                                background: "#fff",
                                color: "#655cf6",
                                borderRadius: "10px",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {saveReviewMutation.isPending ? "..." : t.saveReview}
                            </button>

                            <button
                              onClick={handleApproveAndApply}
                              disabled={applyMutation.isPending || !canApply}
                              style={{
                                padding: "10px 20px",
                                border: 0,
                                background: canApply ? "linear-gradient(135deg, #10b981, #059669)" : "#ccc",
                                color: "#fff",
                                borderRadius: "10px",
                                fontSize: "12.5px",
                                fontWeight: 750,
                                cursor: canApply ? "pointer" : "not-allowed",
                                opacity: canApply ? 1 : 0.6,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                boxShadow: canApply ? "0 4px 12px rgba(16, 185, 129, 0.2)" : "none",
                              }}
                            >
                              <CheckCircle size={14} />
                              {applyMutation.isPending ? "..." : t.approveApply}
                            </button>
                            <button
                              onClick={() => referenceDecisionMutation.mutate("rejected")}
                              disabled={referenceDecisionMutation.isPending}
                              style={{
                                padding: "10px 20px",
                                border: 0,
                                background: "#ef4444",
                                color: "#fff",
                                borderRadius: "10px",
                                fontSize: "12.5px",
                                fontWeight: 750,
                                cursor: referenceDecisionMutation.isPending ? "wait" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <XCircle size={14} />
                              {referenceDecisionMutation.isPending
                                ? "..."
                                : lang === "ar" ? "رفض المرجع" : "Reject reference"}
                            </button>
                          </div>
                          ) : canApply ? (
                            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f3f4f8", color: "#656276", fontSize: "12px", fontWeight: 650 }}>
                              {selectedRef.status === "approved"
                                ? (lang === "ar" ? "تم اعتماد وتطبيق هذا المرجع بالفعل." : "This reference has already been approved and applied.")
                                : selectedRef.status === "rejected"
                                  ? (lang === "ar" ? "تم رفض هذا المرجع، ولا يمكن تعديل القرار النهائي." : "This reference was rejected and its final decision is locked.")
                                  : (lang === "ar" ? "انتظر انتهاء تحليل المرجع قبل مراجعته." : "Wait for reference analysis to finish before reviewing it.")}
                            </div>
                          ) : (
                            <p style={{ color: "#d97706", fontSize: "11px", margin: 0, textAlign: "right" }}>
                              {lang === "ar"
                                ? "تم إرسال المرجع للمراجعة. الاعتماد أو الرفض متاح للمدير أو المسؤول فقط."
                                : "Submitted for review. Only managers or admins can approve or reject it."}
                            </p>
                          )}
                        </div>
                      )}

                      {/* VERSION HISTORY / ROLLBACK TAB */}
                      {reviewTab === "history" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          <h4 style={{ fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>{t.historyTitle}</h4>
                          {loadingHistory ? (
                            <RefreshCw className="animate-spin" size={16} color="#655cf6" />
                          ) : histories.length === 0 ? (
                            <p style={{ fontSize: "12.5px", color: "var(--muted)", margin: 0 }}>No modifications recorded yet.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderLeft: "2px dashed #eee", paddingLeft: "14px" }}>
                              {histories.map((hist: any, index: number) => (
                                <div key={hist._id} style={{ position: "relative", background: "#f8f9fa", padding: "12px 16px", borderRadius: "12px" }}>
                                  <span style={{ position: "absolute", left: "-21px", top: "18px", width: "12px", height: "12px", borderRadius: "50%", background: "#655cf6", border: "3px solid #fff" }} />
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700 }}>
                                      Version #{histories.length - index} · {new Date(hist.createdAt).toLocaleString()}
                                    </span>
                                    {canApply && (
                                      <button
                                        onClick={() => {
                                          if (confirm(lang === "ar" ? "هل تريد التراجع واستعادة هذه النسخة من القواعد والبريف؟" : "Rollback guidelines to this snapshot version?")) {
                                            rollbackMutation.mutate(hist._id);
                                          }
                                        }}
                                        disabled={rollbackMutation.isPending}
                                        style={{
                                          padding: "3px 8px",
                                          background: "#fef3c7",
                                          border: "1px solid #f59e0b",
                                          color: "#d97706",
                                          borderRadius: "6px",
                                          fontSize: "10.5px",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                        }}
                                      >
                                        {t.rollbackBtn}
                                      </button>
                                    )}
                                  </div>
                                  <p style={{ fontSize: "12px", margin: "6px 0 0", color: "var(--ink)" }}>
                                    Guidelines & brief updated {hist.designReferenceId ? `via reference image` : ""} by <b>{hist.updatedBy?.name}</b>.
                                  </p>
                                  {hist.designReferenceId && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", background: "#fff", padding: "6px", borderRadius: "8px", border: "1px solid #eeeef5" }}>
                                      <img src={hist.designReferenceId.imageUrl} alt="" style={{ width: "30px", height: "30px", borderRadius: "4px", objectFit: "cover" }} />
                                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>Source: {hist.designReferenceId.originalFileName}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </div>

                </div>
              )}

            </div>
          )}
        </section>

      </div>

      {/* Upload Reference Modal dialog */}
      {showUploadModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(25, 23, 44, 0.4)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="card" style={{ width: "min(500px, 90vw)", padding: "26px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>{t.uploadModalTitle}</h3>
              <button onClick={() => { setUploadFile(null); setShowUploadModal(false); }} style={{ background: "none", border: 0, cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              {/* File drop zone */}
              <div style={{ border: "2px dashed #beb5ff", background: "#f8f7ff", borderRadius: "12px", padding: "24px 10px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                <Upload size={32} color="#655cf6" />
                <label style={{ display: "inline-block", background: "#655cf6", color: "#fff", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                  Browse File
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    style={{ display: "none" }}
                  />
                </label>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{uploadFile ? uploadFile.name : t.selectImage}</span>
              </div>

              {/* Context notes */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "12.5px", fontWeight: 700 }}>{t.notesLabel}</label>
                <textarea
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  placeholder={t.notesPlaceholder}
                  style={{ minHeight: "80px", padding: "10px", border: "1px solid #e9e9f2", borderRadius: "10px", outline: "none", fontSize: "12.5px" }}
                />
              </div>

            </div>

            {uploadMutation.isPending && <UploadProgressBar progress={referenceUploadProgress.progress} />}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button
                onClick={() => { setUploadFile(null); setUserContext(""); setShowUploadModal(false); }}
                style={{ padding: "8px 16px", border: "1px solid #e9e9f2", background: "#fff", borderRadius: "10px", fontSize: "12.5px", cursor: "pointer" }}
              >
                {t.cancel}
              </button>
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!uploadFile || uploadMutation.isPending}
                style={{
                  padding: "8px 20px",
                  border: 0,
                  background: uploadFile ? "linear-gradient(135deg, #6d64ff, #554be9)" : "#ccc",
                  color: "#fff",
                  borderRadius: "10px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: uploadFile ? "pointer" : "not-allowed",
                  opacity: uploadFile ? 1 : 0.6,
                }}
              >
                {uploadMutation.isPending ? "..." : t.submit}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
