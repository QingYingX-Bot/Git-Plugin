export const maskAutoLink = value => String(value || '')
  .trim()
  .replace(/\b(https?):\/\//gi, '$1[:]//');
