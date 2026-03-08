import { parentPort } from 'worker_threads';

parentPort.on('message', (data) => {
  try {
    // Check if the received data is an array
    if (!Array.isArray(data)) {
      throw new Error('Expected an array of numbers');
    }

    // Check if all elements are numbers
    const allNumbers = data.every((item) => typeof item === 'number');
    if (!allNumbers) {
      throw new Error('Array must contain only numbers');
    }

    // Sort the array in ascending order
    const sortedArray = [...data].sort((a, b) => a - b);

    // Send the sorted array back to the main thread
    parentPort.postMessage({
      success: true,
      data: sortedArray,
      originalLength: data.length,
    });
  } catch (error) {
    // Send error back to main thread if something goes wrong
    parentPort.postMessage({
      success: false,
      error: error.message,
    });
  }
});
