export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(value);
}

// Acronyms and codes that should stay uppercase inside a humanized narration.
const NARRATION_ACRONYMS = new Set([
  "WHT", "VAT", "PAYE", "CIT", "TIN", "NRS", "FIRS", "LIRS", "PPT",
  "INV", "PO", "REF", "ATM", "POS", "NIP", "NIBSS", "USSD",
  "NGN", "USD", "GBP", "EUR", "GTB", "UBA", "FBN", "FCMB"
]);

const NARRATION_MONTHS: Record<string, string> = {
  JANUARY: "January", FEBRUARY: "February", MARCH: "March", APRIL: "April",
  MAY: "May", JUNE: "June", JULY: "July", AUGUST: "August",
  SEPTEMBER: "September", OCTOBER: "October", NOVEMBER: "November", DECEMBER: "December"
};

/**
 * Present a raw bank narration (banks send ALL CAPS) as calm sentence case for
 * display only. Codes (INV-1001), tax/bank acronyms (WHT, NIP) and month names
 * are preserved. The underlying value is never mutated — exports keep the raw
 * string — so this is purely a display nicety that lets the table read cleanly.
 */
export function humanizeNarration(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (NARRATION_MONTHS[upper]) return NARRATION_MONTHS[upper];
      if (/\d/.test(word)) return word;
      if (word === upper && NARRATION_ACRONYMS.has(upper)) return word;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}
