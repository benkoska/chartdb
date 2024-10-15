import React, { useEffect, useState } from 'react';

import { Editor, useMonaco } from '@monaco-editor/react';

import { DarkTheme } from '@/components/code-snippet/themes/dark';
import { LightTheme } from '@/components/code-snippet/themes/light';

import { useTheme } from '@/hooks/use-theme';
import { useChartDB } from '@/hooks/use-chartdb';

import levenshtein from 'js-levenshtein'

import { configuration, languageDef } from './language';
import { generateDBML, getRelationshipContentHash, getTableContentHash, parseCode } from './compiler';
import type { DBField } from '@/lib/domain/db-field';
import { adjustTablePositions, shouldShowTablesBySchemaFilter, type DBTable } from '@/lib/domain/db-table';
import { DBRelationship } from '@/lib/domain/db-relationship';
import { generateId } from '@/lib/utils';
import { randomColor } from '@/lib/colors';

export interface CodeSectionProps {}

export const CodeSection: React.FC<CodeSectionProps> = () => {
	const { tables, databaseType, updateTable, removeTable, createTable, filteredSchemas, relationships, updateRelationship, removeRelationship, addRelationship } = useChartDB();
	const [code, setCode] = useState(() => generateDBML(tables, relationships));

    const monaco = useMonaco();
    const { effectiveTheme } = useTheme();

    function updateFromCode(code: string) {
        const { tables: parsedTables, relationships: parsedRelationships } = parseCode(code, databaseType);

		for (const table of tables) {
			if (parsedTables.find((t) => t.name === table.name) == null) {
				let newTable = null;

				if (parsedTables.length == tables.length) {
					const potentialTables = parsedTables.filter((t) => t.contentHash === getTableContentHash(table));
					let minDistance = Infinity;
					for (const potentialTable of potentialTables) {
						const distance = levenshtein(table.name, potentialTable.name);
						if (distance < minDistance) {
							minDistance = distance;
							newTable = potentialTable;
						}
					}
				}

				if (newTable != null) {
					newTable.existingId = table.id
				} else {
					removeTable(table.id);
				}
			}
		}

        for (const table of parsedTables) {
            const existingTable = table.existingId != null ? tables.find((t) => t.id === table.existingId) : tables.find((t) => t.name === table.name);

            const codeTableContent: Partial<DBTable> = {
				name: table.name,
                fields: table.fields.map(
                    (f) =>
                        ({
                            id: existingTable?.fields.find((eF) => eF.name === f.name)?.id,
                            name: f.name,
                            type: f.type,
                            primaryKey: f.primaryKey,
                            unique: f.unique,
                        }) as DBField
                ),
            };

			if (existingTable != null) {
				updateTable(existingTable!.id!, codeTableContent)
			} else {
				createTable({
					...codeTableContent,
					x: 0,
					y: 0,
					color: randomColor(),
					isView: false,
					createdAt: Date.now(),
				})
				.then((newTable) => {
					const newTables = adjustTablePositions({
						relationships,
						tables: tables.filter((table) =>
							shouldShowTablesBySchemaFilter(table, filteredSchemas)
						),
						mode: 'byId',
						idsToUpdate: [newTable.id]
					});

					updateTable(newTable.id, {
						x: newTables[0].x,
						y: newTables[0].y
					})
				});
			}
		}

		for (const relationship of relationships) {
			if (parsedRelationships.find((r) => r.name === relationship.name) == null) {
				let newRelationship = null;

				if (parsedRelationships.length == relationships.length) {
					const potentialRelationships = parsedRelationships.filter((r) => r.contentHash === getRelationshipContentHash(relationship, tables));
					let minDistance = Infinity;
					for (const potentialRelationship of potentialRelationships) {
						const distance = levenshtein(relationship.name, potentialRelationship.name);
						if (distance < minDistance) {
							minDistance = distance;
							newRelationship = potentialRelationship;
						}
					}
				}

				if (newRelationship != null) {
					newRelationship.existingId = relationship.id
				} else {
					removeRelationship(relationship.id);
				}
			}
		}

		for (const relationship of parsedRelationships) {
			const existingRelationship = relationship.existingId != null ? relationships.find((r) => r.id === relationship.existingId) : relationships.find((r) => r.name === relationship.name);

			const sourceTable = tables.find((t) => t.name === relationship.sourceTableName);
			const targetTable = tables.find((t) => t.name === relationship.targetTableName);
			const sourceField = sourceTable?.fields.find((f) => f.name === relationship.sourceFieldName);
			const targetField = targetTable?.fields.find((f) => f.name === relationship.targetFieldName);

			if (sourceTable == null || targetTable == null || sourceField == null || targetField == null) continue;

            const codeRelationshipDetails: DBRelationship = {
				id: generateId(),
				name: relationship.name,
                sourceTableId: sourceTable!.id,
                targetTableId: targetTable!.id,
                sourceFieldId: sourceField!.id,
                targetFieldId: targetField!.id,
                sourceCardinality: relationship.sourceCardinality,
                targetCardinality: relationship.targetCardinality,
				createdAt: Date.now(),
            };

			if (existingRelationship != null) {
				updateRelationship(existingRelationship!.id!, codeRelationshipDetails)
			} else {
				addRelationship(codeRelationshipDetails)
				// .then((newRelationship) => {
				// 	const newTables = adjustTablePositions({
				// 		relationships,
				// 		tables: tables.filter((table) =>
				// 			shouldShowTablesBySchemaFilter(table, filteredSchemas)
				// 		),
				// 		mode: 'byId',
				// 		idsToUpdate: [newTable.id]
				// 	});

				// 	updateTable(newTable.id, {
				// 		x: newTables[0].x,
				// 		y: newTables[0].y
				// 	})
				// });
			}
		}
	}

    useEffect(() => {
        updateFromCode(code);
    }, [code]);

    useEffect(() => {
        monaco?.editor?.defineTheme?.(
            effectiveTheme,
            effectiveTheme === 'dark' ? DarkTheme : LightTheme
        );
        monaco?.editor?.setTheme?.(effectiveTheme);
    }, [monaco, effectiveTheme]);

    function handleEditorDidMount(editor: any, monaco: any) {
        if (
            monaco.languages.getLanguages().some(({ id }: any) => id === 'dbml')
        )
            return;

        monaco.languages.register({ id: 'dbml' });

        monaco.languages.setMonarchTokensProvider('dbml', languageDef);
        monaco.languages.setLanguageConfiguration('dbml', configuration);
    }

    return (
        <div className="relative flex flex-1 justify-center overflow-hidden py-2">
            <Editor
                value={code}
                onChange={(value) => setCode(value!)}
                language={'dbml'}
                theme={effectiveTheme}
                onMount={handleEditorDidMount}
                options={{
                    minimap: {
                        enabled: false,
                    },
                    readOnly: false,
                    automaticLayout: true,
                    scrollbar: {
                        vertical: 'hidden',
                        horizontal: 'hidden',
                        alwaysConsumeMouseWheel: false,
                    },
                    scrollBeyondLastLine: false,
                    renderValidationDecorations: 'off',
                    lineDecorationsWidth: 0,
                    overviewRulerBorder: false,
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    guides: {
                        indentation: false,
                    },
                    lineNumbersMinChars: 3,
                    contextmenu: false,
                }}
            />
        </div>
    );
};
