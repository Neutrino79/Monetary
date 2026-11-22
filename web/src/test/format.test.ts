import { describe, expect, it } from 'vitest'
import { formatCurrency, formatSigned } from '@/lib/utils/format'

describe('formatCurrency', () => {
  it('shows the exact amount instead of rounding to a whole number', () => {
    expect(formatCurrency(187.82)).toBe('₹187.82')
    expect(formatCurrency(187.5)).toBe('₹187.50')
    expect(formatCurrency(0.99)).toBe('₹0.99')
    expect(formatCurrency(1234567.89)).toBe('₹12,34,567.89')
  })

  it('keeps whole amounts free of a trailing .00', () => {
    expect(formatCurrency(188)).toBe('₹188')
    expect(formatCurrency(46000)).toBe('₹46,000')
    expect(formatCurrency(0)).toBe('₹0')
  })

  it('still offers a fixed two-decimal form', () => {
    expect(formatCurrency(188, true)).toBe('₹188.00')
    expect(formatCurrency(187.82, true)).toBe('₹187.82')
  })

  it('shows signed amounts exactly too, and a dash for no value', () => {
    expect(formatSigned(187.82, 'negative')).toBe('−₹187.82')
    expect(formatSigned(25.4, 'positive')).toBe('+₹25.40')
    expect(formatCurrency(null)).toBe('—')
  })
})
