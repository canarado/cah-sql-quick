import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import knex, { Knex } from 'knex';
import { CardData, BlackCardData, DeckData } from './interfaces.js';
import { v5 as uuidv5 } from 'uuid';
import { Card } from '@canarado-dev/cah-types';

const CARD_ID_NAMESPACE = '8a903250-8b77-43b2-802d-6f1e261704fd';

interface Arguments {
    inputFile: string;
    dbType: 'sqlite' | 'sqlserver' | 'postgresql';
    connectionString?: string;
    sqliteFile?: string;
    dbSchema?: string;
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('inputFile', {
            alias: 'i',
            type: 'string',
            description: 'Path to the input JSON file. Defaults to ./cah-cards-compact.json in the current directory.',
            default: path.join(process.cwd(), 'cah-cards-compact.json'),
        })
        .option('dbType', {
            alias: 'd',
            choices: ['sqlite', 'sqlserver', 'postgresql'] as const,
            description: 'Type of the target database.',
            demandOption: true,
        })
        .option('connectionString', {
            alias: 'c',
            type: 'string',
            description: 'Database connection string (required for SQL Server and PostgreSQL, optional for SQLite).',
        })
        .option('sqliteFile', {
            alias: 's',
            type: 'string',
            description: 'Path to the SQLite database file (e.g., ./cah.sqlite). Required for SQLite if connectionString is not provided.',
        })
        .option('dbSchema', {
            type: 'string',
            description: 'Database schema to use (e.g., dbo, public). Defaults to "dbo".',
            default: 'dbo',
        })
        .check((argv) => {
            if (argv.dbType === 'sqlite' && !argv.connectionString && !argv.sqliteFile) {
                throw new Error('For SQLite, either --connectionString or --sqliteFile must be provided.');
            }
            if ((argv.dbType === 'sqlserver' || argv.dbType === 'postgresql') && !argv.connectionString) {
                throw new Error(`--connectionString is required for ${argv.dbType}.`);
            }
            return true;
        })
        .help()
        .alias('help', 'h')
        .argv as Arguments;

    let db: Knex | null = null;

    try {
        console.log(`Input file: ${argv.inputFile}`);
        console.log(`Database type: ${argv.dbType}`);
        if (argv.sqliteFile) console.log(`SQLite file: ${argv.sqliteFile}`);
        console.log(`Database schema: ${argv.dbSchema}`);

        let knexConfig: Knex.Config;
        switch (argv.dbType) {
            case 'sqlite':
                knexConfig = {
                    client: 'sqlite3',
                    connection: argv.connectionString || { filename: argv.sqliteFile as string },
                    useNullAsDefault: true,
                };
                break;
            case 'sqlserver':
                knexConfig = {
                    client: 'mssql',
                    connection: argv.connectionString,
                };
                break;
            case 'postgresql':
                knexConfig = {
                    client: 'pg',
                    connection: argv.connectionString,
                };
                break;
            default:
                throw new Error(`Unsupported database type: ${argv.dbType}`);
        }

        db = knex(knexConfig);
        console.log('Database connection configured.');

        await db.raw('SELECT 1');
        console.log('Database connection successful.');

        await createTables(db, argv.dbSchema as string, argv.dbType);

        console.log(`Reading JSON data from ${argv.inputFile}...`);
        const fileContent = await fs.readFile(argv.inputFile, 'utf-8');
        const jsonData = JSON.parse(fileContent) as CardData;
        console.log('JSON data parsed successfully.');

        await insertData(db, jsonData, argv.dbSchema as string, argv.dbType);

        console.log('Data import completed successfully.');

    } catch (error) {
        console.error('An error occurred:', error);
        process.exitCode = 1;
    } finally {
        if (db) {
            await db.destroy();
            console.log('Database connection closed.');
        }
    }
}

async function createTables(db: Knex, schema: string, dbType: Arguments['dbType']) {
    const decksBaseName = 'Decks';
    const cardsBaseName = 'Cards';

    const decksTableNameFull = dbType === 'sqlite' ? decksBaseName : `${schema}.${decksBaseName}`;
    const cardsTableNameFull = dbType === 'sqlite' ? cardsBaseName : `${schema}.${cardsBaseName}`;

    const schemaBuilder = dbType === 'sqlite' ? db.schema : db.schema.withSchema(schema);

    console.log(`Ensuring table ${decksTableNameFull} exists...`);
    await schemaBuilder.createTableIfNotExists(decksBaseName, (table) => {
        table.integer('id').primary();
        table.string('name').notNullable();
        table.boolean('official').notNullable();
    });
    console.log(`${decksTableNameFull} table is ready.`);

    console.log(`Ensuring table ${cardsTableNameFull} exists...`);
    await schemaBuilder.createTableIfNotExists(cardsBaseName, (table) => {
        table.string('id').primary();
        table.integer('deckId').unsigned().notNullable();
        table.foreign('deckId').references('id').inTable(decksBaseName);
        table.text('text').notNullable();
        table.integer('pick').nullable();
    });
    console.log(`${cardsTableNameFull} table is ready.`);
}

async function insertData(db: Knex, data: CardData, schema: string, dbType: Arguments['dbType']) {
    const decksTableNameForInsert = dbType === 'sqlite' ? 'Decks' : `${schema}.Decks`;
    const cardsTableNameForInsert = dbType === 'sqlite' ? 'Cards' : `${schema}.Cards`;

    await db.transaction(async (trx) => {
        console.log('Starting deck insertion...');
        const deckInsertPromises: Promise<void>[] = [];
        for (const deckIdString in data.metadata) {
            if (Object.prototype.hasOwnProperty.call(data.metadata, deckIdString)) {
                const deckDetails: DeckData = data.metadata[deckIdString];

                if (parseInt(deckIdString, 10) !== deckDetails.id) {
                    console.warn(`Mismatch between metadata key ("${deckIdString}") and deck.id (${deckDetails.id}) for deck "${deckDetails.name}". Using deck.id (${deckDetails.id}).`);
                }

                console.log(`Preparing to insert deck: ${deckDetails.name} (ID: ${deckDetails.id})`);
                deckInsertPromises.push(
                    trx(decksTableNameForInsert)
                        .insert({
                            id: deckDetails.id,
                            name: deckDetails.name,
                            official: deckDetails.official,
                        })
                        .then(() => {
                            console.log(`Deck '${deckDetails.name}' (ID: ${deckDetails.id}) inserted or was already present.`);
                        })
                        .catch((error: any) => {
                            if (error.code === 'SQLITE_CONSTRAINT' || // SQLite
                                error.code === '23505' || // PostgreSQL (unique_violation)
                                (error.number === 2627 || error.number === 2601) // SQL Server (Violation of PRIMARY KEY / UNIQUE KEY)
                            ) {
                                console.warn(`Deck with ID ${deckDetails.id} ('${deckDetails.name}') already exists. Skipping insertion.`);
                            } else {
                                console.error(`Error inserting deck ID ${deckDetails.id} ('${deckDetails.name}'):`, error);
                                throw error;
                            }
                        })
                );
            }
        }
        await Promise.all(deckInsertPromises);
        console.log('All deck insertion attempts completed.');

        const allCardsToInsert: Array<Card> = [];
        console.log('Preparing cards for insertion...');

        for (const deckIdString in data.metadata) {
            if (Object.prototype.hasOwnProperty.call(data.metadata, deckIdString)) {
                const deckDetails: DeckData = data.metadata[deckIdString];
                const currentDeckId = deckDetails.id;
                const deckName = deckDetails.name;

                if (deckDetails.white && Array.isArray(deckDetails.white) && data.white && Array.isArray(data.white)) {
                    deckDetails.white.forEach((cardContentIndex, indexInDeckArray) => {
                        if (cardContentIndex >= 0 && cardContentIndex < data.white.length) {
                            const cardText = data.white[cardContentIndex];
                            const uniqueNameString = `${deckName}_white_${indexInDeckArray}_${cardText.substring(0, 7)}`;
                            const cardId = uuidv5(uniqueNameString, CARD_ID_NAMESPACE);
                            allCardsToInsert.push({
                                id: cardId,
                                deckId: currentDeckId,
                                text: cardText,
                                pick: null,
                            });
                        } else {
                            console.warn(`Deck '${deckName}' (ID: ${currentDeckId}) has an invalid white card index: ${cardContentIndex}. Max index: ${data.white.length - 1}. Skipping this card.`);
                        }
                    });
                }

                if (deckDetails.black && Array.isArray(deckDetails.black) && data.black && Array.isArray(data.black)) {
                    deckDetails.black.forEach((cardContentIndex, indexInDeckArray) => {
                        if (cardContentIndex >= 0 && cardContentIndex < data.black.length) {
                            const blackCard: BlackCardData = data.black[cardContentIndex];
                            const uniqueNameString = `${deckName}_black_${indexInDeckArray}_${blackCard.text.substring(0, 7)}`;
                            const cardId = uuidv5(uniqueNameString, CARD_ID_NAMESPACE);
                            allCardsToInsert.push({
                                id: cardId,
                                deckId: currentDeckId,
                                text: blackCard.text,
                                pick: blackCard.pick,
                            });
                        } else {
                            console.warn(`Deck '${deckName}' (ID: ${currentDeckId}) has an invalid black card index: ${cardContentIndex}. Max index: ${data.black.length - 1}. Skipping this card.`);
                        }
                    });
                }
            }
        }
        if (allCardsToInsert.length > 0) {
            console.log(`Attempting to insert ${allCardsToInsert.length} cards in total...`);
            await trx.batchInsert(cardsTableNameForInsert, allCardsToInsert, 50);
            console.log(`${allCardsToInsert.length} cards processed for insertion.`);
        } else {
            console.log('No cards found to insert.');
        }
    });
    console.log('Data insertion transaction completed.');
}

main();