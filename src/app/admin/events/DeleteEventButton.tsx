"use client";

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DeleteEventButton({ eventId }: { eventId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete event');
      }

      router.refresh(); // Refresh the page to reflect the deletion
    } catch (error) {
      console.error(error);
      alert('An error occurred while deleting the event.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button 
      onClick={handleDelete}
      disabled={isDeleting}
      className={`p-2 rounded text-secondary hover:text-red-500 hover:bg-red-500/10 ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
      title="Delete"
    >
      <Trash2 size={16} />
    </button>
  );
}
