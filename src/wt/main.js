import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reads a JSON file containing an array of numbers
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<number[]>} - Array of numbers
 */
async function readNumbersFromFile(filePath) {
  try {
    const data = await readFile(filePath, 'utf8');
    const numbers = JSON.parse(data);

    if (!Array.isArray(numbers)) {
      throw new Error('JSON file must contain an array');
    }

    if (!numbers.every((item) => typeof item === 'number')) {
      throw new Error('Array must contain only numbers');
    }

    return numbers;
  } catch (error) {
    throw new Error(`Failed to read or parse JSON file: ${error.message}`);
  }
}

/**
 * Splits an array into N chunks
 * @param {number[]} array - Array to split
 * @param {number} numChunks - Number of chunks to create
 * @returns {number[][]} - Array of chunks
 */
function splitIntoChunks(array, numChunks) {
  const chunks = [];
  const chunkSize = Math.ceil(array.length / numChunks);

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, array.length);
    if (start < array.length) {
      chunks.push(array.slice(start, end));
    }
  }

  return chunks;
}

/**
 * Merges multiple sorted arrays into one sorted array using k-way merge algorithm
 * @param {number[][]} sortedChunks - Array of sorted arrays
 * @returns {number[]} - Merged sorted array
 */
function mergeSortedChunks(sortedChunks) {
  // Remove any empty chunks
  const nonEmptyChunks = sortedChunks.filter((chunk) => chunk.length > 0);

  if (nonEmptyChunks.length === 0) return [];
  if (nonEmptyChunks.length === 1) return nonEmptyChunks[0];

  // Min heap implementation using array
  const result = [];
  const heap = [];

  // Initialize heap with first element from each chunk
  for (let i = 0; i < nonEmptyChunks.length; i++) {
    if (nonEmptyChunks[i].length > 0) {
      heap.push({
        value: nonEmptyChunks[i][0],
        chunkIndex: i,
        elementIndex: 0,
      });
    }
  }

  // Heapify - sort by value
  heap.sort((a, b) => a.value - b.value);

  while (heap.length > 0) {
    // Get smallest element
    const smallest = heap.shift();
    result.push(smallest.value);

    // Move to next element in the same chunk
    const nextIndex = smallest.elementIndex + 1;
    if (nextIndex < nonEmptyChunks[smallest.chunkIndex].length) {
      heap.push({
        value: nonEmptyChunks[smallest.chunkIndex][nextIndex],
        chunkIndex: smallest.chunkIndex,
        elementIndex: nextIndex,
      });
      // Re-sort the heap
      heap.sort((a, b) => a.value - b.value);
    }
  }

  return result;
}

/**
 * Main function to process the array using worker threads
 * The data.json file must be located in the wt directory.
 */
const main = async () => {
  try {
    // Get number of logical CPU cores
    const numCores = os.cpus().length;

    // Read numbers from JSON file
    const filePath = join(__dirname, 'data.json');
    const numbers = await readNumbersFromFile(filePath);

    // Split array into chunks
    const chunks = splitIntoChunks(numbers, numCores);

    // Create workers and process chunks
    const workers = [];
    const workerPromises = [];

    for (let i = 0; i < chunks.length; i++) {
      const worker = new Worker(join(__dirname, 'worker.js'));
      workers.push(worker);

      // Create a promise for each worker
      const workerPromise = new Promise((resolve, reject) => {
        worker.on('message', (result) => {
          if (result.success) {
            resolve({
              index: i,
              sortedChunk: result.data,
              originalLength: result.originalLength,
            });
          } else {
            reject(new Error(`Worker ${i} error: ${result.error}`));
          }
        });

        worker.on('error', (error) => {
          reject(new Error(`Worker ${i} thread error: ${error.message}`));
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker ${i} stopped with exit code ${code}`));
          }
        });

        // Send the chunk to the worker
        worker.postMessage(chunks[i]);
      });

      workerPromises.push(workerPromise);
    }

    // Wait for all workers to complete
    const results = await Promise.all(workerPromises);

    // Sort results by original index to maintain order
    results.sort((a, b) => a.index - b.index);

    // Extract sorted chunks in order
    const sortedChunks = results.map((r) => r.sortedChunk);

    // Merge sorted chunks using k-way merge
    const finalSortedArray = mergeSortedChunks(sortedChunks);

    // Verify the final array is sorted
    const isSorted = finalSortedArray.every(
      (val, i, arr) => i === 0 || arr[i - 1] <= val
    );

    // Log the final sorted array
    console.log('\nFinal sorted array:');
    console.log(finalSortedArray);

    // Clean up workers
    workers.forEach((worker) => worker.terminate());
  } catch (error) {
    console.error('Error in main process:', error.message);
    process.exit(1);
  }
};

await main();
