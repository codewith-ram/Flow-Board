import { store } from './state/store.js';
import { createElement, drawBezierCurve, getElementCenter } from './utils/dom.js';
import { engine } from './engine/WorkflowEngine.js';

// --- Global Variables ---
let canvas, canvasLayer, connectionsLayer;
let dragSource = null; // For palette dragging
let dragNode = null;   // For canvas node moving
let isDraggingNode = false;
let selectedNodeId = null;
let dragOffset = { x: 0, y: 0 };
let connectionStartInfo = null; // { nodeId, portType, x, y }
let tempConnectionPath = null;
let nodeStartPos = { x: 0, y: 0 }; // Track start pos to detect click vs drag

// Context Menu State
let contextMenuTargetId = null;

// --- Initialization ---

export function initApp() {
    canvas = document.getElementById('canvas-container');
    canvasLayer = document.getElementById('canvas-layer');
    connectionsLayer = document.getElementById('connections-layer');

    setupPaletteListeners();
    setupCanvasListeners();
    setupToolbarListeners();
    setupContextMenu();

    // Initial Render
    render();

    // Subscribe to store changes
    store.subscribe(() => {
        render();
        updateUIState();
    });
}

// --- Event Listeners ---

function setupContextMenu() {
    const menu = document.getElementById('context-menu');

    // Hide menu on any click elsewhere
    document.addEventListener('click', () => {
        menu.style.display = 'none';
        contextMenuTargetId = null;
    });

    // Right Click on Canvas
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const target = e.target.closest('.node');
        if (target) {
            contextMenuTargetId = target.dataset.id;

            // Select the node visually as well
            selectedNodeId = contextMenuTargetId;
            const nodeObj = store.getState().nodes.find(n => n.id === selectedNodeId);
            if (nodeObj) renderPropertiesPanel(nodeObj);
            render();

            // Position menu
            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
        } else {
            menu.style.display = 'none';
        }
    });

    // Menu Actions
    document.getElementById('cm-delete').addEventListener('click', () => {
        if (contextMenuTargetId) {
            store.dispatch('DELETE_NODE', { id: contextMenuTargetId });
            contextMenuTargetId = null;
        }
    });

    document.getElementById('cm-duplicate').addEventListener('click', () => {
        if (contextMenuTargetId) {
            const original = store.getState().nodes.find(n => n.id === contextMenuTargetId);
            if (original) {
                store.dispatch('ADD_NODE', {
                    id: 'node_' + Date.now(),
                    type: original.type,
                    x: original.x + 20,
                    y: original.y + 20,
                    data: { ...original.data }
                });
            }
            contextMenuTargetId = null;
        }
    });
}

function setupPaletteListeners() {
    const blocks = document.querySelectorAll('.palette .draggable-block');
    blocks.forEach(block => {
        block.addEventListener('dragstart', (e) => {
            // Use text/plain for maximum compatibility
            e.dataTransfer.setData('text/plain', block.dataset.type);
            e.dataTransfer.effectAllowed = 'copy';
            dragSource = block.dataset.type;
        });
    });
}

function setupCanvasListeners() {
    // Drop from palette
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        // Try getting text/plain
        const type = e.dataTransfer.getData('text/plain') || dragSource;
        if (type) {
            const rect = canvasLayer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            createNode(type, x, y);
        }
    });

    // Global Body Mouse Interactions for Node Dragging & Connecting
    // Usage of event delegation on canvasLayer
    canvasLayer.addEventListener('mousedown', (e) => {
        const target = e.target;

        // 1. Port Click -> Start Connection
        if (target.classList.contains('port')) {
            e.stopPropagation();
            if (target.classList.contains('input')) return; // Can't start from input

            const nodeEl = target.closest('.node');
            const nodeId = nodeEl.dataset.id;
            // Identify port specific
            const portType = target.classList.contains('output-true') ? 'output-true' :
                target.classList.contains('output-false') ? 'output-false' : 'output';

            const center = getElementCenter(target, canvasLayer);

            connectionStartInfo = {
                nodeId,
                portElem: target,
                portType,
                startX: center.x,
                startY: center.y
            };

            // Create temporary path
            tempConnectionPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempConnectionPath.setAttribute('class', 'connection');
            tempConnectionPath.setAttribute('stroke-dasharray', '5,5');
            tempConnectionPath.setAttribute('stroke-opacity', '0.5');
            connectionsLayer.appendChild(tempConnectionPath);
            return;
        }

        // 2. Node Header Click -> Drag Node
        // Only if not clicking a specialized element like a port or delete button
        if (target.closest('.node') && !target.closest('.port') && !target.closest('.ph-x')) {
            const nodeEl = target.closest('.node');
            isDraggingNode = true;
            dragNode = nodeEl;

            // Select immediately on mousedown for better responsiveness
            selectedNodeId = nodeEl.dataset.id;

            // Visual update (manual class toggle to avoid render nuking dragNode)
            document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
            nodeEl.classList.add('selected');

            // Panel update
            const nodeObj = store.getState().nodes.find(n => n.id === selectedNodeId);
            if (nodeObj) renderPropertiesPanel(nodeObj);

            const rect = nodeEl.getBoundingClientRect();
            dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            nodeStartPos = {
                x: parseFloat(nodeEl.style.left),
                y: parseFloat(nodeEl.style.top)
            };

            // Bring to front
            if (nodeEl.parentNode) {
                nodeEl.parentNode.appendChild(nodeEl);
            }
        } else {
            // Clicked empty canvas -> Deselect
            if (selectedNodeId) {
                selectedNodeId = null;
                document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
                document.getElementById('prop-node-type').textContent = 'Select a node';
                document.getElementById('prop-content').innerHTML = '<div class="empty-state">No node selected</div>';
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        const rect = canvasLayer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Connecting
        if (connectionStartInfo && tempConnectionPath) {
            const d = drawBezierCurve(connectionStartInfo.startX, connectionStartInfo.startY, mouseX, mouseY);
            tempConnectionPath.setAttribute('d', d);
        }

        // Node Dragging
        if (isDraggingNode && dragNode) {
            let newX = mouseX - dragOffset.x;
            let newY = mouseY - dragOffset.y;

            // Grid Snap (10px)
            newX = Math.round(newX / 10) * 10;
            newY = Math.round(newY / 10) * 10;

            dragNode.style.left = `${newX}px`;
            dragNode.style.top = `${newY}px`;

            // Update temp visual immediately
            requestAnimationFrame(() => updateConnectionsForNode(dragNode.dataset.id, newX, newY));
        }
    });

    window.addEventListener('mouseup', (e) => {
        // Finish Connection
        if (connectionStartInfo) {
            const upTarget = e.target;
            // Check if dropped on a valid input port
            if (upTarget.classList.contains('port') && upTarget.classList.contains('input')) {
                const targetNode = upTarget.closest('.node');
                const targetId = targetNode.dataset.id;

                // Prevent self-connection or loops if we wanted strict logic
                if (targetId !== connectionStartInfo.nodeId) {
                    store.dispatch('CONNECT_NODES', {
                        id: Date.now().toString(),
                        source: connectionStartInfo.nodeId,
                        target: targetId,
                        sourcePort: connectionStartInfo.portType,
                        targetPort: 'input'
                    });
                }
            }

            // Cleanup
            if (tempConnectionPath) tempConnectionPath.remove();
            tempConnectionPath = null;
            connectionStartInfo = null;
        }

        // Finish Node Drag
        if (isDraggingNode && dragNode) {
            const x = parseFloat(dragNode.style.left);
            const y = parseFloat(dragNode.style.top);

            // Detect movement
            const dist = Math.hypot(x - nodeStartPos.x, y - nodeStartPos.y);

            if (dist > 5) {
                // Was a Drag -> Move
                store.dispatch('MOVE_NODE', {
                    id: dragNode.dataset.id,
                    x, y
                });
            }

            isDraggingNode = false;
            dragNode = null;
        }
    });
}

function setupToolbarListeners() {
    document.getElementById('btn-undo').addEventListener('click', () => store.dispatch('UNDO'));
    document.getElementById('btn-redo').addEventListener('click', () => store.dispatch('REDO'));
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm("Clear entire workflow?")) store.dispatch('CLEAR_CANVAS');
    });

    document.getElementById('btn-play').addEventListener('click', () => engine.start());
    document.getElementById('btn-pause').addEventListener('click', () => engine.pause());
    document.getElementById('btn-reset').addEventListener('click', () => engine.reset());

    document.getElementById('btn-save').addEventListener('click', () => {
        const name = prompt("Workflow Name:", "My Workflow " + new Date().toLocaleTimeString());
        if (name) {
            saveWorkflow(name);
        }
    });
}

// --- Rendering & Logic ---

function createNode(type, x, y) {
    const id = 'node_' + Date.now();
    store.dispatch('ADD_NODE', {
        id, type, x, y, data: {}
    });
}

function render() {
    const state = store.getState();
    const nodesLayer = document.getElementById('nodes-layer');

    // We only full re-render if NOT dragging a node to prevent glitching/ghosts
    // BUT, we need to re-render if state changed from external reasons.
    // However, store dispatch triggers render(). 
    // If we are dragging, we are NOT updating store until mouseup.
    // So render() will not be called during drag (except initial).
    // Wait, updateConnectionsForNode uses requestAnimationFrame but does NOT call render() in the optimized version below.

    nodesLayer.innerHTML = '';

    state.nodes.forEach(node => {
        const el = createElement('div', `node ${node.type}`, {
            'style': `left: ${node.x}px; top: ${node.y}px`,
            'data-id': node.id
        });

        if (state.activeNodeId === node.id) el.classList.add('running');
        if (state.completedNodes.includes(node.id)) el.classList.add('completed');

        // Header
        const header = createElement('div', 'node-header');
        header.innerHTML = `<i class="ph ph-squares-four"></i> <span>${node.type}</span>`;
        // Delete button
        const delBtn = createElement('i', 'ph ph-x', {
            'style': 'cursor:pointer; opacity:0.6;'
        });
        // Selection handled in global mousedown
        el.onclick = (e) => {
            e.stopPropagation();
        };
        header.appendChild(delBtn);
        el.appendChild(header);

        // Content
        const content = createElement('div', 'node-content');
        content.textContent = node.data.label || `${node.type} Block`;
        el.appendChild(content);

        // Ports
        // Input (All accept Start)
        if (node.type !== 'start') {
            el.appendChild(createElement('div', 'port input', { 'title': 'Input' }));
        }

        // Selection Class Logic
        if (selectedNodeId === node.id) el.classList.add('selected');

        // Output
        if (node.type !== 'end') {
            if (node.type === 'decision') {
                el.appendChild(createElement('div', 'port output-true', { 'title': 'True' }));
                el.appendChild(createElement('div', 'port output-false', { 'title': 'False' }));
            } else {
                el.appendChild(createElement('div', 'port output', { 'title': 'Output' }));
            }
        }

        nodesLayer.appendChild(el);
    });

    // 2. Render Connections
    connectionsLayer.innerHTML = '';
    state.connections.forEach(conn => {
        const sourceNode = state.nodes.find(n => n.id === conn.source);
        const targetNode = state.nodes.find(n => n.id === conn.target);

        if (!sourceNode || !targetNode) return;

        const sourceEl = document.querySelector(`.node[data-id="${conn.source}"]`);
        const targetEl = document.querySelector(`.node[data-id="${conn.target}"]`);

        if (!sourceEl || !targetEl) return;

        // Find specific ports
        const sourcePortEl = sourceEl.querySelector(`.port.${conn.sourcePort}`) || sourceEl.querySelector('.port.output');
        const targetPortEl = targetEl.querySelector('.port.input');

        if (!sourcePortEl || !targetPortEl) return;

        const p1 = getElementCenter(sourcePortEl, canvasLayer);
        const p2 = getElementCenter(targetPortEl, canvasLayer);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', drawBezierCurve(p1.x, p1.y, p2.x, p2.y));
        path.setAttribute('class', 'connection');
        // Add ID for optimized updates
        path.setAttribute('data-connection-id', conn.id);

        // Animation if active
        if (state.flowStatus === 'running' && state.activeNodeId === conn.target && state.completedNodes.includes(conn.source)) {
            path.classList.add('active');
        } else if (state.completedNodes.includes(conn.source) && state.completedNodes.includes(conn.target)) {
            // Path traveled
            path.setAttribute('stroke', 'var(--accent-green)');
        }

        // Delete on click
        path.onclick = () => {
            store.dispatch('DELETE_CONNECTION', { id: conn.id });
        };

        connectionsLayer.appendChild(path);
    });

    // 3. Render Status
    const statusEl = document.getElementById('status-bar');
    statusEl.textContent = `Nodes: ${state.nodes.length} | State: ${state.flowStatus.toUpperCase()}`;
}

function updateUIState() {
    const state = store.getState();
    const running = state.flowStatus === 'running';

    document.getElementById('btn-undo').disabled = running || store.history.length === 0;
    document.getElementById('btn-redo').disabled = running || store.future.length === 0;
    document.getElementById('btn-play').disabled = running;
    document.getElementById('btn-pause').disabled = !running;
    document.getElementById('btn-reset').disabled = state.flowStatus === 'idle';
}

function updateConnectionsForNode(nodeId, x, y) {
    // Optimized: Only update SVG paths, do NOT re-render entire DOM.
    const connections = store.getState().connections.filter(c => c.source === nodeId || c.target === nodeId);

    connections.forEach(conn => {
        const path = document.querySelector(`.connection[data-connection-id="${conn.id}"]`);
        if (!path) return;

        const sourceNodeEl = document.querySelector(`.node[data-id="${conn.source}"]`);
        const targetNodeEl = document.querySelector(`.node[data-id="${conn.target}"]`);

        if (!sourceNodeEl || !targetNodeEl) return;

        const sourcePortEl = sourceNodeEl.querySelector(`.port.${conn.sourcePort}`) || sourceNodeEl.querySelector('.port.output');
        const targetPortEl = targetNodeEl.querySelector('.port.input');

        if (!sourcePortEl || !targetPortEl) return;

        const p1 = getElementCenter(sourcePortEl, canvasLayer);
        const p2 = getElementCenter(targetPortEl, canvasLayer);

        path.setAttribute('d', drawBezierCurve(p1.x, p1.y, p2.x, p2.y));
    });
}

function saveWorkflow(name) {
    const list = JSON.parse(localStorage.getItem('flowboard_saved_lists') || '[]');
    const current = store.getState();
    const data = {
        name,
        date: new Date().toISOString(),
        nodes: current.nodes,
        connections: current.connections
    };
    list.push(data);
    localStorage.setItem('flowboard_saved_lists', JSON.stringify(list));
    loadSavedWorkflowsList();
}

function loadSavedWorkflowsList() {
    const ul = document.getElementById('saved-workflows-list');
    ul.innerHTML = '';
    const list = JSON.parse(localStorage.getItem('flowboard_saved_lists') || '[]');

    list.forEach((flow, index) => {
        const li = document.createElement('li');
        li.textContent = flow.name;
        li.onclick = () => {
            if (confirm(`Load "${flow.name}"? Unsaved changes will be lost.`)) {
                store.dispatch('LOAD_WORKFLOW', flow);
            }
        };
        ul.appendChild(li);
    });
}

// Initial load of saved list
loadSavedWorkflowsList();
setupLogs();

function setupLogs() {
    document.getElementById('btn-clear-logs').onclick = () => {
        document.getElementById('logs-content').innerHTML = '';
    };
}

function renderPropertiesPanel(node) {
    const pane = document.getElementById('prop-content');
    const typeLabel = document.getElementById('prop-node-type');

    typeLabel.textContent = `${node.type} Node (${node.id.substr(-6)})`;
    pane.innerHTML = '';

    if (node.type === 'start') {
        pane.innerHTML = '<div class="empty-state">Start node determines the beginning. No properties.</div>';
        return;
    }

    if (node.type === 'end') {
        pane.innerHTML = '<div class="empty-state">End node finishes the workflow.</div>';
        return;
    }

    // Common: Label
    const labelGroup = createInput('Label', node.data.label || '', (val) => {
        store.dispatch('UPDATE_NODE_DATA', { id: node.id, data: { label: val } });
    });
    pane.appendChild(labelGroup);

    if (node.type === 'task') {
        // Action Select
        const actionGroup = document.createElement('div');
        actionGroup.className = 'form-group';
        actionGroup.innerHTML = `<label>Action</label>
        <select class="form-control">
            <option value="log">Print Log</option>
            <option value="alert">Show Alert</option>
            <option value="set_var">Set Variable</option>
        </select>`;

        const select = actionGroup.querySelector('select');
        select.value = node.data.action || 'log';
        select.onchange = (e) => {
            store.dispatch('UPDATE_NODE_DATA', { id: node.id, data: { action: e.target.value } });
            renderPropertiesPanel(store.getState().nodes.find(n => n.id === node.id)); // Re-render for dynamic fields
        };
        pane.appendChild(actionGroup);

        // Dynamic fields based on action
        const action = select.value;
        if (action === 'log' || action === 'alert') {
            pane.appendChild(createInput('Message', node.data.message || '', (val) => {
                store.dispatch('UPDATE_NODE_DATA', { id: node.id, data: { message: val } });
            }));
        } else if (action === 'set_var') {
            pane.appendChild(createInput('Variable Name', node.data.varName || '', (val) => {
                store.dispatch('UPDATE_NODE_DATA', { id: node.id, data: { varName: val } });
            }));
            pane.appendChild(createInput('Value', node.data.varValue || '', (val) => {
                store.dispatch('UPDATE_NODE_DATA', { id: node.id, data: { varValue: val } });
            }));
        }
    }

    if (node.type === 'decision') {
        pane.innerHTML += `<div class="empty-state" style="margin-bottom:10px; font-size:0.8rem; color:var(--accent-orange)">If Condition is TRUE, goes Left (Green). Else Right (Red).</div>`;

        pane.appendChild(createInput('Variable to Check', node.data.variable || '', (val) => {
            store.dispatch('UPDATE_NODE_DATA', { id: node.id, data: { variable: val } });
        }));

        pane.appendChild(createInput('Equals Value', node.data.value || '', (val) => {
            store.dispatch('UPDATE_NODE_DATA', { id: node.id, data: { value: val } });
        }));
    }
}

function createInput(label, value, onChange) {
    const group = document.createElement('div');
    group.className = 'form-group';
    const id = 'input_' + Math.random().toString(36).substr(2, 9);

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.htmlFor = id;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.value = value;
    input.id = id;

    input.oninput = (e) => onChange(e.target.value);

    group.appendChild(labelEl);
    group.appendChild(input);
    return group;
}

function loadDummyWorkflow() {
    // Only load if empty
    if (store.getState().nodes.length > 0) return;

    const dummy = {
        nodes: [
            { id: 'node_start', type: 'start', x: 50, y: 100, data: { label: 'Start' } },
            { id: 'node_task1', type: 'task', x: 300, y: 100, data: { label: 'Log Hello', action: 'log', message: 'Hello World from FlowBoard!' } },
            { id: 'node_dec', type: 'decision', x: 550, y: 100, data: { label: 'Is Active?', variable: 'x', value: '1' } },
            { id: 'node_end', type: 'end', x: 800, y: 50, data: { label: 'End True' } },
            { id: 'node_end2', type: 'end', x: 800, y: 200, data: { label: 'End False' } }
        ],
        connections: [
            { id: 'c1', source: 'node_start', target: 'node_task1', sourcePort: 'output', targetPort: 'input' },
            { id: 'c2', source: 'node_task1', target: 'node_dec', sourcePort: 'output', targetPort: 'input' },
            { id: 'c3', source: 'node_dec', target: 'node_end', sourcePort: 'output-true', targetPort: 'input' },
            { id: 'c4', source: 'node_dec', target: 'node_end2', sourcePort: 'output-false', targetPort: 'input' }
        ]
    };
    store.dispatch('LOAD_WORKFLOW', dummy);
}

// Initialize
initApp();
loadDummyWorkflow();
