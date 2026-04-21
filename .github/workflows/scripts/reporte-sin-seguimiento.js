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

function diasDesde(fecha) {
  if (!fecha) return '-';
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const diff = hoy - fecha;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function fmtFecha(d) {
  if (!d) return '-';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function main() {
  console.log('Obteniendo créditos...');
  const creditos = await sbGet('creditos', 'order=id.desc&limit=5000');

  const ids = creditos.map(c => c.id);
  const inList = `(${ids.join(',')})`;
  const gestiones = await sbGet('gestiones', `credito_id=in.${inList}&order=created_at.asc`);

  const gesMap = {};
  gestiones.forEach(g => {
    if (!gesMap[g.credito_id]) gesMap[g.credito_id] = [];
    gesMap[g.credito_id].push(g);
  });

  const hoy = new Date(); hoy.setHours(0,0,0,0);

  const sinSeguimiento = creditos.filter(c => {
    const gs = gesMap[c.id] || [];
    return gs.length === 0;
  }).map(c => {
    const fechaIngreso = parseFecha(c.fecha_ingreso);
    const dias = diasDesde(fechaIngreso);
    return { ...c, fechaIngresoDate: fechaIngreso, diasSinSeg: dias };
  }).sort((a, b) => (b.diasSinSeg || 0) - (a.diasSinSeg || 0));

  if (sinSeguimiento.length === 0) {
    console.log('No hay casos sin seguimiento. No se envía email.');
    return;
  }

  const porEjecutivo = {};
  sinSeguimiento.forEach(c => {
    const ej = c.ejecutivo || 'SIN EJECUTIVO';
    if (!porEjecutivo[ej]) porEjecutivo[ej] = [];
    porEjecutivo[ej].push(c);
  });

  const fechaHoy = hoy.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  function colorDias(dias) {
    if (dias >= 7) return '#C62828';
    if (dias >= 3) return '#E65100';
    return '#2E7D32';
  }

  let tablas = '';
  Object.keys(porEjecutivo).sort().forEach(ej => {
    const casos = porEjecutivo[ej];
    const filas = casos.map(c => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.id}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1;font-weight:600">${c.nombre}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.rut_cliente}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${c.producto || '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1">${fmtFecha(c.fechaIngresoDate)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1;text-align:center">
          <span style="background:${colorDias(c.diasSinSeg)}20;color:${colorDias(c.diasSinSeg)};padding:2px 10px;border-radius:10px;font-weight:700;font-size:12px">${c.diasSinSeg} días</span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #ECEFF1;text-align:right;color:#2E7D32;font-weight:600">$${Number(c.monto_pagare||0).toLocaleString('es-CL')}</td>
      </tr>`).join('');

    const totalPagare = casos.reduce((s, c) => s + (Number(c.monto_pagare) || 0), 0);
    const promDias = Math.round(casos.reduce((s, c) => s + (c.diasSinSeg || 0), 0) / casos.length);

    tablas += `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <h3 style="color:#1565C0;font-size:14px;margin:0">${ej}</h3>
          <span style="font-size:12px;color:#546E7A">${casos.length} caso(s) &nbsp;|&nbsp; Promedio: <strong>${promDias} días</strong> &nbsp;|&nbsp; Total pagaré: <strong style="color:#2E7D32">$${totalPagare.toLocaleString('es-CL')}</strong></span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#1565C0;color:#fff">
              <th style="padding:7px 10px;text-align:left">ID</th>
              <th style="padding:7px 10px;text-align:left">Nombre</th>
              <th style="padding:7px 10px;text-align:left">RUT</th>
              <th style="padding:7px 10px;text-align:left">Producto</th>
              <th style="padding:7px 10px;text-align:left">Fecha Ingreso</th>
              <th style="padding:7px 10px;text-align:center">Días Sin Seg.</th>
              <th style="padding:7px 10px;text-align:right">Monto Pagaré</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  });

  let resumenFilas = '';
  let totalGeneral = 0, totalCasos = 0;
  Object.keys(porEjecutivo).sort().forEach(ej => {
    const casos = porEjecutivo[ej];
    const total = casos.reduce((s, c) => s + (Number(c.monto_pagare) || 0), 0);
    const prom = Math.round(casos.reduce((s, c) => s + (c.diasSinSeg || 0), 0) / casos.length);
    const max = Math.max(...casos.map(c => c.diasSinSeg || 0));
    totalGeneral += total;
    totalCasos += casos.length;
    resumenFilas += `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #ECEFF1;font-weight:600">${ej}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #ECEFF1;text-align:center;font-weight:700;color:#1565C0">${casos.length}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #ECEFF1;text-align:center;color:${colorDias(prom)};font-weight:600">${prom} días</td>
        <td style="padding:6px 12px;border-bottom:1px solid #ECEFF1;text-align:center;color:${colorDias(max)};font-weight:700">${max} días</td>
        <td style="padding:6px 12px;border-bottom:1px solid #ECEFF1;text-align:right;color:#2E7D32;font-weight:600">$${total.toLocaleString('es-CL')}</td>
      </tr>`;
  });

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:960px;margin:0 auto">
      <div style="background:#37474F;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:18px">📋 Reporte Diario — Créditos Sin Seguimiento</h1>
        <p style="margin:4px 0 0;opacity:0.85;font-size:13px">${fechaHoy}</p>
      </div>
      <div style="background:#fff;padding:20px 24px;border:1px solid #CFD8DC;border-top:none;border-radius:0 0 8px 8px">
        <div style="background:#F8F9FB;border-radius:8px;padding:16px;margin-bottom:24px">
          <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#37474F">RESUMEN POR EJECUTIVO</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#37474F;color:#fff">
                <th style="padding:7px 12px;text-align:left">Ejecutivo</th>
                <th style="padding:7px 12px;text-align:center">Casos</th>
                <th style="padding:7px 12px;text-align:center">Prom. Días</th>
                <th style="padding:7px 12px;text-align:center">Máx. Días</th>
                <th style="padding:7px 12px;text-align:right">Total Pagaré</th>
              </tr>
            </thead>
            <tbody>
              ${resumenFilas}
              <tr style="background:#ECEFF1;font-weight:700">
                <td style="padding:7px 12px;border-top:2px solid #37474F">TOTAL</td>
                <td style="padding:7px 12px;text-align:center;border-top:2px solid #37474F;color:#1565C0">${totalCasos}</td>
                <td style="padding:7px 12px;border-top:2px solid #37474F"></td>
                <td style="padding:7px 12px;border-top:2px solid #37474F"></td>
                <td style="padding:7px 12px;text-align:right;border-top:2px solid #37474F;color:#2E7D32">$${totalGeneral.toLocaleString('es-CL')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#37474F">DETALLE POR EJECUTIVO</p>
        ${tablas}
        <p style="color:#90A4AE;font-size:11px;margin-top:24px;border-top:1px solid #ECEFF1;padding-top:12px">
          Reporte automático generado por el sistema de Seguimiento de Créditos AutoFácil
        </p>
      </div>
    </div>`;

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
    subject: `🔴 ${sinSeguimiento.length} créditos sin seguimiento — ${hoy.toLocaleDateString('es-CL')}`,
    html,
  });

  console.log(`Email enviado con ${sinSeguimiento.length} casos sin seguimiento.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
