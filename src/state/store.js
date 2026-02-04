/**
 * centralized state management with history support (undo/redo).
 */

const MAX_HISTORY = 50;

const initialState = {
    nodes: [],
    connections: [],
    flowStatus: 'idle', // idle, running, paused, completed
    activeNodeId: null,
    completedNodes: [], // IDs of nodes that have finished execution
    logs: []
};

class Store {
    constructor() {
        this.state = JSON.parse(JSON.stringify(initialState));
        this.history = [];
        this.future = [];
        this.listeners = [];
        this.loadFromStorage();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    getState() {
        return this.state;
    }

    dispatch(action, payload) {
        // Snapshot for history if the action changes data
        const isDataChange = ['ADD_NODE', 'MOVE_NODE', 'DELETE_NODE', 'CONNECT_NODES', 'DELETE_CONNECTION', 'LOAD_WORKFLOW', 'UPDATE_NODE_DATA'].includes(action);

        if (isDataChange) {
            this.history.push(JSON.parse(JSON.stringify(this.state)));
            if (this.history.length > MAX_HISTORY) this.history.shift();
            this.future = []; // clear redo stack on new action
        }

        switch (action) {
            case 'ADD_NODE':
                this.state.nodes.push(payload); // payload: { id, type, x, y, data }
                break;
            case 'MOVE_NODE':
                const node = this.state.nodes.find(n => n.id === payload.id);
                if (node) {
                    node.x = payload.x;
                    node.y = payload.y;
                }
                break;
            case 'DELETE_NODE':
                this.state.nodes = this.state.nodes.filter(n => n.id !== payload.id);
                // remove connections associated with this node
                this.state.connections = this.state.connections.filter(c => c.source !== payload.id && c.target !== payload.id);
                break;
            case 'CONNECT_NODES':
                // Check if connection already exists
                const exists = this.state.connections.some(c => c.source === payload.source && c.target === payload.target && c.sourcePort === payload.sourcePort);
                if (!exists) {
                    this.state.connections.push(payload); // payload: { id, source, target, sourcePort, targetPort }
                }
                break;
            case 'DELETE_CONNECTION':
                this.state.connections = this.state.connections.filter(c => c.id !== payload.id);
                break;
            case 'UNDO':
                if (this.history.length === 0) return;
                this.future.push(JSON.parse(JSON.stringify(this.state)));
                this.state = this.history.pop();
                break;
            case 'REDO':
                if (this.future.length === 0) return;
                this.history.push(JSON.parse(JSON.stringify(this.state)));
                this.state = this.future.pop();
                break;
            case 'CLEAR_CANVAS':
                this.history.push(JSON.parse(JSON.stringify(this.state)));
                this.state.nodes = [];
                this.state.connections = [];
                this.state.flowStatus = 'idle';
                this.state.activeNodeId = null;
                this.state.completedNodes = [];
                break;
            case 'LOAD_WORKFLOW':
                this.state = { ...initialState, ...payload };
                break;
            case 'UPDATE_NODE_DATA':
                const updateNode = this.state.nodes.find(n => n.id === payload.id);
                if (updateNode) {
                    updateNode.data = { ...updateNode.data, ...payload.data };
                }
                break;

            // Execution Actions (Do not save to history)
            case 'SET_FLOW_STATUS':
                this.state.flowStatus = payload;
                break;
            case 'SET_ACTIVE_NODE':
                this.state.activeNodeId = payload;
                if (payload && !this.state.completedNodes.includes(payload)) {
                    // It's technically "visiting"
                }
                break;
            case 'MARK_NODE_COMPLETED':
                if (!this.state.completedNodes.includes(payload)) {
                    this.state.completedNodes.push(payload);
                }
                break;
            case 'RESET_EXECUTION':
                this.state.flowStatus = 'idle';
                this.state.activeNodeId = null;
                this.state.completedNodes = [];
                this.state.logs = [];
                break;
        }

        this.notify();
        this.saveToStorage();
    }

    notify() {
        this.listeners.forEach(l => l(this.state));
    }

    saveToStorage() {
        // Only save content, not execution state
        const saveState = {
            nodes: this.state.nodes,
            connections: this.state.connections
        };
        localStorage.setItem('flowboard_autosave', JSON.stringify(saveState));
    }

    loadFromStorage() {
        const saved = localStorage.getItem('flowboard_autosave');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state.nodes = parsed.nodes || [];
            this.state.connections = parsed.connections || [];
        }
    }
}

export const store = new Store();
