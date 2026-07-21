/* ==========================================================================
   PIXELCRAFT - Retro Pixel Art Grid Editor Core Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- Palette Presets Data ---
    const PALETTES = {
        pico8: [
            '#000000', '#1D2B53', '#7E2553', '#008751', 
            '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', 
            '#FF004D', '#FFA300', '#FFEC27', '#00E436', 
            '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'
        ],
        nes: [
            '#7C7C7C', '#0000FC', '#0000BC', '#4428BC', 
            '#940084', '#A80020', '#A81000', '#881400', 
            '#503000', '#007800', '#006800', '#005800', 
            '#004058', '#9C9C9C', '#00B8F8', '#00A800',
            '#F83800', '#F878F8', '#F8B800', '#F8F8F8',
            '#F8D878', '#F8F800', '#00FC00', '#00E800'
        ],
        gameboy: [
            '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
        ],
        vaporwave: [
            '#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', 
            '#fffb96', '#200140', '#ff3b70', '#5a02a3',
            '#d2ff00', '#00ffcc', '#ff00ff', '#ffffff'
        ],
        autumn: [
            '#2c1605', '#4f1a04', '#802d08', '#bc500c', 
            '#e87a22', '#f39f37', '#f8cd6c', '#6c743c', 
            '#404a1f', '#202b11', '#542a0c', '#3a5f0b'
        ]
    };

    // --- State Variables ---
    let gridSize = 16;
    let canvasSize = 512; // Static buffer size for crisp drawing lines
    let pixels = [];      // 2D Array holding color info
    let currentColor = '#ff4757';
    let currentTool = 'pencil'; // pencil, eraser, bucket, picker
    let gridLinesActive = true;
    let isDrawing = false;
    let drawButtonType = 0; // 0 = left, 2 = right-click
    let lastCoord = { x: -1, y: -1 }; // Track coordinate changes during mouse drag

    // History tracking
    let undoStack = [];
    let redoStack = [];
    const maxHistory = 50;

    // Recent colors
    let recentColors = ['#ff4757', '#7d5fff', '#2ed573', '#ffa502', '#ffffff', '#000000'];

    // --- DOM Elements ---
    const canvas = document.getElementById('pixel-canvas');
    const ctx = canvas.getContext('2d');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const coordDisplay = document.getElementById('coord-display');
    const canvasSizeInfo = document.getElementById('canvas-size-info');
    
    // Tools & Action buttons
    const toolPencil = document.getElementById('tool-pencil');
    const toolEraser = document.getElementById('tool-eraser');
    const toolBucket = document.getElementById('tool-bucket');
    const toolPicker = document.getElementById('tool-picker');
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnToggleGrid = document.getElementById('btn-toggle-grid');
    const btnClear = document.getElementById('btn-clear');
    
    // Color picking elements
    const colorPickerInput = document.getElementById('color-picker');
    const colorPreview = document.getElementById('color-preview');
    const hexInput = document.getElementById('hex-input');
    const paletteSelector = document.getElementById('palette-selector');
    const paletteGrid = document.getElementById('palette-grid');
    const recentColorsGrid = document.getElementById('recent-colors-grid');
    
    // Export and Save buttons
    const exportScaleSlider = document.getElementById('export-scale-slider');
    const exportSizePreview = document.getElementById('export-size-preview');
    const scaleFactorText = document.getElementById('scale-factor-text');
    const btnExportPng = document.getElementById('btn-export-png');
    const btnSaveLocal = document.getElementById('btn-save-local');
    const btnLoadLocal = document.getElementById('btn-load-local');
    
    // Shortcut Modal elements
    const btnShortcutsToggle = document.getElementById('btn-shortcuts-toggle');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const btnModalClose = document.getElementById('btn-modal-close');

    // --- Core Canvas Setup ---
    canvas.width = canvasSize;
    canvas.height = canvasSize;

    // Initialize 2D pixel grid array
    function initPixelGrid(size, restoreData = null) {
        gridSize = size;
        pixels = [];
        
        for (let y = 0; y < size; y++) {
            const row = [];
            for (let x = 0; x < size; x++) {
                if (restoreData && restoreData[y] && restoreData[y][x]) {
                    row.push(restoreData[y][x]);
                } else {
                    row.push('transparent');
                }
            }
            pixels.push(row);
        }

        canvasSizeInfo.textContent = `${size} x ${size} Pixels`;
        updateExportSizePreview();
        redraw();
    }

    // Main render function for canvas
    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const blockSize = canvasSize / gridSize;

        // 1. Draw solid pixels
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const color = pixels[y][x];
                if (color && color !== 'transparent') {
                    ctx.fillStyle = color;
                    // Draw slightly oversized to prevent tiny hairline cracks between filled rectangles
                    ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
                }
            }
        }

        // 2. Draw grid lines if toggle is on
        if (gridLinesActive) {
            ctx.strokeStyle = '#292e3c'; // Premium dark-slate line color
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            for (let i = 0; i <= gridSize; i++) {
                const pos = i * blockSize;
                // Vertical lines
                ctx.moveTo(pos, 0);
                ctx.lineTo(pos, canvasSize);
                // Horizontal lines
                ctx.moveTo(0, pos);
                ctx.lineTo(canvasSize, pos);
            }
            ctx.stroke();
        }
    }

    // --- State History (Undo / Redo) ---
    function saveHistoryState() {
        undoStack.push(JSON.stringify(pixels));
        if (undoStack.length > maxHistory) {
            undoStack.shift();
        }
        redoStack = []; // Clear redo stack on any new constructive move
        updateUndoRedoStates();
    }

    function undo() {
        if (undoStack.length === 0) return;
        
        // Push current state onto redo stack
        redoStack.push(JSON.stringify(pixels));
        if (redoStack.length > maxHistory) {
            redoStack.shift();
        }

        // Pop last state and restore
        const prevState = JSON.parse(undoStack.pop());
        pixels = prevState;
        
        redraw();
        updateUndoRedoStates();
    }

    function redo() {
        if (redoStack.length === 0) return;

        // Push current state onto undo stack
        undoStack.push(JSON.stringify(pixels));
        
        // Pop from redo and restore
        const nextState = JSON.parse(redoStack.pop());
        pixels = nextState;

        redraw();
        updateUndoRedoStates();
    }

    function updateUndoRedoStates() {
        if (undoStack.length > 0) {
            btnUndo.classList.remove('disabled');
            btnUndo.disabled = false;
        } else {
            btnUndo.classList.add('disabled');
            btnUndo.disabled = true;
        }

        if (redoStack.length > 0) {
            btnRedo.classList.remove('disabled');
            btnRedo.disabled = false;
        } else {
            btnRedo.classList.add('disabled');
            btnRedo.disabled = true;
        }
    }

    function clearHistory() {
        undoStack = [];
        redoStack = [];
        updateUndoRedoStates();
    }

    // --- Drawing Mechanics ---
    function getGridCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        if (clientX === undefined || clientY === undefined) return null;

        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const x = Math.floor(mouseX / (rect.width / gridSize));
        const y = Math.floor(mouseY / (rect.height / gridSize));

        if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
            return { x, y };
        }
        return null;
    }

    function paintPixel(x, y, erase = false) {
        const targetColor = erase ? 'transparent' : currentColor;
        
        // Only paint if the color is actually changing to optimize performance & undo frames
        if (pixels[y][x] !== targetColor) {
            pixels[y][x] = targetColor;
            redraw();
        }
    }

    function runFloodFill(startX, startY, fillWithColor) {
        const targetColor = pixels[startY][startX];
        if (targetColor === fillWithColor) return;

        saveHistoryState();
        
        const queue = [[startX, startY]];
        pixels[startY][startX] = fillWithColor;

        while (queue.length > 0) {
            const [x, y] = queue.shift();
            
            const neighbors = [
                [x + 1, y],
                [x - 1, y],
                [x, y + 1],
                [x, y - 1]
            ];

            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                    if (pixels[ny][nx] === targetColor) {
                        pixels[ny][nx] = fillWithColor;
                        queue.push([nx, ny]);
                    }
                }
            }
        }
        redraw();
    }

    function eyedropColor(x, y) {
        const color = pixels[y][x];
        if (color && color !== 'transparent') {
            updateActiveColor(color);
            setTool('pencil');
        }
    }

    // Draw handler mapping tools to events
    function handlePointerDraw(coords, isStart = false) {
        if (!coords) return;
        
        const { x, y } = coords;

        // Ensure we don't draw on the exact same coordinate multiple times consecutively
        if (!isStart && lastCoord.x === x && lastCoord.y === y) return;
        lastCoord = { x, y };

        const isRightClick = (drawButtonType === 2);
        
        if (currentTool === 'pencil') {
            if (isStart) saveHistoryState();
            paintPixel(x, y, isRightClick); // If right-click, erase pixel
        } else if (currentTool === 'eraser') {
            if (isStart) saveHistoryState();
            paintPixel(x, y, true); // Erase
        } else if (currentTool === 'bucket' && isStart) {
            const fillWith = isRightClick ? 'transparent' : currentColor;
            runFloodFill(x, y, fillWith);
        } else if (currentTool === 'picker' && isStart) {
            eyedropColor(x, y);
        }
    }

    // --- Pointer Events Listening (Desktop & Mobile) ---
    function onPointerDown(e) {
        // Handle right click drawing option
        drawButtonType = e.button;
        
        const coords = getGridCoordinates(e);
        if (coords) {
            isDrawing = true;
            handlePointerDraw(coords, true);
        }
    }

    function onPointerMove(e) {
        const coords = getGridCoordinates(e);
        if (coords) {
            coordDisplay.textContent = `X: ${coords.x}, Y: ${coords.y}`;
            if (isDrawing) {
                handlePointerDraw(coords, false);
            }
        } else {
            coordDisplay.textContent = `X: - , Y: -`;
        }
    }

    function onPointerUp() {
        isDrawing = false;
        lastCoord = { x: -1, y: -1 };
    }

    // Canvas Desktop Listeners
    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    
    // Disable right click menu on canvas for seamless drawing
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Mobile touch support
    canvas.addEventListener('touchstart', (e) => {
        const coords = getGridCoordinates(e);
        if (coords) {
            e.preventDefault(); // Stop scrolling when drawing
            drawButtonType = 0; // Left-click default
            isDrawing = true;
            handlePointerDraw(coords, true);
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        const coords = getGridCoordinates(e);
        if (isDrawing && coords) {
            e.preventDefault();
            handlePointerDraw(coords, false);
        }
    }, { passive: false });

    canvas.addEventListener('touchend', onPointerUp);

    // --- UI Controls Setup ---

    // Grid sizes switcher
    document.querySelectorAll('.grid-size-btn').forEach(button => {
        button.addEventListener('click', () => {
            const size = parseInt(button.dataset.size);
            if (size === gridSize) return;

            if (confirm(`Change grid to ${size}x${size}? This will clear your current canvas draft.`)) {
                document.querySelector('.grid-size-btn.active').classList.remove('active');
                button.classList.add('active');
                clearHistory();
                initPixelGrid(size);
            }
        });
    });

    // Tool switching
    function setTool(toolName) {
        currentTool = toolName;
        document.querySelector('.tool-btn.active')?.classList.remove('active');
        
        const targetBtn = document.getElementById(`tool-${toolName}`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }

    toolPencil.addEventListener('click', () => setTool('pencil'));
    toolEraser.addEventListener('click', () => setTool('eraser'));
    toolBucket.addEventListener('click', () => setTool('bucket'));
    toolPicker.addEventListener('click', () => setTool('picker'));

    // Canvas Actions
    btnUndo.addEventListener('click', undo);
    btnRedo.addEventListener('click', redo);
    
    btnToggleGrid.addEventListener('click', () => {
        gridLinesActive = !gridLinesActive;
        btnToggleGrid.classList.toggle('active', gridLinesActive);
        redraw();
    });

    btnClear.addEventListener('click', () => {
        if (confirm('Are you sure you want to completely clear the canvas?')) {
            saveHistoryState();
            for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                    pixels[y][x] = 'transparent';
                }
            }
            redraw();
        }
    });

    // --- Color Palette Handling ---

    function updateActiveColor(hex) {
        currentColor = hex.toLowerCase();
        colorPickerInput.value = currentColor;
        colorPreview.style.backgroundColor = currentColor;
        hexInput.value = currentColor.toUpperCase();

        // Highlighting active color inside grids
        document.querySelectorAll('.palette-color').forEach(el => {
            el.classList.toggle('active', el.dataset.color.toLowerCase() === currentColor);
        });

        addRecentColor(currentColor);
    }

    // Color Pickers Input Listeners
    colorPickerInput.addEventListener('input', (e) => {
        currentColor = e.target.value.toLowerCase();
        colorPreview.style.backgroundColor = currentColor;
        hexInput.value = currentColor.toUpperCase();
    });

    colorPickerInput.addEventListener('change', (e) => {
        updateActiveColor(e.target.value);
    });

    hexInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            let hex = hexInput.value.trim();
            if (!hex.startsWith('#')) hex = '#' + hex;
            
            // Check valid 3 or 6 digit hex
            if (/^#[0-9A-F]{6}$/i.test(hex) || /^#[0-9A-F]{3}$/i.test(hex)) {
                updateActiveColor(hex);
            } else {
                hexInput.value = currentColor.toUpperCase();
            }
        }
    });

    hexInput.addEventListener('blur', () => {
        hexInput.value = currentColor.toUpperCase();
    });

    // Load presets to UI
    function loadPalette(paletteName) {
        paletteGrid.innerHTML = '';
        const colors = PALETTES[paletteName] || PALETTES.pico8;

        colors.forEach(color => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'palette-color';
            colorDiv.style.backgroundColor = color;
            colorDiv.dataset.color = color;
            colorDiv.title = color.toUpperCase();

            if (color.toLowerCase() === currentColor) {
                colorDiv.classList.add('active');
            }

            colorDiv.addEventListener('click', () => {
                updateActiveColor(color);
            });

            paletteGrid.appendChild(colorDiv);
        });
    }

    paletteSelector.addEventListener('change', (e) => {
        loadPalette(e.target.value);
    });

    // Recent colors stack
    function renderRecentColors() {
        recentColorsGrid.innerHTML = '';
        recentColors.forEach(color => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'palette-color';
            colorDiv.style.backgroundColor = color;
            colorDiv.dataset.color = color;
            colorDiv.title = color.toUpperCase();

            if (color.toLowerCase() === currentColor) {
                colorDiv.classList.add('active');
            }

            colorDiv.addEventListener('click', () => {
                updateActiveColor(color);
            });

            recentColorsGrid.appendChild(colorDiv);
        });
    }

    function addRecentColor(hex) {
        // Remove duplicate
        recentColors = recentColors.filter(c => c.toLowerCase() !== hex.toLowerCase());
        // Insert at beginning
        recentColors.unshift(hex);
        // Limit to 8 items (the recent grid capacity)
        if (recentColors.length > 8) {
            recentColors.pop();
        }
        renderRecentColors();
    }

    // --- Export, Save & Load System ---

    function updateExportSizePreview() {
        const scale = parseInt(exportScaleSlider.value);
        const dimension = gridSize * scale;
        exportSizePreview.textContent = `${dimension} x ${dimension} px`;
        scaleFactorText.textContent = `${scale}x`;
    }

    exportScaleSlider.addEventListener('input', updateExportSizePreview);

    btnExportPng.addEventListener('click', () => {
        const scale = parseInt(exportScaleSlider.value);
        const outputSize = gridSize * scale;

        // Create offscreen high-resolution crisp canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = outputSize;
        exportCanvas.height = outputSize;
        const eCtx = exportCanvas.getContext('2d');

        // Turn off anti-aliasing for beautiful, sharp retro squares
        eCtx.imageSmoothingEnabled = false;

        // Render pixels
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const color = pixels[y][x];
                if (color && color !== 'transparent') {
                    eCtx.fillStyle = color;
                    eCtx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }

        // Trigger safe user download
        try {
            const dataUrl = exportCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `pixelcraft-art-${gridSize}x${gridSize}.png`;
            link.href = dataUrl;
            link.click();
        } catch (error) {
            alert('Failed to export canvas: ' + error.message);
        }
    });

    // Save and Load Local Drafts
    btnSaveLocal.addEventListener('click', () => {
        const saveData = {
            gridSize: gridSize,
            pixels: pixels,
            recentColors: recentColors,
            currentColor: currentColor
        };
        localStorage.setItem('pixelcraft_draft', JSON.stringify(saveData));
        
        // Visual cue of success
        const prevText = btnSaveLocal.innerHTML;
        btnSaveLocal.innerHTML = `<i data-lucide="check" style="color: var(--success-color);"></i> Saved!`;
        lucide.createIcons();
        setTimeout(() => {
            btnSaveLocal.innerHTML = prevText;
            lucide.createIcons();
        }, 1500);
    });

    btnLoadLocal.addEventListener('click', () => {
        const localData = localStorage.getItem('pixelcraft_draft');
        if (!localData) {
            alert('No saved draft was found in this browser.');
            return;
        }

        try {
            const saveData = JSON.parse(localData);
            clearHistory();
            
            // Re-select proper grid size button
            document.querySelectorAll('.grid-size-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.size) === saveData.gridSize);
            });

            recentColors = saveData.recentColors || recentColors;
            initPixelGrid(saveData.gridSize, saveData.pixels);
            updateActiveColor(saveData.currentColor || '#ff4757');
            
            // Visual cue of success
            const prevText = btnLoadLocal.innerHTML;
            btnLoadLocal.innerHTML = `<i data-lucide="check" style="color: var(--success-color);"></i> Loaded!`;
            lucide.createIcons();
            setTimeout(() => {
                btnLoadLocal.innerHTML = prevText;
                lucide.createIcons();
            }, 1500);

        } catch (e) {
            alert('Failed to load saved draft. Storage file may be corrupted.');
        }
    });

    // --- Key Shortcuts Modal Handling ---
    function toggleModal(open) {
        shortcutsModal.classList.toggle('active', open);
    }

    btnShortcutsToggle.addEventListener('click', () => toggleModal(true));
    btnModalClose.addEventListener('click', () => toggleModal(false));
    
    // Close modal clicking outside card
    shortcutsModal.addEventListener('click', (e) => {
        if (e.target === shortcutsModal) toggleModal(false);
    });

    // Keyboard Hotkey Actions
    window.addEventListener('keydown', (e) => {
        // Ignore hotkeys if user is editing HEX textbox
        if (document.activeElement === hexInput) return;

        const key = e.key.toLowerCase();

        // Undo (Ctrl+Z)
        if (e.ctrlKey && key === 'z') {
            e.preventDefault();
            undo();
        }
        // Redo (Ctrl+Y)
        else if (e.ctrlKey && key === 'y') {
            e.preventDefault();
            redo();
        }
        // Switch Tools
        else if (key === 'p') {
            setTool('pencil');
        } else if (key === 'e') {
            setTool('eraser');
        } else if (key === 'b') {
            setTool('bucket');
        } else if (key === 'i') {
            setTool('picker');
        } else if (key === 'g') {
            btnToggleGrid.click();
        } else if (key === 'c') {
            btnClear.click();
        } else if (e.key === 'Escape') {
            toggleModal(false);
        }
    });

    // --- App Launch ---
    initPixelGrid(16); // Default to a 16x16 pixel board
    loadPalette('pico8');
    renderRecentColors();
    
    // Initialize standard lucide SVG icons
    lucide.createIcons();
});
