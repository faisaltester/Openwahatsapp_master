/**
 * Contact Parser & Duplicate Management Engine
 * Handles CSV, TXT, XLS, XLSX parsing, normalization, column mapping,
 * duplicate detection, and validation for WhatsApp/Bulk messaging.
 */

export class ContactParser {
  static normalizePhoneNumber(raw) {
    if (!raw) return '';
    // Strip common formatting: spaces, plus, dashes, parentheses, dots
    let cleaned = String(raw).trim().replace(/[\s+\-().]/g, '');
    // If it starts with '00', replace with nothing (common international dialing prefix)
    if (cleaned.startsWith('00')) {
      cleaned = cleaned.substring(2);
    }
    return cleaned;
  }

  static isValidWhatsAppNumber(number) {
    // E.164 digits without +: min 8 digits, max 15 digits
    return /^\d{8,15}$/.test(number);
  }

  static autoDetectColumns(headers) {
    const mapping = {
      number: '',
      name: '',
      var1: '',
      var2: '',
      var3: '',
    };

    const lowerHeaders = headers.map(h => String(h).trim().toLowerCase());

    // Detect Number column
    const numberKeywords = ['phone', 'mobile', 'number', 'whatsapp', 'wa', 'contact', 'tel', 'cell', 'msisdn'];
    for (const kw of numberKeywords) {
      const idx = lowerHeaders.findIndex(h => h === kw || h.includes(kw));
      if (idx !== -1) {
        mapping.number = headers[idx];
        break;
      }
    }
    if (!mapping.number && headers.length > 0) {
      mapping.number = headers[0];
    }

    // Detect Name column
    const nameKeywords = ['name', 'full_name', 'fullname', 'client', 'customer', 'recipient', 'contact_name', 'user'];
    for (const kw of nameKeywords) {
      const idx = lowerHeaders.findIndex(h => h === kw || h.includes(kw));
      if (idx !== -1 && headers[idx] !== mapping.number) {
        mapping.name = headers[idx];
        break;
      }
    }

    // Detect variable columns (any leftover columns)
    const assigned = new Set([mapping.number, mapping.name]);
    const leftovers = headers.filter(h => !assigned.has(h));

    if (leftovers.length > 0) mapping.var1 = leftovers[0];
    if (leftovers.length > 1) mapping.var2 = leftovers[1];
    if (leftovers.length > 2) mapping.var3 = leftovers[2];

    return mapping;
  }

  /**
   * Parse CSV / TXT file content
   */
  static parseCSV(text) {
    if (typeof window !== 'undefined' && window.Papa) {
      const result = window.Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: h => h.trim(),
      });
      return {
        headers: result.meta.fields || [],
        rows: result.data || [],
      };
    }

    // Fallback parser if PapaParse is not loaded
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] !== undefined ? parts[idx] : '';
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  /**
   * Parse Excel File (.xlsx, .xls) using SheetJS
   */
  static async parseExcel(file) {
    if (typeof window === 'undefined' || !window.XLSX) {
      throw new Error('SheetJS (XLSX) library is required to parse Excel files.');
    }

    const data = await file.arrayBuffer();
    const workbook = window.XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { headers, rows };
  }

  /**
   * Process raw rows with given column mapping
   */
  static processRecords(rawRows, columnMapping) {
    const numberCol = columnMapping.number;
    const nameCol = columnMapping.name;
    const var1Col = columnMapping.var1;
    const var2Col = columnMapping.var2;
    const var3Col = columnMapping.var3;

    const seenNumbers = new Map(); // normalizedNumber -> index
    const records = [];

    let duplicateCount = 0;
    let invalidCount = 0;
    let validCount = 0;

    rawRows.forEach((row, index) => {
      const rawNumber = row[numberCol] !== undefined ? String(row[numberCol]) : '';
      const rawName = nameCol && row[nameCol] !== undefined ? String(row[nameCol]).trim() : '';
      const var1 = var1Col && row[var1Col] !== undefined ? String(row[var1Col]).trim() : '';
      const var2 = var2Col && row[var2Col] !== undefined ? String(row[var2Col]).trim() : '';
      const var3 = var3Col && row[var3Col] !== undefined ? String(row[var3Col]).trim() : '';

      // Group IDs (…@g.us) must be kept verbatim; the phone normalizer would strip the dot.
      const trimmedRaw = rawNumber.trim();
      const isGroup = /^[\d-]+@g\.us$/i.test(trimmedRaw);
      const normalized = isGroup
        ? trimmedRaw.toLowerCase()
        : ContactParser.normalizePhoneNumber(trimmedRaw.replace(/@c\.us$/i, ''));
      const isValid = isGroup || ContactParser.isValidWhatsAppNumber(normalized);

      let isDuplicate = false;
      let duplicateOfIndex = -1;

      if (isValid) {
        if (seenNumbers.has(normalized)) {
          isDuplicate = true;
          duplicateOfIndex = seenNumbers.get(normalized);
          duplicateCount++;
        } else {
          seenNumbers.set(normalized, index);
          validCount++;
        }
      } else {
        invalidCount++;
      }

      // Build extra variables map
      const variables = {
        name: rawName,
        number: normalized,
        var1: var1,
        var2: var2,
        var3: var3,
      };

      // Also copy all original columns into variables for flexibility
      Object.keys(row).forEach(k => {
        const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!variables[cleanKey]) {
          variables[cleanKey] = String(row[k]).trim();
        }
      });

      records.push({
        id: index + 1,
        name: rawName,
        rawNumber,
        number: normalized,
        chatId: !isValid ? '' : (isGroup ? normalized : `${normalized}@c.us`),
        var1,
        var2,
        var3,
        variables,
        isValid,
        isDuplicate,
        duplicateOfIndex,
        status: !isValid ? 'Invalid Number' : (isDuplicate ? 'Duplicate' : 'Valid'),
        selected: isValid && !isDuplicate, // default selected if valid & unique
      });
    });

    return {
      records,
      stats: {
        total: rawRows.length,
        valid: validCount,
        duplicates: duplicateCount,
        invalid: invalidCount,
        unique: validCount,
        finalRecipients: records.filter(r => r.selected && r.isValid).length,
      }
    };
  }

  /**
   * Filter records: remove all duplicate numbers
   */
  static removeDuplicates(records) {
    return records.filter(r => !r.isDuplicate);
  }

  /**
   * Filter records: keep only valid & unique records
   */
  static cleanForCampaign(records) {
    return records.filter(r => r.isValid && !r.isDuplicate && r.selected);
  }
}
