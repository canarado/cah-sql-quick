export interface CardData {
    white: string[];
    black: BlackCardData[];
    metadata: Record<number, DeckData>;
}

export interface BlackCardData {
    text: string;
    pick: number;
}

export interface DeckData {
    id: number;
    name: string;
    official: boolean;
    white: number[];
    black: number[];
}