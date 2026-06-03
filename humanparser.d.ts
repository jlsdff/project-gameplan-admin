declare module "humanparser" {
  export type ParsedName = {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    fullName?: string;
  };

  export function parseName(value: string): ParsedName;
  export function getFullestName(value: string): string;
  export function parseAddress(value: string): unknown;
}
