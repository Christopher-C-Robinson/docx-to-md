import { ConversionOptions, ConversionResult, EngineType } from '../types';

export interface EngineAdapter {
  readonly name: EngineType;
  isAvailable(): Promise<boolean>;
  convert(
    inputPath: string,
    outputPath: string,
    options: ConversionOptions
  ): Promise<ConversionResult>;
}
