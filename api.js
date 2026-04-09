// ── Habi API Service Layer ──
const HabiAPI = (() => {
  const CFG = {
    georef:   { base: 'https://apiv2.habi.co/web-global-api-georeferencing',       key: 'NNKqq91UqB7mUraiwkmgm2b53FOSzeh14wDYPqvQ' },
    hm:       { base: 'https://apiv2.habi.co/habimetro-api-container',             key: 'cTs075w7M48XrCr9LAES74HIJocDnHRM5uwFXURP' },
    hmLegacy: { base: 'https://apiv2.habi.co/habimetro-api',                       key: 'cTs075w7M48XrCr9LAES74HIJocDnHRM5uwFXURP' },
    globack:  { base: 'https://apiv2.habi.co/habi-habimetro-globack-container',    key: '5yqceawUSMauWBRvywJYLoRj5wlAXYKaxWCjEV06' },
  };

  function extract(data) {
    if (!data) return data;
    if (typeof data.body === 'string') try { data = JSON.parse(data.body); } catch {}
    if (data.response !== undefined) return data.response;
    return data;
  }

  async function get(cfg, path, params = {}) {
    const url = new URL(`${cfg.base}/${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url, { headers: { 'x-api-key': cfg.key } });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return extract(await res.json());
  }

  async function post(cfg, path, body) {
    const res = await fetch(`${cfg.base}/${path}`, {
      method: 'POST',
      headers: { 'x-api-key': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return extract(await res.json());
  }

  return {
    // Paso 1 — Ubicación
    getCities() {
      return get(CFG.georef, 'get_cities', { country: 'CO' });
    },
    getGeoref(address, cityName, propertyTypeId = 1) {
      return get(CFG.georef, 'get_georeferencing_by_address', {
        country: 'CO', city_name: cityName, address,
        suggestions: 'true', property_type_id: propertyTypeId, open_address_input: 'true'
      });
    },
    getMedianZoneInfo(medianZoneId, monthRange = 12) {
      return get(CFG.georef, 'get_median_zone_info', {
        country: 'CO', median_zone_id: medianZoneId, month_range: monthRange
      });
    },

    // Paso 2 — Catastral + DANE
    getPropertyGeoDetails(address) {
      return get(CFG.hmLegacy, 'get_property_geo_details', { address });
    },
    getDaneCode(latitude, longitude) {
      return get(CFG.hmLegacy, 'get_dane_code', { latitude, longitude });
    },

    // Paso 3-4 — Entorno
    getPlacesOfInterest(latitude, longitude) {
      return get(CFG.globack, 'get_places_of_interest', {
        country: 'CO', latitude, longitude
      });
    },
    getDiscarded(params) {
      return get(CFG.globack, 'get_discarded', { country: 'CO', ...params });
    },

    // Paso 5 — Avalúo
    postHabimetro(payload) {
      return post(CFG.globack, 'post_habimetro', payload);
    },
    getHabimetro(negocioId, inmuebleId) {
      return get(CFG.globack, 'get_habimetro', { negocio_id: negocioId, inmueble_id: inmuebleId });
    }
  };
})();

// ── Catastral response parser ──
function parseCatastral(raw) {
  if (!raw || !raw.result) return null;
  const items = Array.isArray(raw.result) ? raw.result : [raw.result];
  if (items.length === 0) return null;

  const torres = [];
  for (const item of items) {
    const opts = item.opciones || {};
    const torre = {
      complemento: item.complemento || 'edificio',
      numero: item.numero || 1,
      pisos: opts.piso || [],
      apartamentos: (opts.apartamento || []).map(String),
      apartamentos_info: {},
      vetustez: null,
      latitud: opts.latitud || null,
      longitud: opts.longitud || null
    };

    // Vetustez: can be array (one per apt) or single value
    const vet = opts.vetustez_catastro;
    if (Array.isArray(vet) && vet.length > 0) torre.vetustez = vet[0];
    else if (typeof vet === 'number') torre.vetustez = vet;

    // apartamentos_info: API may return it pre-built, or we build from parallel arrays
    if (opts.apartamentos_info && typeof opts.apartamentos_info === 'object') {
      torre.apartamentos_info = opts.apartamentos_info;
    } else if (opts.apartamento && Array.isArray(opts.area_catastro)) {
      opts.apartamento.forEach((apt, i) => {
        torre.apartamentos_info[String(apt)] = {
          area_catastro: opts.area_catastro[i] || null,
          direccion_catastral: Array.isArray(opts.direccion_catastral) ? opts.direccion_catastral[i] || '' : ''
        };
      });
    }

    // Also handle casas
    if (opts.casa && Array.isArray(opts.casa)) {
      opts.casa.forEach((c, i) => {
        const key = String(c);
        if (!torre.apartamentos.includes(key)) {
          torre.apartamentos.push(key);
          torre.apartamentos_info[key] = {
            area_catastro: Array.isArray(opts.area_catastro) ? opts.area_catastro[i] || null : null,
            direccion_catastral: Array.isArray(opts.direccion_catastral) ? opts.direccion_catastral[i] || '' : ''
          };
        }
      });
    }

    torres.push(torre);
  }
  return { torres };
}

// ── Historic price normalizer ──
function normalizeHistoric(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const qNames = { Q1: 'Ene-Mar', Q2: 'Abr-Jun', Q3: 'Jul-Sep', Q4: 'Oct-Dic',
                    '1': 'Ene-Mar', '2': 'Abr-Jun', '3': 'Jul-Sep', '4': 'Oct-Dic' };
  return Object.entries(data)
    .map(([key, value]) => {
      const year = key.substring(0, 4);
      const q = key.substring(4);
      return { year, trimester: qNames[q] || q, value: Number(value) };
    })
    .sort((a, b) => (a.year + a.trimester).localeCompare(b.year + b.trimester));
}
