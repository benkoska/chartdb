import type { DBTable } from '@/lib/domain/db-table';
import type { DataType as DBDataType } from '@/lib/data/data-types/data-types';
import { dataTypeMap } from '@/lib/data/data-types/data-types';
import { DatabaseType } from '@/lib/domain/database-type';
import { Cardinality, DBRelationship } from '@/lib/domain/db-relationship';

interface DataType {
    name: string;
    arguments?: { type: 'int' }[];
    alias?: string[];
}

export const dataTypes: DataType[] = [
    {
        name: 'varchar',
        arguments: [{ type: 'int' }],
    },
    {
        name: 'integer',
    },
    {
        name: 'timestamp',
    },
];

export const typeAlias = {
    string: 'varchar(255)',
    int: 'integer',
};

export function dataTypeRegex(type: DataType): RegExp | string {
    if (type.arguments == null) return type.name;

    let regexString = type.name;
    regexString += '\\(';
    regexString += type.arguments.map((arg) => {
        if (arg.type == 'int') return '(\\d+)';
    });
    regexString += '\\)';
    return new RegExp(regexString);
}

export function generateDBML(tables: DBTable[], relations: DBRelationship[]): string {
    let code = '';
    for (const table of tables) {
        code += `Table ${table.name} {`;
		if (table.comments != null && table.comments.length > 0) {
			code += `\n\t[note: "${table.comments}"]`;
		}
		code += '\n'
        for (const field of table.fields) {
            code += '\t';
            code += `${field.name} ${field.type.name}`;
            if (!field.primaryKey && field.unique) code += ' [unique]';
            if (field.primaryKey) code += ' [primary key]';
			if (field.nullable) code += ' [null]';
			if (field.comments != null && field.comments.length > 0) code += ` [note: "${field.comments}"]`;
            code += '\n';
        }

		const indices = table.indexes.filter((i) => i.name != "PRIMARY");
		if (indices.length > 0) {
			code += '\n\tIndexes {\n';
			for (const index of indices) {
				code += '\t\t';
				code += `(${index.fieldIds.map((id) => table.fields.find((f) => f.id == id)!.name).join(', ')})`;

				if (index.unique) code += ' [unique]';
				if (index.name != null) code += ` [name: "${index.name}"]`;
				code += '\n';
			}
			code += '\t}\n';
		}

        code += `}\n`;
        code += '\n';
    }

    for (const relation of relations) {
        code += `Rel ${relation.name}: `;

        const sourceTable = tables.find((t) => t.id == relation.sourceTableId)!;
        const targetTable = tables.find((t) => t.id == relation.targetTableId)!;

		const sourceField = sourceTable.fields.find((f) => f.id == relation.sourceFieldId)!;
		const targetField = targetTable.fields.find((f) => f.id == relation.targetFieldId)!;

        code += `${relation.sourceCardinality == 'one' ? '1': 'N'} ${sourceTable.name}.${sourceField.name}, `;
        code += `${relation.targetCardinality == 'one' ? '1': 'N'} ${targetTable.name}.${targetField.name}`;
        code += '\n';
    }

    return code.substring(0, code.length - 1);
}

interface ParsedTable {
    contentHash: number;
    existingId?: string;
    
    name: string;
    fields: ParsedField[];
	indexes: ParsedIndex[];
}

interface ParsedIndex {
    name: string;
	unique: boolean;
    fields: string[];
}

interface ParsedRelationship {
    existingId?: string;
    contentHash: number;

    name: string;
    sourceTableName: string;
    sourceFieldName: string;
    targetTableName: string;
    targetFieldName: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
}

interface ParsedField {
    name: string;
    type: DataType;
    primaryKey: boolean;
    unique: boolean;
	note?: string;
}

export function parseCode(code: string, databaseType: DatabaseType): {
    tables: ParsedTable[];
    relationships: ParsedRelationship[];
} {
    const parsedTables: ParsedTable[] = [];
    const parsedRelationships: ParsedRelationship[] = [];
    
    const tableRegex = /Table\s+(\w+)\s*{\s*([^}]*)}/g;
    let tableMatch: RegExpExecArray | null;

    const relationshipRegex = /Rel\s+(\w+):\s+(\w+)\s+(\w+)\.(\w+),\s+(\w+)\s+(\w+)\.(\w+)/g;
    let relationshipMatch: RegExpExecArray | null;    

    while ((tableMatch = tableRegex.exec(code)) !== null) {
        const tableName = tableMatch[1];
        const fieldsBlock = tableMatch[2];
        const fieldRegex = /^\s*(\w+)\s+([\w()]+)(?:\s+(\[.*?\]))?$/gm;
        let fieldMatch: RegExpExecArray | null;
        const fields: ParsedField[] = [];

        while ((fieldMatch = fieldRegex.exec(fieldsBlock)) !== null) {
            const fieldName = fieldMatch[1];
            const fieldTypeName = fieldMatch[2];
            const modifiers = fieldMatch[3] || '';
            const primaryKey = /\[primary key\]/i.test(modifiers) || /\[pk\]/i.test(modifiers);
            const unique = /\[unique\]/i.test(modifiers);
			const note = /\[note: ["'](.*?)["']\]/i.exec(modifiers)

            let dataType: DBDataType = {
                id: fieldTypeName.toLowerCase(),
                name: fieldTypeName,
            };

            const matchedType = dataTypeMap[databaseType].find(
                (dt) => dt.name.toLowerCase() === fieldTypeName.toLowerCase()
            );
            if (matchedType) {
                dataType = matchedType;
            }

            fields.push({
                name: fieldName,
                type: dataType,
                primaryKey,
                unique,
				note: (note?.length ?? 0) > 0 ? note?.[1] : undefined,
            });
        }

		const parsedIndexes: ParsedIndex[] = [];

		const indexesBlock = /Indexes\s*{\s*([^}]*)/g.exec(fieldsBlock)

		if (indexesBlock != null) {
			const indexes = indexesBlock[1].split('\n').map((i) => i.trim()).filter((i) => i.length > 0);

			for (const index of indexes) {
				const indexMatch = index.match(/\((.*)\)\s?(.*)?/);

				if (indexMatch) {
					const indexFields = indexMatch[1].split(",").map((f) => f.trim())
					const modifiers = indexMatch[2]

					const unique = /\[unique\]/i.test(modifiers);
					const name = /\[name: ["'](.*?)["']\]/i.exec(modifiers)		

					parsedIndexes.push({
						name: name?.[1] ?? indexFields.join('_'),
						unique: unique,
						fields: indexFields,
					})
				}
			}
		}

        parsedTables.push({
            name: tableName,
            contentHash: stringHashCode(fields.map((f) => f.name).sort().join(':')),
            fields,
			indexes: parsedIndexes
        });
    }

    while ((relationshipMatch = relationshipRegex.exec(code)) !== null) {
        const [, name, sourceCardinality, sourceTableName, sourceFieldName, targetCardinality, targetTableName, targetFieldName] = relationshipMatch;
        
        parsedRelationships.push({
            name,
            sourceTableName,
            sourceFieldName,
            targetTableName,
            targetFieldName,
            sourceCardinality: sourceCardinality === '1' ? 'one' : 'many',
            targetCardinality: targetCardinality === '1' ? 'one' : 'many',
            contentHash: stringHashCode([sourceTableName, sourceFieldName, targetTableName, targetFieldName].join(':')),
        });
    }

    return {
        tables: parsedTables,
        relationships: parsedRelationships,
    };
}

function stringHashCode(str: string) {
    var hash = 0,
        i, chr;
    if (str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

export function getTableContentHash(table: DBTable) {
    return stringHashCode(table.fields.map((f) => f.name).sort().join(':'));
}

export function getRelationshipContentHash(relationship: DBRelationship, tables: DBTable[]) {
    const sourceTable = tables.find((t) => t.id == relationship.sourceTableId)!;
    const targetTable = tables.find((t) => t.id == relationship.targetTableId)!;

    const sourceField = sourceTable.fields.find((f) => f.id == relationship.sourceFieldId)!;
    const targetField = targetTable.fields.find((f) => f.id == relationship.targetFieldId)!;

    return stringHashCode([sourceTable.name, sourceField.name, targetTable.name, targetField.name].join(':'));
}