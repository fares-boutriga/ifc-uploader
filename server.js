const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const WebIFC  = require('web-ifc');

const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Upload endpoint
let costConfig = {};
try {
  costConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'cost_config.json'), 'utf-8'));
  console.log("Cost configuration loaded successfully.");
} catch (error) {
  console.error("Error loading cost_config.json. Defaulting to empty config. Costs will be zero.", error);
}
app.post('/upload', upload.single('ifcFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
        // Initialize the IFC loader
        const ifcApi = new WebIFC.IfcAPI({ CORES: 2 });
        await ifcApi.Init();

    // Read the uploaded IFC file as ArrayBuffer
    const ifcData = new Uint8Array(fs.readFileSync(req.file.path));
    

    const modelID = ifcApi.OpenModel(ifcData);
    const elementTypes = [
      "IfcWall", "IfcDoor", "IfcWindow", "IfcSlab", "IfcColumn", 
      "IfcBeam", "IfcRoof", "IfcStair", "IfcRailing", "IfcFurnishingElement"
    ];

    const extractedItems = [];
    let totalEstimatedCost = 0;
    const costBreakdown = {};

    for (const type of elementTypes) {
      const ifcConstantTypeKey = type.toUpperCase(); // e.g., "IFCWALL"
      try {
        const selectedType = WebIFC[ifcConstantTypeKey];
        if (!selectedType) {
          console.warn(`IFC type constant not found for: ${ifcConstantTypeKey}`);
          continue;
        }
        const elementIDs = ifcApi.GetLineIDsWithType(modelID, selectedType);
        const count = elementIDs.size();
        console.log(`${type}: ${count}`);

        if (count === 0) continue;

        const unitCostFromConfig = costConfig[ifcConstantTypeKey] || 0;
        let typeSubtotal = 0;
        let itemsWithMissingDims = 0;
        let costingMethod = "item"; // Default

        let currentTypeSumHeight = 0; let countForHeightSum = 0;
        let currentTypeSumWidth = 0;  let countForWidthSum = 0;
        let currentTypeSumCalculatedArea = 0; // Sum of individual areas used for costing
        let itemsSuccessfullyCostedByArea = 0; // Count of items for which area was successfully calculated for costing

        const areaBasedTypes = ['IFCWALL', 'IFCWINDOW', 'IFCDOOR', 'IFCSLAB', 'IFCROOF'];
        if (areaBasedTypes.includes(ifcConstantTypeKey)) {
          costingMethod = "area";
        }

        for (let i = 0; i < elementIDs.size(); i++) {
          const elementID = elementIDs.get(i);
          const properties = ifcApi.GetLine(modelID, elementID);
          console.log("Properties:", properties);
          extractedItems.push({
            type: properties.type || '',
            globalId: properties.GlobalId?.value || 'N/A',
            name: properties.Name?.value || `Unnamed ${type}`,
            properties: {
              // Add more properties as needed, handle potential errors gracefully
                height: properties.NominalHeight || 'N/A',
                // Note: NominalLength and NominalWidth might not be direct properties for all elements
                // You might need to access them through Psets or other related entities.
                // For simplicity, we'll keep them as is, but be aware they might often be 'N/A'.
                length: properties.NominalLength?.value || 'N/A',
                width: properties.NominalWidth?.value || 'N/A',
                color: properties.Color || 'N/A',},
          });
        }

        // Recalculate cost based on individual items
        typeSubtotal = 0; // Reset for summing individual costs
        for (let i = 0; i < elementIDs.size(); i++) {
          const elementID = elementIDs.get(i);
          const props = ifcApi.GetLine(modelID, elementID); // Use 'props' for brevity
          let individualItemCost = 0;

          if (costingMethod === "area") {
            let H_dim = null, W_dim = null, A_val = null; // Height, Width, Area for the current item
            const getDimValue = (prop) => (prop?.value !== undefined ? prop.value : prop);

            if (ifcConstantTypeKey === 'IFCWALL') {
              H_dim = getDimValue(props.NominalHeight);
              W_dim = getDimValue(props.NominalLength); // Treat NominalLength as "Width" for report
              if (typeof H_dim === 'number' && typeof W_dim === 'number' && H_dim > 0 && W_dim > 0) A_val = H_dim * W_dim;
            } else if (ifcConstantTypeKey === 'IFCWINDOW' || ifcConstantTypeKey === 'IFCDOOR') {
              const h = props.OverallHeight !== undefined ? props.OverallHeight : props.NominalHeight;
              const w = props.OverallWidth !== undefined ? props.OverallWidth : props.NominalWidth;
              H_dim = getDimValue(h);
              W_dim = getDimValue(w);
              if (typeof H_dim === 'number' && typeof W_dim === 'number' && H_dim > 0 && W_dim > 0) A_val = H_dim * W_dim;
            } else if (ifcConstantTypeKey === 'IFCSLAB' || ifcConstantTypeKey === 'IFCROOF') {
              // Attempt to use direct Area if available (optimistic)
              let area = getDimValue(props.Area);
              if (typeof area === 'number' && area > 0) {
                A_val = area;
                // H_dim and W_dim might remain null if only area is given
              } else { // Fallback to NominalLength/Width if direct Area isn't found
                const l = props.NominalLength;
                const w = props.NominalWidth;
                // Assigning to W_dim and H_dim for consistency in reporting, though mapping might be arbitrary
                W_dim = getDimValue(l); // e.g., Length as "Width"
                H_dim = getDimValue(w); // e.g., Width as "Height" (or thickness)
                if (typeof H_dim === 'number' && typeof W_dim === 'number' && H_dim > 0 && W_dim > 0) A_val = H_dim * W_dim;
              }
            }

            if (A_val !== null && typeof A_val === 'number' && A_val > 0) {
              individualItemCost = A_val * unitCostFromConfig;
              currentTypeSumCalculatedArea += A_val;
              itemsSuccessfullyCostedByArea++;

              if (typeof H_dim === 'number' && H_dim > 0) {
                currentTypeSumHeight += H_dim;
                countForHeightSum++;
              }
              if (typeof W_dim === 'number' && W_dim > 0) {
                currentTypeSumWidth += W_dim;
                countForWidthSum++;
              }
            } else {
              itemsWithMissingDims++;
              individualItemCost = 0; // Cost is 0 if dimensions are required but missing
            }
          } else { // Item-based costing
            individualItemCost = unitCostFromConfig;
          }
          typeSubtotal += individualItemCost;
        }

        let reportAvgHeight = countForHeightSum > 0 ? (currentTypeSumHeight / countForHeightSum) : undefined;
        let reportAvgWidth = countForWidthSum > 0 ? (currentTypeSumWidth / countForWidthSum) : undefined;
        let reportAvgArea = (costingMethod === "area" && itemsSuccessfullyCostedByArea > 0) ?
                            (currentTypeSumCalculatedArea / itemsSuccessfullyCostedByArea) : undefined;

        totalEstimatedCost += typeSubtotal;
        if (count > 0) {
          costBreakdown[type] = { // Using original type string like "IfcWall" for readability in report
            count: count,
            unitCost: unitCostFromConfig,
            costingMethod: costingMethod,
            subtotal: typeSubtotal,
            itemsWithMissingDims: (costingMethod === "area" && itemsWithMissingDims > 0) ? itemsWithMissingDims : undefined,
            avgHeight: reportAvgHeight,
            avgWidth: reportAvgWidth,
            avgArea: reportAvgArea
          };
        }
      } catch (error) {
        console.warn(`Could not retrieve or process elements of type ${type}:`, error);
      }
    }
    // Clean up
    ifcApi.CloseModel(modelID);
    // Delete the uploaded file after processing
    fs.unlinkSync(req.file.path);
    
    res.json({
      message: 'File uploaded and parsed successfully',
      filename: req.file.originalname,
      items: extractedItems,
      costReport: {
        breakdown: costBreakdown,
        total: totalEstimatedCost,
      }
    });
  } catch (error) {
    if (req.file?.path) fs.unlinkSync(req.file.path); // Ensure file deletion on error
    console.error('Error processing IFC file:', error);
    res.status(500).json({ error: 'Error processing IFC file' });
  }
});
// Serve static files
app.use(express.static('public'));

// Route for the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});