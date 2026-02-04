/**
 * DOM Utility functions for creating elements and managing events.
 */

export function createElement(tag, className = "", attributes = {}, children = []) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'textContent') el.textContent = value;
        else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.substring(2).toLowerCase(), value);
        } else {
            el.setAttribute(key, value);
        }
    });

    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof HTMLElement || child instanceof SVGElement) {
            el.appendChild(child);
        }
    });

    return el;
}

export function drawBezierCurve(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    
    // Curvature logic: if connection is vertical, curve out horizontally, etc.
    // Standard cubic bezier
    const cp1x = x1;
    const cp1y = y1 + Math.max(dy * 0.5, 50);
    const cp2x = x2;
    const cp2y = y2 - Math.max(dy * 0.5, 50);

    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

export function getElementCenter(el, container) {
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2
    };
}
