// =============================================================================
// WORD SELECTION & SECRECY ENGINE MODULE
// Real-time Multiplayer Drawing Game Backend
// =============================================================================
// Purpose: Generate word options, handle word selection, and mask words
// This module ensures word secrecy - only drawer sees options, word never leaked
// =============================================================================

const gameEngine = require('./gameEngine');

// =============================================================================
// WORD LIST
// =============================================================================

// Default word list for generating options
// Words are categorized by difficulty for better game balance
const WORD_LIST = [
  // Easy words
  'cat', 'dog', 'house', 'tree', 'car', 'sun', 'moon', 'star', 'book', 'pen',
  'chair', 'table', 'door', 'window', 'phone', 'computer', 'keyboard', 'mouse',
  'apple', 'banana', 'orange', 'cake', 'pizza', 'hamburger', 'ice cream',
  'bird', 'fish', 'lion', 'tiger', 'elephant', 'giraffe', 'monkey', 'bear',
  'flower', 'grass', 'mountain', 'ocean', 'river', 'beach', 'cloud', 'rain',
  'bicycle', 'airplane', 'train', 'boat', 'bus', 'motorcycle', 'truck',
  'hat', 'shoes', 'shirt', 'pants', 'dress', 'jacket', 'glasses', 'watch',
  
  // Medium words
  'camera', 'guitar', 'piano', 'violin', 'drum', 'microphone', 'speaker',
  'lighthouse', 'bridge', 'castle', 'tower', 'pyramid', 'statue', 'fountain',
  'butterfly', 'dragonfly', 'spider', 'bee', 'ant', 'snake', 'turtle', 'frog',
  'cactus', 'bamboo', 'palm tree', 'forest', 'desert', 'island', 'volcano',
  'helicopter', 'submarine', 'rocket', 'satellite', 'telescope', 'microscope',
  'backpack', 'umbrella', 'flashlight', 'compass', 'map', 'globe', 'flag',
  'crown', 'sword', 'shield', 'treasure', 'key', 'lock', 'chain', 'ring',
  
  // Hard words
  'kaleidoscope', 'telescope', 'microscope', 'periscope', 'binoculars',
  'architect', 'engineer', 'scientist', 'astronaut', 'pilot', 'chef', 'artist',
  'skyscraper', 'cathedral', 'monument', 'amphitheater', 'aqueduct', 'colosseum',
  'chameleon', 'peacock', 'flamingo', 'penguin', 'ostrich', 'eagle', 'hawk',
  'tornado', 'hurricane', 'earthquake', 'avalanche', 'tsunami', 'meteor',
  'saxophone', 'trumpet', 'trombone', 'flute', 'clarinet', 'harmonica', 'accordion',
  'knight', 'wizard', 'dragon', 'unicorn', 'phoenix', 'mermaid', 'vampire'
];

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

const WORD_OPTIONS_COUNT = 3;
const WORD_SELECTION_TIMEOUT = 15000; // 15 seconds to select word

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get word pool combining custom words and default word list
 * @param {Array} customWords - Custom words from room settings
 * @returns {Array} Combined word pool
 */
function getWordPool(customWords) {
  const pool = [...WORD_LIST];
  
  // Add custom words if they exist
  if (Array.isArray(customWords) && customWords.length > 0) {
    // Filter out duplicates
    const customLower = customWords.map(w => w.toLowerCase());
    pool.push(...customLower.filter(w => !pool.includes(w)));
  }
  
  return pool;
}

/**
 * Generate random word options for drawer to choose from
 * @param {Array} wordPool - Pool of available words
 * @param {number} count - Number of options to generate
 * @returns {Array} Array of word options
 */
function generateWordOptions(wordPool, count = WORD_OPTIONS_COUNT) {
  if (!wordPool || wordPool.length === 0) {
    // Fallback to default words if pool is empty
    wordPool = WORD_LIST;
  }
  
  // Ensure we don't request more words than available
  const optionsCount = Math.min(count, wordPool.length);
  
  // Shuffle and pick random words
  const shuffled = [...wordPool].sort(() => Math.random() - 0.5);
  console.log(`[WORD] Shuffled word pool: ${shuffled.slice(0, optionsCount)}`);
  return shuffled.slice(0, optionsCount);
}

/**
 * Mask a word for display to guessers
 * Replaces letters with underscores, preserves spaces
 * @param {string} word - Word to mask
 * @returns {string} Masked word (e.g., "cat" -> "_ _ _")
 */
function maskWord(word) {
  if (!word || typeof word !== 'string') {
    return '';
  }
  
  // Replace each character with underscore, preserve spaces
  return word
    .split('')
    .map(char => char === ' ' ? ' ' : '_')
    .join(' ');
}

/**
 * Normalize word for comparison (lowercase, trim)
 * @param {string} word - Word to normalize
 * @returns {string} Normalized word
 */
function normalizeWord(word) {
  if (!word || typeof word !== 'string') {
    return '';
  }
  return word.trim().toLowerCase();
}

// =============================================================================
// WORD SELECTION FUNCTIONS
// =============================================================================

/**
 * Generate word options for current drawer
 * Called when round starts and phase is WORD_SELECT
 * @param {Object} room - Room object with active game
 * @returns {Object} { success: boolean, options: Array|null, error: string|null }
 */
function generateOptionsForDrawer(room) {
  // Validate game state
  const validation = gameEngine.hasActiveGame(room);
  if (!validation.valid) {
    return { success: false, options: null, error: validation.error };
  }
  
  const game = room.game;
  
  // Check if we're in word selection phase
  if (game.phase !== gameEngine.PHASES.WORD_SELECT) {
    return { success: false, options: null, error: 'Not in word selection phase' };
  }
  
  // Get word pool from room settings
  const wordPool = getWordPool(room.settings.customWords);
  
  // Generate options
  const options = generateWordOptions(wordPool, WORD_OPTIONS_COUNT);
  
  console.log(`[WORD] Generated options for drawer: ${room.id} | Drawer: ${game.drawerId} | Options: ${options.length}`);
  
  return { success: true, options: options, error: null };
}

/**
 * Select word for current round
 * Validates selection and updates game state
 * @param {Object} room - Room object with active game
 * @param {string} playerId - Player selecting word (must be drawer)
 * @param {string} selectedWord - Word selected by drawer
 * @returns {Object} { success: boolean, maskedWord: string|null, error: string|null }
 */
function selectWord(room, playerId, selectedWord) {
  // Validate game state
  const validation = gameEngine.hasActiveGame(room);
  if (!validation.valid) {
    return { success: false, maskedWord: null, error: validation.error };
  }
  
  const game = room.game;
  
  // Check if player is the drawer
  if (!gameEngine.isCurrentDrawer(room, playerId)) {
    return { success: false, maskedWord: null, error: 'Only drawer can select word' };
  }
  
  // Check if we're in word selection phase
  if (game.phase !== gameEngine.PHASES.WORD_SELECT) {
    return { success: false, maskedWord: null, error: 'Not in word selection phase' };
  }
  
  // Validate selected word
  const normalized = normalizeWord(selectedWord);
  if (!normalized || normalized.length === 0) {
    return { success: false, maskedWord: null, error: 'Invalid word selection' };
  }
  
  // Store selected word (server-only, never sent to clients)
  game.selectedWord = normalized;
  
  // Generate masked word for guessers
  game.maskedWord = maskWord(normalized);
  
  // Transition to drawing phase
  const phaseResult = gameEngine.transitionPhase(room, gameEngine.PHASES.DRAWING);
  if (!phaseResult.success) {
    return { success: false, maskedWord: null, error: phaseResult.error };
  }
  
  console.log(`[WORD] Word selected: ${room.id} | Round: ${game.currentRound} | Drawer: ${playerId} | Word: ${normalized} | Masked: ${game.maskedWord}`);
  
  return { success: true, maskedWord: game.maskedWord, error: null };
}

/**
 * Auto-select word if drawer doesn't select in time
 * Picks first option from generated options (fallback)
 * @param {Object} room - Room object with active game
 * @returns {Object} { success: boolean, maskedWord: string|null, error: string|null }
 */
function autoSelectWord(room) {
  // Validate game state
  const validation = gameEngine.hasActiveGame(room);
  if (!validation.valid) {
    return { success: false, maskedWord: null, error: validation.error };
  }
  
  const game = room.game;
  
  // Check if we're in word selection phase
  if (game.phase !== gameEngine.PHASES.WORD_SELECT) {
    return { success: false, maskedWord: null, error: 'Not in word selection phase' };
  }
  
  // Generate word pool and pick first option
  const wordPool = getWordPool(room.settings.customWords);
  const options = generateWordOptions(wordPool, WORD_OPTIONS_COUNT);
  
  if (options.length === 0) {
    return { success: false, maskedWord: null, error: 'No words available' };
  }
  
  // Auto-select first option
  const selectedWord = options[0];
  const normalized = normalizeWord(selectedWord);
  
  // Store selected word
  game.selectedWord = normalized;
  game.maskedWord = maskWord(normalized);
  
  // Transition to drawing phase
  const phaseResult = gameEngine.transitionPhase(room, gameEngine.PHASES.DRAWING);
  if (!phaseResult.success) {
    return { success: false, maskedWord: null, error: phaseResult.error };
  }
  
  console.log(`[WORD] Auto-selected word: ${room.id} | Round: ${game.currentRound} | Drawer: ${game.drawerId} | Word: ${normalized}`);
  
  return { success: true, maskedWord: game.maskedWord, error: null };
}

/**
 * Get masked word for guessers (never reveal actual word)
 * @param {Object} room - Room object with active game
 * @returns {string|null} Masked word or null if not set
 */
function getMaskedWord(room) {
  if (!room.game || !room.game.maskedWord) {
    return null;
  }
  return room.game.maskedWord;
}

/**
 * Get selected word (server-only, for validation)
 * @param {Object} room - Room object with active game
 * @returns {string|null} Selected word or null if not set
 */
function getSelectedWord(room) {
  if (!room.game || !room.game.selectedWord) {
    return null;
  }
  return room.game.selectedWord;
}

/**
 * Clear word selection (for round reset)
 * @param {Object} room - Room object with active game
 */
function clearWordSelection(room) {
  if (room.game) {
    room.game.selectedWord = null;
    room.game.maskedWord = null;
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  // Word selection
  generateOptionsForDrawer,
  selectWord,
  autoSelectWord,
  
  // Word access (server-only)
  getSelectedWord,
  getMaskedWord,
  clearWordSelection,
  
  // Utilities
  maskWord,
  normalizeWord,
  
  // Constants
  WORD_SELECTION_TIMEOUT
};

