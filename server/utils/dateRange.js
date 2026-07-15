// Parses optional from/to query params into a Mongo date-range filter.
// `to` is treated as inclusive of the whole day, since clients send
// date-only strings (YYYY-MM-DD) that parse to midnight.
function buildDateRangeFilter(from, to) {
  const range = {};
  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid from date' };
    range.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid to date' };
    range.$lt = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return { range: Object.keys(range).length > 0 ? range : null };
}

module.exports = { buildDateRangeFilter };
