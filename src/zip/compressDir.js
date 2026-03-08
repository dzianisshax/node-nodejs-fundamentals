import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { createBrotliCompress } from 'zlib';
import { pipeline } from 'stream/promises';
import path from 'path';
import { Readable } from 'stream';

/**
 * The workspace folder must be located in the src directory.
 */

const compressDir = async () => {
  const rootPath = path.resolve(import.meta.dirname, '..');
  const sourceDir = path.join(rootPath, 'workspace', 'toCompress');
  const targetDir = path.join(rootPath, 'workspace', 'compressed');
  const archivePath = path.join(targetDir, 'archive.br');

  try {
    // Check if source directory exists
    await fs.access(sourceDir);
  } catch (error) {
    throw new Error('FS operation failed');
  }

  // Create target directory if it doesn't exist
  await fs.mkdir(targetDir, { recursive: true });

  // Compress the directory
  await createTarArchive(sourceDir, archivePath);
};

async function createTarArchive(sourceDir, archivePath) {
  const writeStream = createWriteStream(archivePath);
  const brotliCompress = createBrotliCompress();

  // Create a readable stream that generates tar data
  const tarSource = new TarSource(sourceDir);

  await pipeline(tarSource, brotliCompress, writeStream);
}

class TarSource extends Readable {
  constructor(sourceDir) {
    super({
      objectMode: false,
      highWaterMark: 64 * 1024, // 64kb buffer
    });

    this.sourceDir = sourceDir;
    this.files = [];
    this.currentFileIndex = 0;
    this.currentFileStream = null;
    this.currentFileSize = 0;
    this.currentFileBytesRead = 0;
    this.wroteEndMarker = false;
  }

  async _construct(callback) {
    try {
      // Get all files and directories
      await this.scanDirectory(this.sourceDir, '');

      // Sort to ensure directories come before their contents
      this.files.sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.path.localeCompare(b.path);
      });

      callback();
    } catch (error) {
      callback(error);
    }
  }

  async scanDirectory(dir, relativePath) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const entryRelativePath = relativePath
        ? path.join(relativePath, entry.name).split(path.sep).join('/')
        : entry.name;

      if (entry.isDirectory()) {
        // Add directory entry (with trailing slash)
        this.files.push({
          type: 'directory',
          path: entryRelativePath + '/',
          fullPath,
        });

        // Recursively scan subdirectory
        await this.scanDirectory(fullPath, entryRelativePath);
      } else {
        // Add file entry
        const stats = await fs.stat(fullPath);
        this.files.push({
          type: 'file',
          path: entryRelativePath,
          fullPath,
          size: stats.size,
        });
      }
    }
  }

  _read(size) {
    // Use setImmediate to avoid stack overflow
    setImmediate(() => this._processRead(size));
  }

  async _processRead(size) {
    try {
      // If we've already ended, don't do anything
      if (this.wroteEndMarker) {
        return;
      }

      // If we're in the middle of streaming a file
      if (this.currentFileStream) {
        const data = this.currentFileStream.read(size);

        if (data === null) {
          // Wait for more data
          this.currentFileStream.once('readable', () => this._read(size));
          return;
        }

        // Push file data
        this.currentFileBytesRead += data.length;
        const canContinue = this.push(data);

        // Check if file is complete
        if (this.currentFileBytesRead >= this.currentFileSize) {
          // Handle padding
          const padding = this.currentFileSize % 512;
          if (padding > 0) {
            const paddingBuffer = Buffer.alloc(512 - padding);
            const canContinueAfterPadding = this.push(paddingBuffer);
            if (!canContinueAfterPadding) {
              return;
            }
          }

          // Close current file stream
          this.currentFileStream.destroy();
          this.currentFileStream = null;
          this.currentFileBytesRead = 0;
          this.currentFileIndex++;

          // Continue with next file
          this._read(size);
        } else if (!canContinue) {
          // Backpressure - wait for drain
          return;
        }

        return;
      }

      // Check if we've processed all files
      if (this.currentFileIndex >= this.files.length) {
        if (!this.wroteEndMarker) {
          // Write end of archive markers (two zero blocks)
          this.push(Buffer.alloc(512));
          this.push(Buffer.alloc(512));
          this.wroteEndMarker = true;
          this.push(null); // End the stream
        }
        return;
      }

      // Get next entry
      const entry = this.files[this.currentFileIndex];

      // Create header
      const header = this.createTarHeader(entry);
      const canContinue = this.push(header);
      if (!canContinue) {
        return;
      }

      // If it's a file, prepare to stream its content
      if (entry.type === 'file') {
        this.currentFileStream = createReadStream(entry.fullPath, {
          highWaterMark: 64 * 1024, // 64kb chunks
          autoClose: true,
        });
        this.currentFileSize = entry.size;
        this.currentFileBytesRead = 0;

        // Set up error handling
        this.currentFileStream.on('error', (err) => {
          this.destroy(err);
        });

        // Start reading file data
        this.currentFileStream.once('readable', () => this._read(size));
      } else {
        // Directory entry - move to next
        this.currentFileIndex++;
        // Continue with next entry
        setImmediate(() => this._read(size));
      }
    } catch (error) {
      this.destroy(error);
    }
  }

  createTarHeader(entry) {
    const header = Buffer.alloc(512);
    header.fill(0);

    // File name (100 bytes)
    const nameBuffer = Buffer.from(entry.path);
    nameBuffer.copy(header, 0, 0, Math.min(nameBuffer.length, 100));

    // File mode (8 bytes, octal) - 644 for files, 755 for dirs
    const mode = entry.type === 'directory' ? '40755' : '100644';
    Buffer.from(mode.padStart(7, '0') + '\0').copy(header, 100, 0, 8);

    // Owner ID (8 bytes, octal)
    Buffer.from('0001750\0').copy(header, 108, 0, 8);

    // Group ID (8 bytes, octal)
    Buffer.from('0001750\0').copy(header, 116, 0, 8);

    // File size (12 bytes, octal) - for directories, size is 0
    const size = entry.type === 'file' ? entry.size : 0;
    const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
    Buffer.from(sizeOctal).copy(header, 124, 0, 12);

    // Last modification time (12 bytes, octal)
    const mtime =
      Math.floor(Date.now() / 1000)
        .toString(8)
        .padStart(11, '0') + '\0';
    Buffer.from(mtime).copy(header, 136, 0, 12);

    // Type flag (156th byte)
    // 0 = normal file, 5 = directory
    header[156] = entry.type === 'directory' ? 53 : 48;

    // Calculate checksum (148-155)
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
    Buffer.from(checksumOctal).copy(header, 148, 0, 8);

    return header;
  }

  _destroy(err, callback) {
    // Clean up any open file streams
    if (this.currentFileStream && !this.currentFileStream.destroyed) {
      this.currentFileStream.destroy();
    }
    callback(err);
  }
}

await compressDir();
