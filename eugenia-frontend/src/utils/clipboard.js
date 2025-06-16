// src/utils/clipboard.js

export const copyToClipboardUtil = (text, callback) => {
    if (!text) {
      callback(false, 'Nothing to copy.');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      callback(true, 'Copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy using navigator.clipboard: ', err);
      // Fallback for older browsers or if navigator.clipboard is not available (e.g. insecure context)
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed"; // Avoid scrolling to bottom
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          callback(true, 'Copied (fallback method)!');
        } else {
          throw new Error('Fallback copy command failed.');
        }
      } catch (fallBackErr) {
        console.error('Fallback copy method failed: ', fallBackErr);
        callback(false, 'Copy to clipboard failed.');
      }
      document.body.removeChild(textArea);
    });
  };