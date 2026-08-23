import { loadEnvFile } from 'node:process';

export function loadApiEnvironment(path: string): void {
  try {
    loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
