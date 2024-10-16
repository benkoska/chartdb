import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { OnMount } from '@monaco-editor/react';
import { Editor, useMonaco } from '@monaco-editor/react';

import { DarkTheme } from '@/components/code-snippet/themes/dark';
import { LightTheme } from '@/components/code-snippet/themes/light';

import { useTheme } from '@/hooks/use-theme';
import { useSchemaX } from '@/hooks/use-schemax';

import levenshtein from 'js-levenshtein';

import { configuration, languageDef } from './language';
import {
    generateDBML,
    getRelationshipContentHash,
    getTableContentHash,
    parseCode,
} from './compiler';
import type { DBField } from '@/lib/domain/db-field';
import {
    adjustTablePositions,
    shouldShowTablesBySchemaFilter,
    type DBTable,
} from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { generateId } from '@/lib/utils';
import { randomColor } from '@/lib/colors';
import type { DBIndex } from '@/lib/domain/db-index';
import { useReactFlow } from '@xyflow/react';
import type { languages } from 'monaco-editor';

export interface CodeSectionProps {}

export const CodeSection: React.FC<CodeSectionProps> = () => {
    const lastUpdate = useRef(Date.now());

    const monaco = useMonaco();
    const { effectiveTheme } = useTheme();
    const {
        tables,
        databaseType,
        updateTable,
        removeTable,
        createTable,
        filteredSchemas,
        relationships,
        updateRelationship,
        removeRelationship,
        addRelationship,
    } = useSchemaX();
    const { fitView, getZoom } = useReactFlow();

    const [code, setCode] = useState(() => generateDBML(tables, relationships));

    // TODO: keep formatting similar to the original code
    useEffect(() => {
        if (Date.now() - lastUpdate.current > 1000) {
            setCode(generateDBML(tables, relationships));
        }
    }, [tables, relationships]);

    const updateFromCode = useCallback(
        (code: string) => {
            const { tables: parsedTables, relationships: parsedRelationships } =
                parseCode(code, databaseType);

            lastUpdate.current = Date.now();

            for (const table of tables) {
                if (parsedTables.find((t) => t.name === table.name) == null) {
                    let newTable = null;

                    if (parsedTables.length == tables.length) {
                        const potentialTables = parsedTables.filter(
                            (t) => t.contentHash === getTableContentHash(table)
                        );
                        let minDistance = Infinity;
                        for (const potentialTable of potentialTables) {
                            const distance = levenshtein(
                                table.name,
                                potentialTable.name
                            );
                            if (distance < minDistance) {
                                minDistance = distance;
                                newTable = potentialTable;
                            }
                        }
                    }

                    if (newTable != null) {
                        newTable.existingId = table.id;
                    } else {
                        removeTable(table.id);
                    }
                }
            }

            for (const table of parsedTables) {
                const existingTable =
                    table.existingId != null
                        ? tables.find((t) => t.id === table.existingId)
                        : tables.find((t) => t.name === table.name);

                const codeTableContent: Partial<DBTable> = {
                    name: table.name,
                    fields: table.fields.map(
                        (f) =>
                            ({
                                id:
                                    existingTable?.fields.find(
                                        (eF) => eF.name === f.name
                                    )?.id ?? generateId(),
                                name: f.name,
                                type: f.type,
                                primaryKey: f.primaryKey,
                                unique: f.primaryKey || f.unique,
                                comments: f.note,
                            }) as DBField
                    ),
                };

                if (existingTable != null) {
                    updateTable(existingTable!.id!, codeTableContent);
                } else {
                    createTable({
                        name: codeTableContent.name,
                        fields: codeTableContent.fields?.map((f) => ({
                            ...f,
                            id: f.id ?? generateId(),
                            createdAt: Date.now(),
                        })),
                        x: 0,
                        y: 0,
                        color: randomColor(),
                        isView: false,
                        createdAt: Date.now(),
                    }).then((newTable) => {
                        const newTables = adjustTablePositions({
                            relationships,
                            tables: [...tables, newTable].filter((table) =>
                                shouldShowTablesBySchemaFilter(
                                    table,
                                    filteredSchemas
                                )
                            ),
                            mode: 'byId',
                            idsToUpdate: [newTable.id],
                        });

                        const positionedTable = newTables.find(
                            (t) => t.id === newTable.id
                        );

                        updateTable(newTable.id, {
                            x: positionedTable!.x,
                            y: positionedTable!.y,
                        });

                        fitView({
                            duration: 500,
                            maxZoom: getZoom(),
                            minZoom: getZoom(),
                            nodes: [
                                {
                                    id: newTable.id,
                                },
                            ],
                        });
                    });
                }
            }

            for (const table of parsedTables) {
                if (table.indexes.length < 1) continue;

                const existingTable = tables.find((t) => t.name === table.name);

                if (existingTable != null) {
                    const x = {
                        indexes: table.indexes
                            .map(
                                (i) =>
                                    ({
                                        id: existingTable?.indexes.find(
                                            (eI) => eI.name === i.name
                                        )?.id,
                                        name: i.name,
                                        unique: i.unique,
                                        fieldIds: i.fields
                                            .map(
                                                (f) =>
                                                    existingTable?.fields.find(
                                                        (eF) => eF.name === f
                                                    )?.id
                                            )
                                            .filter((id) => id != null),
                                    }) as DBIndex
                            )
                            .filter((i) => i.fieldIds.length > 0),
                    };
                    updateTable(existingTable.id, x);

                    const i = table.indexes[0];
                    // console.log(i.fields.map((f) => existingTable?.fields.find((eF) => eF.name === "brand_id")?.id))
                    console.log(i.name, existingTable?.fields);
                }
            }

            for (const relationship of relationships) {
                if (
                    parsedRelationships.find(
                        (r) => r.name === relationship.name
                    ) == null
                ) {
                    let newRelationship = null;

                    if (parsedRelationships.length == relationships.length) {
                        const potentialRelationships =
                            parsedRelationships.filter(
                                (r) =>
                                    r.contentHash ===
                                    getRelationshipContentHash(
                                        relationship,
                                        tables
                                    )
                            );
                        let minDistance = Infinity;
                        for (const potentialRelationship of potentialRelationships) {
                            const distance = levenshtein(
                                relationship.name,
                                potentialRelationship.name
                            );
                            if (distance < minDistance) {
                                minDistance = distance;
                                newRelationship = potentialRelationship;
                            }
                        }
                    }

                    if (newRelationship != null) {
                        newRelationship.existingId = relationship.id;
                    } else {
                        removeRelationship(relationship.id);
                    }
                }
            }

            for (const relationship of parsedRelationships) {
                const existingRelationship =
                    relationship.existingId != null
                        ? relationships.find(
                              (r) => r.id === relationship.existingId
                          )
                        : relationships.find(
                              (r) => r.name === relationship.name
                          );

                const sourceTable = tables.find(
                    (t) => t.name === relationship.sourceTableName
                );
                const targetTable = tables.find(
                    (t) => t.name === relationship.targetTableName
                );
                const sourceField = sourceTable?.fields.find(
                    (f) => f.name === relationship.sourceFieldName
                );
                const targetField = targetTable?.fields.find(
                    (f) => f.name === relationship.targetFieldName
                );

                if (
                    sourceTable == null ||
                    targetTable == null ||
                    sourceField == null ||
                    targetField == null
                )
                    continue;

                const codeRelationshipDetails: Partial<DBRelationship> = {
                    name: relationship.name,
                    sourceTableId: sourceTable!.id,
                    targetTableId: targetTable!.id,
                    sourceFieldId: sourceField!.id,
                    targetFieldId: targetField!.id,
                    sourceCardinality: relationship.sourceCardinality,
                    targetCardinality: relationship.targetCardinality,
                };

                if (existingRelationship != null) {
                    updateRelationship(
                        existingRelationship!.id!,
                        codeRelationshipDetails
                    );
                } else {
                    addRelationship({
                        id: generateId(),
                        ...codeRelationshipDetails,
                        createdAt: Date.now(),
                    } as DBRelationship);
                }
            }
        },
        [
            addRelationship,
            createTable,
            databaseType,
            filteredSchemas,
            relationships,
            removeRelationship,
            tables,
            updateRelationship,
            updateTable,
            fitView,
            getZoom,
            removeTable,
        ]
    );

    useEffect(() => {
        updateFromCode(code);
    }, [code, updateFromCode]);

    useEffect(() => {
        monaco?.editor?.defineTheme?.(
            effectiveTheme,
            effectiveTheme === 'dark' ? DarkTheme : LightTheme
        );
        monaco?.editor?.setTheme?.(effectiveTheme);
    }, [monaco, effectiveTheme]);

    const handleEditorDidMount: OnMount = useCallback((_, monaco) => {
        if (monaco.languages.getLanguages().some(({ id }) => id === 'dbml'))
            return;

        monaco.languages.register({ id: 'dbml' });

        monaco.languages.setMonarchTokensProvider(
            'dbml',
            languageDef as languages.IMonarchLanguage
        );
        monaco.languages.setLanguageConfiguration(
            'dbml',
            configuration as languages.LanguageConfiguration
        );
    }, []);

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
