# APIs Habimetro — Inventario completo

## Flujo principal

### PASO 1 — Ubicación

**1a. Ciudades disponibles**
- **GET** `https://apiv2.habi.co/web-global-api-georeferencing/get_available_cities_list`
- **API Key**: `NNKqq91UqB7mUraiwkmgm2b53FOSzeh14wDYPqvQ`
- **Params**: `utm`, `id_funnel_type`
- **Respuesta**: lista de 28 ciudades con ciudad_id, coordenadas, area_metropolitana

**1b. Georeferenciación (versión formulario web — estado del arte)**
- **GET** `https://apiv2.habi.co/web-global-api-georeferencing/get_georeferencing_by_address`
- **API Key**: `NNKqq91UqB7mUraiwkmgm2b53FOSzeh14wDYPqvQ`
- **Params**: `country`, `property_type_id`, `city_name`, `address`, `open_address_input`, `suggestions`
- **Respuesta**: lot_id, lat/lon, median_zone_id, proyecto, suggested_addresses, georeferencing_flag
- **Nota**: Mejor que la API legacy (habi-georeferencing-api). Incluye sugerencias de dirección.

**1c. Info zona mediana**
- **GET** `https://apiv2.habi.co/web-global-api-georeferencing/get_median_zone_info`
- **API Key**: `NNKqq91UqB7mUraiwkmgm2b53FOSzeh14wDYPqvQ`
- **Params**: `country`, `median_zone_id`, `month_range`
- **Respuesta**: leads_cierres, leads_cierres_desistimiento

### PASO 2 — Tipo de inmueble + datos catastrales

**2a. Detalles geo del inmueble (datos catastrales)**
- **GET** `https://apiv2.habi.co/habimetro-api/get_property_geo_details`
- **API Key**: `cTs075w7M48XrCr9LAES74HIJocDnHRM5uwFXURP`
- **Params**: `address`
- **Respuesta**: torres, pisos, apartamentos, area_catastro por unidad, vetustez (año construcción), direccion_catastral

**2b. Código DANE**
- **GET** `https://apiv2.habi.co/habimetro-api/get_dane_code`
- **API Key**: `cTs075w7M48XrCr9LAES74HIJocDnHRM5uwFXURP`
- **Params**: `latitude`, `longitude`
- **Respuesta**: cod_sect (código sectorial DANE)

### PASO 3-4 — Características y detalles (entorno)

**3a. Puntos de interés**
- **GET** `https://apiv2.habi.co/habi-habimetro-globack-container/get_places_of_interest`
- **API Key**: `5yqceawUSMauWBRvywJYLoRj5wlAXYKaxWCjEV06`
- **Params**: `country`, `latitude`, `longitude`
- **Respuesta**: centros comerciales, parques, clínicas, transporte público, estaciones de policía — con distancia, tiempo caminando/auto

**3b. Validación de descarte**
- **GET** `https://apiv2.habi.co/habi-habimetro-globack-container/get_discarded`
- **API Key**: `5yqceawUSMauWBRvywJYLoRj5wlAXYKaxWCjEV06`
- **Params**: `country`, `area`, `property_type_id`, `stratum`, `city_id`, `latitude`, `longitude`, `median_zone_id`, `years_old`
- **Respuesta**: result (true/false — si Habi descartaría el inmueble)

### PASO 5 — Datos personales → Crear lead + Avalúo

**5a. Crear lead y generar avalúo (PRINCIPAL)**
- **POST** `https://apiv2.habi.co/habi-habimetro-globack-container/post_habimetro`
- **API Key**: `cTs075w7M48XrCr9LAES74HIJocDnHRM5uwFXURP`
- **Payload obligatorio**:
  - `direccion` (str) — "Carrera 94 #6c - 77"
  - `ciudad` (str) — "Bogotá"
  - `pais` (str) — "CO"
  - `estrato` (int) — 1-6
  - `tipo_inmueble_id` (int) — 1=Apartamento, 2=Casa
  - `tipo_negocio_id` (int) — 1-5
  - `garajes` (int)
  - `fuente_id` (int) — fuente del formulario
  - `area` (int) — m² construidos
  - `ask_price` (int) — precio que pide el cliente (puede ser 0)
  - `terms_accepted` (bool)
  - `anos_antiguedad` (int)
  - `num_habitaciones` (int)
  - `banos` (int)
- **Payload opcional**:
  - `cod_sect` (str) — código DANE
  - `conjunto_edificio` / `nombre_conjunto` (str)
  - `tipo_parqueadero` (str) — "comunal" o null
  - `num_ascensores` (int) — solo apto
  - `num_piso` (int) — solo apto
  - `ultimo_piso` (int) — 0 o 1
  - `agente` (str) — quién creó el lead
  - `nombre_o_inmobiliaria` (str) — nombre del usuario
  - `telefono` (str)
  - `email` (str)
- **Lo que hace internamente**: georeferencia → DANE → amenities → crea inmueble en BD → evalúa descartes → pricing → avalúo
- **Respuesta**: `negocio_id`, `inmueble_id`, `contacto_id`

**5b. Consultar resultado del avalúo**
- **GET** `https://apiv2.habi.co/habi-habimetro-globack-container/get_habimetro`
- **API Key**: `5yqceawUSMauWBRvywJYLoRj5wlAXYKaxWCjEV06`
- **Params**: `negocio_id`, `inmueble_id` (los que devuelve post_habimetro)
- **Respuesta**: pricing (lower/upper bound, confianza), avalúo (valor total, valor m², arriendo), histórico precios, property_details, property_characteristics, costos_transaccionales, comparable, cadastre_information, places_of_interest

## Opcionales / post-resultado

**Comparables (ENCRIPTADO)**
- **GET** `https://api-habimetro-sitios-descartados-g7m25ztakq-uc.a.run.app/get_comparables`
- **API Key**: `wXBsu8ez8cOXvbzwc5eP`
- **Params**: `basic_funnel` (JSON con latitud, longitud, lote_id)
- **Respuesta**: string encriptado con Fernet — necesita clave del frontend para desencriptar

**Registrar vista (WRITE — no usar sin necesidad)**
- **PUT** `https://apiv2.habi.co/habi-habimetro-globack-container/put_habimetro_views`
- **API Key**: `5yqceawUSMauWBRvywJYLoRj5wlAXYKaxWCjEV06`
- Solo registra que el usuario vio el resultado.

**Registrar descarte (WRITE — no usar)**
- **POST** `https://apiv2.habi.co/habi-api-forms/post_property_discarded`
- **API Key**: `Bhk1n1mcAO3t4Er9ukVN07b2ooiK4b6f2Tz6a9ih`
- Solo registra que un inmueble fue descartado. No devuelve datos útiles.

## API legacy (NO usar en nuevo habimetro)

**Georeferenciación vieja**
- **POST** `https://apiv2.habi.co/habi-georeferencing-api/api_georeferenciacion`
- **API Key**: `MTBxKtN7bk16ETfwX9NgM35CemZCKBGY5g6ECUiQ`
- Reemplazada por `web-global-api-georeferencing/get_georeferencing_by_address`

## Repos (clonados en ~/habi/repos/)

| Repo | basePath API | Qué contiene |
|------|-------------|--------------|
| `habimetro-api` | `habimetro-api` | get_dane_code, get_property_count_by_area |
| `habimetro-api` (container) | `habimetro-api-container` | **post_habimetro**, **get_habimetro**, get_property_geo_details, get_catastral_information, put_habimetro |
| `web-global-api-georeferencing` | `web-global-api-georeferencing` | georeferenciación nueva, ciudades, zona mediana |
| `habi-georeferencing-api` | `habi-georeferencing-api` | georeferenciación legacy (NO usar) |
| `habi-api-forms` | `habi-api-forms` | post_property_habi_web (creación de leads web), post_property_discarded |
| `api-habimetro-sitios-descartados` | Cloud Run | comparables encriptados |
