/**
 * Weather Widget - Croatian Natural Language Generation
 *
 * Natural Language Generation for Croatian weather descriptions using:
 * - Full morphological declension (7 cases, 3 genders)
 * - Semantic synonym pools with weighted selection
 * - Sentence templates with typed slots
 * - Simple wind chill for effective temperature
 * - WMO weather codes for precipitation/condition-based descriptions
 */

import { getWeatherCategory, getIntensity, isFreezingPrecipitation, hasHail } from './openmeteo.js';

// =============================================================================
// GENERATION COUNTER
// =============================================================================

/**
 * Generation counter - incremented on user-triggered refreshes to vary descriptions.
 */
export let descriptionGeneration = 0;

/**
 * Increments the generation counter to produce a different description on next render.
 * Called when user explicitly requests a refresh (e.g., clicking on condition).
 */
export function bumpDescriptionGeneration() {
    descriptionGeneration++;
}

// =============================================================================
// EFFECTIVE TEMPERATURE (WIND CHILL)
// =============================================================================

/**
 * Calculates effective (feels-like) temperature considering wind chill.
 * Wind makes cold temperatures feel colder.
 * @param {number} temp - Air temperature (°C)
 * @param {number|null} windSpeed - Wind speed (m/s)
 * @returns {number} Effective temperature (°C)
 */
function effectiveTemp(temp, windSpeed) {
    const wind = windSpeed ?? 0;
    // Wind chill only applies when cold and windy
    if (temp < 15 && wind > 2) {
        // Each 1 m/s of wind ≈ -0.8°C, capped at -10°C adjustment
        return temp - Math.min(wind * 0.8, 10);
    }
    return temp;
}

// =============================================================================
// TIME AND SEASON UTILITIES
// =============================================================================

/**
 * Gets current time of day category.
 * @returns {'morning' | 'afternoon' | 'evening' | 'night'}
 */
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

/**
 * Gets current season based on month.
 * @returns {'winter' | 'spring' | 'summer' | 'autumn'}
 */
function getSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
}

// =============================================================================
// CROATIAN LEXICON WITH FULL DECLENSIONS
// =============================================================================
// Croatian has 7 grammatical cases, 3 genders, and 2 numbers.
// This lexicon stores words with their full declension patterns.

/**
 * Lexicon of Croatian nouns with gender and case declensions.
 * Cases: nom (nominative), gen (genitive), dat (dative), acc (accusative),
 *        voc (vocative), loc (locative), ins (instrumental)
 */
const NOUNS = {
    // Weather nouns - masculine
    vjetar: { gender: 'm', nom: 'vjetar', gen: 'vjetra', dat: 'vjetru', acc: 'vjetar', voc: 'vjetre', loc: 'vjetru', ins: 'vjetrom' },
    povjetarac: { gender: 'm', nom: 'povjetarac', gen: 'povjetarca', dat: 'povjetarcu', acc: 'povjetarac', voc: 'povjetarče', loc: 'povjetarcu', ins: 'povjetarcem' },
    zrak: { gender: 'm', nom: 'zrak', gen: 'zraka', dat: 'zraku', acc: 'zrak', voc: 'zrače', loc: 'zraku', ins: 'zrakom' },
    mraz: { gender: 'm', nom: 'mraz', gen: 'mraza', dat: 'mrazu', acc: 'mraz', voc: 'mraze', loc: 'mrazu', ins: 'mrazom' },
    led: { gender: 'm', nom: 'led', gen: 'leda', dat: 'ledu', acc: 'led', voc: 'lede', loc: 'ledu', ins: 'ledom' },
    snijeg: { gender: 'm', nom: 'snijeg', gen: 'snijega', dat: 'snijegu', acc: 'snijeg', voc: 'snijegu', loc: 'snijegu', ins: 'snijegom' },
    oblak: { gender: 'm', nom: 'oblak', gen: 'oblaka', dat: 'oblaku', acc: 'oblak', voc: 'oblače', loc: 'oblaku', ins: 'oblakom' },
    dan: { gender: 'm', nom: 'dan', gen: 'dana', dat: 'danu', acc: 'dan', voc: 'dane', loc: 'danu', ins: 'danom' },
    pljusak: { gender: 'm', nom: 'pljusak', gen: 'pljuska', dat: 'pljusku', acc: 'pljusak', voc: 'pljusku', loc: 'pljusku', ins: 'pljuskom' },

    // Weather nouns - feminine
    hladnoća: { gender: 'f', nom: 'hladnoća', gen: 'hladnoće', dat: 'hladnoći', acc: 'hladnoću', voc: 'hladnoćo', loc: 'hladnoći', ins: 'hladnoćom' },
    studen: { gender: 'f', nom: 'studen', gen: 'studeni', dat: 'studeni', acc: 'studen', voc: 'studeni', loc: 'studeni', ins: 'studeni' },
    zima: { gender: 'f', nom: 'zima', gen: 'zime', dat: 'zimi', acc: 'zimu', voc: 'zimo', loc: 'zimi', ins: 'zimom' },
    vrućina: { gender: 'f', nom: 'vrućina', gen: 'vrućine', dat: 'vrućini', acc: 'vrućinu', voc: 'vrućino', loc: 'vrućini', ins: 'vrućinom' },
    toplina: { gender: 'f', nom: 'toplina', gen: 'topline', dat: 'toplini', acc: 'toplinu', voc: 'toplino', loc: 'toplini', ins: 'toplinom' },
    žega: { gender: 'f', nom: 'žega', gen: 'žege', dat: 'žegi', acc: 'žegu', voc: 'žego', loc: 'žegi', ins: 'žegom' },
    sparina: { gender: 'f', nom: 'sparina', gen: 'sparine', dat: 'sparini', acc: 'sparinu', voc: 'sparino', loc: 'sparini', ins: 'sparinom' },
    vlaga: { gender: 'f', nom: 'vlaga', gen: 'vlage', dat: 'vlazi', acc: 'vlagu', voc: 'vlago', loc: 'vlazi', ins: 'vlagom' },
    kiša: { gender: 'f', nom: 'kiša', gen: 'kiše', dat: 'kiši', acc: 'kišu', voc: 'kišo', loc: 'kiši', ins: 'kišom' },
    magla: { gender: 'f', nom: 'magla', gen: 'magle', dat: 'magli', acc: 'maglu', voc: 'maglo', loc: 'magli', ins: 'maglom' },
    temperatura: { gender: 'f', nom: 'temperatura', gen: 'temperature', dat: 'temperaturi', acc: 'temperaturu', voc: 'temperaturo', loc: 'temperaturi', ins: 'temperaturom' },
    svježina: { gender: 'f', nom: 'svježina', gen: 'svježine', dat: 'svježini', acc: 'svježinu', voc: 'svježino', loc: 'svježini', ins: 'svježinom' },
    ugoda: { gender: 'f', nom: 'ugoda', gen: 'ugode', dat: 'ugodi', acc: 'ugodu', voc: 'ugodo', loc: 'ugodi', ins: 'ugodom' },
    noć: { gender: 'f', nom: 'noć', gen: 'noći', dat: 'noći', acc: 'noć', voc: 'noći', loc: 'noći', ins: 'noći' },
    večer: { gender: 'f', nom: 'večer', gen: 'večeri', dat: 'večeri', acc: 'večer', voc: 'večeri', loc: 'večeri', ins: 'večeri' },
    rosulja: { gender: 'f', nom: 'rosulja', gen: 'rosulje', dat: 'rosulji', acc: 'rosulju', voc: 'rosuljo', loc: 'rosulji', ins: 'rosuljom' },
    susnježica: { gender: 'f', nom: 'susnježica', gen: 'susnježice', dat: 'susnježici', acc: 'susnježicu', voc: 'susnježice', loc: 'susnježici', ins: 'susnježicom' },
    tuča: { gender: 'f', nom: 'tuča', gen: 'tuče', dat: 'tuči', acc: 'tuču', voc: 'tučo', loc: 'tuči', ins: 'tučom' },
    grmljavina: { gender: 'f', nom: 'grmljavina', gen: 'grmljavine', dat: 'grmljavini', acc: 'grmljavinu', voc: 'grmljavino', loc: 'grmljavini', ins: 'grmljavinom' },
    oluja: { gender: 'f', nom: 'oluja', gen: 'oluje', dat: 'oluji', acc: 'oluju', voc: 'olujo', loc: 'oluji', ins: 'olujom' },
    oborina: { gender: 'f', nom: 'oborina', gen: 'oborine', dat: 'oborini', acc: 'oborinu', voc: 'oborino', loc: 'oborini', ins: 'oborinom' },
    naoblaka: { gender: 'f', nom: 'naoblaka', gen: 'naoblake', dat: 'naoblaci', acc: 'naoblaku', voc: 'naoblako', loc: 'naoblaci', ins: 'naoblakom' },
    vidljivost: { gender: 'f', nom: 'vidljivost', gen: 'vidljivosti', dat: 'vidljivosti', acc: 'vidljivost', voc: 'vidljivosti', loc: 'vidljivosti', ins: 'vidljivošću' },

    // Weather nouns - neuter
    sunce: { gender: 'n', nom: 'sunce', gen: 'sunca', dat: 'suncu', acc: 'sunce', voc: 'sunce', loc: 'suncu', ins: 'suncem' },
    nebo: { gender: 'n', nom: 'nebo', gen: 'neba', dat: 'nebu', acc: 'nebo', voc: 'nebo', loc: 'nebu', ins: 'nebom' },
    vrijeme: { gender: 'n', nom: 'vrijeme', gen: 'vremena', dat: 'vremenu', acc: 'vrijeme', voc: 'vrijeme', loc: 'vremenu', ins: 'vremenom' },
    jutro: { gender: 'n', nom: 'jutro', gen: 'jutra', dat: 'jutru', acc: 'jutro', voc: 'jutro', loc: 'jutru', ins: 'jutrom' },
    popodne: { gender: 'n', nom: 'popodne', gen: 'popodneva', dat: 'popodnevu', acc: 'popodne', voc: 'popodne', loc: 'popodnevu', ins: 'popodnevom' },
    nevrijeme: { gender: 'n', nom: 'nevrijeme', gen: 'nevremena', dat: 'nevremenu', acc: 'nevrijeme', voc: 'nevrijeme', loc: 'nevremenu', ins: 'nevremenom' },
    razvedravanje: { gender: 'n', nom: 'razvedravanje', gen: 'razvedravanja', dat: 'razvedravanju', acc: 'razvedravanje', voc: 'razvedravanje', loc: 'razvedravanju', ins: 'razvedravanjem' },

    // Body parts for idioms
    kost: { gender: 'f', nom: 'kost', gen: 'kosti', dat: 'kosti', acc: 'kost', voc: 'kosti', loc: 'kosti', ins: 'kosti',
            nom_pl: 'kosti', gen_pl: 'kostiju', dat_pl: 'kostima', acc_pl: 'kosti', loc_pl: 'kostima', ins_pl: 'kostima' },
    koža: { gender: 'f', nom: 'koža', gen: 'kože', dat: 'koži', acc: 'kožu', voc: 'kožo', loc: 'koži', ins: 'kožom' },
};

/**
 * Lexicon of Croatian adjectives with all gender/case combinations.
 */
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
    suh: {
        m: { nom: 'suh', gen: 'suhog', dat: 'suhom', acc: 'suh', loc: 'suhom', ins: 'suhim' },
        f: { nom: 'suha', gen: 'suhe', dat: 'suhoj', acc: 'suhu', loc: 'suhoj', ins: 'suhom' },
        n: { nom: 'suho', gen: 'suhog', dat: 'suhom', acc: 'suho', loc: 'suhom', ins: 'suhim' },
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

    // Intensity/general adjectives
    fin: {
        m: { nom: 'fin', gen: 'finog', dat: 'finom', acc: 'fin', loc: 'finom', ins: 'finim' },
        f: { nom: 'fina', gen: 'fine', dat: 'finoj', acc: 'finu', loc: 'finoj', ins: 'finom' },
        n: { nom: 'fino', gen: 'finog', dat: 'finom', acc: 'fino', loc: 'finom', ins: 'finim' },
    },
    idealan: {
        m: { nom: 'idealan', gen: 'idealnog', dat: 'idealnom', acc: 'idealan', loc: 'idealnom', ins: 'idealnim' },
        f: { nom: 'idealna', gen: 'idealne', dat: 'idealnoj', acc: 'idealnu', loc: 'idealnoj', ins: 'idealnom' },
        n: { nom: 'idealno', gen: 'idealnog', dat: 'idealnom', acc: 'idealno', loc: 'idealnom', ins: 'idealnim' },
    },
    pravi: {
        m: { nom: 'pravi', gen: 'pravog', dat: 'pravom', acc: 'pravi', loc: 'pravom', ins: 'pravim' },
        f: { nom: 'prava', gen: 'prave', dat: 'pravoj', acc: 'pravu', loc: 'pravoj', ins: 'pravom' },
        n: { nom: 'pravo', gen: 'pravog', dat: 'pravom', acc: 'pravo', loc: 'pravom', ins: 'pravim' },
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
    promjenljiv: {
        m: { nom: 'promjenljiv', gen: 'promjenljivog', dat: 'promjenljivom', acc: 'promjenljiv', loc: 'promjenljivom', ins: 'promjenljivim' },
        f: { nom: 'promjenljiva', gen: 'promjenljive', dat: 'promjenljivoj', acc: 'promjenljivu', loc: 'promjenljivoj', ins: 'promjenljivom' },
        n: { nom: 'promjenljivo', gen: 'promjenljivog', dat: 'promjenljivom', acc: 'promjenljivo', loc: 'promjenljivom', ins: 'promjenljivim' },
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
    gust: {
        m: { nom: 'gust', gen: 'gustog', dat: 'gustom', acc: 'gust', loc: 'gustom', ins: 'gustim' },
        f: { nom: 'gusta', gen: 'guste', dat: 'gustoj', acc: 'gustu', loc: 'gustoj', ins: 'gustom' },
        n: { nom: 'gusto', gen: 'gustog', dat: 'gustom', acc: 'gusto', loc: 'gustom', ins: 'gustim' },
    },
    sitan: {
        m: { nom: 'sitan', gen: 'sitnog', dat: 'sitnom', acc: 'sitan', loc: 'sitnom', ins: 'sitnim' },
        f: { nom: 'sitna', gen: 'sitne', dat: 'sitnoj', acc: 'sitnu', loc: 'sitnoj', ins: 'sitnom' },
        n: { nom: 'sitno', gen: 'sitnog', dat: 'sitnom', acc: 'sitno', loc: 'sitnom', ins: 'sitnim' },
    },
    obilan: {
        m: { nom: 'obilan', gen: 'obilnog', dat: 'obilnom', acc: 'obilan', loc: 'obilnom', ins: 'obilnim' },
        f: { nom: 'obilna', gen: 'obilne', dat: 'obilnoj', acc: 'obilnu', loc: 'obilnoj', ins: 'obilnom' },
        n: { nom: 'obilno', gen: 'obilnog', dat: 'obilnom', acc: 'obilno', loc: 'obilnom', ins: 'obilnim' },
    },
    slab: {
        m: { nom: 'slab', gen: 'slabog', dat: 'slabom', acc: 'slab', loc: 'slabom', ins: 'slabim' },
        f: { nom: 'slaba', gen: 'slabe', dat: 'slaboj', acc: 'slabu', loc: 'slaboj', ins: 'slabom' },
        n: { nom: 'slabo', gen: 'slabog', dat: 'slabom', acc: 'slabo', loc: 'slabom', ins: 'slabim' },
    },
    mokri: {
        m: { nom: 'mokri', gen: 'mokrog', dat: 'mokrom', acc: 'mokri', loc: 'mokrom', ins: 'mokrim' },
        f: { nom: 'mokra', gen: 'mokre', dat: 'mokroj', acc: 'mokru', loc: 'mokroj', ins: 'mokrom' },
        n: { nom: 'mokro', gen: 'mokrog', dat: 'mokrom', acc: 'mokro', loc: 'mokrom', ins: 'mokrim' },
    },
};

/**
 * Lexicon of Croatian verbs with conjugations.
 */
const VERBS = {
    puhati: { inf: 'puhati', pres3sg: 'puše', pres3pl: 'pušu', past_m: 'puhao', past_f: 'puhala', past_n: 'puhalo' },
    piriti: { inf: 'piriti', pres3sg: 'piri', pres3pl: 'pire', past_m: 'pirio', past_f: 'pirila', past_n: 'pirilo' },
    padati: { inf: 'padati', pres3sg: 'pada', pres3pl: 'padaju', past_m: 'padao', past_f: 'padala', past_n: 'padalo' },
    grijati: { inf: 'grijati', pres3sg: 'grije', pres3pl: 'griju', past_m: 'grijao', past_f: 'grijala', past_n: 'grijalo' },
    hladiti: { inf: 'hladiti', pres3sg: 'hladi', pres3pl: 'hlade', past_m: 'hladio', past_f: 'hladila', past_n: 'hladilo' },
    probijati: { inf: 'probijati', pres3sg: 'probija', pres3pl: 'probijaju', past_m: 'probijao', past_f: 'probijala', past_n: 'probijalo' },
    lediti: { inf: 'lediti', pres3sg: 'ledi', pres3pl: 'lede', past_m: 'ledio', past_f: 'ledila', past_n: 'ledilo' },
    gušiti: { inf: 'gušiti', pres3sg: 'guši', pres3pl: 'guše', past_m: 'gušio', past_f: 'gušila', past_n: 'gušilo' },
    smrzavati: { inf: 'smrzavati', pres3sg: 'smrzava', pres3pl: 'smrzavaju', past_m: 'smrzavao', past_f: 'smrzavala', past_n: 'smrzavalo' },
    prodirati: { inf: 'prodirati', pres3sg: 'prodire', pres3pl: 'prodiru', past_m: 'prodirao', past_f: 'prodirala', past_n: 'prodiralo' },
    // Precipitation verbs
    rominjati: { inf: 'rominjati', pres3sg: 'rominja', pres3pl: 'rominjaju', past_m: 'rominjao', past_f: 'rominjala', past_n: 'rominjalo' },
    pljuštati: { inf: 'pljuštati', pres3sg: 'pljušti', pres3pl: 'pljuštu', past_m: 'pljuštao', past_f: 'pljuštala', past_n: 'pljuštalo' },
    liti: { inf: 'liti', pres3sg: 'lije', pres3pl: 'liju', past_m: 'lio', past_f: 'lila', past_n: 'lilo' },
    sniježiti: { inf: 'sniježiti', pres3sg: 'sniježi', pres3pl: 'sniježe', past_m: 'sniježio', past_f: 'sniježila', past_n: 'sniježilo' },
    grmliti: { inf: 'grmliti', pres3sg: 'grmi', pres3pl: 'grme', past_m: 'grmio', past_f: 'grmila', past_n: 'grmilo' },
};

// =============================================================================
// SYNONYM POOLS (Semantic Groups)
// =============================================================================

/**
 * Synonym pools organized by semantic concept.
 * Each word has a weight (higher = more common) and optional constraints.
 */
const SYNONYMS = {
    // Temperature concept nouns - cold
    cold_noun: [
        { word: 'hladnoća', weight: 1.0 },
        { word: 'studen', weight: 0.7 },
        { word: 'zima', weight: 0.8 },
        { word: 'mraz', weight: 0.6, maxTemp: -2 },
    ],

    // Temperature concept nouns - heat
    hot_noun: [
        { word: 'vrućina', weight: 1.0 },
        { word: 'toplina', weight: 0.9 },
        { word: 'žega', weight: 0.7, minTemp: 33 },
        { word: 'sparina', weight: 0.6, minHumidity: 60 },
    ],

    // Temperature adjectives - cold
    cold_adj: [
        { word: 'hladan', weight: 1.0 },
        { word: 'studen', weight: 0.7, maxTemp: 0 },
        { word: 'leden', weight: 0.5, maxTemp: -3 },
        { word: 'prohladan', weight: 0.9, minTemp: 5 },
        { word: 'oštar', weight: 0.6, minWind: 3 },
        { word: 'prodoran', weight: 0.5, minWind: 4 },
        { word: 'zimski', weight: 0.6 },
    ],

    // Temperature adjectives - cool/fresh
    cool_adj: [
        { word: 'svjež', weight: 1.0 },
        { word: 'prohladan', weight: 0.8 },
        { word: 'osvježavajuć', weight: 0.6 },
    ],

    // Temperature adjectives - mild
    mild_adj: [
        { word: 'blag', weight: 1.0 },
        { word: 'umjeren', weight: 0.8 },
        { word: 'ugodan', weight: 0.9 },
        { word: 'prijatan', weight: 0.7 },
        { word: 'lijep', weight: 0.6 },
    ],

    // Temperature adjectives - warm
    warm_adj: [
        { word: 'topao', weight: 1.0 },
        { word: 'ugodan', weight: 0.7 },
        { word: 'prijatan', weight: 0.6 },
        { word: 'lijep', weight: 0.5 },
    ],

    // Temperature adjectives - hot
    hot_adj: [
        { word: 'vruć', weight: 1.0 },
        { word: 'vreo', weight: 0.7 },
        { word: 'žarki', weight: 0.5, minTemp: 35 },
        { word: 'sparni', weight: 0.6, minHumidity: 60 },
    ],

    // Wind nouns
    wind_noun: [
        { word: 'vjetar', weight: 1.0 },
        { word: 'povjetarac', weight: 0.8, maxWind: 5 },
    ],

    // Wind adjectives
    wind_adj: [
        { word: 'vjetrovit', weight: 1.0 },
        { word: 'lagan', weight: 0.8, maxWind: 4 },
        { word: 'jak', weight: 0.7, minWind: 6 },
        { word: 'oštar', weight: 0.6, minWind: 5 },
        { word: 'prodoran', weight: 0.5, minWind: 6 },
    ],

    // Humidity adjectives
    humid_adj: [
        { word: 'vlažan', weight: 1.0 },
        { word: 'prodoran', weight: 0.7, maxTemp: 12 },  // penetrating damp cold
        { word: 'sparni', weight: 0.7, minTemp: 25 },
    ],

    // Weather nouns (general)
    weather_noun: [
        { word: 'vrijeme', weight: 1.0 },
        { word: 'dan', weight: 0.9 },
    ],

    // Time-of-day nouns
    time_noun_morning: [
        { word: 'jutro', weight: 1.0 },
    ],
    time_noun_evening: [
        { word: 'večer', weight: 1.0 },
    ],
    time_noun_night: [
        { word: 'noć', weight: 1.0 },
    ],

    // Intensity adverbs
    intensity_adv: [
        { word: 'vrlo', weight: 0.8 },
        { word: 'jako', weight: 1.0 },
        { word: 'prilično', weight: 0.7 },
        { word: 'izrazito', weight: 0.5 },
        { word: 'baš', weight: 0.6, colloquial: true },
    ],

    // Sky condition adjectives (for weather code templates)
    clear_adj: [
        { word: 'vedar', weight: 1.0 },
        { word: 'sunčan', weight: 0.9 },
    ],
    cloudy_adj: [
        { word: 'oblačan', weight: 1.0 },
        { word: 'tmuran', weight: 0.6 },
        { word: 'siv', weight: 0.5 },
    ],

    // Precipitation nouns
    rain_noun: [
        { word: 'kiša', weight: 1.0 },
        { word: 'pljusak', weight: 0.7 },
    ],
    snow_noun: [
        { word: 'snijeg', weight: 1.0 },
    ],
};

// =============================================================================
// SENTENCE TEMPLATES
// =============================================================================
// Templates define sentence structures with typed slots.
// Slot format: {pool:case} or {pool:case:gender} for adjectives
// Pools reference SYNONYMS keys, case is Croatian grammatical case.

/**
 * Sentence templates for weather descriptions.
 * Each template has:
 * - pattern: sentence with {pool:case} slots
 * - tempRange: [min, max] effective temperature range where this applies
 * - weight: probability weight for selection
 * - conditions: optional additional requirements (humidity, wind, timeOfDay)
 */
const TEMPLATES = [
    // ===================
    // FREEZING (-15 to -5)
    // ===================
    { pattern: 'Ledeno', tempRange: [-20, -5], weight: 1.0 },
    { pattern: 'Sibirska zima', tempRange: [-20, -8], weight: 0.6, colorful: true },
    { pattern: '{cold_adj:nom:m} mraz', tempRange: [-20, -3], weight: 0.8 },
    { pattern: 'Duboki mraz', tempRange: [-20, -5], weight: 0.7 },
    { pattern: 'Jaka zima', tempRange: [-15, -3], weight: 0.8 },
    { pattern: 'Arktička {cold_noun:nom}', tempRange: [-20, -8], weight: 0.5, colorful: true },
    { pattern: '{cold_noun:nom} ledi kosti', tempRange: [-20, -5], weight: 0.5, colorful: true },

    // ===================
    // VERY COLD (-5 to 2)
    // ===================
    { pattern: 'Hladno', tempRange: [-5, 5], weight: 1.0 },
    { pattern: 'Studeno', tempRange: [-5, 3], weight: 0.8 },
    { pattern: '{cold_adj:nom:m} {weather_noun:nom}', tempRange: [-5, 5], weight: 0.7 },
    { pattern: 'Zimski dan', tempRange: [-5, 5], weight: 0.8 },
    { pattern: 'Zima je tu', tempRange: [-5, 3], weight: 0.6, colorful: true },
    { pattern: 'Kaput vrijeme', tempRange: [-3, 6], weight: 0.6, colorful: true },
    { pattern: '{cold_adj:nom:n} je vani', tempRange: [-5, 5], weight: 0.7 },
    { pattern: 'Vani je {cold_adj:nom:n}', tempRange: [-5, 5], weight: 0.7 },

    // ===================
    // CHILLY (2 to 8)
    // ===================
    { pattern: 'Prohladno', tempRange: [2, 10], weight: 1.0 },
    { pattern: '{cold_adj:nom:n} i {humid_adj:nom:n}', tempRange: [2, 10], weight: 0.6, minHumidity: 70 },
    { pattern: 'Vrijeme za zimsku jaknu', tempRange: [0, 8], weight: 0.5, colorful: true },
    { pattern: 'Za debelu vestu', tempRange: [2, 10], weight: 0.5, colorful: true },
    { pattern: 'Jesen u zraku', tempRange: [5, 12], weight: 0.5, colorful: true },
    { pattern: '{cold_adj:nom:f} {cold_noun:nom}', tempRange: [0, 8], weight: 0.6 },

    // ===================
    // COOL (8 to 14)
    // ===================
    { pattern: 'Svježe', tempRange: [8, 16], weight: 1.0 },
    { pattern: '{cool_adj:nom:n}', tempRange: [8, 16], weight: 0.9 },
    { pattern: 'Hlađe', tempRange: [8, 14], weight: 0.7 },
    { pattern: 'Džemper vrijeme', tempRange: [8, 14], weight: 0.5, colorful: true },
    { pattern: 'Za dugi rukav', tempRange: [10, 16], weight: 0.5, colorful: true },
    { pattern: '{cool_adj:nom:f} svježina', tempRange: [8, 15], weight: 0.6 },
    { pattern: '{cool_adj:nom:n} je', tempRange: [8, 16], weight: 0.7 },

    // ===================
    // MILD (14 to 19)
    // ===================
    { pattern: 'Blago', tempRange: [14, 20], weight: 1.0 },
    { pattern: '{mild_adj:nom:f} temperatura', tempRange: [14, 20], weight: 0.8 },
    { pattern: 'Umjereno', tempRange: [14, 20], weight: 0.7 },
    { pattern: 'Lagana jaknica dobro dođe', tempRange: [12, 18], weight: 0.4, colorful: true },
    { pattern: 'Pravo proljetno', tempRange: [14, 20], weight: 0.5, colorful: true },
    { pattern: '{mild_adj:nom:n} vrijeme', tempRange: [14, 20], weight: 0.7 },

    // ===================
    // PLEASANT (19 to 25)
    // ===================
    { pattern: 'Ugodno', tempRange: [19, 26], weight: 1.0 },
    { pattern: '{mild_adj:nom:f} temperatura', tempRange: [19, 26], weight: 0.8 },
    { pattern: 'Lijepa temperatura', tempRange: [19, 26], weight: 0.7 },
    { pattern: 'Baš fino', tempRange: [20, 25], weight: 0.6, colorful: true },
    { pattern: 'Kao naručeno', tempRange: [20, 25], weight: 0.4, colorful: true },
    { pattern: 'Idealno vrijeme', tempRange: [20, 25], weight: 0.5, colorful: true },
    { pattern: '{mild_adj:nom:n} je vani', tempRange: [19, 26], weight: 0.7 },
    { pattern: 'Savršeno vrijeme', tempRange: [20, 25], weight: 0.4, colorful: true },

    // ===================
    // WARM (25 to 30)
    // ===================
    { pattern: 'Toplo', tempRange: [25, 32], weight: 1.0 },
    { pattern: 'Lijepo toplo', tempRange: [25, 30], weight: 0.8 },
    { pattern: 'Ugodno toplo', tempRange: [24, 29], weight: 0.7 },
    { pattern: '{warm_adj:nom:n} je', tempRange: [25, 32], weight: 0.7 },
    { pattern: 'Terasa vrijeme', tempRange: [24, 30], weight: 0.5, colorful: true },
    { pattern: 'Kratki rukavi vrijeme', tempRange: [24, 30], weight: 0.5, colorful: true },
    { pattern: '{warm_adj:nom:f} {hot_noun:nom}', tempRange: [26, 31], weight: 0.6 },

    // ===================
    // HOT (30 to 36)
    // ===================
    { pattern: 'Vruće', tempRange: [30, 38], weight: 1.0 },
    { pattern: 'Jako vruće', tempRange: [32, 40], weight: 0.8 },
    { pattern: 'Vrućina', tempRange: [30, 38], weight: 0.9 },
    { pattern: 'Za kupanje', tempRange: [28, 36], weight: 0.5, colorful: true },
    { pattern: 'Dan za sladoled', tempRange: [28, 35], weight: 0.4, colorful: true },
    { pattern: 'More zove', tempRange: [28, 36], weight: 0.4, colorful: true },
    { pattern: '{hot_adj:nom:f} {hot_noun:nom}', tempRange: [30, 38], weight: 0.7 },
    { pattern: '{hot_adj:nom:n} je', tempRange: [30, 38], weight: 0.7 },

    // ===================
    // SCORCHING (36+)
    // ===================
    { pattern: 'Žega', tempRange: [35, 50], weight: 1.0 },
    { pattern: 'Velika vrućina', tempRange: [35, 50], weight: 0.9 },
    { pattern: 'Ekstremna vrućina', tempRange: [38, 50], weight: 0.7 },
    { pattern: 'Pali asfalt', tempRange: [38, 50], weight: 0.4, colorful: true },
    { pattern: 'Vrućina za pod klimu', tempRange: [35, 50], weight: 0.5, colorful: true },
    { pattern: 'Paklena {hot_noun:nom}', tempRange: [38, 50], weight: 0.4, colorful: true },

    // ===================
    // WIND TEMPLATES
    // ===================
    { pattern: '{cold_adj:nom:n}, {wind_adj:nom:m} {wind_noun:nom}', tempRange: [-10, 10], weight: 0.6, minWind: 4 },
    { pattern: 'Vjetrovito', tempRange: [-10, 30], weight: 0.8, minWind: 5 },
    { pattern: '{wind_adj:nom:m} {wind_noun:nom}', tempRange: [-10, 30], weight: 0.7, minWind: 5 },
    { pattern: 'Vjetar probija', tempRange: [-5, 10], weight: 0.5, minWind: 6, colorful: true },
    { pattern: 'Oštar vjetar', tempRange: [-5, 8], weight: 0.6, minWind: 6 },
    { pattern: 'Jak vjetar', tempRange: [-10, 25], weight: 0.7, minWind: 8 },
    { pattern: 'Vjetar ledi', tempRange: [-10, 5], weight: 0.5, minWind: 6, colorful: true },
    { pattern: 'Ledeni vjetar', tempRange: [-10, 3], weight: 0.5, minWind: 5, colorful: true },
    { pattern: 'Ledi do kostiju', tempRange: [-10, 2], weight: 0.4, minWind: 7, colorful: true },
    { pattern: '{mild_adj:nom:n} uz povjetarac', tempRange: [18, 28], weight: 0.6, minWind: 2, maxWind: 5 },

    // ===================
    // HUMIDITY TEMPLATES
    // ===================
    { pattern: 'Vlažno', tempRange: [-5, 30], weight: 0.7, minHumidity: 75 },
    { pattern: '{humid_adj:nom:n} i {cold_adj:nom:n}', tempRange: [-5, 12], weight: 0.6, minHumidity: 75 },
    { pattern: 'Prodorna vlaga', tempRange: [0, 12], weight: 0.5, minHumidity: 80 },
    { pattern: 'Vlaga ulazi u kosti', tempRange: [-2, 10], weight: 0.4, minHumidity: 80, colorful: true },
    { pattern: 'Sparno', tempRange: [26, 40], weight: 0.7, minHumidity: 65 },
    { pattern: 'Teška sparina', tempRange: [28, 42], weight: 0.6, minHumidity: 70, colorful: true },
    { pattern: 'Gušeća sparina', tempRange: [30, 45], weight: 0.5, minHumidity: 75, colorful: true },
    { pattern: 'Kao u sauni', tempRange: [30, 45], weight: 0.4, minHumidity: 75, colorful: true },
    { pattern: 'Zrak stoji', tempRange: [28, 42], weight: 0.4, minHumidity: 70, colorful: true },
    { pattern: 'Suha vrućina', tempRange: [30, 45], weight: 0.5, maxHumidity: 35 },

    // ===================
    // TIME-OF-DAY TEMPLATES
    // ===================
    { pattern: 'Lijepo jutro', tempRange: [15, 26], weight: 0.6, timeOfDay: 'morning' },
    { pattern: 'Jutro za kavu vani', tempRange: [18, 25], weight: 0.4, timeOfDay: 'morning', colorful: true },
    { pattern: '{cold_adj:nom:n} jutro', tempRange: [-5, 10], weight: 0.6, timeOfDay: 'morning' },
    { pattern: 'Zimsko jutro', tempRange: [-5, 5], weight: 0.5, timeOfDay: 'morning' },
    { pattern: '{cool_adj:nom:n} jutro', tempRange: [8, 16], weight: 0.6, timeOfDay: 'morning' },
    { pattern: '{warm_adj:nom:n} jutro', tempRange: [22, 30], weight: 0.6, timeOfDay: 'morning' },
    { pattern: 'Vruće popodne', tempRange: [28, 40], weight: 0.6, timeOfDay: 'afternoon' },
    { pattern: 'Ugodna večer', tempRange: [18, 26], weight: 0.6, timeOfDay: 'evening' },
    { pattern: 'Fina večer za šetnju', tempRange: [18, 25], weight: 0.4, timeOfDay: 'evening', colorful: true },
    { pattern: '{warm_adj:nom:f} večer', tempRange: [22, 30], weight: 0.6, timeOfDay: 'evening' },
    { pattern: 'Vruća večer', tempRange: [26, 35], weight: 0.6, timeOfDay: 'evening' },
    { pattern: '{cold_adj:nom:f} noć', tempRange: [-10, 8], weight: 0.6, timeOfDay: 'night' },
    { pattern: 'Svježa noć', tempRange: [10, 18], weight: 0.6, timeOfDay: 'night' },
    { pattern: 'Prohladna noć', tempRange: [8, 14], weight: 0.6, timeOfDay: 'night' },
    { pattern: '{warm_adj:nom:f} noć', tempRange: [18, 28], weight: 0.6, timeOfDay: 'night' },

    // ===================
    // IDIOMATIC/COLORFUL
    // ===================
    { pattern: 'Za pod dekicu', tempRange: [-5, 8], weight: 0.4, colorful: true },
    { pattern: 'Neugodno vrijeme', tempRange: [-5, 12], weight: 0.4, minHumidity: 70 },
    { pattern: 'Idealno za šetnju', tempRange: [18, 25], weight: 0.4, colorful: true },
    { pattern: 'Vjetar osvježava', tempRange: [22, 30], weight: 0.5, minWind: 3, maxWind: 6, colorful: true },
];

// =============================================================================
// WEATHER CODE TEMPLATES (WMO-based)
// =============================================================================
// Templates organized by weather category from Open-Meteo weather codes.
// These take priority when a weather code is available.

/**
 * Weather templates organized by WMO weather code category.
 * Each template can optionally have:
 * - intensity: 'light' | 'moderate' | 'heavy' - matches getIntensity() result
 * - freezing: true - matches isFreezingPrecipitation()
 * - hail: true - matches hasHail()
 * - tempRange: [min, max] - effective temperature constraint
 * - timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
 * - weight: selection probability (default 1.0)
 */
const WEATHER_TEMPLATES = {
    // ===================
    // CLEAR (codes 0-1)
    // ===================
    clear: [
        // Basic
        { pattern: 'Vedro', weight: 1.0 },
        { pattern: 'Sunčano', weight: 1.0 },
        { pattern: 'Pretežno sunčano', weight: 0.8 },
        { pattern: 'Vedro nebo', weight: 0.7 },
        { pattern: '{clear_adj:nom:n} vrijeme', weight: 0.7 },
        { pattern: '{clear_adj:nom:m} dan', weight: 0.7, timeOfDay: 'afternoon' },
        // Temperature modifiers
        { pattern: 'Vedro i {warm_adj:nom:n}', weight: 0.6, tempRange: [20, 30] },
        { pattern: 'Sunčano i {hot_adj:nom:n}', weight: 0.6, tempRange: [28, 45] },
        { pattern: 'Vedro i {cold_adj:nom:n}', weight: 0.6, tempRange: [-20, 5] },
        { pattern: 'Sunčano, ali {cold_adj:nom:n}', weight: 0.5, tempRange: [-10, 8] },
        // Colorful
        { pattern: 'Sunce sja', weight: 0.5, colorful: true },
        { pattern: 'Sunce grije', weight: 0.5, tempRange: [20, 35], colorful: true },
        { pattern: 'Sunce prži', weight: 0.4, tempRange: [32, 50], colorful: true },
        { pattern: 'Nebo bez oblačka', weight: 0.4, colorful: true },
        // Time-specific
        { pattern: 'Sunčano jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: 'Vedra večer', weight: 0.6, timeOfDay: 'evening' },
        { pattern: 'Vedra noć', weight: 0.6, timeOfDay: 'night' },
    ],

    // ===================
    // CLOUDY (codes 2-3)
    // ===================
    cloudy: [
        // Basic
        { pattern: 'Oblačno', weight: 1.0 },
        { pattern: 'Pretežno oblačno', weight: 0.9 },
        { pattern: 'Djelomice sunčano', weight: 0.8 },
        { pattern: 'Promjenljivo oblačno', weight: 0.7 },
        { pattern: '{cloudy_adj:nom:n}', weight: 0.7 },
        { pattern: '{cloudy_adj:nom:n} vrijeme', weight: 0.6 },
        { pattern: '{cloudy_adj:nom:m} dan', weight: 0.6, timeOfDay: 'afternoon' },
        // Temperature modifiers
        { pattern: 'Oblačno i {cold_adj:nom:n}', weight: 0.6, tempRange: [-10, 10] },
        { pattern: 'Oblačno i {warm_adj:nom:n}', weight: 0.5, tempRange: [20, 30] },
        // Colorful
        { pattern: 'Tmurno', weight: 0.5, colorful: true },
        { pattern: 'Sivo nebo', weight: 0.4, colorful: true },
        { pattern: 'Oblaci dominiraju', weight: 0.3, colorful: true },
        // Time-specific
        { pattern: 'Oblačno jutro', weight: 0.5, timeOfDay: 'morning' },
    ],

    // ===================
    // FOG (codes 45, 48)
    // ===================
    fog: [
        // Basic
        { pattern: 'Magla', weight: 1.0 },
        { pattern: 'Gusta magla', weight: 0.7 },
        { pattern: 'Smanjena vidljivost', weight: 0.6 },
        { pattern: 'Magleno', weight: 0.8 },
        // Time-specific
        { pattern: 'Jutarnja magla', weight: 0.8, timeOfDay: 'morning' },
        { pattern: 'Noćna magla', weight: 0.6, timeOfDay: 'night' },
        // Colorful
        { pattern: 'Magla prekriva', weight: 0.4, colorful: true },
        { pattern: 'Gusto kao mlijeko', weight: 0.3, colorful: true },
    ],

    // ===================
    // DRIZZLE (codes 51-57)
    // ===================
    drizzle: [
        // Basic
        { pattern: 'Sitna kiša', weight: 1.0 },
        { pattern: 'Rosulja', weight: 0.8 },
        { pattern: 'Kiša rominja', weight: 0.7 },
        { pattern: 'Sijeva kiša', weight: 0.6 },
        // Freezing
        { pattern: 'Ledena kiša', weight: 1.0, freezing: true },
        { pattern: 'Kiša koja se smrzava', weight: 0.6, freezing: true },
        { pattern: 'Poledica moguća', weight: 0.5, freezing: true },
        // Temperature modifiers
        { pattern: 'Sitna kiša i {cold_adj:nom:n}', weight: 0.5, tempRange: [-5, 10] },
        // Colorful
        { pattern: 'Kapljica po kapljica', weight: 0.3, colorful: true },
    ],

    // ===================
    // RAIN (codes 61-67, 80-82)
    // ===================
    rain: [
        // Basic
        { pattern: 'Kiša', weight: 1.0 },
        { pattern: 'Pada kiša', weight: 0.9 },
        { pattern: 'Kišovito', weight: 0.8 },
        // Intensity: light
        { pattern: 'Slaba kiša', weight: 0.8, intensity: 'light' },
        { pattern: 'Lagana kiša', weight: 0.7, intensity: 'light' },
        // Intensity: moderate
        { pattern: 'Umjerena kiša', weight: 0.7, intensity: 'moderate' },
        { pattern: 'Kiša', weight: 1.0, intensity: 'moderate' },
        // Intensity: heavy
        { pattern: 'Jaka kiša', weight: 0.9, intensity: 'heavy' },
        { pattern: 'Obilna kiša', weight: 0.8, intensity: 'heavy' },
        { pattern: 'Pljusak', weight: 0.8, intensity: 'heavy' },
        // Freezing
        { pattern: 'Ledena kiša', weight: 1.0, freezing: true },
        { pattern: 'Poledica', weight: 0.7, freezing: true },
        // Colorful
        { pattern: 'Kiša lije', weight: 0.5, intensity: 'heavy', colorful: true },
        { pattern: 'Kiša pljušti', weight: 0.4, intensity: 'heavy', colorful: true },
        { pattern: 'Lije kao iz kabla', weight: 0.3, intensity: 'heavy', colorful: true },
        // Temperature modifiers
        { pattern: 'Kiša i {cold_adj:nom:n}', weight: 0.5, tempRange: [-5, 12] },
        { pattern: '{warm_adj:nom:f} kiša', weight: 0.4, tempRange: [18, 30] },
    ],

    // ===================
    // SNOW (codes 71-77, 85-86)
    // ===================
    snow: [
        // Basic
        { pattern: 'Snijeg', weight: 1.0 },
        { pattern: 'Pada snijeg', weight: 0.9 },
        { pattern: 'Sniježi', weight: 0.8 },
        // Intensity: light
        { pattern: 'Slab snijeg', weight: 0.8, intensity: 'light' },
        { pattern: 'Lagani snijeg', weight: 0.7, intensity: 'light' },
        // Intensity: moderate
        { pattern: 'Umjeren snijeg', weight: 0.7, intensity: 'moderate' },
        // Intensity: heavy
        { pattern: 'Jak snijeg', weight: 0.8, intensity: 'heavy' },
        { pattern: 'Obilan snijeg', weight: 0.7, intensity: 'heavy' },
        { pattern: 'Snježna mećava', weight: 0.5, intensity: 'heavy' },
        // Mixed
        { pattern: 'Susnježica', weight: 0.8, tempRange: [-2, 3] },
        { pattern: 'Mokri snijeg', weight: 0.7, tempRange: [-1, 2] },
        // Colorful
        { pattern: 'Pahulje padaju', weight: 0.4, colorful: true },
        { pattern: 'Bijeli pokrivač', weight: 0.3, intensity: 'heavy', colorful: true },
    ],

    // ===================
    // THUNDERSTORM (codes 95-99)
    // ===================
    thunderstorm: [
        // Basic
        { pattern: 'Grmljavina', weight: 1.0 },
        { pattern: 'Nevrijeme', weight: 0.9 },
        { pattern: 'Grmljavinsko nevrijeme', weight: 0.7 },
        { pattern: 'Oluja', weight: 0.7 },
        { pattern: 'Grmljavinski pljusak', weight: 0.6 },
        // With hail
        { pattern: 'Grmljavina s tučom', weight: 1.0, hail: true },
        { pattern: 'Tuča', weight: 0.9, hail: true },
        { pattern: 'Nevrijeme s tučom', weight: 0.7, hail: true },
        // Colorful
        { pattern: 'Grmi i sijeva', weight: 0.5, colorful: true },
        { pattern: 'Olujno nevrijeme', weight: 0.4, colorful: true },
        { pattern: 'Munje paraju nebo', weight: 0.3, colorful: true },
    ],
};

// =============================================================================
// DECLENSION ENGINE
// =============================================================================

/**
 * Declines a noun to the specified case.
 * @param {string} word - Nominative form of the noun
 * @param {string} targetCase - Target grammatical case (nom, gen, dat, acc, voc, loc, ins)
 * @returns {string} Declined form
 */
function declineNoun(word, targetCase) {
    const entry = NOUNS[word];
    if (entry && entry[targetCase]) {
        return entry[targetCase];
    }
    // Fallback: return the word unchanged
    return word;
}

/**
 * Declines an adjective to match the specified case and gender.
 * @param {string} word - Dictionary form of the adjective
 * @param {string} targetCase - Target grammatical case
 * @param {string} targetGender - Target gender (m, f, n)
 * @returns {string} Declined form
 */
function declineAdjective(word, targetCase, targetGender) {
    const entry = ADJECTIVES[word];
    if (entry && entry[targetGender] && entry[targetGender][targetCase]) {
        return entry[targetGender][targetCase];
    }
    // Fallback: return the word unchanged
    return word;
}

/**
 * Gets the gender of a noun from the lexicon.
 * @param {string} word - Noun to look up
 * @returns {string} Gender ('m', 'f', or 'n')
 */
function getNounGender(word) {
    const entry = NOUNS[word];
    return entry ? entry.gender : 'm'; // Default to masculine
}

// =============================================================================
// WEIGHTED RANDOM SELECTION
// =============================================================================

/**
 * Picks a random item from a pool using weights.
 * @param {Array<{word: string, weight: number}>} pool - Pool of items with weights
 * @param {Object} context - Weather context for filtering (temp, humidity, wind)
 * @returns {{word: string, weight: number}|null} Selected item or null if pool is empty
 */
function weightedPick(pool, context) {
    // Filter pool based on constraints
    const filtered = pool.filter(item => {
        if (item.minTemp !== undefined && context.effTemp < item.minTemp) return false;
        if (item.maxTemp !== undefined && context.effTemp > item.maxTemp) return false;
        if (item.minHumidity !== undefined && (context.humidity ?? 50) < item.minHumidity) return false;
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

// =============================================================================
// TEMPLATE FILLING
// =============================================================================

/**
 * Fills a template pattern with appropriate words.
 * Handles slot syntax: {pool:case} or {pool:case:gender}
 * @param {string} pattern - Template pattern with slots
 * @param {Object} context - Weather context
 * @returns {string} Filled template
 */
function fillTemplate(pattern, context) {
    // Match slots like {pool:case} or {pool:case:gender}
    return pattern.replace(/\{(\w+):(\w+)(?::(\w+))?\}/g, (match, poolName, caseForm, explicitGender) => {
        const pool = SYNONYMS[poolName];
        if (!pool) return match; // Keep original if pool not found

        const selected = weightedPick(pool, context);
        if (!selected) return match;

        const word = selected.word;

        // Determine if it's an adjective or noun
        if (ADJECTIVES[word]) {
            // For adjectives, we need gender
            // If explicit gender given, use it; otherwise infer from context
            const gender = explicitGender || 'm';
            return declineAdjective(word, caseForm, gender);
        } else if (NOUNS[word]) {
            return declineNoun(word, caseForm);
        }

        // Unknown word type, return as-is
        return word;
    });
}

// =============================================================================
// MAIN DESCRIPTION GENERATION
// =============================================================================

/**
 * Generates a weather description using the NLG template system.
 * @param {number} temp - Air temperature (°C)
 * @param {number|null} humidity - Relative humidity (%)
 * @param {number|null} windSpeed - Wind speed (m/s)
 * @param {number|null} dewpoint - Dewpoint temperature (°C) - unused but kept for API compatibility
 * @param {number|null} weatherCode - WMO weather code from Open-Meteo (optional)
 * @returns {string} Weather description in Croatian
 */
export function generateWeatherDescription(temp, humidity, windSpeed, dewpoint, weatherCode = null) {
    // Calculate effective temperature (with wind chill)
    const effTemp = effectiveTemp(temp, windSpeed);

    // Build context for template selection and word filtering
    const context = {
        temp,
        effTemp,
        humidity,
        wind: windSpeed,
    };

    // Get time of day for time-specific templates
    const timeOfDay = getTimeOfDay();

    // If weather code is available, try weather-code-based templates first
    if (weatherCode !== null) {
        const category = getWeatherCategory(weatherCode);
        if (category && WEATHER_TEMPLATES[category]) {
            const result = selectWeatherCodeTemplate(category, weatherCode, effTemp, timeOfDay, context);
            if (result) {
                return result;
            }
        }
    }

    // Fall back to temperature-based templates
    return selectTemperatureTemplate(effTemp, windSpeed, humidity, timeOfDay, context);
}

// =============================================================================
// COMPOSITIONAL GENERATION SYSTEM
// =============================================================================
// Generates descriptions by combining weather elements using fuzzy logic
// and morphological agreement.

/**
 * Determines the "noteworthiness" of each weather dimension.
 * Returns a score 0-1 for how much each aspect deserves mention.
 * @param {Object} context - Weather context
 * @param {string} category - Weather category from code
 * @param {number} weatherCode - WMO weather code
 * @returns {{temp: number, wind: number, humidity: number, weather: number}}
 */
function getNoteworthiness(context, category, weatherCode) {
    const { effTemp, wind, humidity } = context;

    // Temperature noteworthiness - extreme temps are more noteworthy
    let tempScore = 0;
    if (effTemp <= -10) tempScore = 1.0;
    else if (effTemp <= -5) tempScore = 0.9;
    else if (effTemp <= 0) tempScore = 0.8;
    else if (effTemp <= 5) tempScore = 0.7;
    else if (effTemp <= 10) tempScore = 0.5;
    else if (effTemp <= 15) tempScore = 0.3;
    else if (effTemp <= 20) tempScore = 0.2;  // Mild - less noteworthy
    else if (effTemp <= 25) tempScore = 0.2;
    else if (effTemp <= 30) tempScore = 0.4;
    else if (effTemp <= 35) tempScore = 0.7;
    else tempScore = 0.9;

    // Wind noteworthiness
    const w = wind ?? 0;
    let windScore = 0;
    if (w >= 10) windScore = 1.0;
    else if (w >= 7) windScore = 0.8;
    else if (w >= 5) windScore = 0.6;
    else if (w >= 3) windScore = 0.3;
    else windScore = 0.1;

    // Humidity noteworthiness (mainly at extremes)
    const h = humidity ?? 50;
    let humidityScore = 0;
    if (h >= 85) humidityScore = 0.7;
    else if (h >= 75) humidityScore = 0.4;
    else if (h <= 30) humidityScore = 0.5;  // Very dry
    else humidityScore = 0.1;

    // Weather condition noteworthiness
    let weatherScore = 1.0;  // Weather code conditions are always noteworthy
    if (category === 'clear') weatherScore = 0.7;  // Clear is "default", slightly less
    if (category === 'cloudy') weatherScore = 0.6;

    return { temp: tempScore, wind: windScore, humidity: humidityScore, weather: weatherScore };
}

/**
 * Gets the base weather phrase for a category/code.
 * @param {string} category
 * @param {number} weatherCode
 * @param {Object} context
 * @returns {{phrase: string, adjectival: string|null}}
 */
function getWeatherPhrase(category, weatherCode, context) {
    const intensity = getIntensity(weatherCode);
    const freezing = isFreezingPrecipitation(weatherCode);
    const hail = hasHail(weatherCode);

    // Each category returns a noun phrase and optional adjectival form
    switch (category) {
        case 'clear':
            return pickOne([
                { phrase: 'vedro', adjectival: 'vedro' },
                { phrase: 'sunčano', adjectival: 'sunčano' },
                { phrase: 'vedro nebo', adjectival: 'vedro' },
            ]);
        case 'cloudy':
            return pickOne([
                { phrase: 'oblačno', adjectival: 'oblačno' },
                { phrase: 'pretežno oblačno', adjectival: 'oblačno' },
                { phrase: 'djelomice sunčano', adjectival: null },
                { phrase: 'promjenljivo oblačno', adjectival: 'oblačno' },
            ]);
        case 'fog':
            return pickOne([
                { phrase: 'magla', adjectival: 'magleno' },
                { phrase: 'gusta magla', adjectival: 'magleno' },
                { phrase: 'magleno', adjectival: 'magleno' },
            ]);
        case 'drizzle':
            if (freezing) {
                return { phrase: 'ledena kiša', adjectival: 'ledeno' };
            }
            return pickOne([
                { phrase: 'sitna kiša', adjectival: 'kišovito' },
                { phrase: 'rosulja', adjectival: 'kišovito' },
                { phrase: 'kiša rominja', adjectival: 'kišovito' },
            ]);
        case 'rain':
            if (freezing) {
                return { phrase: 'ledena kiša', adjectival: 'ledeno' };
            }
            if (intensity === 'heavy') {
                return pickOne([
                    { phrase: 'jaka kiša', adjectival: 'kišovito' },
                    { phrase: 'pljusak', adjectival: 'kišovito' },
                    { phrase: 'obilna kiša', adjectival: 'kišovito' },
                ]);
            }
            if (intensity === 'light') {
                return pickOne([
                    { phrase: 'slaba kiša', adjectival: 'kišovito' },
                    { phrase: 'lagana kiša', adjectival: 'kišovito' },
                ]);
            }
            return pickOne([
                { phrase: 'kiša', adjectival: 'kišovito' },
                { phrase: 'pada kiša', adjectival: 'kišovito' },
            ]);
        case 'snow':
            if (context.effTemp >= -1 && context.effTemp <= 2) {
                return pickOne([
                    { phrase: 'susnježica', adjectival: null },
                    { phrase: 'mokri snijeg', adjectival: null },
                ]);
            }
            if (intensity === 'heavy') {
                return pickOne([
                    { phrase: 'jak snijeg', adjectival: 'snježno' },
                    { phrase: 'obilan snijeg', adjectival: 'snježno' },
                    { phrase: 'sniježi', adjectival: 'snježno' },
                ]);
            }
            if (intensity === 'light') {
                return pickOne([
                    { phrase: 'slab snijeg', adjectival: 'snježno' },
                    { phrase: 'lagani snijeg', adjectival: 'snježno' },
                ]);
            }
            return pickOne([
                { phrase: 'snijeg', adjectival: 'snježno' },
                { phrase: 'pada snijeg', adjectival: 'snježno' },
                { phrase: 'sniježi', adjectival: 'snježno' },
            ]);
        case 'thunderstorm':
            if (hail) {
                return pickOne([
                    { phrase: 'grmljavina s tučom', adjectival: null },
                    { phrase: 'nevrijeme s tučom', adjectival: null },
                    { phrase: 'tuča', adjectival: null },
                ]);
            }
            return pickOne([
                { phrase: 'grmljavina', adjectival: null },
                { phrase: 'nevrijeme', adjectival: null },
                { phrase: 'grmljavinski pljusak', adjectival: null },
            ]);
        default:
            return { phrase: 'promjenljivo', adjectival: null };
    }
}

/**
 * Gets temperature descriptor based on effective temperature.
 * Returns forms for different grammatical needs.
 * @param {number} effTemp
 * @returns {{adjective: string, adverb: string, noun: string|null, pool: string}}
 */
function getTempDescriptor(effTemp) {
    if (effTemp <= -10) return { adjective: 'leden', adverb: 'ledeno', noun: 'mraz', pool: 'cold_adj' };
    if (effTemp <= -5) return { adjective: 'studen', adverb: 'studeno', noun: 'studen', pool: 'cold_adj' };
    if (effTemp <= 0) return { adjective: 'hladan', adverb: 'hladno', noun: 'mraz', pool: 'cold_adj' };
    if (effTemp <= 5) return { adjective: 'hladan', adverb: 'hladno', noun: 'hladnoća', pool: 'cold_adj' };
    if (effTemp <= 10) return { adjective: 'prohladan', adverb: 'prohladno', noun: null, pool: 'cold_adj' };
    if (effTemp <= 15) return { adjective: 'svjež', adverb: 'svježe', noun: 'svježina', pool: 'cool_adj' };
    if (effTemp <= 20) return { adjective: 'blag', adverb: 'blago', noun: null, pool: 'mild_adj' };
    if (effTemp <= 25) return { adjective: 'ugodan', adverb: 'ugodno', noun: 'ugoda', pool: 'mild_adj' };
    if (effTemp <= 30) return { adjective: 'topao', adverb: 'toplo', noun: 'toplina', pool: 'warm_adj' };
    if (effTemp <= 35) return { adjective: 'vruć', adverb: 'vruće', noun: 'vrućina', pool: 'hot_adj' };
    return { adjective: 'vruć', adverb: 'jako vruće', noun: 'žega', pool: 'hot_adj' };
}

/**
 * Gets wind descriptor.
 * @param {number|null} wind - Wind speed in m/s
 * @returns {{adjective: string, adverb: string, noun: string}|null}
 */
function getWindDescriptor(wind) {
    if (!wind || wind < 3) return null;
    if (wind >= 10) return { adjective: 'jak', adverb: 'jako vjetrovito', noun: 'olujni vjetar' };
    if (wind >= 7) return { adjective: 'jak', adverb: 'vjetrovito', noun: 'jak vjetar' };
    if (wind >= 5) return { adjective: 'umjeren', adverb: 'vjetrovito', noun: 'vjetar' };
    return { adjective: 'lagan', adverb: 'lagano vjetrovito', noun: 'povjetarac' };
}

/**
 * Gets humidity descriptor.
 * @param {number|null} humidity
 * @param {number} effTemp
 * @returns {{adjective: string, adverb: string}|null}
 */
function getHumidityDescriptor(humidity, effTemp) {
    if (humidity === null) return null;
    if (humidity >= 80 && effTemp >= 25) return { adjective: 'sparan', adverb: 'sparno' };
    if (humidity >= 80 && effTemp <= 10) return { adjective: 'vlažan', adverb: 'neugodno vlažno' };
    if (humidity >= 75) return { adjective: 'vlažan', adverb: 'vlažno' };
    if (humidity <= 30) return { adjective: 'suh', adverb: 'suho' };
    return null;
}

/**
 * Picks one item randomly from an array.
 */
function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Compositional sentence patterns for combining weather elements.
 * Each pattern is a function that takes descriptors and returns a sentence.
 * Patterns are weighted by how natural they sound.
 */
const COMPOSITION_PATTERNS = [
    // Weather + temperature: "Kiša, hladno"
    {
        weight: 1.0,
        needs: ['weather', 'temp'],
        generate: (w, t) => `${w.phrase}, ${t.adverb}`
    },
    // Weather + temperature (conjunction): "Kiša i hladno"
    {
        weight: 0.8,
        needs: ['weather', 'temp'],
        generate: (w, t) => `${w.phrase} i ${t.adverb}`
    },
    // Adjectival weather + temperature: "Kišovito i hladno"
    {
        weight: 0.7,
        needs: ['weather', 'temp'],
        filter: (w) => w.adjectival !== null,
        generate: (w, t) => `${w.adjectival} i ${t.adverb}`
    },
    // Temperature + weather (inverted): "Hladno, pada kiša"
    {
        weight: 0.5,
        needs: ['weather', 'temp'],
        generate: (w, t) => `${t.adverb}, ${w.phrase}`
    },
    // Weather + wind: "Kiša i vjetar"
    {
        weight: 0.9,
        needs: ['weather', 'wind'],
        generate: (w, _, wind) => `${w.phrase} i ${wind.noun}`
    },
    // Weather + temperature + wind: "Kiša, hladno i vjetrovito"
    {
        weight: 0.8,
        needs: ['weather', 'temp', 'wind'],
        generate: (w, t, wind) => `${w.phrase}, ${t.adverb} i ${wind.adverb}`
    },
    // Weather + wind + temperature: "Kiša uz jak vjetar, hladno"
    {
        weight: 0.6,
        needs: ['weather', 'temp', 'wind'],
        generate: (w, t, wind) => `${w.phrase} uz ${wind.noun}, ${t.adverb}`
    },
    // Weather alone (for mild conditions or thunderstorms)
    {
        weight: 0.5,
        needs: ['weather'],
        generate: (w) => w.phrase
    },
    // Weather + humidity: "Kiša, vlažno"
    {
        weight: 0.6,
        needs: ['weather', 'humidity'],
        generate: (w, _, __, h) => `${w.phrase}, ${h.adverb}`
    },
    // Temperature + humidity (no precipitation): "Sparno i vruće"
    {
        weight: 0.7,
        needs: ['temp', 'humidity'],
        filter: (w) => w.adjectival !== null && ['clear', 'cloudy'].includes(w.category),
        generate: (w, t, _, h) => `${h.adverb} i ${t.adverb}`
    },
    // Full combination: "Kiša, hladno, vjetrovito"
    {
        weight: 0.4,
        needs: ['weather', 'temp', 'wind'],
        generate: (w, t, wind) => `${w.phrase}, ${t.adverb}, ${wind.adverb}`
    },
];

/**
 * Generates a compositional weather description combining all relevant elements.
 * Uses fuzzy logic to decide which elements to include.
 * @param {string} category - Weather category
 * @param {number} weatherCode - WMO weather code
 * @param {Object} context - Weather context (effTemp, wind, humidity)
 * @returns {string} Generated description
 */
function generateCompositionalDescription(category, weatherCode, context) {
    const scores = getNoteworthiness(context, category, weatherCode);

    // Get descriptors for each element
    const weather = getWeatherPhrase(category, weatherCode, context);
    weather.category = category;
    const temp = getTempDescriptor(context.effTemp);
    const wind = getWindDescriptor(context.wind);
    const humidity = getHumidityDescriptor(context.humidity, context.effTemp);

    // Decide which elements to include based on noteworthiness + randomness
    const includeTemp = Math.random() < scores.temp + 0.2;  // Bias toward including temp
    const includeWind = wind && Math.random() < scores.wind;
    const includeHumidity = humidity && Math.random() < scores.humidity;

    // Build list of available elements
    const available = new Set(['weather']);
    if (includeTemp) available.add('temp');
    if (includeWind) available.add('wind');
    if (includeHumidity) available.add('humidity');

    // Filter patterns that can be satisfied with available elements
    const applicablePatterns = COMPOSITION_PATTERNS.filter(p => {
        // Check all needed elements are available
        if (!p.needs.every(n => available.has(n))) return false;
        // Check additional filter if present
        if (p.filter && !p.filter(weather)) return false;
        return true;
    });

    if (applicablePatterns.length === 0) {
        // Fallback: just return weather phrase
        return weather.phrase;
    }

    // Weighted selection of pattern
    const selected = weightedSelect(applicablePatterns);

    // Generate the description
    return selected.generate(weather, temp, wind, humidity);
}

/**
 * Selects and generates a description based on weather code.
 * Uses compositional generation for natural, varied descriptions.
 * @param {string} category - Weather category (clear, cloudy, fog, etc.)
 * @param {number} weatherCode - WMO weather code
 * @param {number} effTemp - Effective temperature
 * @param {string} timeOfDay - Current time of day
 * @param {Object} context - Template filling context
 * @returns {string|null} Generated description or null if no match
 */
function selectWeatherCodeTemplate(category, weatherCode, effTemp, timeOfDay, context) {
    // Use compositional generation
    return generateCompositionalDescription(category, weatherCode, context);
}

/**
 * Selects and fills a template from TEMPLATES based on temperature.
 * @param {number} effTemp - Effective temperature
 * @param {number|null} windSpeed - Wind speed
 * @param {number|null} humidity - Humidity
 * @param {string} timeOfDay - Current time of day
 * @param {Object} context - Template filling context
 * @returns {string} Filled template
 */
function selectTemperatureTemplate(effTemp, windSpeed, humidity, timeOfDay, context) {
    // Filter templates that match current conditions
    const applicableTemplates = TEMPLATES.filter(t => {
        // Check temperature range
        if (effTemp < t.tempRange[0] || effTemp > t.tempRange[1]) return false;

        // Check wind constraints
        if (t.minWind !== undefined && (windSpeed ?? 0) < t.minWind) return false;
        if (t.maxWind !== undefined && (windSpeed ?? 0) > t.maxWind) return false;

        // Check humidity constraints
        if (t.minHumidity !== undefined && (humidity ?? 50) < t.minHumidity) return false;
        if (t.maxHumidity !== undefined && (humidity ?? 50) > t.maxHumidity) return false;

        // Check time of day
        if (t.timeOfDay !== undefined && t.timeOfDay !== timeOfDay) return false;

        return true;
    });

    // If no templates match, use simple fallback
    if (applicableTemplates.length === 0) {
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

    return fillTemplate(weightedSelect(applicableTemplates).pattern, context);
}

/**
 * Weighted random selection from a list of templates.
 * @param {Array<{pattern: string, weight?: number}>} templates
 * @returns {{pattern: string, weight?: number}}
 */
function weightedSelect(templates) {
    const totalWeight = templates.reduce((sum, t) => sum + (t.weight ?? 1.0), 0);
    let r = Math.random() * totalWeight;

    for (const t of templates) {
        r -= (t.weight ?? 1.0);
        if (r <= 0) return t;
    }

    return templates[templates.length - 1];
}
