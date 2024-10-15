import { DBTable  } from "@/lib/domain/db-table"
import { dataTypeMap, DataType as DBDataType } from "@/lib/data/data-types/data-types"
import { DatabaseType } from "@/lib/domain/database-type"

interface DataType {
	name: string
	arguments?: { type: 'int' }[]
	alias?: string[]
}

export const dataTypes: DataType[] = [
	{
		name: 'varchar',
		arguments: [{ type: 'int' }]
	},
	{
		name: 'integer'
	},
	{
		name: 'timestamp'
	}
]

export const typeAlias = {
	string: "varchar(255)",
	int: "integer"
}

export function dataTypeRegex(type: DataType): RegExp | string {
	if (type.arguments == null) return type.name
	
	let regexString = type.name
	regexString += "\\("
	regexString += type.arguments.map((arg) => {
		if (arg.type == 'int') return '(\\d+)'
	})
	regexString += "\\)"
	return new RegExp(regexString)
}

export function generateDBML(tables: DBTable[]): string {
	var code = ""
	for (const table of tables) {
		code += `Table ${table.name} {\n`
		for (const field of table.fields) {
			code += "\t"
			code += `${field.name} ${field.type.name}`
			if (!field.primaryKey && field.unique) code += ' [unique]'
			if (field.primaryKey) code += ' [primary key]'
			code += "\n"
		}
		code += `}\n`
		code += '\n'
	}

	return code.substring(0, code.length-2)
}

interface ParsedTable {
	name: string
	fields: ParsedField[]
}

interface ParsedField {
	name: string
	type: DataType
	primaryKey: boolean
	unique: boolean
}

export function parseCode(code: string, databaseType: DatabaseType) {
    // Start Generation Here
    const parsedTables: ParsedTable[] = [];
    const tableRegex = /Table\s+(\w+)\s*{\s*([^}]*)}/g;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRegex.exec(code)) !== null) {
        const tableName = tableMatch[1];
        const fieldsBlock = tableMatch[2];
        const fieldRegex = /^\s*(\w+)\s+([\w\(\)]+)(?:\s+\[(.*?)\])?$/gm;
        let fieldMatch: RegExpExecArray | null;
        const fields: ParsedField[] = [];

        while ((fieldMatch = fieldRegex.exec(fieldsBlock)) !== null) {
            const fieldName = fieldMatch[1];
            const fieldTypeName = fieldMatch[2];
            const modifiers = fieldMatch[3] || '';
            const primaryKey = /\bprimary key\b/i.test(modifiers);
            const unique = /\bunique\b/i.test(modifiers);

            // Attempt to retrieve the DataType from dataTypeMap
            let dataType: DBDataType = { id: fieldTypeName.toLowerCase(), name: fieldTypeName };

            // Optional: Enhance dataType retrieval if dataTypeMap is accessible here
            // Example:
            const matchedType = dataTypeMap[DatabaseType.GENERIC].find(dt => dt.name.toLowerCase() === fieldTypeName.toLowerCase());
            if (matchedType) {
                dataType = matchedType;
            }

            fields.push({
                name: fieldName,
                type: dataType,
                primaryKey,
                unique,
            });
        }

        parsedTables.push({
            name: tableName,
            fields,
        });
    }

	console.log(parsedTables)

    return parsedTables;
}