import { EngineAdapter } from './interface';
import { EngineType } from '../types';
import { PandocAdapter } from './pandoc/adapter';
import { MammothAdapter } from './mammoth/adapter';
import { LibreOfficeAdapter } from './libreoffice/adapter';

const adapters = new Map<EngineType, EngineAdapter>([
  ['pandoc', new PandocAdapter()],
  ['mammoth', new MammothAdapter()],
  ['libreoffice', new LibreOfficeAdapter()],
]);

export function getEngine(name: EngineType): EngineAdapter {
  const adapter = adapters.get(name);
  if (!adapter) throw new Error(`Unknown engine: ${name}`);
  return adapter;
}

export async function resolveEngine(preferred?: EngineType): Promise<EngineAdapter> {
  const order: EngineType[] = preferred
    ? [preferred, 'pandoc', 'mammoth', 'libreoffice']
    : ['pandoc', 'mammoth', 'libreoffice'];

  for (const name of order) {
    const adapter = adapters.get(name);
    if (adapter && await adapter.isAvailable()) {
      return adapter;
    }
  }
  throw new Error('No conversion engine available. Install Pandoc, Mammoth, or LibreOffice.');
}
