import React from 'react';
import AdminNotFound from '../admin/AdminNotFound';

/** The /admin 404, in the super admin's sidebar. See ../admin/AdminNotFound. */
export default function SuperAdminNotFoundPage() {
  return <AdminNotFound homeHref="/superadmin" homeLabel="Back to Dashboard" />;
}
