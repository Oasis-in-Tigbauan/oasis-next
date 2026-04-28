import { Decimal } from "decimal.js";

export function castToDecimal<T extends number>(data: T): string
export function castToDecimal<T extends string>(data: T): string {
  return new Decimal(data).toString();
}

export function castFromDecimal(data: string): number {
  return new Decimal(data).toNumber();
}
