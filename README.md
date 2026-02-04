# FlowBoard 

**FlowBoard** is a modern, lightweight, visual workflow automation tool built entirely with **Vanilla JavaScript**. It offers a "Zero-Dependency" architecture, meaning it runs directly in the browser without complex build steps or frameworks.

##  Features

- **Visual Workflow Designer**: Drag-and-drop interface with infinite canvas.
- **Real-Time Execution Engine**: Run workflows instantly and see execution logs in real-time.
- **Advanced Logic**: 
  - **Tasks**: Log messages, show alerts, or set variables.
  - **Decisions**: Branch execution flow based on variable comparisons.
- **Smart Interaction**:
  - Context Menu (Right-click) for quick actions like Duplicate and Delete.
  - Properties Panel for configuring node details.
  - Undo / Redo history support.
- **Auto-Save**: Workflows are automatically saved to your browser's LocalStorage.
- **Zero Dependencies**: Pure HTML, CSS, and JS. No `node_modules`.

## Quick Start

1. **Clone or Download** this project.
2. **Open** `index.html` in any modern web browser (Chrome, Edge, Firefox, etc.).
3. **Start Building**:
   - Drag **Start**, **Task**, **Decision**, or **End** nodes from the left palette.
   - Connect them by dragging from **Output Ports** (Right) to **Input Ports** (Left).
   - Click a node to configure it in the **Properties Panel** on the right.
   - Click **Run** to execute your workflow!

##  Project Structure

```
FlowBoard/
│
├── index.html          # Main entry point
├── src/
│   ├── main.js         # Application initialization & User Interaction logic
│   ├── styles.css      # Modern Dark UI styling
│   ├── state/
│   │   └── store.js    # Centralized State Management (Redux-pattern)
│   ├── engine/
│   │   └── WorkflowEngine.js # Logic for executing the flow
│   └── utils/
│       └── dom.js      # Helpers for SVG curves and DOM manipulation
```

## 🛠️ How It Works

1. **State Management**: Uses a custom "Redux-like" store to manage application state (nodes, connections) with immutable history for reliable Undo/Redo.
2. **Rendering**: Nodes are DOM elements for accessibility and ease of styling, while connections are drawn using SVG Bezier curves for smooth visuals.
3. **Execution**: The `WorkflowEngine` traverses the node graph step-by-step, manipulating a runtime execution context (variables) and handling decision branching logic.

## contributing

Feel free to modify the source! Since it is modular ES6 JavaScript, adding new node types or features is straightforward.

1. Add the node type logic in `WorkflowEngine.js`.
2. Update `renderPropertiesPanel` in `main.js` to support new inputs.
3. Add styles if necessary.