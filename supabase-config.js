import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://pwsynlmiizwysdnwgdvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YrBcH4w0JX7zkvk0dVtrdA_kyv-s3O0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function guardarCotizacionCloud(cotizacion) {
  try {
    const { data, error } = await supabase
      .from('cotizaciones')
      .insert([{
        nro_cotizacion: cotizacion.nroCotizacion,
        cliente: cotizacion.cliente,
        proyecto: cotizacion.proyecto,
        material: cotizacion.material,
        ancho_material: cotizacion.anchoMaterial,
        alto_material: cotizacion.altoMaterial,
        ancho_plotter: cotizacion.anchoPlotter,
        costo_material: cotizacion.costoMaterial,
        costo_acabados: cotizacion.costoAcabados || 0,
        mano_obra: cotizacion.manoObra || 0,
        porcentaje_margen: cotizacion.porcentajeMargen || 0,
        tiras_teoricas: cotizacion.tirasTeoricas,
        piezas_por_tira: cotizacion.piezasPorTira,
        total_usd: cotizacion.totalUSD,
        total_bs_usd: cotizacion.totalBsUSD,
        total_bs_eur: cotizacion.totalBsEUR,
        tasa_usd: cotizacion.tasaUSD,
        tasa_eur: cotizacion.tasaEUR,
        estado: cotizacion.estado || 'Aprobado',
        fecha: cotizacion.fecha
      }])
      .select();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('⚠️ Trabajo en modo Offline o error de conexión Nube:', err.message);
    return null;
  }
}

export async function sincronizarDesdeCloud() {
  try {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('⚠️ No se pudo sincronizar desde la nube:', err.message);
    return [];
  }
}