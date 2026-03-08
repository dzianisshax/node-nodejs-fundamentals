import { Transform } from 'stream';

/**
 * Use PowerShell's escape character
 * and escape newline with backtick
 * echo "hello`nworld" | node src/streams/lineNumberer.js
 */

const lineNumberer = () => {
  let lineCount = 0;
  let buffer = ''; // holds partial line data between chunks

  const transform = new Transform({
    transform(chunk, _, callback) {
      buffer += chunk.toString();

      const lines = buffer.split('\n');
      // Last element is either an incomplete line or empty (if buffer ended with \n)
      const incomplete = lines.pop();

      // Emit all complete lines
      for (const line of lines) {
        const cleanLine = line.replace(/\r$/, ''); // remove Windows carriage return
        lineCount++;
        this.push(`${lineCount} | ${cleanLine}\n`);
      }

      // Keep the partial line for the next chunk
      buffer = incomplete;

      callback();
    },

    flush(callback) {
      // If data remains after the last chunk (no trailing newline)
      if (buffer) {
        const cleanLine = buffer.replace(/\r$/, '');
        lineCount++;
        this.push(`${lineCount} | ${cleanLine}`); // no newline – matches input
      }
      callback();
    },
  });

  // Pipe stdin - transform - stdout
  process.stdin.pipe(transform).pipe(process.stdout);
};

lineNumberer();
