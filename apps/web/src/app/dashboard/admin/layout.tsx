import { AdminSectionGate } from '@/components/dashboard/admin/section-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminSectionGate>{children}</AdminSectionGate>;
}
