import { useCallback, useEffect, useRef, useState } from 'react';
import { ButtonGroup, Button, InlineStack, Text } from '@shopify/polaris';
import { DesktopIcon, MobileIcon } from '@shopify/polaris-icons';
import type { Addon, Field, Offer, ThemeTokens } from '@cod/contracts';

/**
 * Vista previa REAL: el mismo widget de la tienda dentro de un iframe.
 * Recibe campos y diseño en cada cambio, resalta el campo seleccionado y avisa
 * al editor cuando se hace clic en un campo (para editarlo).
 */
const EMPTY_O: Offer[] = [];
const EMPTY_A: Addon[] = [];

export function Preview({
  fields, tokens, selectedKey = null, onSelect, showTrigger = false, offers = EMPTY_O, addons = EMPTY_A, unitPriceCents = 0,
  hint = 'Haz clic en un campo de la vista previa para editarlo.', focus = null, shipping = null,
}: {
  fields: Field[];
  tokens: ThemeTokens;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  showTrigger?: boolean;
  offers?: Offer[];
  addons?: Addon[];
  unitPriceCents?: number;
  hint?: string;
  focus?: 'offers' | 'addons' | null;
  /** Envío y recargo reales de la tienda, para que el total sea el de verdad. */
  shipping?: { defaultShippingCents: number; freeShippingOverCents: number | null; codFeeCents: number } | null;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const latest = useRef({ fields, tokens, selectedKey, showTrigger, offers, addons, unitPriceCents, focus, shipping });
  latest.current = { fields, tokens, selectedKey, showTrigger, offers, addons, unitPriceCents, focus, shipping };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // El iframe puede cargar antes de que React hidrate: además de enviar en cada
  // cambio, el iframe avisa con 'cod:preview-ready' y se le reenvían los datos.
  const post = useCallback(() => {
    ref.current?.contentWindow?.postMessage({ type: 'cod:preview', ...latest.current }, window.location.origin);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      if (e.data?.type === 'cod:preview-ready') post();
      if (e.data?.type === 'cod:select' && typeof e.data.key === 'string') onSelectRef.current?.(e.data.key);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  useEffect(() => { post(); }, [fields, tokens, selectedKey, showTrigger, offers, addons, unitPriceCents, focus, shipping, post]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e3e3e3', background: '#fff' }}>
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingSm">Vista previa</Text>
          <ButtonGroup variant="segmented">
            <Button size="slim" icon={MobileIcon} pressed={device === 'mobile'}
              onClick={() => setDevice('mobile')} accessibilityLabel="Móvil">Móvil</Button>
            <Button size="slim" icon={DesktopIcon} pressed={device === 'desktop'}
              onClick={() => setDevice('desktop')} accessibilityLabel="Escritorio">Escritorio</Button>
          </ButtonGroup>
        </InlineStack>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', background: '#f1f1f1', padding: device === 'mobile' ? '16px 0' : 0 }}>
        <iframe
          ref={ref}
          title="Vista previa del formulario"
          onLoad={post}
          src="/preview"
          style={{
            width: device === 'mobile' ? 390 : '100%',
            height: '100%',
            border: device === 'mobile' ? '1px solid #d4d4d4' : 0,
            borderRadius: device === 'mobile' ? 16 : 0,
            background: '#f1f1f1',
            transition: 'width .2s ease',
          }}
        />
      </div>
      <div style={{ padding: '8px 14px', borderTop: '1px solid #e3e3e3', background: '#fff' }}>
        <Text as="p" variant="bodySm" tone="subdued">
          {hint}
        </Text>
      </div>
    </div>
  );
}
