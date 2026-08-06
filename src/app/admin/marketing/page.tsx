import React from 'react';
import prisma from '@/lib/db';
import { Tag, Plus } from 'lucide-react';
import PromoCodesClient from './PromoCodesClient';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function MarketingPage() {
  const auth = await getAuthCookie();
  if (!auth) {
    redirect('/admin/login');
  }

  const promoCodes = await prisma.promoCode.findMany({
    where: { organizerId: auth.id },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Marketing Tools</h1>
      </header>

      <div className="admin-content">
        <div className="metrics-grid mb-8">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Active Promos</span>
              <div className="metric-icon"><Tag size={20} /></div>
            </div>
            <div className="metric-value">{promoCodes.length}</div>
          </div>
        </div>

        <PromoCodesClient initialPromos={promoCodes} organizerId={auth.id} />
      </div>
    </>
  );
}
