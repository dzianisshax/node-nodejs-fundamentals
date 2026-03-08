import readline from 'node:readline';

const interactive = () => {
  // Initialize the readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  // Display the initial prompt
  rl.prompt();

  // Listen for user input
  rl.on('line', (line) => {
    const command = line.trim();

    switch (command) {
      case 'uptime':
        console.log(`Uptime: ${process.uptime().toFixed(2)}s`);
        break;
      case 'cwd':
        console.log(process.cwd());
        break;
      case 'date':
        console.log(new Date().toISOString());
        break;
      case 'exit':
        // Calling close() will trigger the 'close' event below
        rl.close();
        return;
      case '':
        // Ignore empty input and just re-prompt
        break;
      default:
        console.log('Unknown command');
        break;
    }

    // Re-prompt after command execution
    rl.prompt();
  });

  // Handle termination (exit command, Ctrl+C, or end of input)
  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
};

interactive();
