"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { apiRequest } from "../../../utils/api";
import { cloudinaryThumbnail } from "../../../utils/cloudinary";

export default function ApprovalInboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, hasHydrated } = useAuthStore();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decisionFeedback, setDecisionFeedback] = useState<{
    kind: "approved" | "rejected" | "error";
    phase: "saving" | "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (decisionFeedback?.phase !== "success") return;
    const timer = window.setTimeout(() => setDecisionFeedback(null), 1500);
    return () => window.clearTimeout(timer);
  }, [decisionFeedback]);

  useEffect(() => {
    if (hasHydrated && !user) router.replace("/login");
    if (hasHydrated && user && user.role !== "admin" && user.role !== "manager") {
      router.replace("/");
    }
  }, [hasHydrated, user, router]);

  const pending = useQuery({
    queryKey: ["approvals"],
    queryFn: () => apiRequest<any>("/approvals"),
    enabled: !!user && (user.role === "admin" || user.role === "manager"),
    refetchInterval: 15_000,
  });

  const designDecision = useMutation({
    mutationFn: ({ clientId, id, decision }: any) =>
      apiRequest(`/clients/${clientId}/designs/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          humanNotes: notes[id]?.trim() || undefined,
        }),
      }),
    onMutate: ({ decision }) => setDecisionFeedback({ kind: decision, phase: "saving" }),
    onSuccess: (_data, { decision }) => {
      setDecisionFeedback({ kind: decision, phase: "success" });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: () => setDecisionFeedback({ kind: "error", phase: "error" }),
  });

  const referenceDecision = useMutation({
    mutationFn: ({ clientId, id }: any) =>
      apiRequest(`/clients/${clientId}/design-references/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({
          decision: "rejected",
          humanNotes: notes[id]?.trim() || undefined,
        }),
      }),
    onMutate: () => setDecisionFeedback({ kind: "rejected", phase: "saving" }),
    onSuccess: () => {
      setDecisionFeedback({ kind: "rejected", phase: "success" });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: () => setDecisionFeedback({ kind: "error", phase: "error" }),
  });

  if (!hasHydrated || !user || pending.isLoading) {
    return <main className="approval-page approval-center"><Loader2 className="animate-spin" /></main>;
  }

  const data = pending.data ?? { total: 0, designs: [], references: [] };
  return (
    <main className="approval-page">
      {decisionFeedback && (
        <div
          className="dr-decision-overlay"
          role="status"
          aria-live="polite"
          onClick={() => decisionFeedback.phase === "error" && setDecisionFeedback(null)}
        >
          <div className={`dr-decision-pop dr-decision-pop--${decisionFeedback.kind} dr-decision-pop--${decisionFeedback.phase}`}>
            <div className="dr-decision-icon">
              {decisionFeedback.phase === "saving" ? <Loader2 className="animate-spin" /> :
                decisionFeedback.kind === "approved" ? <CheckCircle2 /> : <XCircle />}
            </div>
            <strong>
              {decisionFeedback.phase === "saving"
                ? "Saving decision · جاري حفظ القرار"
                : decisionFeedback.kind === "approved"
                  ? "Approved · تمت الموافقة"
                  : decisionFeedback.kind === "rejected"
                    ? "Rejected · تم الرفض"
                    : "Could not save · تعذّر الحفظ"}
            </strong>
            <span>
              {decisionFeedback.phase === "saving"
                ? "Please wait a moment"
                : decisionFeedback.phase === "error"
                  ? "Click to close, then try again"
                  : "The approval inbox has been updated"}
            </span>
          </div>
        </div>
      )}
      <header className="approval-header">
        <button onClick={() => router.push("/")}>← Dashboard</button>
        <div>
          <span className="approval-eyebrow"><Clock3 size={15} /> Manager workspace</span>
          <h1>Approval Inbox</h1>
          <p>Review member submissions, leave an optional comment, then approve or reject.</p>
        </div>
        <b className="approval-count">{data.total} pending</b>
      </header>

      {data.total === 0 ? (
        <section className="approval-empty">
          <CheckCircle2 size={42} />
          <h2>Everything is reviewed</h2>
          <p>There are no pending designs or references.</p>
        </section>
      ) : (
        <div className="approval-columns">
          <section>
            <h2>Design reviews <span>{data.designs.length}</span></h2>
            <div className="approval-list">
              {data.designs.map((design: any) => (
                <article className="approval-card" key={design._id}>
                  <img src={cloudinaryThumbnail(design.assetUrl, 360)} alt={design.title || "Design"} loading="lazy" />
                  <div className="approval-card-body">
                    <small>{design.client?.name} · uploaded by {design.uploadedBy?.name || "Member"}</small>
                    <h3>{design.title || design.designType?.replaceAll("_", " ")}</h3>
                    <textarea
                      placeholder="Optional approval comment..."
                      value={notes[design._id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [design._id]: event.target.value }))}
                    />
                    <div className="approval-actions">
                      <button className="approval-open" onClick={() => router.push(`/clients/${design.client?._id}/design-review`)}>
                        <ExternalLink size={14} /> Full review
                      </button>
                      <button className="approval-accept" onClick={() => designDecision.mutate({ clientId: design.client?._id, id: design._id, decision: "approved" })}>
                        <CheckCircle2 size={14} /> Approve
                      </button>
                      <button className="approval-reject" onClick={() => designDecision.mutate({ clientId: design.client?._id, id: design._id, decision: "rejected" })}>
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2>Design references <span>{data.references.length}</span></h2>
            <div className="approval-list">
              {data.references.map((reference: any) => (
                <article className="approval-card" key={reference._id}>
                  <img src={cloudinaryThumbnail(reference.imageUrl, 360)} alt={reference.originalFileName} loading="lazy" />
                  <div className="approval-card-body">
                    <small>{reference.clientId?.name} · uploaded by {reference.uploadedBy?.name || "Member"}</small>
                    <h3>{reference.originalFileName}</h3>
                    <textarea
                      placeholder="Optional rejection comment..."
                      value={notes[reference._id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [reference._id]: event.target.value }))}
                    />
                    <div className="approval-actions">
                      <button className="approval-open" onClick={() => router.push(`/?clientId=${reference.clientId?._id}&clientSubTab=references`)}>
                        <ExternalLink size={14} /> Review & apply
                      </button>
                      <button className="approval-reject" onClick={() => referenceDecision.mutate({ clientId: reference.clientId?._id, id: reference._id })}>
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
