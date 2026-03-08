import { resolve } from 'node:path';
import { createReadStream, createWriteStream } from 'fs';
import readline from 'readline';

/**
 * The source.txt file must be located in the src directory.
 * Chunk files will be created in the src directory
 */

const split = async () => {
  // Parse the --lines CLI argument, defaulting to 10
  const args = process.argv.slice(2);
  let linesPerChunk = 10;
  const linesPerChunkIndex = args.indexOf('--lines');

  if (linesPerChunkIndex !== -1 && linesPerChunkIndex + 1 < args.length) {
    linesPerChunk = args[linesPerChunkIndex + 1];
  }

  const sourceFile = resolve(import.meta.dirname, '..', 'source.txt');

  // Create read stream with error handling
  const readStream = createReadStream(sourceFile, { encoding: 'utf8' });
  readStream.on('error', (err) => {
    console.error(`Failed to read ${sourceFile}:`, err);
    process.exit(1);
  });

  // Use readline to consume the file line by line
  const rl = readline.createInterface({
    input: readStream,
    crlfDelay: Infinity, // handles both \r\n and \n
  });

  let lineCount = 0;
  let chunkIndex = 1;
  let currentWriteStream = null;

  // Helper: close a write stream and wait for it to finish
  const closeWriteStream = (stream) => {
    if (!stream) return Promise.resolve();
    return new Promise((resolve, reject) => {
      stream.once('finish', resolve);
      stream.once('error', reject);
      stream.end();
    });
  };

  // Helper: write a line to the current stream with backpressure handling
  const writeLine = (stream, line) => {
    return new Promise((resolve, reject) => {
      const data = line + '\n';
      if (stream.write(data)) {
        resolve();
      } else {
        stream.once('drain', resolve);
        stream.once('error', reject);
      }
    });
  };

  try {
    // Process each line
    for await (const line of rl) {
      // Start a new chunk when we reach a multiple of linesPerChunk
      if (lineCount % linesPerChunk === 0) {
        // Close the previous chunk file
        await closeWriteStream(currentWriteStream);

        // Open a new chunk file
        const chunkFile = resolve(
          import.meta.dirname,
          '..',
          `chunk_${chunkIndex}.txt`
        );
        currentWriteStream = createWriteStream(chunkFile, { encoding: 'utf8' });
        currentWriteStream.on('error', (err) => {
          console.error(`Error writing to ${chunkFile}:`, err);
          process.exit(1);
        });
        chunkIndex++;
      }

      // Write the line to the current chunk
      if (currentWriteStream) {
        await writeLine(currentWriteStream, line);
      }
      lineCount++;
    }

    // Close the last chunk file
    await closeWriteStream(currentWriteStream);

    console.log(`Split completed. Created ${chunkIndex - 1} chunk file(s).`);
  } catch (err) {
    console.error('Unexpected error during splitting:', err);
    process.exit(1);
  }
};

await split();
