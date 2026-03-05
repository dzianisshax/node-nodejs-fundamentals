import fs from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';

const __rootPath = resolve(import.meta.dirname, '..', 'workspace');

const findByExt = async () => {
  // Parse the --ext CLI argument, defaulting to '.txt'
  const args = process.argv.slice(2);
  let targetExt = '.txt';
  const extFlagIndex = args.indexOf('--ext');

  if (extFlagIndex !== -1 && extFlagIndex + 1 < args.length) {
    targetExt = args[extFlagIndex + 1];
    // Normalize extension to ensure it starts with a dot
    if (!targetExt.startsWith('.')) {
      targetExt = `.${targetExt}`;
    }
  }

  const matchedFiles = [];

  // Recursive helper to walk through directories
  const scanDirectory = async (currentDir) => {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      // If the directory doesn't exist or can't be read, throw the specific error
      throw new Error('FS operation failed');
    }

    // Process each entry in the directory
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relPath = relative(__rootPath, fullPath);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile() && extname(entry.name) === targetExt) {
        matchedFiles.push(relPath);
      }
    }
  };

  // Initiate the recursive search
  await scanDirectory(__rootPath);

  // Sort alphabetically and print one per line
  matchedFiles.sort();
  for (const file of matchedFiles) {
    console.log(file);
  }
};

await findByExt();
