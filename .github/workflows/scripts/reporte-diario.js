const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function sbGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function parseFecha(fi) {
  if (!fi) return null;
  const s = String(fi).trim();
  const p = s.split('-');
  if (p.length === 3 && p[0].length === 4) return new Date(`${p[0]}-${p[1]}-${p[2]}T00:00:00`);
  if (p.length === 3 && p[0].length === 2) return new Date(`${p[2]}-${p[1]}-${p[0]}T00:00:00`);
  const d = new Date(s + ' ' + new Date().getFullYear());
  return isNaN(d) ? null : d;
}

async function main() {
  console.log('Obteniendo créditos...');
  const creditos = await sbGet('creditos', 'order=id.desc&limit=5000');
  
  const ids = creditos.map(c => c.id);
  const inList = `(${ids.join(',')})`;
  const gestiones = await sbGet('gestiones', `credito_id=in.${inList}&order=created_at.asc`);

  // Mapear gestiones por crédito
  const gesMap = {};
  gestiones.forEach(g => {
    if (!gesMap[g.credito_id]) gesMap[g.credito_id] = [];
    gesMap[g.credito_id].push(g);
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Filtrar vencidos: tienen seguimiento con fecha pasada
  const vencidos = creditos.filter(c => {
    const gs = gesMap[c.id] || [];
    if (gs.length === 0) return false;
    const ultima = gs[gs.length - 1];
    if (!ultima.fecha_seguimiento) return false;
    const fechaSeg = new Date(ultima.fecha_seguimiento + 'T00:00:00');
    return fechaSeg < hoy;
  }).map(c => {
    const gs = gesMap[c.id] || [];
    const ultima = gs[gs.length - 1];
    return { ...c, ultima_gestion: ultima };
  });

  if (vencidos.length === 0) {
    console.log('No hay casos vencidos hoy. No se envía email.');
    return;
  }

  // Agrupar por ejecutivo
  const porEjecutivo = {};
  vencidos.forEach(c => {
    const ej = c.ejecutivo || 'SIN EJECUTIVO';
    if (!porEjecutivo[ej]) porEjecutivo[ej] = [];
    porEjecutivo[ej].push(c);
  });

  // Construir HTML del email
  const fechaHoy = hoy.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let tablas = '';
  Object.keys(porEjecutivo).sort().forEach(ej => {
    const casos = porEjecutivo[ej];
    const filas = casos.map(c => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.id}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.nombre}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.rut_cliente}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.ultima_gestion.nuevo_estado || '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1;color:#C62828;font-weight:600">${c.ultima_gestion.fecha_seguimiento || '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.ultima_gestion.comentario || '-'}</td>
      </tr>`).join('');

    tablas += `
      <h3 style="color:#1565C0;margin:24px 0 8px;font-size:14px">${ej} — ${casos.length} caso(s)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
          <tr style="background:#1565C0;color:#fff">
            <th style="padding:7px 10px;text-align:left">ID</th>
            <th style="padding:7px 10px;text-align:left">Nombre</th>
            <th style="padding:7px 10px;text-align:left">RUT</th>
            <th style="padding:7px 10px;text-align:left">Estado</th>
            <th style="padding:7px 10px;text-align:left">Fecha Seg.</th>
            <th style="padding:7px 10px;text-align:left">Comentario</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;
  });

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:900px;margin:0 auto">
      <div style="background:#1565C0;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:18px">📋 Reporte Diario — Seguimientos Vencidos</h1>
        <p style="margin:4px 0 0;opacity:0.85;font-size:13px">${fechaHoy}</p>
      </div>
      <div style="background:#fff;padding:20px 24px;border:1px solid #CFD8DC;border-top:none;border-radius:0 0 8px 8px">
        <p style="color:#546E7A;font-size:13px;margin:0 0 16px">
          Total casos vencidos: <strong style="color:#C62828">${vencidos.length}</strong> — 
          Ejecutivos afectados: <strong>${Object.keys(porEjecutivo).length}</strong>
        </p>
        ${tablas}
        <p style="color:#90A4AE;font-size:11px;margin-top:24px;border-top:1px solid #ECEFF1;padding-top:12px">
          Reporte automático generado por el sistema de Seguimiento de Créditos AutoFácil
        </p>
      </div>
    </div>`;

  // Enviar email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASSWORD.replace(/\s/g, ''),
    }
  });

  await transporter.sendMail({
    from: `"AutoFácil Reportes" <${process.env.GMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `🔴 ${vencidos.length} seguimientos vencidos — ${hoy.toLocaleDateString('es-CL')}`,
    html,
  });

  console.log(`Email enviado con ${vencidos.length} casos vencidos.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
