"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface KanbanCardProps {
  id: string;
  title: string;
  counterpartyName: string;
  counterpartyRole: string;
  stageKey: string;
  budget?: number | string | null;
  myTurn: boolean;
  isCompleted: boolean;
  onClick: () => void;
}

export function KanbanCard({
  title,
  counterpartyName,
  counterpartyRole,
  stageKey,
  budget,
  myTurn,
  isCompleted,
  onClick,
}: KanbanCardProps) {
  // Format the key
  const stageLabel = stageKey
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <Card interactive onClick={onClick} className="cursor-pointer p-4 transition-transform hover:-translate-y-1">
      <div className="flex flex-col gap-3">
        {/* Header / Badges */}
        <div className="flex items-start justify-between gap-2">
          <Badge variant={isCompleted ? "success" : "brand"} size="sm">
            {stageLabel}
          </Badge>
          {myTurn && !isCompleted && (
            <Badge variant="warning" size="sm" className="shrink-0 gap-1 px-1.5">
              <AlertCircle className="size-3" />
              Action required
            </Badge>
          )}
        </div>

        {/* Title */}
        <h4 className="text-sm font-extrabold leading-tight tracking-tight text-content">
          {title}
        </h4>

        {/* Partner Info */}
        <div className="flex items-center gap-2">
          <Avatar name={counterpartyName} size="sm" square />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-content">{counterpartyName}</p>
            <p className="text-[0.625rem] text-content-muted">{counterpartyRole}</p>
          </div>
        </div>

        {/* Footer / Budget */}
        {budget && (
          <div className="mt-1 flex items-center justify-between border-t border-hairline pt-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-content-muted">Budget</span>
            <span className="text-sm font-extrabold text-content">₹{Number(budget).toLocaleString()}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
