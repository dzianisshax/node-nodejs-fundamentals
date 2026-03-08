import { argv, exit } from 'node:process';

const dynamic = async () => {
  const pluginName = argv[2];

  // If no plugin name provided
  if (!pluginName) {
    exit(0);
  }

  try {
    // Dynamically import the module from the plugins directory
    const plugin = await import(`./plugins/${pluginName}.js`);

    // Call the exported run() function and print the result
    const result = plugin.run();
    console.log(result);
  } catch (error) {
    // Catch specifically the "module not found" error
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('Plugin not found');
      exit(1);
    }
  }
};

await dynamic();
