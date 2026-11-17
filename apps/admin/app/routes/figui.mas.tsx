import { Link } from 'react-router';

/** «Más opciones»: lo avanzado, explicado en una frase. Casi nadie lo necesita. */
const ITEMS: { to: string; icon: string; title: string; text: string }[] = [
  { to: '/figui?lista=1', icon: '🧩', title: 'Editor completo del formulario', text: 'Todos los detalles: tamaños, condiciones, anchos, varios formularios…' },
  { to: '/figui/design', icon: '🎨', title: 'Diseño completo', text: 'Letras, colores de todo el formulario, animaciones de los botones.' },
  { to: '/figui/offers', icon: '🎁', title: 'Ofertas avanzadas y extras', text: 'Descuentos por porcentaje, productos extra, cargos como envío express.' },
  { to: '/figui/shipping', icon: '🗺️', title: 'Envío por provincia', text: 'Un precio de envío distinto para cada provincia.' },
  { to: '/figui/antifraud', icon: '🛡️', title: 'Lista de bloqueo', text: 'Bloquea teléfonos o clientes que hacen pedidos falsos.' },
  { to: '/figui/settings', icon: '⚙️', title: 'Ajustes', text: 'Píxeles de anuncios, ubicación por GPS y otros ajustes de la tienda.' },
];

export default function MasOpciones() {
  return (
    <div className="mo">
      <style>{CSS}</style>
      <h1>Más opciones</h1>
      <p className="mo-sub">Lo de todos los días está en <Link to="/figui/facil">✏️ Editar formulario</Link>. Aquí está lo avanzado, por si algún día lo necesitas.</p>
      <div className="mo-grid">
        {ITEMS.map((i) => (
          <Link key={i.to} to={i.to} className="mo-card">
            <span className="mo-ico">{i.icon}</span>
            <span><b>{i.title}</b><small>{i.text}</small></span>
            <span className="mo-go" aria-hidden>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.mo{max-width:820px;margin:0 auto;padding:18px 16px 40px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A1120}
.mo h1{margin:0;font-size:24px;font-weight:800}
.mo-sub{margin:6px 0 16px;color:#475467;font-size:15px;line-height:1.45}
.mo-sub a{color:#1A73E8;font-weight:700}
.mo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.mo-card{display:flex;align-items:center;gap:14px;padding:16px;border-radius:16px;border:1px solid #E3E7ED;text-decoration:none;color:inherit;
  background:linear-gradient(180deg,#fff 0%,#F6F8FB 100%);box-shadow:0 1px 2px rgba(16,24,40,.06),0 3px 8px -3px rgba(16,24,40,.10),inset 0 1px 0 #fff;transition:box-shadow .15s ease,transform .12s ease}
.mo-card:hover{box-shadow:0 2px 4px rgba(16,24,40,.06),0 10px 20px -8px rgba(16,24,40,.16),inset 0 1px 0 #fff;border-color:#BFD5F2}
.mo-card:active{transform:translateY(1px)}
.mo-ico{display:grid;place-items:center;width:46px;height:46px;border-radius:13px;font-size:22px;flex:none;background:#fff;border:1px solid #E3E7ED;box-shadow:inset 0 1px 0 #fff,0 2px 6px -3px rgba(16,24,40,.15)}
.mo-card b{display:block;font-size:16px}
.mo-card small{display:block;margin-top:3px;color:#667085;font-size:13.5px;line-height:1.4}
.mo-go{margin-left:auto;font-size:26px;color:#98A2B3}
`;
