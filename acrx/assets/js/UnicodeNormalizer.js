
/*
========================================================
 ULTRA ROBUST UNICODE NORMALIZER / HOMOGLYPH CLEANER
========================================================

Features:
✓ Fancy Unicode → ASCII
✓ Homoglyph normalization
✓ Confusable detection
✓ Invisible character stripping
✓ Zero-width cleanup
✓ Fullwidth normalization
✓ Leetspeak decoding
✓ Emoji stripping (optional)
✓ Repeated-char limiting
✓ Unicode script detection
✓ Username sanitization
✓ Slug generation
✓ Security-oriented normalization
✓ Bidirectional text cleanup
✓ Control character removal
✓ Custom mappings
✓ Production-grade architecture

Works in:
✓ Node.js
✓ Bun
✓ Deno
✓ Browsers

========================================================
*/

class UltraUnicodeNormalizer {
  constructor(options = {}) {
    this.options = {
      lowercase: false,
      removeDiacritics: true,
      removeInvisible: true,
      removeControlChars: true,
      removeEmojis: false,
      collapseWhitespace: true,
      trim: true,
      decodeLeetspeak: true,
      normalizeWhitespace: true,
      removeBidi: true,
      limitRepeats: false,
      maxRepeats: 3,
      customMap: {},
      preserveNewlines: false,
      asciiOnly: false,
      ...options
    };

    this.map = this.buildCharacterMap();
  }

  buildCharacterMap() {
    return {
      // =========================
      // LATIN SPECIALS
      // =========================
      'ß': 'ss',
      'ẞ': 'SS',
      'æ': 'ae',
      'Æ': 'AE',
      'œ': 'oe',
      'Œ': 'OE',
      'ø': 'o',
      'Ø': 'O',
      'ð': 'd',
      'Ð': 'D',
      'þ': 'th',
      'Þ': 'TH',
      'ł': 'l',
      'Ł': 'L',
      'ƒ': 'f',

      // =========================
      // GREEK HOMOGLYPHS
      // =========================
      'Α': 'A',
      'Β': 'B',
      'Ε': 'E',
      'Ζ': 'Z',
      'Η': 'H',
      'Ι': 'I',
      'Κ': 'K',
      'Μ': 'M',
      'Ν': 'N',
      'Ο': 'O',
      'Ρ': 'P',
      'Τ': 'T',
      'Χ': 'X',

      'α': 'a',
      'β': 'b',
      'γ': 'y',
      'δ': 'd',
      'ε': 'e',
      'ι': 'i',
      'κ': 'k',
      'μ': 'm',
      'ν': 'v',
      'ο': 'o',
      'ρ': 'p',
      'τ': 't',
      'υ': 'u',
      'χ': 'x',

      // =========================
      // CYRILLIC HOMOGLYPHS
      // =========================
      'А': 'A',
      'В': 'B',
      'Е': 'E',
      'К': 'K',
      'М': 'M',
      'Н': 'H',
      'О': 'O',
      'Р': 'P',
      'С': 'C',
      'Т': 'T',
      'Х': 'X',

      'а': 'a',
      'е': 'e',
      'о': 'o',
      'р': 'p',
      'с': 'c',
      'у': 'y',
      'х': 'x',
      'і': 'i',
      'ј': 'j',
      'ѕ': 's',
      'ԁ': 'd',
      'Ь': 'b',

      // =========================
      // LEETSPEAK
      // =========================
      '0': 'o',
      '1': 'i',
      '3': 'e',
      '4': 'a',
      '5': 's',
      '7': 't',
      '@': 'a',
      '$': 's',
      '!': 'i',

      // =========================
      // SMART PUNCTUATION
      // =========================
      '“': '"',
      '”': '"',
      '„': '"',
      '‟': '"',

      '‘': "'",
      '’': "'",
      '‚': "'",
      '‛': "'",

      '–': '-',
      '—': '-',
      '−': '-',
      '‐': '-',

      '…': '...',

      // =========================
      // MATH SYMBOLS
      // =========================
      '∞': 'infinity',
      '∑': 'sum',
      '√': 'sqrt',
      '∆': 'delta',
      'π': 'pi',
      '≈': '~',
      '≠': '!=',
      '≤': '<=',
      '≥': '>=',

      // =========================
      // SPACES
      // =========================
      '\u00A0': ' ',
      '\u2000': ' ',
      '\u2001': ' ',
      '\u2002': ' ',
      '\u2003': ' ',
      '\u2004': ' ',
      '\u2005': ' ',
      '\u2006': ' ',
      '\u2007': ' ',
      '\u2008': ' ',
      '\u2009': ' ',
      '\u200A': ' ',
      '\u202F': ' ',
      '\u205F': ' ',
      '\u3000': ' ',

      // Custom map overrides
      ...this.options.customMap
    };
  }

  normalize(input) {
    if (input == null) return '';

    let text = String(input);

    // =====================================
    // 1. UNICODE COMPATIBILITY NORMALIZATION
    // =====================================
    text = text.normalize('NFKC');

    // =====================================
    // 2. REMOVE INVISIBLE CHARACTERS
    // =====================================
    if (this.options.removeInvisible) {
      text = text.replace(
        /[\u200B-\u200D\uFEFF\u2060\u180E]/g,
        ''
      );
    }

    // =====================================
    // 3. REMOVE BIDI CONTROL CHARS
    // =====================================
    if (this.options.removeBidi) {
      text = text.replace(
        /[\u202A-\u202E\u2066-\u2069]/g,
        ''
      );
    }

    // =====================================
    // 4. REMOVE CONTROL CHARS
    // =====================================
    if (this.options.removeControlChars) {
      text = text.replace(
        /[\x00-\x1F\x7F-\x9F]/g,
        ''
      );
    }

    // =====================================
    // 5. APPLY HOMOGLYPH MAP
    // =====================================
    text = [...text]
      .map(char => {
        if (
          this.options.decodeLeetspeak &&
          this.map[char]
        ) {
          return this.map[char];
        }

        if (
          !this.options.decodeLeetspeak &&
          /^[0-9@$!]$/.test(char)
        ) {
          return char;
        }

        return this.map[char] || char;
      })
      .join('');

    // =====================================
    // 6. REMOVE DIACRITICS
    // =====================================
    if (this.options.removeDiacritics) {
      text = text
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f\u1AB0-\u1AFF\u1DC0-\u1DFF]/g,
          ''
        );
    }

    // =====================================
    // 7. REMOVE EMOJIS
    // =====================================
    if (this.options.removeEmojis) {
      text = text.replace(
        /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu,
        ''
      );
    }

    // =====================================
    // 8. NORMALIZE WHITESPACE
    // =====================================
    if (this.options.normalizeWhitespace) {
      text = text.replace(/\r\n/g, '\n');

      if (!this.options.preserveNewlines) {
        text = text.replace(/\n+/g, ' ');
      }
    }

    // =====================================
    // 9. COLLAPSE WHITESPACE
    // =====================================
    if (this.options.collapseWhitespace) {
      text = text.replace(/\s+/g, ' ');
    }

    // =====================================
    // 10. LIMIT CHARACTER REPEATS
    // =====================================
    if (this.options.limitRepeats) {
      const max = this.options.maxRepeats;

      text = text.replace(
        /(.)\1+/g,
        match => match.slice(0, max)
      );
    }

    // =====================================
    // 11. LOWERCASE
    // =====================================
    if (this.options.lowercase) {
      text = text.toLowerCase();
    }

    // =====================================
    // 12. ASCII ONLY
    // =====================================
    if (this.options.asciiOnly) {
      text = text.replace(/[^\x20-\x7E]/g, '');
    }

    // =====================================
    // 13. TRIM
    // =====================================
    if (this.options.trim) {
      text = text.trim();
    }

    return text;
  }

  // ====================================================
  // SECURITY: DETECT MIXED SCRIPTS
  // ====================================================

  detectScripts(text) {
    const scripts = {
      latin: /[A-Za-z]/,
      greek: /[\u0370-\u03FF]/,
      cyrillic: /[\u0400-\u04FF]/,
      arabic: /[\u0600-\u06FF]/,
      hebrew: /[\u0590-\u05FF]/,
      chinese: /[\u4E00-\u9FFF]/,
      japanese: /[\u3040-\u30FF]/,
      korean: /[\uAC00-\uD7AF]/
    };

    const found = [];

    for (const [name, regex] of Object.entries(scripts)) {
      if (regex.test(text)) {
        found.push(name);
      }
    }

    return {
      mixed: found.length > 1,
      scripts: found
    };
  }

  // ====================================================
  // SECURITY SCORE
  // ====================================================

  securityAnalysis(text) {
    const scripts = this.detectScripts(text);

    const invisible =
      /[\u200B-\u200D\uFEFF]/.test(text);

    const bidi =
      /[\u202A-\u202E]/.test(text);

    const confusable =
      /[ΑΒΕΗΙΚΜΝΟΡΤΧаеорсух]/.test(text);

    return {
      suspicious:
        scripts.mixed ||
        invisible ||
        bidi ||
        confusable,

      mixedScripts: scripts.mixed,
      invisibleCharacters: invisible,
      bidirectionalChars: bidi,
      confusableCharacters: confusable,
      scripts: scripts.scripts
    };
  }

  // ====================================================
  // USERNAME SANITIZER
  // ====================================================

  sanitizeUsername(username) {
    return this.normalize(username)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/\.+/g, '.')
      .replace(/_+/g, '_')
      .replace(/-+/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '');
  }

  // ====================================================
  // SLUG GENERATOR
  // ====================================================

  slugify(text) {
    return this.normalize(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ====================================================
  // SAFE SEARCH INDEX STRING
  // ====================================================

  searchable(text) {
    return this.normalize(text)
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/*
========================================================
EXAMPLE USAGE
========================================================
*/

const normalizer = new UltraUnicodeNormalizer({
  lowercase: false,
  removeEmojis: true,
  limitRepeats: true,
  maxRepeats: 2
});

const weirdText = `
𝓗𝓮𝓵𝓵𝓸 WØRLD 😈😈😈
H3LL0
раураl.com
ＧＯＯＤ　ＭＯＲＮＩＮＧ
𝐁𝐎𝐋𝐃
👑👑👑
`;

console.log('===================');
console.log('ORIGINAL');
console.log('===================');
console.log(weirdText);

console.log('\n===================');
console.log('NORMALIZED');
console.log('===================');
console.log(normalizer.normalize(weirdText));

console.log('\n===================');
console.log('USERNAME');
console.log('===================');
console.log(
  normalizer.sanitizeUsername(
    '𝓙𝓸𝓱𝓷_D03!!!'
  )
);

console.log('\n===================');
console.log('SLUG');
console.log('===================');
console.log(
  normalizer.slugify(
    '🔥 Hello Wørld 2026 🔥'
  )
);

console.log('\n===================');
console.log('SEARCHABLE');
console.log('===================');
console.log(
  normalizer.searchable(
    '𝓗éllø---Wørld!!!'
  )
);

console.log('\n===================');
console.log('SECURITY ANALYSIS');
console.log('===================');
console.log(
  normalizer.securityAnalysis(
    'раураl.com'
  )
);