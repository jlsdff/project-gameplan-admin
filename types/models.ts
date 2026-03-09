
type Player = {
    firstname: string;
    lastname: string;
    middlename: string | null;
    number: number | null;
    [key: string]: unknown;
}

export type { Player }