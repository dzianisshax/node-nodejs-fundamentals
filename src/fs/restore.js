import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const restore = async () => {
  const targetDir = resolve(import.meta.dirname, '..', 'workspace_restored');
  const snapshotPath = resolve(import.meta.dirname, '..', 'snapshot.json');

  // Throw if snapshot.json doesn't exist
  if (!existsSync(snapshotPath)) {
    throw new Error('FS operation failed');
  }

  // Throw if workspace_restored already exists
  if (existsSync(targetDir)) {
    throw new Error('FS operation failed');
  }

  try {
    // Read and parse the snapshot
    const fileContent = await readFile(snapshotPath, 'utf8');
    const snapshot = JSON.parse(fileContent);

    // Create workspace_restored directory
    await mkdir(targetDir, { recursive: true });

    // Process each entry in the snapshot
    for (const entry of snapshot.entries) {
      // Safely join the target directory with the relative path from the entry
      const fullPath = join(targetDir, entry.path);

      if (entry.type === 'directory') {
        // Create directory (recursive true prevents errors if parent was already created)
        await mkdir(fullPath, { recursive: true });
      } else if (entry.type === 'file') {
        // Ensure the parent directory of the file exists just in case
        // the snapshot lists a file before its parent directory
        await mkdir(dirname(fullPath), { recursive: true });

        // Decode from base64 and write the file
        const decodedContent = Buffer.from(entry.content || '', 'base64');
        await writeFile(fullPath, decodedContent);
      }
    }
  } catch (error) {
    // Re-throw standardized error if something fails during the FS operations
    // (e.g., permissions issue during mkdir/writeFile)
    if (error.message !== 'FS operation failed') {
      throw new Error('FS operation failed');
    }
    throw error;
  }
};

await restore();
