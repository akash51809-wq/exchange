'use strict';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function useFullWidthContainers(html) {
  return html.replace(/\bclass="([^"]*)"/g, (match, classNames) => {
    const classes = classNames.split(/\s+/);
    const containerIndex = classes.indexOf('container');
    if (containerIndex < 0) return match;
    classes.splice(containerIndex, 1, 'container-fluid', 'px-2');
    return `class="${classes.join(' ')}"`;
  });
}

module.exports = { escapeHtml, useFullWidthContainers };
