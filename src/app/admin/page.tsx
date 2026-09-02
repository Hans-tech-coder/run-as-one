import React from 'react';
import { DollarSign, Users, CalendarDays, Activity } from 'lucide-react';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { formatPesos } from '@/lib/money';
import { redirect } from 'next/navigation';

export default async function AdminDashboard() {
  const auth = await getAuthCookie();
  if (!auth) {
    redirect('/admin/login');
  }
  
  const events = await prisma.event.findMany({
    where: { organizerId: auth.id },
    include: {
      registrations: {
        where: { status: 'PAID' },
        include: { runners: true }
      }
    }
  });

  const activeEventsCount = events.length;
  
  let totalRevenue = 0;
  let totalRegistrants = 0;

  const recentRegistrations: any[] = [];

  events.forEach(event => {
    event.registrations.forEach(reg => {
      // Net revenue for the organizer (Subtotal + Delivery Fee, excluding platform/transaction fees).
      // Both are centavos, so the running total stays an exact integer.
      totalRevenue += (reg.subtotal + reg.deliveryFee);
      totalRegistrants += reg.runners.length;
      
      recentRegistrations.push({
        ...reg,
        eventTitle: event.title
      });
    });
  });

  // Sort recent registrations descending by date
  recentRegistrations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestFive = recentRegistrations.slice(0, 5);

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Overview</h1>
      </header>

      <div className="admin-content">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Revenue (Net)</span>
              <div className="metric-icon"><DollarSign size={20} /></div>
            </div>
            <div className="metric-value">₱{formatPesos(totalRevenue)}</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Registrants</span>
              <div className="metric-icon"><Users size={20} /></div>
            </div>
            <div className="metric-value">{totalRegistrants}</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Active Events</span>
              <div className="metric-icon"><CalendarDays size={20} /></div>
            </div>
            <div className="metric-value">{activeEventsCount}</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Page Views</span>
              <div className="metric-icon"><Activity size={20} /></div>
            </div>
            <div className="metric-value">N/A</div>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-header">
            <h2 className="admin-panel-title">Recent Registrations</h2>
          </div>
          
          {latestFive.length === 0 ? (
            <div className="empty-state">
              <Users size={48} className="empty-icon" />
              <p>No registrations yet. Publish an event to get started.</p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Customer Name</th>
                    <th>Event</th>
                    <th>Amount</th>
                    <th>Runners</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {latestFive.map(reg => (
                    <tr key={reg.id}>
                      <td>{reg.orderRef}</td>
                      <td>{reg.customerName}</td>
                      <td>{reg.eventTitle}</td>
                      <td>₱{formatPesos(reg.totalAmount)}</td>
                      <td>{reg.runners.length}</td>
                      <td>{new Date(reg.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
