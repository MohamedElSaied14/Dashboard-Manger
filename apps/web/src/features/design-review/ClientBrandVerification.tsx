"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Phone, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { apiRequest } from "../../utils/api";
import { apiUpload } from "../../utils/apiUpload";
import { UploadProgressBar, useUploadProgress } from "../../components/ui/UploadProgressBar";

const POSITIONS = [
  "top-right", "top-left", "top-center", "center",
  "bottom-right", "bottom-left", "bottom-center",
];
const clampPercent = (value: number, minimum = 0) =>
  Math.min(100, Math.max(minimum, Number.isFinite(value) ? value : minimum));

const POSITION_DEFAULTS: Record<string, { x: number; y: number }> = {
  "top-right": { x: 88, y: 10 },
  "top-left": { x: 12, y: 10 },
  "top-center": { x: 50, y: 10 },
  center: { x: 50, y: 50 },
  "bottom-right": { x: 88, y: 90 },
  "bottom-left": { x: 12, y: 90 },
  "bottom-center": { x: 50, y: 90 },
};

const FALLBACK_GUIDELINES = {
  logoAssets: [],
  contactDetails: [],
  orientation: "portrait",
  orientationEnabled: false,
  dimensions: { enabled: false, width: 1080, height: 1350, aspectRatio: "4:5", tolerancePx: 2 },
  colorRules: { enabled: false, mode: "brand-colors", allowedColors: [], allowGrayscale: true },
  header: { logoRequired: true, logoPosition: "top-right", logoRepeatedAllowed: false },
  footer: { required: false, separatorRequired: false },
};

export default function ClientBrandVerification({
  clientId,
  editable = true,
}: {
  clientId: string;
  editable?: boolean;
}) {
  const { user, lang } = useAuthStore();
  const queryClient = useQueryClient();
  const canManage = editable && (user?.role === "admin" || user?.role === "manager");
  const isArabic = lang === "ar";

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("Primary logo");
  const [logoVariant, setLogoVariant] = useState("primary");
  const [logoPosition, setLogoPosition] = useState("top-right");
  const [logoX, setLogoX] = useState(88);
  const [logoY, setLogoY] = useState(10);
  const [logoWidth, setLogoWidth] = useState(15);
  const [logoTolerance, setLogoTolerance] = useState(3);
  const [logoMargin, setLogoMargin] = useState(5);
  const placementPreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);
  const [contactLabel, setContactLabel] = useState("Main phone");
  const [contactType, setContactType] = useState("phone");
  const [contactValue, setContactValue] = useState("");
  const [contactPosition, setContactPosition] = useState("bottom-left");

  const { data: guidelines, isLoading } = useQuery<any>({
    queryKey: ["design-guidelines", clientId],
    queryFn: () => apiRequest(`/clients/${clientId}/design-guidelines`).catch(() => null),
    enabled: Boolean(clientId),
  });

  const save = async (next: any) => {
    await apiRequest(`/clients/${clientId}/design-guidelines`, {
      method: "PUT",
      body: JSON.stringify(next),
    });
  };

  const logoUploadProgress = useUploadProgress();
  const logoMutation = useMutation({
    mutationFn: async () => {
      if (!logoFile) throw new Error("Select a logo image first");
      const formData = new FormData();
      formData.append("file", logoFile);
      formData.append("assetType", "approved_logo");
      formData.append("ownerId", clientId);
      const upload = await apiUpload<{ url: string; publicId: string }>("/upload", {
        body: formData,
        onProgress: logoUploadProgress.onProgress,
      });
      const current = guidelines ?? FALLBACK_GUIDELINES;
      await save({
        ...current,
        logoAssets: [
          ...(current.logoAssets ?? []),
          {
            id: crypto.randomUUID(),
            name: logoName.trim() || "Client logo",
            variant: logoVariant,
            imageUrl: upload.url,
            cloudinaryPublicId: upload.publicId,
            required: true,
            expectedPosition: logoPosition,
            precisePlacement: {
              xPercent: clampPercent(logoX, 1),
              yPercent: clampPercent(logoY, 1),
              widthPercent: clampPercent(logoWidth, 1),
              tolerancePercent: clampPercent(logoTolerance),
              marginPercent: Math.min(40, clampPercent(logoMargin)),
            },
            allowedBackground: "any",
          },
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-guidelines", clientId] });
      setLogoFile(null);
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(null);
      setLogoName("Primary logo");
    },
  });

  const contactMutation = useMutation({
    mutationFn: async () => {
      if (!contactValue.trim()) throw new Error("Enter the exact contact value first");
      const current = guidelines ?? FALLBACK_GUIDELINES;
      await save({
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-guidelines", clientId] });
      setContactValue("");
      setContactLabel("Main phone");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ type, id }: { type: "logo" | "contact"; id: string }) => {
      const current = guidelines ?? FALLBACK_GUIDELINES;
      await save({
        ...current,
        logoAssets:
          type === "logo"
            ? (current.logoAssets ?? []).filter((item: any) => item.id !== id)
            : (current.logoAssets ?? []),
        contactDetails:
          type === "contact"
            ? (current.contactDetails ?? []).filter((item: any) => item.id !== id)
            : (current.contactDetails ?? []),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design-guidelines", clientId] }),
  });

  if (isLoading) {
    return <div className="card" style={{ padding: "18px", fontSize: "12px" }}>Loading brand verification rules...</div>;
  }

  return (
    <section className="card" style={{ padding: "20px", marginBottom: editable ? "24px" : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <ImageIcon size={17} color="#655cf6" />
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800 }}>
          {isArabic ? "الشعارات وبيانات التواصل الثابتة" : "Logo & contact verification"}
        </h3>
      </div>
      <p style={{ margin: "0 0 18px", color: "var(--muted)", fontSize: "12px", lineHeight: 1.5 }}>
        {editable
          ? (isArabic
              ? "بيانات ثابتة في ملف العميل يستخدمها Design Review للتأكد من الشعار والأرقام ومواضعهم."
              : "Permanent client data used by Design Review to validate each logo inside a broad area such as top-right or top-left. Exact coordinates are not required.")
          : (isArabic
              ? "ملخص للقراءة فقط. يتم التعديل من Design References داخل ملف العميل."
              : "Read-only summary. Edit these permanent rules from the client's Design References tab.")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: editable ? "1fr 1fr" : "1fr", gap: "18px" }}>
        <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
          <b style={{ fontSize: "12px" }}>{isArabic ? "الشعارات المعتمدة" : "Approved logos"}</b>
          {(guidelines?.logoAssets ?? []).map((logo: any) => (
            <div key={logo.id} style={{ display: "grid", gridTemplateColumns: "46px 1fr auto", gap: "10px", alignItems: "center", padding: "9px", borderRadius: "10px", background: "#f8f8fb" }}>
              <img src={logo.imageUrl} alt={logo.name} style={{ width: "46px", height: "46px", objectFit: "contain", borderRadius: "8px", background: "#fff" }} />
              <div>
                <b style={{ display: "block", fontSize: "12px" }}>{logo.name}</b>
                <span style={{ fontSize: "10px", color: "#77758c" }}>{logo.variant} · {logo.expectedPosition} · {logo.required ? "required" : "optional"}</span>
                {logo.precisePlacement && (
                  <span style={{ display: "block", fontSize: "10px", color: "#655cf6", marginTop: "2px" }}>
                    X {logo.precisePlacement.xPercent}% · Y {logo.precisePlacement.yPercent}% · width {logo.precisePlacement.widthPercent}% · margin {logo.precisePlacement.marginPercent ?? 0}% · allowed range ±{logo.precisePlacement.tolerancePercent}%
                  </span>
                )}
              </div>
              {canManage && (
                <button onClick={() => removeMutation.mutate({ type: "logo", id: logo.id })} title="Remove logo rule" style={{ border: 0, background: "none", color: "#ff5b5b", cursor: "pointer" }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {!guidelines?.logoAssets?.length && <span style={{ color: "#8b88a5", fontSize: "11px" }}>No approved logo image added yet.</span>}

          {canManage && (
            <div style={{ display: "grid", gap: "8px", padding: "10px", border: "1px dashed #d8d5ff", borderRadius: "10px" }}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
                  setLogoFile(file);
                  setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
                }}
                style={{ fontSize: "11px" }}
              />
              <input value={logoName} onChange={(event) => setLogoName(event.target.value)} placeholder="Logo name" style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <select value={logoVariant} onChange={(event) => setLogoVariant(event.target.value)} style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}>
                  {["primary", "arabic", "english", "white", "black", "icon", "other"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select
                  value={logoPosition}
                  onChange={(event) => {
                    const position = event.target.value;
                    setLogoPosition(position);
                    const preset = POSITION_DEFAULTS[position];
                    if (preset) {
                      setLogoX(preset.x);
                      setLogoY(preset.y);
                    }
                  }}
                  style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}
                >
                  {POSITIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                {[
                  { label: "X %", value: logoX, setter: setLogoX, min: 1, max: 100 },
                  { label: "Y %", value: logoY, setter: setLogoY, min: 1, max: 100 },
                  { label: "Width %", value: logoWidth, setter: setLogoWidth, min: 1, max: 100 },
                  { label: "Margin %", value: logoMargin, setter: setLogoMargin, min: 1, max: 40 },
                  { label: "Range ±%", value: logoTolerance, setter: setLogoTolerance, min: 0, max: 25 },
                ].map(({ label, value, setter, min, max }) => (
                  <label key={label} style={{ display: "grid", gap: "3px", fontSize: "9px", color: "#77758c" }}>
                    {label}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={value}
                      onChange={(event) => setter(Number(event.target.value))}
                      style={{ width: "100%", padding: "6px", border: "1px solid #e9e9f2", borderRadius: "7px", fontSize: "10px" }}
                    />
                  </label>
                ))}
              </div>
              <p style={{ margin: 0, textAlign: "center", fontSize: "9px", color: "#77758c" }}>
                Choose the broad area only. Dragging is a visual preview and does not enforce exact coordinates.
              </p>
              <div
                ref={placementPreviewRef}
                style={{ position: "relative", aspectRatio: "4 / 5", width: "140px", margin: "2px auto", border: "1px solid #d8d5ff", borderRadius: "8px", background: "linear-gradient(#f8f7ff 1px, transparent 1px), linear-gradient(90deg, #f8f7ff 1px, transparent 1px)", backgroundSize: "20% 20%", overflow: "hidden", touchAction: "none" }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: `${Math.min(40, clampPercent(logoMargin))}%`,
                    border: "1px dashed #ff9f43",
                    borderRadius: "4px",
                    pointerEvents: "none",
                  }}
                />
                <div
                  aria-hidden="true"
                  title={`Allowed position range: ±${logoTolerance}%`}
                  style={{
                    position: "absolute",
                    left: `${logoX}%`,
                    top: `${logoY}%`,
                    width: `${Math.min(100, logoWidth + logoTolerance * 2)}%`,
                    height: `${Math.min(100, logoWidth * 0.4 + logoTolerance * 2)}%`,
                    transform: "translate(-50%, -50%)",
                    border: "1px solid rgba(101, 92, 246, .65)",
                    background: "rgba(101, 92, 246, .10)",
                    borderRadius: "5px",
                    pointerEvents: "none",
                  }}
                />
                <div
                  title={`Logo center: ${logoX}%, ${logoY}%`}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const preview = placementPreviewRef.current;
                    if (!preview) return;
                    const rect = preview.getBoundingClientRect();
                    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
                    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
                    const safeMargin = Math.min(40, Math.max(0, logoMargin));
                    const halfWidth = logoWidth / 2;
                    const halfHeight = logoWidth * 0.2;
                    setLogoX(Math.round(Math.min(100 - safeMargin - halfWidth, Math.max(safeMargin + halfWidth, rawX))));
                    setLogoY(Math.round(Math.min(100 - safeMargin - halfHeight, Math.max(safeMargin + halfHeight, rawY))));
                  }}
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    const preview = placementPreviewRef.current;
                    if (!preview) return;
                    const rect = preview.getBoundingClientRect();
                    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
                    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
                    const safeMargin = Math.min(40, Math.max(0, logoMargin));
                    const halfWidth = logoWidth / 2;
                    const halfHeight = logoWidth * 0.2;
                    setLogoX(Math.round(Math.min(100 - safeMargin - halfWidth, Math.max(safeMargin + halfWidth, rawX))));
                    setLogoY(Math.round(Math.min(100 - safeMargin - halfHeight, Math.max(safeMargin + halfHeight, rawY))));
                  }}
                  style={{
                    position: "absolute",
                    left: `${logoX}%`,
                    top: `${logoY}%`,
                    width: `${Math.max(6, logoWidth)}%`,
                    aspectRatio: "2 / 1",
                    transform: "translate(-50%, -50%)",
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "3px",
                    background: "#655cf6",
                    color: "#fff",
                    fontSize: "7px",
                    fontWeight: 800,
                    cursor: "grab",
                    userSelect: "none",
                    boxShadow: "0 2px 5px rgba(85,75,233,.25)",
                  }}
                >
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="Logo placement preview"
                      draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                    />
                  ) : "LOGO"}
                </div>
              </div>
              <button onClick={() => logoMutation.mutate()} disabled={!logoFile || logoMutation.isPending} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5px", padding: "8px", border: 0, borderRadius: "8px", background: "#655cf6", color: "#fff", fontSize: "11px", fontWeight: 700, cursor: logoFile ? "pointer" : "not-allowed", opacity: logoFile ? 1 : 0.5 }}>
                <Plus size={13} />{logoMutation.isPending ? "Uploading..." : "Add approved logo"}
              </button>
              {logoMutation.isPending && <UploadProgressBar progress={logoUploadProgress.progress} />}
              {logoMutation.isError && <span style={{ color: "#ff5b5b", fontSize: "10px" }}>{(logoMutation.error as Error).message}</span>}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Phone size={14} color="#655cf6" />
            <b style={{ fontSize: "12px" }}>{isArabic ? "الأرقام وبيانات التواصل المطلوبة" : "Required numbers & contact details"}</b>
          </div>
          {(guidelines?.contactDetails ?? []).map((contact: any) => (
            <div key={contact.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center", padding: "9px", borderRadius: "10px", background: "#f8f8fb" }}>
              <div>
                <b style={{ display: "block", fontSize: "12px" }}>{contact.label}: {contact.value}</b>
                <span style={{ fontSize: "10px", color: "#77758c" }}>{contact.type} · {contact.expectedPosition} · {contact.exactMatch ? "exact match" : "format flexible"}</span>
              </div>
              {canManage && (
                <button onClick={() => removeMutation.mutate({ type: "contact", id: contact.id })} title="Remove contact rule" style={{ border: 0, background: "none", color: "#ff5b5b", cursor: "pointer" }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {!guidelines?.contactDetails?.length && <span style={{ color: "#8b88a5", fontSize: "11px" }}>No exact phone or contact value added yet.</span>}

          {canManage && (
            <div style={{ display: "grid", gap: "8px", padding: "10px", border: "1px dashed #d8d5ff", borderRadius: "10px" }}>
              <input value={contactLabel} onChange={(event) => setContactLabel(event.target.value)} placeholder="Label, e.g. Hotline" style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }} />
              <input value={contactValue} onChange={(event) => setContactValue(event.target.value)} placeholder="Exact number, handle, or URL" style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <select value={contactType} onChange={(event) => setContactType(event.target.value)} style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}>
                  {["phone", "whatsapp", "hotline", "social", "website", "other"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select value={contactPosition} onChange={(event) => setContactPosition(event.target.value)} style={{ padding: "8px", border: "1px solid #e9e9f2", borderRadius: "8px", fontSize: "11px" }}>
                  {POSITIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <button onClick={() => contactMutation.mutate()} disabled={!contactValue.trim() || contactMutation.isPending} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5px", padding: "8px", border: 0, borderRadius: "8px", background: "#655cf6", color: "#fff", fontSize: "11px", fontWeight: 700, cursor: contactValue.trim() ? "pointer" : "not-allowed", opacity: contactValue.trim() ? 1 : 0.5 }}>
                <Plus size={13} />{contactMutation.isPending ? "Saving..." : "Add contact rule"}
              </button>
              {contactMutation.isError && <span style={{ color: "#ff5b5b", fontSize: "10px" }}>{(contactMutation.error as Error).message}</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
