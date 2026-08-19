"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Loader2,
  Upload,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Save,
  Star,
  FileText,
  Wand2,
  Trash2,
  ImageIcon,
  Phone,
  Plus,
} from "lucide-react";
import { useAuthStore } from "../../../../../store/authStore";
import { apiRequest } from "../../../../../utils/api";
import { apiUpload } from "../../../../../utils/apiUpload";
import { UploadProgressBar, useUploadProgress } from "../../../../../components/ui/UploadProgressBar";
import { compressImageForUpload } from "../../../../../utils/compressImage";
import ClientBrandVerification from "../../../../../features/design-review/ClientBrandVerification";
import { cloudinaryThumbnail } from "../../../../../utils/cloudinary";
import { notify } from "../../../../../utils/notify";

const DESIGN_TYPES = [
  "instagram_portrait_post",
  "story",
  "reel_cover",
  "carousel_slide",
  "banner",
  "other",
];

const DEFAULT_GUIDELINES = {
  logoAssets: [],
  contactDetails: [],
  orientation: "portrait",
  orientationEnabled: false,
  dimensions: { enabled: false, width: 1080, height: 1350, aspectRatio: "4:5", tolerancePx: 2 },
  colorRules: {
    enabled: false,
    mode: "black-white",
    allowedColors: ["#000000", "#FFFFFF"],
    allowGrayscale: true,
    forbiddenColors: [],
    colorTolerance: 12,
    maximumNonGrayscalePixelPercentage: 0.5,
  },
  header: {
    logoRequired: true,
    logoPosition: "top-right",
    logoRepeatedAllowed: false,
    expectedMarginTop: 60,
    expectedMarginSide: 60,
  },
  footer: {
    required: true,
    phone: "000-555-000",
    socialHandle: "@MediaDose",
    separatorRequired: true,
    allowedSeparatorColors: ["#000000", "#808080"],
  },
  notes: [],
};

const resultColor: Record<string, string> = {
  pass: "#28a36a",
  warning: "#d7772d",
  fail: "#ff5b5b",
  unknown: "#8b88a5",
};

const resultIcon: Record<string, any> = {
  pass: CheckCircle2,
  warning: AlertTriangle,
  fail: XCircle,
  unknown: HelpCircle,
};

const statusLabel: Record<string, string> = {
  approved: "مقبول",
  approved_with_notes: "مقبول مع ملاحظات",
  changes_required: "مطلوب تعديلات",
  manual_review_required: "يحتاج مراجعة",
};

function checkTitleAr(check: any) {
  const code = String(check.ruleCode ?? "").toUpperCase();
  if (code.startsWith("LOGO_PRESENCE_")) return "وجود اللوجو المعتمد";
  if (code.startsWith("LOGO_IDENTITY_")) return "مطابقة هوية اللوجو";
  if (code.startsWith("LOGO_POSITION_")) return "مكان اللوجو";
  if (code.startsWith("LOGO_INTEGRITY_")) return "سلامة شكل اللوجو";
  const titles: Record<string, string> = {
    DIMENSIONS: "مقاس التصميم",
    ORIENTATION: "اتجاه التصميم",
    ASPECT_RATIO: "نسبة أبعاد التصميم",
    MONOCHROME_ONLY: "الالتزام بالأبيض والأسود",
  };
  return titles[code] ?? check.title;
}

const statusColor: Record<string, string> = {
  approved: "#28a36a",
  approved_with_notes: "#3aa9ff",
  changes_required: "#ff5b5b",
  manual_review_required: "#d7772d",
};

function CheckRow({ check }: { check: any }) {
  const Icon = resultIcon[check.result] ?? HelpCircle;
  const color = resultColor[check.result] ?? "#8b88a5";
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "12px",
        background: "#f8f8fb",
        border: "1px solid #eeeef5",
      }}
    >
      <Icon size={18} color={color} style={{ flexShrink: 0, marginTop: "1px" }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
          <b style={{ fontSize: "13px" }}>{checkTitleAr(check)}</b>
          <span style={{ fontSize: "11px", color: "#8b88a5" }}>الثقة {check.confidence}%</span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#5a5870", lineHeight: 1.5 }}>
          {check.explanation}
        </p>
      </div>
    </div>
  );
}

export default function DesignReviewPage() {
  const params = useParams();
  const clientId = params?.id as string;
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const queryClient = useQueryClient();
  const canManageGuidelines = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (hasHydrated && !user) router.push("/login");
  }, [hasHydrated, user, router]);

  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [guidelinesDraft, setGuidelinesDraft] = useState<any>(null);
  const [showGuidelinesForm, setShowGuidelinesForm] = useState(false);
  const [briefText, setBriefText] = useState("");
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [extractionNotes, setExtractionNotes] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoName, setLogoName] = useState("Primary logo");
  const [logoVariant, setLogoVariant] = useState("primary");
  const [logoPosition, setLogoPosition] = useState("top-right");
  const [contactLabel, setContactLabel] = useState("Main phone");
  const [contactType, setContactType] = useState("phone");
  const [contactValue, setContactValue] = useState("");
  const [contactPosition, setContactPosition] = useState("bottom-left");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [designType, setDesignType] = useState("instagram_portrait_post");
  const [title, setTitle] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [notes, setNotes] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [decisionFeedback, setDecisionFeedback] = useState<{
    decision: "approved" | "changes_requested" | "rejected";
    phase: "saving" | "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (decisionFeedback?.phase !== "success") return;
    const timer = window.setTimeout(() => setDecisionFeedback(null), 1700);
    return () => window.clearTimeout(timer);
  }, [decisionFeedback]);

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => apiRequest(`/clients/${clientId}`),
    enabled: !!user && !!clientId,
  });

  const { data: guidelines, isLoading: loadingGuidelines } = useQuery({
    queryKey: ["design-guidelines", clientId],
    queryFn: () => apiRequest(`/clients/${clientId}/design-guidelines`).catch(() => null),
    enabled: !!user && !!clientId,
  });

  const { data: designs = [], isLoading: loadingDesigns } = useQuery({
    queryKey: ["designs", clientId],
    queryFn: () => apiRequest(`/clients/${clientId}/designs`),
    enabled: !!user && !!clientId,
    refetchInterval: (query) =>
      (query.state.data as any[] | undefined)?.some((design) => design.status === "analyzing")
        ? 1500
        : false,
  });

  const { data: review, isLoading: loadingReview } = useQuery({
    queryKey: ["design-review", clientId, selectedDesignId],
    queryFn: () => apiRequest(`/clients/${clientId}/designs/${selectedDesignId}/review`).catch(() => null),
    enabled: !!user && !!clientId && !!selectedDesignId,
  });

  const saveGuidelinesMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest(`/clients/${clientId}/design-guidelines`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-guidelines", clientId] });
      setShowGuidelinesForm(false);
      setBriefText("");
      setBriefFile(null);
      setExtractionNotes([]);
    },
  });

  const logoUploadProgress = useUploadProgress();
  const logoAssetMutation = useMutation({
    mutationFn: async () => {
      if (!logoFile) throw new Error("Select a logo image first");
      const formData = new FormData();
      formData.append("file", logoFile);
      formData.append("assetType", "approved_logo");
      formData.append("ownerId", clientId);
      const uploaded = await apiUpload<{ url: string; publicId: string }>("/upload", {
        body: formData,
        onProgress: logoUploadProgress.onProgress,
      });
      const current: any = guidelines ?? DEFAULT_GUIDELINES;
      return apiRequest(`/clients/${clientId}/design-guidelines`, {
        method: "PUT",
        body: JSON.stringify({
          ...current,
          logoAssets: [
            ...(current.logoAssets ?? []),
            {
              id: crypto.randomUUID(),
              name: logoName.trim() || "Client logo",
              variant: logoVariant,
              imageUrl: uploaded.url,
              cloudinaryPublicId: uploaded.publicId,
              required: true,
              expectedPosition: logoPosition,
              allowedBackground: "any",
            },
          ],
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-guidelines", clientId] });
      setLogoFile(null);
      setLogoName("Primary logo");
    },
  });

  const contactDetailMutation = useMutation({
    mutationFn: () => {
      if (!contactValue.trim()) throw new Error("Enter the exact contact value first");
      const current: any = guidelines ?? DEFAULT_GUIDELINES;
      return apiRequest(`/clients/${clientId}/design-guidelines`, {
        method: "PUT",
        body: JSON.stringify({
          ...current,
          contactDetails: [
            ...(current.contactDetails ?? []),
            {
              id: crypto.randomUUID(),
              label: contactLabel.trim() || "Contact",
              type: contactType,
              value: contactValue.trim(),
              required: true,
              expectedPosition: contactPosition,
              exactMatch: true,
            },
          ],
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-guidelines", clientId] });
      setContactValue("");
      setContactLabel("Main phone");
    },
  });

  const removeGuidelineItemMutation = useMutation({
    mutationFn: ({ type, id }: { type: "logo" | "contact"; id: string }) => {
      const current: any = guidelines ?? DEFAULT_GUIDELINES;
      return apiRequest(`/clients/${clientId}/design-guidelines`, {
        method: "PUT",
        body: JSON.stringify({
          ...current,
          logoAssets:
            type === "logo"
              ? (current.logoAssets ?? []).filter((item: any) => item.id !== id)
              : (current.logoAssets ?? []),
          contactDetails:
            type === "contact"
              ? (current.contactDetails ?? []).filter((item: any) => item.id !== id)
              : (current.contactDetails ?? []),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-guidelines", clientId] });
    },
  });

  const briefUploadProgress = useUploadProgress();
  const extractGuidelinesMutation = useMutation({
    mutationFn: async () => {
      if (!briefText.trim() && !briefFile) throw new Error("Paste the client's brief or attach a PDF first");
      const formData = new FormData();
      if (briefText.trim()) formData.append("text", briefText.trim());
      if (briefFile) formData.append("file", briefFile);
      return apiUpload(`/clients/${clientId}/design-guidelines/extract`, {
        body: formData,
        onProgress: briefUploadProgress.onProgress,
      });
    },
    onSuccess: (result: any) => {
      setGuidelinesDraft(JSON.stringify(result.guidelines, null, 2));
      setExtractionNotes(result.notes ?? []);
      briefUploadProgress.reset();
    },
    onError: () => briefUploadProgress.reset(),
  });

  const designUploadProgress = useUploadProgress();
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("Select a file first");
      const preparedFile = await compressImageForUpload(uploadFile);
      const formData = new FormData();
      formData.append("file", preparedFile);
      formData.append("designType", designType);
      if (title) formData.append("title", title);
      if (campaignName) formData.append("campaignName", campaignName);
      return apiUpload<any>(`/clients/${clientId}/designs`, {
        body: formData,
        onProgress: designUploadProgress.onProgress,
      });
    },
    onSuccess: (design: any) => {
      queryClient.invalidateQueries({ queryKey: ["designs", clientId] });
      setUploadFile(null);
      setTitle("");
      setCampaignName("");
      setSelectedDesignId(design._id);
      designUploadProgress.reset();
    },
    onError: () => designUploadProgress.reset(),
  });

  const analyzeMutation = useMutation({
    mutationFn: (designId: string) =>
      apiRequest(`/clients/${clientId}/designs/${designId}/analyze`, { method: "POST" }),
    onMutate: (designId) => {
      queryClient.setQueryData<any[]>(["designs", clientId], (current = []) =>
        current.map((design) =>
          design._id === designId
            ? { ...design, status: "analyzing", analysisStage: "Starting analysis", analysisProgress: 2 }
            : design,
        ),
      );
    },
    onSuccess: (_, designId) => {
      queryClient.invalidateQueries({ queryKey: ["design-review", clientId, designId] });
      queryClient.invalidateQueries({ queryKey: ["designs", clientId] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["designs", clientId] });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ decision }: { decision: string }) =>
      apiRequest(`/clients/${clientId}/designs/${selectedDesignId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, humanNotes: notes || undefined }),
      }),
    onMutate: ({ decision }) => {
      setDecisionFeedback({
        decision: decision as "approved" | "changes_requested" | "rejected",
        phase: "saving",
      });
    },
    onSuccess: (_result, { decision }) => {
      queryClient.invalidateQueries({ queryKey: ["designs", clientId] });
      queryClient.invalidateQueries({ queryKey: ["design-review", clientId, selectedDesignId] });
      setNotes("");
      setDecisionFeedback({
        decision: decision as "approved" | "changes_requested" | "rejected",
        phase: "success",
      });
    },
    onError: (_error, { decision }) => {
      setDecisionFeedback({
        decision: decision as "approved" | "changes_requested" | "rejected",
        phase: "error",
      });
      window.setTimeout(() => setDecisionFeedback(null), 2200);
    },
  });

  const deleteDesignMutation = useMutation({
    mutationFn: (designId: string) =>
      apiRequest(`/clients/${clientId}/designs/${designId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designs", clientId] });
      setSelectedDesignId(null);
    },
    onError: (err: any) => {
      notify(err?.message || "Failed to delete design", "error");
    }
  });

  const selectedDesign = designs.find((d: any) => d._id === selectedDesignId);

  if (!hasHydrated || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <Loader2 className="animate-spin" size={40} />
      </div>
    );
  }

  return (
    <div
      className="dr-page"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
        event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
      }}
      style={{ minHeight: "100vh", padding: "28px 32px", fontFamily: "Inter, sans-serif" }}
    >
      {decisionFeedback && (
        <div className="dr-decision-overlay" role="status" aria-live="polite">
          <div
            className={`dr-decision-pop dr-decision-pop--${decisionFeedback.decision} dr-decision-pop--${decisionFeedback.phase}`}
          >
            <div className="dr-decision-icon">
              {decisionFeedback.phase === "saving" ? (
                <Loader2 className="animate-spin" size={48} />
              ) : decisionFeedback.phase === "error" ? (
                <AlertTriangle size={48} />
              ) : decisionFeedback.decision === "approved" ? (
                <CheckCircle2 size={52} />
              ) : decisionFeedback.decision === "rejected" ? (
                <XCircle size={52} />
              ) : (
                <AlertTriangle size={50} />
              )}
            </div>
            <strong>
              {decisionFeedback.phase === "saving"
                ? "جاري حفظ القرار..."
                : decisionFeedback.phase === "error"
                  ? "تعذر حفظ القرار"
                  : decisionFeedback.decision === "approved"
                    ? "تم الاعتماد والإضافة كمَرجع"
                    : decisionFeedback.decision === "rejected"
                      ? "تم رفض التصميم"
                      : "تم طلب التعديلات"}
            </strong>
            <span>
              {decisionFeedback.phase === "saving"
                ? "لحظة واحدة"
                : decisionFeedback.phase === "error"
                  ? "حاول مرة أخرى"
                  : "تم حفظ القرار بنجاح"}
            </span>
          </div>
        </div>
      )}
      <button
        onClick={() => router.push("/")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 16px",
          background: "#fff",
          border: "1px solid #e9e9f2",
          borderRadius: "12px",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 600,
          color: "#554be9",
          marginBottom: "20px",
        }}
      >
        <ChevronLeft size={16} />
        <span>العودة للوحة التحكم</span>
      </button>

      <h1 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 4px" }}>
        مراجعة التصميم (Design Review) {client ? `· ${client.name}` : ""}
      </h1>
      <p style={{ color: "#77758c", fontSize: "13px", margin: "0 0 24px" }}>
        ارفع التصميم وسيتم فحص المقاس والألوان واللوجوهات وبيانات التواصل تلقائيًا حسب قواعد العميل.
      </p>

      <div className="dr-grid" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "24px", alignItems: "start" }}>
        {/* LEFT COLUMN: guidelines + upload + design list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Guidelines card */}
          <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>قواعد التصميم</h3>
              {canManageGuidelines && <button
                onClick={() => {
                  setGuidelinesDraft(JSON.stringify(guidelines ?? DEFAULT_GUIDELINES, null, 2));
                  setShowGuidelinesForm((v) => !v);
                }}
                style={{ fontSize: "12px", color: "#655cf6", background: "none", border: 0, cursor: "pointer", fontWeight: 700 }}
              >
                {guidelines ? "Edit" : "Set up"}
              </button>}
            </div>

            {loadingGuidelines ? (
              <Loader2 className="animate-spin" size={18} color="#655cf6" />
            ) : showGuidelinesForm ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Generate structured guidelines from a free-text client brief or a PDF */}
                <div
                  style={{
                    background: "#f8f7ff",
                    border: "1px solid #e4e0ff",
                    borderRadius: "12px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Wand2 size={14} color="#655cf6" />
                    <b style={{ fontSize: "12px", color: "#554be9" }}>Generate from client brief</b>
                  </div>
                  <p style={{ fontSize: "11px", color: "#8b88a5", margin: 0, lineHeight: 1.5 }}>
                    Paste the client's instructions (any language) and/or attach a PDF. This drafts the
                    structured guidelines below for you to review and edit before saving — it never saves
                    automatically.
                  </p>
                  <textarea
                    placeholder="e.g. designs should be Instagram-post size, logo top-right, footer with phone + @handle, black & white only..."
                    value={briefText}
                    onChange={(e) => setBriefText(e.target.value)}
                    style={{
                      minHeight: "80px",
                      fontSize: "12px",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #e9e9f2",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        color: "#655cf6",
                        cursor: "pointer",
                        border: "1px dashed #c7bfff",
                        borderRadius: "8px",
                        padding: "6px 10px",
                      }}
                    >
                      <FileText size={13} />
                      {briefFile ? briefFile.name : "Attach PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => setBriefFile(e.target.files?.[0] ?? null)}
                        style={{ display: "none" }}
                      />
                    </label>
                    {briefFile && (
                      <button
                        onClick={() => setBriefFile(null)}
                        style={{ fontSize: "11px", color: "#8b88a5", background: "none", border: 0, cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => extractGuidelinesMutation.mutate()}
                    disabled={extractGuidelinesMutation.isPending || (!briefText.trim() && !briefFile)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "9px",
                      borderRadius: "8px",
                      border: 0,
                      background: "#655cf6",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: briefText.trim() || briefFile ? "pointer" : "not-allowed",
                      opacity: briefText.trim() || briefFile ? 1 : 0.5,
                    }}
                  >
                    <Sparkles size={13} />
                    {extractGuidelinesMutation.isPending ? "Generating..." : "Generate guidelines draft"}
                  </button>
                  {extractGuidelinesMutation.isPending && (
                    <UploadProgressBar
                      progress={briefUploadProgress.progress}
                      hint="Uploading the PDF, then indexing it and pulling the guidelines out of the matching sections."
                    />
                  )}
                  {extractGuidelinesMutation.isError && (
                    <p style={{ color: "#ff5b5b", fontSize: "11px", margin: 0 }}>
                      {(extractGuidelinesMutation.error as any)?.message}
                    </p>
                  )}
                  {extractionNotes.length > 0 && (
                    <div style={{ fontSize: "11px", color: "#77758c" }}>
                      <b>Worth double-checking:</b>
                      <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
                        {extractionNotes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: "8px", padding: "12px", borderRadius: "10px", background: "#f8f8fb", border: "1px solid #eeeef5" }}>
                  <b style={{ fontSize: "12px" }}>تفعيل القواعد الاختيارية</b>
                  {[
                    { label: "فحص اتجاه التصميم", key: "orientationEnabled" },
                    { label: "فحص المقاس ونسبة الأبعاد", key: "dimensions.enabled" },
                    { label: "فرض نظام ألوان محدد (اختياري)", key: "colorRules.enabled" },
                  ].map((option) => {
                    let parsed: any = {};
                    try { parsed = JSON.parse(guidelinesDraft || "{}"); } catch {}
                    const checked = option.key === "orientationEnabled"
                      ? parsed.orientationEnabled !== false
                      : option.key === "dimensions.enabled"
                        ? parsed.dimensions?.enabled !== false
                        : parsed.colorRules?.enabled !== false;
                    return (
                      <label key={option.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            try {
                              const next = JSON.parse(guidelinesDraft || "{}");
                              if (option.key === "orientationEnabled") next.orientationEnabled = event.target.checked;
                              if (option.key === "dimensions.enabled") {
                                next.dimensions = { ...(next.dimensions ?? DEFAULT_GUIDELINES.dimensions), enabled: event.target.checked };
                              }
                              if (option.key === "colorRules.enabled") {
                                next.colorRules = { ...(next.colorRules ?? DEFAULT_GUIDELINES.colorRules), enabled: event.target.checked };
                              }
                              setGuidelinesDraft(JSON.stringify(next, null, 2));
                            } catch {
                              notify("صحّح صيغة JSON أولًا", "error");
                            }
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                  <small style={{ color: "#77758c", lineHeight: 1.5 }}>
                    اللوجوهات وأرقام التواصل تظل قواعد أساسية حتى لو عطلت القواعد الثلاثة.
                  </small>
                </div>

                <textarea
                  value={guidelinesDraft ?? ""}
                  onChange={(e) => setGuidelinesDraft(e.target.value)}
                  style={{
                    minHeight: "260px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #e9e9f2",
                  }}
                />
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(guidelinesDraft);
                      saveGuidelinesMutation.mutate(parsed);
                    } catch {
                      notify("Guidelines must be valid JSON", "error");
                    }
                  }}
                  disabled={saveGuidelinesMutation.isPending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: 0,
                    background: "linear-gradient(135deg, #6d64ff, #554be9)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  <Save size={14} />
                  {saveGuidelinesMutation.isPending ? "Saving..." : "Save guidelines"}
                </button>
              </div>
            ) : guidelines ? (
              <div style={{ fontSize: "12px", color: "#5a5870", lineHeight: 1.7 }}>
                <div>الاتجاه: <b>{guidelines.orientationEnabled === false ? "اختياري" : guidelines.orientation}</b></div>
                <div>
                  المقاس: <b>{guidelines.dimensions?.enabled === false ? "اختياري" : `${guidelines.dimensions?.width}×${guidelines.dimensions?.height}px (${guidelines.dimensions?.aspectRatio})`}</b>
                </div>
                <div>نظام الألوان: <b>{guidelines.colorRules?.enabled === false ? "اختياري" : guidelines.colorRules?.mode}</b></div>
                <div>Logo: <b>{guidelines.header?.logoPosition}</b></div>
                <div>
                  Footer: <b>{guidelines.footer?.phone}</b> · <b>{guidelines.footer?.socialHandle}</b>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "#8b88a5", margin: 0 }}>
                No guidelines saved yet. Click "Set up" to add this client's design rules before analyzing designs.
              </p>
            )}
          </article>

          <div style={{ order: 2 }}>
            <ClientBrandVerification clientId={clientId} editable={false} />
          </div>

          {/* Approved logos and exact contact details used by AI review */}
          <article aria-hidden="true" style={{ display: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <ImageIcon size={16} color="#655cf6" />
              <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>التحقق من اللوجو وبيانات التواصل</h3>
            </div>
            <p style={{ margin: "0 0 16px", color: "#77758c", fontSize: "11px", lineHeight: 1.5 }}>
              Add the exact approved logo files and contact values. Design Review will check their presence,
              identity, written value, and expected position.
            </p>

            <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
              <b style={{ fontSize: "12px" }}>اللوجوهات المعتمدة</b>
              {(guidelines?.logoAssets ?? []).map((logo: any) => (
                <div key={logo.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: "10px", alignItems: "center", padding: "9px", borderRadius: "10px", background: "#f8f8fb" }}>
                  <img src={logo.imageUrl} alt={logo.name} style={{ width: "44px", height: "44px", objectFit: "contain", borderRadius: "8px", background: "#fff" }} />
                  <div>
                    <b style={{ display: "block", fontSize: "12px" }}>{logo.name}</b>
                    <span style={{ fontSize: "10px", color: "#77758c" }}>
                      {logo.variant} · {logo.expectedPosition} · {logo.required ? "required" : "optional"}
                    </span>
                  </div>
                  {canManageGuidelines && (
                    <button
                      onClick={() => removeGuidelineItemMutation.mutate({ type: "logo", id: logo.id })}
                      title="Remove logo rule"
                      style={{ border: 0, background: "none", color: "#ff5b5b", cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!guidelines?.logoAssets?.length && (
                <span style={{ color: "#8b88a5", fontSize: "11px" }}>No approved logo image added yet.</span>
              )}

              {canManageGuidelines && (
                <div style={{ display: "grid", gap: "8px", padding: "10px", border: "1px dashed #d8d5ff", borderRadius: "10px" }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} style={{ fontSize: "11px" }} />
                  <input value={logoName} onChange={(e) => setLogoName(e.target.value)} placeholder="Logo name" style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <select value={logoVariant} onChange={(e) => setLogoVariant(e.target.value)} style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}>
                      {["primary", "arabic", "english", "white", "black", "icon", "other"].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value)} style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}>
                      {["top-right", "top-left", "top-center", "center", "bottom-right", "bottom-left", "bottom-center"].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => logoAssetMutation.mutate()}
                    disabled={!logoFile || logoAssetMutation.isPending}
                    style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5px", padding: "8px", border: 0, borderRadius: "8px", background: "#655cf6", color: "#fff", fontSize: "11px", fontWeight: 700, cursor: logoFile ? "pointer" : "not-allowed", opacity: logoFile ? 1 : 0.5 }}
                  >
                    <Plus size={13} />
                    {logoAssetMutation.isPending ? "Uploading..." : "Add approved logo"}
                  </button>
                  {logoAssetMutation.isPending && <UploadProgressBar progress={logoUploadProgress.progress} />}
                  {logoAssetMutation.isError && <span style={{ color: "#ff5b5b", fontSize: "10px" }}>{(logoAssetMutation.error as Error).message}</span>}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Phone size={14} color="#655cf6" />
                <b style={{ fontSize: "12px" }}>الأرقام وبيانات التواصل المطلوبة</b>
              </div>
              {(guidelines?.contactDetails ?? []).map((contact: any) => (
                <div key={contact.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center", padding: "9px", borderRadius: "10px", background: "#f8f8fb" }}>
                  <div>
                    <b style={{ display: "block", fontSize: "12px" }}>{contact.label}: {contact.value}</b>
                    <span style={{ fontSize: "10px", color: "#77758c" }}>
                      {contact.type} · {contact.expectedPosition} · {contact.exactMatch ? "exact match" : "format flexible"}
                    </span>
                  </div>
                  {canManageGuidelines && (
                    <button
                      onClick={() => removeGuidelineItemMutation.mutate({ type: "contact", id: contact.id })}
                      title="Remove contact rule"
                      style={{ border: 0, background: "none", color: "#ff5b5b", cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!guidelines?.contactDetails?.length && (
                <span style={{ color: "#8b88a5", fontSize: "11px" }}>No exact phone or contact value added yet.</span>
              )}

              {canManageGuidelines && (
                <div style={{ display: "grid", gap: "8px", padding: "10px", border: "1px dashed #d8d5ff", borderRadius: "10px" }}>
                  <input value={contactLabel} onChange={(e) => setContactLabel(e.target.value)} placeholder="Label, e.g. Hotline" style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }} />
                  <input value={contactValue} onChange={(e) => setContactValue(e.target.value)} placeholder="Exact number, handle, or URL" style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <select value={contactType} onChange={(e) => setContactType(e.target.value)} style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}>
                      {["phone", "whatsapp", "hotline", "social", "website", "other"].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <select value={contactPosition} onChange={(e) => setContactPosition(e.target.value)} style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}>
                      {["top-right", "top-left", "top-center", "center", "bottom-right", "bottom-left", "bottom-center"].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => contactDetailMutation.mutate()}
                    disabled={!contactValue.trim() || contactDetailMutation.isPending}
                    style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5px", padding: "8px", border: 0, borderRadius: "8px", background: "#655cf6", color: "#fff", fontSize: "11px", fontWeight: 700, cursor: contactValue.trim() ? "pointer" : "not-allowed", opacity: contactValue.trim() ? 1 : 0.5 }}
                  >
                    <Plus size={13} />
                    {contactDetailMutation.isPending ? "Saving..." : "Add contact rule"}
                  </button>
                  {contactDetailMutation.isError && <span style={{ color: "#ff5b5b", fontSize: "10px" }}>{(contactDetailMutation.error as Error).message}</span>}
                </div>
              )}
            </div>
          </article>

          {/* Upload card */}
          <article style={{ order: 1, background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px" }}>رفع تصميم</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: "12px" }}
              />
              <select
                value={designType}
                onChange={(e) => setDesignType(e.target.value)}
                style={{ padding: "10px", borderRadius: "10px", border: "1px solid #e9e9f2", fontSize: "13px" }}
              >
                {DESIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <input
                placeholder="Design title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ padding: "10px", borderRadius: "10px", border: "1px solid #e9e9f2", fontSize: "13px" }}
              />
              <input
                placeholder="Campaign name (optional)"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                style={{ padding: "10px", borderRadius: "10px", border: "1px solid #e9e9f2", fontSize: "13px" }}
              />
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!uploadFile || uploadMutation.isPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: 0,
                  background: "linear-gradient(135deg, #6d64ff, #554be9)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: uploadFile ? "pointer" : "not-allowed",
                  opacity: uploadFile ? 1 : 0.6,
                }}
              >
                <Upload size={14} />
                {uploadMutation.isPending ? "Uploading..." : "Upload design"}
              </button>
              {uploadMutation.isPending && (
                <UploadProgressBar
                  progress={designUploadProgress.progress}
                  hint="The design is uploaded first, then stored on Cloudinary before the review can start."
                />
              )}
              {uploadMutation.isError && (
                <p style={{ color: "#ff5b5b", fontSize: "12px" }}>{(uploadMutation.error as any)?.message}</p>
              )}
            </div>
          </article>

          {/* Design history list */}
          <article style={{ order: 3, background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px" }}>سجل التصميمات</h3>
            {loadingDesigns ? (
              <Loader2 className="animate-spin" size={18} color="#655cf6" />
            ) : designs.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#8b88a5" }}>No designs uploaded yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {designs.map((d: any) => (
                  <div
                    key={d._id}
                    onClick={() => setSelectedDesignId(d._id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: d._id === selectedDesignId ? "2px solid #655cf6" : "1px solid #eeeef5",
                      background: "#f8f8fb",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <img
                      src={cloudinaryThumbnail(d.assetUrl, 160)}
                      alt={d.title || d.designType}
                      style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "cover" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: "12px", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {d.title || d.designType.replace(/_/g, " ")} · v{d.version}
                      </b>
                      <small style={{ color: "#8b88a5", fontSize: "11px" }}>{d.status}</small>
                    </div>
                    {d.isApprovedReference && <Star size={14} color="#d7772d" fill="#d7772d" style={{ flexShrink: 0 }} />}
                    
                    {/* Deletion is a manager/admin action. */}
                    {canManageGuidelines && <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Are you sure you want to delete this design and its analysis history?")) {
                          deleteDesignMutation.mutate(d._id);
                        }
                      }}
                      disabled={deleteDesignMutation.isPending}
                      style={{
                        background: "none",
                        border: 0,
                        cursor: "pointer",
                        padding: "4px",
                        borderRadius: "6px",
                        color: "#ff5b5b",
                        transition: "background 0.2s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fff0f0")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      title="Delete Design"
                    >
                      <Trash2 size={14} />
                    </button>}
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>

        {/* RIGHT COLUMN: analysis + review result */}
        <div>
          {!selectedDesign ? (
            <div
              style={{
                background: "#fff",
                borderRadius: "16px",
                padding: "60px 20px",
                textAlign: "center",
                border: "1px solid #eeeef5",
                color: "#8b88a5",
                fontSize: "13px",
              }}
            >
              اختار تصميمًا من السجل أو ارفع تصميمًا جديدًا لبدء المراجعة.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5", display: "flex", gap: "20px", flexWrap: "wrap" }}>
                <img
                  src={cloudinaryThumbnail(selectedDesign.assetUrl, 720)}
                  alt={selectedDesign.title}
                  style={{ width: "180px", borderRadius: "12px", objectFit: "cover", border: "1px solid #eeeef5" }}
                />
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 6px" }}>
                    {selectedDesign.title || selectedDesign.designType.replace(/_/g, " ")}
                  </h2>
                  <p style={{ fontSize: "12px", color: "#8b88a5", margin: "0 0 14px" }}>
                    v{selectedDesign.version} · {selectedDesign.designType.replace(/_/g, " ")} · status: {selectedDesign.status}
                  </p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      className="dr-analyze-button"
                      onClick={() => analyzeMutation.mutate(selectedDesign._id)}
                      disabled={analyzeMutation.isPending || !guidelines}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "10px 16px",
                        borderRadius: "10px",
                        border: 0,
                        background: "linear-gradient(135deg, #6d64ff, #554be9)",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: guidelines ? "pointer" : "not-allowed",
                        opacity: guidelines ? 1 : 0.5,
                      }}
                    >
                      <Sparkles size={14} />
                      {analyzeMutation.isPending ? "جاري التحليل..." : "تحليل التصميم"}
                    </button>
                  </div>
                  {!guidelines && (
                    <p style={{ color: "#d7772d", fontSize: "12px", marginTop: "10px" }}>
                      Add design guidelines for this client before analyzing.
                    </p>
                  )}
                  {analyzeMutation.isError && (
                    <p style={{ color: "#ff5b5b", fontSize: "12px", marginTop: "10px" }}>
                      {(analyzeMutation.error as any)?.message}
                    </p>
                  )}
                  {(selectedDesign.status === "analyzing" || analyzeMutation.isPending) && (
                    <div className="dr-progress-panel">
                      <div className="dr-progress-copy">
                        <span className="dr-progress-status">
                          <Loader2 className="animate-spin" size={14} />
                          {selectedDesign.analysisStage || "Starting analysis..."}
                        </span>
                        <b>{selectedDesign.analysisProgress ?? 2}%</b>
                      </div>
                      <div
                        className="dr-progress-track"
                        role="progressbar"
                        aria-label="Design analysis progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={selectedDesign.analysisProgress ?? 2}
                      >
                        <span
                          className="dr-progress-fill"
                          style={{ width: `${selectedDesign.analysisProgress ?? 2}%` }}
                        />
                      </div>
                      <small>Checking dimensions, brand rules, logos, contacts, and visual quality.</small>
                    </div>
                  )}
                </div>
              </article>

              {loadingReview ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                  <Loader2 className="animate-spin" size={26} color="#655cf6" />
                </div>
              ) : review ? (
                <>
                  <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span
                        style={{
                          padding: "6px 14px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "#fff",
                          background: statusColor[review.finalResult.status] ?? "#8b88a5",
                        }}
                      >
                        {statusLabel[review.finalResult.status] ?? review.finalResult.status}
                      </span>
                      <div style={{ display: "flex", gap: "18px", fontSize: "12px", color: "#5a5870" }}>
                        <span>الإجمالي <b>{review.finalResult.overallScore}</b></span>
                        <span>الفني <b>{review.finalResult.technicalScore}</b></span>
                        <span>الهوية <b>{review.finalResult.brandScore}</b></span>
                        <span>المحتوى <b>{review.finalResult.contentScore}</b></span>
                        <span>الثقة <b>{review.finalResult.confidenceScore}</b></span>
                  </div>
                </div>
                    <p style={{ fontSize: "13px", color: "#3a3852", lineHeight: 1.6, margin: 0 }}>
                      {review.finalResult.summary}
                    </p>
                  </article>

                  {/* Visual Reference Feedback */}
                  {review.finalResult.referenceFeedback && (
                    <article style={{ background: "#f5f3ff", borderRadius: "16px", padding: "24px", border: "1px solid #dcd6ff" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                        <Sparkles size={18} color="#655cf6" />
                        <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#4c3ebd" }}>
                          تقييم المطابقة مع المرجع البصري (Reference Feedback)
                        </h3>
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#3f367a",
                          lineHeight: 1.6,
                          whiteSpace: "pre-line",
                          direction: "rtl",
                          textAlign: "right",
                        }}
                      >
                        {review.finalResult.referenceFeedback}
                      </div>
                    </article>
                  )}

                  {/* Suggested Prompt */}
                  {review.finalResult.suggestedPrompt && (
                    <article style={{ background: "#1b1931", borderRadius: "16px", padding: "24px", border: "1px solid #2f2a52" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <FileText size={18} color="#9e92ec" />
                          <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#c1b9f9" }}>
                            البرومبت المقترح لتعديل التصميم (Suggested Prompt)
                          </h3>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(review.finalResult.suggestedPrompt || "");
                            setCopiedPrompt(true);
                            setTimeout(() => setCopiedPrompt(false), 2000);
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            background: copiedPrompt ? "#28a36a" : "#322d56",
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 700,
                            border: 0,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                        >
                          {copiedPrompt ? "Copied! / تم النسخ" : "Copy / نسخ البرومبت"}
                        </button>
                      </div>
                      <p style={{ fontSize: "11px", color: "#8a81bc", margin: "0 0 10px", lineHeight: 1.4 }}>
                        يمكنك نسخ هذا الوصف وإرساله للمصمم أو استخدامه مباشرة في محرك الذكاء الاصطناعي (مثل Midjourney أو DALL-E) لتوليد نسخة محسنة مطابقة تماماً للمراجع البصرية.
                      </p>
                      <div
                        style={{
                          background: "#0d0c18",
                          borderRadius: "10px",
                          padding: "16px",
                          fontSize: "12px",
                          fontFamily: "monospace",
                          color: "#99ec5e",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {review.finalResult.suggestedPrompt}
                      </div>
                    </article>
                  )}

                  {review.finalResult.violations.length > 0 && (
                    <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px", color: "#ff5b5b" }}>
                        المشاكل المطلوبة ({review.finalResult.violations.length})
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {review.finalResult.violations.map((c: any, i: number) => (
                          <CheckRow key={i} check={c} />
                        ))}
                      </div>
                    </article>
                  )}

                  {review.finalResult.warnings.length > 0 && (
                    <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px", color: "#d7772d" }}>
                        التحذيرات ({review.finalResult.warnings.length})
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {review.finalResult.warnings.map((c: any, i: number) => (
                          <CheckRow key={i} check={c} />
                        ))}
                      </div>
                    </article>
                  )}

                  {review.finalResult.manualChecks.length > 0 && (
                    <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px", color: "#8b88a5" }}>
                        يحتاج مراجعة بشرية ({review.finalResult.manualChecks.length})
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {review.finalResult.manualChecks.map((c: any, i: number) => (
                          <CheckRow key={i} check={c} />
                        ))}
                      </div>
                    </article>
                  )}

                  {review.finalResult.passedChecks.length > 0 && (
                    <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px", color: "#28a36a" }}>
                        Passed ({review.finalResult.passedChecks.length})
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {review.finalResult.passedChecks.map((c: any, i: number) => (
                          <CheckRow key={i} check={c} />
                        ))}
                      </div>
                    </article>
                  )}

                  {review.finalResult.recommendedChanges.length > 0 && (
                    <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px" }}>Recommended changes</h3>
                      <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#5a5870", lineHeight: 1.8 }}>
                        {review.finalResult.recommendedChanges.map((c: any, i: number) => (
                          <li key={i}>
                            <b>[{c.priority}]</b> {c.title} — {c.instruction}
                          </li>
                        ))}
                      </ol>
                    </article>
                  )}

                  {canManageGuidelines ? (
                  <article style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px" }}>Account manager decision</h3>
                    <textarea
                      placeholder="Notes (optional)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: "70px",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "1px solid #e9e9f2",
                        fontSize: "13px",
                        marginBottom: "10px",
                      }}
                    />
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        className="dr-decision-button"
                        onClick={() => decisionMutation.mutate({ decision: "approved" })}
                        disabled={decisionMutation.isPending}
                        style={{ padding: "10px 16px", borderRadius: "10px", border: 0, background: "#28a36a", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
                      >
                        Approve
                        <span style={{ display: "block", fontSize: "9px", opacity: .82 }}>Add as reference</span>
                      </button>
                      <button
                        className="dr-decision-button"
                        onClick={() => decisionMutation.mutate({ decision: "changes_requested" })}
                        disabled={decisionMutation.isPending}
                        style={{ padding: "10px 16px", borderRadius: "10px", border: 0, background: "#d7772d", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
                      >
                        Request changes
                      </button>
                      <button
                        className="dr-decision-button"
                        onClick={() => decisionMutation.mutate({ decision: "rejected" })}
                        disabled={decisionMutation.isPending}
                        style={{ padding: "10px 16px", borderRadius: "10px", border: 0, background: "#ff5b5b", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                  ) : (
                    <article style={{ background: "rgba(255,255,255,.78)", borderRadius: "16px", padding: "20px", border: "1px solid #eeeef5" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 800, margin: "0 0 7px" }}>حالة الاعتماد</h3>
                      <p style={{ margin: 0, color: "#6f6c85", fontSize: "12.5px", lineHeight: 1.6 }}>
                        {review.decision === "approved"
                          ? "تم اعتماد التصميم وإضافته إلى مراجع العميل."
                          : review.decision === "rejected"
                            ? "تم رفض التصميم ولم تتم إضافته إلى مراجع العميل."
                            : review.decision === "changes_requested"
                              ? "طلب المراجع تعديلات على التصميم."
                              : "تم إرسال التصميم للمراجعة. الاعتماد أو الرفض متاح للمدير أو المسؤول فقط."}
                      </p>
                      {review.humanNotes && (
                        <div style={{ marginTop: "12px", padding: "11px 13px", borderRadius: "10px", background: "#f5f3ff", color: "#4c3ebd", fontSize: "12px" }}>
                          <b>تعليق المراجع:</b> {review.humanNotes}
                        </div>
                      )}
                    </article>
                  )}
                </>
              ) : (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: "16px",
                    padding: "40px 20px",
                    textAlign: "center",
                    border: "1px solid #eeeef5",
                    color: "#8b88a5",
                    fontSize: "13px",
                  }}
                >
                  لا توجد نتيجة بعد — اضغط «تحليل التصميم» لتشغيل الفحص الفني وفحص الهوية.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
