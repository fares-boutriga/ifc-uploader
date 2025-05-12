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
  displayDataAsTable(result.items);
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
