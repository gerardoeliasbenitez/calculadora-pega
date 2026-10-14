import { supabase, guardarCotizacionCloud, sincronizarDesdeCloud } from './supabase-config.js';

const db = new Dexie('CalculadoraPegaDB');
db.version(7).stores({
  cotizaciones: '++id, nroCotizacion, cliente, proyecto, material, totalUSD, totalBsEUR, fecha',
  catalogos: '++id, tipo, valor'
});
window.db = db;

let tasaUSD_BCV = 36.50;
let tasaEUR_BCV = 39.80;
let siguienteCotizacionCodigo = 'COTZ-000001';

function parsearFloatVE(valor) {
  if (!valor) return 0;
  const limpio = String(valor).replace(/\./g, '').replace(',', '.');
  return parseFloat(limpio) || 0;
}

function formatearNumeroVE(valor, decimales = 2) {
  const num = Number(valor) || 0;
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

async function obtenerSiguienteNumeroCotizacion() {
  try {
    const registrosCloud = await sincronizarDesdeCloud();
    let proximoId = 1;
    if (registrosCloud && registrosCloud.length > 0) {
      proximoId = registrosCloud.length + 1;
    } else {
      const ultimoLocal = await db.cotizaciones.orderBy('id').last();
      if (ultimoLocal && ultimoLocal.id) proximoId = ultimoLocal.id + 1;
    }
    siguienteCotizacionCodigo = `COTZ-${String(proximoId).padStart(6, '0')}`;
  } catch (err) {
    siguienteCotizacionCodigo = `COTZ-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  const elDisplay = document.getElementById('numero-cotizacion-display');
  if (elDisplay) elDisplay.textContent = siguienteCotizacionCodigo;
  return siguienteCotizacionCodigo;
}

function inicializarTema() {
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const savedTheme = localStorage.getItem('theme_preference');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;

  if (isDark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');

  actualizarIconoTema(isDark);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const darkActive = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme_preference', darkActive ? 'dark' : 'light');
      actualizarIconoTema(darkActive);
    });
  }
}

function actualizarIconoTema(isDark) {
  const themeIcon = document.getElementById('theme-icon');
  if (!themeIcon) return;
  themeIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
  if (window.lucide) lucide.createIcons();
}

async function actualizarTasasBCV() {
  try {
    const [resUSD, resEUR] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/euros/oficial')
    ]);

    if (resUSD.ok) {
      const dataUSD = await resUSD.json();
      if (dataUSD && dataUSD.promedio) tasaUSD_BCV = parseFloat(dataUSD.promedio);
    }
    if (resEUR.ok) {
      const dataEUR = await resEUR.json();
      if (dataEUR && dataEUR.promedio) tasaEUR_BCV = parseFloat(dataEUR.promedio);
    }
  } catch (err) {
    console.warn('Usando valores de tasa por defecto / offline:', err);
  }

  const elUSD = document.getElementById('tasa-bcv-usd');
  const elEUR = document.getElementById('tasa-bcv-eur');
  if (elUSD) elUSD.textContent = `$: ${formatearNumeroVE(tasaUSD_BCV, 2)}`;
  if (elEUR) elEUR.textContent = `€: ${formatearNumeroVE(tasaEUR_BCV, 2)}`;

  const elVar = document.getElementById('variacion-usd-eur');
  if (elVar && tasaUSD_BCV > 0) {
    const brechaEUR = ((tasaEUR_BCV - tasaUSD_BCV) / tasaUSD_BCV) * 100;
    if (brechaEUR >= 0) {
      elVar.className = "font-bold text-emerald-400 flex items-center gap-0.5";
      elVar.innerHTML = `▲ +${formatearNumeroVE(brechaEUR, 2)}%`;
    } else {
      elVar.className = "font-bold text-rose-400 flex items-center gap-0.5";
      elVar.innerHTML = `▼ ${formatearNumeroVE(brechaEUR, 2)}%`;
    }
  }

  calcularCotizacion();
}

function calcularCotizacion() {
  const anchoMat = parsearFloatVE(document.getElementById('anchoMaterial')?.value);
  const altoMat = parsearFloatVE(document.getElementById('altoMaterial')?.value);
  const anchoPlotter = parsearFloatVE(document.getElementById('anchoPlotter')?.value);
  const costoMat = parsearFloatVE(document.getElementById('costoMaterial')?.value);
  const costoAcabados = parsearFloatVE(document.getElementById('costoAcabados')?.value);
  const manoObra = parsearFloatVE(document.getElementById('manoObra')?.value);
  const porcentajeMargen = parsearFloatVE(document.getElementById('porcentajeMargen')?.value);

  let tirasTeoricas = 0;
  let piezasPorTira = 0;

  if (anchoPlotter > 0 && anchoMat > 0) {
    tirasTeoricas = anchoMat / anchoPlotter;
    piezasPorTira = Math.ceil(tirasTeoricas);
  }

  const areaM2 = anchoMat * altoMat;
  const costoBaseMaterial = areaM2 * costoMat;
  const costoTotalProduccion = costoBaseMaterial + costoAcabados + manoObra;
  const factorMargen = porcentajeMargen > 0 ? (1 + (porcentajeMargen / 100)) : 1;

  const totalUSD = costoTotalProduccion * factorMargen;
  const totalBsUSD = totalUSD * tasaUSD_BCV;
  const totalBsEUR = totalUSD * tasaEUR_BCV;

  const elAreaM2 = document.getElementById('res-metros-cuadrados');
  if (elAreaM2) elAreaM2.textContent = `${formatearNumeroVE(areaM2, 2)} m²`;

  document.getElementById('res-tiras-teoricas').textContent = formatearNumeroVE(tirasTeoricas, 2);
  document.getElementById('res-piezas-tiras').textContent = piezasPorTira;
  document.getElementById('res-precio-usd').textContent = `$ ${formatearNumeroVE(totalUSD, 2)}`;
  document.getElementById('res-precio-bs-usd').textContent = `Bs. ${formatearNumeroVE(totalBsUSD, 2)}`;
  document.getElementById('res-precio-bs-eur').textContent = `Bs. ${formatearNumeroVE(totalBsEUR, 2)}`;

  return {
    anchoMat, altoMat, anchoPlotter, costoMat, areaM2,
    tirasTeoricas, piezasPorTira, costoAcabados, manoObra,
    porcentajeMargen, totalUSD, totalBsUSD, totalBsEUR,
    tasaUSD: tasaUSD_BCV, tasaEUR: tasaEUR_BCV
  };
}

async function cargarCatalogosSelects() {
  const campos = ['cliente', 'proyecto', 'material'];
  for (const campo of campos) {
    const selectEl = document.getElementById(`${campo}-select`);
    if (!selectEl) continue;

    const items = await db.catalogos.where('tipo').equals(campo).toArray();
    selectEl.innerHTML = `
      <option value="">-- Seleccionar ${campo} --</option>
      <option value="__NUEVO__">+ Agregar nuevo ${campo}...</option>
    `;

    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.valor;
      opt.textContent = item.valor;
      selectEl.appendChild(opt);
    });
  }
}

function configurarSelectorDinamico(campo) {
  const selectEl = document.getElementById(`${campo}-select`);
  const inputEl = document.getElementById(`${campo}-input`);
  const btnCancel = document.getElementById(`btn-cancel-${campo}`);

  if (!selectEl || !inputEl || !btnCancel) return;

  selectEl.addEventListener('change', (e) => {
    if (e.target.value === '__NUEVO__') {
      selectEl.classList.add('hidden');
      inputEl.classList.remove('hidden');
      btnCancel.classList.remove('hidden');
      inputEl.focus();
    }
  });

  btnCancel.addEventListener('click', () => {
    inputEl.value = '';
    inputEl.classList.add('hidden');
    btnCancel.classList.add('hidden');
    selectEl.classList.remove('hidden');
    selectEl.value = '';
  });
}

async function obtenerValorCampoYGuardar(campo) {
  const selectEl = document.getElementById(`${campo}-select`);
  const inputEl = document.getElementById(`${campo}-input`);

  let valor = '';
  if (selectEl && !selectEl.classList.contains('hidden')) {
    valor = selectEl.value;
  } else if (inputEl && !inputEl.classList.contains('hidden')) {
    valor = inputEl.value.trim();
  }

  if (valor && valor !== '__NUEVO__') {
    const existe = await db.catalogos.where({ tipo: campo, valor: valor }).first();
    if (!existe) {
      await db.catalogos.add({ tipo: campo, valor: valor });
      await cargarCatalogosSelects();
    }
  }

  return valor || (campo === 'cliente' ? 'Consumidor Final' : campo === 'proyecto' ? 'General' : 'Vinilo');
}

async function renderizarTablaRegistros(filtro = '') {
  const tbody = document.getElementById('tabla-registros-body');
  if (!tbody) return;

  const registrosCloud = await sincronizarDesdeCloud();
  let registros = registrosCloud.length > 0 ? registrosCloud : await db.cotizaciones.orderBy('id').reverse().toArray();

  if (filtro) {
    const term = filtro.toLowerCase();
    registros = registros.filter(r => 
      (r.cliente && r.cliente.toLowerCase().includes(term)) ||
      (r.proyecto && r.proyecto.toLowerCase().includes(term)) ||
      (r.nro_cotizacion && r.nro_cotizacion.toLowerCase().includes(term)) ||
      (r.nroCotizacion && r.nroCotizacion.toLowerCase().includes(term))
    );
  }

  if (registros.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-6 text-slate-400 italic">No hay cotizaciones registradas en la nube.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const fechaFormatted = r.fecha ? new Date(r.fecha).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }) : 'N/A';

    const codigoCotizacion = r.nro_cotizacion || r.nroCotizacion || `COTZ-${String(r.id || 0).padStart(6, '0')}`;

    return `
      <tr class="hover:bg-indigo-50/50 dark:hover:bg-slate-700/40 transition-colors">
        <td class="p-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <span class="font-bold text-indigo-600 dark:text-indigo-400 block">${codigoCotizacion}</span>
          <span>${fechaFormatted}</span>
        </td>
        <td class="p-2.5 font-medium text-slate-800 dark:text-slate-200">${r.cliente || 'Consumidor Final'}</td>
        <td class="p-2.5 text-slate-600 dark:text-slate-300">${r.proyecto || 'General'}</td>
        <td class="p-2.5 text-indigo-600 dark:text-indigo-300">${r.material || 'N/A'}</td>
        <td class="p-2.5 text-right font-mono">$ ${formatearNumeroVE(r.costo_material || r.costoMaterial || 0, 2)}</td>
        <td class="p-2.5 text-center font-bold text-indigo-600 dark:text-indigo-400">${r.piezas_por_tira || r.piezasPorTira || 0}</td>
        <td class="p-2.5 text-right font-bold text-slate-800 dark:text-slate-100">$ ${formatearNumeroVE(r.total_usd || r.totalUSD || 0, 2)}</td>
        <td class="p-2.5 text-right font-bold text-sky-600 dark:text-sky-400">Bs. ${formatearNumeroVE(r.total_bs_eur || r.totalBsEUR || 0, 2)}</td>
        <td class="p-2.5 text-center font-mono text-[11px] text-slate-400">
          $ ${formatearNumeroVE(r.tasa_usd || r.tasaUSD || 0, 2)} / € ${formatearNumeroVE(r.tasa_eur || r.tasaEUR || 0, 2)}
        </td>
      </tr>
    `;
  }).join('');
}

async function descargarCotizacionExcel() {
  if (typeof ExcelJS === 'undefined') {
    alert('⚠️ La librería ExcelJS no está cargada correctamente.');
    return;
  }

  const res = calcularCotizacion();

  const clienteSelect = document.getElementById('cliente-select');
  const clienteInput = document.getElementById('cliente-input');
  const cliente = (clienteInput && !clienteInput.classList.contains('hidden')) ? clienteInput.value : (clienteSelect?.value || 'Consumidor Final');

  const proyectoSelect = document.getElementById('proyecto-select');
  const proyectoInput = document.getElementById('proyecto-input');
  const proyecto = (proyectoInput && !proyectoInput.classList.contains('hidden')) ? proyectoInput.value : (proyectoSelect?.value || 'Proyecto General');

  const materialSelect = document.getElementById('material-select');
  const materialInput = document.getElementById('material-input');
  const material = (materialInput && !materialInput.classList.contains('hidden')) ? materialInput.value : (materialSelect?.value || 'Material Estándar');

  const nroCotizacion = siguienteCotizacionCodigo;
  const fechaActual = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Cotización Oficial');

  worksheet.views = [{ showGridLines: true }];
  worksheet.columns = [{ width: 32 }, { width: 22 }, { width: 18 }, { width: 24 }, { width: 25 }];

  const primaryHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E1B4B' } };
  const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } };
  const resultHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
  const greenTotalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } };

  worksheet.mergeCells('A1:E1');
  worksheet.getCell('A1').value = 'COTIZACIÓN DE SERVICIOS - IMPRESIÓN Y PLOTTER';
  worksheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getCell('A1').fill = primaryHeaderFill;
  worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells('A2:C2');
  worksheet.getCell('A2').value = `N° de Cotización: ${nroCotizacion}`;
  worksheet.getCell('A2').font = { name: 'Arial', size: 11, bold: true, color: { argb: '4338CA' } };

  worksheet.mergeCells('D2:E2');
  worksheet.getCell('D2').value = `Emisión: ${fechaActual}`;
  worksheet.getCell('D2').font = { name: 'Arial', size: 10, italic: true, color: { argb: '475569' } };
  worksheet.getCell('D2').alignment = { horizontal: 'right' };

  worksheet.addRow([]);
  worksheet.mergeCells('A4:E4');
  worksheet.getCell('A4').value = '📋 INFORMACIÓN DEL CLIENTE Y PROYECTO';
  worksheet.getCell('A4').font = { name: 'Arial', size: 10, bold: true, color: { argb: '1E1B4B' } };
  worksheet.getCell('A4').fill = sectionFill;

  worksheet.getRow(5).values = ['Cliente', cliente, '', 'Proyecto', proyecto];
  worksheet.getRow(6).values = ['Material Seleccionado', material, '', '', ''];
  worksheet.addRow([]);

  worksheet.mergeCells('A8:E8');
  worksheet.getCell('A8').value = '⚙️ PARÁMETROS DE PRODUCCIÓN';
  worksheet.getCell('A8').font = { name: 'Arial', size: 10, bold: true, color: { argb: '1E1B4B' } };
  worksheet.getCell('A8').fill = sectionFill;

  worksheet.getRow(9).values = ['Parámetro de Entrada', 'Valor', 'Unidad', 'Descripción', ''];
  ['A9', 'B9', 'C9', 'D9', 'E9'].forEach(c => worksheet.getCell(c).fill = resultHeaderFill);

  const parametrosData = [
    ['Ancho Material', res.anchoMat, 'm', 'Ancho de la bobina'],
    ['Alto Material', res.altoMat, 'm', 'Largo requerido'],
    ['Ancho Plotter', res.anchoPlotter, 'm', 'Ancho máximo'],
    ['Costo Material', res.costoMat, '$ / m²', 'Costo por m²'],
    ['Costo Acabados', res.costoAcabados, '$', 'Acabados'],
    ['Mano de Obra', res.manoObra, '$', 'Instalación'],
    ['Margen de Ganancia', res.porcentajeMargen, '%', 'Margen comercial']
  ];

  parametrosData.forEach((rowVals, idx) => {
    const r = 10 + idx;
    worksheet.getRow(r).values = [rowVals[0], rowVals[1], rowVals[2], rowVals[3], ''];
    worksheet.mergeCells(`D${r}:E${r}`);
  });

  worksheet.addRow([]);
  worksheet.mergeCells('A18:E18');
  worksheet.getCell('A18').value = '📊 RESULTADOS DE PRODUCCIÓN';
  worksheet.getCell('A18').font = { name: 'Arial', size: 10, bold: true, color: { argb: '1E1B4B' } };
  worksheet.getCell('A18').fill = sectionFill;

  worksheet.getRow(19).values = ['Métrica', 'Fórmula', 'Resultado', '', ''];
  worksheet.mergeCells('C19:E19');

  worksheet.getRow(20).values = ['Metros Cuadrados (m²)', '=B10*B11', '', '', ''];
  worksheet.getCell('C20').value = { formula: 'B10*B11', result: res.areaM2 };
  worksheet.getCell('C20').numFmt = '#,##0.00 "m²"';
  worksheet.mergeCells('C20:E20');

  worksheet.getRow(21).values = ['Tiras Teóricas', '=B10/SI(B12>0;B12;1)', '', '', ''];
  worksheet.getCell('C21').value = { formula: 'IF(B12>0, B10/B12, 0)', result: res.tirasTeoricas };
  worksheet.mergeCells('C21:E21');

  worksheet.getRow(22).values = ['Tiras / Piezas', '=REDONDEAR.MAS(B21;0)', '', '', ''];
  worksheet.getCell('C22').value = { formula: 'CEILING(B21, 1)', result: res.piezasPorTira };
  worksheet.mergeCells('C22:E22');

  worksheet.getRow(23).values = ['Costo Producción ($)', '=((B10*B11)*B13)+B14+B15', '', '', ''];
  worksheet.getCell('C23').value = { formula: '((B10*B11)*B13)+B14+B15', result: (res.areaM2 * res.costoMat) + res.costoAcabados + res.manoObra };
  worksheet.mergeCells('C23:E23');

  worksheet.addRow([]);
  worksheet.mergeCells('A25:E25');
  worksheet.getCell('A25').value = '💰 RESUMEN FINANCIERO Y LIQUIDACIÓN BCV';
  worksheet.getCell('A25').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getCell('A25').fill = greenTotalFill;

  worksheet.getRow(26).values = ['Tasa Dólar ($) BCV', res.tasaUSD, 'Bs. / USD', 'BCV', ''];
  worksheet.getRow(27).values = ['Tasa Euro (€) BCV', res.tasaEUR, 'Bs. / EUR', 'BCV', ''];

  worksheet.getRow(28).values = ['PRECIO TOTAL ($ USD)', '', '', '', ''];
  worksheet.getCell('B28').value = { formula: 'B23*(1+(B16/100))', result: res.totalUSD };
  worksheet.mergeCells('B28:E28');

  worksheet.getRow(29).values = ['Precio Total (Bs. USD)', '', '', '', ''];
  worksheet.getCell('B29').value = { formula: 'B28*B26', result: res.totalBsUSD };
  worksheet.mergeCells('B29:E29');

  worksheet.getRow(30).values = ['Precio Total (Bs. Euro)', '', '', '', ''];
  worksheet.getCell('B30').value = { formula: 'B28*B27', result: res.totalBsEUR };
  worksheet.mergeCells('B30:E30');

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nroCotizacion}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

function inicializarCalculadoraFlotante() {
  const btnAbrir = document.getElementById('btn-abrir-calculadora');
  const btnCerrar = document.getElementById('btn-cerrar-calculadora');
  const modal = document.getElementById('modal-calculadora');
  const display = document.getElementById('calc-display');
  const botones = document.querySelectorAll('.calc-btn');

  if (!btnAbrir || !modal || !display) return;

  btnAbrir.addEventListener('click', () => {
    modal.classList.remove('hidden');
  });

  if (btnCerrar) {
    btnCerrar.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  let expr = '0';

  botones.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      
      if (val === 'C') {
        expr = '0';
      } else if (val === '=') {
        try {
          let resultado = eval(expr.replace(/×/g, '*').replace(/÷/g, '/'));
          expr = String(Math.round(resultado * 1000000) / 1000000);
        } catch (err) {
          expr = 'Error';
        }
      } else {
        if (expr === '0' || expr === 'Error') {
          expr = val;
        } else {
          expr += val;
        }
      }
      display.value = expr;
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  inicializarTema();
  if (window.lucide) lucide.createIcons();

  await actualizarTasasBCV();
  await obtenerSiguienteNumeroCotizacion();
  await cargarCatalogosSelects();
  await renderizarTablaRegistros();

  ['cliente', 'proyecto', 'material'].forEach(configurarSelectorDinamico);

  ['anchoMaterial', 'altoMaterial', 'anchoPlotter', 'costoMaterial', 'costoAcabados', 'manoObra', 'porcentajeMargen'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', calcularCotizacion);
  });

  document.getElementById('filtro-buscar')?.addEventListener('input', (e) => {
    renderizarTablaRegistros(e.target.value);
  });

  inicializarCalculadoraFlotante();

  const formCotizador = document.getElementById('form-cotizacion');
  if (formCotizador) {
    formCotizador.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resultados = calcularCotizacion();

      const clienteVal = await obtenerValorCampoYGuardar('cliente');
      const proyectoVal = await obtenerValorCampoYGuardar('proyecto');
      const materialVal = await obtenerValorCampoYGuardar('material');

      const cotizacion = {
        nroCotizacion: siguienteCotizacionCodigo,
        cliente: clienteVal,
        proyecto: proyectoVal,
        material: materialVal,
        anchoMaterial: parsearFloatVE(document.getElementById('anchoMaterial')?.value),
        altoMaterial: parsearFloatVE(document.getElementById('altoMaterial')?.value),
        anchoPlotter: parsearFloatVE(document.getElementById('anchoPlotter')?.value),
        costoMaterial: parsearFloatVE(document.getElementById('costoMaterial')?.value),
        ...resultados,
        fecha: new Date().toISOString()
      };

      await guardarCotizacionCloud(cotizacion);
      await db.cotizaciones.add(cotizacion);

      await renderizarTablaRegistros();
      await obtenerSiguienteNumeroCotizacion();
      alert(`✅ Cotización ${cotizacion.nroCotizacion} guardada y sincronizada en la nube correctamente`);
    });
  }

  document.getElementById('btn-export-excel')?.addEventListener('click', descargarCotizacionExcel);

  document.getElementById('btn-limpiar-historial')?.addEventListener('click', async () => {
    if (confirm('¿Deseas limpiar tu historial local? (Los datos en la nube de Supabase se mantienen seguros).')) {
      await db.cotizaciones.clear();
      await renderizarTablaRegistros();
      await obtenerSiguienteNumeroCotizacion();
    }
  });

  document.getElementById('btn-nuevo')?.addEventListener('click', async () => {
    formCotizador?.reset();
    await obtenerSiguienteNumeroCotizacion();
    calcularCotizacion();
  });
});