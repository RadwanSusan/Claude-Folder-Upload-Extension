// content.js
import { 
	ALLOWED_EXTENSIONS as DEFAULT_ALLOWED_EXTENSIONS, 
	DOT_FOLDERS as DEFAULT_DOT_FOLDERS, 
	CRITICAL_DOT_FOLDERS,
	TEXT_FILE_EXTENSIONS // For UX Improvement 3 (Combine Text Files)
} from './config.js';

// Max file size for individual files (Claude's typical limit is 10MB)
const CONFIG = {
	MAX_FILE_SIZE: 10 * 1024 * 1024, // Used by FileFilter
	UPLOAD_TIMEOUT: 30000,
	DEBOUNCE_DELAY: 300,
	ANIMATION_DURATION: 300,
	DOM_CHECK_INTERVAL: 1000,
	// Conservative limits for pre-upload warning
	CLAUDE_MAX_FILES: 10, 
	CLAUDE_MAX_FILE_SIZE_MB: 10, 
	CLAUDE_MAX_TOTAL_SIZE_MB: 50 
};
const utils = {
	debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	},
	formatSize(bytes) {
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}
		return `${size.toFixed(1)} ${units[unitIndex]}`;
	},
	async readFileContent(fileEntry) {
		return new Promise((resolve, reject) => {
			fileEntry.file((file) => {
				const reader = new FileReader();
				reader.onload = (e) => resolve(e.target.result);
				reader.onerror = reject;
				reader.readAsText(file);
			});
		});
	},
	// For UX Improvement 3: Utility to read File object as text
	async readFileObjectAsText(fileObject) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target.result);
			reader.onerror = (e) => reject(new Error(`Error reading file ${fileObject.name}: ${e.target.error}`));
			reader.readAsText(fileObject);
		});
	},
};
class FileFilter {
	constructor(initialAllowedExtensions, includeHidden = false) {
		this.currentAllowedExtensions = new Set(initialAllowedExtensions);
		this.includeHidden = includeHidden;
		this.gitignorePatterns = [];
		this.unsupportedGitignorePatterns = []; // For UX Improvement 2
		this.baseDirectory = '';
		this.compiledPatterns = new Map();
	}

	isAllowedFile(file) {
		const extension = file.name.split('.').pop()?.toLowerCase();
		const result = { name: file.name, path: file.fullPath || file.webkitRelativePath || file.name, type: 'file' };

		if (!extension || !this.currentAllowedExtensions.has(extension)) {
			return { ...result, allowed: false, reason: 'Disallowed file type' };
		}
		if (file.size > CONFIG.MAX_FILE_SIZE) {
			return { ...result, allowed: false, reason: `Exceeds size limit of ${utils.formatSize(CONFIG.MAX_FILE_SIZE)}` };
		}
		return { ...result, allowed: true };
	}

	shouldExcludeFolder(entry) { // Expects a FileSystemDirectoryEntry or similar with name and fullPath
		const path = entry.fullPath;
		const name = entry.name;
		const result = { name, path, type: 'folder', excluded: false };
		const parts = path.split('/').filter(Boolean);
		const activeExclusionList = this.includeHidden ? CRITICAL_DOT_FOLDERS : DEFAULT_DOT_FOLDERS;

		const isExcluded = parts.some((part) => {
			if (this.includeHidden) {
				if (activeExclusionList.has(part)) {
					result.reason = 'Critical system folder'; // e.g. .git
					return true;
				}
			} else {
				if (DEFAULT_DOT_FOLDERS.has(part)) { // Check against the comprehensive list first
					result.reason = part.startsWith('.') ? 'Standard hidden system folder' : 'Standard excluded folder'; // e.g. .vscode, node_modules
					return true;
				}
				if (part.startsWith('.')) { // General check for any other dotfolder
					result.reason = 'Hidden folder';
					return true;
				}
			}
			return false;
		});

		if (isExcluded) {
			result.excluded = true;
		}
		return result;
	}

	async loadGitignore(entry) {
		// This function doesn't return exclusion status, it loads patterns.
		// The parts.some(...) logic was mistakenly placed here from shouldExcludeFolder in a previous merge.
		// Corrected shouldExcludeFolder is already in place.
		try {
			this.baseDirectory = entry.fullPath;
			const gitignoreEntry = await this.findGitignore(entry);
			if (gitignoreEntry) {
				const content = await utils.readFileContent(gitignoreEntry);
				this.parseGitignore(content);
			}
		} catch (error) {
			console.error('Error loading .gitignore:', error);
		}
	}
	async findGitignore(entry) {
		return new Promise((resolve) => {
			if (!entry.isDirectory) {
				resolve(null);
				return;
			}
			const reader = entry.createReader();
			reader.readEntries((entries) => {
				resolve(entries.find((e) => e.name === '.gitignore'));
			});
		});
	}
	parseGitignore(content) {
		this.gitignorePatterns = content
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => {
				const isValid = line && !line.startsWith('#');
				return isValid;
			})
			.map((pattern) => {
				// For UX Improvement 2: Handle unsupported patterns
				if (pattern.startsWith('!')) {
					this.unsupportedGitignorePatterns.push(pattern);
					console.warn(`Negation patterns (!) in .gitignore are not currently supported and will be ignored: "${pattern}"`);
					return null; // Skip this pattern
				}
				try {
					if (!this.compiledPatterns.has(pattern)) {
						let regexPattern = pattern
							.replace(/[.+^${}()|[\]\\]/g, '\\$&')
							.replace(/\*/g, '.*')
							.replace(/\?/g, '.');
						if (pattern.startsWith('/')) {
							regexPattern = '^' + regexPattern.slice(1);
						} else if (!pattern.startsWith('*')) {
							regexPattern = '.*' + regexPattern;
						}
						if (pattern.endsWith('/')) {
							regexPattern = regexPattern + '.*';
						}
						const regex = new RegExp(
							`(${regexPattern}$)|(${regexPattern}/.*)`,
							'i',
						);
						this.compiledPatterns.set(pattern, regex);
					}
					return this.compiledPatterns.get(pattern);
				} catch (error) {
					console.warn(`Invalid gitignore pattern, cannot convert to RegExp: "${pattern}"`, error);
					this.unsupportedGitignorePatterns.push(pattern); // Add problematic pattern
					return null;
				}
			})
			.filter((pattern) => pattern !== null);
	}

	shouldIgnore(entry) { // Expects a FileSystemEntry
		const itemPath = entry.fullPath;
		const itemName = entry.name;
		const itemType = entry.isDirectory ? 'folder' : 'file';
		const result = { name: itemName, path: itemPath, type: itemType, ignored: false };

		// The original shouldExcludeFolder(filePath) call here was problematic
		// because shouldExcludeFolder now expects an entry and returns a detailed object.
		// We should rely on the scanDirectory function to call shouldExcludeFolder first for directories.
		// For files, this check is not directly applicable in this way.
		// This method should focus purely on .gitignore.

		const relativePath = itemPath
			.replace(this.baseDirectory, '')
			.replace(/^\/+/, '');

		const isIgnoredByGitignore = this.gitignorePatterns.some((pattern) => {
			try {
				return pattern.test(relativePath);
			} catch (error) {
				console.warn(`Error testing gitignore pattern against path: ${relativePath}`, error);
				return false;
			}
		});

		if (isIgnoredByGitignore) {
			result.ignored = true;
			result.reason = 'Ignored by .gitignore';
		}
		return result;
	}
}
class ClaudeFolderUploader {
	constructor() {
		if (!this.validateEnvironment()) {
			throw new Error(
				'This extension only works on Claude.ai project pages',
			);
		}
		this.state = {
			files: [],
			totalFiles: 0,
			processedFiles: 0,
			uploadedFiles: 0,
			isMinimized: true,
			isProcessing: false,
			directories: new Map(),
			selectedDirectories: new Set(),
			// invalidFiles and ignoredFiles are deprecated in favor of excludedItems
			// activeExtensions will store the current list of extensions (custom or default)
			// It will be an array of strings, e.g., ['txt', 'py']
			activeExtensions: [],
			includeHidden: false, // Default state for the new toggle
			excludedItems: [], // For UX Improvement 1: Track excluded/ignored files
			unsupportedGitignorePatterns: [], // For UX Improvement 2
			scannedItemsCount: 0, // For UX Improvement 3 (Granular Progress)
		};
		// FileFilter will be initialized in initialize() after loading extensions
		this.fileFilter = null;
		// For Pre-Upload Warning Modal
		this._tempDataForUpload = { rootItems: null, files: [] };
		this.observers = {
			uploadZone: null,
			mutations: null,
		};
		this.elements = {};
		this.initialize();
	}
	validateEnvironment() {
		return window.location.href.match(/claude\.ai\/project\/[a-zA-Z0-9-]+$/);
	}
	async initialize() {
		try {
			await this.loadExtensions(); // Load custom extensions list
			await this.loadIncludeHiddenState(); // Load the state for "include hidden" toggle
			
			// Initialize FileFilter with both loaded states
			this.fileFilter = new FileFilter(this.state.activeExtensions, this.state.includeHidden);
			
			await this.initializeDOM(); // Then build DOM
			
			// Set checkbox state based on loaded state
			if (this.elements.includeHiddenToggle) {
				this.elements.includeHiddenToggle.checked = this.state.includeHidden;
			}

			this.elements.dropZoneContent.style.display = 'none';
			this.elements.dropZone.classList.add('minimized');
			this.updateMinimizedState();
			await this.loadState(); // Load other UI states like minimized status
			this.setupObservers();
			this.setupEventListeners(); // Setup event listeners which might depend on DOM and FileFilter
		} catch (error) {
			console.error('Initialization error:', error);
		}
	}

	async loadExtensions() {
		return new Promise((resolve) => {
			chrome.storage.local.get(['customAllowedExtensions'], (result) => {
				if (chrome.runtime.lastError) {
					console.error('Error loading customAllowedExtensions from storage:', chrome.runtime.lastError);
					this.state.activeExtensions = Array.from(DEFAULT_ALLOWED_EXTENSIONS);
				} else if (result.customAllowedExtensions && result.customAllowedExtensions.length > 0) {
					this.state.activeExtensions = result.customAllowedExtensions;
				} else {
					this.state.activeExtensions = Array.from(DEFAULT_ALLOWED_EXTENSIONS);
				}
				resolve();
			});
		});
	}

	async loadIncludeHiddenState() {
		return new Promise((resolve) => {
			chrome.storage.local.get(['includeHidden'], (result) => {
				if (chrome.runtime.lastError) {
					console.error('Error loading includeHidden from storage:', chrome.runtime.lastError);
					this.state.includeHidden = false; // Default to false on error
				} else {
					this.state.includeHidden = result.includeHidden === true; // Ensure boolean, default false if undefined
				}
				resolve();
			});
		});
	}

	createDOM() {
		const container = document.createElement('div');
		container.className = 'folder-uploader';
		container.innerHTML = `
			<div id="concatenate-modal" class="modal-overlay" style="display: none;">
				<div class="modal-container">
					<h3 class="modal-title">Combined Text from Selected Files</h3>
					<div class="modal-content">
						<div class="concatenated-info">
							<span id="concat-file-count">Files combined: 0</span>
							<span id="concat-char-count">Total characters: 0</span>
						</div>
						<textarea id="concatenated-text-area" readonly rows="15" placeholder="Combined text will appear here..."></textarea>
					</div>
					<div class="modal-actions">
						<button id="copy-concatenated-btn" class="modal-button primary">Copy to Clipboard</button>
						<button id="close-concatenate-modal-btn" class="modal-button secondary">Close</button>
					</div>
				</div>
			</div>

			<div id="pre-upload-warning-modal" class="modal-overlay" style="display: none;">
				<div class="modal-container">
					<h3 class="modal-title">Upload Confirmation & Warning</h3>
					<div class="modal-content">
						<p><strong>Summary of your selection:</strong></p>
						<ul class="upload-summary-list">
							<li id="summary-total-files">Total files selected: 0</li>
							<li id="summary-total-size">Total size: 0 MB</li>
							<li id="summary-largest-file">Largest single file: 0 MB</li>
						</ul>
						<p id="modal-warning-message" class="warning-message-text"></p>
					</div>
					<div class="modal-actions">
						<button id="modal-proceed-btn" class="modal-button primary">Proceed with Upload</button>
						<button id="modal-cancel-btn" class="modal-button secondary">Cancel</button>
					</div>
				</div>
			</div>
			 <div class="folder-drop-zone minimized">
				  <div class="drop-zone-header">
						<span>Folder Uploader</span>
						<button class="minimize-btn" title="Minimize">
							 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
								  <path d="M20 12H4"/>
							 </svg>
						</button>
						<button class="settings-btn" title="Settings">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="3"></circle>
								<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V12a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
							</svg>
						</button>
				  </div>
            <div class="drop-zone-content" style="display: none;">
                  <div class="settings-panel" style="display: none;">
                      <h3>Customize Allowed File Extensions</h3>
                      <p class="settings-description">Enter file extensions, one per line (e.g., txt, py, js). Do not include leading dots.</p>
                      <textarea id="custom-extensions-area" rows="10" placeholder="txt\njs\nhtml\ncss\npdf"></textarea>
                      <div class="settings-actions">
                          <button class="save-settings-btn">Save</button>
                          <button class="reset-settings-btn">Reset to Default</button>
                          <button class="close-settings-btn">Close</button>
                      </div>
                  </div>
                  <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/>
                      <path d="M12 11v6M9 14l3-3 3 3"/>
                  </svg>
                  <div class="drop-text">Drop folder here</div>
                  <div class="hidden-files-toggle-container">
                      <label for="include-hidden-toggle" class="hidden-files-label">
                          <input type="checkbox" id="include-hidden-toggle">
                          <span class="checkbox-custom- apariencia"></span>
                          Include most hidden files/folders (respects .gitignore)
                      </label>
                      <small class="hidden-files-note">Applies to next folder drop. Some critical folders like .git are always excluded.</small>
                  </div>
                  <div class="upload-info">
                      <svg class="info-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                      Drag and drop a folder to upload all files
                      <div class="file-limit-info">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                          Supports files up to 100MB
                      </div>
                  </div>
                  <div class="directory-selection" style="display: none;">
                      <div class="selection-header">
                          Select Folders to Upload
                          <div class="selection-count">0 selected</div>
                      </div>
                      <div class="excluded-items-container">
                          <button id="toggle-excluded-btn" class="toggle-excluded-btn" disabled>Show 0 excluded items</button>
                          <div id="excluded-items-list" class="excluded-items-list" style="display: none;">
                              <h4>Excluded Items:</h4>
                              {/* Items will be populated here by JS */}
                          </div>
                      </div>
                      <div class="directory-list"></div>
                      <div class="directory-actions">
                          <button class="select-all-btn">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M20 6L9 17l-5-5"/>
                              </svg>
                              Select All
                          </button>
                          <button class="upload-selected-btn">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                  <polyline points="17 8 12 3 7 8"/>
                                  <line x1="12" y1="3" x2="12" y2="15"/>
                              </svg>
                              Upload Selected
                          </button>
                          <button class="cancel-selection-btn">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                  <circle cx="12" cy="12" r="10"/>
                                  <line x1="15" y1="9" x2="9" y2="15"/>
                                  <line x1="9" y1="9" x2="15" y2="15"/>
                              </svg>
                              Cancel
                          </button>
                          <button id="combine-text-files-btn" class="directory-action-btn combine-btn" disabled title="Combine selected text files">
															<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
																<path d="M4 6h16M4 12h16M4 18h16"/> {/* Simple lines/hamburger for combine */}
															</svg>
															Combine Texts
													</button>
                      </div>
                  </div>
                  <div class="file-stats" style="display: none;">
                      <div class="stats-header">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="17 8 12 3 7 8"/>
                              <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          Upload Progress
                      </div>
                      <div class="stats-content">
													<span id="scan-items-text" style="display: none;">Scanned items: <span id="scanned-items-count">0</span></span>
													<span id="processing-items-text" style="display: block;">Processing: <span class="processed-count">0</span>/<span class="total-count">0</span></span>
													<span id="scan-complete-text" style="display: none;"></span> {/* For "Scan complete. Found X files..." */}
                          <div class="progress-bar"> {/* This will be hidden/shown */}
                              <div class="progress-bar-fill" style="width: 0%"></div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      `;
		return container;
	}
	async activateUploadZone() {
		const dummyFile = new File([''], 'dummy.txt', { type: 'text/plain' });
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(dummyFile);
		const events = {
			dragenter: new DragEvent('dragenter', {
				bubbles: true,
				cancelable: true,
				dataTransfer,
			}),
			dragover: new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				dataTransfer,
			}),
		};
		document.body.dispatchEvent(events.dragenter);
		document.body.dispatchEvent(events.dragover);
		await this.wait(500);
	}
	showStats() {
		if (!this.elements.stats) return;
		this.elements.stats.style.display = 'block';
		this.updateStats();
		this.elements.dropZone.classList.add('is-processing');
		const statsHeader = this.elements.stats.querySelector('.stats-header');
		const scanItemsText = this.elements.stats.querySelector('#scan-items-text');
		const processingItemsText = this.elements.stats.querySelector('#processing-items-text');
		const scanCompleteText = this.elements.stats.querySelector('#scan-complete-text');
		const progressBar = this.elements.stats.querySelector('.progress-bar');

		if (!statsHeader || !scanItemsText || !processingItemsText || !scanCompleteText || !progressBar) return;

		this.elements.stats.style.display = 'block';
		this.elements.dropZone.classList.add('is-processing'); // Or a new class like 'is-scanning'

		if (status === 'scanning') {
			statsHeader.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                Scanning folder...`;
			scanItemsText.style.display = 'block';
			this.elements.stats.querySelector('#scanned-items-count').textContent = this.state.scannedItemsCount;
			processingItemsText.style.display = 'none';
			scanCompleteText.style.display = 'none';
			progressBar.style.display = 'none';
		} else if (status === 'scanComplete') {
			statsHeader.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"/>
                </svg>
                Scan Complete`;
			scanItemsText.style.display = 'none';
			processingItemsText.style.display = 'none';
			scanCompleteText.style.display = 'block'; // Text will be set by showDirectorySelection
			progressBar.style.display = 'none';
		} else if (status === 'uploading') { // Default to upload progress view
			statsHeader.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Upload Progress`;
			scanItemsText.style.display = 'none';
			processingItemsText.style.display = 'block';
			scanCompleteText.style.display = 'none';
			progressBar.style.display = 'block';
			this.updateStats(); // Update the processed/total counts
		}
		// Add is-processing class to dropzone to indicate activity
		if (status === 'scanning' || status === 'uploading') {
			this.elements.dropZone.classList.add('is-processing');
		} else {
			this.elements.dropZone.classList.remove('is-processing');
		}
	}

	updateScanProgressDisplay() {
		if (this.elements.stats && this.elements.stats.querySelector('#scanned-items-count')) {
			this.elements.stats.querySelector('#scanned-items-count').textContent = this.state.scannedItemsCount;
		}
	}

	createDirectoryItem(dir) {
		const item = document.createElement('div');
		item.className = 'directory-item';
		item.dataset.path = dir.path;
		const hasValidContent = dir.fileCount > 0;
		if (!hasValidContent) {
			item.classList.add('empty-directory');
		}
		if (hasValidContent) {
			item.classList.add('selected');
			this.state.selectedDirectories.add(dir.path);
		}
		const fileCount = dir.fileCount;
		const totalSize =
			this.calculateTotalSize(dir.files) +
			dir.subdirs.reduce(
				(sum, subdir) => sum + this.calculateTotalSize(subdir.files),
				0,
			);
		item.innerHTML = `
			 <label class="directory-checkbox-wrapper">
				  <input type="checkbox" class="directory-checkbox"
						${hasValidContent ? 'checked' : ''}
						${hasValidContent ? '' : 'disabled'}>
				  <span class="checkbox-custom"></span>
			 </label>
			 <div class="directory-content">
				  <div class="directory-name">
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
							 <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/>
						</svg>
						${this.escapeHtml(dir.name)}
				  </div>
				  <div class="directory-info">
						${
							hasValidContent
								? `${fileCount} files (${utils.formatSize(totalSize)})`
								: 'Empty'
						}
				  </div>
			 </div>
		`;
		const checkbox = item.querySelector('.directory-checkbox');
		if (checkbox) {
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.state.selectedDirectories.add(dir.path);
					item.classList.add('selected');
				} else {
					this.state.selectedDirectories.delete(dir.path);
					item.classList.remove('selected');
				}
				this.updateSelectionCount();
			});
		}
		return item;
	}
	escapeHtml(unsafe) {
		return unsafe
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
	wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	hideStats() {
		if (this.elements.stats) {
			this.elements.stats.style.display = 'none';
			this.elements.dropZone.classList.remove('is-processing');
		}
	}
	updateStats() {
		if (
			!this.elements.processed ||
			!this.elements.total ||
			!this.elements.progressBar
		) {
			return;
		}
		this.elements.processed.textContent = this.state.processedFiles;
		this.elements.total.textContent = this.state.totalFiles;
		const progress =
			(this.state.processedFiles / this.state.totalFiles) * 100;
		this.elements.progressBar.style.width = `${progress}%`;
		if (this.state.processedFiles === this.state.totalFiles) {
			const statsHeader = this.elements.stats.querySelector('.stats-header');
			if (statsHeader) {
				statsHeader.innerHTML = `
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Upload Complete
              `;
			}
			this.elements.dropZone.classList.remove('is-processing');
		}
	}
	getMessageIcon(type) {
		const icons = {
			success: '<path d="M20 6L9 17l-5-5"/>',
			error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
			warning:
				'<path d="M12 9v4M12 16h.01"/><path d="M12 2L2 20h20L12 2z"/>',
		};
		return icons[type] || icons.info;
	}
	async initializeDOM() {
		if (document.querySelector('.folder-uploader')) {
			return;
		}
		this.container = this.createDOM();
		document.body.appendChild(this.container);
		this.cacheElements();
	}
	cacheElements() {
		const selectors = {
			dropZone: '.folder-drop-zone',
			stats: '.file-stats',
			processed: '.processed-count',
			total: '.total-count',
			progressBar: '.progress-bar-fill',
			directoryList: '.directory-list',
			directorySelection: '.directory-selection',
			dropZoneContent: '.drop-zone-content',
			settingsPanel: '.settings-panel',
			customExtensionsArea: '#custom-extensions-area',
			includeHiddenToggle: '#include-hidden-toggle',
			toggleExcludedBtn: '#toggle-excluded-btn',
			excludedItemsList: '#excluded-items-list',
			// Pre-upload warning modal elements
			preUploadWarningModal: '#pre-upload-warning-modal',
			summaryTotalFiles: '#summary-total-files',
			summaryTotalSize: '#summary-total-size',
			summaryLargestFile: '#summary-largest-file',
			modalWarningMessage: '#modal-warning-message',
			modalProceedBtn: '#modal-proceed-btn',
			modalCancelBtn: '#modal-cancel-btn',
			// Concatenate Text Modal elements
			concatenateModal: '#concatenate-modal',
			concatenatedTextArea: '#concatenated-text-area',
			copyConcatenatedBtn: '#copy-concatenated-btn',
			closeConcatenateModalBtn: '#close-concatenate-modal-btn',
			combineTextFilesBtn: '#combine-text-files-btn',
			concatFileCount: '#concat-file-count',
			concatCharCount: '#concat-char-count',
		};
		for (const [key, selector] of Object.entries(selectors)) {
			this.elements[key] = this.container.querySelector(selector);
		}
	}
	setupEventListeners() {
		const dropZone = this.elements.dropZone;
		this.handleDragEnter = this.handleDragEnter.bind(this);
		this.handleDragOver = this.handleDragOver.bind(this);
		this.handleDragLeave = this.handleDragLeave.bind(this);
		this.handleDrop = this.handleDrop.bind(this);
		dropZone.addEventListener('dragenter', this.handleDragEnter);
		dropZone.addEventListener('dragover', this.handleDragOver);
		dropZone.addEventListener('dragleave', this.handleDragLeave);
		dropZone.addEventListener('drop', this.handleDrop);
		const minimizeBtn = this.container.querySelector('.minimize-btn');
		if (minimizeBtn) {
			minimizeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleMinimize();
			});
		}

		const settingsBtn = this.container.querySelector('.settings-btn');
		if (settingsBtn) {
			settingsBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleSettingsPanel();
			});
		}

		const saveSettingsBtn = this.container.querySelector('.save-settings-btn');
		if (saveSettingsBtn) {
			saveSettingsBtn.addEventListener('click', () => this.saveCustomExtensions());
		}

		const resetSettingsBtn = this.container.querySelector('.reset-settings-btn');
		if (resetSettingsBtn) {
			resetSettingsBtn.addEventListener('click', () => this.resetExtensionsToDefault());
		}

		const closeSettingsBtn = this.container.querySelector('.close-settings-btn');
		if (closeSettingsBtn) {
			closeSettingsBtn.addEventListener('click', () => this.toggleSettingsPanel(false));
		}

		if (this.elements.includeHiddenToggle) {
			this.elements.includeHiddenToggle.addEventListener('change', (e) => this.handleIncludeHiddenToggle(e.target.checked));
		}

		if (this.elements.toggleExcludedBtn) {
			this.elements.toggleExcludedBtn.addEventListener('click', () => this.toggleExcludedItemsVisibility());
		}
		
		// Event listeners for the pre-upload warning modal
		if (this.elements.modalProceedBtn) {
			this.elements.modalProceedBtn.addEventListener('click', () => this.handleModalProceed());
		}
		if (this.elements.modalCancelBtn) {
			this.elements.modalCancelBtn.addEventListener('click', () => this.hidePreUploadWarningModal());
		}

		// Event listeners for Concatenate Text Modal (UX Improvement 3)
		if (this.elements.combineTextFilesBtn) {
			this.elements.combineTextFilesBtn.addEventListener('click', () => this.handleCombineTextFiles());
		}
		if (this.elements.copyConcatenatedBtn) {
			this.elements.copyConcatenatedBtn.addEventListener('click', () => this.copyConcatenatedText());
		}
		if (this.elements.closeConcatenateModalBtn) {
			this.elements.closeConcatenateModalBtn.addEventListener('click', () => this.hideConcatenateModal());
		}

		this.setupHoverHandlers();
	}

	// --- Start of UX Improvement 3: Combine Text Files Logic ---
	async handleCombineTextFiles() {
		const selectedFiles = this.getSelectedFilesForCombination();
		if (selectedFiles.length === 0) {
			this.showWarning("No selectable text files found in the current selection.");
			return;
		}

		let combinedContent = "";
		let filesCombinedCount = 0;
		let totalChars = 0;

		const fileReadPromises = selectedFiles.map(file => 
			utils.readFileObjectAsText(file)
				.then(content => {
					combinedContent += `// --- FILENAME: ${file.name} ---\n`;
					combinedContent += content;
					combinedContent += "\n\n"; // Add a separator
					filesCombinedCount++;
					totalChars += content.length;
				})
				.catch(error => {
					console.warn(`Could not read file ${file.name} for concatenation:`, error);
					this.state.excludedItems.push({ // Log to excluded items for visibility
						name: file.name, 
						path: file.webkitRelativePath || file.name, 
						type: 'file', 
						reason: `Error reading for concatenation: ${error.message}`
					});
				})
		);

		try {
			await Promise.all(fileReadPromises);
		} catch (error) {
			// Errors are caught per file, but a general error could occur if Promise.all itself fails.
			console.error("Error during batch file reading for concatenation:", error);
			this.showError("An error occurred while reading files for combination.");
			return;
		}
		

		if (filesCombinedCount === 0) {
			this.showWarning("No text files could be read or combined from the selection.");
			return;
		}
		
		this.elements.concatenatedTextArea.value = combinedContent.trim();
		this.elements.concatFileCount.textContent = `Files combined: ${filesCombinedCount}`;
		this.elements.concatCharCount.textContent = `Total characters: ${totalChars}`;
		this.elements.concatenateModal.classList.add('visible');
	}

	getSelectedFilesForCombination() {
		const filesToCombine = [];
		// This logic needs to correctly iterate through what's considered "selected"
		// If selection is purely directory based:
		this.state.selectedDirectories.forEach(dirPath => {
			const dirData = this.findDirectoryDataByPath(this.processedRootItemsForSelection, dirPath); // Need processedRootItems
			if (dirData) {
				dirData.files.forEach(file => {
					const extension = file.name.split('.').pop()?.toLowerCase();
					if (TEXT_FILE_EXTENSIONS.has(extension)) {
						filesToCombine.push(file);
					}
				});
			}
		});
		// If rootItems can also contain directly selected files (not in subdirs)
		// This part depends on how `this.processedRootItemsForSelection` is structured and if it holds root files.
		// For simplicity, assuming selection is directory-based as per current UI.
		// If no directories are selected, but root items exist, consider those.
		if (this.state.selectedDirectories.size === 0 && this.processedRootItemsForSelection) {
			this.processedRootItemsForSelection.forEach(rootItem => {
				if (rootItem.entry.isDirectory) { // If a root folder is dropped
					rootItem.files.forEach(file => { // Files directly in the root folder
						const extension = file.name.split('.').pop()?.toLowerCase();
						if (TEXT_FILE_EXTENSIONS.has(extension)) {
							filesToCombine.push(file);
						}
					});
				} else if (rootItem.entry.isFile) { // If a root file is dropped
					const file = rootItem.files[0];
					const extension = file.name.split('.').pop()?.toLowerCase();
					if (TEXT_FILE_EXTENSIONS.has(extension)) {
						filesToCombine.push(file);
					}
				}
			});
		}


		// Deduplicate files (e.g., if a root dir and its subdirs are implicitly/explicitly selected)
		const uniqueFiles = [];
		const seenPaths = new Set();
		for (const file of filesToCombine) {
			const path = file.webkitRelativePath || file.name;
			if (!seenPaths.has(path)) {
				seenPaths.add(path);
				uniqueFiles.push(file);
			}
		}
		return uniqueFiles;
	}
	
	// Helper to find directory data from stored rootItems (used by getSelectedFilesForCombination)
	// this.processedRootItemsForSelection needs to be populated when directories are shown.
	// Let's assume it's populated in showDirectorySelection
	findDirectoryDataByPath(rootItems, path) {
		if (!rootItems) return null;
		for (const rootItem of rootItems) {
			if (rootItem.path === path) return rootItem;
			if (rootItem.subdirs && rootItem.subdirs.length > 0) {
				const foundInSubdir = this.findDirectoryDataByPath(rootItem.subdirs, path);
				if (foundInSubdir) return foundInSubdir;
			}
		}
		return null;
	}


	copyConcatenatedText() {
		if (!this.elements.concatenatedTextArea) return;
		try {
			navigator.clipboard.writeText(this.elements.concatenatedTextArea.value);
			const originalText = this.elements.copyConcatenatedBtn.textContent;
			this.elements.copyConcatenatedBtn.textContent = "Copied!";
			this.elements.copyConcatenatedBtn.disabled = true;
			setTimeout(() => {
				this.elements.copyConcatenatedBtn.textContent = originalText;
				this.elements.copyConcatenatedBtn.disabled = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy text: ', err);
			this.showError("Failed to copy text. See console for details.");
		}
	}

	hideConcatenateModal() {
		if (this.elements.concatenateModal) {
			this.elements.concatenateModal.classList.remove('visible');
		}
	}
	// --- End of UX Improvement 3 ---


	handleModalProceed() {
	handleModalProceed() {
		this.hidePreUploadWarningModal(); // Also clears _tempDataForUpload
		if (this._tempDataForUpload.files && this._tempDataForUpload.files.length > 0) {
			this.elements.directorySelection.style.display = 'none'; 
			
			this.state.files = this._tempDataForUpload.files;
			this.state.totalFiles = this.state.files.length;
			this.state.processedFiles = 0; // Reset for new upload batch
			this.state.uploadedFiles = 0;  // Reset for new upload batch
			this.state.isProcessing = true;
			this.showStats(); // Update stats display for the new batch
			
			// Directly call uploadFiles, bypassing processSelectedItems as file collection is done.
			this.uploadFiles().catch(error => { 
				this.showError(`Upload failed: ${error.message}`);
				console.error('Upload error after modal proceed:', error);
				this.state.isProcessing = false; 
				this.updateStats(); // Reflect error/stop in stats
			});
		} else {
			console.error("No files stored for proceeding with upload.");
			// this.showError("An error occurred. Please try selecting files again."); // Already handled by hidePreUploadWarningModal clearing data
		}
		// _tempDataForUpload is cleared by hidePreUploadWarningModal
	}
	
	hidePreUploadWarningModal() {
		if (this.elements.preUploadWarningModal) {
			this.elements.preUploadWarningModal.classList.remove('visible');
		}
		this._tempDataForUpload = { rootItems: null, files: [] }; // Clear temporary data
	}
	
	showPreUploadWarningModal(summary) { 
		if (!this.elements.preUploadWarningModal || !this.elements.summaryTotalFiles) {
			console.error("Modal elements not found. Cannot show warning. Proceeding with upload.");
			this.handleModalProceed(); 
			return;
		}

		this.elements.summaryTotalFiles.textContent = `Total files selected: ${summary.totalFiles}`;
		this.elements.summaryTotalSize.textContent = `Total size: ${utils.formatSize(summary.totalSize)}`;
		this.elements.summaryLargestFile.textContent = `Largest single file: ${utils.formatSize(summary.largestFileSize)}`;

		let warningText = "";
		let proceedAllowed = true; 

		if (summary.totalFiles > CONFIG.CLAUDE_MAX_FILES) {
			warningText += `Your selection of ${summary.totalFiles} files exceeds the typical limit of ~${CONFIG.CLAUDE_MAX_FILES} files. `;
		}
		const largestFileMB = summary.largestFileSize / (1024 * 1024);
		if (largestFileMB > CONFIG.CLAUDE_MAX_FILE_SIZE_MB) {
			warningText += `Your largest file (${utils.formatSize(summary.largestFileSize)}) may exceed the typical ${CONFIG.CLAUDE_MAX_FILE_SIZE_MB}MB per file limit. `;
		}
		const totalSizeMB = summary.totalSize / (1024 * 1024);
		if (totalSizeMB > CONFIG.CLAUDE_MAX_TOTAL_SIZE_MB) {
			warningText += `The total size of your selection (${utils.formatSize(summary.totalSize)}) is large and may exceed overall capacity (around ${CONFIG.CLAUDE_MAX_TOTAL_SIZE_MB}MB). `;
		}

		if (warningText) {
			this.elements.modalWarningMessage.textContent = `Warning: ${warningText} Uploading may fail or take a very long time. Consider reducing your selection.`;
			this.elements.modalWarningMessage.className = 'warning-message-text'; 
		} else {
			this.elements.modalWarningMessage.textContent = "Your selection seems within typical limits for Claude.ai.";
			this.elements.modalWarningMessage.className = 'warning-message-text no-warning'; 
		}
		
		this.elements.modalProceedBtn.disabled = !proceedAllowed;
		this.elements.preUploadWarningModal.classList.add('visible');
	}

	toggleExcludedItemsVisibility() {
		const list = this.elements.excludedItemsList;
		const btn = this.elements.toggleExcludedBtn;
		if (list.style.display === 'none') {
			list.style.display = 'block';
			this.renderExcludedItems(); // Re-render in case items changed but list was hidden
			btn.textContent = `Hide ${this.state.excludedItems.length} excluded items`;
		} else {
			list.style.display = 'none';
			btn.textContent = `Show ${this.state.excludedItems.length} excluded items`;
		}
	}
	
	renderExcludedItems() {
		if (!this.elements.excludedItemsList || !this.state.excludedItems) return;
		
		this.elements.excludedItemsList.innerHTML = '<h4>Excluded Items:</h4>'; // Clear previous, keep header
		if (this.state.excludedItems.length === 0) {
			this.elements.excludedItemsList.innerHTML += '<p>No items were excluded.</p>';
			return;
		}

		const ul = document.createElement('ul');
		this.state.excludedItems.forEach(item => {
			const li = document.createElement('li');
			li.className = 'excluded-item';
			
			const iconSvg = item.type === 'folder' 
				? '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/></svg>'
				: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';

			li.innerHTML = `
				<span class="excluded-item-icon">${iconSvg}</span>
				<span class="excluded-item-path" title="${this.escapeHtml(item.path)}">${this.escapeHtml(item.name)}</span>
				<span class="excluded-item-reason">(${this.escapeHtml(item.reason || 'Unknown reason')})</span>
			`;
			ul.appendChild(li);
		});
		this.elements.excludedItemsList.appendChild(ul);
	}


	handleIncludeHiddenToggle(isChecked) {
		this.state.includeHidden = isChecked;
		chrome.storage.local.set({ includeHidden: isChecked }, () => {
			if (chrome.runtime.lastError) {
				console.error('Error saving includeHidden state:', chrome.runtime.lastError);
				// Optionally show an error to the user
			} else {
				console.log('Include hidden files/folders state saved:', isChecked);
				// The note about applying to the next drop is already in the UI.
				// If we wanted to clear current selection:
				// if (this.elements.directorySelection.style.display !== 'none') {
				// this.showWarning("Setting changed. Please drop your folder again to apply.");
				// this.handleCancelSelection(); // or a more specific reset
				// }
			}
		});
		// Update FileFilter instance if it exists
		if (this.fileFilter) {
			this.fileFilter.includeHidden = isChecked;
		}
	}

	toggleSettingsPanel(forceShow) {
		const show = forceShow !== undefined ? forceShow : this.elements.settingsPanel.style.display === 'none';
		this.elements.settingsPanel.style.display = show ? 'block' : 'none';
		
		if (show) {
			this.elements.dropZone.classList.add('settings-active');
			this.populateExtensionsTextarea();
		} else {
			this.elements.dropZone.classList.remove('settings-active');
		}
	}

	populateExtensionsTextarea() {
		if (this.elements.customExtensionsArea && this.state.activeExtensions) {
			this.elements.customExtensionsArea.value = this.state.activeExtensions.join('\n');
		}
	}

	saveCustomExtensions() {
		const newExtensionsRaw = this.elements.customExtensionsArea.value;
		const newExtensionsArray = newExtensionsRaw
			.split('\n')
			.map(ext => ext.trim().toLowerCase().replace(/^\./, '')) // Remove leading dots
			.filter(ext => ext.length > 0);

		if (newExtensionsArray.length === 0) {
			this.showError("Extension list cannot be empty. Add some extensions or reset to default.");
			return;
		}
		
		this.state.activeExtensions = newExtensionsArray;
		this.fileFilter.currentAllowedExtensions = new Set(newExtensionsArray);

		chrome.storage.local.set({ customAllowedExtensions: newExtensionsArray }, () => {
			if (chrome.runtime.lastError) {
				console.error('Error saving extensions:', chrome.runtime.lastError);
				this.showError('Failed to save settings.');
			} else {
				console.log('Custom extensions saved:', newExtensionsArray);
				this.showSuccess('File extension settings saved!');
				this.toggleSettingsPanel(false); // Close panel on successful save
			}
		});
	}

	resetExtensionsToDefault() {
		const defaultExtArray = Array.from(DEFAULT_ALLOWED_EXTENSIONS);
		this.state.activeExtensions = defaultExtArray;
		this.fileFilter.currentAllowedExtensions = new Set(defaultExtArray);
		this.elements.customExtensionsArea.value = defaultExtArray.join('\n');

		// Save the default list to storage, effectively resetting customization
		chrome.storage.local.set({ customAllowedExtensions: defaultExtArray }, () => {
			if (chrome.runtime.lastError) {
				console.error('Error resetting extensions to default:', chrome.runtime.lastError);
				this.showError('Failed to reset settings.');
			} else {
				console.log('Extensions reset to default and saved to storage.');
				this.showSuccess('Extensions reset to default.');
			}
		});
	}

	handleDragEnter(e) {
		e.preventDefault();
		e.stopPropagation();
		if (!this.state.isMinimized && !this.state.isProcessing) {
			this.elements.dropZone.classList.add('dragover');
		}
	}
	handleDragOver(e) {
		e.preventDefault();
		e.stopPropagation();
		if (!this.state.isMinimized && !this.state.isProcessing) {
			this.elements.dropZone.classList.add('dragover');
		}
	}
	handleDragLeave(e) {
		e.preventDefault();
		e.stopPropagation();
		this.elements.dropZone.classList.remove('dragover');
	}
	handleDragEvent = (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!this.state.isMinimized && !this.state.isProcessing) {
			this.elements.dropZone.classList.add('dragover');
		}
	};
	setupHoverHandlers() {
		const dropZone = this.elements.dropZone;
		dropZone.addEventListener('click', () => {
			if (this.state.isMinimized) {
				this.maximize();
			}
		});
		dropZone.addEventListener('mouseenter', () => {
			if (this.state.isMinimized) {
				this.showTooltip('Click to expand');
			}
		});
		dropZone.addEventListener('mouseleave', () => {
			const tooltip = this.container.querySelector('.tooltip');
			if (tooltip) {
				tooltip.remove();
			}
		});
	}
	showTooltip(text) {
		const existingTooltip = this.container.querySelector('.tooltip');
		if (existingTooltip) {
			existingTooltip.remove();
		}
		const tooltip = document.createElement('div');
		tooltip.className = 'tooltip';
		tooltip.textContent = text;
		this.container.appendChild(tooltip);
		setTimeout(() => (tooltip.style.opacity = '1'), 10);
		setTimeout(() => {
			tooltip.style.opacity = '0';
			setTimeout(() => tooltip.remove(), 200);
		}, 1500);
	}
	setupObservers() {
		this.observers.mutations = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === 'childList' &&
					mutation.addedNodes.length > 0
				) {
					if (!document.querySelector('.folder-uploader')) {
						this.initializeDOM();
					}
				}
			}
		});
		this.observers.mutations.observe(document.body, {
			childList: true,
			subtree: true,
		});
		this.setupUploadZoneObserver();
	}
	setupUploadZoneObserver() {
		this.observers.uploadZone = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'childList') {
					const uploadZone = this.findUploadZoneImmediate();
					if (uploadZone) {
						this.lastKnownUploadZone = uploadZone;
					}
				}
			}
		});
		this.observers.uploadZone.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}
	async processDroppedItems(rootEntries) {
		const processedDirInfos = []; // Renamed from processedItems to avoid confusion with file-level items
		for (const rootEntryWrapper of rootEntries) { // Assuming rootEntries is an array of {entry, isRoot, path}
			const entry = rootEntryWrapper.entry;
			if (entry.isDirectory) {
				// Load .gitignore from the root directory being dropped
				await this.fileFilter.loadGitignore(entry);
				// For UX Improvement 2: Propagate unsupported patterns
				this.state.unsupportedGitignorePatterns = this.fileFilter.unsupportedGitignorePatterns || [];
				
				// Check if the root directory itself should be excluded or ignored
				const folderExcludeResult = this.fileFilter.shouldExcludeFolder(entry);
				if (folderExcludeResult.excluded) {
					this.state.excludedItems.push(folderExcludeResult);
					continue; // Skip this root entry
				}
				const folderIgnoreResult = this.fileFilter.shouldIgnore(entry);
				if (folderIgnoreResult.ignored) {
					this.state.excludedItems.push(folderIgnoreResult);
					continue; // Skip this root entry
				}

				const dirInfo = await this.scanDirectory(entry, true);
				if (dirInfo.fileCount > 0 || dirInfo.subdirs.length > 0) { // Include even if only subdirs have files
					processedDirInfos.push(dirInfo);
				} else if (!this.state.excludedItems.some(item => item.path === dirInfo.path)) {
					// If the root itself is empty after filtering, and not explicitly excluded,
					// we might want to show it as "empty" later, but it won't have files to upload.
					// For now, if it has no processable content, don't add to processedDirInfos.
				}
			} else if (entry.isFile) {
				// Handle top-level files dropped directly
				const ignoreResult = this.fileFilter.shouldIgnore(entry);
				if (ignoreResult.ignored) {
					this.state.excludedItems.push(ignoreResult);
					continue;
				}

				const file = await this.getFileInfo(entry);
				// Add fullPath to file object if it's not already there
				if (!file.fullPath) file.fullPath = entry.fullPath;

				const allowedResult = this.fileFilter.isAllowedFile(file);
				if (allowedResult.allowed) {
					// Create a dirInfo-like structure for standalone files to pass to showDirectorySelection
					processedDirInfos.push({
						entry: entry,
						path: entry.fullPath,
						name: entry.name,
						files: [file], // Wrap the file in an array
						subdirs: [],
						fileCount: 1,
						totalSize: file.size,
						isRoot: true, // Mark as a root item
						level: 0,
					});
				} else {
					this.state.excludedItems.push(allowedResult);
				}
			}
		}

		// After processing all root entries, update the UI
		if (processedDirInfos.length === 0 && this.state.excludedItems.length > 0) {
			// All items were excluded, or it was empty to begin with
			this.showDirectorySelection([]); // Pass empty to still trigger excluded items display
			this.showWarning("No files/folders selected for upload after filtering.");
			return; // Important to return here if nothing can be selected
		}
		
		if (processedDirInfos.length === 0) {
			throw new Error('No processable files or folders found.');
		}
		this.showDirectorySelection(processedDirInfos);
	}
	async handleDrop(e) {
		e.preventDefault();
		e.stopPropagation();
		if (this.state.isProcessing) {
			this.showError('Already processing files. Please wait.');
			return;
		}
		this.elements.dropZone.classList.remove('dragover');
		this.resetState(); 
		this.showStats('scanning'); // UX Improvement 3: Show scanning progress
		try {
			const items = Array.from(e.dataTransfer.items);
			const entries = items
				.filter((item) => item.kind === 'file')
				.map((item) => item.webkitGetAsEntry());
			if (!entries.length) {
				throw new Error('No valid items found in drop');
			}
			const rootEntries = entries.map((entry) => ({
				entry,
				isRoot: true,
				path: entry.name,
			}));
			await this.processDroppedItems(rootEntries);
		} catch (error) {
			this.showError(error.message);
			console.error('Drop handling error:', error);
		}
	}
	async processDroppedDirectory(rootEntry) {
		await this.fileFilter.loadGitignore(rootEntry);
		if (this.fileFilter.shouldExcludeFolder(rootEntry.fullPath)) {
			throw new Error('This directory is excluded by filter rules');
		}
		const rootDirectory = await this.scanDirectory(rootEntry);
		if (rootDirectory.fileCount === 0) {
			throw new Error('No valid files found in the directory');
		}
		this.showDirectorySelection(rootDirectory);
	}
	async scanDirectory(entry, isRoot = true) {
		const dirInfo = {
			entry,
			path: entry.fullPath,
			name: entry.name,
			files: [],
			subdirs: [],
			fileCount: 0,
			totalSize: 0,
			isRoot,
			level: isRoot ? 0 : (entry.fullPath.match(/\//g) || []).length, // Basic depth
		};

		// .gitignore rules should have been loaded from parent or root before this.
		// No need to call loadGitignore here unless each subdir can have its own .gitignore
		// that overrides parent (which is complex and not typical for this tool's scope).

		// Note: The `shouldExcludeFolder` and `shouldIgnore` checks for the current `entry`
		// should happen *before* `scanDirectory` is called for this `entry`,
		// typically in `processDroppedItems` for root items or in the loop within `scanDirectory` for subdirectories.
		// This means `scanDirectory` can assume `entry` itself is not excluded/ignored.

		try {
			const allEntriesInDir = await this.readAllDirectoryEntries(entry);
			const fileEntries = [];
			const directoryEntries = [];

			for (const currentSubEntry of allEntriesInDir) {
				if (currentSubEntry.isFile) {
					fileEntries.push(currentSubEntry);
				} else if (currentSubEntry.isDirectory) {
					// Perform exclusion checks *before* adding to directoryEntries for recursive scan
					const folderExcludeResult = this.fileFilter.shouldExcludeFolder(currentSubEntry);
					if (folderExcludeResult.excluded) {
						this.state.excludedItems.push(folderExcludeResult);
						continue; // Skip this subdirectory
					}
					const folderIgnoreResult = this.fileFilter.shouldIgnore(currentSubEntry);
					if (folderIgnoreResult.ignored) {
						this.state.excludedItems.push(folderIgnoreResult);
						continue; // Skip this subdirectory
					}
					directoryEntries.push(currentSubEntry);
				}
			}
			
			// Process files in the current directory
			const fileResults = await this.processFiles(fileEntries, dirInfo); // dirInfo is mutated by processFiles

			// Recursively process valid subdirectories
			const dirProcessingPromises = directoryEntries.map(subDirEntry => this.scanDirectory(subDirEntry, false));
			const subDirInfos = await Promise.all(dirProcessingPromises);

			subDirInfos.forEach(subDirResult => {
				if (subDirResult && (subDirResult.fileCount > 0 || subDirResult.subdirs.length > 0)) {
					dirInfo.subdirs.push(subDirResult);
					dirInfo.fileCount += subDirResult.fileCount;
					dirInfo.totalSize += subDirResult.totalSize;
				} else if (subDirResult && subDirResult.path && !this.state.excludedItems.some(item => item.path === subDirResult.path)) {
					// Potentially note empty, non-excluded directories if needed in the future
				}
			});
			
			// fileCount and totalSize for dirInfo's *own* files are already added by processFiles
			// We've added counts/sizes from subdirectories above.
			// So, dirInfo.fileCount and dirInfo.totalSize should be correct.

		} catch (error) {
			console.error(`Error scanning directory ${entry.name}:`, error);
			this.state.excludedItems.push({ name: entry.name, path: entry.fullPath, type: 'folder', reason: `Error scanning: ${error.message}` });
		}
		return dirInfo;
	}
	async getFileInfo(fileEntry) {
		return new Promise((resolve, reject) => {
			fileEntry.file(
				(file) => resolve(file),
				(error) => reject(new Error(`Error getting file info: ${error}`)),
			);
		});
	}
	async processFiles(fileEntries, dirInfo) {
		let fileCount = 0;
		let totalSize = 0;
		try {
			const filePromises = fileEntries.map(async (fileEntry) => {
				try {
		// This function directly mutates dirInfo.files, dirInfo.fileCount, dirInfo.totalSize
		// No need to return fileCount, totalSize separately if dirInfo is the source of truth.
		try {
			for (const fileEntry of fileEntries) { // Changed from map to for...of for easier async/await and continue
				try {
					const ignoreResult = this.fileFilter.shouldIgnore(fileEntry);
					if (ignoreResult.ignored) {
						this.state.excludedItems.push(ignoreResult);
						continue; // Skip this file
					}

					const file = await this.getFileInfo(fileEntry);
					// Ensure file object has fullPath for consistency, especially for isAllowedFile
					if (!file.fullPath) file.fullPath = fileEntry.fullPath; 

					const allowedResult = this.fileFilter.isAllowedFile(file);
					if (allowedResult.allowed) {
						dirInfo.files.push(file);
						dirInfo.fileCount++;     // Mutate dirInfo directly
						dirInfo.totalSize += file.size; // Mutate dirInfo directly
					} else {
						// Ensure path and name are part of the result for display
						allowedResult.path = file.fullPath || fileEntry.fullPath; // Use file.fullPath if available
						allowedResult.name = file.name;
						this.state.excludedItems.push(allowedResult);
					}
				} catch (error) {
					console.error(`Error processing file ${fileEntry.name}:`, error);
					this.state.excludedItems.push({ name: fileEntry.name, path: fileEntry.fullPath, type: 'file', reason: `Error processing: ${error.message}` });
				}
			}
		} catch (error) { // Should not be reached if individual errors are caught
			console.error('Outer error in processFiles:', error);
		}
		// No explicit return needed if dirInfo is mutated, but can return for clarity if preferred
		return { fileCount: dirInfo.fileCount, totalSize: dirInfo.totalSize };
	}

	// processDirectories is effectively merged into the recursive calls of scanDirectory's loop.
	// No longer need a separate processDirectories method.

	async readAllDirectoryEntries(dirEntry) {
		const entries = [];
		let readBatch = [];
		const reader = dirEntry.createReader();
		try {
			do {
				readBatch = await new Promise((resolve, reject) => {
					reader.readEntries(resolve, reject);
				});
				if (readBatch.length > 0) {
					this.state.scannedItemsCount += readBatch.length; // UX Improvement 3
					this.updateScanProgressDisplay(); // UX Improvement 3
					entries.push(...readBatch);
				}
			} while (readBatch.length > 0);
		} catch (error) {
			console.error(`Error reading directory ${dirEntry.name}:`, error);
			// Optionally add to excludedItems or show a specific error
		}
		return entries;
	}
	calculateTotalSize(files) {
		return files.reduce((total, file) => total + file.size, 0);
	}
	createEmptyStateMessage() {
		const noContent = document.createElement('div');
		noContent.className = 'no-content-message';
		noContent.innerHTML = `
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <path d="M12 11v6M12 11v6"></path>
          </svg>
          <span>No valid files or directories found</span>
      `;
		return noContent;
	}
	createRootItemInfo(rootItem) {
		const rootInfo = document.createElement('div');
		rootInfo.className = 'root-directory-info';
		const itemType = rootItem.entry.isDirectory ? 'Directory' : 'File';
		const iconPath = rootItem.entry.isDirectory
			? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/>'
			: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>';
		rootInfo.innerHTML = `
			 <div class="root-files-header">
				  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						${iconPath}
				  </svg>
				  Root ${itemType}: ${this.escapeHtml(rootItem.name)}
			 </div>
			 <div class="root-files-count">
				  ${rootItem.files.length} files (${utils.formatSize(
			this.calculateTotalSize(rootItem.files),
		)})
			 </div>
		`;
		return rootInfo;
	}
	showDirectorySelection(rootItems) {
		const dirList = this.elements.directoryList;
		dirList.innerHTML = '';
		this.state.selectedDirectories.clear();
		const fragment = document.createDocumentFragment();
		rootItems.forEach((rootItem) => {
			if (rootItem.files.length > 0) {
				fragment.appendChild(this.createRootItemInfo(rootItem));
			}
			const validDirs = rootItem.subdirs
				.filter((dir) => dir.fileCount > 0)
				.sort((a, b) => a.name.localeCompare(b.name));
			validDirs.forEach((dir) => {
				fragment.appendChild(this.createDirectoryItem(dir));
			});
		});
		if (fragment.children.length === 0) {
			fragment.appendChild(this.createEmptyStateMessage());
		}
		dirList.appendChild(fragment);
		this.updateSelectionCount(); // This will now also handle enabling/disabling combine button
		this.updateSelectAllButtonText();

		// Update excluded items button
		if (this.elements.toggleExcludedBtn) {
			const excludedCount = this.state.excludedItems.length;
			this.elements.toggleExcludedBtn.textContent = `${this.elements.excludedItemsList.style.display === 'none' ? 'Show' : 'Hide'} ${excludedCount} excluded items`;
			this.elements.toggleExcludedBtn.disabled = excludedCount === 0;
			if (excludedCount > 0 && this.elements.excludedItemsList.style.display === 'block') {
				this.renderExcludedItems(); // Re-render if visible
			} else if (excludedCount === 0) {
				this.elements.excludedItemsList.style.display = 'none'; // Ensure hidden if no items
				this.elements.excludedItemsList.innerHTML = '<h4>Excluded Items:</h4><p>No items were excluded.</p>';
			}
		}

		// For UX Improvement 2: Show warning for unsupported .gitignore patterns
		if (this.state.unsupportedGitignorePatterns && this.state.unsupportedGitignorePatterns.length > 0) {
			this.showWarning(`Warning: Some .gitignore patterns may not be fully supported (e.g., negation '!'). These patterns were ignored. Check console for details.`);
		}
		
		// UX Improvement 3: Update stats for scan completion
		this.showStats('scanComplete');
		const scanCompleteTextEl = this.elements.stats.querySelector('#scan-complete-text');
		if (scanCompleteTextEl) {
			const totalValidFiles = rootItems.reduce((sum, item) => sum + item.fileCount, 0);
			const totalSelectableGroups = rootItems.length + rootItems.reduce((sum, item) => sum + item.subdirs.length, 0); // Approximation
			scanCompleteTextEl.textContent = `Scan complete. Found ${totalValidFiles} files in ${totalSelectableGroups} groups. Review selections.`;
		}
		
		this.elements.directorySelection.style.display = 'block';
		this.setupDirectoryActionButtons(rootItems);
		// Store rootItems for use by getSelectedFilesForCombination
    this.processedRootItemsForSelection = rootItems; 
	}
	createRootDirectoryInfo(rootDirectory) {
		const rootInfo = document.createElement('div');
		rootInfo.className = 'root-directory-info';
		rootInfo.innerHTML = `
          <div class="root-files-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                  <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              Root Directory Files
          </div>
          <div class="root-files-count">
              ${rootDirectory.files.length} files (${utils.formatSize(
			this.calculateTotalSize(rootDirectory.files),
		)})
          </div>
      `;
		return rootInfo;
	}
	handleSelectAll() {
		const dirItems = this.container.querySelectorAll(
			'.directory-item:not(.empty-directory)',
		);
		const allSelected = Array.from(dirItems).every((item) =>
			this.state.selectedDirectories.has(item.dataset.path),
		);
		dirItems.forEach((item) => {
			const checkbox = item.querySelector('.directory-checkbox');
			if (checkbox && !checkbox.disabled) {
				checkbox.checked = !allSelected;
				if (!allSelected) {
					this.state.selectedDirectories.add(item.dataset.path);
					item.classList.add('selected');
				} else {
					this.state.selectedDirectories.delete(item.dataset.path);
					item.classList.remove('selected');
				}
			}
		});
		this.updateSelectionCount();
	}
	handleCancelSelection() {
		this.state.selectedDirectories.clear();
		this.elements.directorySelection.style.display = 'none';
		this.resetState();
	}
	updateSelectionCount() {
		const countElement = this.container.querySelector('.selection-count');
		if (countElement) {
			const count = this.state.selectedDirectories.size;
			countElement.textContent = `${count} selected`;
			countElement.className = `selection-count ${count > 0 ? 'has-selected' : ''}`;
		}

		// For UX Improvement 3: Enable/disable combine button
		if (this.elements.combineTextFilesBtn) {
			const textFilesSelected = this.getSelectedFilesForCombination().length > 0;
			this.elements.combineTextFilesBtn.disabled = !textFilesSelected;
			this.elements.combineTextFilesBtn.title = textFilesSelected 
				? "Combine selected text files into a single text block" 
				: "No text files selected (or selection is empty)";
		}
	}
	updateSelectAllButtonText() {
		const selectAllBtn = this.container.querySelector('.select-all-btn');
		if (!selectAllBtn) return;
		const dirItems = this.container.querySelectorAll(
			'.directory-item:not(.empty-directory)',
		);
		const allSelected = Array.from(dirItems).every((item) =>
			this.state.selectedDirectories.has(item.dataset.path),
		);
		selectAllBtn.innerHTML = `
			 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
				  <path d="M20 6L9 17l-5-5"/>
			 </svg>
			 ${allSelected ? 'Deselect All' : 'Select All'}
		`;
	}
	setupDirectoryActionButtons(rootItems) {
		const selectAllBtn = this.container.querySelector('.select-all-btn');
		const uploadSelectedBtn = this.container.querySelector(
			'.upload-selected-btn',
		);
		const cancelSelectionBtn = this.container.querySelector(
			'.cancel-selection-btn',
		);
		if (selectAllBtn) {
			selectAllBtn.innerHTML = `
				  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M20 6L9 17l-5-5"/>
				  </svg>
				  Deselect All
			 `;
			selectAllBtn.addEventListener('click', () => this.handleSelectAll());
		}
		if (uploadSelectedBtn) {
			uploadSelectedBtn.addEventListener('click', () =>
				this.handleUploadSelected(rootItems),
			);
		}
		if (cancelSelectionBtn) {
			cancelSelectionBtn.addEventListener('click', () =>
				this.handleCancelSelection(),
			);
		}
	}
	async processSelectedItems(rootItems) {
		this.state.files = [];
		rootItems.forEach((rootItem) => {
			if (rootItem.files.length > 0) {
				this.state.files.push(...rootItem.files);
			}
			rootItem.subdirs.forEach((dir) => {
				if (this.state.selectedDirectories.has(dir.path)) {
					this.collectAllFiles(dir);
				}
			});
		});
		if (this.state.files.length === 0) {
			this.showError('No files to upload');
			return;
		}
		this.state.totalFiles = this.state.files.length;
		this.state.isProcessing = true;
		this.showStats();
		try {
			await this.uploadFiles();
		} catch (error) {
			this.showError(`Upload failed: ${error.message}`);
			console.error('Upload error:', error);
		}
	}
	async handleUploadSelected(rootItems) {
		if (this.state.selectedDirectories.size === 0 && !rootItems.some(item => item.entry.isFile && item.files && item.files.length > 0)) {
			let hasSelectedSubfolders = false;
			if(rootItems.some(item => item.entry.isDirectory)){
				for(const rootItem of rootItems){
					if(rootItem.entry.isDirectory && rootItem.subdirs.some(subdir => this.state.selectedDirectories.has(subdir.path))){
						hasSelectedSubfolders = true;
						break;
					}
				}
			}
			if(!hasSelectedSubfolders && !rootItems.some(item => item.entry.isDirectory && item.files.length > 0 && this.state.selectedDirectories.size === 0 && rootItems.length === 1)){
				// This condition checks if a single root folder was dropped and has files directly in it, and no subfolders were selected.
				// This is a bit complex, ideally, selection logic would simplify this.
				// For now, if nothing is clearly selected, show warning.
				let isSingleRootDirectoryDropWithFiles = false;
				if (rootItems.length === 1 && rootItems[0].entry.isDirectory && rootItems[0].files.length > 0 && this.state.selectedDirectories.size === 0) {
					isSingleRootDirectoryDropWithFiles = true;
				}
				if (!isSingleRootDirectoryDropWithFiles) {
					this.showWarning('Please select at least one folder or ensure root folder(s) have files.');
					return;
				}
			}
		}

		const filesForUpload = [];
		// Logic to collect files based on rootItems and this.state.selectedDirectories
		// This needs to accurately reflect what processSelectedItems would have done.
		rootItems.forEach(rootItem => {
			if (rootItem.entry.isFile) { // Single file dropped at root
				if (rootItem.files && rootItem.files.length > 0) {
					filesForUpload.push(rootItem.files[0]);
				}
			} else if (rootItem.entry.isDirectory) { // Directory dropped at root
				// Include files from the root of this directory if:
				// 1. It's the only item dropped (implicitly selected)
				// 2. OR No specific subdirectories are selected (meaning select all from this root)
				// 3. OR It is explicitly in selectedDirectories (though root paths aren't usually added there)
				// This simplified logic: if a root dir is provided, its direct files are considered "selected"
				// unless sub-selection mode is active AND this specific root isn't in selectedDirectories (which is unlikely for roots).
				// A simpler model might be: if selectedDirectories is empty, all files from all rootItems are taken.
				// If selectedDirectories is NOT empty, only files from selectedDirectories are taken.
				
				// If no subdirectories are selected at all from anywhere, take all files from this root dir.
				// Also, if this root dir itself is in selectedDirectories (though not typical), take its files.
				if (this.state.selectedDirectories.size === 0 || this.state.selectedDirectories.has(rootItem.path)) {
					rootItem.files.forEach(file => filesForUpload.push(file));
				}
				// Recursively collect files from selected subdirectories
				rootItem.subdirs.forEach(subdir => {
					if (this.state.selectedDirectories.has(subdir.path)) {
						const tempFiles = [];
						this.collectFilesFromDirectory(subdir, tempFiles); // Collect files into tempFiles
						filesForUpload.push(...tempFiles);
					}
				});
			}
		});


		if (filesForUpload.length === 0) {
			this.showWarning('No files found in the selected directories for upload.');
			return;
		}

		let totalSize = 0;
		let largestFileSize = 0;
		filesForUpload.forEach(file => {
			totalSize += file.size;
			if (file.size > largestFileSize) {
				largestFileSize = file.size;
			}
		});

		const summary = {
			totalFiles: filesForUpload.length,
			totalSize: totalSize,
			largestFileSize: largestFileSize,
		};

		this._tempDataForUpload = { rootItems, files: filesForUpload };
		this.showPreUploadWarningModal(summary);
	}

	// Helper to recursively collect files from a directory structure (used by handleUploadSelected)
	collectFilesFromDirectory(directory, targetArray) {
		directory.files.forEach(file => targetArray.push(file));
		directory.subdirs.forEach(subdir => {
			// Important: Check if this subdir is actually selected if we are in a mode
			// where selectedDirectories drives inclusion.
			// For now, assuming if parent is included, children are too unless filtered by other means.
			// This might need to align with how collectAllFiles works if selectedDirectories is key.
			if (this.state.selectedDirectories.has(subdir.path)) { // Ensure subdir is selected
				this.collectFilesFromDirectory(subdir, targetArray);
			}
		});
	}

	showMessage(type, message, duration = 5000) {
		const existingMessage = this.container.querySelector(`.${type}-message`);
		existingMessage?.remove();
		const messageElement = document.createElement('div');
		messageElement.className = `${type}-message`;
		messageElement.innerHTML = `
          <svg class="message-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              ${this.getMessageIcon(type)}
          </svg>
          ${message}
      `;
		this.elements.dropZone.appendChild(messageElement);
		setTimeout(() => messageElement.remove(), duration);
	}
	showError(message) {
		this.showMessage('error', message);
	}
	showSuccess(message) {
		this.showMessage('success', message, 3000);
	}
	showWarning(message) {
		this.showMessage('warning', message);
	}
	async processSelectedDirectories(rootDirectory) {
		this.state.files = [];
		if (rootDirectory.files.length > 0) {
			this.state.files.push(...rootDirectory.files);
		}
		rootDirectory.subdirs.forEach((dir) => {
			if (this.state.selectedDirectories.has(dir.path)) {
				this.collectAllFiles(dir);
			}
		});
		if (this.state.files.length === 0) {
			this.showError('No files to upload');
			return;
		}
		this.state.totalFiles = this.state.files.length;
		this.state.isProcessing = true;
		this.showStats();
		try {
			await this.uploadFiles();
		} catch (error) {
			this.showError(`Upload failed: ${error.message}`);
			console.error('Upload error:', error);
		}
	}
	async uploadFiles() {
		if (this.state.files.length === 0) return;
		try {
			this.clearDragState();
			const claudeDropZone = await this.findUploadZone();
			if (!claudeDropZone) {
				throw new Error('Could not find upload zone');
			}
			const dataTransfer = this.prepareDataTransfer();
			await this.simulateDragAndDrop(claudeDropZone, dataTransfer);
			this.state.uploadedFiles = this.state.files.length;
			this.state.processedFiles = this.state.files.length;
			this.updateStats();
			await this.waitForUploadCompletion();
			this.showSuccess(
				`Successfully uploaded ${this.state.uploadedFiles} files`,
			);
		} finally {
			this.state.isProcessing = false;
		}
	}
	prepareDataTransfer() {
		const dataTransfer = new DataTransfer();
		this.state.files.forEach((file) => dataTransfer.items.add(file));
		return dataTransfer;
	}
	async simulateDragAndDrop(dropZone, dataTransfer) {
		const events = {
			dragenter: new DragEvent('dragenter', {
				bubbles: true,
				cancelable: true,
				dataTransfer,
			}),
			dragover: new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				dataTransfer,
			}),
			drop: new DragEvent('drop', {
				bubbles: true,
				cancelable: true,
				dataTransfer,
			}),
		};
		document.body.dispatchEvent(events.dragenter);
		document.body.dispatchEvent(events.dragover);
		await this.wait(500);
		if (!document.body.contains(dropZone)) {
			throw new Error('Upload zone disappeared');
		}
		dropZone.dispatchEvent(events.dragover);
		await this.wait(200);
		dropZone.dispatchEvent(events.drop);
	}
	async findUploadZone() {
		const maxAttempts = 5;
		for (let attempts = 0; attempts < maxAttempts; attempts++) {
			let uploadZone = this.findUploadZoneImmediate();
			if (!uploadZone) {
				await this.activateUploadZone();
				uploadZone = this.findUploadZoneImmediate();
			}
			if (uploadZone) {
				const text = uploadZone.textContent.toLowerCase();
				if (
					text.includes('drop files') ||
					text.includes('add to project knowledge')
				) {
					return uploadZone;
				}
			}
			await this.wait(1000);
		}
		throw new Error('Upload zone not found after multiple attempts');
	}
	async waitForUploadCompletion() {
		const maxWaitTime = CONFIG.UPLOAD_TIMEOUT;
		const startTime = Date.now();
		while (Date.now() - startTime < maxWaitTime) {
			const uploadZone = this.findUploadZoneImmediate();
			if (!uploadZone) return;
			await this.wait(1000);
		}
	}
	async loadState() { // This loads general UI state like minimized status
		try {
			const result = await chrome.storage.local.get(['isMinimized']);
			if (chrome.runtime.lastError) {
				console.error('Error loading general state:', chrome.runtime.lastError);
				return;
			}
			if (result.isMinimized === false) { // Explicitly check for false, as undefined should default to minimized (true)
				this.maximize();
			} else {
				this.minimize(); // Ensure consistent state if isMinimized is undefined or true
			}
		} catch (error) { // Catch errors from async/await pattern
			console.error('Error in loadState:', error);
		}
	}

	async saveState() { // This saves general UI state
		try {
			await chrome.storage.local.set({
				isMinimized: this.state.isMinimized,
				// Note: includeHidden and customAllowedExtensions are saved in their respective handlers
			});
		} catch (error) {
			console.error('Error saving general state:', error);
		}
	}

	toggleMinimize() {
		this.state.isMinimized ? this.maximize() : this.minimize();
	}
	updateMinimizedState() {
		const minimizeIcon = document.createElement('div');
		minimizeIcon.className = 'minimize-icon';
		minimizeIcon.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/>
          </svg>
      `;
		const existingIcon =
			this.elements.dropZone.querySelector('.minimize-icon');
		if (!existingIcon) {
			this.elements.dropZone.appendChild(minimizeIcon);
		}
	}
	removeMinimizedState() {
		const minimizeIcon =
			this.elements.dropZone.querySelector('.minimize-icon');
		if (minimizeIcon) {
			minimizeIcon.remove();
		}
	}
	minimize() {
		this.state.isMinimized = true;
		this.elements.dropZone.classList.add('minimized');
		this.elements.dropZoneContent.style.display = 'none';
		this.updateMinimizedState();
		this.saveState();
	}
	maximize() {
		this.state.isMinimized = false;
		this.elements.dropZone.classList.remove('minimized');
		this.elements.dropZoneContent.style.display = 'block';
		this.removeMinimizedState();
		this.saveState();
	}
	clearDragState() {
		const clearEvent = new DragEvent('dragleave', {
			bubbles: true,
			cancelable: true,
			dataTransfer: new DataTransfer(),
		});
		document.body.dispatchEvent(clearEvent);
	}
	collectAllFiles(directory) {
		this.state.files.push(...directory.files);
		directory.subdirs.forEach((subdir) => this.collectAllFiles(subdir));
	}
	findUploadZoneImmediate() {
		return document.querySelector(
			'div.absolute.inset-0.z-10.flex.flex-col.justify-center.rounded-lg.border.border-dashed',
		);
	}
	resetState() {
		Object.assign(this.state, {
			files: [],
			totalFiles: 0,
			processedFiles: 0,
			uploadedFiles: 0,
			invalidFiles: [], // Potentially phase out in favor of excludedItems
			ignoredFiles: [], // Potentially phase out in favor of excludedItems
			// invalidFiles and ignoredFiles are deprecated.
			excludedItems: [], // Clear excluded items for the new drop
			unsupportedGitignorePatterns: [], // For UX Improvement 2
			scannedItemsCount: 0, // For UX Improvement 3
		});
		this.updateStats(); // This will reset to default "Processing: 0/0" view if not overridden
		// Also clear any displayed excluded items from the UI
		if (this.elements.excludedItemsList) {
			this.elements.excludedItemsList.innerHTML = '';
			this.elements.excludedItemsList.style.display = 'none';
		}
		if (this.elements.toggleExcludedBtn) {
			this.elements.toggleExcludedBtn.textContent = 'Show 0 excluded items';
			this.elements.toggleExcludedBtn.disabled = true;
		}
	}
}
if (document.readyState === 'loading') {
	document.addEventListener(
		'DOMContentLoaded',
		() => new ClaudeFolderUploader(),
	);
} else {
	new ClaudeFolderUploader();
}
