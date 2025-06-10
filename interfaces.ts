// These classes will represent our tables in SQLite

export interface Deck {
    id: number;
    name: string;
    official: boolean;
}

export interface Card {
    id: string;
    deckId: number;
    text: string;
    pick: number | null; // null for white cards, 1 | 2 | 3 for black cards
}

// These classes are not part of the tables, but are re-exported to represent the data

export interface CardDTO extends Card {
    deck: Deck;
}

export type DeckDTO = Deck;

// These classes are simply to represent the JSON structure of the input
// These are not re-exported for the npm package

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