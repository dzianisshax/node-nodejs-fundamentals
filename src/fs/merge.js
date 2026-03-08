import { readdir, readFile, writeFile, access } from 'fs/promises';
import { resolve, join } from 'path';

const __rootPath = resolve(import.meta.dirname, '..', 'workspace');

/**
 * The workspace folder must be located in the src directory.
 */
const merge = async () => {
  const partsDir = join(__rootPath, 'parts');
  const outputFile = join(__rootPath, 'merged.txt');
  let filesToMerge = [];

  try {
    // Parse the --files CLI argument
    const args = process.argv.slice(2);
    const filesArgIndex = args.indexOf('--files');

    if (filesArgIndex !== -1 && args[filesArgIndex + 1]) {
      // Optional behavior: Specific files requested
      const requestedFiles = args[filesArgIndex + 1].split(',');
      filesToMerge = requestedFiles.map((fileName) => join(partsDir, fileName));

      // Verify all requested files exist
      for (const filePath of filesToMerge) {
        await access(filePath);
      }
    } else {
      // Default behavior: Discover all .txt files
      // readdir will throw if partsDir doesn't exist
      const directoryContents = await readdir(partsDir);

      const txtFiles = directoryContents
        .filter((file) => file.endsWith('.txt'))
        .sort(); // Sorts alphabetically by default

      if (txtFiles.length === 0) {
        throw new Error('No text files found'); // Triggers the catch block
      }

      filesToMerge = txtFiles.map((fileName) => join(partsDir, fileName));
    }

    // Read all files in the determined order
    const fileContents = await Promise.all(
      filesToMerge.map((filePath) => readFile(filePath, 'utf8'))
    );

    // Concatenate and write to merged.txt
    const mergedText = fileContents.join('');
    await writeFile(outputFile, mergedText, 'utf8');
  } catch (error) {
    // Catch missing folders, missing files, or custom empty array trigger
    throw new Error('FS operation failed');
  }
};

await merge();
