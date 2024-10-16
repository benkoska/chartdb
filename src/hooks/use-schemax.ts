import { schemaXContext } from '@/context/schemax-context/schemax-context';
import { useContext } from 'react';

export const useSchemaX = () => useContext(schemaXContext);
