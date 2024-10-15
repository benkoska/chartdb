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
        code += `Table ${table.name} {\n`;
        for (const field of table.fields) {
            code += '\t';
            code += `${field.name} ${field.type.name}`;
            if (!field.primaryKey && field.unique) code += ' [unique]';
            if (field.primaryKey) code += ' [primary key]';
            code += '\n';
        }
        code += `}\n`;
        code += '\n';
    }

    for (const relation of relations) {
        code += `Rel ${relation.name}: `;

        const sourceTable = tables.find((t) => t.id == relation.sourceTableId)!;
        const targetTable = tables.find((t) => t.id == relation.targetTableId)!;

        code += `${relation.sourceCardinality == 'one' ? '1': 'N'} ${sourceTable.name}.${sourceTable.fields.find((f) => f.id == relation.sourceFieldId)!.name}, `;
        code += `${relation.targetCardinality == 'one' ? '1': 'N'} ${targetTable.name}.${targetTable.fields.find((f) => f.id == relation.targetFieldId)!.name}`;
        code += '\n';
    }

    return code.substring(0, code.length - 1);
}

interface ParsedTable {
    contentHash: number;
    existingId?: string;
    
    name: string;
    fields: ParsedField[];
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
        const fieldRegex = /^\s*(\w+)\s+([\w()]+)(?:\s+\[(.*?)\])?$/gm;
        let fieldMatch: RegExpExecArray | null;
        const fields: ParsedField[] = [];

        while ((fieldMatch = fieldRegex.exec(fieldsBlock)) !== null) {
            const fieldName = fieldMatch[1];
            const fieldTypeName = fieldMatch[2];
            const modifiers = fieldMatch[3] || '';
            const primaryKey = /\bprimary key\b/i.test(modifiers);
            const unique = /\bunique\b/i.test(modifiers);

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
            });
        }

        parsedTables.push({
            name: tableName,
            contentHash: stringHashCode(fields.map((f) => f.name).sort().join(':')),
            fields,
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