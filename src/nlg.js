/**
 * Weather Widget - Croatian Natural Language Generation
 *
 * Generates varied weather descriptions using:
 * - Template patterns with typed slots
 * - Synonym pools with weighted selection
 * - Croatian morphological declension (7 cases, 3 genders)
 * - Weather condition awareness for contextual descriptions
 */

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

// Wind chill calculation parameters
const WIND_CHILL_TEMP_THRESHOLD = 15;
const WIND_CHILL_WIND_THRESHOLD = 2;
const WIND_CHILL_FACTOR = 0.8;
const WIND_CHILL_MAX_ADJUSTMENT = 10;

// Default values for missing data
const DEFAULT_HUMIDITY = 50;

// =============================================================================
// GENERATION COUNTER
// =============================================================================

export let descriptionGeneration = 0;

export function bumpDescriptionGeneration() {
    descriptionGeneration++;
}

// =============================================================================
// EFFECTIVE TEMPERATURE (WIND CHILL)
// =============================================================================

function effectiveTemp(temp, windSpeed) {
    const wind = windSpeed ?? 0;
    if (temp < WIND_CHILL_TEMP_THRESHOLD && wind > WIND_CHILL_WIND_THRESHOLD) {
        return temp - Math.min(wind * WIND_CHILL_FACTOR, WIND_CHILL_MAX_ADJUSTMENT);
    }
    return temp;
}

// =============================================================================
// TIME UTILITIES
// =============================================================================

function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

// =============================================================================
// CROATIAN LEXICON WITH DECLENSIONS
// =============================================================================

const NOUNS = {
    // Weather nouns - masculine
    vjetar: { gender: 'm', nom: 'vjetar', gen: 'vjetra', dat: 'vjetru', acc: 'vjetar', voc: 'vjetre', loc: 'vjetru', ins: 'vjetrom' },
    povjetarac: { gender: 'm', nom: 'povjetarac', gen: 'povjetarca', dat: 'povjetarcu', acc: 'povjetarac', voc: 'povjetarče', loc: 'povjetarcu', ins: 'povjetarcem' },
    mraz: { gender: 'm', nom: 'mraz', gen: 'mraza', dat: 'mrazu', acc: 'mraz', voc: 'mraze', loc: 'mrazu', ins: 'mrazom' },
    dan: { gender: 'm', nom: 'dan', gen: 'dana', dat: 'danu', acc: 'dan', voc: 'dane', loc: 'danu', ins: 'danom' },

    // Weather nouns - feminine
    hladnoća: { gender: 'f', nom: 'hladnoća', gen: 'hladnoće', dat: 'hladnoći', acc: 'hladnoću', voc: 'hladnoćo', loc: 'hladnoći', ins: 'hladnoćom' },
    studen: { gender: 'f', nom: 'studen', gen: 'studeni', dat: 'studeni', acc: 'studen', voc: 'studeni', loc: 'studeni', ins: 'studeni' },
    zima: { gender: 'f', nom: 'zima', gen: 'zime', dat: 'zimi', acc: 'zimu', voc: 'zimo', loc: 'zimi', ins: 'zimom' },
    vrućina: { gender: 'f', nom: 'vrućina', gen: 'vrućine', dat: 'vrućini', acc: 'vrućinu', voc: 'vrućino', loc: 'vrućini', ins: 'vrućinom' },
    toplina: { gender: 'f', nom: 'toplina', gen: 'topline', dat: 'toplini', acc: 'toplinu', voc: 'toplino', loc: 'toplini', ins: 'toplinom' },
    žega: { gender: 'f', nom: 'žega', gen: 'žege', dat: 'žegi', acc: 'žegu', voc: 'žego', loc: 'žegi', ins: 'žegom' },
    sparina: { gender: 'f', nom: 'sparina', gen: 'sparine', dat: 'sparini', acc: 'sparinu', voc: 'sparino', loc: 'sparini', ins: 'sparinom' },
    noć: { gender: 'f', nom: 'noć', gen: 'noći', dat: 'noći', acc: 'noć', voc: 'noći', loc: 'noći', ins: 'noći' },
    večer: { gender: 'f', nom: 'večer', gen: 'večeri', dat: 'večeri', acc: 'večer', voc: 'večeri', loc: 'večeri', ins: 'večeri' },

    // Weather nouns - neuter
    vrijeme: { gender: 'n', nom: 'vrijeme', gen: 'vremena', dat: 'vremenu', acc: 'vrijeme', voc: 'vrijeme', loc: 'vremenu', ins: 'vremenom' },
    jutro: { gender: 'n', nom: 'jutro', gen: 'jutra', dat: 'jutru', acc: 'jutro', voc: 'jutro', loc: 'jutru', ins: 'jutrom' },
};

const ADJECTIVES = {
    // Cold adjectives
    hladan: {
        m: { nom: 'hladan', gen: 'hladnog', dat: 'hladnom', acc: 'hladan', loc: 'hladnom', ins: 'hladnim' },
        f: { nom: 'hladna', gen: 'hladne', dat: 'hladnoj', acc: 'hladnu', loc: 'hladnoj', ins: 'hladnom' },
        n: { nom: 'hladno', gen: 'hladnog', dat: 'hladnom', acc: 'hladno', loc: 'hladnom', ins: 'hladnim' },
    },
    studen: {
        m: { nom: 'studen', gen: 'studenog', dat: 'studenom', acc: 'studen', loc: 'studenom', ins: 'studenim' },
        f: { nom: 'studena', gen: 'studene', dat: 'studenoj', acc: 'studenu', loc: 'studenoj', ins: 'studenom' },
        n: { nom: 'studeno', gen: 'studenog', dat: 'studenom', acc: 'studeno', loc: 'studenom', ins: 'studenim' },
    },
    leden: {
        m: { nom: 'leden', gen: 'ledenog', dat: 'ledenom', acc: 'leden', loc: 'ledenom', ins: 'ledenim' },
        f: { nom: 'ledena', gen: 'ledene', dat: 'ledenoj', acc: 'ledenu', loc: 'ledenoj', ins: 'ledenom' },
        n: { nom: 'ledeno', gen: 'ledenog', dat: 'ledenom', acc: 'ledeno', loc: 'ledenom', ins: 'ledenim' },
    },
    prohladan: {
        m: { nom: 'prohladan', gen: 'prohladnog', dat: 'prohladnom', acc: 'prohladan', loc: 'prohladnom', ins: 'prohladnim' },
        f: { nom: 'prohladna', gen: 'prohladne', dat: 'prohladnoj', acc: 'prohladnu', loc: 'prohladnoj', ins: 'prohladnom' },
        n: { nom: 'prohladno', gen: 'prohladnog', dat: 'prohladnom', acc: 'prohladno', loc: 'prohladnom', ins: 'prohladnim' },
    },
    oštar: {
        m: { nom: 'oštar', gen: 'oštrog', dat: 'oštrom', acc: 'oštar', loc: 'oštrom', ins: 'oštrim' },
        f: { nom: 'oštra', gen: 'oštre', dat: 'oštroj', acc: 'oštru', loc: 'oštroj', ins: 'oštrom' },
        n: { nom: 'oštro', gen: 'oštrog', dat: 'oštrom', acc: 'oštro', loc: 'oštrom', ins: 'oštrim' },
    },
    prodoran: {
        m: { nom: 'prodoran', gen: 'prodornog', dat: 'prodornom', acc: 'prodoran', loc: 'prodornom', ins: 'prodornim' },
        f: { nom: 'prodorna', gen: 'prodorne', dat: 'prodornoj', acc: 'prodornu', loc: 'prodornoj', ins: 'prodornom' },
        n: { nom: 'prodorno', gen: 'prodornog', dat: 'prodornom', acc: 'prodorno', loc: 'prodornom', ins: 'prodornim' },
    },
    zimski: {
        m: { nom: 'zimski', gen: 'zimskog', dat: 'zimskom', acc: 'zimski', loc: 'zimskom', ins: 'zimskim' },
        f: { nom: 'zimska', gen: 'zimske', dat: 'zimskoj', acc: 'zimsku', loc: 'zimskoj', ins: 'zimskom' },
        n: { nom: 'zimsko', gen: 'zimskog', dat: 'zimskom', acc: 'zimsko', loc: 'zimskom', ins: 'zimskim' },
    },

    // Cool/fresh adjectives
    svjež: {
        m: { nom: 'svjež', gen: 'svježeg', dat: 'svježem', acc: 'svjež', loc: 'svježem', ins: 'svježim' },
        f: { nom: 'svježa', gen: 'svježe', dat: 'svježoj', acc: 'svježu', loc: 'svježoj', ins: 'svježom' },
        n: { nom: 'svježe', gen: 'svježeg', dat: 'svježem', acc: 'svježe', loc: 'svježem', ins: 'svježim' },
    },
    osvježavajuć: {
        m: { nom: 'osvježavajuć', gen: 'osvježavajućeg', dat: 'osvježavajućem', acc: 'osvježavajuć', loc: 'osvježavajućem', ins: 'osvježavajućim' },
        f: { nom: 'osvježavajuća', gen: 'osvježavajuće', dat: 'osvježavajućoj', acc: 'osvježavajuću', loc: 'osvježavajućoj', ins: 'osvježavajućom' },
        n: { nom: 'osvježavajuće', gen: 'osvježavajućeg', dat: 'osvježavajućem', acc: 'osvježavajuće', loc: 'osvježavajućem', ins: 'osvježavajućim' },
    },

    // Mild adjectives
    blag: {
        m: { nom: 'blag', gen: 'blagog', dat: 'blagom', acc: 'blag', loc: 'blagom', ins: 'blagim' },
        f: { nom: 'blaga', gen: 'blage', dat: 'blagoj', acc: 'blagu', loc: 'blagoj', ins: 'blagom' },
        n: { nom: 'blago', gen: 'blagog', dat: 'blagom', acc: 'blago', loc: 'blagom', ins: 'blagim' },
    },
    umjeren: {
        m: { nom: 'umjeren', gen: 'umjerenog', dat: 'umjerenom', acc: 'umjeren', loc: 'umjerenom', ins: 'umjerenim' },
        f: { nom: 'umjerena', gen: 'umjerene', dat: 'umjerenoj', acc: 'umjerenu', loc: 'umjerenoj', ins: 'umjerenom' },
        n: { nom: 'umjereno', gen: 'umjerenog', dat: 'umjerenom', acc: 'umjereno', loc: 'umjerenom', ins: 'umjerenim' },
    },
    ugodan: {
        m: { nom: 'ugodan', gen: 'ugodnog', dat: 'ugodnom', acc: 'ugodan', loc: 'ugodnom', ins: 'ugodnim' },
        f: { nom: 'ugodna', gen: 'ugodne', dat: 'ugodnoj', acc: 'ugodnu', loc: 'ugodnoj', ins: 'ugodnom' },
        n: { nom: 'ugodno', gen: 'ugodnog', dat: 'ugodnom', acc: 'ugodno', loc: 'ugodnom', ins: 'ugodnim' },
    },
    prijatan: {
        m: { nom: 'prijatan', gen: 'prijatnog', dat: 'prijatnom', acc: 'prijatan', loc: 'prijatnom', ins: 'prijatnim' },
        f: { nom: 'prijatna', gen: 'prijatne', dat: 'prijatnoj', acc: 'prijatnu', loc: 'prijatnoj', ins: 'prijatnom' },
        n: { nom: 'prijatno', gen: 'prijatnog', dat: 'prijatnom', acc: 'prijatno', loc: 'prijatnom', ins: 'prijatnim' },
    },
    lijep: {
        m: { nom: 'lijep', gen: 'lijepog', dat: 'lijepom', acc: 'lijep', loc: 'lijepom', ins: 'lijepim' },
        f: { nom: 'lijepa', gen: 'lijepe', dat: 'lijepoj', acc: 'lijepu', loc: 'lijepoj', ins: 'lijepom' },
        n: { nom: 'lijepo', gen: 'lijepog', dat: 'lijepom', acc: 'lijepo', loc: 'lijepom', ins: 'lijepim' },
    },

    // Warm adjectives
    topao: {
        m: { nom: 'topao', gen: 'toplog', dat: 'toplom', acc: 'topao', loc: 'toplom', ins: 'toplim' },
        f: { nom: 'topla', gen: 'tople', dat: 'toploj', acc: 'toplu', loc: 'toploj', ins: 'toplom' },
        n: { nom: 'toplo', gen: 'toplog', dat: 'toplom', acc: 'toplo', loc: 'toplom', ins: 'toplim' },
    },

    // Hot adjectives
    vruć: {
        m: { nom: 'vruć', gen: 'vrućeg', dat: 'vrućem', acc: 'vruć', loc: 'vrućem', ins: 'vrućim' },
        f: { nom: 'vruća', gen: 'vruće', dat: 'vrućoj', acc: 'vruću', loc: 'vrućoj', ins: 'vrućom' },
        n: { nom: 'vruće', gen: 'vrućeg', dat: 'vrućem', acc: 'vruće', loc: 'vrućem', ins: 'vrućim' },
    },
    vreo: {
        m: { nom: 'vreo', gen: 'vrelog', dat: 'vrelom', acc: 'vreo', loc: 'vrelom', ins: 'vrelim' },
        f: { nom: 'vrela', gen: 'vrele', dat: 'vreloj', acc: 'vrelu', loc: 'vreloj', ins: 'vrelom' },
        n: { nom: 'vrelo', gen: 'vrelog', dat: 'vrelom', acc: 'vrelo', loc: 'vrelom', ins: 'vrelim' },
    },
    žarki: {
        m: { nom: 'žarki', gen: 'žarkog', dat: 'žarkom', acc: 'žarki', loc: 'žarkom', ins: 'žarkim' },
        f: { nom: 'žarka', gen: 'žarke', dat: 'žarkoj', acc: 'žarku', loc: 'žarkoj', ins: 'žarkom' },
        n: { nom: 'žarko', gen: 'žarkog', dat: 'žarkom', acc: 'žarko', loc: 'žarkom', ins: 'žarkim' },
    },
    sparni: {
        m: { nom: 'sparni', gen: 'sparnog', dat: 'sparnom', acc: 'sparni', loc: 'sparnom', ins: 'sparnim' },
        f: { nom: 'sparna', gen: 'sparne', dat: 'sparnoj', acc: 'sparnu', loc: 'sparnoj', ins: 'sparnom' },
        n: { nom: 'sparno', gen: 'sparnog', dat: 'sparnom', acc: 'sparno', loc: 'sparnom', ins: 'sparnim' },
    },

    // Humidity adjectives
    vlažan: {
        m: { nom: 'vlažan', gen: 'vlažnog', dat: 'vlažnom', acc: 'vlažan', loc: 'vlažnom', ins: 'vlažnim' },
        f: { nom: 'vlažna', gen: 'vlažne', dat: 'vlažnoj', acc: 'vlažnu', loc: 'vlažnoj', ins: 'vlažnom' },
        n: { nom: 'vlažno', gen: 'vlažnog', dat: 'vlažnom', acc: 'vlažno', loc: 'vlažnom', ins: 'vlažnim' },
    },

    // Wind adjectives
    vjetrovit: {
        m: { nom: 'vjetrovit', gen: 'vjetrovitog', dat: 'vjetrovitom', acc: 'vjetrovit', loc: 'vjetrovitom', ins: 'vjetrovitim' },
        f: { nom: 'vjetrovita', gen: 'vjetrovite', dat: 'vjetrovitoj', acc: 'vjetrovitu', loc: 'vjetrovitoj', ins: 'vjetrovitom' },
        n: { nom: 'vjetrovito', gen: 'vjetrovitog', dat: 'vjetrovitom', acc: 'vjetrovito', loc: 'vjetrovitom', ins: 'vjetrovitim' },
    },
    lagan: {
        m: { nom: 'lagan', gen: 'laganog', dat: 'laganom', acc: 'lagan', loc: 'laganom', ins: 'laganim' },
        f: { nom: 'lagana', gen: 'lagane', dat: 'laganoj', acc: 'laganu', loc: 'laganoj', ins: 'laganom' },
        n: { nom: 'lagano', gen: 'laganog', dat: 'laganom', acc: 'lagano', loc: 'laganom', ins: 'laganim' },
    },
    jak: {
        m: { nom: 'jak', gen: 'jakog', dat: 'jakom', acc: 'jak', loc: 'jakom', ins: 'jakim' },
        f: { nom: 'jaka', gen: 'jake', dat: 'jakoj', acc: 'jaku', loc: 'jakoj', ins: 'jakom' },
        n: { nom: 'jako', gen: 'jakog', dat: 'jakom', acc: 'jako', loc: 'jakom', ins: 'jakim' },
    },

    // Sky adjectives
    vedar: {
        m: { nom: 'vedar', gen: 'vedrog', dat: 'vedrom', acc: 'vedar', loc: 'vedrom', ins: 'vedrim' },
        f: { nom: 'vedra', gen: 'vedre', dat: 'vedroj', acc: 'vedru', loc: 'vedroj', ins: 'vedrom' },
        n: { nom: 'vedro', gen: 'vedrog', dat: 'vedrom', acc: 'vedro', loc: 'vedrom', ins: 'vedrim' },
    },
    sunčan: {
        m: { nom: 'sunčan', gen: 'sunčanog', dat: 'sunčanom', acc: 'sunčan', loc: 'sunčanom', ins: 'sunčanim' },
        f: { nom: 'sunčana', gen: 'sunčane', dat: 'sunčanoj', acc: 'sunčanu', loc: 'sunčanoj', ins: 'sunčanom' },
        n: { nom: 'sunčano', gen: 'sunčanog', dat: 'sunčanom', acc: 'sunčano', loc: 'sunčanom', ins: 'sunčanim' },
    },
    oblačan: {
        m: { nom: 'oblačan', gen: 'oblačnog', dat: 'oblačnom', acc: 'oblačan', loc: 'oblačnom', ins: 'oblačnim' },
        f: { nom: 'oblačna', gen: 'oblačne', dat: 'oblačnoj', acc: 'oblačnu', loc: 'oblačnoj', ins: 'oblačnom' },
        n: { nom: 'oblačno', gen: 'oblačnog', dat: 'oblačnom', acc: 'oblačno', loc: 'oblačnom', ins: 'oblačnim' },
    },
    tmuran: {
        m: { nom: 'tmuran', gen: 'tmurnog', dat: 'tmurnom', acc: 'tmuran', loc: 'tmurnom', ins: 'tmurnim' },
        f: { nom: 'tmurna', gen: 'tmurne', dat: 'tmurnoj', acc: 'tmurnu', loc: 'tmurnoj', ins: 'tmurnom' },
        n: { nom: 'tmurno', gen: 'tmurnog', dat: 'tmurnom', acc: 'tmurno', loc: 'tmurnom', ins: 'tmurnim' },
    },
    siv: {
        m: { nom: 'siv', gen: 'sivog', dat: 'sivom', acc: 'siv', loc: 'sivom', ins: 'sivim' },
        f: { nom: 'siva', gen: 'sive', dat: 'sivoj', acc: 'sivu', loc: 'sivoj', ins: 'sivom' },
        n: { nom: 'sivo', gen: 'sivog', dat: 'sivom', acc: 'sivo', loc: 'sivom', ins: 'sivim' },
    },
};

// =============================================================================
// SYNONYM POOLS
// =============================================================================

const SYNONYMS = {
    cold_noun: [
        { word: 'hladnoća', weight: 1.0 },
        { word: 'studen', weight: 0.7 },
        { word: 'zima', weight: 0.8 },
        { word: 'mraz', weight: 0.6, maxTemp: -2 },
    ],
    hot_noun: [
        { word: 'vrućina', weight: 1.0 },
        { word: 'toplina', weight: 0.9 },
        { word: 'žega', weight: 0.7, minTemp: 33 },
        { word: 'sparina', weight: 0.6, minHumidity: 60 },
    ],
    cold_adj: [
        { word: 'hladan', weight: 1.0 },
        { word: 'studen', weight: 0.7, maxTemp: 0 },
        { word: 'leden', weight: 0.5, maxTemp: -3 },
        { word: 'prohladan', weight: 0.9, minTemp: 5 },
        { word: 'oštar', weight: 0.6, minWind: 3 },
        { word: 'prodoran', weight: 0.5, minWind: 4 },
        { word: 'zimski', weight: 0.6 },
    ],
    cool_adj: [
        { word: 'svjež', weight: 1.0 },
        { word: 'prohladan', weight: 0.8 },
        { word: 'osvježavajuć', weight: 0.6 },
    ],
    mild_adj: [
        { word: 'blag', weight: 1.0 },
        { word: 'umjeren', weight: 0.8 },
        { word: 'ugodan', weight: 0.9 },
        { word: 'prijatan', weight: 0.7 },
        { word: 'lijep', weight: 0.6 },
    ],
    warm_adj: [
        { word: 'topao', weight: 1.0 },
        { word: 'ugodan', weight: 0.7 },
        { word: 'prijatan', weight: 0.6 },
        { word: 'lijep', weight: 0.5 },
    ],
    hot_adj: [
        { word: 'vruć', weight: 1.0 },
        { word: 'vreo', weight: 0.7 },
        { word: 'žarki', weight: 0.5, minTemp: 35 },
        { word: 'sparni', weight: 0.6, minHumidity: 60 },
    ],
    wind_noun: [
        { word: 'vjetar', weight: 1.0 },
        { word: 'povjetarac', weight: 0.8, maxWind: 5 },
    ],
    wind_adj: [
        { word: 'vjetrovit', weight: 1.0 },
        { word: 'lagan', weight: 0.8, maxWind: 4 },
        { word: 'jak', weight: 0.7, minWind: 6 },
        { word: 'oštar', weight: 0.6, minWind: 5 },
        { word: 'prodoran', weight: 0.5, minWind: 6 },
    ],
    humid_adj: [
        { word: 'vlažan', weight: 1.0 },
        { word: 'prodoran', weight: 0.7, maxTemp: 12 },
        { word: 'sparni', weight: 0.7, minTemp: 25 },
    ],
    weather_noun: [
        { word: 'vrijeme', weight: 1.0 },
        { word: 'dan', weight: 0.9 },
    ],
    clear_adj: [
        { word: 'vedar', weight: 1.0 },
        { word: 'sunčan', weight: 0.9 },
    ],
    cloudy_adj: [
        { word: 'oblačan', weight: 1.0 },
        { word: 'tmuran', weight: 0.6 },
        { word: 'siv', weight: 0.5 },
    ],
};

// =============================================================================
// TEMPERATURE-BASED TEMPLATES (fallback when no weather code)
// =============================================================================

const TEMPLATES = [
    // FREEZING (-20 to -5)
    { pattern: 'Ledeno', tempRange: [-20, -5], weight: 1.0 },
    { pattern: 'Sibirska zima', tempRange: [-20, -8], weight: 0.6 },
    { pattern: '{cold_adj:nom:m} mraz', tempRange: [-20, -3], weight: 0.8 },
    { pattern: 'Duboki mraz', tempRange: [-20, -5], weight: 0.7 },
    { pattern: 'Jaka zima', tempRange: [-15, -3], weight: 0.8 },
    { pattern: 'Arktička {cold_noun:nom}', tempRange: [-20, -8], weight: 0.5 },
    { pattern: '{cold_noun:nom} ledi kosti', tempRange: [-20, -5], weight: 0.5 },

    // VERY COLD (-5 to 5)
    { pattern: 'Hladno', tempRange: [-5, 5], weight: 1.0 },
    { pattern: 'Studeno', tempRange: [-5, 3], weight: 0.8 },
    { pattern: '{cold_adj:nom:m} {weather_noun:nom}', tempRange: [-5, 5], weight: 0.7 },
    { pattern: 'Zimski dan', tempRange: [-5, 5], weight: 0.8 },
    { pattern: 'Zima je tu', tempRange: [-5, 3], weight: 0.6 },
    { pattern: 'Vrijeme za kaput', tempRange: [-3, 6], weight: 0.6 },
    { pattern: '{cold_adj:nom:n} je vani', tempRange: [-5, 5], weight: 0.7 },
    { pattern: 'Vani je {cold_adj:nom:n}', tempRange: [-5, 5], weight: 0.7 },

    // CHILLY (2 to 10)
    { pattern: 'Prohladno', tempRange: [2, 10], weight: 1.0 },
    { pattern: '{cold_adj:nom:n} i {humid_adj:nom:n}', tempRange: [2, 10], weight: 0.6, minHumidity: 70 },
    { pattern: 'Vrijeme za zimsku jaknu', tempRange: [0, 8], weight: 0.5 },
    { pattern: 'Za debelu vestu', tempRange: [2, 10], weight: 0.5 },
    { pattern: 'Jesen u zraku', tempRange: [5, 12], weight: 0.5 },
    { pattern: '{cold_adj:nom:f} {cold_noun:nom}', tempRange: [0, 8], weight: 0.6 },

    // COOL (8 to 16)
    { pattern: 'Svježe', tempRange: [8, 16], weight: 1.0 },
    { pattern: '{cool_adj:nom:n}', tempRange: [8, 16], weight: 0.9 },
    { pattern: 'Hlađe', tempRange: [8, 14], weight: 0.7 },
    { pattern: 'Vrijeme za džemper', tempRange: [8, 14], weight: 0.5 },
    { pattern: 'Za dugi rukav', tempRange: [10, 16], weight: 0.5 },
    { pattern: '{cool_adj:nom:f} svježina', tempRange: [8, 15], weight: 0.6 },
    { pattern: '{cool_adj:nom:n} je', tempRange: [8, 16], weight: 0.7 },

    // MILD (14 to 20)
    { pattern: 'Blago', tempRange: [14, 20], weight: 1.0 },
    { pattern: '{mild_adj:nom:f} temperatura', tempRange: [14, 20], weight: 0.8 },
    { pattern: 'Umjereno', tempRange: [14, 20], weight: 0.7 },
    { pattern: 'Lagana jaknica dobro dođe', tempRange: [12, 18], weight: 0.4 },
    { pattern: 'Pravo proljetno', tempRange: [14, 20], weight: 0.5 },
    { pattern: '{mild_adj:nom:n} vrijeme', tempRange: [14, 20], weight: 0.7 },

    // PLEASANT (19 to 26)
    { pattern: 'Ugodno', tempRange: [19, 26], weight: 1.0 },
    { pattern: '{mild_adj:nom:f} temperatura', tempRange: [19, 26], weight: 0.8 },
    { pattern: 'Lijepa temperatura', tempRange: [19, 26], weight: 0.7 },
    { pattern: 'Baš fino', tempRange: [20, 25], weight: 0.6 },
    { pattern: 'Kao naručeno', tempRange: [20, 25], weight: 0.4 },
    { pattern: 'Idealno vrijeme', tempRange: [20, 25], weight: 0.5 },
    { pattern: '{mild_adj:nom:n} je vani', tempRange: [19, 26], weight: 0.7 },
    { pattern: 'Savršeno vrijeme', tempRange: [20, 25], weight: 0.4 },

    // WARM (25 to 32)
    { pattern: 'Toplo', tempRange: [25, 32], weight: 1.0 },
    { pattern: 'Lijepo toplo', tempRange: [25, 30], weight: 0.8 },
    { pattern: 'Ugodno toplo', tempRange: [24, 29], weight: 0.7 },
    { pattern: '{warm_adj:nom:n} je', tempRange: [25, 32], weight: 0.7 },
    { pattern: 'Vrijeme za terasu', tempRange: [24, 30], weight: 0.5 },
    { pattern: 'Vrijeme za kratke rukave', tempRange: [24, 30], weight: 0.5 },
    { pattern: '{warm_adj:nom:f} {hot_noun:nom}', tempRange: [26, 31], weight: 0.6 },

    // HOT (30 to 38)
    { pattern: 'Vruće', tempRange: [30, 38], weight: 1.0 },
    { pattern: 'Jako vruće', tempRange: [32, 40], weight: 0.8 },
    { pattern: 'Vrućina', tempRange: [30, 38], weight: 0.9 },
    { pattern: 'Za kupanje', tempRange: [28, 36], weight: 0.5 },
    { pattern: 'Dan za sladoled', tempRange: [28, 35], weight: 0.4 },
    { pattern: 'More zove', tempRange: [28, 36], weight: 0.4 },
    { pattern: '{hot_adj:nom:f} {hot_noun:nom}', tempRange: [30, 38], weight: 0.7 },
    { pattern: '{hot_adj:nom:n} je', tempRange: [30, 38], weight: 0.7 },

    // SCORCHING (35+)
    { pattern: 'Žega', tempRange: [35, 50], weight: 1.0 },
    { pattern: 'Velika vrućina', tempRange: [35, 50], weight: 0.9 },
    { pattern: 'Ekstremna vrućina', tempRange: [38, 50], weight: 0.7 },
    { pattern: 'Pali asfalt', tempRange: [38, 50], weight: 0.4 },
    { pattern: 'Vrućina za pod klimu', tempRange: [35, 50], weight: 0.5 },
    { pattern: 'Paklena {hot_noun:nom}', tempRange: [38, 50], weight: 0.4 },

    // WIND TEMPLATES
    { pattern: '{cold_adj:nom:n}, {wind_adj:nom:m} {wind_noun:nom}', tempRange: [-10, 10], weight: 0.6, minWind: 4 },
    { pattern: 'Vjetrovito', tempRange: [-10, 30], weight: 0.8, minWind: 5 },
    { pattern: '{wind_adj:nom:m} {wind_noun:nom}', tempRange: [-10, 30], weight: 0.7, minWind: 5 },
    { pattern: 'Vjetar probija', tempRange: [-5, 10], weight: 0.5, minWind: 6 },
    { pattern: 'Oštar vjetar', tempRange: [-5, 8], weight: 0.6, minWind: 6 },
    { pattern: 'Jak vjetar', tempRange: [-10, 25], weight: 0.7, minWind: 8 },
    { pattern: 'Vjetar ledi', tempRange: [-10, 5], weight: 0.5, minWind: 6 },
    { pattern: 'Ledeni vjetar', tempRange: [-10, 3], weight: 0.5, minWind: 5 },
    { pattern: 'Ledi do kostiju', tempRange: [-10, 2], weight: 0.4, minWind: 7 },
    { pattern: '{mild_adj:nom:n} uz povjetarac', tempRange: [18, 28], weight: 0.6, minWind: 2, maxWind: 5 },

    // HUMIDITY TEMPLATES
    { pattern: 'Vlažno', tempRange: [-5, 30], weight: 0.7, minHumidity: 75 },
    { pattern: '{humid_adj:nom:n} i {cold_adj:nom:n}', tempRange: [-5, 12], weight: 0.6, minHumidity: 75 },
    { pattern: 'Prodorna vlaga', tempRange: [0, 12], weight: 0.5, minHumidity: 80 },
    { pattern: 'Vlaga ulazi u kosti', tempRange: [-2, 10], weight: 0.4, minHumidity: 80 },
    { pattern: 'Sparno', tempRange: [26, 40], weight: 0.7, minHumidity: 65 },
    { pattern: 'Teška sparina', tempRange: [28, 42], weight: 0.6, minHumidity: 70 },
    { pattern: 'Gušeća sparina', tempRange: [30, 45], weight: 0.5, minHumidity: 75 },
    { pattern: 'Kao u sauni', tempRange: [30, 45], weight: 0.4, minHumidity: 75 },
    { pattern: 'Zrak stoji', tempRange: [28, 42], weight: 0.4, minHumidity: 70 },
    { pattern: 'Suha vrućina', tempRange: [30, 45], weight: 0.5, maxHumidity: 35 },

    // TIME-OF-DAY TEMPLATES
    { pattern: 'Lijepo jutro', tempRange: [15, 26], weight: 0.6, timeOfDay: 'morning' },
    { pattern: 'Jutro za kavu vani', tempRange: [18, 25], weight: 0.4, timeOfDay: 'morning' },
    { pattern: '{cold_adj:nom:n} jutro', tempRange: [-5, 10], weight: 0.6, timeOfDay: 'morning' },
    { pattern: 'Zimsko jutro', tempRange: [-5, 5], weight: 0.5, timeOfDay: 'morning' },
    { pattern: '{cool_adj:nom:n} jutro', tempRange: [8, 16], weight: 0.6, timeOfDay: 'morning' },
    { pattern: '{warm_adj:nom:n} jutro', tempRange: [22, 30], weight: 0.6, timeOfDay: 'morning' },
    { pattern: 'Vruće popodne', tempRange: [28, 40], weight: 0.6, timeOfDay: 'afternoon' },
    { pattern: 'Ugodna večer', tempRange: [18, 26], weight: 0.6, timeOfDay: 'evening' },
    { pattern: 'Fina večer za šetnju', tempRange: [18, 25], weight: 0.4, timeOfDay: 'evening' },
    { pattern: '{warm_adj:nom:f} večer', tempRange: [22, 30], weight: 0.6, timeOfDay: 'evening' },
    { pattern: 'Vruća večer', tempRange: [26, 35], weight: 0.6, timeOfDay: 'evening' },
    { pattern: '{cold_adj:nom:f} noć', tempRange: [-10, 8], weight: 0.6, timeOfDay: 'night' },
    { pattern: 'Svježa noć', tempRange: [10, 18], weight: 0.6, timeOfDay: 'night' },
    { pattern: 'Prohladna noć', tempRange: [8, 14], weight: 0.6, timeOfDay: 'night' },
    { pattern: '{warm_adj:nom:f} noć', tempRange: [18, 28], weight: 0.6, timeOfDay: 'night' },

    // IDIOMATIC
    { pattern: 'Za pod dekicu', tempRange: [-5, 8], weight: 0.4 },
    { pattern: 'Neugodno vrijeme', tempRange: [-5, 12], weight: 0.4, minHumidity: 70 },
    { pattern: 'Idealno za šetnju', tempRange: [18, 25], weight: 0.4 },
    { pattern: 'Vjetar osvježava', tempRange: [22, 30], weight: 0.5, minWind: 3, maxWind: 6 },
];

// =============================================================================
// WEATHER CODE TEMPLATES
// =============================================================================

const WEATHER_TEMPLATES = {
    clear: [
        { pattern: 'Vedro', weight: 1.0 },
        { pattern: 'Sunčano', weight: 1.0 },
        { pattern: 'Pretežno sunčano', weight: 0.8 },
        { pattern: 'Vedro nebo', weight: 0.7 },
        { pattern: '{clear_adj:nom:n} vrijeme', weight: 0.7 },
        { pattern: '{clear_adj:nom:m} dan', weight: 0.7, timeOfDay: 'afternoon' },
        { pattern: 'Vedro i {warm_adj:nom:n}', weight: 0.6, tempRange: [20, 30] },
        { pattern: 'Sunčano i {hot_adj:nom:n}', weight: 0.6, tempRange: [28, 45] },
        { pattern: 'Vedro i {cold_adj:nom:n}', weight: 0.6, tempRange: [-20, 5] },
        { pattern: 'Sunčano, ali {cold_adj:nom:n}', weight: 0.5, tempRange: [-10, 8] },
        { pattern: 'Sunce sja', weight: 0.5 },
        { pattern: 'Sunce grije', weight: 0.5, tempRange: [20, 35] },
        { pattern: 'Sunce prži', weight: 0.4, tempRange: [32, 50] },
        { pattern: 'Nebo bez oblačka', weight: 0.4 },
        { pattern: 'Sunčano jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: 'Vedra večer', weight: 0.6, timeOfDay: 'evening' },
        { pattern: 'Vedra noć', weight: 0.6, timeOfDay: 'night' },
    ],

    partly_cloudy: [
        { pattern: 'Djelomice sunčano', weight: 1.0 },
        { pattern: 'Promjenljivo oblačno', weight: 1.0 },
        { pattern: 'Umjereno oblačno', weight: 0.8 },
        { pattern: 'Sunčano uz umjerenu naoblaku', weight: 0.7 },
        { pattern: 'Djelomice sunčano i {warm_adj:nom:n}', weight: 0.5, tempRange: [20, 30] },
        { pattern: 'Promjenljivo oblačno i {cold_adj:nom:n}', weight: 0.5, tempRange: [-10, 10] },
        { pattern: 'Djelomice sunčano jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: 'Oblaci i sunce', weight: 0.6 },
        { pattern: 'Povremeno sunce', weight: 0.5 },
    ],

    cloudy: [
        { pattern: 'Oblačno', weight: 1.0 },
        { pattern: 'Pretežno oblačno', weight: 0.9 },
        { pattern: '{cloudy_adj:nom:n}', weight: 0.7 },
        { pattern: '{cloudy_adj:nom:n} vrijeme', weight: 0.6 },
        { pattern: '{cloudy_adj:nom:m} dan', weight: 0.6, timeOfDay: 'afternoon' },
        { pattern: 'Oblačno i {cold_adj:nom:n}', weight: 0.6, tempRange: [-10, 10] },
        { pattern: 'Oblačno i {warm_adj:nom:n}', weight: 0.5, tempRange: [20, 30] },
        { pattern: 'Tmurno', weight: 0.5 },
        { pattern: 'Sivo nebo', weight: 0.4 },
        { pattern: 'Oblaci dominiraju', weight: 0.3 },
        { pattern: 'Oblačno jutro', weight: 0.5, timeOfDay: 'morning' },
        { pattern: 'Gusti oblaci', weight: 0.5 },
    ],

    fog: [
        { pattern: 'Magla', weight: 1.0 },
        { pattern: 'Gusta magla', weight: 0.7 },
        { pattern: 'Smanjena vidljivost', weight: 0.6 },
        { pattern: 'Maglovito', weight: 0.8 },
        { pattern: 'Jutarnja magla', weight: 0.8, timeOfDay: 'morning' },
        { pattern: 'Noćna magla', weight: 0.6, timeOfDay: 'night' },
        { pattern: 'Magla prekriva', weight: 0.4 },
        { pattern: 'Gusto kao mlijeko', weight: 0.3 },
        { pattern: 'Magla i {cold_adj:nom:n}', weight: 0.5, tempRange: [-5, 8] },
    ],

    drizzle: [
        { pattern: 'Sitna kiša', weight: 1.0 },
        { pattern: 'Rosulja', weight: 0.8 },
        { pattern: 'Kiša rominja', weight: 0.7 },
        { pattern: 'Sipi kiša', weight: 0.6 },
        { pattern: 'Kišica', weight: 0.6 },
        { pattern: 'Kapljica po kapljica', weight: 0.4 },
        // Freezing
        { pattern: 'Ledena kiša', weight: 1.0, freezing: true },
        { pattern: 'Kiša koja se smrzava', weight: 0.6, freezing: true },
        { pattern: 'Poledica moguća', weight: 0.5, freezing: true },
        // Temperature combos
        { pattern: 'Sitna kiša i {cold_adj:nom:n}', weight: 0.7, tempRange: [-5, 10] },
        { pattern: 'Rosulja i {cold_adj:nom:n}', weight: 0.6, tempRange: [-5, 10] },
        { pattern: '{cold_adj:nom:f} rosulja', weight: 0.5, tempRange: [-5, 8] },
        // Time of day
        { pattern: 'Kišovito jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: 'Tmurna kišna večer', weight: 0.5, timeOfDay: 'evening' },
        { pattern: 'Kišna noć', weight: 0.6, timeOfDay: 'night' },
    ],

    rain: [
        { pattern: 'Kiša', weight: 1.0 },
        { pattern: 'Pada kiša', weight: 0.9 },
        { pattern: 'Kišovito', weight: 0.8 },
        // Light rain
        { pattern: 'Slaba kiša', weight: 0.8, intensity: 'light' },
        { pattern: 'Lagana kiša', weight: 0.7, intensity: 'light' },
        { pattern: 'Rominja kiša', weight: 0.6, intensity: 'light' },
        // Moderate rain
        { pattern: 'Umjerena kiša', weight: 0.7, intensity: 'moderate' },
        // Heavy rain
        { pattern: 'Jaka kiša', weight: 0.9, intensity: 'heavy' },
        { pattern: 'Obilna kiša', weight: 0.8, intensity: 'heavy' },
        { pattern: 'Pljusak', weight: 0.8, intensity: 'heavy' },
        { pattern: 'Kiša lije', weight: 0.5, intensity: 'heavy' },
        { pattern: 'Kiša pljušti', weight: 0.4, intensity: 'heavy' },
        { pattern: 'Lije kao iz kabla', weight: 0.3, intensity: 'heavy' },
        // Freezing rain
        { pattern: 'Ledena kiša', weight: 1.0, freezing: true },
        { pattern: 'Poledica', weight: 0.7, freezing: true },
        // Temperature combos
        { pattern: 'Kiša i {cold_adj:nom:n}', weight: 0.8, tempRange: [-5, 12] },
        { pattern: '{cold_adj:nom:f} kiša', weight: 0.7, tempRange: [-5, 10] },
        { pattern: 'Kišovito i {cold_adj:nom:n}', weight: 0.6, tempRange: [-5, 12] },
        { pattern: '{warm_adj:nom:f} kiša', weight: 0.5, tempRange: [18, 30] },
        { pattern: 'Kiša i {mild_adj:nom:n}', weight: 0.5, tempRange: [12, 20] },
        // Time of day
        { pattern: 'Kišno jutro', weight: 0.7, timeOfDay: 'morning' },
        { pattern: 'Kišna večer', weight: 0.7, timeOfDay: 'evening' },
        { pattern: 'Kišna noć', weight: 0.7, timeOfDay: 'night' },
        { pattern: 'Kišovita noć', weight: 0.6, timeOfDay: 'night' },
    ],

    snow: [
        { pattern: 'Snijeg', weight: 1.0 },
        { pattern: 'Pada snijeg', weight: 0.9 },
        { pattern: 'Sniježi', weight: 0.8 },
        // Light snow
        { pattern: 'Slab snijeg', weight: 0.8, intensity: 'light' },
        { pattern: 'Lagani snijeg', weight: 0.7, intensity: 'light' },
        { pattern: 'Pahulje padaju', weight: 0.5, intensity: 'light' },
        // Moderate snow
        { pattern: 'Umjeren snijeg', weight: 0.7, intensity: 'moderate' },
        // Heavy snow
        { pattern: 'Jak snijeg', weight: 0.8, intensity: 'heavy' },
        { pattern: 'Obilan snijeg', weight: 0.7, intensity: 'heavy' },
        { pattern: 'Snježna mećava', weight: 0.5, intensity: 'heavy' },
        { pattern: 'Bijeli pokrivač', weight: 0.4, intensity: 'heavy' },
        { pattern: 'Zavijava snijeg', weight: 0.4, intensity: 'heavy' },
        // Mixed/wet snow
        { pattern: 'Susnježica', weight: 0.8, tempRange: [-2, 3] },
        { pattern: 'Mokri snijeg', weight: 0.7, tempRange: [-1, 2] },
        // Temperature combos
        { pattern: 'Snijeg i mraz', weight: 0.6, tempRange: [-15, -3] },
        { pattern: 'Snijeg i {cold_adj:nom:n}', weight: 0.6, tempRange: [-15, 0] },
        { pattern: '{cold_adj:nom:m} snijeg', weight: 0.5, tempRange: [-15, -2] },
        // Time of day
        { pattern: 'Snježno jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: 'Snježna večer', weight: 0.6, timeOfDay: 'evening' },
        { pattern: 'Snježna noć', weight: 0.6, timeOfDay: 'night' },
    ],

    thunderstorm: [
        { pattern: 'Grmljavina', weight: 1.0 },
        { pattern: 'Nevrijeme', weight: 0.9 },
        { pattern: 'Grmljavinsko nevrijeme', weight: 0.7 },
        { pattern: 'Oluja', weight: 0.7 },
        { pattern: 'Grmljavinski pljusak', weight: 0.6 },
        { pattern: 'Grmljavina s tučom', weight: 1.0, hail: true },
        { pattern: 'Tuča', weight: 0.9, hail: true },
        { pattern: 'Nevrijeme s tučom', weight: 0.7, hail: true },
        { pattern: 'Grmi i sijeva', weight: 0.5 },
        { pattern: 'Olujno nevrijeme', weight: 0.4 },
        { pattern: 'Munje paraju nebo', weight: 0.3 },
    ],
};

// =============================================================================
// DECLENSION ENGINE
// =============================================================================

function declineNoun(word, targetCase) {
    const entry = NOUNS[word];
    if (entry && entry[targetCase]) {
        return entry[targetCase];
    }
    return word;
}

function declineAdjective(word, targetCase, targetGender) {
    const entry = ADJECTIVES[word];
    if (entry && entry[targetGender] && entry[targetGender][targetCase]) {
        return entry[targetGender][targetCase];
    }
    return word;
}

// =============================================================================
// WEIGHTED SELECTION
// =============================================================================

function weightedPick(pool, context) {
    const filtered = pool.filter(item => {
        if (item.minTemp !== undefined && context.effTemp < item.minTemp) return false;
        if (item.maxTemp !== undefined && context.effTemp > item.maxTemp) return false;
        if (item.minHumidity !== undefined && (context.humidity ?? DEFAULT_HUMIDITY) < item.minHumidity) return false;
        if (item.minWind !== undefined && (context.wind ?? 0) < item.minWind) return false;
        if (item.maxWind !== undefined && (context.wind ?? 0) > item.maxWind) return false;
        return true;
    });

    if (filtered.length === 0) return null;

    const totalWeight = filtered.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * totalWeight;

    for (const item of filtered) {
        r -= item.weight;
        if (r <= 0) return item;
    }

    return filtered[filtered.length - 1];
}

function weightedSelect(templates) {
    const totalWeight = templates.reduce((sum, t) => sum + (t.weight ?? 1.0), 0);
    let r = Math.random() * totalWeight;

    for (const t of templates) {
        r -= (t.weight ?? 1.0);
        if (r <= 0) return t;
    }

    return templates[templates.length - 1];
}

// =============================================================================
// TEMPLATE FILLING
// =============================================================================

function fillTemplate(pattern, context) {
    return pattern.replace(/\{(\w+):(\w+)(?::(\w+))?\}/g, (match, poolName, caseForm, explicitGender) => {
        const pool = SYNONYMS[poolName];
        if (!pool) return match;

        const selected = weightedPick(pool, context);
        if (!selected) return match;

        const word = selected.word;

        if (ADJECTIVES[word]) {
            const gender = explicitGender || 'm';
            return declineAdjective(word, caseForm, gender);
        } else if (NOUNS[word]) {
            return declineNoun(word, caseForm);
        }

        return word;
    });
}

// =============================================================================
// MAIN GENERATION
// =============================================================================

/**
 * Generates a weather description in Croatian.
 * @param {number} temp - Air temperature (°C)
 * @param {number|null} humidity - Relative humidity (%)
 * @param {number|null} windSpeed - Wind speed (m/s)
 * @param {number|null} dewpoint - Dewpoint (unused, for API compatibility)
 * @param {Object|null} weather - Weather conditions {category, intensity, freezing, hail}
 * @returns {string} Weather description
 */
export function generateWeatherDescription(temp, humidity, windSpeed, dewpoint, weather = null) {
    const effTemp = effectiveTemp(temp, windSpeed);
    const timeOfDay = getTimeOfDay();

    const context = {
        temp,
        effTemp,
        humidity,
        wind: windSpeed,
    };

    // Try weather-code templates first
    if (weather?.category && WEATHER_TEMPLATES[weather.category]) {
        const result = selectWeatherCodeTemplate(weather, effTemp, timeOfDay, context);
        if (result) return result;
    }

    // Fall back to temperature-based templates
    return selectTemperatureTemplate(effTemp, windSpeed, humidity, timeOfDay, context, weather?.category);
}

function selectWeatherCodeTemplate(weather, effTemp, timeOfDay, context) {
    const categoryTemplates = WEATHER_TEMPLATES[weather.category];
    if (!categoryTemplates) return null;

    const applicable = categoryTemplates.filter(t => {
        // Intensity constraint: template must match weather intensity if specified
        if (t.intensity !== undefined && t.intensity !== weather.intensity) return false;
        // Freezing constraint
        if (t.freezing && !weather.freezing) return false;
        // Hail constraint
        if (t.hail && !weather.hail) return false;
        // Temperature range
        if (t.tempRange && (effTemp < t.tempRange[0] || effTemp > t.tempRange[1])) return false;
        // Time of day
        if (t.timeOfDay !== undefined && t.timeOfDay !== timeOfDay) return false;
        // Humidity constraints
        if (t.minHumidity !== undefined && (context.humidity ?? DEFAULT_HUMIDITY) < t.minHumidity) return false;
        if (t.maxHumidity !== undefined && (context.humidity ?? DEFAULT_HUMIDITY) > t.maxHumidity) return false;
        // Wind constraints
        if (t.minWind !== undefined && (context.wind ?? 0) < t.minWind) return false;
        if (t.maxWind !== undefined && (context.wind ?? 0) > t.maxWind) return false;
        return true;
    });

    if (applicable.length === 0) return null;

    const selected = weightedSelect(applicable);
    return fillTemplate(selected.pattern, context);
}

function selectTemperatureTemplate(effTemp, windSpeed, humidity, timeOfDay, context, weatherCategory = null) {
    // Skip humidity-focused templates during precipitation (humidity is obviously high)
    const precipitationCategories = ['drizzle', 'rain', 'snow', 'thunderstorm'];
    const isPrecipitation = precipitationCategories.includes(weatherCategory);

    const applicable = TEMPLATES.filter(t => {
        if (effTemp < t.tempRange[0] || effTemp > t.tempRange[1]) return false;
        if (t.minWind !== undefined && (windSpeed ?? 0) < t.minWind) return false;
        if (t.maxWind !== undefined && (windSpeed ?? 0) > t.maxWind) return false;
        if (t.minHumidity !== undefined) {
            if (isPrecipitation) return false;  // Don't mention humidity during precipitation
            if ((humidity ?? DEFAULT_HUMIDITY) < t.minHumidity) return false;
        }
        if (t.maxHumidity !== undefined && (humidity ?? DEFAULT_HUMIDITY) > t.maxHumidity) return false;
        if (t.timeOfDay !== undefined && t.timeOfDay !== timeOfDay) return false;
        return true;
    });

    if (applicable.length === 0) {
        // Fallback for edge cases
        if (effTemp < -10) return 'Ekstremna hladnoća';
        if (effTemp < -5) return 'Jaka zima';
        if (effTemp < 0) return 'Ledeno';
        if (effTemp < 5) return 'Hladno';
        if (effTemp < 10) return 'Prohladno';
        if (effTemp < 15) return 'Svježe';
        if (effTemp < 20) return 'Blago';
        if (effTemp < 25) return 'Ugodno';
        if (effTemp < 30) return 'Toplo';
        if (effTemp < 35) return 'Vruće';
        return 'Žega';
    }

    return fillTemplate(weightedSelect(applicable).pattern, context);
}
