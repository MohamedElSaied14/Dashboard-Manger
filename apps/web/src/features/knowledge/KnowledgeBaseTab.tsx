"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardDescription, CardTitle } from "../../components/ui/Card";
import { UploadProgressBar, useUploadProgress } from "../../components/ui/UploadProgressBar";
import { apiRequest } from "../../utils/api";
import { apiUpload } from "../../utils/apiUpload";
import { notify } from "../../utils/notify";
import { useI18n } from "../../i18n/useI18n";

interface KnowledgeDocument {
  _id: string;
  title: string;
  fileName?: string;
  status: "pending" | "indexing" | "ready" | "failed";
  pageCount: number;
  chunkCount: number;
  charCount: number;
  embeddingTokens: number;
  error?: string;
  createdAt: string;
}

interface AskAnswer {
  answer: string;
  grounded: boolean;
  usedPassages: number;
  citations: Array<{ index: number; documentTitle: string; page: number; excerpt: string }>;
  usage: { embeddingTokens: number; promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * The client's PDF knowledge base.
 *
 * Documents are indexed once; every question after that reads a handful of retrieved passages
 * instead of the whole file, which is why the answer panel shows both the citations and what the
 * question actually cost.
 */
export default function KnowledgeBaseTab({ clientId }: { clientId: string }) {
  const { t, isRtl } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const uploadProgress = useUploadProgress();

  const { data: documents = [], isLoading } = useQuery<KnowledgeDocument[]>({
    queryKey: ["knowledge-documents", clientId],
    queryFn: () => apiRequest(`/clients/${clientId}/knowledge/documents`),
    // An index that is still building flips to "ready" on its own; poll only while that is true.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((document) => document.status === "indexing") ? 3_000 : false,
  });

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === "ready"),
    [documents],
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("knowledgePickFile"));
      const formData = new FormData();
      formData.append("file", file);
      if (title.trim()) formData.append("title", title.trim());
      return apiUpload<{ reused: boolean; chunkCount: number; pageCount: number }>(
        `/clients/${clientId}/knowledge/documents`,
        { body: formData, onProgress: uploadProgress.onProgress },
      );
    },
    onSuccess: (result) => {
      uploadProgress.reset();
      setFile(null);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents", clientId] });
      notify(
        result.reused
          ? t("knowledgeReused")
          : t("knowledgeIndexed", { pages: result.pageCount, chunks: result.chunkCount }),
        "success",
      );
    },
    onError: (error: any) => {
      uploadProgress.reset();
      notify(error?.message || t("knowledgeUploadFailed"), "error");
    },
  });

  const askMutation = useMutation({
    mutationFn: (): Promise<AskAnswer> =>
      apiRequest(`/clients/${clientId}/knowledge/ask`, {
        method: "POST",
        body: JSON.stringify({ question: question.trim() }),
      }),
    onSuccess: (result) => setAnswer(result),
    onError: (error: any) => notify(error?.message || t("knowledgeAskFailed"), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiRequest(`/clients/${clientId}/knowledge/documents/${documentId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-documents", clientId] }),
    onError: (error: any) => notify(error?.message || "Delete failed", "error"),
  });

  const reindexMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiRequest(`/clients/${clientId}/knowledge/documents/${documentId}/reindex`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-documents", clientId] }),
    onError: (error: any) => notify(error?.message || "Reindex failed", "error"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]" dir={isRtl ? "rtl" : "ltr"}>
      <div className="grid content-start gap-4">
        <Card>
          <CardBody>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-brand" aria-hidden />
              {t("knowledgeUploadTitle")}
            </CardTitle>
            <CardDescription>{t("knowledgeUploadHint")}</CardDescription>

            <div className="mt-3 grid gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="rounded-md border border-border bg-surface-sunken p-2 text-xs"
              />
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("knowledgeTitlePlaceholder")}
                className="rounded-md border border-border bg-surface p-2 text-sm"
              />
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={!file}
                loading={uploadMutation.isPending}
                size="sm"
              >
                {t("knowledgeIndexAction")}
              </Button>
              {uploadMutation.isPending && (
                <UploadProgressBar
                  progress={uploadProgress.progress}
                  hint={t("knowledgeIndexingHint")}
                />
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand" aria-hidden />
              {t("knowledgeDocuments")}
            </CardTitle>

            {isLoading ? (
              <Loader2 className="mt-3 h-4 w-4 animate-spin text-brand" aria-hidden />
            ) : documents.length === 0 ? (
              <p className="mt-3 text-xs text-muted">{t("knowledgeNoDocuments")}</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {documents.map((document) => (
                  <li
                    key={document._id}
                    className="rounded-lg border border-border bg-surface-sunken p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <b className="block truncate text-xs">{document.title}</b>
                        <span className="text-2xs text-faint">
                          {document.status === "ready"
                            ? t("knowledgeDocumentMeta", {
                                pages: document.pageCount,
                                chunks: document.chunkCount,
                              })
                            : document.status === "indexing"
                              ? t("knowledgeIndexingNow")
                              : document.status === "failed"
                                ? document.error || t("knowledgeFailed")
                                : t("knowledgePending")}
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t("knowledgeReindex")}
                          onClick={() => reindexMutation.mutate(document._id)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t("delete")}
                          onClick={() => deleteMutation.mutate(document._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-brand" aria-hidden />
            {t("knowledgeAskTitle")}
          </CardTitle>
          <CardDescription>{t("knowledgeAskHint")}</CardDescription>

          <div className="mt-3 flex gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && question.trim() && readyDocuments.length > 0) {
                  askMutation.mutate();
                }
              }}
              placeholder={t("knowledgeAskPlaceholder")}
              className="flex-1 rounded-md border border-border bg-surface p-2.5 text-sm"
            />
            <Button
              onClick={() => askMutation.mutate()}
              disabled={!question.trim() || readyDocuments.length === 0}
              loading={askMutation.isPending}
            >
              <Send className="h-4 w-4" aria-hidden />
              {t("knowledgeAsk")}
            </Button>
          </div>

          {readyDocuments.length === 0 && (
            <p className="mt-2 text-2xs text-faint">{t("knowledgeNeedsDocument")}</p>
          )}

          {answer && (
            <div className="mt-4 grid gap-3">
              <div className="whitespace-pre-line rounded-lg border-s-[3px] border-brand bg-surface-sunken p-4 text-sm leading-relaxed">
                {answer.answer}
              </div>

              {answer.citations.length > 0 && (
                <div>
                  <b className="text-xs">{t("knowledgeSources")}</b>
                  <ul className="mt-2 grid gap-2">
                    {answer.citations.map((citation) => (
                      <li
                        key={citation.index}
                        className="rounded-lg border border-border p-3 text-2xs text-muted"
                      >
                        <b className="text-ink">
                          [#{citation.index}] {citation.documentTitle} · {t("knowledgePage")} {citation.page}
                        </b>
                        <p className="mt-1 leading-relaxed">{citation.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-2xs text-faint">
                {t("knowledgeCost", {
                  passages: answer.usedPassages,
                  tokens: answer.usage.totalTokens,
                })}
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
