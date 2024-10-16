import { createContext } from 'react';
import { emptyFn } from '@/lib/utils';
import type { SchemaXConfig } from '@/lib/domain/config';

export interface ConfigContext {
    config?: SchemaXConfig;
    updateConfig: (config: Partial<SchemaXConfig>) => Promise<void>;
}

export const ConfigContext = createContext<ConfigContext>({
    config: undefined,
    updateConfig: emptyFn,
});
