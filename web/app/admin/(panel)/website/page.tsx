import { AdminTop } from '@/components/admin/Sidebar';

export const dynamic = 'force-dynamic';

// Built in the next milestone (W7/W8).
export default function Page() {
  return (
    <>
      <AdminTop title="Website content" />
      <div className="abody">
        <p className="anote">Coming in the next update.</p>
      </div>
    </>
  );
}
