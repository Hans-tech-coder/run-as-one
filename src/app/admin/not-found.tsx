import React from 'react';
import AdminNotFound from './AdminNotFound';

/**
 * The not-found boundary for everything under /admin.
 *
 * It catches notFound() thrown anywhere in this segment, and — by way of the
 * [...missing] catch-all beside it — unmatched /admin URLs too, which the root
 * not-found would otherwise have served without any of the admin frame.
 */
export default function AdminNotFoundPage() {
  return <AdminNotFound homeHref="/admin" homeLabel="Back to Dashboard" />;
}
