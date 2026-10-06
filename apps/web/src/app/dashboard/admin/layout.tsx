import { AdminMfaGate } from '@/components/dashboard/admin/mfa-gate';
import { AdminSectionGate } from '@/components/dashboard/admin/section-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminMfaGate>
      <AdminSectionGate>{children}</AdminSectionGate>
    </AdminMfaGate>
  );
}
