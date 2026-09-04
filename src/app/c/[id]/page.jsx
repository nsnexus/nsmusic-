import { redirect } from 'next/navigation';

export const runtime = 'edge';

export default function ShortCartaPage({ params }) {
  const id = params?.id;
  if (!id) {
    redirect('/');
  }
  redirect(`/carta?orderId=${encodeURIComponent(id)}`);
}
