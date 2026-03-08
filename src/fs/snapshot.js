import { resolve, dirname, join, relative } from 'node:path';
import { stat, readdir, readFile, writeFile } from 'node:fs/promises';

const __rootPath = resolve(import.meta.dirname, '..', 'workspace');

/**
 * The workspace folder must be located in the src directory.
 */
const snapshot = async () => {
  try {
    const workspaceStat = await stat(__rootPath);
    if (!workspaceStat.isDirectory()) {
      throw new Error();
    }
  } catch (error) {
    throw new Error('FS operation failed');
  }

  const entries = [];

  // Recursive scanning helper
  async function scanDirectory(currentDir) {
    const dirents = await readdir(currentDir, { withFileTypes: true });

    for (const dirent of dirents) {
      const fullPath = join(currentDir, dirent.name);

      // Ensure forward slashes for cross-platform relative paths in JSON
      const relPath = relative(__rootPath, fullPath).replace(/\\/g, '/');

      if (dirent.isDirectory()) {
        entries.push({
          path: relPath,
          type: 'directory',
        });

        // Recurse into subdirectory
        await scanDirectory(fullPath);
      } else if (dirent.isFile()) {
        const fileStat = await stat(fullPath);
        const content = await readFile(fullPath, 'base64');

        entries.push({
          path: relPath,
          type: 'file',
          size: fileStat.size,
          content: content,
        });
      }
    }
  }

  // Execute scan
  await scanDirectory(__rootPath);

  // Prepare snapshot payload
  const snapshotData = {
    rootPath: __rootPath,
    entries,
  };

  // Determine output path (next to the workspace directory)
  const outputPath = join(dirname(__rootPath), 'snapshot.json');

  // Write snapshot.json
  await writeFile(outputPath, JSON.stringify(snapshotData, null, 2), 'utf-8');
};

await snapshot();
