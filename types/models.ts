
type Player = {
    firstname: string;
    lastname: string;
    middlename: string | null;
    number: string | null;
    [key: string]: unknown;
}

export type { Player }