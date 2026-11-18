import { useEffect, useState } from 'react';

/**
 * Aviso corto abajo («Cambios guardados»). Reemplaza al Toast de Polaris, que
 * depende del Frame y dentro de Figui rompía la página al guardar
 * («n is not a function») y la obligaba a recargar.
 */
export function SavedToast({ content, error, onDismiss }: { content: string; error?: boolean; onDismiss?: () => void }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const t = window.setTimeout(() => { setShown(false); onDismiss?.(); }, 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);
  if (!shown) return null;
  return (
    <div role="status" aria-live="polite"
      style={{
        position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 600,
        maxWidth: 'calc(100vw - 32px)', padding: '10px 16px', borderRadius: 12,
        background: error ? '#c4161c' : '#1f2937', color: '#fff', fontSize: 14, fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,.25)', pointerEvents: 'none',
      }}>
      {content}
    </div>
  );
}
