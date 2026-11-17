import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, InlineStack, Text } from '@shopify/polaris';
import type { Field, ThemeTokens } from '@cod/contracts';

/**
 * Vista previa REAL: renderiza el widget de verdad dentro de un iframe,
 * no una imitación. Si se ve bien aquí, se ve bien en la tienda.
 *
 * El iframe recibe los campos y los tokens por postMessage en cada cambio,
 * así que el merchant ve el resultado mientras arrastra.
 */
export function Preview({ fields, tokens }: { fields: Field[]; tokens: ThemeTokens }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const latest = useRef({ fields, tokens });
  latest.current = { fields, tokens };

  // El iframe se puede cargar ANTES de que React hidrate la página (viene en el
  // HTML del servidor), así que no basta con onLoad: el iframe avisa con
  // 'cod:preview-ready' y, además, enviamos los datos en cada cambio. Si el
  // iframe aún no escucha, el aviso de "listo" vuelve a pedir los datos.
  const post = useCallback(() => {
    ref.current?.contentWindow?.postMessage(
      { type: 'cod:preview', ...latest.current },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      if (e.data?.type === 'cod:preview-ready') post();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  useEffect(() => { post(); }, [fields, tokens, post]);

  return (
    <Card padding="300">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h3" variant="headingSm">Vista previa</Text>
        <InlineStack gap="100">
          <Button size="micro" pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
            Móvil
          </Button>
          <Button size="micro" pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
            Escritorio
          </Button>
        </InlineStack>
      </InlineStack>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <iframe
          ref={ref}
          title="Vista previa del formulario"
          onLoad={post}
          src="/preview"
          style={{
            width: device === 'mobile' ? 380 : '100%',
            height: 620,
            border: '1px solid #e1e3e5',
            borderRadius: 12,
            background: '#f6f6f7',
            transition: 'width .25s ease',
          }}
        />
      </div>
    </Card>
  );
}
