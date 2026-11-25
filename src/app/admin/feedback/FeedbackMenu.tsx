"use client";

import React from 'react';
import { Bot, MessageSquareText, Trash2 } from 'lucide-react';
import RowActionsMenu from '@/app/admin/RowActionsMenu';
import { useAlert } from '@/components/ui/AlertProvider';
import { type FeedbackRow, receivedOn } from './MessageDetail';
import { feedbackPrompt } from './feedbackPrompt';
import { STATUS_MOVES } from './feedbackColumns';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@/lib/feedback';

/** Copies a message as an AI-agent prompt. The menu or button that called it
 *  shows nothing of the result, so the toast is the only sign it landed. */
export function useCopyFeedbackPrompt() {
  const { alert, toast } = useAlert();
  return async (row: FeedbackRow) => {
    try {
      await navigator.clipboard.writeText(feedbackPrompt(row, receivedOn(row.createdAt)));
      toast('Prompt copied. Paste it into your AI agent.');
    } catch {
      await alert('Your browser would not let us reach the clipboard. Try again from a focused tab.');
    }
  };
}

/** A message's ⋮ menu, for the table's Actions cell and the card's footer. */
export default function FeedbackMenu({
  row,
  saving,
  onOpen,
  onSetStatus,
  onRemove,
  className,
}: {
  row: FeedbackRow;
  saving: boolean;
  onOpen: (row: FeedbackRow) => void;
  onSetStatus: (row: FeedbackRow, status: FeedbackStatus) => void;
  onRemove: (row: FeedbackRow) => void;
  className?: string;
}) {
  const copyPrompt = useCopyFeedbackPrompt();
  const sender = row.name ?? row.email ?? 'an anonymous sender';

  return (
    <RowActionsMenu
      label={`feedback from ${sender}`}
      className={className}
      actions={[
        {
          key: 'open',
          label: 'View Message',
          icon: <MessageSquareText size={16} />,
          onSelect: () => onOpen(row),
        },
        // Every state but the one it is in, in workflow order.
        ...FEEDBACK_STATUSES.filter(status => status !== row.status).map(status => ({
          key: `status-${status}`,
          label: STATUS_MOVES[status].label,
          icon: STATUS_MOVES[status].icon,
          onSelect: () => onSetStatus(row, status),
          disabled: saving,
        })),
        {
          key: 'ai-prompt',
          label: 'Copy AI Prompt',
          icon: <Bot size={16} />,
          onSelect: () => copyPrompt(row),
        },
        {
          key: 'delete',
          label: 'Delete Message',
          icon: <Trash2 size={16} />,
          onSelect: () => onRemove(row),
          disabled: saving,
          danger: true,
        },
      ]}
    />
  );
}
