export const formatDateToDDMMYYYY = (value?: string | null): string | null => {
  if (!value) {
    return null
  }

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch
    return `${day}/${month}/${year}`
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const day = String(parsed.getUTCDate()).padStart(2, '0')
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const year = parsed.getUTCFullYear()

  return `${day}/${month}/${year}`
}
