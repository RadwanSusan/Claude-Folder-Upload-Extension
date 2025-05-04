// content.js
const CONFIG = {
	MAX_FILE_SIZE: 100 * 1024 * 1024 * 1024,
	UPLOAD_TIMEOUT: 30000,
	DEBOUNCE_DELAY: 300,
	ANIMATION_DURATION: 300,
	DOM_CHECK_INTERVAL: 1000,
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
};
class FileFilter {
	static ALLOWED_EXTENSIONS = new Set([
		// Documentation and Text
		'pdf',
		'doc',
		'docx',
		'txt',
		'rtf',
		'odt',
		'md',
		'markdown',
		'tex',
		'latex',
		'wiki',
		'rst',
		'adoc',
		'log',
		'msg',
		'pages',
		'epub',
		'mobi',
		'azw3',
		'djvu',
		// Web Development
		'html',
		'htm',
		'xhtml',
		'css',
		'scss',
		'sass',
		'less',
		'styl',
		'js',
		'jsx',
		'ts',
		'tsx',
		'vue',
		'svelte',
		'php',
		'asp',
		'aspx',
		'jsp',
		'cshtml',
		'wasm',
		'wat',
		'webmanifest',
		'htaccess',
		'htpasswd',
		'ejs',
		'hbs',
		'handlebars',
		'pug',
		'jade',
		'haml',
		'liquid',
		// Programming Languages
		'py',
		'pyc',
		'pyo',
		'pyd',
		'pyw',
		'ipynb',
		'java',
		'class',
		'jar',
		'war',
		'cpp',
		'cc',
		'cxx',
		'c',
		'h',
		'hpp',
		'hxx',
		'cs',
		'csx',
		'vb',
		'fs',
		'fsx',
		'rb',
		'rbw',
		'rake',
		'gemspec',
		'swift',
		'swiftmodule',
		'kt',
		'kts',
		'go',
		'mod',
		'rs',
		'rlib',
		'scala',
		'sc',
		'clj',
		'cljs',
		'cljc',
		'edn',
		'erl',
		'hrl',
		'ex',
		'exs',
		'hs',
		'lhs',
		'lua',
		'luac',
		'pl',
		'pm',
		'pod',
		't',
		'r',
		'rdata',
		'rds',
		'rmd',
		'matlab',
		'm',
		'fig',
		'mat',
		'f',
		'f90',
		'f95',
		'f03',
		'f08',
		'pas',
		'pp',
		'groovy',
		'gvy',
		'gy',
		'gsh',
		'd',
		'jl',
		'dart',
		'elm',
		'coffee',
		'litcoffee',
		'ls',
		'livescript',
		'nim',
		'ml',
		'mli',
		'mll',
		'mly',
		// Shell and Scripts
		'sh',
		'bash',
		'zsh',
		'fish',
		'csh',
		'ksh',
		'bat',
		'cmd',
		'ps1',
		'psm1',
		'psd1',
		'awk',
		'sed',
		'tcl',
		'expect',
		// Database and Query Languages
		'sql',
		'mysql',
		'pgsql',
		'plsql',
		'sqlite',
		'mongodb',
		'cypher',
		'sparql',
		'hql',
		'prisma',
		// Data Formats
		'xml',
		'json',
		'yaml',
		'yml',
		'toml',
		'csv',
		'tsv',
		'ods',
		'xls',
		'xlsx',
		'numbers',
		'proto',
		'avro',
		'parquet',
		'thrift',
		'graphql',
		'gql',
		// Configuration Files
		'ini',
		'conf',
		'config',
		'cfg',
		'properties',
		'env',
		'dist',
		'local',
		'docker',
		'dockerfile',
		'dockerignore',
		'vagrantfile',
		'buildpack',
		'gitignore',
		'gitattributes',
		'editorconfig',
		'eslintrc',
		'prettierrc',
		'stylelintrc',
		'babelrc',
		'npmrc',
		'yarnrc',
		'nvmrc',
		'gradle',
		'pom',
		'ivy',
		'ant',
		'cmake',
		'make',
		'mak',
		'makefile',
		'kubernetes',
		'helm',
		'terraform',
		'tf',
		'vcxproj',
		'csproj',
		'sln',
		'pbxproj',
		// IDEs and Editors
		'vim',
		'vimrc',
		'gvimrc',
		'ideavimrc',
		'vscode',
		'sublime-project',
		'sublime-workspace',
		'workspace',
		'project',
		'code-workspace',
		// Template Files
		'tpl',
		'tmpl',
		'template',
		'mustache',
		'nunjucks',
		'njk',
		'jinja',
		'j2',
		'erb',
		'eex',
		'leex',
		'swig',
		// Build Output
		'map',
		'min',
		'bundle',
		'pack',
		'dist',
		'out',
		'build',
		'release',
		// Security and Certificates
		'pem',
		'crt',
		'ca-bundle',
		'p12',
		'pfx',
		'key',
		'keystore',
		'csr',
		'cert',
		// Game Development
		'unity',
		'unitypackage',
		'prefab',
		'asset',
		'blend',
		'blend1',
		'fbx',
		'obj',
		'mtl',
		'gltf',
		'glb',
		'uasset',
		'umap',
		// Machine Learning
		'onnx',
		'pkl',
		'joblib',
		'h5',
		'hdf5',
		'pb',
		'pbtxt',
		'ckpt',
		'model',
		// Cloud and Serverless
		'aws',
		'azure',
		'gcp',
		'cloudformation',
		'sam',
		'serverless',
		'netlify',
		'vercel',
	]);
	static DOT_FOLDERS = new Set([
		'.next',
		'.git',
		'.github',
		'.vscode',
		'.idea',
		'.DS_Store',
		'.vs',
		'.cache',
		'.npm',
		'.yarn',
		'__pycache__',
	]);
	constructor() {
		this.gitignorePatterns = [];
		this.baseDirectory = '';
		this.compiledPatterns = new Map();
	}
	isAllowedFile(file) {
		const extension = file.name.split('.').pop()?.toLowerCase();
		return extension && FileFilter.ALLOWED_EXTENSIONS.has(extension);
	}
	shouldExcludeFolder(path) {
		const parts = path.split('/').filter(Boolean);
		const shouldExclude = parts.some((part) => {
			const isDotFolder = part.startsWith('.');
			const isExcludedFolder = FileFilter.DOT_FOLDERS.has(part);
			return isDotFolder || isExcludedFolder;
		});
		return shouldExclude;
	}
	async loadGitignore(entry) {
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
					console.warn(`Invalid gitignore pattern: ${pattern}`, error);
					return null;
				}
			})
			.filter((pattern) => pattern !== null);
	}
	shouldIgnore(filePath) {
		if (this.shouldExcludeFolder(filePath)) {
			return true;
		}
		const relativePath = filePath
			.replace(this.baseDirectory, '')
			.replace(/^\/+/, '');
		const isIgnored = this.gitignorePatterns.some((pattern) => {
			try {
				const matches = pattern.test(relativePath);
				return matches;
			} catch (error) {
				console.warn(
					`Error testing pattern against path: ${relativePath}`,
					error,
				);
				return false;
			}
		});
		return isIgnored;
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
			invalidFiles: [],
			ignoredFiles: [],
		};
		this.fileFilter = new FileFilter();
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
			await this.initializeDOM();
			this.elements.dropZoneContent.style.display = 'none';
			this.elements.dropZone.classList.add('minimized');
			this.updateMinimizedState();
			await this.loadState();
			this.setupObservers();
			this.setupEventListeners();
		} catch (error) {
			console.error('Initialization error:', error);
		}
	}
	createDOM() {
		const container = document.createElement('div');
		container.className = 'folder-uploader';
		container.innerHTML = `
			 <div class="folder-drop-zone minimized">
				  <div class="drop-zone-header">
						<span>Folder Uploader</span>
						<button class="minimize-btn" title="Minimize">
							 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
								  <path d="M20 12H4"/>
							 </svg>
						</button>
				  </div>
            <div class="drop-zone-content" style="display: none;">
                  <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/>
                      <path d="M12 11v6M9 14l3-3 3 3"/>
                  </svg>
                  <div class="drop-text">Drop folder here</div>
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
                          Processing: <span class="processed-count">0</span>/<span class="total-count">0</span>
                          <div class="progress-bar">
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
		if (statsHeader) {
			statsHeader.innerHTML = `
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Processing Files
          `;
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
		this.setupHoverHandlers();
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
		const processedItems = [];
		for (const rootEntry of rootEntries) {
			if (rootEntry.entry.isDirectory) {
				await this.fileFilter.loadGitignore(rootEntry.entry);
				if (
					!this.fileFilter.shouldExcludeFolder(rootEntry.entry.fullPath)
				) {
					const dirInfo = await this.scanDirectory(rootEntry.entry, true);
					if (dirInfo.fileCount > 0) {
						processedItems.push(dirInfo);
					}
				}
			} else if (rootEntry.entry.isFile) {
				const file = await this.getFileInfo(rootEntry.entry);
				if (this.fileFilter.isAllowedFile(file)) {
					processedItems.push({
						entry: rootEntry.entry,
						path: rootEntry.entry.fullPath,
						name: rootEntry.entry.name,
						files: [file],
						subdirs: [],
						fileCount: 1,
						totalSize: file.size,
						isRoot: true,
						level: 0,
					});
				} else {
					this.state.invalidFiles.push(file.name);
				}
			}
		}
		if (processedItems.length === 0) {
			throw new Error('No valid files found in the dropped items');
		}
		this.showDirectorySelection(processedItems);
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
			level: isRoot ? 0 : 1,
		};
		try {
			if (!isRoot) {
				if (this.fileFilter.shouldExcludeFolder(entry.fullPath)) {
					return dirInfo;
				}
				if (this.fileFilter.shouldIgnore(entry.fullPath)) {
					return dirInfo;
				}
			}
			const entries = await this.readAllDirectoryEntries(entry);
			const directories = entries.filter((e) => e.isDirectory);
			const validDirectories = directories.filter((dir) => {
				const shouldExclude = this.fileFilter.shouldExcludeFolder(
					dir.fullPath,
				);
				const shouldIgnore = this.fileFilter.shouldIgnore(dir.fullPath);
				if (shouldExclude || shouldIgnore) {
					return false;
				}
				return true;
			});
			const [fileResults, dirResults] = await Promise.all([
				this.processFiles(
					entries.filter((e) => e.isFile),
					dirInfo,
				),
				this.processDirectories(validDirectories, dirInfo),
			]);
			dirInfo.fileCount = fileResults.fileCount + dirResults.fileCount;
			dirInfo.totalSize = fileResults.totalSize + dirResults.totalSize;
		} catch (error) {
			console.error(`Error scanning directory ${entry.name}:`, error);
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
					if (this.fileFilter.shouldIgnore(fileEntry.fullPath)) {
						this.state.ignoredFiles.push(fileEntry.name);
						return;
					}
					const file = await this.getFileInfo(fileEntry);
					if (this.fileFilter.isAllowedFile(file)) {
						dirInfo.files.push(file);
						fileCount++;
						totalSize += file.size;
					} else {
						this.state.invalidFiles.push(file.name);
					}
				} catch (error) {
					console.error(`Error processing file ${fileEntry.name}:`, error);
				}
			});
			await Promise.all(filePromises);
		} catch (error) {
			console.error('Error processing files:', error);
		}
		return { fileCount, totalSize };
	}
	async processDirectories(dirEntries, dirInfo) {
		let fileCount = 0;
		let totalSize = 0;
		try {
			const dirPromises = dirEntries.map(async (dirEntry) => {
				const subdirInfo = await this.scanDirectory(dirEntry, false);
				if (subdirInfo.fileCount > 0 || subdirInfo.subdirs.length > 0) {
					dirInfo.subdirs.push(subdirInfo);
					fileCount += subdirInfo.fileCount;
					totalSize += subdirInfo.totalSize;
				}
			});
			await Promise.all(dirPromises);
		} catch (error) {
			console.error('Error processing directories:', error);
		}
		return { fileCount, totalSize };
	}
	async readAllDirectoryEntries(dirEntry) {
		const entries = [];
		let readBatch = [];
		const reader = dirEntry.createReader();
		try {
			do {
				readBatch = await new Promise((resolve, reject) => {
					reader.readEntries(resolve, reject);
				});
				entries.push(...readBatch);
			} while (readBatch.length > 0);
		} catch (error) {
			console.error(`Error reading directory ${dirEntry.name}:`, error);
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
		this.updateSelectionCount();
		this.updateSelectAllButtonText();
		this.elements.directorySelection.style.display = 'block';
		this.setupDirectoryActionButtons(rootItems);
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
			countElement.className = `selection-count ${
				count > 0 ? 'has-selected' : ''
			}`;
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
		if (
			this.state.selectedDirectories.size === 0 &&
			!rootItems.some((item) => item.files.length > 0)
		) {
			this.showWarning('Please select at least one item to upload');
			return;
		}
		this.elements.directorySelection.style.display = 'none';
		await this.processSelectedItems(rootItems);
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
	async loadState() {
		try {
			const { isMinimized } = await chrome.storage.local.get('isMinimized');
			if (isMinimized === false) {
				this.maximize();
			}
		} catch (error) {
			console.error('Error loading state:', error);
		}
	}
	async saveState() {
		try {
			await chrome.storage.local.set({
				isMinimized: this.state.isMinimized,
			});
		} catch (error) {
			console.error('Error saving state:', error);
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
			invalidFiles: [],
			ignoredFiles: [],
		});
		this.updateStats();
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
