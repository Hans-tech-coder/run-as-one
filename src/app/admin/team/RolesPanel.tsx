import React from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MATRIX_ROLES,
  MATRIX_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_HINTS,
  ROLE_LABELS,
  roleCan,
} from '@/lib/permissions';
import RolePicker from './RolePicker';

/**
 * What each role can do, drawn from the very table the routes enforce.
 *
 * permissions.ts was written free of Prisma for exactly this: an owner choosing
 * between Validator and Event Manager is making a decision about who can edit a
 * runner, and the honest way to show that is the matrix itself rather than a
 * paraphrase of it that could drift. Change a role there and this panel
 * changes with it.
 *
 * Below `lg` the matrix is a RolePicker instead: one role at a time, because
 * seven columns do not fit a phone and scrolling them sideways hides the one
 * being compared. Both are rendered and CSS picks, as with every table.
 */
export default function RolesPanel() {
  return (
    <section className="admin-panel mt-8" aria-labelledby="roles-panel-title">
      <div className="admin-panel-header">
        <h2 id="roles-panel-title" className="admin-panel-title flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent-blue-ink" aria-hidden="true" />
          What Each Role Can Do
        </h2>
      </div>

      <div className="admin-panel-content">
        <p className="text-sm text-secondary mb-5 max-w-3xl">
          Super Admin and Admin reach every event. Staff reach only the events you assign them, and
          hold one of the four event roles on each — the same person can validate payments on
          one race and only view another.
        </p>

        <div className="dash-mobile-only">
          <RolePicker />
        </div>

        <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-x-auto">
          <Table>
            <TableHeader className="bg-transparent">
              <TableRow className="border-b border-[var(--dash-border)] hover:bg-transparent">
                <TableHead className="py-4 px-4 text-secondary font-medium h-auto pl-6">
                  Permission
                </TableHead>
                {MATRIX_ROLES.map(role => (
                  <TableHead
                    key={role}
                    className="py-4 px-3 text-secondary font-medium h-auto text-center whitespace-nowrap"
                  >
                    <abbr title={ROLE_HINTS[role]} className="no-underline">
                      {ROLE_LABELS[role]}
                    </abbr>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX_PERMISSIONS.map(permission => (
                <TableRow key={permission} className="border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)]">
                  <TableCell className="py-3 px-4 pl-6 text-primary whitespace-nowrap">
                    {PERMISSION_LABELS[permission]}
                  </TableCell>
                  {MATRIX_ROLES.map(role => (
                    <TableCell key={role} className="py-3 px-3 text-center">
                      {roleCan(role, permission) ? (
                        <Check size={16} className="inline text-accent-orange-ink" aria-label="Yes" />
                      ) : (
                        <span className="text-[var(--ink-20)]" aria-label="No">
                          &mdash;
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
