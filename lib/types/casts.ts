import {Decimal} from 'decimal.js';

export function castToDecimal<T extends string>(data: T): string {
  return new Decimal(data).toString();
}

export function castFromDecimal(data: string): Decimal {
  return new Decimal(data);
}
