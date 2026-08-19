"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Skeleton } from "../../../components/ui/State";
import { useTasks } from "../../../features/tasks/hooks";
import { useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/cn";

/** Local YYYY-MM-DD key; avoids the UTC shift that `toISOString` would cause. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { t, lang, isRtl } = useI18n();
  const { data: tasks = [], isLoading } = useTasks();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const locale = lang === "ar" ? "ar-EG" : "en-US";

  // Bucket tasks by their local due date so lookup per cell is O(1).
  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = dayKey(new Date(task.dueDate));
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];
  }, [cursor]);

  const weekdays = useMemo(() => {
    const base = new Date(2024, 8, 1); // A Sunday.
    return Array.from({ length: 7 }, (_, i) =>
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + i).toLocaleDateString(locale, {
        weekday: "short",
      }),
    );
  }, [locale]);

  const shiftMonth = (delta: number) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  const todayKey = dayKey(new Date());
  const monthTaskCount = cells.reduce(
    (sum, date) => sum + (date ? (tasksByDay.get(dayKey(date))?.length ?? 0) : 0),
    0,
  );

  return (
    <>
      <PageHeader
        title={t("calendarTitle")}
        description={t("calendarSubtitle")}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <span data-testid="calendar-month" className="min-w-[10rem] text-center text-sm font-semibold">
              {cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}
            </span>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const now = new Date();
                setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
            >
              {t("today")}
            </Button>
          </div>
        }
      />

      <Card>
        <CardBody>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1.5 border-b border-border pb-2 text-center text-2xs font-bold uppercase text-muted">
                {weekdays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {cells.map((date, index) => {
                  if (!date) return <div key={`pad-${index}`} />;
                  const key = dayKey(date);
                  const dayTasks = tasksByDay.get(key) ?? [];
                  const isToday = key === todayKey;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex min-h-[86px] flex-col gap-1 rounded-lg border p-1.5",
                        dayTasks.length
                          ? "border-brand/30 bg-brand-soft/40"
                          : "border-border bg-surface",
                        isToday && "ring-2 ring-brand",
                      )}
                    >
                      <span
                        className={cn(
                          "text-2xs font-bold tabular-nums",
                          isToday ? "text-brand" : dayTasks.length ? "text-brand-ink" : "text-faint",
                        )}
                      >
                        {date.getDate()}
                      </span>
                      <div className="flex flex-col gap-1">
                        {dayTasks.slice(0, 3).map((task) => (
                          <Link
                            key={task._id}
                            href="/tasks"
                            prefetch
                            title={task.title}
                            className={cn(
                              "truncate rounded px-1.5 py-0.5 text-2xs font-medium text-white",
                              task.priority === "high"
                                ? "bg-danger"
                                : task.priority === "medium"
                                  ? "bg-warning"
                                  : "bg-brand",
                              task.completed && "opacity-50 line-through",
                            )}
                          >
                            {task.title}
                          </Link>
                        ))}
                        {dayTasks.length > 3 && (
                          <span className="px-1 text-2xs text-muted">+{dayTasks.length - 3}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {monthTaskCount === 0 && (
                <p className="mt-4 text-center text-xs text-muted">{t("noDeadlines")}</p>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </>
  );
}
