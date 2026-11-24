import { Toaster } from 'sonner';

export function FeedbackToaster() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: 'var(--surface)',
          color: 'var(--foreground)',
          borderColor: 'var(--surface-highlight)',
        },
      }}
    />
  );
}
