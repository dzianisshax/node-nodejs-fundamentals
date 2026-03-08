import { spawn } from 'node:child_process';

const execCommand = () => {
  // Get the command from command line arguments
  const commandString = process.argv[2];

  if (!commandString) {
    console.error('Error: Please provide a command to execute');
    console.error('Usage: node execCommand.js "command"');
    process.exit(1);
  }

  // Determine the shell based on platform
  const isWindows = process.platform === 'win32';
  const shell = isWindows
    ? { cmd: 'powershell.exe', arg: '-Command' }
    : { cmd: 'sh', arg: '-c' };

  console.log(`Executing: ${commandString}`);

  // Spawn the child process with shell
  const childProcess = spawn(shell.cmd, [shell.arg, commandString], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    shell: false, // We're explicitly providing the shell
  });

  // Pipe stdout to process.stdout
  childProcess.stdout.pipe(process.stdout);

  // Pipe stderr to process.stderr
  childProcess.stderr.pipe(process.stderr);

  // Handle child process exit
  childProcess.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // Handle errors in spawning the process
  childProcess.on('error', (err) => {
    console.error(`Failed to execute command: ${err.message}`);
    process.exit(1);
  });

  // Handle parent process signals
  process.on('SIGINT', () => {
    childProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    childProcess.kill('SIGTERM');
  });
};

execCommand();
