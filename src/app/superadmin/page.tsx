import React from 'react';
import prisma from '@/lib/db';
import { DollarSign, Users, Activity, FileSpreadsheet } from 'lucide-react';
import { formatPesos } from '@/lib/money';

export default async function SuperAdminDashboard() {
  // Fetch platform-wide stats
  const totalOrganizers = await prisma.organizer.count({
    where: { role: 'ORGANIZER' }
  });

  const totalEvents = await prisma.event.count();
  const totalRegistrations = await prisma.registration.count({
    where: { status: 'PAID' }
  });

  const allRegistrations = await prisma.registration.findMany({
    where: { status: 'PAID' },
    select: { totalAmount: true, platformFee: true }
  });

  // Both are sums of centavos (integers), so they stay exact.
  const totalRevenue = allRegistrations.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalPlatformFees = allRegistrations.reduce((acc, curr) => acc + curr.platformFee, 0);

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Super Admin Dashboard</h1>
      </header>

      <div className="admin-content">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Organizers</span>
              <Users size={20} className="metric-icon" />
            </div>
            <div className="metric-value">{totalOrganizers}</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Platform Revenue (Admin Fees)</span>
              <DollarSign size={20} className="metric-icon" style={{ color: 'var(--accent-orange)' }} />
            </div>
            <div className="metric-value" style={{ color: 'var(--accent-orange)' }}>
              ₱{formatPesos(totalPlatformFees)}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Transaction Volume</span>
              <Activity size={20} className="metric-icon" />
            </div>
            <div className="metric-value">₱{formatPesos(totalRevenue)}</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Registrations</span>
              <FileSpreadsheet size={20} className="metric-icon" />
            </div>
            <div className="metric-value">{totalRegistrations}</div>
          </div>
        </div>

        <div className="admin-panel mt-8">
          <div className="admin-panel-header">
            <h2 className="admin-panel-title">System Overview</h2>
          </div>
          <div className="admin-panel-content">
            <p className="text-secondary">
              Welcome to the RunAsOne Super Admin Portal. From here, you can monitor the health of the entire platform and manage organizer accounts.
            </p>
            <p className="text-secondary mt-4">
              Use the sidebar to navigate to the Organizers page to approve new applications, suspend accounts, or set specific admin fees for each organizer.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
