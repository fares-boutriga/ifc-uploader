document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  const fileInput = document.getElementById('ifcFile');
  formData.append('ifcFile', fileInput.files[0]);

  const res = await fetch('/upload', {
    method: 'POST',
    body: formData
  });

  const result = await res.json();
  console.log('result', result);
  console.log('characters number in the response', JSON.stringify(result.items).length);
  const filename = document.getElementById('file-name');
  filename.textContent ='No file name provided';
  displayDataAsTable(result.items);
  if (result.items.length > 0) {
    openChatAssistant()
    sendMessage(JSON.stringify(result.items), result.filename);
  }

  if (result.costReport) {
    displayCostReport(result.costReport);
  }
});

function displayDataAsTable(items) {
  const outputDiv = document.getElementById('output');
  outputDiv.innerHTML = ''; // Clear previous content

  if (!items || items.length === 0) {
    outputDiv.textContent = 'No data to display.';
    return;
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  // Create table header
  const headerRow = table.insertRow();
  for (const key in items[0]) {
    const headerCell = document.createElement('th');
    headerCell.textContent = key;
    headerCell.style.border = '1px solid #ddd';
    headerCell.style.padding = '8px';
    headerRow.appendChild(headerCell);
  }

  // Create table rows
  items.forEach(item => {
    const row = table.insertRow();
    for (const key in item) {
      const cell = row.insertCell();
      cell.textContent = typeof item[key] === 'object' ? JSON.stringify(item[key]) : item[key];
      cell.style.border = '1px solid #ddd';
      cell.style.padding = '8px';
    }
  });

  outputDiv.appendChild(table);
}

function displayCostReport(costReportData) {
  const outputDiv = document.getElementById('output'); // Appending to the same output div

  const costDiv = document.createElement('div');
  costDiv.id = 'costReportDisplay';
  costDiv.style.marginTop = '20px';
  costDiv.style.padding = '10px';
  costDiv.style.border = '1px solid #ccc';
  costDiv.style.backgroundColor = '#f9f9f9';


  const title = document.createElement('h3');
  title.textContent = 'Estimated Cost Report';
  title.style.marginBottom = '10px';
  costDiv.appendChild(title);

  if (!costReportData || !costReportData.breakdown || Object.keys(costReportData.breakdown).length === 0) {
    const noDataP = document.createElement('p');
    noDataP.textContent = 'No cost data to display (or all counts were zero).';
    costDiv.appendChild(noDataP);
    outputDiv.appendChild(costDiv);
    return;
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.marginTop = '10px';

  // Table Header
  const headerRow = table.insertRow();
  const headers = ['Element Type', 'Count', 'Costing Method', 'Unit Cost ($)', 'Avg. Width', 'Avg. Height', 'Avg. Area', 'Subtotal ($)', 'Notes'];
  headers.forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    th.style.border = '1px solid #ddd';
    th.style.padding = '8px';
    th.style.textAlign = 'left';
    th.style.backgroundColor = '#f2f2f2';
    headerRow.appendChild(th);
  });

  // Table Body - Breakdown
  for (const elementType in costReportData.breakdown) {
    const item = costReportData.breakdown[elementType];
    const row = table.insertRow();

    const addCell = (text, isNumeric = false) => {
      const cell = row.insertCell();
      cell.textContent = text;
      cell.style.border = '1px solid #ddd';
      cell.style.padding = '8px';
      if (isNumeric) cell.style.textAlign = 'right';
    };

    addCell(elementType); // Element Type
    addCell(item.count, true); // Count
    addCell(item.costingMethod); // Costing Method
    const unitCostText = typeof item.unitCost === 'number' ? item.unitCost.toFixed(2) : 'N/A';
    addCell(unitCostText + (item.costingMethod === 'area' ? '/sq.unit' : '/item'), true); // Unit Cost

    addCell(typeof item.avgWidth === 'number' ? item.avgWidth.toFixed(2) : 'N/A', true); // Avg. Width
    addCell(typeof item.avgHeight === 'number' ? item.avgHeight.toFixed(2) : 'N/A', true); // Avg. Height
    addCell(typeof item.avgArea === 'number' ? item.avgArea.toFixed(2) : 'N/A', true); // Avg. Area

    addCell(item.subtotal.toFixed(2), true); // Subtotal

    let notes = '';
    if (item.costingMethod === 'area' && item.itemsWithMissingDims) {
      notes += `${item.itemsWithMissingDims} item(s) with missing dimensions (costed as 0). `;
    }
    if (typeof item.unitCost === 'number' && item.unitCost === 0 && item.subtotal === 0 && item.count > 0 && !notes.includes("missing dimensions")) {
        notes += `Unit cost not configured or zero.`;
    }
    addCell(notes || '-'); // Notes
  }
  costDiv.appendChild(table);

  // Total Cost
  const totalP = document.createElement('p');
  totalP.style.marginTop = '15px';
  totalP.style.fontWeight = 'bold';
  totalP.style.fontSize = '1.1em';
  totalP.textContent = `Total Estimated Cost: $${costReportData.total.toFixed(2)}`;
  costDiv.appendChild(totalP);

  outputDiv.appendChild(costDiv);
}


// Function to handle chat messages
// public/script.js
const chatbox = document.getElementById('chatbox');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');

const openChatAssistant = () => {
    const chatModalCollection = document.getElementsByClassName('chat-container');
    if (chatModalCollection.length > 0) {
        // Assuming you want to affect the first element with this class
        chatModalCollection[0].style.display = 'flex';
    } else {
        console.warn("Chat modal element with class 'chat-container' not found.");
    }
}
function appendMessage(sender, message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
    
    // Basic markdown-like formatting for newlines
    const formattedMessage = message.replace(/\n/g, '<br>');
    messageDiv.innerHTML = formattedMessage; // Use innerHTML to render <br> tags

    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight; // Auto-scroll to bottom
}

async function sendMessage(input, filename) {
  console.log('input', input);
  console.log('filename', filename);
    const messageText =userInput.value.trim()|| input; 
    console.log('messageText', messageText);
    if (messageText === '') return;

    appendMessage('user', messageText);
    userInput.value = ''; // Clear input field
    userInput.disabled = true;
    sendButton.disabled = true;
    appendMessage('ai', 'Thinking...'); // Temporary thinking message

    try {
      let threadId = sessionStorage.getItem('openai_thread_id');

      if (!threadId) {
        // Create a new thread on first use
        const response = await fetch('/create-thread', { method: 'POST' });
        const data = await response.json();
        threadId = data.threadId;
        sessionStorage.setItem('openai_thread_id', threadId);
      }

      alert('Sending message to the assistant...');
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: messageText, filename:filename, threadId: threadId }),
        });

        // Remove "Thinking..." message
        const thinkingMessage = chatbox.lastChild;
        if (thinkingMessage && thinkingMessage.textContent.includes('Thinking...')) {
            chatbox.removeChild(thinkingMessage);
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        appendMessage('ai', data.reply);

    } catch (error) {
        console.error('Error sending message:', error);
        appendMessage('ai', `Sorry, something went wrong: ${error.message}`);
        // Remove "Thinking..." message if it's still there on error
        const thinkingMessage = chatbox.lastChild;
        if (thinkingMessage && thinkingMessage.previousSibling && thinkingMessage.previousSibling.textContent.includes('Thinking...')) {
             chatbox.removeChild(thinkingMessage.previousSibling);
        } else if (thinkingMessage && thinkingMessage.textContent.includes('Thinking...')) {
            chatbox.removeChild(thinkingMessage);
        }
    } finally {
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
    }
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// Optional: Load initial chat history if you implement it fully
// async function loadHistory() {
//     try {
//         const response = await fetch('/history');
//         if (!response.ok) throw new Error('Failed to load history');
//         const history = await response.json();
//         history.forEach(msg => appendMessage(msg.sender, msg.text));
//     } catch (error) {
//         console.error("Could not load chat history:", error);
//         // appendMessage('ai', "Welcome! How can I help you today?");
//     }
// }
// window.onload = loadHistory; // Load history when page loads

// Display a welcome message
appendMessage('ai', "Hello! I'm your assistant. You uploaded an IFC file. And i will process it.");