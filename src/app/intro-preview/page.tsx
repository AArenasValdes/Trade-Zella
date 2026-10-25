import { notFound } from 'next/navigation';
import { IntroPreview } from './preview';

export default function IntroPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return <IntroPreview />;
}
