import { dataTypeRegex, dataTypes, typeAlias } from './compiler';

// This config defines the editor's view.
export const options = {
    lineNumbers: false,
    scrollBeyondLastLine: false,
    readOnly: false,
    fontSize: 12,
};

console.log(dataTypeRegex(dataTypes[0]));

// This config defines how the language is displayed in the editor.
export const languageDef = {
    defaultToken: '',
    number: /\d+(\.\d+)?/,
    keywords: [
        'Table',
        'Ref',
        ...Object.keys(typeAlias),
        ...dataTypes.map((type) => type.name),
        'primary key',
        'note',
    ],
    tokenizer: {
        root: [
            { include: '@whitespace' },
            { include: '@numbers' },
            { include: '@strings' },
            { include: '@tags' },
            [/(@|)[\w]+/, { cases: { '@keywords': 'keyword' } }],
        ],
        whitespace: [
            [/\/\/.*/, 'comment'],
            [/\s+/, 'white'],
        ],
        numbers: [[/@number/, 'number']],
        strings: [
            [/\".*\"/, 'string.escape'],
            [/\'.*\'/, 'string.escape'],
        ],
        tags: [
            [/^%[a-zA-Z]\w*/, 'tag'],
            [/#[a-zA-Z]\w*/, 'tag'],
        ],
    },
};

// This config defines the editor's behavior.
export const configuration = {
    comments: {
        lineComment: '#',
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
};
