/**
 * CSV cell escape shared by every operator export. Besides quoting, it neutralises spreadsheet
 * formula injection: a customer-supplied note starting with = + - @ (or a tab/CR) would execute as a
 * formula when ops opens the file in Excel/Sheets. Such cells get a leading apostrophe (rendered as
 * plain text; invisible in most viewers).
 */
export function csvEscape(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
