class ClaudeFolderUploader {
	constructor() {
		if (!window.location.href.match(/claude\.ai\/project\/[a-zA-Z0-9-]+$/)) {
			throw new Error(
				'This extension only works on Claude.ai project pages',
			);
		}
		this.files = [];
		this.totalFiles = 0;
		this.processedFiles = 0;
		this.uploadedFiles = 0;
		this.isMinimized = false;
		this.isProcessing = false;
		this.maxFileSize = 100 * 1024 * 1024;
		this.uploadZoneObserver = null;
		this.initializeUploader();
		this.loadState();
		this.setupMutationObserver();
		this.setupUploadZoneObserver();
	}
	createDOM() {
		const container = document.createElement('div');
		container.className = 'folder-uploader';
		container.innerHTML = `
          <div class="folder-drop-zone">
              <div class="drop-zone-header">
                  <span>Folder Uploader</span>
                  <button class="minimize-btn" title="Minimize">─</button>
              </div>
              <div class="drop-zone-content">
                  <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.89l-.82-1.22A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z"/>
                      <path d="M12 11v6M9 14l3-3 3 3"/>
                  </svg>
                  <div class="drop-text">Drop folder here</div>
                  <div class="upload-info">
                      Drag and drop a folder to upload all files
                      <div style="font-size: 11px; margin-top: 4px;">Supports files up to 100MB</div>
                  </div>
                  <div class="file-stats" style="display: none;">
                      <div>Processing: <span class="processed-count">0</span>/<span class="total-count">0</span></div>
                      <div class="progress-bar">
                          <div class="progress-bar-fill" style="width: 0%"></div>
                      </div>
                  </div>
              </div>
          </div>
      `;
		return container;
	}
	setupMutationObserver() {
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === 'childList' &&
					mutation.addedNodes.length > 0
				) {
					if (!document.querySelector('.folder-uploader')) {
						this.initializeUploader();
					}
				}
			}
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}
	initializeUploader() {
		if (document.querySelector('.folder-uploader')) {
			return;
		}
		this.container = this.createDOM();
		document.body.appendChild(this.container);
		this.dropZone = this.container.querySelector('.folder-drop-zone');
		this.statsEl = this.container.querySelector('.file-stats');
		this.processedEl = this.container.querySelector('.processed-count');
		this.totalEl = this.container.querySelector('.total-count');
		this.progressBar = this.container.querySelector('.progress-bar-fill');
		this.setupEventListeners();
	}
	setupEventListeners() {
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
			this.dropZone.addEventListener(eventName, (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
		});
		this.dropZone.addEventListener(
			'dragover',
			this.handleDragOver.bind(this),
		);
		this.dropZone.addEventListener(
			'dragleave',
			this.handleDragLeave.bind(this),
		);
		this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
		const minimizeBtn = this.container.querySelector('.minimize-btn');
		minimizeBtn.addEventListener('click', this.toggleMinimize.bind(this));
		this.dropZone.addEventListener('mouseenter', () => {
			if (this.isMinimized) {
				this.showTooltip('Click to expand');
			}
		});
		this.dropZone.addEventListener('click', () => {
			if (this.isMinimized) {
				this.maximize();
			}
		});
	}
	setupUploadZoneObserver() {
		this.uploadZoneObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'childList') {
					const uploadZone = this.findUploadZoneImmediate();
					if (uploadZone) {
						console.log('Upload zone detected via observer');
						this.lastKnownUploadZone = uploadZone;
					}
				}
			}
		});
		this.uploadZoneObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}
	findUploadZoneImmediate() {
		return document.querySelector(
			'div.absolute.inset-0.z-10.flex.flex-col.justify-center.rounded-lg.border.border-dashed',
		);
	}
	async activateUploadZone() {
		const dummyFile = new File([''], 'dummy.txt', { type: 'text/plain' });
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(dummyFile);
		const dragEnterEvent = new DragEvent('dragenter', {
			bubbles: true,
			cancelable: true,
			dataTransfer: dataTransfer,
		});
		document.body.dispatchEvent(dragEnterEvent);
		const dragOverEvent = new DragEvent('dragover', {
			bubbles: true,
			cancelable: true,
			dataTransfer: dataTransfer,
		});
		document.body.dispatchEvent(dragOverEvent);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	async loadState() {
		try {
			const { isMinimized } = await chrome.storage.local.get('isMinimized');
			if (isMinimized) {
				this.minimize();
			}
		} catch (error) {
			console.error('Error loading state:', error);
		}
	}
	async saveState() {
		try {
			await chrome.storage.local.set({ isMinimized: this.isMinimized });
		} catch (error) {
			console.error('Error saving state:', error);
		}
	}
	handleDragOver(e) {
		if (this.isMinimized || this.isProcessing) return;
		this.dropZone.classList.add('dragover');
	}
	handleDragLeave() {
		this.dropZone.classList.remove('dragover');
	}
	async handleDrop(e) {
		if (this.isProcessing) {
			this.showError('Already processing files. Please wait.');
			return;
		}
		this.dropZone.classList.remove('dragover');
		this.resetState();
		this.isProcessing = true;
		this.showStats();
		try {
			const items = Array.from(e.dataTransfer.items);
			const entries = items
				.filter((item) => item.kind === 'file')
				.map((item) => item.webkitGetAsEntry());
			if (entries.length === 0) {
				throw new Error('No valid items found in drop');
			}
			await this.processEntries(entries);
			await this.uploadFiles();
			this.showSuccess(`Successfully uploaded ${this.uploadedFiles} files`);
		} catch (error) {
			this.showError(error.message);
			console.error('Upload error:', error);
		} finally {
			this.isProcessing = false;
			setTimeout(() => this.hideStats(), 3000);
		}
	}
	async processEntries(entries) {
		for (const entry of entries) {
			if (entry.isFile) {
				await this.processFile(entry);
			} else if (entry.isDirectory) {
				await this.processDirectory(entry);
			}
		}
	}
	async processFile(entry) {
		return new Promise((resolve) => {
			entry.file((file) => {
				if (this.isValidFile(file)) {
					this.files.push(file);
					this.totalFiles++;
					this.updateStats();
				}
				resolve();
			});
		});
	}
	async processDirectory(entry) {
		const reader = entry.createReader();
		const entries = await new Promise((resolve) => {
			reader.readEntries(resolve);
		});
		await this.processEntries(entries);
	}
	isValidFile(file) {
		if (file.size > this.maxFileSize) {
			this.showError(`File ${file.name} exceeds 100MB size limit`);
			return false;
		}
		if (file.name.length > 255) {
			this.showError(`Filename ${file.name} is too long`);
			return false;
		}
		return true;
	}
	async uploadFiles() {
		if (this.files.length === 0) return;
		try {
			console.log(`Processing ${this.files.length} files in single batch`);
			const clearEvent = new DragEvent('dragleave', {
				bubbles: true,
				cancelable: true,
				dataTransfer: new DataTransfer(),
			});
			document.body.dispatchEvent(clearEvent);
			const claudeDropZone = await this.findUploadZone();
			if (!claudeDropZone) {
				throw new Error('Could not find upload zone');
			}
			const dataTransfer = new DataTransfer();
			this.files.forEach((file) => {
				dataTransfer.items.add(file);
			});
			console.log('Simulating drag over body for all files');
			const dragEnterEvent = new DragEvent('dragenter', {
				bubbles: true,
				cancelable: true,
				dataTransfer: dataTransfer,
			});
			document.body.dispatchEvent(dragEnterEvent);
			const dragOverEvent = new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				dataTransfer: dataTransfer,
			});
			document.body.dispatchEvent(dragOverEvent);
			await new Promise((resolve) => setTimeout(resolve, 500));
			if (!document.body.contains(claudeDropZone)) {
				throw new Error('Upload zone disappeared');
			}
			console.log('Simulating drop for all files');
			claudeDropZone.dispatchEvent(
				new DragEvent('dragover', {
					bubbles: true,
					cancelable: true,
					dataTransfer: dataTransfer,
				}),
			);
			await new Promise((resolve) => setTimeout(resolve, 200));
			claudeDropZone.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					cancelable: true,
					dataTransfer: dataTransfer,
				}),
			);
			this.uploadedFiles = this.files.length;
			this.processedFiles = this.files.length;
			this.updateStats();
			this.showSuccess(`Uploaded ${this.files.length} files`);
			await this.waitForProcessing();
		} catch (error) {
			console.error('Error uploading files:', error);
			this.showError('Failed to upload files');
		}
		console.log('Upload process completed');
	}
	async waitForProcessing() {
		return new Promise(async (resolve) => {
			let attempts = 0;
			const maxAttempts = 10;
			const check = async () => {
				if (attempts >= maxAttempts) {
					resolve();
					return;
				}
				attempts++;
				await new Promise((r) => setTimeout(r, 1000));
				const uploadZone = this.findUploadZoneImmediate();
				if (uploadZone) {
					await new Promise((r) => setTimeout(r, 1000));
					resolve();
				} else {
					check();
				}
			};
			check();
		});
	}
	async findUploadZone() {
		let attempts = 0;
		const maxAttempts = 5;
		while (attempts < maxAttempts) {
			let uploadZone = this.findUploadZoneImmediate();
			if (!uploadZone) {
				console.log('Activating upload zone...');
				await this.activateUploadZone();
				uploadZone = this.findUploadZoneImmediate();
			}
			if (uploadZone) {
				const text = uploadZone.textContent.toLowerCase();
				if (
					text.includes('drop files') ||
					text.includes('add to project knowledge')
				) {
					console.log('Found correct upload zone:', uploadZone);
					return uploadZone;
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
			attempts++;
		}
		throw new Error('Upload zone not found');
	}
	async waitForFileProcessing() {
		return new Promise(async (resolve) => {
			let attempts = 0;
			const maxAttempts = 20;
			const checkProcessing = async () => {
				const uploadZone = document.querySelector(
					'div.absolute.inset-0.z-10.flex.flex-col.justify-center.rounded-lg.border.border-dashed.transition-colors.bg-bg-100.border-border-200.text-text-300',
				);
				if (
					uploadZone &&
					uploadZone.textContent.toLowerCase().includes('drop files')
				) {
					await new Promise((r) => setTimeout(r, 2000));
					resolve();
				} else if (attempts < maxAttempts) {
					attempts++;
					setTimeout(checkProcessing, 500);
				} else {
					const dragLeaveEvent = new DragEvent('dragleave', {
						bubbles: true,
						cancelable: true,
						dataTransfer: new DataTransfer(),
					});
					document.body.dispatchEvent(dragLeaveEvent);
					await new Promise((r) => setTimeout(r, 1000));
					resolve();
				}
			};
			setTimeout(checkProcessing, 1000);
		});
	}
	findClosestDropZone(element) {
		let current = element;
		while (current && current !== document.body) {
			const style = window.getComputedStyle(current);
			if (
				style.border.includes('dashed') ||
				current.classList.contains('border-dashed') ||
				style.position === 'absolute'
			) {
				return current;
			}
			current = current.parentElement;
		}
		return null;
	}
	showError(message) {
		console.error(message);
		const existingError = this.dropZone.querySelector('.error-message');
		if (existingError) existingError.remove();
		const error = document.createElement('div');
		error.className = 'error-message';
		error.textContent = message;
		this.dropZone.appendChild(error);
		setTimeout(() => error.remove(), 5000);
	}
	showSuccess(message) {
		console.log(message);
		const existingSuccess = this.dropZone.querySelector('.success-message');
		if (existingSuccess) existingSuccess.remove();
		const success = document.createElement('div');
		success.className = 'success-message';
		success.textContent = message;
		this.dropZone.appendChild(success);
		setTimeout(() => success.remove(), 3000);
	}
	async waitForUploadZone() {
		return new Promise((resolve) => {
			const checkZone = () => {
				const uploadZone = document.querySelector(
					[
						'.absolute.inset-0.z-10.flex.flex-col.justify-center.rounded-lg.border.border-dashed',
						'.bg-bg-500\\/10.text-text-400',
					].join(','),
				);
				if (uploadZone) {
					resolve();
				} else {
					setTimeout(checkZone, 100);
				}
			};
			checkZone();
		});
	}
	async simulateDragOverBody(body, file) {
		return new Promise((resolve) => {
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			const dragEnterEvent = new DragEvent('dragenter', {
				bubbles: true,
				cancelable: true,
				dataTransfer: dataTransfer,
			});
			body.dispatchEvent(dragEnterEvent);
			const dragOverEvent = new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				dataTransfer: dataTransfer,
			});
			body.dispatchEvent(dragOverEvent);
			setTimeout(resolve, 500);
		});
	}
	async uploadFile(file, target) {
		return new Promise((resolve, reject) => {
			try {
				const dataTransfer = new DataTransfer();
				dataTransfer.items.add(file);
				const dragOverEvent = new DragEvent('dragover', {
					bubbles: true,
					cancelable: true,
					dataTransfer: dataTransfer,
				});
				target.dispatchEvent(dragOverEvent);
				setTimeout(() => {
					try {
						const dropEvent = new DragEvent('drop', {
							bubbles: true,
							cancelable: true,
							dataTransfer: dataTransfer,
						});
						target.dispatchEvent(dropEvent);
						const dragLeaveEvent = new DragEvent('dragleave', {
							bubbles: true,
							cancelable: true,
							dataTransfer: new DataTransfer(),
						});
						document.body.dispatchEvent(dragLeaveEvent);
						setTimeout(resolve, 2000);
					} catch (dropError) {
						reject(dropError);
					}
				}, 500);
			} catch (error) {
				reject(error);
			}
		});
	}
	updateStats() {
		this.processedEl.textContent = this.processedFiles;
		this.totalEl.textContent = this.totalFiles;
		const progress = (this.processedFiles / this.totalFiles) * 100;
		this.progressBar.style.width = `${progress}%`;
	}
	showStats() {
		this.statsEl.style.display = 'block';
	}
	hideStats() {
		this.statsEl.style.display = 'none';
	}
	showTooltip(text) {
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
	toggleMinimize() {
		this.isMinimized ? this.maximize() : this.minimize();
	}
	minimize() {
		this.isMinimized = true;
		this.dropZone.classList.add('minimized');
		this.container.querySelector('.drop-zone-header').style.display = 'none';
		this.container.querySelector('.drop-zone-content').style.display = 'none';
		this.saveState();
	}
	maximize() {
		this.isMinimized = false;
		this.dropZone.classList.remove('minimized');
		this.container.querySelector('.drop-zone-header').style.display = 'flex';
		this.container.querySelector('.drop-zone-content').style.display =
			'block';
		this.saveState();
	}
	resetState() {
		this.files = [];
		this.totalFiles = 0;
		this.processedFiles = 0;
		this.uploadedFiles = 0;
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
