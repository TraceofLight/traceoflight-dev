const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function toDate(value: Date | number | string) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateLabel(value: Date | number | string) {
  return dateFormatter.format(toDate(value));
}

export function toIsoDateTime(value: Date | number | string) {
  return toDate(value).toISOString();
}
