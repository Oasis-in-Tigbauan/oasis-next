import {toCurrency} from 'to-words';

export type ObrFormSignerBlock = {
  printedName: string;
  position: string;
  roleLabel: string;
};

export function amountToWords(value: string | number): string {
  return toCurrency(value, {localeCode: 'en-PH'});
}

export function formatAmountWithoutCurrency(value: string | number): string {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return '0.00';
  return parsed.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildChargesString(
  responsibilityCenter: string,
  expenseName: string,
  amount: string | number,
): string {
  return [responsibilityCenter.trim(), expenseName.trim(), formatAmountWithoutCurrency(amount)]
    .filter(Boolean)
    .join('-');
}
