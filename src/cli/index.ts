#!/usr/bin/env node
import { Command } from 'commander';
import { convertCommand } from './commands/convert';
import { batchCommand } from './commands/batch';

const program = new Command();

program
  .name('docx2md')
  .description('Convert DOCX files to Markdown with pluggable engine support')
  .version('0.1.0');

program
  .command('convert <input>')
  .description('Convert a single DOCX file to Markdown')
  .option('-e, --engine <engine>', 'Conversion engine (pandoc|mammoth|libreoffice)', 'pandoc')
  .option('-t, --to <format>', 'Output Markdown format (gfm|commonmark)', 'gfm')
  .option('-o, --output <path>', 'Output file path')
  .option('--media-dir <dir>', 'Directory for extracted media assets')
  .option('--track-changes <policy>', 'Tracked changes policy (accept|reject|all)')
  .option('--lua-filter <path>', 'Pandoc Lua filter (can be repeated)', (v: string, a: string[]) => [...a, v], [] as string[])
  .option('--timeout <ms>', 'Engine timeout in milliseconds')
  .action(convertCommand);

program
  .command('batch <dir>')
  .description('Batch convert all DOCX files in a directory')
  .option('-e, --engine <engine>', 'Conversion engine (pandoc|mammoth|libreoffice)')
  .option('-t, --to <format>', 'Output Markdown format (gfm|commonmark)', 'gfm')
  .option('--out <dir>', 'Output directory')
  .option('--media-dir <dir>', 'Directory for extracted media assets')
  .option('--track-changes <policy>', 'Tracked changes policy (accept|reject|all)')
  .option('--jobs <n>', 'Number of parallel jobs (default: number of CPU cores)')
  .option('--timeout <ms>', 'Per-file timeout in milliseconds')
  .action(batchCommand);

program.parse(process.argv);
