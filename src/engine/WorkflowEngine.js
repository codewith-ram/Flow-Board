import { store } from '../state/store.js';

export class WorkflowEngine {
    constructor() {
        this.intervalId = null;
        this.delay = 1000;
        this.variables = {}; // Runtime storage
    }

    start() {
        if (store.getState().flowStatus === 'running') return;

        // If resumes or starts fresh
        if (store.getState().flowStatus === 'idle' || store.getState().flowStatus === 'completed') {
            store.dispatch('RESET_EXECUTION');

            // Reset vars
            this.variables = {};
            this.log("System", "Execution started.");

            const startNode = store.getState().nodes.find(n => n.type === 'start');
            if (!startNode) {
                alert("No Start node found!");
                return;
            }
            store.dispatch('SET_ACTIVE_NODE', startNode.id);
        }

        store.dispatch('SET_FLOW_STATUS', 'running');
        this.loop();
    }

    pause() {
        store.dispatch('SET_FLOW_STATUS', 'paused');
        clearTimeout(this.intervalId);
        this.log("System", "Paused.");
    }

    reset() {
        this.pause();
        store.dispatch('RESET_EXECUTION');
        this.variables = {};
        document.getElementById('logs-content').innerHTML = ''; // Clear UI logs
    }

    loop() {
        if (store.getState().flowStatus !== 'running') return;

        this.intervalId = setTimeout(() => {
            this.step();
        }, this.delay);
    }

    step() {
        const state = store.getState();
        const currentNodeId = state.activeNodeId;

        if (!currentNodeId) {
            this.finish();
            return;
        }

        const currentNode = state.nodes.find(n => n.id === currentNodeId);
        if (!currentNode) {
            this.finish(); return;
        }

        // 1. Logic Execution (Real-time)
        this.executeNodeLogic(currentNode);

        // 2. Mark completed
        store.dispatch('MARK_NODE_COMPLETED', currentNodeId);

        // 3. Find next
        if (currentNode.type === 'end') {
            this.finish();
            return;
        }

        const connections = state.connections.filter(c => c.source === currentNodeId);

        if (connections.length === 0) {
            this.finish();
            return;
        }

        let nextNodeId = null;

        if (currentNode.type === 'decision') {
            // DECISION LOGIC
            // Check condition from data, e.g., "x > 5"
            // For now, strict equality on variables
            const varName = currentNode.data.variable || 'x';
            const valueMatch = currentNode.data.value || 'true';

            const realValue = this.variables[varName];
            const isMatch = String(realValue) === String(valueMatch);

            this.log("Decision", `Checking ${varName} (${realValue}) == ${valueMatch} -> ${isMatch}`);

            const port = isMatch ? 'output-true' : 'output-false';
            const chosenConnection = connections.find(c => c.sourcePort === port);

            nextNodeId = chosenConnection ? chosenConnection.target : null;
        } else {
            // Task/Start
            nextNodeId = connections[0].target;
        }

        if (nextNodeId) {
            store.dispatch('SET_ACTIVE_NODE', nextNodeId);
            this.loop();
        } else {
            this.finish();
        }
    }

    executeNodeLogic(node) {
        if (node.type === 'task') {
            const action = node.data.action || 'log';

            if (action === 'log') {
                const msg = node.data.message || 'Executing Task...';
                this.log("Task", msg);
            }
            else if (action === 'alert') {
                const msg = node.data.message || 'Alert!';
                alert(msg);
                this.log("Task", `Alerted: ${msg}`);
            }
            else if (action === 'set_var') {
                const key = node.data.varName;
                const val = node.data.varValue;
                if (key) {
                    this.variables[key] = val;
                    this.log("Internal", `Set ${key} = ${val}`);
                }
            }
        }
        else if (node.type === 'start') {
            this.log("Start", "Workflow initiated.");
        }
    }

    finish() {
        store.dispatch('SET_FLOW_STATUS', 'completed');
        store.dispatch('SET_ACTIVE_NODE', null);
        this.log("System", "Workflow Completed.");
    }

    log(source, message) {
        const logsEl = document.getElementById('logs-content');
        if (!logsEl) return;
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `<span style="opacity:0.6">[${new Date().toLocaleTimeString()}]</span> <strong>${source}:</strong> ${message}`;
        logsEl.appendChild(div);
        logsEl.scrollTop = logsEl.scrollHeight;
    }
}

export const engine = new WorkflowEngine();
