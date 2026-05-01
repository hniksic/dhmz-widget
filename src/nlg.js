/**
 * Weather Widget - Croatian Natural Language Generation
 *
 * Generates varied weather descriptions using:
 * - Template patterns with typed slots
 * - Synonym pools with weighted selection
 * - Croatian morphological declension: nominative, genitive, instrumental
 *   across 3 genders. Other cases (dat/acc/voc/loc) are not currently
 *   exercised by any template; if a future template needs one, add the
 *   relevant column to the affected lexicon entries.
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
    vjetar: { gender: 'm', nom: 'vjetar', gen: 'vjetra', ins: 'vjetrom' },
    povjetarac: { gender: 'm', nom: 'povjetarac', gen: 'povjetarca', ins: 'povjetarcem' },
    mraz: { gender: 'm', nom: 'mraz', gen: 'mraza', ins: 'mrazom' },
    dan: { gender: 'm', nom: 'dan', gen: 'dana', ins: 'danom' },
    // udari = "gusts", lexicalized plural; only plural forms are used.
    udari: { gender: 'm', nom: 'udari', gen: 'udara', ins: 'udarima' },

    // Weather nouns - feminine
    hladnoća: { gender: 'f', nom: 'hladnoća', gen: 'hladnoće', ins: 'hladnoćom' },
    studen: { gender: 'f', nom: 'studen', gen: 'studeni', ins: 'studeni' },
    zima: { gender: 'f', nom: 'zima', gen: 'zime', ins: 'zimom' },
    vrućina: { gender: 'f', nom: 'vrućina', gen: 'vrućine', ins: 'vrućinom' },
    toplina: { gender: 'f', nom: 'toplina', gen: 'topline', ins: 'toplinom' },
    žega: { gender: 'f', nom: 'žega', gen: 'žege', ins: 'žegom' },
    sparina: { gender: 'f', nom: 'sparina', gen: 'sparine', ins: 'sparinom' },
    grmljavina: { gender: 'f', nom: 'grmljavina', gen: 'grmljavine', ins: 'grmljavinom' },

    // Weather nouns - neuter
    vrijeme: { gender: 'n', nom: 'vrijeme', gen: 'vremena', ins: 'vremenom' },
};

const ADJECTIVES = {
    // Cold adjectives
    hladan:    { m: { nom: 'hladan'    }, f: { nom: 'hladna'    }, n: { nom: 'hladno'    } },
    studen:    { m: { nom: 'studen'    }, f: { nom: 'studena'   }, n: { nom: 'studeno'   } },
    leden:     { m: { nom: 'leden'     }, f: { nom: 'ledena'    }, n: { nom: 'ledeno'    } },
    prohladan: { m: { nom: 'prohladan' }, f: { nom: 'prohladna' }, n: { nom: 'prohladno' } },
    oštar:     { m: { nom: 'oštar'     }, f: { nom: 'oštra'     }, n: { nom: 'oštro'     } },
    prodoran:  { m: { nom: 'prodoran'  }, f: { nom: 'prodorna'  }, n: { nom: 'prodorno'  } },

    // Cool/fresh adjectives
    svjež:          { m: { nom: 'svjež'          }, f: { nom: 'svježa'          }, n: { nom: 'svježe'          } },
    osvježavajuć:   { m: { nom: 'osvježavajuć'   }, f: { nom: 'osvježavajuća'   }, n: { nom: 'osvježavajuće'   } },

    // Mild adjectives
    blag:     { m: { nom: 'blag'     }, f: { nom: 'blaga'     }, n: { nom: 'blago'     } },
    umjeren:  { m: { nom: 'umjeren'  }, f: { nom: 'umjerena'  }, n: { nom: 'umjereno'  } },
    ugodan:   { m: { nom: 'ugodan'   }, f: { nom: 'ugodna'    }, n: { nom: 'ugodno'    } },
    prijatan: { m: { nom: 'prijatan' }, f: { nom: 'prijatna'  }, n: { nom: 'prijatno'  } },
    lijep:    { m: { nom: 'lijep'    }, f: { nom: 'lijepa'    }, n: { nom: 'lijepo'    } },

    // Warm adjectives
    topao: { m: { nom: 'topao' }, f: { nom: 'topla' }, n: { nom: 'toplo' } },

    // Hot adjectives
    vruć:   { m: { nom: 'vruć'   }, f: { nom: 'vruća'  }, n: { nom: 'vruće'  } },
    vreo:   { m: { nom: 'vreo'   }, f: { nom: 'vrela'  }, n: { nom: 'vrelo'  } },
    žarki:  { m: { nom: 'žarki'  }, f: { nom: 'žarka'  }, n: { nom: 'žarko'  } },
    sparni: { m: { nom: 'sparni' }, f: { nom: 'sparna' }, n: { nom: 'sparno' } },

    // Humidity adjectives
    vlažan: { m: { nom: 'vlažan' }, f: { nom: 'vlažna' }, n: { nom: 'vlažno' } },

    // Wind adjectives
    vjetrovit: { m: { nom: 'vjetrovit' }, f: { nom: 'vjetrovita' }, n: { nom: 'vjetrovito' } },
    lagan:     { m: { nom: 'lagan'     }, f: { nom: 'lagana'     }, n: { nom: 'lagano'     } },
    jak:       { m: { nom: 'jak'       }, f: { nom: 'jaka'       }, n: { nom: 'jako'       } },

    // Sky adjectives
    vedar:   { m: { nom: 'vedar'   }, f: { nom: 'vedra'   }, n: { nom: 'vedro'   } },
    sunčan:  { m: { nom: 'sunčan'  }, f: { nom: 'sunčana' }, n: { nom: 'sunčano' } },
    oblačan: { m: { nom: 'oblačan' }, f: { nom: 'oblačna' }, n: { nom: 'oblačno' } },
    tmuran:  { m: { nom: 'tmuran'  }, f: { nom: 'tmurna'  }, n: { nom: 'tmurno'  } },
    siv:     { m: { nom: 'siv'     }, f: { nom: 'siva'    }, n: { nom: 'sivo'    } },
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
        // These work as standalone predicates: "hladno je", "Kiša i hladno"
        { word: 'hladan', weight: 1.0 },
        { word: 'studen', weight: 0.7, maxTemp: 0 },
        { word: 'leden', weight: 0.5, maxTemp: -3 },
        { word: 'prohladan', weight: 0.9, minTemp: 5 },
        // Note: oštar, prodoran, zimski require a noun (oštar vjetar, zimski dan)
        // so they can't be used in templates like "Kiša i {cold_adj:nom:n}"
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
        // These work as standalone predicates: "vlažno je", "sparno je"
        { word: 'vlažan', weight: 1.0 },
        { word: 'sparni', weight: 0.8, minTemp: 25 },
        // Note: prodoran requires a noun (prodorna vlaga, prodorna hladnoća)
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
    // Used in instrumental "X s {pool:ins}" condition pairings.
    thunder_noun: [
        { word: 'grmljavina', weight: 1.0 },
    ],
    gust_noun: [
        { word: 'udari', weight: 1.0 },
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
    { pattern: 'Zimski dan', tempRange: [-5, 5], weight: 0.8, timeOfDay: ['morning', 'afternoon'] },
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
    { pattern: 'Dan za sladoled', tempRange: [28, 35], weight: 0.4, timeOfDay: ['morning', 'afternoon'] },
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
    // Instrumental "with X" wind-quality phrases (idiomatic forecast register).
    // Wind thresholds follow Beaufort / DHMZ usage: udari >= 7 m/s (above
    // moderate), pod udarima >= 8 (fresh breeze), olujni udari >= 14 (gale).
    { pattern: 'Vjetar s {gust_noun:ins}', tempRange: [-15, 35], weight: 0.6, minWind: 7 },
    { pattern: 'Jak vjetar s olujnim {gust_noun:ins}', tempRange: [-15, 35], weight: 0.5, minWind: 14 },
    { pattern: 'Pod udarima vjetra', tempRange: [-15, 35], weight: 0.7, minWind: 8 },
    { pattern: 'Hladnoća s vjetrom', tempRange: [-15, 3], weight: 0.6, minWind: 4 },
    { pattern: 'Žestoka hladnoća s vjetrom', tempRange: [-15, -2], weight: 0.4, minWind: 5 },

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
        { pattern: 'Sunčano', weight: 1.0, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Pretežno sunčano', weight: 0.8, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Vedro nebo', weight: 0.7 },
        { pattern: '{clear_adj:nom:n} vrijeme', weight: 0.7, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Sunce sja', weight: 0.5, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Nebo bez oblačka', weight: 0.4 },
        // Temperature combos
        { pattern: 'Vedro i {cold_adj:nom:n}', weight: 0.6, tempRange: [-20, 5] },
        { pattern: 'Sunčano, ali {cold_adj:nom:n}', weight: 0.5, tempRange: [-10, 8], timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Vedro i {cool_adj:nom:n}', weight: 0.6, tempRange: [5, 15] },
        { pattern: 'Sunčano i {mild_adj:nom:n}', weight: 0.6, tempRange: [12, 20], timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Vedro i {warm_adj:nom:n}', weight: 0.6, tempRange: [20, 30] },
        { pattern: 'Sunce grije', weight: 0.5, tempRange: [18, 35], timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Sunčano i {hot_adj:nom:n}', weight: 0.6, tempRange: [28, 45], timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Sunce prži', weight: 0.4, tempRange: [32, 50], timeOfDay: ['morning', 'afternoon'] },
        // Light wind / breeze pairings (instrumental).
        { pattern: 'Vedro s povjetarcem', weight: 0.5, minWind: 2, maxWind: 5 },
        { pattern: 'Sunčano s povjetarcem', weight: 0.5, minWind: 2, maxWind: 5, timeOfDay: ['morning', 'afternoon'] },
        // Time of day
        { pattern: 'Sunčano jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: '{clear_adj:nom:n} jutro', weight: 0.5, timeOfDay: 'morning' },
        { pattern: '{clear_adj:nom:m} dan', weight: 0.6, timeOfDay: 'afternoon' },
        { pattern: 'Vedra večer', weight: 0.6, timeOfDay: 'evening' },
        { pattern: 'Sunčana večer', weight: 0.5, timeOfDay: 'evening' },
        { pattern: 'Tiha vedra večer', weight: 0.4, timeOfDay: 'evening' },
        { pattern: 'Vedra noć', weight: 0.6, timeOfDay: 'night' },
        { pattern: 'Zvjezdana noć', weight: 0.4, timeOfDay: 'night' },
        { pattern: 'Bistra noć', weight: 0.5, timeOfDay: 'night' },
        { pattern: 'Nebo puno zvijezda', weight: 0.3, timeOfDay: 'night' },
    ],

    partly_cloudy: [
        { pattern: 'Djelomice sunčano', weight: 1.0, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Promjenljivo oblačno', weight: 1.0 },
        { pattern: 'Umjereno oblačno', weight: 0.8 },
        { pattern: 'Sunčano uz umjerenu naoblaku', weight: 0.7, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Oblaci i sunce', weight: 0.6, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Povremeno sunce', weight: 0.5, timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Povremeno vedro', weight: 0.5 },
        { pattern: 'Oblaci prolaze', weight: 0.4 },
        // Temperature combos
        { pattern: 'Djelomice sunčano i {warm_adj:nom:n}', weight: 0.6, tempRange: [20, 30], timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Promjenljivo oblačno i {cold_adj:nom:n}', weight: 0.6, tempRange: [-10, 10] },
        { pattern: 'Djelomice sunčano i {mild_adj:nom:n}', weight: 0.5, tempRange: [12, 20], timeOfDay: ['morning', 'afternoon'] },
        { pattern: 'Promjenljivo oblačno, {mild_adj:nom:n}', weight: 0.5, tempRange: [12, 20] },
        // Time of day
        { pattern: 'Djelomice sunčano jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: 'Promjenljivo oblačno popodne', weight: 0.5, timeOfDay: 'afternoon' },
        { pattern: 'Djelomice vedra večer', weight: 0.6, timeOfDay: 'evening' },
        { pattern: 'Promjenljivo oblačna večer', weight: 0.5, timeOfDay: 'evening' },
        { pattern: 'Promjenljivo oblačna noć', weight: 0.5, timeOfDay: 'night' },
        { pattern: 'Djelomice vedra noć', weight: 0.5, timeOfDay: 'night' },
    ],

    cloudy: [
        { pattern: 'Oblačno', weight: 1.0 },
        { pattern: 'Pretežno oblačno', weight: 0.9 },
        { pattern: '{cloudy_adj:nom:n}', weight: 0.7 },
        { pattern: '{cloudy_adj:nom:n} vrijeme', weight: 0.6 },
        { pattern: 'Tmurno', weight: 0.5 },
        { pattern: 'Sivo nebo', weight: 0.4 },
        { pattern: 'Oblaci dominiraju', weight: 0.3 },
        { pattern: 'Gusti oblaci', weight: 0.5 },
        // Temperature combos
        { pattern: 'Oblačno i {cold_adj:nom:n}', weight: 0.6, tempRange: [-10, 10] },
        { pattern: 'Oblačno i {warm_adj:nom:n}', weight: 0.5, tempRange: [20, 30] },
        { pattern: 'Oblačno, {mild_adj:nom:n}', weight: 0.5, tempRange: [12, 20] },
        // Time of day
        { pattern: 'Oblačno jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: '{cloudy_adj:nom:m} dan', weight: 0.6, timeOfDay: 'afternoon' },
        { pattern: 'Oblačna večer', weight: 0.6, timeOfDay: 'evening' },
        { pattern: '{cloudy_adj:nom:f} večer', weight: 0.5, timeOfDay: 'evening' },
        { pattern: 'Oblačna noć', weight: 0.6, timeOfDay: 'night' },
        { pattern: 'Tmurna noć', weight: 0.5, timeOfDay: 'night' },
    ],

    fog: [
        { pattern: 'Magla', weight: 1.0 },
        { pattern: 'Gusta magla', weight: 0.7 },
        { pattern: 'Smanjena vidljivost', weight: 0.6 },
        { pattern: 'Maglovito', weight: 0.8 },
        { pattern: 'Magla prekriva', weight: 0.4 },
        { pattern: 'Gusto kao mlijeko', weight: 0.3 },
        // Temperature combos
        { pattern: 'Magla i {cold_adj:nom:n}', weight: 0.6, tempRange: [-5, 8] },
        { pattern: '{cold_adj:nom:f} magla', weight: 0.5, tempRange: [-5, 5] },
        { pattern: 'Magla s mrazom', weight: 0.6, tempRange: [-10, 0] },
        // Time of day
        { pattern: 'Jutarnja magla', weight: 0.8, timeOfDay: 'morning' },
        { pattern: 'Maglovito jutro', weight: 0.6, timeOfDay: 'morning' },
        { pattern: 'Večernja magla', weight: 0.6, timeOfDay: 'evening' },
        { pattern: 'Maglovita večer', weight: 0.5, timeOfDay: 'evening' },
        { pattern: 'Noćna magla', weight: 0.6, timeOfDay: 'night' },
        { pattern: 'Maglovita noć', weight: 0.5, timeOfDay: 'night' },
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
        { pattern: 'Kiša s vjetrom', weight: 0.5, minWind: 6 },
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
        // Snow + wind (blowing snow).
        { pattern: 'Snijeg s vjetrom', weight: 0.6, minWind: 5 },
        { pattern: 'Susnježica s vjetrom', weight: 0.5, tempRange: [-2, 3], minWind: 5 },
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
        { pattern: 'Grmi i sijeva', weight: 0.5 },
        { pattern: 'Olujno nevrijeme', weight: 0.4 },
        { pattern: 'Munje paraju nebo', weight: 0.3 },
        // Rain + thunder pairings, instrumental "s grmljavinom" -- the
        // standard Croatian forecast formula.
        { pattern: 'Kiša s {thunder_noun:ins}', weight: 0.8, intensity: 'light' },
        { pattern: 'Kiša s {thunder_noun:ins}', weight: 0.8, intensity: 'moderate' },
        { pattern: 'Pljuskovi s {thunder_noun:ins}', weight: 0.7, intensity: 'heavy' },
        { pattern: 'Nevrijeme s olujnim {gust_noun:ins}', weight: 0.5, intensity: 'heavy' },
        // With hail
        { pattern: 'Grmljavina s tučom', weight: 1.0, hail: true },
        { pattern: 'Tuča', weight: 0.9, hail: true },
        { pattern: 'Nevrijeme s tučom', weight: 0.7, hail: true },
        { pattern: 'Pljuskovi s tučom', weight: 0.7, hail: true },
        // Temperature combos (summer storms)
        { pattern: 'Ljetna grmljavina', weight: 0.5, tempRange: [22, 40] },
        { pattern: 'Oluja i {hot_adj:nom:n}', weight: 0.5, tempRange: [25, 40] },
        // Time of day
        { pattern: 'Noćna oluja', weight: 0.6, timeOfDay: 'night' },
        { pattern: 'Grmljavina u noći', weight: 0.5, timeOfDay: 'night' },
        { pattern: 'Večernja grmljavina', weight: 0.6, timeOfDay: 'evening' },
        { pattern: 'Popodnevna oluja', weight: 0.5, timeOfDay: 'afternoon' },
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

        // Dispatch by pool suffix, not by lexicon membership: some words
        // (e.g. "studen") exist as both noun and adjective, so the lexicon
        // check is ambiguous.
        if (poolName.endsWith('_adj')) {
            const gender = explicitGender || 'm';
            return declineAdjective(word, caseForm, gender);
        } else if (poolName.endsWith('_noun')) {
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
        if (t.timeOfDay !== undefined) {
            const allowed = Array.isArray(t.timeOfDay) ? t.timeOfDay : [t.timeOfDay];
            if (!allowed.includes(timeOfDay)) return false;
        }
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
        if (t.timeOfDay !== undefined) {
            const allowed = Array.isArray(t.timeOfDay) ? t.timeOfDay : [t.timeOfDay];
            if (!allowed.includes(timeOfDay)) return false;
        }
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
