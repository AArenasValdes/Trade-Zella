import { notFound } from 'next/navigation';
import { SystemPreview } from './workspace';

export default function SystemPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return <SystemPreview />;
}
