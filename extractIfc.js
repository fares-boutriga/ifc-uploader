const fs = require('fs');
const path = require('path');
const { IfcAPI }  = require('web-ifc');

async function extractIfcItems(filePath) {
  const ifcAPI = new IfcAPI();
  await ifcAPI.Init();

  const buffer = fs.readFileSync(filePath);
  const modelID = ifcAPI.OpenModel(buffer);

  // Example: extract all walls
  const walls = ifcAPI.GetAllItemsOfType(modelID, ifcAPI?.types?.IFCWALL, true);

  const result = walls.map(item => ({
    expressID: item.expressID,
    type: item.type
  }));

  ifcAPI.CloseModel(modelID);

  return result;
}

module.exports = { extractIfcItems };
