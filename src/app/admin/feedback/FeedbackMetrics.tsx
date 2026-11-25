"use client";

import React from 'react';
import { AlertTriangle, Inbox, MessageSquare, Wrench } from 'lucide-react';
import { asFeedbackKind } from '@/lib/feedback';
import type { FeedbackRow } from './MessageDetail';

/**
 * The four numbers over the inbox: what has not been read, what is being
 * worked on, the reported problems nobody has closed yet (the one that wants
 * to be zero), and the total. Counted over every message, not the filtered
 * list, so a filter never makes the queue look shorter than it is.
 */
export default function FeedbackMetrics({ rows }: { rows: FeedbackRow[] }) {
  const cards: { title: string; icon: React.ReactNode; value: number }[] = [
    {
      title: 'Unread',
      icon: <Inbox size={18} />,
      value: rows.filter(r => r.status === 'NEW').length,
    },
    {
      title: 'In Progress',
      icon: <Wrench size={18} />,
      value: rows.filter(r => r.status === 'IN_PROGRESS').length,
    },
    {
      title: 'Open Problems',
      icon: <AlertTriangle size={18} />,
      value: rows.filter(r => asFeedbackKind(r.kind) === 'ISSUE' && r.status !== 'RESOLVED').length,
    },
    { title: 'Messages in Total', icon: <MessageSquare size={18} />, value: rows.length },
  ];

  return (
    <div className="metrics-grid" style={{ marginBottom: '24px' }}>
      {cards.map(card => (
        <div key={card.title} className="metric-card">
          <div className="metric-header">
            <span className="metric-title">{card.title}</span>
            <span className="metric-icon">{card.icon}</span>
          </div>
          <div className="metric-value">{card.value}</div>
        </div>
      ))}
    </div>
  );
}
