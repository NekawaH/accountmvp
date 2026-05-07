// Clipboard
function copyToClipboard(text) {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                console.log('Text copied to clipboard');
                // alert('Text copied to clipboard: ' + "\n" + text);
                document.getElementById('inputBox').value = text;
                updateLineNumbers();
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
            });
    } else {
        // Fallback for older browsers
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        try {
            document.execCommand('copy');
            console.log('Text copied to clipboard');
            // alert('Text copied to clipboard: '+ "\n" + text);
            document.getElementById('inputBox').value = text;
            updateLineNumbers();
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(el);
    }
}

// Attach click event to each 'payload' link
const payloadLinks = document.querySelectorAll('.payload');
payloadLinks.forEach(link => {
    link.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent the link from navigating
        const textToCopy = this.getAttribute('data-copy'); // Get the text from the data-copy attribute
        copyToClipboard(textToCopy); // Copy the text to the clipboard
    });
});