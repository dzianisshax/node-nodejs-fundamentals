import { resolve } from 'node:path';
import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';

// It is assumed that the files are located in the src directory
// along with the checksums.json file
const __checksumsPath = resolve(import.meta.dirname, '..', 'checksums.json');
const __srcPath = resolve(import.meta.dirname, '..');

const calculateHashWithStreams = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    // If the file itself cannot be read, reject the promise
    stream.on('error', (err) => reject(err));

    // Pipe the file stream chunks into the hash object
    stream.on('data', (chunk) => hash.update(chunk));

    // Resolve the hex digest once the stream finishes
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

const verify = async () => {
  let fileContent;

  try {
    // Attempt to read the checksums file
    fileContent = await readFile(__checksumsPath, 'utf-8');
  } catch (error) {
    // Throw the error message if the file doesn't exist
    throw new Error('FS operation failed');
  }

  const checksums = JSON.parse(fileContent);

  // Iterate over each file defined in the JSON
  for (const [filename, expectedHash] of Object.entries(checksums)) {
    try {
      const filePath = resolve(__srcPath, filename);
      const actualHash = await calculateHashWithStreams(filePath);

      if (actualHash === expectedHash) {
        console.log(`${filename} — OK`);
      } else {
        console.log(`${filename} — FAIL`);
      }
    } catch (error) {
      // If the target file doesn't exist or is unreadable, it fails the check
      console.log(`${filename} — FAIL`);
    }
  }
};

await verify();
