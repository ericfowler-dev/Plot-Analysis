const trimTrailingZeros = (value) => value
  .replace(/\.0+$/, '')
  .replace(/(\.\d*?)0+$/, '$1');

export function formatHistogramBucketValue(value, decimals = null) {
  if (value === null || value === undefined || value === '') return '—';

  const numericValue = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  if (decimals === null || decimals === undefined) {
    return trimTrailingZeros(String(numericValue));
  }

  return trimTrailingZeros(numericValue.toFixed(decimals));
}

export function getHistogramBucketBounds(labels, index) {
  if (!Array.isArray(labels) || index < 0 || index >= labels.length) {
    return null;
  }

  return {
    lowerBound: labels[index],
    upperBound: index < labels.length - 1 ? labels[index + 1] : null
  };
}

export function formatHistogramBucketLabel(labels, index, decimals = null) {
  const bounds = getHistogramBucketBounds(labels, index);
  if (!bounds) return '—';

  const lowerLabel = formatHistogramBucketValue(bounds.lowerBound, decimals);
  if (bounds.upperBound === null || bounds.upperBound === undefined) {
    return `${lowerLabel}+`;
  }

  const upperLabel = formatHistogramBucketValue(bounds.upperBound, decimals);
  return `${lowerLabel} – ${upperLabel}`;
}

export function findHistogramBucketIndex(labels, value) {
  if (!Array.isArray(labels) || labels.length === 0 || value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(numericValue)) {
    return null;
  }

  for (let index = 0; index < labels.length; index++) {
    const lowerBound = labels[index];
    const upperBound = index < labels.length - 1 ? labels[index + 1] : Number.POSITIVE_INFINITY;

    if (numericValue >= lowerBound && numericValue < upperBound) {
      return index;
    }
  }

  return numericValue >= labels[labels.length - 1] ? labels.length - 1 : null;
}
