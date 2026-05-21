const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){1,2}\d{4}\b/g;
const API_KEY_RE = /\b(?:sk|pk|rk|ak|ghp|xoxb|xoxp|AIza|hf_)[A-Za-z0-9_-]{8,}\b/g;

export function redactSensitiveText(value: string, limit = 240) {
  const redacted = value
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PHONE_RE, "[redacted-phone]")
    .replace(API_KEY_RE, "[redacted-secret]");

  if (redacted.length <= limit) {
    return redacted;
  }

  return `${redacted.slice(0, limit).trimEnd()}…`;
}