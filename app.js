// ── State ──
let currentStep = 1;
const STEPS = 5;
const PROGRESS = [0, 15, 35, 65, 85, 100];
const HINTS = [
  'Ingresa la ubicación de tu inmueble para comenzar',
  'Ya sabemos dónde está — cuéntanos qué tipo de inmueble es',
  'Identificamos tu propiedad — ahora necesitamos las características',
  'Ya tenemos datos del entorno — los detalles nos dan más precisión',
  'Último paso — déjanos tus datos para ver el resultado',
  'Tu avalúo está listo'
];

const formData = {
  city: '', cityName: '', address: '', propertyType: 1, unit: '',
  area: 0, rooms: 3, bathrooms: 2, garages: 1, age: 0, stratum: 4,
  elevator: 1, balcony: 0, terrace: 0, storage: 0, doorman: 0, remodeled: 0,
  floor: 3, view: 'Interna',
  name: '', email: '', phone: '', intent: 'vender'
};

// API response store
const api = {
  cities: [],
  georef: null,
  catastral: null,
  daneCode: null,
  pois: null,
  medianZone: null,
  discarded: null,
  postResult: null,
  habimetro: null
};

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadCities();
  bindNavigation();
  bindToggles();
  bindIntentButtons();
  bindFormInputs();
  bindAddressAutocomplete();
  updateProgress();
});

// ── Cities (async) ──
async function loadCities() {
  const container = document.getElementById('citySelect');
  const input = document.getElementById('cityInput');
  const dropdown = document.getElementById('cityDropdown');

  let cities = [];
  try {
    const data = await HabiAPI.getCities();
    cities = data.cities || data || [];
    cities.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  } catch (e) {
    console.error('Failed to load cities:', e);
    cities = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Cartagena', 'Pereira', 'Armenia', 'Soacha', 'Envigado', 'Bello', 'Itagüí', 'Sabaneta', 'Chía']
      .map(name => ({ name: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), label: name, id: '' }));
  }
  api.cities = cities;

  function renderOptions(filter) {
    const q = (filter || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtered = q ? cities.filter(c => {
      const label = (c.label || c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return label.includes(q);
    }) : cities;

    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="custom-select__empty">No se encontraron ciudades</div>';
    } else {
      dropdown.innerHTML = filtered.map(c => {
        const value = c.name || c.value || '';
        const cityId = c.id || c.ciudad_id || '';
        const text = c.label || c.name || '';
        const isActive = value === formData.city ? ' active' : '';
        return `<button class="custom-select__option${isActive}" type="button" data-value="${value}" data-city-id="${cityId}">${text}</button>`;
      }).join('');
    }
  }

  // Show all options on focus
  input.addEventListener('focus', () => {
    renderOptions(input.value);
    container.classList.add('open');
  });

  // Filter as user types
  input.addEventListener('input', () => {
    formData.city = '';
    formData.cityName = '';
    formData.cityId = '';
    renderOptions(input.value);
    container.classList.add('open');
    validateStep1();
  });

  // Select option
  dropdown.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.custom-select__option');
    if (!opt) return;
    e.preventDefault();
    formData.city = opt.dataset.value;
    formData.cityName = opt.textContent;
    formData.cityId = opt.dataset.cityId || '';
    input.value = opt.textContent;
    container.classList.remove('open');
    validateStep1();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#citySelect')) container.classList.remove('open');
  });
}

// ── Address Autocomplete ──
let geoDebounce;
let addressConfirmed = false;

function bindAddressAutocomplete() {
  const input = document.getElementById('address');
  const sugBox = document.getElementById('addressSuggestions');
  const matchHelper = document.getElementById('addressMatch');

  input.addEventListener('input', () => {
    formData.address = input.value;
    addressConfirmed = false;
    api.georef = null;
    matchHelper.classList.add('hidden');
    validateStep1();

    clearTimeout(geoDebounce);
    if (input.value.length >= 8 && formData.city) {
      geoDebounce = setTimeout(() => searchAddress(input.value), 300);
    } else {
      sugBox.classList.remove('open');
    }
  });

  input.addEventListener('focus', () => {
    // Re-show suggestions if there's text and no confirmed address
    if (input.value.length >= 8 && formData.city && !addressConfirmed) {
      searchAddress(input.value);
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.field')) sugBox.classList.remove('open');
  });
}

async function searchAddress(query) {
  const sugBox = document.getElementById('addressSuggestions');

  // Show searching state
  sugBox.innerHTML = '<div class="field__sug-status">Buscando dirección...</div>';
  sugBox.classList.add('open');

  try {
    const raw = await HabiAPI.getGeoref(query, formData.city, formData.propertyType);
    const georef = raw.georeferencing || raw;

    let html = '';

    // Main result (exact match with lot_id)
    if (georef.lot_id && georef.address) {
      const project = georef.project ? ` — ${georef.project}` : '';
      html += `<button class="field__sug-item field__sug-item--match" data-address="${georef.address}" data-main="true">
        <span class="field__sug-icon">📍</span>
        <span><strong>${georef.address}</strong>${project}</span>
      </button>`;
    }

    // Suggestions
    if (georef.suggested_addresses && georef.suggested_addresses.length > 0) {
      georef.suggested_addresses.forEach(s => {
        html += `<button class="field__sug-item" data-address="${s.direccion}">
          <span class="field__sug-icon">📍</span>
          <span>${s.direccion} <span style="color:#949494">— ${s.label || s.ciudad || ''}</span></span>
        </button>`;
      });
    }

    if (html) {
      sugBox.innerHTML = html;
      sugBox.classList.add('open');

      // Store georef if we got a direct match
      if (georef.lot_id) api.georef = georef;

      // Bind selection
      sugBox.querySelectorAll('.field__sug-item').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectSuggestion(btn, georef);
        });
      });
    } else {
      sugBox.innerHTML = '<div class="field__sug-status">Al parecer no encontramos esta dirección 🧐</div>';
    }
  } catch (e) {
    console.error('Georef search failed:', e);
    sugBox.innerHTML = '<div class="field__sug-status">Error al buscar dirección</div>';
  }
}

async function selectSuggestion(btn, originalGeoref) {
  const address = btn.dataset.address;
  const input = document.getElementById('address');
  const sugBox = document.getElementById('addressSuggestions');
  const matchHelper = document.getElementById('addressMatch');

  input.value = address;
  formData.address = address;
  sugBox.classList.remove('open');

  // If it was the main match, use that georef directly
  if (btn.dataset.main === 'true' && originalGeoref && originalGeoref.lot_id) {
    api.georef = originalGeoref;
    addressConfirmed = true;
    const project = originalGeoref.project || '';
    matchHelper.textContent = project ? `✓ ${project} — Dirección identificada` : '✓ Dirección identificada';
    matchHelper.classList.remove('hidden');
    validateStep1();
    return;
  }

  // Otherwise re-fetch for the selected address
  matchHelper.textContent = 'Verificando dirección...';
  matchHelper.classList.remove('hidden');
  try {
    const raw = await HabiAPI.getGeoref(address, formData.city, formData.propertyType);
    api.georef = raw.georeferencing || raw;
    addressConfirmed = true;
    const project = api.georef.project || '';
    matchHelper.textContent = project ? `✓ ${project} — Dirección identificada` : '✓ Dirección identificada';
  } catch (e) {
    console.error('Georef select failed:', e);
    matchHelper.textContent = 'No pudimos verificar esta dirección';
  }
  validateStep1();
}

// ── Navigation ──
function bindNavigation() {
  document.querySelectorAll('.btn--next').forEach(btn => btn.addEventListener('click', () => nextStep()));
  document.querySelectorAll('.btn--back').forEach(btn => btn.addEventListener('click', () => prevStep()));
  document.getElementById('btnSubmit').addEventListener('click', () => submitForm());
  document.getElementById('btnRestart').addEventListener('click', () => restart());
  document.querySelectorAll('.steps-nav__dot').forEach(dot => {
    dot.addEventListener('click', () => { const t = +dot.dataset.step; if (t < currentStep) goToStep(t); });
  });
}

async function nextStep() {
  if (currentStep >= STEPS) return;
  await onStepComplete(currentStep);
  goToStep(currentStep + 1);
}
function prevStep() { if (currentStep > 1) goToStep(currentStep - 1); }

function goToStep(n) {
  currentStep = n;
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.querySelector(`.step[data-step="${n}"]`).classList.add('active');
  document.querySelectorAll('.steps-nav__dot').forEach(dot => {
    const s = +dot.dataset.step;
    dot.classList.remove('active', 'done');
    if (s === n) dot.classList.add('active');
    else if (s < n) dot.classList.add('done');
  });
  updateProgress();
}

function updateProgress() {
  const pct = PROGRESS[currentStep - 1] || 0;
  const fill = document.getElementById('progressFill');
  fill.style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressHint').textContent = HINTS[currentStep - 1];

  if (pct <= 25) fill.style.background = 'var(--orange)';
  else if (pct <= 50) fill.style.background = 'linear-gradient(90deg, var(--orange), #E5C100)';
  else if (pct <= 80) fill.style.background = 'linear-gradient(90deg, #E5C100, var(--teal))';
  else fill.style.background = 'var(--teal)';
}

// ── Step completions → API calls + panel cards ──
async function onStepComplete(step) {
  const panel = document.getElementById('panelCards');
  const empty = document.getElementById('panelEmpty');
  if (empty) empty.remove();

  switch (step) {
    case 1: await onLocationComplete(panel); break;
    case 2: await onPropertyTypeComplete(panel); break;
    case 3: await onCharacteristicsComplete(panel); break;
    case 4: onDetailsComplete(panel); break;
  }
}

// ── Step 1: Location complete ──
async function onLocationComplete(panel) {
  // Show location card with georef data
  addLocationCard(panel);

  // Fire parallel API calls for next steps
  const geo = api.georef;
  if (geo) {
    const promises = [];

    // Catastral data
    if (formData.address) {
      promises.push(
        HabiAPI.getPropertyGeoDetails(formData.address)
          .then(data => { api.catastral = parseCatastral(data); })
          .catch(e => console.error('Catastral failed:', e))
      );
    }
    // DANE code
    if (geo.latitude && geo.longitude) {
      promises.push(
        HabiAPI.getDaneCode(geo.latitude, geo.longitude)
          .then(data => { api.daneCode = data.cod_sect || data; })
          .catch(e => console.error('DANE failed:', e))
      );
    }
    // Places of interest
    if (geo.latitude && geo.longitude) {
      promises.push(
        HabiAPI.getPlacesOfInterest(geo.latitude, geo.longitude)
          .then(data => { api.pois = data.result || data; updateLocationCardPOIs(); })
          .catch(e => console.error('POIs failed:', e))
      );
    }
    // Median zone info
    if (geo.median_zone_id) {
      promises.push(
        HabiAPI.getMedianZoneInfo(geo.median_zone_id)
          .then(data => { api.medianZone = data; })
          .catch(e => console.error('Median zone failed:', e))
      );
    }

    await Promise.all(promises);
  }
}

// ── Step 2: Property type complete ──
async function onPropertyTypeComplete(panel) {
  addCatastralCard(panel);
}

// ── Step 3: Characteristics complete ──
async function onCharacteristicsComplete(panel) {
  readStep3Fields();
  addZoneCard(panel);

  // Check if property would be discarded
  const geo = api.georef;
  if (geo && formData.area) {
    try {
      const disc = await HabiAPI.getDiscarded({
        area: formData.area,
        property_type_id: formData.propertyType,
        stratum: formData.stratum,
        city_id: formData.cityId || geo.city_id,
        latitude: geo.latitude,
        longitude: geo.longitude,
        median_zone_id: geo.median_zone_id,
        years_old: formData.age
      });
      api.discarded = disc;
    } catch (e) {
      console.error('Discarded check failed:', e);
    }
  }
}

// ── Step 4: Details complete ──
function onDetailsComplete(panel) {
  addPOIsCard(panel);
}

// ── Panel Cards ──

function addLocationCard(panel) {
  if (document.getElementById('pc-location')) return;
  const geo = api.georef || {};
  const addr = geo.address || formData.address;
  const project = geo.project || '';
  const title = project ? `${project} — ${addr}` : addr;

  panel.insertAdjacentHTML('beforeend', `
    <div class="panel-card panel-card--location" id="pc-location">
      <div class="panel-card__badge">📍 Ubicación identificada</div>
      <div class="panel-card__title">${title}</div>
      <div class="panel-card__pois" id="pc-location-pois">
        <span class="poi-chip" style="opacity:0.6">Cargando lugares cercanos...</span>
      </div>
    </div>
  `);
}

// Called after POIs API resolves to update the location card
function updateLocationCardPOIs() {
  const poisEl = document.getElementById('pc-location-pois');
  if (!poisEl) return;
  const pois = api.pois;
  if (pois && Array.isArray(pois) && pois.length > 0) {
    let chips = '';
    pois.forEach(cat => {
      if (cat.result && cat.result.length > 0) {
        const p = cat.result[0];
        chips += `<span class="poi-chip">${cat.icon || '📍'} ${p.name} <span class="poi-chip__dist">${p.distance}m</span></span>`;
      }
    });
    poisEl.innerHTML = chips;
  } else {
    poisEl.innerHTML = '';
  }
}

function addCatastralCard(panel) {
  if (document.getElementById('pc-catastral')) return;
  const cat = api.catastral;

  if (cat && cat.torres && cat.torres.length > 0) {
    const torre = cat.torres[0];
    const age = torre.vetustez ? new Date().getFullYear() - torre.vetustez : null;
    const ageText = age !== null ? `Construido en ${torre.vetustez} (${age} años)` : '';
    const unitsCount = torre.apartamentos.length;

    panel.insertAdjacentHTML('beforeend', `
      <div class="panel-card panel-card--catastral" id="pc-catastral">
        <div class="panel-card__badge" style="color:var(--teal)">🏢 Datos catastrales</div>
        <div class="panel-card__detail">
          <strong>${api.georef?.project || 'Edificio'}</strong>
          ${unitsCount > 0 ? unitsCount + ' unidades · ' : ''}${ageText}
          ${torre.pisos.length > 0 ? '<br>Pisos: ' + torre.pisos[0] + ' al ' + torre.pisos[torre.pisos.length - 1] : ''}
        </div>
      </div>
    `);
    showCatastralFields();

    // Auto-fill age from catastral
    if (age !== null && !document.getElementById('age').value) {
      document.getElementById('age').value = age;
      formData.age = age;
    }
  } else {
    panel.insertAdjacentHTML('beforeend', `
      <div class="panel-card panel-card--catastral" id="pc-catastral">
        <div class="panel-card__badge" style="color:var(--gray-400)">🏢 Sin datos catastrales</div>
        <div class="panel-card__detail">No encontramos información catastral para esta dirección. Completa los datos manualmente.</div>
      </div>
    `);
  }
}

function addZoneCard(panel) {
  if (document.getElementById('pc-zone')) document.getElementById('pc-zone').remove();
  const mz = api.medianZone;
  let content = '';

  if (mz) {
    const cierres = mz.leads_cierres || 0;
    const desist = mz.leads_cierres_desistimiento || 0;
    content = `
      <div class="panel-card__detail">
        <strong>Actividad en tu zona</strong>
        ${cierres} compras realizadas por Habi (últimos 12 meses)<br>
        ${desist} ventas estimadas en la zona
        ${mz.ultimo_cierre ? '<br>Última compra: ' + mz.ultimo_cierre.substring(0, 10) : ''}
      </div>
    `;
  } else {
    content = '<div class="panel-card__detail">Sin datos de actividad para esta zona</div>';
  }

  panel.insertAdjacentHTML('beforeend', `
    <div class="panel-card panel-card--range" id="pc-zone">
      <div class="panel-card__badge" style="color:var(--purple)">📊 Tu zona</div>
      ${content}
    </div>
  `);
}

function addPOIsCard(panel) {
  if (document.getElementById('pc-pois')) document.getElementById('pc-pois').remove();
  const pois = api.pois;

  if (pois && Array.isArray(pois) && pois.length > 0) {
    let chips = '';
    pois.forEach(cat => {
      if (cat.result && cat.result.length > 0) {
        const p = cat.result[0];
        const icon = cat.icon || '📍';
        chips += `<span class="poi-chip">${icon} ${p.name} <span class="poi-chip__dist">${p.distance}m</span></span>`;
      }
    });
    panel.insertAdjacentHTML('beforeend', `
      <div class="panel-card panel-card--refined" id="pc-pois">
        <div class="panel-card__badge" style="color:var(--teal)">🏙️ Entorno</div>
        <div class="panel-card__pois">${chips}</div>
      </div>
    `);
  }
}

// ── Catastral fields ──
function showCatastralFields() {
  const cat = api.catastral;
  if (!cat || !cat.torres || cat.torres.length === 0) return;
  if (formData.propertyType === 2 || formData.propertyType === 4) return;

  const torre = cat.torres[0];
  if (torre.apartamentos.length === 0) return;

  const fields = document.getElementById('catastralFields');
  const unitSel = document.getElementById('unit');

  unitSel.innerHTML = '<option value="" disabled selected>Selecciona tu unidad</option>';
  torre.apartamentos.forEach(apt => {
    const info = torre.apartamentos_info[apt];
    const opt = document.createElement('option');
    opt.value = apt;
    const areaText = info && info.area_catastro ? ` — ${info.area_catastro} m²` : '';
    opt.textContent = `Apto ${apt}${areaText}`;
    unitSel.appendChild(opt);
  });

  unitSel.addEventListener('change', () => {
    const info = torre.apartamentos_info[unitSel.value];
    if (info) {
      if (info.area_catastro) {
        document.getElementById('area').value = info.area_catastro;
        formData.area = info.area_catastro;
      }
      formData.unit = unitSel.value;
      document.getElementById('unitHelper').textContent =
        `Área catastral: ${info.area_catastro || '—'} m²${info.direccion_catastral ? ' · ' + info.direccion_catastral : ''}`;
    }
  });
  fields.classList.remove('hidden');
}

function readStep3Fields() {
  formData.area = +document.getElementById('area').value || 0;
  formData.rooms = +document.getElementById('rooms').value;
  formData.bathrooms = +document.getElementById('bathrooms').value;
  formData.garages = +document.getElementById('garages').value;
  formData.age = +document.getElementById('age').value || 0;
  formData.stratum = +document.getElementById('stratum').value;
}

// ── Toggles ──
function bindToggles() {
  document.querySelectorAll('#propertyType .toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#propertyType .toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      formData.propertyType = +btn.dataset.value;
      // Show catastral unit selector for apartments (1, 3), hide for houses (2, 4)
      if (formData.propertyType === 2 || formData.propertyType === 4) {
        document.getElementById('catastralFields').classList.add('hidden');
      }
    });
  });
  document.querySelectorAll('.toggle-yn').forEach(group => {
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        formData[group.dataset.field] = +btn.dataset.value;
      });
    });
  });
}

function bindIntentButtons() {
  document.querySelectorAll('.intent-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.intent-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      formData.intent = btn.dataset.value;
    });
  });
}

function bindFormInputs() {
  ['name', 'email', 'phone'].forEach(id => {
    document.getElementById(id).addEventListener('input', (e) => { formData[id] = e.target.value; });
  });
}

function validateStep1() {
  document.getElementById('btn1').disabled = !(formData.city && formData.address.length >= 5);
}

// ── Submit → POST habimetro + GET habimetro ──
async function submitForm() {
  formData.name = document.getElementById('name').value;
  formData.email = document.getElementById('email').value;
  formData.phone = document.getElementById('phone').value;

  // Show loading
  document.getElementById('mainForm').classList.add('hidden');
  document.getElementById('hero').classList.add('hidden');
  document.getElementById('loadingSection').classList.remove('hidden');

  const messages = [
    'Registrando tu inmueble...',
    'Analizando ubicación y zona...',
    'Consultando datos del mercado...',
    'Comparando con inmuebles similares...',
    'Calculando costos transaccionales...',
    'Generando tu reporte...'
  ];
  let msgIdx = 0;
  const msgInterval = setInterval(() => {
    msgIdx++;
    if (msgIdx < messages.length) {
      document.getElementById('loadingText').textContent = messages[msgIdx];
    }
  }, 800);

  try {
    // Build POST payload
    const geo = api.georef || {};
    const payload = {
      direccion: formData.address,
      primera_direccion_ingresada: formData.address,
      ciudad: formData.cityName || formData.city,
      pais: 'CO',
      area: formData.area || 80,
      banos: formData.bathrooms,
      estrato: formData.stratum,
      garajes: formData.garages,
      num_habitaciones: formData.rooms,
      anos_antiguedad: formData.age,
      fuente_id: 7,
      tipo_inmueble_id: formData.propertyType,
      tipo_negocio_id: 1,
      ask_price: 0,
      terms_accepted: true,
      blacklist: 0,
      fuera_de_la_zona: 0,
      descartado_por_inmueble: 0,
      descartado_por_ultimo_piso_sin_ascensor: 0,
      descartado_por_antiguedad: 0,
      // Optional enrichment
      nombre_o_inmobiliaria: formData.name || 'Habimetro User',
      telefono: formData.phone || '',
      correo: formData.email || '',
      agente: 'Habimetro Nuevo',
      num_ascensores: formData.elevator,
      num_piso: formData.floor || 0,
      balcon: formData.balcony,
      terraza: formData.terrace,
      deposito: formData.storage,
      porteria: formData.doorman,
      remodelado: formData.remodeled,
      vista_exterior: formData.view === 'Exterior' || formData.view === 'Panorámica' ? 1 : 0,
      // From georef
      conjunto_edificio: geo.project || '',
      nombre_conjunto: geo.project || '',
      open_address_input: geo.open_address_input ? 1 : 0,
    };

    // Add DANE code if available
    if (api.daneCode && typeof api.daneCode === 'string') {
      payload.cod_sect = api.daneCode;
    }

    // Add POIs if available
    if (api.pois) {
      payload.places_of_interest = { result: api.pois, success: true };
    }

    // POST habimetro
    const postRes = await HabiAPI.postHabimetro(payload);
    api.postResult = postRes;

    const negocioId = postRes.negocio_id;
    const inmuebleId = postRes.inmueble_id;

    if (!negocioId || !inmuebleId) {
      throw new Error('POST habimetro no devolvió IDs: ' + JSON.stringify(postRes));
    }

    // GET habimetro result
    const result = await HabiAPI.getHabimetro(negocioId, inmuebleId);
    api.habimetro = result;

    clearInterval(msgInterval);
    showResults();

  } catch (e) {
    clearInterval(msgInterval);
    console.error('Submit failed:', e);
    document.getElementById('loadingSection').classList.add('hidden');
    document.getElementById('mainForm').classList.remove('hidden');
    document.getElementById('hero').classList.remove('hidden');
    alert('Error al generar el avalúo: ' + e.message + '\n\nRevisa la consola para más detalles.');
  }
}

// ── Results ──
function showResults() {
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('resultsSection').classList.remove('hidden');

  const data = api.habimetro;
  if (!data) return;

  // Extract nested data — handle both flat and nested formats
  const avaluo = data.avaluo || {};
  const pricing = data.pricing || {};
  const costos = data.costos_transaccionales || [];

  const totalValue = avaluo.venta_valorestimadototal || 0;
  const m2Value = avaluo.venta_valorestimado_mt2 || 0;
  const rentValue = avaluo.arriendo_valorestimadototal || 0;
  const lowerBound = pricing.lower_bound || 0;
  const upperBound = pricing.upper_bound || 0;
  const confidence = pricing.flag_confidence || '—';

  // Main value
  animateValue('resultValue', 0, totalValue, 1200);
  document.getElementById('resultM2').textContent = formatCurrency(m2Value);
  document.getElementById('resultRent').textContent = formatCurrency(rentValue) + '/mes';
  document.getElementById('rangeMin').textContent = formatCurrency(lowerBound);
  document.getElementById('rangeMax').textContent = formatCurrency(upperBound);

  // Confidence
  const confMap = { alta: '🟢 Alta', media: '🟡 Media', baja: '🔴 Baja', no_price: '⚪ Sin precio' };
  document.getElementById('resultConfidence').textContent = confMap[confidence] || confidence;

  // Range marker
  const range = upperBound - lowerBound;
  const pos = range > 0 ? ((totalValue - lowerBound) / range) * 100 : 50;
  document.getElementById('rangeMarker').style.left = Math.min(85, Math.max(15, pos)) + '%';

  // Eligibility
  renderEligibility();

  // Components
  renderPropertyTags();
  setTimeout(() => renderPriceChart(data), 300);
  renderCosts(costos, totalValue);
  setTimeout(() => renderMap(), 400);
  renderPOIs();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderEligibility() {
  const el = document.getElementById('eligibilityCards');
  const disc = api.discarded;

  // get_discarded response: true = enough comparables (viable for MM), false = discarded from MM
  const aplica_mm = disc && disc.response === true;
  // If MM applies, Inmo always applies (MM buybox is 100% inside Inmo buybox)
  // If MM doesn't apply, Inmo still likely applies if property is in a valid city
  const aplica_inmo = aplica_mm || (api.georef && api.georef.city_id);
  // Edge case: no city, no georef = ninguno
  const aplica_ninguno = !aplica_mm && !aplica_inmo;

  let html = '';

  if (aplica_mm && aplica_inmo) {
    // Caso 1: Ambos productos
    html = `
      <div class="elig-card elig-card--mm">
        <span class="elig-card__badge">Aplica Market Maker</span>
        <h3 class="elig-card__title">Te compramos tu casa en 10 días</h3>
        <p class="elig-card__desc">Tu inmueble califica para compra directa por Habi. Recibe una oferta y ten tu dinero en efectivo en tiempo récord.</p>
        <div class="elig-card__highlights">
          <span class="elig-card__highlight">10 días</span>
          <span class="elig-card__highlight">Pago en efectivo</span>
          <span class="elig-card__highlight">Sin intermediarios</span>
        </div>
        <a href="#" class="elig-card__cta">Quiero una oferta de compra</a>
      </div>
      <div class="elig-card elig-card--inmo">
        <span class="elig-card__badge">Aplica Inmobiliaria</span>
        <h3 class="elig-card__title">O véndela al mejor precio del mercado</h3>
        <p class="elig-card__desc">Publicamos tu inmueble en la red de brokers más grande del país. Tú pones el precio, nosotros encontramos al comprador.</p>
        <div class="elig-card__highlights">
          <span class="elig-card__highlight">Mejor precio</span>
          <span class="elig-card__highlight">Red de brokers</span>
          <span class="elig-card__highlight">Acompañamiento completo</span>
        </div>
        <a href="#" class="elig-card__cta">Quiero vender con Habi</a>
      </div>
    `;
  } else if (aplica_inmo) {
    // Caso 2: Solo Inmobiliaria
    html = `
      <div class="elig-card elig-card--inmo">
        <span class="elig-card__badge">Aplica Inmobiliaria</span>
        <h3 class="elig-card__title">Vendemos tu casa con la red de brokers más grande del país</h3>
        <p class="elig-card__desc">Captamos tu inmueble y lo conectamos con miles de compradores a través de nuestra red. Tú pones el precio, nosotros nos encargamos del resto.</p>
        <div class="elig-card__highlights">
          <span class="elig-card__highlight">Mejor precio</span>
          <span class="elig-card__highlight">Red de brokers</span>
          <span class="elig-card__highlight">Acompañamiento completo</span>
        </div>
        <a href="#" class="elig-card__cta">Quiero vender con Habi</a>
      </div>
    `;
    el.classList.add('eligibility--single');
  } else {
    // Caso 3: Ninguno
    html = `
      <div class="elig-card elig-card--none">
        <span class="elig-card__badge">Fuera de cobertura</span>
        <h3 class="elig-card__title">Tu inmueble está fuera de nuestra cobertura actual</h3>
        <p class="elig-card__desc">Por ahora no operamos en esta zona, pero estamos creciendo. Déjanos tus datos y te contactaremos cuando lleguemos a tu ciudad.</p>
        <div class="elig-card__highlights">
          <span class="elig-card__highlight">Cobertura en expansión</span>
        </div>
      </div>
    `;
    el.classList.add('eligibility--single');
  }

  el.innerHTML = html;
}

function renderPropertyTags() {
  const chars = api.habimetro?.caracteristicas || {};
  const tags = [
    { label: 'Dirección', value: chars.direccion || formData.address },
    { label: 'Ciudad', value: chars.ciudad || formData.cityName || formData.city },
    { label: 'Tipo', value: formData.propertyType === 1 ? 'Apartamento' : 'Casa' },
    { label: 'Área', value: (chars.area || formData.area || 80) + ' m²' },
    { label: 'Hab.', value: chars.num_habitaciones || formData.rooms },
    { label: 'Baños', value: chars.banos || formData.bathrooms },
    { label: 'Garajes', value: chars.garajes ?? formData.garages },
    { label: 'Estrato', value: chars.estrato || formData.stratum },
    { label: 'Antigüedad', value: (chars.anos_antiguedad || formData.age || 0) + ' años' }
  ];
  document.getElementById('propertyTags').innerHTML = tags.map(t =>
    `<span class="property-tag"><strong>${t.value}</strong> ${t.label}</span>`
  ).join('');
}

function renderPriceChart(data) {
  const ctx = document.getElementById('priceChart').getContext('2d');

  // Normalize historic data
  const ventaRaw = data.historico_precio_venta || data.historico_precios || [];
  const arriendoRaw = data.historico_precio_arriendo || data.historico_arriendos || [];
  const vd = normalizeHistoric(ventaRaw);
  const ad = normalizeHistoric(arriendoRaw);

  if (vd.length === 0) {
    document.getElementById('priceChart').parentElement.innerHTML = '<p style="text-align:center;color:#949494;padding:40px">Sin datos históricos disponibles</p>';
    return;
  }

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: vd.map(d => `${(d.trimester || '').substring(0, 3)} ${(d.year || '').substring(2)}`),
      datasets: [
        {
          label: 'Valor de venta',
          data: vd.map(d => d.value),
          borderColor: '#7C01FF',
          backgroundColor: 'rgba(124,1,255,0.06)',
          fill: true, tension: 0.4, pointRadius: 4,
          pointBackgroundColor: '#7C01FF', borderWidth: 2.5, yAxisID: 'y'
        },
        {
          label: 'Arriendo estimado',
          data: ad.map(d => d.value),
          borderColor: '#00C29C',
          backgroundColor: 'rgba(0,194,156,0.06)',
          fill: true, tension: 0.4, pointRadius: 3,
          pointBackgroundColor: '#00C29C', borderWidth: 2,
          borderDash: [5, 3], yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + formatCurrency(c.parsed.y) } }
      },
      scales: {
        y: { position: 'left', ticks: { callback: v => '$' + (v / 1e6).toFixed(0) + 'M', font: { size: 10 }, color: '#6E6B75' }, grid: { color: 'rgba(0,0,0,0.04)' } },
        y1: { position: 'right', ticks: { callback: v => '$' + (v / 1e6).toFixed(1) + 'M', font: { size: 10 }, color: '#00C29C' }, grid: { drawOnChartArea: false } },
        x: { ticks: { font: { size: 10 }, color: '#6E6B75', maxRotation: 45 }, grid: { display: false } }
      }
    }
  });
}

function renderCosts(costos, totalValue) {
  const el = document.getElementById('costsTable');
  if (!costos || costos.length === 0) {
    el.innerHTML = '<p style="color:#949494">Sin información de costos</p>';
    return;
  }
  let totalPct = 0;
  el.innerHTML = costos.map(c => {
    totalPct += c.tarifa;
    return `<div class="cost-row">
      <span class="cost-row__label">${c.titulo} (${c.tarifa}%)</span>
      <span class="cost-row__value">${formatCurrency(Math.round(totalValue * c.tarifa / 100))}</span>
    </div>`;
  }).join('');
  document.getElementById('costsNet').innerHTML = `
    <span class="costs-net__label">Valor neto estimado</span>
    <span class="costs-net__value">${formatCurrency(Math.round(totalValue * (1 - totalPct / 100)))}</span>
  `;
}

function renderMap() {
  const geo = api.georef || {};
  const lat = geo.latitude;
  const lng = geo.longitude;
  if (!lat || !lng) {
    document.getElementById('mapContainer').innerHTML = '<p style="text-align:center;color:#949494;padding:40px">Sin coordenadas disponibles</p>';
    return;
  }

  const map = L.map('mapContainer').setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);

  L.marker([lat, lng], {
    icon: L.divIcon({ html: '<div style="background:#7C01FF;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>', iconSize: [16, 16], className: '' })
  }).addTo(map).bindPopup(`<strong>${formData.address}</strong><br>${geo.project || ''}`);

  const pois = api.pois;
  if (pois && Array.isArray(pois)) {
    const colors = { 'centros-comerciales': '#FF8C00', 'parques': '#00C29C', 'clinicas': '#E53935', 'transporte': '#1976D2', 'policia': '#6E6B75' };
    pois.forEach(cat => {
      if (cat.result) {
        cat.result.forEach(p => {
          L.marker([p.lat, p.lng], {
            icon: L.divIcon({ html: `<div style="background:${colors[cat.id] || '#7C01FF'};width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>`, iconSize: [10, 10], className: '' })
          }).addTo(map).bindPopup(`<strong>${p.name}</strong><br>${cat.label} · ${p.distance}m`);
        });
      }
    });
  }
}

function renderPOIs() {
  const el = document.getElementById('poisGrid');
  const pois = api.pois;
  if (!pois || !Array.isArray(pois)) {
    el.innerHTML = '<p style="color:#949494">Sin datos del entorno</p>';
    return;
  }
  let html = '';
  pois.forEach(cat => {
    if (cat.result) {
      cat.result.slice(0, 1).forEach(p => {
        html += `<div class="poi-card">
          <div class="poi-card__category">${cat.icon || '📍'} ${cat.label}</div>
          <div class="poi-card__name">${p.name}</div>
          <div class="poi-card__meta">${p.distance}m · ${p.walking_time} min caminando</div>
        </div>`;
      });
    }
  });
  el.innerHTML = html || '<p style="color:#949494">Sin puntos de interés cercanos</p>';
}

// ── Utilities ──
function animateValue(id, start, end, duration) {
  const el = document.getElementById(id);
  if (!end) { el.textContent = '$0'; return; }
  const range = end - start;
  const t0 = performance.now();
  function update(t) {
    const p = Math.min((t - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatCurrency(Math.round(start + range * eased));
    if (p < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function formatCurrency(n) {
  return '$' + new Intl.NumberFormat('es-CO').format(n);
}

function restart() {
  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('hero').classList.remove('hidden');
  document.getElementById('mainForm').classList.remove('hidden');
  document.getElementById('panelCards').innerHTML = '';
  document.getElementById('eligibilityCards').innerHTML = '';
  document.getElementById('eligibilityCards').classList.remove('eligibility--single');

  // Reset API state
  api.georef = null; api.catastral = null; api.daneCode = null;
  api.pois = null; api.medianZone = null; api.discarded = null;
  api.postResult = null; api.habimetro = null;

  document.getElementById('panelCol').querySelector('.panel').insertAdjacentHTML('afterbegin', `
    <div class="panel__empty" id="panelEmpty">
      <div class="panel__empty-icon">🏡</div>
      <h3>Tu avalúo en tiempo real</h3>
      <p>A medida que completes los pasos, aquí verás información valiosa sobre tu inmueble y su entorno.</p>
    </div>
  `);
  goToStep(1);
}
