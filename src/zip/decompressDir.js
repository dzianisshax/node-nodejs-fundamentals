import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { createBrotliDecompress } from 'zlib';
import { pipeline } from 'stream/promises';
import path from 'path';
import { Writable } from 'stream';

/**
 * The workspace folder must be located in the src directory.
 */

const decompressDir = async () => {
  const rootPath = path.resolve(import.meta.dirname, '..');
  const compressedDir = path.join(rootPath, 'workspace', 'compressed');
  const archivePath = path.join(compressedDir, 'archive.br');
  const targetDir = path.join(rootPath, 'workspace', 'decompressed');

  try {
    // Check if compressed directory and archive.br exist
    await fs.access(compressedDir);
    await fs.access(archivePath);
  } catch (error) {
    throw new Error('FS operation failed');
  }

  // Clean and create target directory
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  // Decompress and extract the archive
  await extractTarArchive(archivePath, targetDir);
};

async function extractTarArchive(archivePath, targetDir) {
  const readStream = createReadStream(archivePath);
  const brotliDecompress = createBrotliDecompress();

  // Create a writable stream that parses tar data and extracts files
  const tarExtractor = new TarExtractor(targetDir);

  await pipeline(readStream, brotliDecompress, tarExtractor);
}

class TarExtractor extends Writable {
  constructor(targetDir) {
    super({ objectMode: false });

    this.targetDir = targetDir;
    this.buffer = Buffer.alloc(0);
    this.currentFile = null;
    this.currentFilePath = null;
    this.bytesRemaining = 0;
  }

  async _write(chunk, encoding, callback) {
    try {
      this.buffer = Buffer.concat([this.buffer, chunk]);

      while (this.buffer.length > 0) {
        // If we're not processing a file, try to read a header
        if (!this.currentFile) {
          // Need at least 512 bytes for a header
          if (this.buffer.length < 512) {
            break;
          }

          const header = this.buffer.subarray(0, 512);

          // Check for end of archive (two consecutive zero blocks)
          if (this.isZeroBlock(header)) {
            this.buffer = this.buffer.subarray(512);

            // Check for second zero block
            if (
              this.buffer.length >= 512 &&
              this.isZeroBlock(this.buffer.subarray(0, 512))
            ) {
              this.buffer = this.buffer.subarray(512);
            }
            break;
          }

          // Parse header
          const headerInfo = this.parseTarHeader(header);

          if (headerInfo) {
            this.buffer = this.buffer.subarray(512);

            if (headerInfo.type === 'directory') {
              // Create directory
              const dirPath = path.join(this.targetDir, headerInfo.filename);
              await fs.mkdir(dirPath, { recursive: true });
            } else if (headerInfo.type === 'file') {
              // Prepare for file extraction
              const filePath = path.join(this.targetDir, headerInfo.filename);
              const fileDir = path.dirname(filePath);

              // Ensure directory exists
              await fs.mkdir(fileDir, { recursive: true });

              // Create write stream for the file
              const writeStream = createWriteStream(filePath);

              this.currentFile = {
                writeStream,
                size: headerInfo.size,
                remaining: headerInfo.size,
                path: filePath,
              };
            }
          } else {
            // Invalid header, skip
            this.buffer = this.buffer.subarray(512);
          }
        } else {
          // We're processing a file
          const bytesToRead = Math.min(
            this.buffer.length,
            this.currentFile.remaining
          );

          if (bytesToRead > 0) {
            const fileData = this.buffer.subarray(0, bytesToRead);

            // Write to file
            const canContinue = this.currentFile.writeStream.write(fileData);

            this.currentFile.remaining -= bytesToRead;
            this.buffer = this.buffer.subarray(bytesToRead);

            // Handle backpressure
            if (!canContinue) {
              await new Promise((resolve) =>
                this.currentFile.writeStream.once('drain', resolve)
              );
            }
          }

          // Check if file is complete
          if (this.currentFile.remaining === 0) {
            // Close the write stream
            await new Promise((resolve, reject) => {
              this.currentFile.writeStream.end((err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Handle padding
            const padding = this.currentFile.size % 512;
            if (padding > 0) {
              const paddingBytes = 512 - padding;
              if (this.buffer.length >= paddingBytes) {
                this.buffer = this.buffer.subarray(paddingBytes);
              }
            }

            this.currentFile = null;
          }
        }
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  isZeroBlock(buffer) {
    return buffer.every((byte) => byte === 0);
  }

  parseTarHeader(header) {
    // Read filename (first 100 bytes)
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) {
      nameEnd++;
    }
    let filename = header.subarray(0, nameEnd).toString('utf8');

    if (!filename) {
      return null;
    }

    // Read size (offset 124, 12 bytes) as octal
    const sizeStr = header
      .subarray(124, 136)
      .toString('utf8')
      .replace(/\0/g, '')
      .trim();
    const size = parseInt(sizeStr, 8);

    // Read type flag (offset 156)
    const typeFlag = header[156];

    // Check if it's a directory (trailing slash or type flag 5)
    const isDirectory = filename.endsWith('/') || typeFlag === 53;

    // Remove trailing slash for directory name
    if (isDirectory && filename.endsWith('/')) {
      filename = filename.slice(0, -1);
    }

    return {
      filename,
      size: isNaN(size) ? 0 : size,
      type: isDirectory ? 'directory' : 'file',
    };
  }

  async _destroy(err, callback) {
    if (
      this.currentFile?.writeStream &&
      !this.currentFile.writeStream.destroyed
    ) {
      this.currentFile.writeStream.destroy();
    }
    callback(err);
  }

  async _final(callback) {
    if (this.currentFile) {
      callback(
        new Error(`Incomplete file at end of archive: ${this.currentFile.path}`)
      );
    } else {
      callback();
    }
  }
}

await decompressDir();
