"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NEW_TASK_HASH, type PersonRef, type TaskListItem } from "@/lib/tasks/meta";
import { QuickTaskForm, type QuickTaskBase } from "@/components/tasks/quick-task-form";
import { PersonTaskList } from "@/components/tasks/person-task-list";
import { FichaSection } from "./layout";

/**
 * "Tareas" on a ficha: "+ Tarea" opens the form right here (no other page),
 * with the person attached; the list below closes tasks in place.
 */
export function PersonTasksSection({
  person,
  open,
  closed,
  today,
  base,
}: {
  person: PersonRef;
  open: TaskListItem[];
  closed: TaskListItem[];
  today: string;
  base: QuickTaskBase;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The quick action at the top of the ficha links to #nueva-tarea.
  useEffect(() => {
    const check = () => {
      if (window.location.hash !== NEW_TASK_HASH) return;
      setAdding(true);
      ref.current?.querySelector("details")?.setAttribute("open", "");
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Drop the hash so the same button works again.
      history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  return (
    <div ref={ref} className="scroll-mt-4">
      <FichaSection
        title="Tareas"
        count={open.length}
        action={
          !adding && (
            <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium text-primary hover:underline">
              + Tarea
            </button>
          )
        }
      >
        {adding && (
          <div className="mb-3 rounded-lg border border-primary/30 bg-muted/30 p-2.5">
            <QuickTaskForm {...base} person={person} onCreated={() => {
                setAdding(false);
                router.refresh();
              }} onCancel={() => setAdding(false)} />
          </div>
        )}
        <PersonTaskList open={open} closed={closed} meId={base.currentUserId} today={today} />
      </FichaSection>
    </div>
  );
}
