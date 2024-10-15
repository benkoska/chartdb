import React, { useEffect, useState } from 'react';

import { Editor, useMonaco } from '@monaco-editor/react';

import { DarkTheme } from '@/components/code-snippet/themes/dark';
import { LightTheme } from '@/components/code-snippet/themes/light';

import { useTheme } from '@/hooks/use-theme';
import { useChartDB } from '@/hooks/use-chartdb';

import { configuration, languageDef } from './language';
import { generateDBML, parseCode } from './compiler';
import { useThrottleFn } from 'react-use';
import type { DBField } from '@/lib/domain/db-field';
import { adjustTablePositions, shouldShowTablesBySchemaFilter, type DBTable } from '@/lib/domain/db-table';

export interface CodeSectionProps {}

export const CodeSection: React.FC<CodeSectionProps> = () => {
	const { tables, databaseType, updateTable, createTable, updateTablesState, filteredSchemas, relationships } = useChartDB();
	const [code, setCode] = useState(() => generateDBML(tables));

    const monaco = useMonaco();
    const { effectiveTheme } = useTheme();

    function updateFromCode(code: string) {
        const parsedTables = parseCode(code, databaseType);
        for (const table of parsedTables) {
            const existingTable = tables.find((t) => t.name === table.name);

            const codeTableContent: Partial<DBTable> = {
                fields: table.fields.map(
                    (f) =>
                        ({
                            id: existingTable?.fields.find(
                                (f) => f.name === f.name
                            )?.id,
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
					name: table.name,
					x: 0,
					y: 0,
					color: "#000000",
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
	}

    // useThrottleFn(updateFromCode, 500, [code])
    useEffect(() => {
        // TODO: This this is a temporary solution and we NEED TO THROTTLE!
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
