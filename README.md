# CAH-SQL-QUICK

This is a small utility to read in the minimal-json schemas you can generate [here](https://www.crhallberg.com/cah/) and setup a database of the selected decks. It attempts to be as flexible as possible within reason.

To use this, I suggest cloning and running `npm i & npm run start -- <args>`. I might change this in the future to work with npx or something, I have to look into it.

We do not attempt to overwrite tables, running this against DBs with a matching table will throw an error. Ensure you are running this script in a DB with no `Decks` or `Cards` table.

## Command-Line Arguments

The script accepts the following command-line arguments:

- `--inputFile` (alias: `-i`)
  - **Description**: Path to the input JSON file.
  - **Type**: `string`
  - **Default**: `./cah-cards-compact.json` in the current directory.
- `--dbType` (alias: `-d`)
  - **Description**: Type of the target database.
  - **Type**: `string`
  - **Choices**: `sqlite`, `sqlserver`, `postgresql`
  - **Required**: Yes
- `--connectionString` (alias: `-c`)
  - **Description**: Database connection string. Required for SQL Server and PostgreSQL. Optional for SQLite (if `sqliteFile` is provided).
  - **Type**: `string`
- `--sqliteFile` (alias: `-s`)
  - **Description**: Path to the SQLite database file (e.g., `./cah.sqlite`). Required for SQLite if `connectionString` is not provided.
  - **Type**: `string`
- `--dbSchema`
  - **Description**: Database schema to use (e.g., `dbo` for SQL Server, `public` for PostgreSQL).
  - **Type**: `string`
  - **Default**: `dbo`
- `--help` (alias: `-h`)
  - **Description**: Show help screen.

## NPM Types Package **_not actually implemented just yet_**

This will enable developers to install a small types package that contains interfaces for representing the data created from this utility.

## Database Schema

At the moment, you can only modify the schema, but we will implement the ability for renaming tables if requested.

### \<dbo\>.Decks

| Column   | Type   |
| -------- | ------ |
| id       | string |
| name     | string |
| official | bit    |

### \<dbo\>.Cards

\<card\>.pick will be null if it is a white card; 1, 2, or 3 if it is black

| Columns | Type    |
| ------- | ------- |
| id      | string  |
| deckId  | string  |
| text    | string  |
| pick    | number? |

## To-Do

- [ ] Update type of Id's to be true `uuid`s type instead of `string` if applicable
- [ ] Setup more database connectors
  - [ ] Abstract the database connectors
- [ ] Setup the types library to re-export the common schema representations of the db data
- [ ] npx?
