import { Transform } from 'stream';

/** Use PowerShell's escape character
 * and escape newline with backtick
 * echo "hello`nworld`ntest" | node src/streams/filter.js --pattern test
 */

export const filter = () => {
  // Parse command-line arguments for --pattern
  const args = process.argv.slice(2);
  const patternIndex = args.indexOf('--pattern');
  if (patternIndex === -1 || patternIndex === args.length - 1) {
    process.exit(0);
  }
  const pattern = args[patternIndex + 1];

  // Create a transform stream that buffers chunks and emits complete lines
  const lineFilter = new Transform({
    transform(chunk, _, callback) {
      // Accumulate incoming data as a string
      this._buffer = (this._buffer || '') + chunk.toString();

      // Process all complete lines (ending with \n)
      const lines = this._buffer.split('\n');
      // Keep the last partial line in the buffer (if any)
      this._buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.includes(pattern)) {
          // Push the matching line (including newline)
          this.push(line + '\n');
        }
      }
      callback();
    },

    flush(callback) {
      // Handle any remaining data after the stream ends
      if (this._buffer && this._buffer.includes(pattern)) {
        this.push(this._buffer + '\n');
      }
      callback();
    },
  });

  // Pipe stdin through the filter to stdout
  process.stdin.pipe(lineFilter).pipe(process.stdout);
};

filter();
