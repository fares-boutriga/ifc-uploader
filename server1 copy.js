const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const WebIFC  = require('web-ifc');
const { v4: uuidv4 } = require('uuid');
const { getMaterialForElement, getQuantity, getLengthForElement, getColorForElement, getWeightForElement, getElementLength } = require('./utils/extractElements');
const { chatWithAssistant, uploadFileToOpenAI } = require('./chatGbt');
const openai = require('./openIaConfig');

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

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
    cb(null,'' +  file.fieldname+ path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Upload endpoint
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
      "IfcBeam", "IfcRoof", "IfcStair", "IfcRailing"
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

        let costingMethod = "item"; // Default

        const areaBasedTypes = ['IFCWALL', 'IFCWINDOW', 'IFCDOOR', 'IFCSLAB', 'IFCROOF'];
        if (areaBasedTypes.includes(ifcConstantTypeKey)) {
          costingMethod = "area";
        }

        for (let i = 0; i < elementIDs.size(); i++) {
          const elementID = elementIDs.get(i);
          const properties = ifcApi.GetLine(modelID, elementID);
          // console.log("Properties:", properties);
          const width = properties.NominalWidth?.value || properties.OverallWidth?.value || 'N/A';
          const height = properties.NominalHeight?.value || properties.OverallHeight?.value || 'N/A';
          const length = await getElementLength(ifcApi, modelID, elementID, ifcConstantTypeKey);
          const materialName = getMaterialForElement(ifcApi, modelID, elementID);
          extractedItems.push({
            // type: properties.type || '',
            // globalId: properties.GlobalId?.value || 'N/A',
            elementID: elementID,
            // expressID: properties.expressID,
            name: properties.Name?.value || `Unnamed ${type}`,
            type: type,
            material: materialName,
            // properties: {
            //      material: materialName, // Materials might be complex, consider how to represent
            //         height: properties.NominalHeight?.value || properties.OverallHeight?.value || 'N/A',
            //         width: properties.NominalWidth?.value || properties.OverallWidth?.value || 'N/A',
            //         length,
            //         vplume: length * width * height,
            //         area: length * height,

            //   },
          });
        }


      } catch (error) {
        console.warn(`Could not retrieve or process elements of type ${type}:`, error);
      }
    }
    // Clean up
    ifcApi.CloseModel(modelID);
    // Delete the uploaded file after processing
    // fs.unlinkSync(req.file.path);

    // Create a JSON file with extractedItems
    let extractedJsonFileName = null;
    let extractedJsonFilePath = null;
    let openaiFileId = null;
    if (extractedItems.length > 0) {
      extractedJsonFileName = `ifc_data_${uuidv4()}.json`;
      extractedJsonFilePath = path.join(__dirname, 'temp', extractedJsonFileName);
      fs.writeFileSync(extractedJsonFilePath, JSON.stringify(extractedItems, null, 2))
      console.log(`Extracted items saved to ${extractedJsonFilePath}`);
    }
    // Upload to OpenAI
      openaiFileId = await uploadFileToOpenAI(extractedJsonFilePath);

    res.json({
      message: 'File uploaded and parsed successfully',
      filename: req.file.originalname,
      processedIfcFilename: req.file.filename, // Saved IFC filename (e.g., ifcFile.ifc)
      items: extractedItems,
      openaiFileId: openaiFileId // Name of the file containing extractedItems
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
app.post('/create-thread', async (req, res) => {
  try {
    const { openaiFileId } = req.body; // Expect file ID from frontend
    const thread = await openai.beta.threads.create({
      attachments: openaiFileId ? [
        {
          file_id: openaiFileId,
          tools: [{ type: "file_search" }]
        }
      ] : []
    });
    res.json({ threadId: thread.id });
  } catch (error) {
    console.log('Error creating thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});
const threadContextMap = {}; // In memory for now

app.post('/chat', async (req, res) => {
  const { message, filename, threadId, extractedJsonFileName, openaiFileId } = req.body; // Added extractedJsonFileName
    
  // if (!message) {
  //   return res.status(400).json({ error: 'No message provided in the request body.' });
  // }
  if (filename) {
    // filename here refers to the original IFC filename, used for context.
    threadContextMap[threadId] = filename;
  }
  try {
    const currentIFCContextFile = threadContextMap[threadId]; // This is the original IFC filename for context
    let fileToAttach = null;

    if (extractedJsonFileName) {
      const extractedJsonFilePath = path.join(__dirname, 'temp', extractedJsonFileName);
      if (fs.existsSync(extractedJsonFilePath)) {
        fileToAttach = { path: extractedJsonFilePath, name: extractedJsonFileName };
      } else {
        console.warn(`Extracted JSON file not found: ${extractedJsonFilePath}`);
      }
    }

    const assistantResponse = await chatWithAssistant(message, currentIFCContextFile, threadId, openaiFileId);
    console.log("Assistant response:", assistantResponse);
    if (!assistantResponse) {
      return res.status(500).json({ error: 'No response from the assistant.' });
    }
    res.json({ reply: assistantResponse });
  } catch (error) {
    // This would catch errors if chatWithAssistant itself threw an unhandled one,
    // or if there was an issue before calling it.
    console.error("Error in /api/chat endpoint:", error);
    res.status(500).json({ error: 'Failed to get a response from the assistant.' });
  }
});

const PORT = 3007;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});