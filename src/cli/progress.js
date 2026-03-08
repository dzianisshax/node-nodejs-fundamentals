import { argv, stdout } from 'node:process';

const DEFAULT_DURATION = 5000;
const DEFAULT_INTERVAL = 100;
const DEFAULT_LENGTH = 30;

// Parse CLI arguments with defaults
const parseArgs = () => {
  const args = argv.slice(2);
  const config = {
    duration: DEFAULT_DURATION,
    interval: DEFAULT_INTERVAL,
    length: DEFAULT_LENGTH,
    color: null,
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const val = args[i + 1];
    if (key === '--duration' && val)
      config.duration = parseInt(val, 10) || DEFAULT_DURATION;
    if (key === '--interval' && val)
      config.interval = parseInt(val, 10) || DEFAULT_INTERVAL;
    if (key === '--length' && val)
      config.length = parseInt(val, 10) || DEFAULT_LENGTH;
    if (key === '--color' && val) config.color = val;
  }
  return config;
};

// Validate and parse hex color into RGB for ANSI escape codes
// If --color receives an invalid string
// the script just prints the default terminal color
const getHexColor = (hex) => {
  if (!hex) return null;
  // Matches #RRGGBB or RRGGBB
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
};

const progress = () => {
  const { duration, interval, length, color } = parseArgs();
  const rgb = getHexColor(color);

  const startTime = Date.now();

  // setInterval is used for repeated execution of code
  // at a specified time interval
  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    let percent = duration > 0 ? elapsed / duration : 1;

    // Cap at 100% and clear the timer if we are done
    if (percent >= 1) {
      percent = 1;
      clearInterval(timer);
    }

    const filledLength = Math.round(length * percent);
    const emptyLength = length - filledLength;

    // Build the filled portion, applying color if valid
    let filledStr = '█'.repeat(filledLength);
    if (rgb && filledLength > 0) {
      filledStr = `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${filledStr}\x1b[0m`;
    }

    // Build the empty portion
    const emptyStr = ' '.repeat(emptyLength);
    const percentStr = Math.round(percent * 100);

    // Update the terminal line in place
    stdout.write(`\r[${filledStr}${emptyStr}] ${percentStr}%`);

    // Complete the process
    if (percent >= 1) {
      stdout.write('\nDone!\n');
    }
  }, interval);
};

progress();
